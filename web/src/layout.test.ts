import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView } from "./data";
import { absolute, elkGraph, layout, sizeOf, superseding, Superseded, triangles, type Stoppable } from "./layout";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";

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
