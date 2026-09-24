import { describe, expect, it } from "vitest";
import { pinFor, rolledRanks, violating } from "./policy";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { edge, pkgs, view } from "./testkit";

// m/core is inner, m/api outer: core → api breaks Levels (06's View marks it).
const v = {
  ...view(pkgs(["m/api/h", "m/api/r", "m/core/a", "m/core/b"], "m"), [
    edge("m/api/h", "m/core/a"),
    edge("m/api/r", "m/core/b"),
    { ...edge("m/core/b", "m/api/r"), violation: "levels" as const },
  ]),
  policy: { hash: "sha256:p", levels: [["m/core"], ["m/api"]] },
};

describe("violations through 05's pin hook", () => {
  it("pins a bundle when any edge inside it violates", () => {
    const [clean, red] = [edge("a", "b"), { ...edge("a", "b"), violation: "cycle" as const }];
    expect(violating({ from: "a", to: "b", pairs: 1, members: [clean] })).toBe(false);
    expect(violating({ from: "a", to: "b", pairs: 2, members: [clean, red] })).toBe(true);
  });

  it("draws the violating bundle red at every depth, and nothing else", () => {
    for (const depth of [2, 3]) {
      const sc = scene(v, { ...DEFAULT_STATE, depth }, { pin: pinFor(v) });
      const red = sc.edges.filter((e) => e.pinned).map((e) => e.id);
      expect(red).toEqual([depth === 2 ? "m/core→m/api" : "m/core/b→m/api/r"]);
    }
  });

  it("keeps a violation drawn below minPairs and as red triangles without lines", () => {
    const sc = scene(v, { ...DEFAULT_STATE, depth: 3, minPairs: 5 }, { pin: pinFor(v) });
    expect(sc.edges.map((e) => e.id)).toEqual(["m/core/b→m/api/r"]);
    const marks = scene(v, { ...DEFAULT_STATE, depth: 3, lines: false }, { pin: pinFor(v) });
    expect(marks.nodes.find((n) => n.id === "m/api/r")?.mark?.inPinned).toBe(true);
  });

  it("pins nothing without a Policy", () => {
    const { policy: _, ...plain } = v;
    const sc = scene(plain, { ...DEFAULT_STATE, depth: 3 }, { pin: pinFor(plain) });
    expect(sc.edges.some((e) => e.pinned)).toBe(false);
  });
});

// 07: ranks as 06's View carries them (packages only); boxes roll them up.
const ranked = {
  ...v,
  nodes: [
    ...v.nodes.map((n) => ({ ...n, rank: n.id.startsWith("m/core") ? 0 : 1 })),
    ...pkgs(["m/api", "m/util"], "m"),
  ],
};

describe("rank badges (07)", () => {
  it("gives a box the highest rank under it, and unranked boxes none", () => {
    const r = rolledRanks(ranked);
    expect([r.get("m"), r.get("m/api"), r.get("m/core"), r.get("m/core/a"), r.get("m/util")]).toEqual([1, 1, 0, 0, undefined]);
  });

  it("puts the rank on drawn boxes and containers", () => {
    const sc = scene(ranked, { ...DEFAULT_STATE, depth: 2 }, { pin: pinFor(ranked) });
    const rank = Object.fromEntries(sc.nodes.map((n) => [n.id, n.rank]));
    expect(rank).toEqual({ m: 1, "m/api": 1, "m/core": 0, "m/util": undefined });
    const open = scene(ranked, { ...DEFAULT_STATE, depth: 3 }, { pin: pinFor(ranked) });
    expect(open.nodes.filter((n) => n.id.startsWith("m/api")).map((n) => [n.id, n.rank])).toEqual([
      ["m/api", 1], ["m/api#pkg", undefined], ["m/api/h", 1], ["m/api/r", 1],
    ]);
  });
});
