// Where a scene is drawn. The ELK input comes from the scene alone: every list
// is sorted and sizes come from label lengths, never from the DOM, so the same
// View always lays out the same way. The engine is passed in: engine.ts for
// the page, elk.bundled.js in unit tests.
import type { ElkNode } from "elkjs/lib/elk-api";
import { cmp } from "./cut";
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

const GAP = 24; // elk.spacing.nodeNode

const rootOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.randomSeed": "1",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": String(GAP),
  // 11: 12, not 48: ELK routes no edge now, and ranked's step layers
  // double every gap between two ranks.
  "elk.layered.spacing.nodeNodeBetweenLayers": "12",
  // 11: the step nodes are zero-size, and the default placement (Brandes-Köpf)
  // set each rank beside the one below it, a staircase twice as wide as the
  // widest rank (hugo 2219 px for a 1800 px rank). Network simplex keeps
  // them within the widest; centred then puts each over the middle.
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  // 11: and a rank's many step edges add no space between two ranks.
  "elk.layered.spacing.edgeEdgeBetweenLayers": "0",
  "elk.layered.spacing.edgeNodeBetweenLayers": "0",
};

// elkGraph is the layout input: containers as compound nodes wide enough for
// their label, and leaves sized by sizeOf. It holds no drawn edge (11): the
// ranks alone place the nodes, so lines can come and go (edges.ts) and
// nothing moves. Siblings in the Policy's order come first; inOrder places
// them. Level 0 is drawn at the bottom (decisions.md, Levels rule): see
// ranked below.
export function elkGraph(sc: Scene): ElkNode {
  const byParent = new Map<string, SceneNode[]>();
  for (const n of sc.nodes) {
    const l = byParent.get(n.parent);
    if (l) l.push(n);
    else byParent.set(n.parent, [n]);
  }
  const last = Number.MAX_SAFE_INTEGER;
  for (const l of byParent.values()) l.sort((a, b) => (a.order ?? last) - (b.order ?? last));
  const rank = sc.nodes.some((n) => n.rank !== undefined || n.tier !== undefined) ? ranked(byParent) : null;
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
      children: [...(byParent.get(n.id) ?? []).map(build), ...(rank?.steps.get(n.id) ?? [])],
    };
  };
  return {
    id: "__root",
    layoutOptions: rootOptions,
    children: [...(byParent.get("") ?? []).map(build), ...(rank?.steps.get("") ?? [])],
    edges: rank?.edges ?? [],
  };
}

export const STEP = "__rank:"; // the id prefix of ranked's invisible nodes

// WRAP is the most siblings of one rank drawn side by side (11). A wider rank,
// such as a flat internal/ of leaves that all land in rank 0, wraps into rows
// of WRAP, in the siblings' order, each row below the last.
export const WRAP = 10;

// ranked puts siblings with a higher rank above those with a lower one, in
// every container. A sibling set in which any node has a Policy rank uses
// the Policy's ranks, unranked nodes counting as level 0, as in uml-viewer
// (layout.clj place-classes, l.293); any other set uses the architecture
// ranks scene computed (rank.ts, 11). ELK's own partitioning orders a flat
// graph but is ignored inside compound nodes with INCLUDE_CHILDREN, which zu
// needs (measured in elkjs 0.12), so between each two rows ranked adds an
// invisible zero-size step node, with an edge from every node of the upper
// row to it and from it to every node of the lower: O(n) edges, and the only
// edges ELK sees. A row is a rank, or WRAP boxes of a wider one.
function ranked(byParent: ReadonlyMap<string, SceneNode[]>) {
  const steps = new Map<string, ElkNode[]>();
  const edges: { id: string; sources: string[]; targets: string[] }[] = [];
  for (const [parent, kids] of byParent) {
    const policy = kids.some((k) => k.rank !== undefined);
    const level = (n: SceneNode) => (policy ? n.rank : n.tier) ?? 0;
    const levels = [...new Set(kids.map(level))].sort((a, b) => b - a);
    const rows: { name: string; nodes: SceneNode[] }[] = [];
    for (const l of levels) {
      const at = kids.filter((k) => level(k) === l);
      for (let i = 0; i < at.length; i += WRAP) rows.push({ name: i === 0 ? `${l}` : `${l}.${i / WRAP}`, nodes: at.slice(i, i + WRAP) });
    }
    for (let i = 0; i + 1 < rows.length; i++) {
      const id = `${STEP}${parent}:${rows[i].name}`;
      steps.set(parent, [...(steps.get(parent) ?? []), { id, width: 0, height: 0 }]);
      const [upper, lower] = [new Set(rows[i].nodes), new Set(rows[i + 1].nodes)];
      for (const k of kids) {
        if (upper.has(k)) edges.push({ id: `${k.id}→${id}`, sources: [k.id], targets: [id] });
        if (lower.has(k)) edges.push({ id: `${id}→${k.id}`, sources: [id], targets: [k.id] });
      }
    }
  }
  return { steps, edges };
}

// positions flattens ELK's result; x and y are relative to the parent, as
// React Flow's parentId expects.
export function positions(g: ElkNode): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const walk = (n: ElkNode, parent?: string) => {
    for (const c of n.children ?? []) {
      if (c.id.startsWith(STEP)) continue;
      out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0, ...(parent ? { parent } : {}) });
      walk(c, c.id);
    }
  };
  walk(g);
  return out;
}

export const layout = async (sc: Scene, engine: Engine) => centred(inOrder(positions(await engine.layout(elkGraph(sc))), orderOf(sc)));

// orderOf is each ordered node's index in the Policy's order.
export const orderOf = (sc: Scene): ReadonlyMap<string, number> =>
  new Map(sc.nodes.flatMap((n) => (n.order === undefined ? [] : [[n.id, n.order] as const])));

// inOrder applies the Policy's order to placement (07). ELK keeps model order
// only where it costs no crossings: six unconnected siblings given in the
// order z, y, x, a, b, c came out x, z, c, y, a, b, whatever ordering options
// were set. So each row of siblings that holds an ordered node is re-placed
// left to right, the ordered ones in order, then the rest by id (hierarchy.clj
// sort-ids, l.57), from the row's left edge and GAP apart. A row never widens:
// ELK spaces siblings at least GAP apart. Lines follow, because React Flow
// draws edges from the nodes' handles, not ELK's routes. Other rows keep
// ELK's placement.
export function inOrder(placed: Map<string, Placed>, order: ReadonlyMap<string, number>): Map<string, Placed> {
  if (order.size === 0) return placed;
  const out = new Map(placed);
  const last = Number.MAX_SAFE_INTEGER;
  for (const ids of siblings(placed).values()) {
    for (const row of rowsOf(ids, placed)) {
      if (!row.some((id) => order.has(id))) continue;
      let x = Math.min(...row.map((id) => placed.get(id)!.x));
      row.sort((a, b) => (order.get(a) ?? last) - (order.get(b) ?? last) || cmp(a, b));
      for (const id of row) {
        const p = placed.get(id)!;
        out.set(id, { ...p, x });
        x += p.w + GAP;
      }
    }
  }
  return out;
}

// centred moves each row of siblings sideways so that its middle is the
// middle of all the siblings (11): ranks read as a stack, not a staircase. A
// row keeps its order and spacing, and never leaves its container, which is
// at least as wide as its widest row. Lines follow, as in inOrder.
export function centred(placed: Map<string, Placed>): Map<string, Placed> {
  const out = new Map(placed);
  for (const ids of siblings(placed).values()) {
    const at = ids.map((id) => placed.get(id)!);
    const mid = (Math.min(...at.map((p) => p.x)) + Math.max(...at.map((p) => p.x + p.w))) / 2;
    for (const row of rowsOf(ids, placed)) {
      const ps = row.map((id) => placed.get(id)!);
      const dx = mid - (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x + p.w))) / 2;
      for (const id of row) out.set(id, { ...placed.get(id)!, x: placed.get(id)!.x + dx });
    }
  }
  return out;
}

// siblings groups placed ids by their container ("" at the top).
function siblings(placed: ReadonlyMap<string, Placed>): Map<string, string[]> {
  const byParent = new Map<string, string[]>();
  for (const [id, p] of placed) {
    const l = byParent.get(p.parent ?? "");
    if (l) l.push(id);
    else byParent.set(p.parent ?? "", [id]);
  }
  return byParent;
}

// rowsOf splits siblings into rows, top to bottom: siblings whose vertical
// extents overlap share an ELK layer.
function rowsOf(ids: string[], placed: ReadonlyMap<string, Placed>): string[][] {
  const sorted = [...ids].sort((a, b) => placed.get(a)!.y - placed.get(b)!.y || cmp(a, b));
  const rows: string[][] = [];
  let bottom = -Infinity;
  for (const id of sorted) {
    const p = placed.get(id)!;
    if (rows.length && p.y < bottom) {
      rows[rows.length - 1].push(id);
      bottom = Math.max(bottom, p.y + p.h);
    } else {
      rows.push([id]);
      bottom = p.y + p.h;
    }
  }
  return rows;
}

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
