import { describe, expect, it } from "vitest";
import type { ViewEdge, ViewNode } from "./data";
import { demotedBox, isGroup, MORE, STRIP, stripText } from "./group";
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
