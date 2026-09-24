import { describe, expect, it } from "vitest";
import { crapBand, crapGrade, crapLabel, rolledCrap } from "./metrics";
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
