// Where a scene is drawn. The ELK input comes from the scene alone: every list
// is sorted and sizes come from label lengths, never from the DOM, so the same
// View always lays out the same way. The engine is passed in: engine.ts for
// the page, elk.bundled.js in unit tests.
import type { ElkNode } from "elkjs/lib/elk-api";
import type { Scene, SceneNode } from "./scene";

export type Placed = { x: number; y: number; w: number; h: number; parent?: string };
export type Engine = { layout(graph: ElkNode): Promise<ElkNode> };

const ROW = 18;

// sizeOf estimates a node from its text: the label, the method rows, and for
// boxes the stats line ("15 decls · 4 unresolved").
export function sizeOf(n: SceneNode): { w: number; h: number } {
  const stats = n.shape === "box" ? 24 : 0;
  const text = Math.max(n.label.length, stats, ...n.methods.map((r) => r.length + 2));
  return { w: Math.min(280, Math.max(90, text * 7.5 + 24)), h: 40 + ROW * n.methods.length };
}

const rootOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.randomSeed": "1",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
};

// elkGraph is the layout input: containers as compound nodes wide enough for
// their label, leaves sized by sizeOf, and the edges only when lines are drawn.
export function elkGraph(sc: Scene): ElkNode {
  const byParent = new Map<string, SceneNode[]>();
  for (const n of sc.nodes) {
    const l = byParent.get(n.parent);
    if (l) l.push(n);
    else byParent.set(n.parent, [n]);
  }
  const build = (n: SceneNode): ElkNode => {
    if (n.shape !== "container") {
      const { w, h } = sizeOf(n);
      return { id: n.id, width: w, height: h };
    }
    return {
      id: n.id,
      layoutOptions: {
        "elk.padding": "[top=24,left=12,bottom=12,right=12]",
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": `(${Math.min(280, n.label.length * 7.5 + 24)}, 40)`,
      },
      children: (byParent.get(n.id) ?? []).map(build),
    };
  };
  return {
    id: "__root",
    layoutOptions: rootOptions,
    children: (byParent.get("") ?? []).map(build),
    edges: sc.lines ? sc.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })) : [],
  };
}

// positions flattens ELK's result; x and y are relative to the parent, as
// React Flow's parentId expects.
export function positions(g: ElkNode): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const walk = (n: ElkNode, parent?: string) => {
    for (const c of n.children ?? []) {
      out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0, ...(parent ? { parent } : {}) });
      walk(c, c.id);
    }
  };
  walk(g);
  return out;
}

export const layout = async (sc: Scene, engine: Engine) => positions(await engine.layout(elkGraph(sc)));

// absolute is a node's position on the canvas: its own plus its parents'.
export function absolute(placed: ReadonlyMap<string, Placed>, id: string): { x: number; y: number } | null {
  let p = placed.get(id);
  if (!p) return null;
  let x = 0;
  let y = 0;
  for (; p; p = p.parent ? placed.get(p.parent) : undefined) {
    x += p.x;
    y += p.y;
  }
  return { x, y };
}

// triangles are uml-viewer's dependency marks (engine/hit.clj `class-triangle`):
// 12 px equilateral, incoming with its apex above the top edge, outgoing with
// its apex below the bottom edge, both centred. Points are relative to the box.
export function triangles(w: number, h: number): { in: string; out: string } {
  const half = 6;
  const tip = +(12 * Math.sqrt(3) / 2).toFixed(2);
  const cx = w / 2;
  return {
    in: `${cx},${-tip} ${cx - half},0 ${cx + half},0`,
    out: `${cx - half},${h} ${cx + half},${h} ${cx},${h + tip}`,
  };
}

// An ELK that can be stopped: elk-api's terminateWorker (elk-api.d.ts).
export type Stoppable = Engine & { terminateWorker(): void };

export class Superseded extends Error {
  constructor() {
    super("a newer layout replaced this one");
  }
}

// superseding runs one layout at a time. A newer request terminates the
// running one's worker (ELK cannot cancel a job) and starts a fresh engine;
// the old promise rejects with Superseded. A failed engine is replaced on the
// next request, so one worker error does not stop every later layout.
export function superseding(make: () => Stoppable): Engine & { dispose(): void } {
  let elk: Stoppable | null = null;
  let running: { reject: (e: Error) => void } | null = null;
  const drop = () => {
    elk?.terminateWorker();
    elk = null;
  };
  const stop = () => {
    const r = running;
    running = null;
    drop();
    r?.reject(new Superseded());
  };
  return {
    layout(g) {
      if (running) stop();
      const mine = (elk ??= make());
      return new Promise<ElkNode>((resolve, reject) => {
        const job = { reject };
        running = job;
        mine.layout(g).then(
          (out) => {
            if (running !== job) return;
            running = null;
            resolve(out);
          },
          (err: Error) => {
            if (running !== job) return;
            running = null;
            if (elk === mine) drop();
            reject(err);
          },
        );
      });
    },
    dispose: () => {
      if (running) stop();
      else drop();
    },
  };
}
