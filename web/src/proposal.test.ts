import { describe, expect, it } from "vitest";
import { childrenOf } from "./cut";
import type { View } from "./data";
import { breadcrumb } from "./headline";
import { pinFor } from "./policy";
import { PROPOSAL_NOTICE, proposalView, UNASSIGNED } from "./proposal";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { decl, edge, pkgs, view } from "./testkit";

// The Package Tree: m/app and m/domain with sub-packages, m/tools and m/util.
// Under the Policy's Levels m/domain is inner; the Proposal "Flip" puts m/app
// inner, so m/app/api → m/domain/model is its violation and 06's is not.
const v: View = {
  ...view(
    [
      ...pkgs(["m/app/api", "m/app/svc", "m/domain", "m/domain/model", "m/tools/gen", "m/util"], "m"),
      decl("m/app/svc.Service", "m/app/svc"),
    ],
    [
      edge("m/app/api", "m/domain/model"),
      edge("m/app/svc", "m/app/api"),
      { ...edge("m/domain", "m/app/svc"), violation: "levels" },
      edge("m/tools/gen", "m/util"),
      edge("m/util", "m/domain"),
    ],
  ),
  policy: {
    hash: "sha256:p", levels: [["m/domain"], ["m/app"]],
    proposals: [{
      name: "Flip",
      layers: [{ name: "App", members: ["m/app"] }, { name: "Domain model", members: ["m/domain/model"] }],
      omit: ["m/tools"],
      ranks: { "m/app/api": 0, "m/app/svc": 0, "m/domain/model": 1 },
      violations: [{ from: "m/app/api", to: "m/domain/model" }],
    }],
  },
};

describe("proposalView (07)", () => {
  const p = proposalView(v, "Flip");

  it("roots the tree at one box per layer, then Unassigned, each holding real boxes", () => {
    expect(childrenOf(p, "")).toEqual(["proposal:0", "proposal:1", UNASSIGNED]);
    expect(childrenOf(p, "proposal:0")).toEqual(["m/app"]);
    expect(childrenOf(p, "m/app")).toEqual(["m/app/api", "m/app/svc"]);
    expect(childrenOf(p, "proposal:1")).toEqual(["m/domain/model"]);
    expect(childrenOf(p, UNASSIGNED)).toEqual(["m/domain", "m/util"]);
    // The Change View's subgraph keeps regroup but drops packages: no empty boxes.
    const sub = { ...p, nodes: p.nodes.filter((n) => n.id !== "m/util" && n.id !== "m/domain/model") };
    expect(childrenOf(sub, "")).toEqual(["proposal:0", UNASSIGNED]);
    expect(childrenOf(sub, UNASSIGNED)).toEqual(["m/domain"]);
  });

  it("drops what the Proposal omits, and re-marks ranks and violations from zu's evaluation", () => {
    expect(p.nodes.some((n) => n.id.startsWith("m/tools"))).toBe(false);
    expect(p.nodes.find((n) => n.id === "m/app/svc.Service")).toBeDefined();
    const rank = Object.fromEntries(p.nodes.filter((n) => n.kind === "package").map((n) => [n.id, n.rank]));
    expect(rank).toEqual({ "m/app/api": 0, "m/app/svc": 0, "m/domain": undefined, "m/domain/model": 1, "m/util": undefined });
    expect(p.edges.filter((e) => e.violation).map((e) => `${e.from}→${e.to}`)).toEqual(["m/app/api→m/domain/model"]);
  });

  it("draws the layers as labelled boxes with ranks, and its violation red", () => {
    const sc = scene(p, { ...DEFAULT_STATE, depth: 1 }, { pin: pinFor(p) });
    expect(sc.nodes.map((n) => [n.id, n.label, n.rank])).toEqual([
      ["proposal:0", "App", 0], ["proposal:1", "Domain model", 1], [UNASSIGNED, "Unassigned", undefined],
    ]);
    expect(sc.edges.filter((e) => e.pinned).map((e) => e.id)).toEqual(["proposal:0→proposal:1"]);
    const open = scene(p, { ...DEFAULT_STATE, depth: 2 }, { pin: pinFor(p) });
    expect(open.nodes.find((n) => n.id === "m/app")?.label).toBe("app");
    expect(breadcrumb(p, "m/app").map((c) => c.label)).toEqual(["root", "App", "app"]);
  });

  it("is the View itself for an unknown name, and names the banner as uml-viewer does", () => {
    expect(proposalView(v, "Nope")).toBe(v);
    expect(PROPOSAL_NOTICE).toBe("PROPOSAL — not instantiated in code");
  });
});
