import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView } from "./data";
import { absolute, elkGraph, inOrder, layout, orderOf, positions, sizeOf, superseding, Superseded, triangles, type Stoppable } from "./layout";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { edge, pkgs, view } from "./testkit";

const v = parseView(JSON.stringify(golden));
const elk = new ELK();

describe("layout", () => {
  it("places every scene node the same way twice, relative to its container", async () => {
    const sc = scene(v, DEFAULT_STATE);
    const a = await layout(sc, elk);
    const b = await layout(sc, elk);
    expect([...a.keys()].sort()).toEqual(sc.nodes.map((n) => n.id));
    for (const p of a.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(a).toEqual(b);
    expect(a.get("example.com/shop/internal/store")?.parent).toBe("example.com/shop/internal");
    const abs = absolute(a, "example.com/shop/internal/store")!;
    const [s, i, m] = ["example.com/shop/internal/store", "example.com/shop/internal", "example.com/shop"].map((id) => a.get(id)!);
    expect(abs).toEqual({ x: s.x + i.x + m.x, y: s.y + i.y + m.y });
  });
  it("sizes come from text: box stats, method rows, container labels; edges only with lines", () => {
    const g = elkGraph(scene(v, DEFAULT_STATE));
    expect(g.layoutOptions?.["elk.spacing.nodeNode"]).toBe("24");
    expect(g.children?.[0].layoutOptions?.["elk.nodeSize.constraints"]).toBe("MINIMUM_SIZE");
    expect(sizeOf({ id: "x", label: "gen", parent: "", shape: "box", dim: false, selected: false, methods: [] }).w).toBe(204);
    expect(sizeOf({ id: "x", label: "T", parent: "", shape: "decl", dim: false, selected: false, methods: ["Get", "Put"] }))
      .toEqual({ w: 90, h: 76 });
    expect(g.edges).toHaveLength(7);
    expect(elkGraph(scene(v, { ...DEFAULT_STATE, lines: false })).edges).toEqual([]);
  });
  it("triangles sit on the top and bottom edges, apex out (uml-viewer)", () => {
    expect(triangles(100, 40)).toEqual({ in: "50,-10.39 44,0 56,0", out: "44,40 56,40 50,50.39" });
  });
});

// 07: m/core is rank 0, m/api rank 1; m/core/u and m/x are unranked, which
// uml-viewer draws as level 0 (layout.clj place-classes l.293).
const levels = {
  ...view(
    [
      ...pkgs(["m/api/h"], "m", { rank: 1 }),
      ...pkgs(["m/core/a"], "m", { rank: 0 }),
      ...pkgs(["m/core/u", "m/x"], "m"),
    ],
    [edge("m/api/h", "m/core/a"), { ...edge("m/core/a", "m/api/h"), violation: "levels" as const }],
  ),
  policy: { hash: "sha256:p", levels: [["m/core"], ["m/api"]], order: ["m/x", "m/core"] },
};

describe("levels and order (07)", () => {
  it("draws level 0 at the bottom, inside containers too, whichever way edges point", async () => {
    const a = await layout(scene(levels, { ...DEFAULT_STATE, depth: 3 }), elk);
    const y = (id: string) => absolute(a, id)!.y;
    expect(y("m/api")).toBeLessThan(y("m/core"));
    expect(y("m/api/h")).toBeLessThan(y("m/core/a"));
    expect(y("m/core/u")).toBe(y("m/core/a")); // unranked: level 0
    expect(y("m/x")).toBeGreaterThan(y("m/api")); // unranked: level 0
    expect(absolute(a, "m/x")!.x).toBeLessThan(absolute(a, "m/core")!.x); // order: [m/x, m/core]
  });

  it("steps between ranks, and leaves edges that climb the ranks out of the layout", () => {
    const g = elkGraph(scene(levels, { ...DEFAULT_STATE, depth: 3 }));
    const m = g.children![0];
    expect(m.children!.map((c) => c.id)).toEqual(["m/x", "m/core", "m/api", "__rank:m:1"]);
    expect(g.edges!.map((e) => e.id)).toEqual([
      "m/api/h→m/core/a", "__rank:m:1→m/x", "__rank:m:1→m/core", "m/api→__rank:m:1",
    ]);
    expect(JSON.stringify(elkGraph(scene(v, DEFAULT_STATE)))).not.toContain("__rank");
  });

  it("never places a higher rank below a lower one on zu's own layering", async () => {
    // zu's 06 acceptance layering at depth 3: eight siblings in zu/internal,
    // edges between most of them, some pointing up. ELK partitioning put
    // version (0) level with export (4); the steps must not.
    const ranks: Record<string, number> = { cli: 5, diff: 3, export: 4, gitref: 2, ir: 0, policy: 2, scan: 1, version: 0 };
    const ids = Object.keys(ranks).map((k) => `z/internal/${k}`);
    const zu = view(ids.map((id) => ({ ...pkgs([id], "z")[0], rank: ranks[id.slice(11)] })), [
      edge("z/internal/cli", "z/internal/export"), edge("z/internal/cli", "z/internal/version"),
      edge("z/internal/export", "z/internal/diff"), edge("z/internal/diff", "z/internal/policy"),
      edge("z/internal/policy", "z/internal/scan"), edge("z/internal/scan", "z/internal/ir"),
      edge("z/internal/gitref", "z/internal/ir"), { ...edge("z/internal/ir", "z/internal/cli"), violation: "levels" },
    ]);
    const a = await layout(scene(zu, { ...DEFAULT_STATE, depth: 3 }), elk);
    const y = (k: string) => absolute(a, `z/internal/${k}`)!.y;
    for (const p of Object.keys(ranks)) for (const q of Object.keys(ranks)) {
      if (ranks[p] > ranks[q]) expect(y(p), `${p} above ${q}`).toBeLessThan(y(q));
    }
    expect([...a.keys()].some((id) => id.startsWith("__rank"))).toBe(false);
  });

  it("keeps edges that climb only inside siblings of one rank, and still ranks inside them", async () => {
    // m/a and m/b both roll up to rank 1, and each imports up into the other:
    // the edges do not climb between m/a and m/b, so they stay in the input,
    // where with the steps inside m/a and m/b they form a cycle ELK breaks.
    const x = view(
      [...pkgs(["m/a/hi", "m/b/hi"], "m", { rank: 1 }), ...pkgs(["m/a/lo", "m/b/lo"], "m", { rank: 0 })],
      [{ ...edge("m/a/lo", "m/b/hi"), violation: "levels" }, { ...edge("m/b/lo", "m/a/hi"), violation: "levels" }],
    );
    const sc = scene(x, { ...DEFAULT_STATE, depth: 3 });
    expect(elkGraph(sc).edges!.map((e) => e.id)).toEqual(expect.arrayContaining(["m/a/lo→m/b/hi", "m/b/lo→m/a/hi"]));
    const a = await layout(sc, elk);
    for (const p of ["m/a", "m/b"]) expect(absolute(a, `${p}/hi`)!.y, p).toBeLessThan(absolute(a, `${p}/lo`)!.y);
  });

  it("puts ordered siblings first in the input, in the Policy's order, then the rest by id", () => {
    const m = elkGraph(scene(levels, { ...DEFAULT_STATE, depth: 2 })).children![0];
    expect(m.children!.map((c) => c.id).filter((id) => !id.startsWith("__rank"))).toEqual(["m/x", "m/core", "m/api"]);
  });

  it("places ordered siblings first in their row, side by side from the row's left edge", async () => {
    // ELK alone placed these six unconnected siblings x, z, c, y, a, b.
    const ids = ["m/a", "m/b", "m/c", "m/x", "m/y", "m/z"];
    const six = { ...view(pkgs(ids, "m"), []), policy: { hash: "sha256:p", levels: [], order: ["m/z", "m/y", "m/x"] } };
    const sc = scene(six, { ...DEFAULT_STATE, depth: 2 });
    const elkOnly = positions(await elk.layout(elkGraph(sc)));
    const a = await layout(sc, elk);
    const row = [...ids].sort((p, q) => a.get(p)!.x - a.get(q)!.x);
    expect(row).toEqual(["m/z", "m/y", "m/x", "m/a", "m/b", "m/c"]);
    expect(new Set(ids.map((id) => a.get(id)!.y)).size).toBe(1);
    expect(a.get("m/z")!.x).toBe(Math.min(...ids.map((id) => elkOnly.get(id)!.x)));
    for (let i = 1; i < row.length; i++) {
      const [l, r] = [a.get(row[i - 1])!, a.get(row[i])!];
      expect(r.x - (l.x + l.w), row[i]).toBe(24); // elk.spacing.nodeNode
    }
    expect(inOrder(elkOnly, orderOf(scene(v, DEFAULT_STATE)))).toBe(elkOnly); // no order: ELK's placement
  });
});

// fake is an engine whose layouts finish when the test says so.
function fakes() {
  const made: { stopped: boolean; jobs: { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] }[] = [];
  const make = (): Stoppable => {
    const f = { stopped: false, jobs: [] as { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] };
    made.push(f);
    return {
      layout: () => new Promise((resolve, reject) => f.jobs.push({ resolve, reject })),
      terminateWorker: () => void (f.stopped = true),
    };
  };
  return { made, make };
}

describe("superseding", () => {
  it("a newer layout stops the running worker and starts a fresh one", async () => {
    const { made, make } = fakes();
    const e = superseding(make);
    const old = e.layout({ id: "a" });
    const now = e.layout({ id: "b" });
    await expect(old).rejects.toBeInstanceOf(Superseded);
    expect(made.map((f) => f.stopped)).toEqual([true, false]);
    made[1].jobs[0].resolve({ id: "b" });
    await expect(now).resolves.toEqual({ id: "b" });
    const next = e.layout({ id: "c" });
    expect(made).toHaveLength(2);
    made[1].jobs[1].resolve({ id: "c" });
    await expect(next).resolves.toEqual({ id: "c" });
  });
  it("a failed worker is replaced on the next layout", async () => {
    const { made, make } = fakes();
    const e = superseding(make);
    const bad = e.layout({ id: "a" });
    made[0].jobs[0].reject(new Error("layout worker failed: blocked"));
    await expect(bad).rejects.toThrow("blocked");
    void e.layout({ id: "b" });
    expect(made.map((f) => f.stopped)).toEqual([true, false]);
  });
});
