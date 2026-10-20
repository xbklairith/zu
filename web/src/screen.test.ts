import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import css from "./styles.css?raw";
import change from "../../internal/export/testdata/shop.change.golden.json";
import type { View, ViewEdge } from "./data";
import { ROW_MAX } from "./layout";
import { centreOf, FONT, GAP_ROW, placeScreen, ROW_CAP, screenNote, screenOf, type Drawn } from "./screen";
import { LABEL_PX } from "./viewport";
import { decl, edge, exts, pkgs, view } from "./testkit";

const shop = golden as unknown as View;
const S = "example.com/shop/internal/store";
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
  it("centres nothing in a Change View (18 draws the Screen there)", () => {
    expect(centreOf(change as unknown as View, S)).toBeNull();
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
