import { describe, expect, it } from "vitest";
import { crapBand, crapGrade, crapLabel, rolledCrap } from "./metrics";
import { pkgs, view } from "./testkit";

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
