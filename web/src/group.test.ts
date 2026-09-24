import { describe, expect, it } from "vitest";
import type { ViewEdge, ViewNode } from "./data";
import { capRows, demotedBox, isGroup, MORE, rankNote, STRIP, stripText } from "./group";
import { ROOT_CLOSED, rootModule, upTo } from "./cut";
import { knownIds, scene } from "./scene";
import { reveal } from "./search";
import { DEFAULT_STATE, type ViewState } from "./state";
import { edge, exts, pkgs, view } from "./testkit";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

// m holds two drawn boxes, a testdata box and a generated one.
const noisy = view([
  ...pkgs(["m/a", "m/b"], "m"),
  ...pkgs(["m/testdata/x", "m/testdata/y"], "m", { demoted: "name" }),
  ...pkgs(["m/gen"], "m", { demoted: "generated" }),
], [edge("m/a", "m/b"), edge("m/a", "m/testdata/x"), edge("m/b", "m/gen")]);
const at = (s: Partial<ViewState>, v = noisy) => scene(v, { ...DEFAULT_STATE, ...s }, { home: true });

describe("demotedBox (12)", () => {
  it("demotes a box when every package in it is demoted, by name before generated", () => {
    const v = view([
      ...pkgs(["m/t/a"], "m", { demoted: "name" }),
      ...pkgs(["m/t/b"], "m", { demoted: "generated" }),
      ...pkgs(["m/g"], "m", { demoted: "generated" }),
      ...pkgs(["m/mix/a"], "m", { demoted: "name" }),
      ...pkgs(["m/mix/b"], "m"),
    ]);
    expect(demotedBox(v, "m/t")).toBe("name");
    expect(demotedBox(v, "m/g")).toBe("generated");
    expect(demotedBox(v, "m/mix")).toBeUndefined();
    expect(demotedBox(v, "m")).toBeUndefined();
  });
  it("never demotes a changed package", () => {
    const v = view(pkgs(["m/gen"], "m", { demoted: "generated", status: "modified" }));
    expect(demotedBox(v, "m/gen")).toBeUndefined();
  });
});

describe("the demotion strip (12)", () => {
  it("draws demoted siblings as one strip at the bottom, used by what imports them", () => {
    const sc = at({});
    expect(sc.focus).toBe("m");
    expect(ids(sc.nodes)).toEqual([`m${STRIP}`, "m/a", "m/b"]);
    const strip = sc.nodes.find((n) => n.id === `m${STRIP}`)!;
    expect(strip.shape).toBe("chip");
    expect(strip.label).toBe("3 tests, tools & generated · used by 2");
    expect(strip.hint).toBe("2 tests & tools · 1 generated");
    expect(strip.stats).toBeUndefined();
    // One kind says itself on the line, with no tooltip.
    expect(stripText(noisy, ["m/testdata"], 3)).toEqual({ label: "2 tests & tools · used by 3" });
    expect(stripText(noisy, ["m/gen"], 0)).toEqual({ label: "1 generated · used by 0" });
    expect(strip.tier).toBe(-1);
    expect(strip.toggle).toBe("expand");
    expect(sc.against).toBe(0);
  });
  it("opens in place when toggled: its boxes in the bottom row, the strip kept to close them", () => {
    const sc = at({ toggled: [`m${STRIP}`] });
    expect(ids(sc.nodes)).toEqual([`m${STRIP}`, "m/a", "m/b", "m/gen", "m/testdata", "m/testdata/x", "m/testdata/y"]);
    for (const id of ["m/gen", "m/testdata"]) {
      const n = sc.nodes.find((x) => x.id === id)!;
      expect(n.tier).toBe(-1);
      expect(n.demoted).toBe(true);
    }
    expect(sc.nodes.find((n) => n.id === `m${STRIP}`)!.toggle).toBe("collapse");
  });
  it("keeps an opened demoted box's own toggle", () => {
    const n = at({ depth: 1, toggled: [`m${STRIP}`] }).nodes.find((x) => x.id === "m/testdata")!;
    expect([n.demoted, n.toggle]).toEqual([true, "expand"]);
  });
  it("selects the strip for a box it holds, as for a package", () => {
    expect(at({ depth: 1, selected: "m/testdata" }).selected).toBe(`m${STRIP}`);
    expect(at({ depth: 1, selected: "m/testdata/x" }).selected).toBe(`m${STRIP}`);
  });
  it("leaves a sibling set alone when all of it is demoted", () => {
    const sc = at({ focus: "m/testdata" });
    expect(ids(sc.nodes)).toEqual(["m/testdata/x", "m/testdata/y", "outside"]);
  });
  it("keeps a changed package drawn in a Change View", () => {
    const v = { ...view([...pkgs(["m/a"], "m"), ...pkgs(["m/gen"], "m", { demoted: "generated", status: "modified" })]), kind: "change" as const };
    expect(ids(at({ focus: "m" }, v).nodes)).toContain("m/gen");
  });
  it("lets a hash name a strip as a toggle", () => {
    expect(knownIds(noisy).folder(`m${STRIP}`)).toBe(true);
    expect(knownIds(noisy).folder(`nope${STRIP}`)).toBe(false);
    expect(isGroup(`m${STRIP}`)).toBe(true);
  });
});

// twenty boxes under m, p00 the smallest; none imports another.
const many = (extra: (i: number) => Partial<ViewNode> = () => ({}), edges: ViewEdge[] = []) => view(
  Array.from({ length: 20 }, (_, i) => pkgs([`m/p${String(i).padStart(2, "0")}`], "m", { decls: i + 1, ...extra(i) })[0]),
  edges,
);
const boxes = (sc: { nodes: { id: string; shape: string }[] }) => sc.nodes.filter((n) => n.shape === "box").map((n) => n.id);

describe("the budget fold (12)", () => {
  it("keeps the budget's boxes and folds the rest of the set into one chip", () => {
    const sc = at({}, many());
    expect(boxes(sc)).toHaveLength(15);
    expect(boxes(sc)).not.toContain("m/p04");
    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
    expect(chip.label).toBe("+5 more");
    expect(chip.shape).toBe("chip");
    expect(chip.tier).toBe(-1); // in the bottom row, with the strip
    expect(chip.toggle).toBe("expand");
  });
  it("keeps an entry point before bigger boxes, and folds islands first", () => {
    // p19 uses p00..p17 and holds a package main: an entry point. p18 uses
    // nothing and nothing uses it: an island, though the biggest.
    const into = Array.from({ length: 18 }, (_, i) => edge("m/p19", `m/p${String(i).padStart(2, "0")}`));
    const sc = at({}, many((i) => (i === 19 ? { decls: 1, main: true } : {}), into));
    expect(boxes(sc)).toContain("m/p19"); // the smallest, but an entry point
    expect(boxes(sc)).not.toContain("m/p18"); // an island
    expect(boxes(sc)).toContain("m/p04");
    expect(boxes(sc)).not.toContain("m/p03");
    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
    expect(chip.label).toBe("+5 more");
    expect(chip.hint).toBe("p00, p01, p02, p03, p18");
    // Without a package main, nothing makes p19 an entry point: it folds by size.
    expect(boxes(at({}, many((i) => (i === 19 ? { decls: 1 } : {}), into)))).not.toContain("m/p19");
  });
  it("weighs declarations by the hand-written share", () => {
    // p19, the biggest, is all generated declarations: it counts 0. p18 has
    // 19, 18 of them generated: it counts 1. Both fold; p03 (4) stays.
    const sc = at({}, many((i) => (i === 19 ? { genDecls: 20 } : i === 18 ? { genDecls: 18 } : {})));
    expect(boxes(sc)).not.toContain("m/p19");
    expect(boxes(sc)).not.toContain("m/p18");
    expect(boxes(sc)).toContain("m/p03");
    expect(boxes(sc)).not.toContain("m/p02");
  });
  it("counts only project siblings for islands and entry points (M2)", () => {
    // p18 uses nothing in m but an external module: still an island, and folds.
    const into = Array.from({ length: 18 }, (_, i) => edge("m/p19", `m/p${String(i).padStart(2, "0")}`));
    const withExt = (v: ReturnType<typeof many>) => ({ ...v, nodes: [...v.nodes, ...exts(["github.com/x/y"])] });
    const p1 = withExt(many((i) => (i === 19 ? { decls: 1, main: true } : {}), [...into, edge("m/p18", "github.com/x/y")]));
    expect(boxes(at({}, p1))).not.toContain("m/p18");
    // p00, the smallest, a package main that imports only an external: not an entry point.
    const p2 = withExt(many((i) => (i === 0 ? { main: true } : {}), [edge("m/p00", "github.com/x/y")]));
    expect(boxes(at({}, p2))).not.toContain("m/p00");
  });
  it("keeps what the Policy names and what changed", () => {
    const named = many();
    named.policy = { hash: "", levels: [], order: ["m/p00"] };
    expect(boxes(at({}, named))).toContain("m/p00");
    const changed = { ...many((i) => (i === 1 ? { status: "modified" } : {})), kind: "change" as const };
    expect(boxes(at({ focus: "m" }, changed))).toContain("m/p01");
  });
  it("reads the budget from the Policy, and never folds one box alone", () => {
    const v = many();
    v.policy = { hash: "", levels: [], budget: 18 };
    expect(boxes(at({}, v))).toHaveLength(18);
    v.policy.budget = 19;
    expect(boxes(at({}, v))).toHaveLength(20);
  });
  it("folds a set the Policy's Levels place by its Levels; only the order pins", () => {
    const v = many((i) => ({ rank: i < 10 ? 0 : 1 }));
    v.policy = { hash: "", levels: [["m/p0*"], ["m/p1*"]], order: ["m/p00"] };
    const sc = at({}, v);
    expect(boxes(sc)).toHaveLength(15);
    expect(boxes(sc)).toContain("m/p00"); // pinned, though the smallest
    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
    expect([chip.label, chip.tier]).toEqual(["+5 more", -1]);
  });
  it("folds a deep ranking too: a chain of twenty, one box a row", () => {
    const chain = many(() => ({}), Array.from({ length: 19 }, (_, i) => edge(`m/p${String(i + 1).padStart(2, "0")}`, `m/p${String(i).padStart(2, "0")}`)));
    const sc = at({}, chain);
    expect(boxes(sc)).toHaveLength(15);
    expect(sc.nodes.find((n) => n.id === `m${MORE}`)!.label).toBe("+5 more");
    // six rows of boxes and the bottom row of the chip: seven.
    expect(new Set(sc.nodes.map((n) => n.tier)).size).toBe(7);
  });
  it("folds only at the automatic depth", () => {
    expect(boxes(at({ depth: 1 }, many()))).toHaveLength(20);
  });
  it("counts every box that uses the strip, folded or not (M4)", () => {
    // p00, p01 and p19 import the demoted m/testdata/a; p00 and p01 fold.
    const v = many(() => ({}), ["m/p00", "m/p01", "m/p19"].map((f) => edge(f, "m/testdata/a")));
    v.nodes.push(...pkgs(["m/testdata/a"], "m", { demoted: "name" }));
    const sc = at({}, v);
    expect(boxes(sc)).not.toContain("m/p00");
    expect(sc.nodes.find((n) => n.id === `m${STRIP}`)!.label).toBe("1 tests & tools · used by 3");
  });
  it("says how many boxes folded (N9)", () => {
    expect(at({}, many()).folded).toBe(5);
    expect(at({ toggled: [`m${MORE}`] }, many()).folded).toBe(0);
  });
  it("opens the chip that holds a selected box, and keeps the selection (N3)", () => {
    const sc = at({ selected: "m/p00" }, many());
    expect(sc.selected).toBe("m/p00");
    expect(boxes(sc)).toContain("m/p00");
    expect(sc.nodes.find((n) => n.id === `m${MORE}`)!.label).toBe("fold 5");
    // Its toggle closes it again; the selection then stands on the chip.
    const shut = at({ selected: "m/p00", toggled: [`m${MORE}`] }, many());
    expect([boxes(shut).includes("m/p00"), shut.selected]).toEqual([false, `m${MORE}`]);
  });
  it("opens a chip in place, keeping it to fold the row again", () => {
    const sc = at({ toggled: [`m${MORE}`] }, many());
    expect(boxes(sc)).toHaveLength(20);
    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
    expect([chip.toggle, chip.label]).toEqual(["collapse", "fold 5"]);
    expect(knownIds(many()).folder(`m${MORE}`)).toBe(true);
  });
});

describe("search reveals a demoted package (12)", () => {
  it("opens the strip that holds it", () => {
    const s = reveal(noisy, "m/gen");
    expect(s.toggled).toEqual([`m${STRIP}`]);
    expect(ids(scene(noisy, s, { home: true }).nodes)).toContain("m/gen");
  });
});

describe("the row cap (12)", () => {
  it("counts only the ranks that still hold a box (N2)", () => {
    // Ranks the fold emptied are not rows: two ranks left fit.
    expect(capRows([3, 0, 0, 0, 0, 0, 0, 0, 1])).toBeNull();
    // Nine live ranks under a cap of 6 fill all 6 rows, not 5.
    const rows = capRows([1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1], 6)!;
    const live = [0, 1, 2, 3, 4, 5, 6, 7, 13].map((i) => rows[i]);
    expect(Math.max(...live)).toBe(5);
    expect(live).toEqual([...live].sort((x, y) => x - y)); // still bottom-up
  });
  it("leaves seven rows or fewer alone", () => {
    expect(capRows([1, 1, 1, 1, 1, 1, 1])).toBeNull();
    // The Panel keeps a merged box's own rank; a group has none.
    expect(rankNote(3)).toBe("rank 3 in its set before rows merged (0 = depends on nothing here)");
    expect([rankNote(undefined), rankNote(-1)]).toEqual([null, null]);
  });
  it("merges adjacent rows from the bottom, balanced by boxes", () => {
    // nine rows of one box: the lowest four pair up, the rest keep a row each.
    expect(capRows([1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 6]);
    // a heavy bottom row stays alone; the light ones above it merge.
    expect(capRows([9, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5, 6]);
  });
  it("draws a chain of nine at most seven rows, each box keeping its own row as its own tier", () => {
    const chain = view(pkgs(Array.from({ length: 9 }, (_, i) => `m/c${i}`), "m"),
      Array.from({ length: 8 }, (_, i) => edge(`m/c${i + 1}`, `m/c${i}`)));
    const sc = at({}, chain);
    const tier = (id: string) => sc.nodes.find((n) => n.id === id)!;
    expect(new Set(sc.nodes.map((n) => n.tier)).size).toBe(7);
    expect([tier("m/c0").tier, tier("m/c1").tier, tier("m/c8").tier]).toEqual([0, 0, 6]);
    expect([tier("m/c0").ownTier, tier("m/c1").ownTier]).toEqual([0, 1]);
  });
});

// k8s's pattern: the repository's own module at the root, and modules nested
// under it (staging).
const nested = view([
  { id: "k/cmd", kind: "package", module: "k", loc: { path: "cmd/main.go", line: 1 }, main: true },
  { id: "k/pkg/a", kind: "package", module: "k", loc: { path: "pkg/a/a.go", line: 1 } },
  { id: "k/pkg/b", kind: "package", module: "k", loc: { path: "pkg/b/b.go", line: 1 } },
  { id: "api/v1", kind: "package", module: "api", loc: { path: "staging/src/api/v1/t.go", line: 1 } },
  { id: "api/v2", kind: "package", module: "api", loc: { path: "staging/src/api/v2/t.go", line: 1 } },
  { id: "client", kind: "package", module: "client", loc: { path: "staging/src/client/c.go", line: 1 } },
], [edge("k/cmd", "k/pkg/a"), edge("k/pkg/a", "api/v1"), edge("client", "api/v1")]);

describe("the root module opens in place (12)", () => {
  it("finds the module at the repository root when others are nested", () => {
    expect(rootModule(nested)).toBe("k");
    expect(rootModule(view(pkgs(["m/a", "m/b"], "m")))).toBeNull();
    expect(rootModule(view([...pkgs(["a/x"], "a"), ...pkgs(["b/y"], "b")]))).toBeNull(); // no module at the root
  });
  it("draws it open at the page root, above the modules it uses", () => {
    const sc = scene(nested, { ...DEFAULT_STATE, depth: 1 }, { home: true });
    expect(sc.focus).toBe("");
    const k = sc.nodes.find((n) => n.id === "k")!;
    expect(k.shape).toBe("container");
    expect(ids(sc.nodes)).toEqual(expect.arrayContaining(["k/cmd", "k/pkg", "api", "client"]));
    expect(k.tier).toBeGreaterThan(sc.nodes.find((n) => n.id === "api")!.tier!);
  });
  it("closes by its own token, and never opens in a Change View", () => {
    const at1 = (toggled: string[]) => scene(nested, { ...DEFAULT_STATE, depth: 1, toggled }, { home: true }).nodes.find((n) => n.id === "k")!;
    expect(at1([`k${ROOT_CLOSED}`]).shape).toBe("box");
    // Its toggle flips that token, open or closed.
    expect([at1([]).toggle, at1([]).toggleId]).toEqual(["collapse", `k${ROOT_CLOSED}`]);
    expect([at1([`k${ROOT_CLOSED}`]).toggle, at1([`k${ROOT_CLOSED}`]).toggleId]).toEqual(["expand", `k${ROOT_CLOSED}`]);
    expect(knownIds(nested).folder(`k${ROOT_CLOSED}`)).toBe(true);
    const change = { ...nested, kind: "change" as const };
    expect(scene(change, { ...DEFAULT_STATE, depth: 1 }, { home: true }).nodes.find((n) => n.id === "k")!.shape).toBe("box");
  });
  it("keeps its children, however small, and folds the islands among them", () => {
    // Twenty staging modules in a chain, each bigger than k/a; k/i1 and k/i2,
    // the biggest, use nothing in k and nothing in k uses them: islands.
    const kid = (id: string, decls: number, main = false): ViewNode =>
      ({ id, kind: "package", module: "k", decls, main, loc: { path: `${id.slice(2)}/x.go`, line: 1 } });
    const mods = Array.from({ length: 20 }, (_, i) => `s${String(i).padStart(2, "0")}`);
    const v = view([
      kid("k/cmd", 5, true), kid("k/a", 1), kid("k/i1", 900), kid("k/i2", 900),
      ...mods.map((m): ViewNode => ({ id: m, kind: "package", module: m, decls: 100, loc: { path: `staging/${m}/x.go`, line: 1 } })),
    ], [edge("k/cmd", "k/a"), edge("k/a", "s00"), ...mods.slice(1).map((m, i) => edge(m, mods[i]))]);
    const sc = at({}, v);
    expect(boxes(sc)).toEqual(expect.arrayContaining(["k/cmd", "k/a"])); // the root module's, though the smallest
    expect(boxes(sc)).toHaveLength(15); // they count against the budget
    const chip = sc.nodes.find((n) => n.id === `k${MORE}`)!;
    expect([chip.label, chip.hint]).toEqual(["+2 more", "i1, i2"]);
  });
  it("keeps an old link's t=<root module> meaning: open in place (N10)", () => {
    expect(scene(nested, { ...DEFAULT_STATE, depth: 1, toggled: ["k"] }, { home: true }).nodes.find((n) => n.id === "k")!.shape).toBe("container");
  });
  it("goes up from inside it to the page root", () => {
    expect(upTo(nested, "k/pkg")).toBe("");
    expect(upTo(nested, "k")).toBe("");
  });
});

const roles = view([
  ...pkgs(["m/cmd/tool"], "m", { main: true }),
  ...pkgs(["m/internal/x"], "m", { genDecls: 3, decls: 3 }),
  ...pkgs(["m/internal/y", "m/lib"], "m", { decls: 1 }),
  // one command among three packages; half commands; a 10 % generated share.
  ...pkgs(["m/svc/a", "m/half/a"], "m", { main: true }),
  ...pkgs(["m/svc/b", "m/svc/c", "m/half/b"], "m"),
  ...pkgs(["m/lowgen/g"], "m", { genDecls: 1, decls: 1 }),
  // half its declarations generated, in one package (M1: counted per declaration).
  ...pkgs(["m/mixed"], "m", { genDecls: 5, decls: 10 }),
  ...pkgs(["m/lowgen/h"], "m", { decls: 9 }),
  // 30 % generated: under GEN_MIN, so no badge (12, A1).
  ...pkgs(["m/part"], "m", { genDecls: 3, decls: 10 }),
], [edge("m/cmd/tool", "m/lib"), edge("m/cmd/tool", "m/internal/y")]);

describe("path-role badges (12)", () => {
  const badges = (sc: { nodes: { id: string; badges?: string[] }[] }, id: string) => sc.nodes.find((n) => n.id === id)!.badges;
  it("names a box's role unless its own name says it, and its generated share", () => {
    const sc = scene(roles, { ...DEFAULT_STATE, depth: 1 }, { home: true });
    expect(badges(sc, "m/cmd")).toBeUndefined(); // "cmd" is its name
    expect(badges(sc, "m/internal")).toEqual(["gen 75%"]);
    expect(badges(sc, "m/lib")).toBeUndefined();
    const inner = scene(roles, { ...DEFAULT_STATE, focus: "m/internal" }, { home: true });
    expect(badges(inner, "m/internal/x")).toEqual(["internal", "gen 100%"]);
    const tool = scene(roles, { ...DEFAULT_STATE, focus: "m/cmd" }, { home: true });
    expect(badges(tool, "m/cmd/tool")).toEqual(["cmd"]);
  });
  it("says cmd only of a command's directory or a box half commands, and gen from 50 %", () => {
    const sc = scene(roles, { ...DEFAULT_STATE, depth: 1 }, { home: true });
    expect(badges(sc, "m/svc")).toBeUndefined(); // one package main of three
    expect(badges(sc, "m/half")).toEqual(["cmd"]);
    expect(badges(sc, "m/lowgen")).toBeUndefined(); // gen 10 %
    expect(badges(sc, "m/mixed")).toEqual(["gen 50%"]);
    expect(badges(sc, "m/part")).toBeUndefined(); // gen 30 %
  });
  it("calls the top row entry points only when every box in it holds a program", () => {
    expect(scene(roles, { ...DEFAULT_STATE, depth: 1 }, { home: true }).entry).toBe(true);
    const flat = { ...roles, edges: [] };
    expect(scene(flat, { ...DEFAULT_STATE, depth: 1 }, { home: true }).entry).toBe(false);
  });
});
