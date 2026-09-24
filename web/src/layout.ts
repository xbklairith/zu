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

// ADVANCE is the width in px of each glyph from " " to "~", then "·", in the
// label font (.node .label: 600 12px system-ui), measured with canvas
// measureText in chromium, firefox and webkit on macOS (they agree to 0.01
// px) and rounded up. Stats lines are 400 11px, narrower glyph for glyph.
const ADVANCE = [
  3.2, 4.1, 6.5, 8, 8, 12, 8.9, 4, 5, 5, 5.8, 8, 4, 5.8, 4, 4, 8, 6, 7.6, 7.9, 8.1, 7.8, 8.1, 7.2, 8.2, 8.1, 4, 4, 8, 8, 8, 6.6,
  11.1, 8.6, 8.2, 8.9, 8.9, 7.4, 7.1, 9.1, 9.3, 3.7, 7, 8.4, 7.1, 10.8, 9.2, 9.4, 8, 9.4, 8.2, 8, 7.9, 9.1, 8.5, 12, 8.6, 8.3, 8.1,
  5, 4, 5, 8, 7.4, 6, 7, 7.7, 7, 7.7, 7.1, 4.8, 7.6, 7.5, 3.3, 3.3, 7, 3.4, 11, 7.4, 7.4, 7.7, 7.7, 5.1, 6.7, 4.8, 7.4, 6.9, 9.9,
  6.8, 7, 6.7, 5, 3.5, 5, 8, 4,
];
const WIDEST = 12; // "W", and any glyph not in ADVANCE
const MONO = 7; // a method row's glyph: .row is 11px ui-monospace, 6.6 px in Menlo

// textWidth is how wide s draws in the label font.
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w += c >= 32 && c < 127 ? ADVANCE[c - 32] : ch === "·" ? ADVANCE[95] : WIDEST;
  }
  return w;
}

// INSET is what a node's border box adds to its text: .node's padding, 8 px
// each side, and its 1 px border.
export const INSET = 18;

// sizeOf sizes a node to its text (11): the label, plus the rank badge's
// padding (.node.ranked .label) and the toggle's corner on the label's line;
// a box's stats line; a type's method rows. Nothing is capped, so no text is
// clipped: a long name makes a wide box.
export function sizeOf(n: SceneNode): { w: number; h: number } {
  const label = textWidth(n.label) + (n.rank !== undefined ? 18 : 0) + (n.toggle ? 22 : 0);
  const text = Math.max(label, textWidth(n.stats ?? ""), ...n.methods.map((r) => (r.length + 2) * MONO));
  return { w: Math.max(90, Math.ceil(text + INSET)), h: 40 + ROW * n.methods.length };
}

// containerWidth is the least a container is drawn: its label, its rank
// badge, and its header's right end, where the toggle sits, or the CRAP badge
// beside it (.node.container[class*="crap-"] .label).
export const containerWidth = (n: SceneNode): number =>
  Math.ceil(textWidth(n.label) + INSET + (n.rank !== undefined ? 18 : 0) + (n.crap ? 72 : 22));

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
  // them within the widest; packed then puts each over the middle.
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
  // 12: a merged row wraps by own tier, the higher first, as byOwnTier places it.
  for (const l of byParent.values()) l.sort((a, b) => (a.order ?? last) - (b.order ?? last) || (b.ownTier ?? 0) - (a.ownTier ?? 0));
  const rank = sc.nodes.some((n) => n.rank !== undefined || n.tier !== undefined) ? ranked(byParent) : null;
  const build = (n: SceneNode): ElkNode => {
    if (n.shape !== "container") {
      const { w, h } = sizeOf(n);
      return { id: n.id, width: w, height: h };
    }
    return {
      id: n.id,
      // No minimum size: packed widens a container to its header (11).
      layoutOptions: { "elk.padding": "[top=24,left=12,bottom=12,right=12]" },
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

// WRAP is the most siblings of one rank drawn side by side (11), and ROW_MAX
// the widest such a row may be, in layout px. A wider rank, such as a flat
// internal/ of leaves that all land in rank 0, wraps into rows, in the
// siblings' order, each row below the last. At the first view's zoom (FLOOR,
// viewport.ts) ROW_MAX is 1173 screen px, so the top rows show whole on a
// canvas 1221 px wide. The layout never reads the canvas: resizing the window
// moves no box.
export const WRAP = 10;
export const ROW_MAX = 1280;
// WRAP_GAP is the space between the rows one rank wraps into, a quarter of
// the 24 between two ranks, so a wrapped rank reads as one (packed).
export const WRAP_GAP = 6;
const PAD_X = 24; // a container's elk.padding, left and right

// ranked puts siblings with a higher rank above those with a lower one, in
// every container. A sibling set in which any node has a Policy rank uses
// the Policy's ranks, unranked nodes counting as level 0, as in uml-viewer
// (layout.clj place-classes, l.293); any other set uses the architecture
// ranks scene computed (rank.ts, 11). ELK's own partitioning orders a flat
// graph but is ignored inside compound nodes with INCLUDE_CHILDREN, which zu
// needs (measured in elkjs 0.12), so between each two rows ranked adds an
// invisible zero-size step node, with an edge from every node of the upper
// row to it and from it to every node of the lower: O(n) edges, and the only
// edges ELK sees. A row is a rank, or as much of a wider one as WRAP and
// ROW_MAX allow; a container counts as wide as its own widest row.
// levelIn is the level ranked places each of one set of siblings at.
const levelIn = (kids: readonly SceneNode[]) => {
  const policy = kids.some((k) => k.rank !== undefined);
  // 12: groups sit below every row (tier -1), Levels or not.
  return (n: SceneNode) => (n.tier !== undefined && n.tier < 0 ? n.tier : (policy ? n.rank : n.tier) ?? 0);
};

// levelsOf is every node's level among its siblings, for packed: rows of one
// level are one rank's wrap. Empty when the scene is not ranked.
export function levelsOf(sc: Scene): Map<string, number> {
  if (!sc.nodes.some((n) => n.rank !== undefined || n.tier !== undefined)) return new Map();
  const byParent = new Map<string, SceneNode[]>();
  for (const n of sc.nodes) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  const out = new Map<string, number>();
  for (const kids of byParent.values()) {
    const level = levelIn(kids);
    for (const k of kids) out.set(k.id, level(k));
  }
  return out;
}

function ranked(byParent: ReadonlyMap<string, SceneNode[]>) {
  const steps = new Map<string, ElkNode[]>();
  const edges: { id: string; sources: string[]; targets: string[] }[] = [];
  const rowsOf = new Map<string, { name: string; nodes: SceneNode[] }[]>();
  const wide = new Map<string, number>();
  const widthOf = (n: SceneNode): number => {
    if (n.shape !== "container") return sizeOf(n).w;
    let w = wide.get(n.id);
    if (w === undefined) {
      const rows = rowsFor(n.id);
      w = Math.max(containerWidth(n), ...rows.map((r) => span(r.nodes) + PAD_X));
      wide.set(n.id, w);
    }
    return w;
  };
  const span = (ns: readonly SceneNode[]) => ns.reduce((w, k) => w + widthOf(k), 0) + GAP * Math.max(0, ns.length - 1);
  const rowsFor = (parent: string) => {
    const hit = rowsOf.get(parent);
    if (hit) return hit;
    const kids = byParent.get(parent) ?? [];
    const level = levelIn(kids);
    const levels = [...new Set(kids.map(level))].sort((a, b) => b - a);
    const rows: { name: string; nodes: SceneNode[] }[] = [];
    for (const l of levels) {
      let row: SceneNode[] = [];
      let part = 0;
      const close = () => {
        rows.push({ name: part === 0 ? `${l}` : `${l}.${part}`, nodes: row });
        part++;
        row = [];
      };
      for (const k of kids.filter((x) => level(x) === l)) {
        if (row.length > 0 && (row.length === WRAP || span([...row, k]) > ROW_MAX)) close();
        row.push(k);
      }
      close();
    }
    rowsOf.set(parent, rows);
    return rows;
  };
  for (const [parent, kids] of byParent) {
    const rows = rowsFor(parent);
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

// arrange turns ELK's result into what the canvas draws: flattened, in the
// Policy's order, packed. The page (App) and layout both use it.
export const arrange = (
  out: ElkNode, order: ReadonlyMap<string, number>, header: ReadonlyMap<string, number>, levels: ReadonlyMap<string, number> = new Map(),
  ownTiers: ReadonlyMap<string, number> = new Map(),
) => packed(byOwnTier(inOrder(positions(out), order), ownTiers), header, levels);

export const layout = async (sc: Scene, engine: Engine) =>
  arrange(await engine.layout(elkGraph(sc)), orderOf(sc), headers(sc), levelsOf(sc), ownTiersOf(sc));

// ownTiersOf is each node's rank before the row cap merged its row (12).
export const ownTiersOf = (sc: Scene): ReadonlyMap<string, number> =>
  new Map(sc.nodes.flatMap((n) => (n.ownTier === undefined ? [] : [[n.id, n.ownTier] as const])));

// byOwnTier re-places each row of siblings that holds nodes of more than one
// own tier (12, a merged row), as inOrder does: the higher own tier first, so the row
// still reads down from left to right, and ELK's order inside one own tier.
export function byOwnTier(placed: Map<string, Placed>, ownTiers: ReadonlyMap<string, number>): Map<string, Placed> {
  if (ownTiers.size === 0) return placed;
  const out = new Map(placed);
  for (const ids of siblings(placed).values()) {
    for (const row of rowsOf(ids, placed)) {
      if (new Set(row.map((id) => ownTiers.get(id))).size < 2) continue;
      let x = Math.min(...row.map((id) => placed.get(id)!.x));
      row.sort((a, b) => (ownTiers.get(b) ?? -1) - (ownTiers.get(a) ?? -1) || placed.get(a)!.x - placed.get(b)!.x || cmp(a, b));
      for (const id of row) {
        const p = placed.get(id)!;
        out.set(id, { ...p, x });
        x += p.w + GAP;
      }
    }
  }
  return out;
}

// headers is the least width of each container: its label and badges. ELK
// never sees it, so a page keys its layout on it as well as on elkGraph.
export const headers = (sc: Scene): Map<string, number> =>
  new Map(sc.nodes.filter((n) => n.shape === "container").map((n) => [n.id, containerWidth(n)]));

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

// packed lays each row of siblings side by side, GAP apart and in the order
// ELK and inOrder gave them, then centres every row in its container (11):
// ranks read as a stack, not a staircase. A container is as wide as its widest
// row, or as its own header needs (containerWidth), whichever is more; the
// deepest are sized first, so a parent packs its children at their final
// widths. ELK's minimum size for a compound node was not met in width with
// INCLUDE_CHILDREN, and stretched the node's height instead, so the header's
// width is applied here. Rows keep ELK's order and the gap ELK left between
// two ranks, but the rows one rank wraps into (levels: the same level) close
// up to WRAP_GAP, and a container shrinks by what its rows gave up. Lines
// follow, as in inOrder.
export function packed(
  placed: Map<string, Placed>, header: ReadonlyMap<string, number>, levels: ReadonlyMap<string, number> = new Map(),
): Map<string, Placed> {
  const out = new Map(placed);
  const kids = siblings(placed);
  const depth = (id: string) => {
    let d = 0;
    for (let p = placed.get(id)?.parent; p !== undefined; p = placed.get(p)?.parent) d++;
    return d;
  };
  const order = [...kids.keys()].filter((p) => p !== "").sort((a, b) => depth(b) - depth(a) || cmp(a, b));
  const lay = (ids: string[], left: number, least: number) => {
    const rows = rowsOf(ids, out).map((r) => r.sort((a, b) => out.get(a)!.x - out.get(b)!.x || cmp(a, b)));
    const span = (r: string[]) => r.reduce((w, id) => w + out.get(id)!.w, 0) + GAP * (r.length - 1);
    const inner = Math.max(least, ...rows.map(span));
    for (const r of rows) {
      let x = left + (inner - span(r)) / 2;
      for (const id of r) {
        out.set(id, { ...out.get(id)!, x });
        x += out.get(id)!.w + GAP;
      }
    }
    return inner;
  };
  // stack re-places rows top to bottom and returns how much lower (or, < 0,
  // higher) the last row's bottom ends than ELK put it.
  const stack = (ids: string[]) => {
    const rows = rowsOf(ids, placed);
    const top = (r: string[]) => Math.min(...r.map((id) => placed.get(id)!.y));
    const bottom = (r: string[], m: ReadonlyMap<string, Placed>) => Math.max(...r.map((id) => m.get(id)!.y + m.get(id)!.h));
    const wrap = (a: string[], b: string[]) => levels.has(a[0]) && levels.get(a[0]) === levels.get(b[0]);
    for (let k = 1; k < rows.length; k++) {
      const gap = wrap(rows[k - 1], rows[k]) ? WRAP_GAP : top(rows[k]) - bottom(rows[k - 1], placed);
      const shift = bottom(rows[k - 1], out) + gap - top(rows[k]);
      for (const id of rows[k]) out.set(id, { ...out.get(id)!, y: placed.get(id)!.y + shift });
    }
    return rows.length ? bottom(rows[rows.length - 1], out) - bottom(rows[rows.length - 1], placed) : 0;
  };
  for (const c of order) {
    const inner = lay(kids.get(c)!, PAD_X / 2, (header.get(c) ?? 0) - PAD_X);
    const grown = stack(kids.get(c)!);
    out.set(c, { ...out.get(c)!, w: inner + PAD_X, h: placed.get(c)!.h + grown });
  }
  const top = kids.get("") ?? [];
  if (top.length) {
    lay(top, Math.min(...top.map((id) => placed.get(id)!.x)), 0);
    stack(top);
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
