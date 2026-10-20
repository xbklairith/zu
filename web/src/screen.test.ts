import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import css from "./styles.css?raw";
import change from "../../internal/export/testdata/shop.change.golden.json";
import type { View, ViewEdge } from "./data";
import { ROW_MAX } from "./layout";
import { centreOf, FONT, GAP_ROW, MEMBER_CAP, placeScreen, placesOf, ROW_CAP, screenNote, screenOf, screenView, type Drawn, type Row } from "./screen";
import { LABEL_PX } from "./viewport";
import { decl, edge, exts, pkgs, view } from "./testkit";

const shop = golden as unknown as View;
const S = "example.com/shop/internal/store";
const C = "example.com/shop/internal/checkout";
const M = "example.com/shop/internal/money";
const weighed = (from: string, to: string, count: number, kind: ViewEdge["kind"] = "imports"): ViewEdge =>
  ({ ...edge(from, to, kind), count });
const ids = (r: { boxes: { id: string }[] }) => r.boxes.map((b) => b.id);

describe("centreOf", () => {
  it("centres a package, a declaration or an external, and a method's type", () => {
    expect(centreOf(shop, S)).toBe(S);
    expect(centreOf(shop, `${S}.Open`)).toBe(`${S}.Open`);
    expect(centreOf(shop, `${S}.Repo`)).toBe(`${S}.Repo`);
    expect(centreOf(shop, `${S}.Repo.Get`)).toBe(`${S}.Repo`);
    expect(centreOf(shop, "github.com/lib/pq")).toBe("github.com/lib/pq");
  });
  it("centres the package of an X#pkg box, and nothing else that is not a node", () => {
    const v = view(pkgs(["m/a", "m/a/b"], "m"));
    expect(centreOf(v, "m/a#pkg")).toBe("m/a");
    for (const id of ["m", "outside", "externals", "m/a#demoted", "m#more", "m/nosuch", null]) {
      expect(centreOf(v, id), String(id)).toBeNull();
    }
  });
  it("centres a Change View's nodes, removed and near ones too (18), never a Move's source", () => {
    const v = change as unknown as View;
    expect(centreOf(v, S)).toBe(S);
    expect(centreOf(v, `${S}.ReadWriter`)).toBe(`${S}.ReadWriter`); // removed
    expect(centreOf(v, `${C}.Cart`)).toBe(`${C}.Cart`); // near: unchanged, one embed from Order
    expect(centreOf(v, `${S}.Repo.Reset`)).toBe(`${S}.Repo`); // a near method names its type
    expect(centreOf(v, `${M}.Add`)).toBeNull(); // moved to money.Plus: in no tree the page draws
  });
});

describe("screenOf", () => {
  it("at a package: its importers above, what it imports below", () => {
    const s = screenOf(shop, S);
    expect(s.grain).toBe("package");
    expect(ids(s.above)).toEqual(["example.com/shop/internal/checkout"]);
    expect(ids(s.below)).toEqual(["example.com/shop/internal/money", "github.com/lib/pq"]);
    expect(s.below.boxes.map((b) => [b.label, b.size])).toEqual([["internal/money", "medium"], ["github.com/lib/pq", "small"]]);
    expect(screenOf(shop, "github.com/lib/pq")).toMatchObject({ grain: "package", below: { boxes: [], more: 0 } });
  });
  it("draws a package that imports the centre and is imported by it in both rows", () => {
    const s = screenOf(view(pkgs(["m/a", "m/b", "m/c"], "m"), [edge("m/a", "m/b"), edge("m/b", "m/a"), edge("m/c", "m/a")]), "m/a");
    expect(s.above.boxes.map((b) => [b.id, b.both])).toEqual([["m/b", true], ["m/c", false]]);
    expect(s.below.boxes.map((b) => [b.id, b.both])).toEqual([["m/b", true]]);
  });
  it("sizes a box by its Weight against the heaviest in its row", () => {
    const v = view([...pkgs(["m/core", "m/a", "m/b", "m/c", "m/d"], "m"), ...exts(["x.io/lib"])], [
      weighed("m/a", "m/core", 10), weighed("m/b", "m/core", 4), weighed("m/c", "m/core", 2), weighed("m/d", "m/core", 1),
      weighed("m/core", "m/a", 2), weighed("m/core", "x.io/lib", 1),
    ]);
    const s = screenOf(v, "m/core");
    // largest from half the heaviest, medium from a fifth, small below
    expect(s.above.boxes.map((b) => [b.id, b.weight, b.size])).toEqual([
      ["m/a", 10, "large"], ["m/b", 4, "medium"], ["m/c", 2, "medium"], ["m/d", 1, "small"],
    ]);
    // a row weighing at most 2 is flat; an external is always small
    expect(s.below.boxes.map((b) => [b.id, b.size])).toEqual([["m/a", "medium"], ["x.io/lib", "small"]]);
  });
  it("at a declaration: calls and embeds, a method drawn as its type", () => {
    const s = screenOf(shop, `${S}.Repo`);
    expect(s.grain).toBe("declaration");
    expect(ids(s.above)).toEqual([]); // Repo.Get calls Repo.check: inside the centre
    expect(ids(s.below)).toEqual([`${S}.Open`, "github.com/lib/pq"]); // Repo.Reset calls Open; Repo embeds pq
    expect(s.below.boxes[0]).toMatchObject({ label: "Open", sub: "internal/store" });
    expect(ids(screenOf(shop, `${S}.Open`).above)).toEqual([`${S}.Repo`]);
  });
  it("says what a declaration's Screen leaves out", () => {
    // Repo.check calls money.Add, which has no declarations on this page;
    // the store package has 4 Unresolved Calls (ADR 0002).
    expect(screenOf(shop, `${S}.Repo`)).toMatchObject({ offIn: 0, offOut: 1, unresolved: 4 });
    expect(screenOf(shop, `${S}.Open`)).toMatchObject({ offIn: 1, offOut: 0 }); // checkout.Place calls it
    expect(screenOf(shop, S)).toMatchObject({ offIn: 0, offOut: 0, unresolved: 0 }); // imports are all on the page
  });
  it("weighs a declaration by √(sites × declarations), so breadth counts", () => {
    const v = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.F", "m/a", "function"), decl("m/a.T", "m/a"),
      decl("m/a.T.x", "m/a.T", "function"), decl("m/a.T.y", "m/a.T", "function"), decl("m/a.G", "m/a", "function")], [
      weighed("m/a.T.x", "m/a.F", 3, "calls"), weighed("m/a.T.y", "m/a.F", 3, "calls"), weighed("m/a.G", "m/a.F", 6, "calls"),
    ]);
    expect(screenOf(v, "m/a.F").above.boxes.map((b) => [b.id, b.refs, b.members])).toEqual([["m/a.T", 6, 2], ["m/a.G", 6, 1]]);
  });
  it("never draws a type the centre embeds small", () => {
    const v = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.T", "m/a"), decl("m/a.T.x", "m/a.T", "function"),
      decl("m/a.F", "m/a", "function"), decl("m/a.E", "m/a")], [weighed("m/a.T.x", "m/a.F", 30, "calls"), weighed("m/a.T", "m/a.E", 1, "embeds")]);
    expect(screenOf(v, "m/a.T").below.boxes.map((b) => [b.id, b.size])).toEqual([["m/a.F", "large"], ["m/a.E", "medium"]]);
  });
  it(`draws ${ROW_CAP} boxes a row and counts the rest, or every box`, () => {
    const many = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
    const v = view(pkgs(["m/core", ...many], "m"), many.map((p) => edge(p, "m/core")));
    expect(screenOf(v, "m/core").above).toMatchObject({ more: 30 - ROW_CAP });
    expect(ids(screenOf(v, "m/core").above)).toEqual(many.slice(0, ROW_CAP));
    expect(screenOf(v, "m/core", true).above.boxes).toHaveLength(30);
    expect(screenOf(v, "m/core", true).above.more).toBe(0);
  });
});

// overlap says two placed boxes share any area.
const overlap = (a: Drawn, b: Drawn) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("placeScreen", () => {
  const many = Array.from({ length: 60 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
  const wide = view(pkgs(["m/core", ...many], "m"), [...many.map((p, i) => weighed(p, "m/core", 60 - i)), edge("m/core", "m/p00")]);

  it("draws the Centre in the middle, its importers above and what it imports below", () => {
    const p = placeScreen(screenOf(shop, S));
    const c = p.nodes.find((n) => n.row === "centre")!;
    expect(c).toMatchObject({ id: S, ref: S, label: S, sub: "", facts: "imports", x: -c.w / 2, y: 0 });
    const d = placeScreen(screenOf(shop, `${S}.Repo`)).nodes[0];
    expect(d).toMatchObject({ label: `${S}.Repo`, sub: "", facts: "calls and embeds" }); // its full id names its package
    const up = p.nodes.filter((n) => n.row === "above");
    const down = p.nodes.filter((n) => n.row === "below");
    expect(up.map((n) => n.id)).toEqual(["up:example.com/shop/internal/checkout"]);
    expect(down.map((n) => n.ref)).toEqual(["example.com/shop/internal/money", "github.com/lib/pq"]);
    for (const n of up) expect(n.y + n.h).toBe(-GAP_ROW);
    for (const n of down) expect(n.y).toBe(c.h + GAP_ROW);
    expect(down[0].x + down[0].w).toBeLessThan(down[1].x); // the first in row order, then the next right of it
    expect(p.edges).toEqual([
      { id: "up:example.com/shop/internal/checkout>", from: "up:example.com/shop/internal/checkout", to: S },
      { id: ">down:example.com/shop/internal/money", from: S, to: "down:example.com/shop/internal/money" },
      { id: ">down:github.com/lib/pq", from: S, to: "down:github.com/lib/pq" },
    ]);
  });
  it("wraps a row at ROW_MAX, its heaviest line nearest the Centre, each line outward from its middle", () => {
    const p = placeScreen(screenOf(wide, "m/core", true));
    const up = p.nodes.filter((n) => n.row === "above");
    expect(up).toHaveLength(60);
    const lines = [...new Set(up.map((n) => n.y + n.h))].sort((a, b) => b - a);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toBe(-GAP_ROW);
    for (const y of lines) {
      const line = up.filter((n) => n.y + n.h === y);
      const [l, r] = [Math.min(...line.map((n) => n.x)), Math.max(...line.map((n) => n.x + n.w))];
      expect(r - l).toBeLessThanOrEqual(ROW_MAX);
      expect(l + r).toBeCloseTo(0); // centred on the Centre
    }
    expect(up.find((n) => n.ref === "m/p00")!.y + up.find((n) => n.ref === "m/p00")!.h).toBe(-GAP_ROW);
    // The heaviest box in the middle of its line, the next right of it, the
    // next left: the floor zoom, centred on the Centre, shows the heaviest.
    const first = up.filter((n) => n.y + n.h === -GAP_ROW).sort((a, b) => a.x - b.x).map((n) => n.ref);
    const k = first.indexOf("m/p00");
    expect([first[k - 1], first[k], first[k + 1]]).toEqual(["m/p02", "m/p00", "m/p01"]);
    for (const a of p.nodes) for (const b of p.nodes) if (a !== b) expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false);
  });
  it("draws a larger box for a heavier Weight, and a box in both rows twice", () => {
    const p = placeScreen(screenOf(wide, "m/core", true));
    const [big, small] = [p.nodes.find((n) => n.ref === "m/p00" && n.row === "above")!, p.nodes.find((n) => n.ref === "m/p59")!];
    expect([big.size, small.size]).toEqual(["large", "small"]);
    expect(big.h).toBeGreaterThan(small.h);
    expect(p.nodes.filter((n) => n.ref === "m/p00").map((n) => [n.id, n.both])).toEqual([["up:m/p00", true], ["down:m/p00", true]]);
  });
  it("ends a capped row with its +N more chip", () => {
    const p = placeScreen(screenOf(wide, "m/core"));
    const up = p.nodes.filter((n) => n.row === "above");
    expect(up).toHaveLength(ROW_CAP + 1);
    expect(up[ROW_CAP]).toMatchObject({ id: "up:#more", ref: null, label: `+${60 - ROW_CAP} more` });
    expect(p.edges.some((e) => e.from === "up:#more")).toBe(false);
  });
});

describe("the Screen's styles (17)", () => {
  it("draws each size's label at the px placeScreen sized it for", () => {
    const px = (size: string) => new RegExp(`\\.node\\.screen-box\\.${size} \\.label[^{]*\\{[^}]*font-size: (\\d+)px`).exec(css)?.[1];
    expect([px("medium"), px("large"), px("centre")].map(Number)).toEqual([FONT.medium, FONT.large, FONT.centre]);
    expect(FONT.small).toBe(LABEL_PX); // .node's own size, so the floor zoom keeps every label readable
  });
  it("draws a ghost and its line dotted, apart from a Move's dashes (18)", () => {
    expect(css).toMatch(/\.node\.screen-box\.ghost \{[^}]*border-style: dotted/);
    expect(css).toMatch(/\.react-flow__edge\.ghost path \{[^}]*stroke-dasharray: 2 4/);
    expect(css).toMatch(/\.legend \.swatch\.ghost \{[^}]*border-style: dotted/);
  });
  it("draws an affected box plain, as every Screen box is, though the changed subgraph dims the tree's (18)", () => {
    expect(css).toMatch(/\.subgraph \.node\.affected:not\(\.screen-box\) \{[^}]*opacity: 0\.6/);
    expect(css).not.toMatch(/\.subgraph \.node\.affected \{/);
  });
});

describe("screenNote (17)", () => {
  it("says what the rows and sizes are, and what the Screen leaves out", () => {
    expect(screenNote(screenOf(shop, S))).toBe("Above: what imports it. Below: what it imports. Size: files that import.");
    expect(screenNote(screenOf(shop, `${S}.Repo`))).toBe(
      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
      "Not drawn: 1 call or embed out of it, with declarations in packages not included (re-run with -include); " +
      "4 unresolved calls in its package.");
    expect(screenNote({ ...screenOf(shop, `${S}.Repo`), offIn: 2, unresolved: 0 })).toBe(
      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
      "Not drawn: 2 calls and embeds into it and 1 call or embed out of it, with declarations in packages not included (re-run with -include).");
    expect(screenNote(screenOf(shop, `${S}.Status`))).toBe(
      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
      "Not drawn: 4 unresolved calls in its package.");
  });
  it("marks a box drawn in both rows ↻", () => {
    const p = placeScreen(screenOf(view(pkgs(["m/a", "m/b", "m/c"], "m"), [edge("m/a", "m/b"), edge("m/b", "m/a"), edge("m/c", "m/a")]), "m/a"));
    expect(p.nodes.filter((n) => n.row !== "centre").map((n) => [n.id, n.facts]))
      .toEqual([["up:m/b", "↻ 1 file"], ["up:m/c", "1 file"], ["down:m/b", "↻ 1 file"]]);
  });
});

describe("the Screen in a Change View (18)", () => {
  const v = change as unknown as View;
  const rows = (r: Row) => r.boxes.map((b) => [b.id, b.mark, b.status ?? "", b.ghost]);
  const T = "example.com/shop/tools/gen";

  it("reads the View with its near neighbours, merged once", () => {
    const sv = screenView(v);
    expect(sv).toBe(screenView(v));
    expect(sv.nodes).toHaveLength(v.nodes.length + v.near!.nodes.length);
    expect(sv.edges).toHaveLength(v.edges.length + v.near!.edges.length);
    expect(screenView(shop)).toBe(shop);
  });
  it("marks each box by its Change Status and each line by its edges'", () => {
    // money's importers: shop's import is added, checkout's unchanged; tools/gen is Affected (hop 1)
    const s = screenOf(v, M);
    expect(rows(s.above)).toEqual([
      ["example.com/shop", "st-modified", "added", false],
      [C, "st-modified", "", false],
      [T, "affected", "", false],
      [S, "", "reversed", true], // the ghost: store imported money in base
    ]);
    expect(rows(s.below)).toEqual([[S, "st-modified", "reversed", false]]);
  });
  it("draws a reversed import's far end in its new row and its ghost, small, in the old one", () => {
    const s = screenOf(v, S);
    expect(rows(s.above)).toEqual([[C, "st-modified", "", false], [M, "st-modified", "reversed", false]]);
    expect(rows(s.below)).toEqual([["github.com/lib/pq", "", "", false], [M, "", "reversed", true]]);
    expect(s.below.boxes[1]).toMatchObject({ size: "small", both: false });
  });
  it("draws a ghost past a capped row's boxes", () => {
    const many = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
    const m = { ...view(pkgs(["m/core", "m/x", ...many], "m"), [...many.map((p) => edge(p, "m/core")), { ...edge("m/core", "m/x"), status: "reversed" }]), kind: "change" as const };
    const up = screenOf(m, "m/core").above;
    expect(up.more).toBe(30 - ROW_CAP);
    expect(up.boxes).toHaveLength(ROW_CAP + 1);
    expect(up.boxes[ROW_CAP]).toMatchObject({ id: "m/x", ghost: true });
  });
  it("draws a removed declaration's Screen from base's edges, and near neighbours unmarked", () => {
    expect(rows(screenOf(v, `${S}.ReadWriter`).below)).toEqual([[`${S}.Reader`, "", "removed", false]]);
    expect(rows(screenOf(v, `${S}.Order`).above)).toEqual([[`${C}.Cart`, "", "", false]]);
    // Repo.Reset, a near method, calls store.Open, which is two calls from the change
    expect(screenOf(v, `${S}.Repo`)).toMatchObject({ offIn: 0, offOut: 1, unresolved: 5 });
  });
  it("draws a violating import's line red, as the tree does (06), never its ghost's", () => {
    // checkout imports store against the Policy, and money's import of store, reversed, does too
    const red = (e: ViewEdge): ViewEdge =>
      e.kind === "imports" && e.to === S && (e.from === C || e.from === M) ? { ...e, violation: "levels" } : e;
    const bad = { ...v, edges: v.edges.map(red) };
    const reds = (r: Row) => r.boxes.filter((b) => b.violation).map((b) => b.id);
    expect(reds(screenOf(bad, C).below)).toEqual([S]);
    expect(reds(screenOf(bad, S).above)).toEqual([C, M]);
    expect(reds(screenOf(bad, S).below)).toEqual([]); // money's ghost: base's import, the other way round
    expect(placeScreen(screenOf(bad, C)).edges.filter((e) => e.violation).map((e) => e.id)).toEqual([`>down:${S}`]);
    expect(reds(screenOf({ ...shop, edges: shop.edges.map(red) }, S).above)).toEqual([C]); // a Project View too
    expect(reds(screenOf(v, S).above)).toEqual([]);
  });
  it("marks a line ± when its edges' statuses differ", () => {
    const m = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.F", "m/a", "function"), decl("m/a.T", "m/a"),
      decl("m/a.T.x", "m/a.T", "function"), decl("m/a.T.y", "m/a.T", "function")], [
      { ...edge("m/a.T.x", "m/a.F", "calls"), status: "added" }, edge("m/a.T.y", "m/a.F", "calls"),
    ]);
    expect(screenOf({ ...m, kind: "change" }, "m/a.F").above.boxes.map((b) => b.status)).toEqual(["mixed"]);
  });
  it("gives the Centre its mark, its changed members and its place in the Affected Set (ADR 0009)", () => {
    expect(screenOf(v, S).change).toEqual({
      mark: "st-modified", hop: 0, reach: 4, more: 0,
      members: [
        { id: `${S}.Order`, label: "Order", sign: "~" }, { id: `${S}.ReadWriter`, label: "ReadWriter", sign: "−" },
        { id: `${S}.Repo.Get`, label: "Repo.Get", sign: "~" }, { id: `${S}.Repo.check`, label: "Repo.check", sign: "~" },
      ],
    });
    expect(screenOf(v, M).change).toMatchObject({ hop: 0, reach: 3, members: [{ label: "Plus", sign: "→" }] });
    // a type is named in its package's list, so its own list drops its name
    expect(screenOf(v, `${S}.Repo`).change).toMatchObject({
      mark: "has-change", hop: 0, reach: 4, members: [{ label: "Get", sign: "~" }, { label: "check", sign: "~" }],
    });
    expect(screenOf(v, T).change).toMatchObject({ mark: "affected", hop: 1, members: [] });
    expect(screenOf(v, "github.com/lib/pq").change).toEqual({ mark: "", members: [], more: 0, reach: 0 });
    expect(screenOf(shop, S).change).toBeUndefined();
  });
  it("lists MEMBER_CAP members and counts the rest", () => {
    const fs = Array.from({ length: MEMBER_CAP + 2 }, (_, i) => ({ ...decl(`m/a.F${i}`, "m/a", "function"), status: "added" }));
    const m = { ...view([...pkgs(["m/a"], "m", { detail: true, hop: 0 }), ...fs]), kind: "change" as const };
    expect(screenOf(m, "m/a").change).toMatchObject({ more: 2 });
    expect(screenOf(m, "m/a").change!.members).toHaveLength(MEMBER_CAP);
  });
  it("draws the Centre's members, each box's mark, each line's status, and a ghost", () => {
    const p = placeScreen(screenOf(v, S));
    const c = p.nodes[0];
    expect(c).toMatchObject({ row: "centre", mark: "st-modified", members: ["~ Order", "− ReadWriter", "~ Repo.Get", "~ Repo.check"] });
    expect(c.h).toBeGreaterThan(placeScreen(screenOf(shop, S)).nodes[0].h);
    expect(p.nodes.find((n) => n.id === `up:${M}`)).toMatchObject({ mark: "st-modified", ghost: false, members: [] });
    expect(p.nodes.find((n) => n.id === `down:${M}`)).toMatchObject({ mark: "", ghost: true, facts: "⇄ in base" });
    expect(p.edges).toEqual([
      { id: `up:${C}>`, from: `up:${C}`, to: S },
      { id: `up:${M}>`, from: `up:${M}`, to: S, status: "reversed" },
      { id: ">down:github.com/lib/pq", from: S, to: "down:github.com/lib/pq" },
      { id: `>down:${M}`, from: S, to: `down:${M}`, status: "reversed", ghost: true },
    ]);
    const fs = Array.from({ length: MEMBER_CAP + 2 }, (_, i) => ({ ...decl(`m/a.F${i}`, "m/a", "function"), status: "added" }));
    const m = { ...view([...pkgs(["m/a"], "m", { detail: true, hop: 0 }), ...fs]), kind: "change" as const };
    expect(placeScreen(screenOf(m, "m/a")).nodes[0].members.at(-1)).toBe("+2 more");
  });
  it("says where the Centre sits in the Affected Set, and what lies further from the change", () => {
    const pkg = "Above: what imports it. Below: what it imports. Size: files that import.";
    expect(screenNote(screenOf(v, S))).toBe(`${pkg} Affected Set: changed; 4 packages import it, directly or not.`);
    expect(screenNote(screenOf(v, T))).toBe(`${pkg} Affected Set: 1 import from a changed package.`);
    expect(screenNote(screenOf({ ...view(pkgs(["m/a"], "m")), kind: "change" }, "m/a"))).toBe(`${pkg} Affected Set: not in it.`);
    const gone = { ...view([...pkgs(["m/a"], "m", { status: "removed" }), decl("m/a.F", "m/a", "function")]), kind: "change" as const };
    expect(screenNote(screenOf(gone, "m/a"))).toBe(`${pkg} Affected Set: removed, so not in it (the Affected Set is head's).`);
    expect(screenNote(screenOf(v, "github.com/lib/pq"))).toBe(pkg);
    expect(screenNote(screenOf(v, `${S}.Repo`))).toBe(
      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
      "Not drawn: 1 call or embed out of it, with unchanged declarations more than one call or embed from the change; " +
      "5 unresolved calls in its package. Affected Set (its package): changed; 4 packages import it, directly or not.");
  });
});

describe("placesOf (19)", () => {
  // m.T, whose method M is in b.go, is called by m.F twice in a.go and
  // calls m.G from M; m.T embeds m.E.
  const loc = (path: string, line: number) => ({ path, line });
  const v = view(
    [...pkgs(["m"], "m"), decl("m.F", "m", "function"), decl("m.G", "m", "function"), decl("m.T", "m"),
      decl("m.T.M", "m.T", "function"), decl("m.E", "m")],
    [
      { ...edge("m.F", "m.T.M", "calls"), count: 2, loc: loc("a.go", 3), more: [loc("a.go", 7)] },
      { ...edge("m.T.M", "m.G", "calls"), loc: loc("b.go", 5) },
      { ...edge("m.T", "m.E", "embeds"), loc: loc("t.go", 2) },
    ],
  );
  it("is where the calls and embeds a Screen box's line stands for are written", () => {
    expect(placesOf(v, "m.T", "up:m.F")).toEqual([loc("a.go", 3), loc("a.go", 7)]);
    expect(placesOf(v, "m.T", "up:m.F>")).toEqual([loc("a.go", 3), loc("a.go", 7)]); // its line
    expect(placesOf(v, "m.T", "down:m.G")).toEqual([loc("b.go", 5)]);
    expect(placesOf(v, "m.T", ">down:m.E")).toEqual([loc("t.go", 2)]);
  });
  it('is null for the Centre, a "+N more" chip, and a Screen of imports', () => {
    expect(placesOf(v, "m.T", "m.T")).toBeNull();
    expect(placesOf(v, "m.T", "up:#more")).toBeNull();
    expect(placesOf(shop, S, `up:${C}`)).toBeNull();
  });
});
