import { describe, expect, it } from "vitest";
import { changedSubgraph } from "./change";
import { crapBand, crapFacts, crapGrade, crapLabel, rolledCrap } from "./metrics";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { decl, pkgs, view } from "./testkit";

// m/a/x μ+σ 4, m/a/y 11, m/b/z measured without coverage data, m/c/w not
// measured (no functions).
const v = {
  ...view(pkgs(["m/a/x", "m/a/y", "m/b/z", "m/c/w"], "m")),
  metrics: {
    packages: {
      "m/a/x": { funcs: 2, crap: { mu: 3, max: 5, sigma: 1 } },
      "m/a/y": { funcs: 4, missing: 1, crap: { mu: 10, max: 30, sigma: 1 } },
      "m/b/z": { funcs: 1, missing: 1 },
    },
    funcs: {},
  },
};

describe("CRAP as uml-viewer grades it", () => {
  it("grades μ+σ on 1–10 through the 8/12/20 stops, missing as the worst", () => {
    expect([4, 8, 10, 12, 16, 20, 25].map(crapGrade)).toEqual([10, 10, 7.75, 5.5, 3.25, 1, 1]);
    expect(crapGrade(null)).toBe(1);
  });

  it("bands at 8 and 12, missing as red", () => {
    expect([8, 8.1, 12, 12.1].map(crapBand)).toEqual(["green", "yellow", "yellow", "red"]);
    expect(crapBand(null)).toBe("red");
  });

  it("labels a badge with its band in words, so colour is never the only sign", () => {
    expect([2, 10, 12.5, null].map(crapLabel)).toEqual(["2 low", "10 mid", "12.5 high", "? high"]);
  });

  it("rolls a box up to the worst package under it; no data is the worst", () => {
    const r = rolledCrap(v);
    expect(Object.fromEntries(r)).toEqual({ "m/a/x": 4, "m/a/y": 11, "m/a": 11, "m/b/z": null, "m/b": null, m: null });
    expect(r.has("m/c")).toBe(false); // a package without functions is neutral
  });

  it("rolls nothing without metrics", () => {
    expect(rolledCrap(view(pkgs(["m/a"], "m"))).size).toBe(0);
  });
});

describe("the scene carries CRAP", () => {
  const d = {
    ...v,
    nodes: [
      ...v.nodes.map((n) => ({ ...n, detail: true })),
      decl("m/a/x.F", "m/a/x", "function"), decl("m/a/x.G", "m/a/x", "function"), decl("m/a/x.T", "m/a/x"),
    ],
    metrics: { ...v.metrics, funcs: { "m/a/x.F": { cc: 2, stmts: 4, covered: 4, crap: 2 }, "m/a/x.G": { cc: 3, stmts: 1, covered: 0 } } },
  };
  const crap = (depth: number | null, focus = "") =>
    Object.fromEntries(scene(d, { ...DEFAULT_STATE, depth, focus }).nodes.map((n) => [n.id, n.crap]));

  it("on every box and container, rolled up; none on an unmeasured box", () => {
    expect(crap(2)).toEqual({
      m: { risk: null, band: "red" }, "m/a": { risk: 11, band: "yellow" },
      "m/b": { risk: null, band: "red" }, "m/c": undefined,
    });
    expect(crap(3)["m/a/x"]).toEqual({ risk: 4, band: "green" });
  });

  it("on a function by its own CRAP; none on a type", () => {
    expect(crap(null, "m/a/x#pkg")).toEqual({
      "m/a/x.F": { risk: 2, band: "green" }, "m/a/x.G": { risk: null, band: "red" }, "m/a/x.T": undefined,
    });
  });

  it("on a package's own #pkg leaf by its own CRAP, not its box's", () => {
    const root = { ...d, nodes: [...pkgs(["m"], "m"), ...d.nodes] }; // package m itself is unmeasured
    const sc = scene(root, { ...DEFAULT_STATE, depth: 2 });
    expect(sc.nodes.find((n) => n.id === "m#pkg")?.crap).toBeUndefined();
    expect(sc.nodes.find((n) => n.id === "m")?.crap).toEqual({ risk: null, band: "red" });
  });

  it("nowhere without metrics", () => {
    const { metrics: _, ...plain } = d;
    expect(scene(plain, { ...DEFAULT_STATE, depth: 3 }).nodes.some((n) => n.crap)).toBe(false);
  });
});

describe("the panel's CRAP facts", () => {
  const d = {
    ...v,
    nodes: [...v.nodes, decl("m/a/y.F", "m/a/y", "function"), decl("m/a/y.G", "m/a/y", "function"), decl("m/a/y.H", "m/a/y", "function")],
    metrics: {
      ...v.metrics,
      funcs: {
        "m/a/y.F": { cc: 3, stmts: 3, covered: 1, crap: 5.7 },
        "m/a/y.G": { cc: 6, stmts: 10, covered: 0, crap: 42 },
        "m/a/y.H": { cc: 2, stmts: 4, covered: 2 },
      },
    },
  };

  it("a package: μ, max, σ and grade, the functions without data, the riskiest first", () => {
    expect(crapFacts(d, "m/a/y#pkg")).toEqual({
      lines: ["CRAP μ 10 · max 30 · σ 1 · μ+σ 11, grade 6.6 of 10", "1 of 4 functions without coverage data"],
      top: [
        { id: "m/a/y.G", crap: 42 },
        { id: "m/a/y.F", crap: 5.7 },
      ],
    });
    expect(crapFacts(d, "m/b/z")).toEqual({ lines: ["No coverage data for its 1 function: counts as red"], top: [] });
  });

  it("a box: the worst μ+σ below it, as its badge has it", () => {
    const r = rolledCrap(d);
    expect(crapFacts(d, "m/a", r.get("m/a"))?.lines).toEqual(["Worst CRAP μ+σ below: 11, grade 6.6 of 10"]);
    expect(crapFacts(d, "m", r.get("m"))?.lines).toEqual(["Worst CRAP μ+σ below: no coverage data, counts as red"]);
    expect(crapFacts(d, "m/c", r.get("m/c"))).toBeNull(); // nothing measured below
  });

  it("a box in a Change View's changed subgraph says what its badge says", () => {
    // m/in/x, unchanged and without coverage data, is not drawn: the badge
    // rolls up only m/in/store, and so must the panel.
    const whole = {
      ...view([...pkgs(["m"], "m"), ...pkgs(["m/in/store"], "m", { status: "modified" }), ...pkgs(["m/in/x"], "m")]),
      kind: "change" as const,
      changed: ["m/in/store"],
      metrics: { packages: { "m/in/store": { funcs: 1, crap: { mu: 5, max: 5, sigma: 0 } }, "m/in/x": { funcs: 2, missing: 2 } }, funcs: {} },
    };
    const box = scene(changedSubgraph(whole), { ...DEFAULT_STATE, depth: 2 }).nodes.find((n) => n.id === "m/in");
    expect(box?.crap).toEqual({ risk: 5, band: "green" });
    // Ruling at approval: a Change View says the rollup is over the drawn packages.
    expect(crapFacts(whole, "m/in", box?.crap?.risk)?.lines).toEqual(["Worst CRAP μ+σ among drawn: 5, grade 10.0 of 10"]);
    expect(crapFacts(whole, "m/in", null)?.lines).toEqual(["Worst CRAP μ+σ among drawn: no coverage data, counts as red"]);
  });

  it("a function: complexity, coverage and CRAP", () => {
    expect(crapFacts(d, "m/a/y.F")?.lines).toEqual(["Complexity 3 · 1 of 3 statements covered (33%) · CRAP 5.7"]);
    expect(crapFacts(d, "m/a/y.H")?.lines).toEqual(["Complexity 2 · no coverage data: counts as red"]);
  });

  it("nothing unmeasured, and nothing without metrics", () => {
    expect(crapFacts(d, "m/c/w")).toBeNull();
    expect(crapFacts(view(pkgs(["m/a"], "m")), "m/a")).toBeNull();
  });
});
