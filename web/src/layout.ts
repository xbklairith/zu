// What one focus draws (scene) and where (layout). ELK runs on the main thread
// (plan Deviation 5); every input is sorted and sizes come from label lengths,
// never from the DOM, so the same View always lays out the same way.
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { nodeMark, unchangedCount } from "./change";
import type { View } from "./data";
import {
  EXTERNALS,
  OUTSIDE,
  boxesOf,
  bundles,
  containers,
  declLeaves,
  leavesAt,
  methodsOf,
  packagesIn,
  placeOf,
  touchedExternals,
  type Bundle,
} from "./tree";

export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
// mark is the Change View class (change.ts); rowMarks parallel rows.
export type Item = {
  id: string; label: string; parent?: string; shape: Shape; rows?: string[]; mark?: string; rowMarks?: string[];
};
export type Placed = { x: number; y: number; w: number; h: number; parent?: string };
export type Scene = { items: Item[]; edges: Bundle[] };

const PKG = "#pkg";

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function lastSegment(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

// scene lists what focus draws at depth d: containers, leaves, and the
// endpoints bundles reach outside them (externals, "outside").
export function scene(view: View, focus: string, d: number): Scene {
  const idx = boxesOf(view);
  const items: Item[] = [];
  const parentOf = (id: string) => placeOf(view, focus, id) || undefined;
  const label = (id: string, parent?: string) => {
    const base = parent ?? (focus.endsWith(PKG) ? "" : focus);
    return base === "" ? id : id.startsWith(base + "/") ? id.slice(base.length + 1) : id;
  };
  for (const c of containers(view, focus, d)) {
    const parent = c.parent || undefined;
    items.push({ id: c.id, label: label(c.id, parent), parent, shape: "container" });
  }
  const leaves = leavesAt(view, focus, d);
  for (const id of leaves) {
    const n = idx.byId.get(id);
    if (id.endsWith(PKG)) {
      const pkg = id.slice(0, -PKG.length);
      const parent = pkg === focus ? undefined : pkg;
      items.push({ id, label: `${lastSegment(pkg)} (package)`, parent, shape: "box" });
    } else if (n && (n.kind === "type" || n.kind === "function")) {
      items.push(declItem(view, id));
    } else {
      const parent = parentOf(id);
      items.push({ id, label: label(id, parent), parent, shape: "box" });
    }
  }
  if (view.kind === "change") markChanges(view, focus, items);
  const edges = bundles(view, focus, d);
  const drawn = new Set(items.map((i) => i.id));
  const extCount = touchedExternals(view, focus, d).length;
  for (const e of edges) {
    for (const id of [e.from, e.to]) {
      if (drawn.has(id)) continue;
      drawn.add(id);
      if (id === OUTSIDE) items.push({ id, label: "outside", shape: "outside" });
      else if (id === EXTERNALS) items.push({ id, label: `${extCount} external modules`, shape: "oval" });
      else items.push({ id, label: id, shape: "oval" });
    }
  }
  items.sort((a, b) => cmp(a.id, b.id));
  return { items, edges };
}

function declItem(view: View, id: string, parent?: string): Item {
  const n = boxesOf(view).byId.get(id)!;
  const methods = n.kind === "type" ? methodsOf(view, id) : [];
  const item: Item = { id, label: id.slice((n.parent ?? "").length + 1), shape: "decl", ...(parent ? { parent } : {}) };
  if (methods.length) item.rows = methods.map((m) => m.slice(id.length + 1));
  if (view.kind === "change") {
    item.mark = nodeMark(n);
    if (methods.length) item.rowMarks = methods.map((m) => nodeMark(boxesOf(view).byId.get(m)!));
  }
  return item;
}

// markChanges gives each drawn item its Change View mark and opens every
// changed package drawn as a box onto its changed declarations, with a chip
// counting the ones left out (Q4). A box that folds changed packages into it
// is marked "has-change", or, when it opens, gets a chip counting them.
function markChanges(view: View, focus: string, items: Item[]) {
  const idx = boxesOf(view);
  if (focus !== "" && (focus.endsWith(PKG) || idx.byId.get(focus)?.kind === "package") && !idx.boxes.get(focus)?.children) {
    return; // a declaration view: declItem already marked them
  }
  for (const it of [...items]) {
    if (it.shape !== "box") continue;
    const pkg = it.id.endsWith(PKG) ? it.id.slice(0, -PKG.length) : it.id;
    const n = idx.byId.get(pkg);
    if (!n || n.kind !== "package") {
      if (packagesIn(view, it.id).some((p) => p.status)) it.mark = "has-change";
      continue;
    }
    it.mark = nodeMark(n);
    // A package box drawn at the leaf depth folds its subpackages into it.
    const folded = it.id.endsWith(PKG) ? 0 : packagesIn(view, it.id).filter((p) => p.id !== pkg && p.status).length;
    const decls = n.detail ? declLeaves(view, pkg) : [];
    if (decls.length === 0) {
      if (folded > 0) it.mark = `${it.mark} has-change`.trim();
      continue;
    }
    it.shape = "container";
    for (const id of decls) items.push(declItem(view, id, it.id));
    const more = unchangedCount(view, pkg);
    if (more > 0) items.push({ id: `${it.id}#unchanged`, label: `+${more} unchanged`, parent: it.id, shape: "chip" });
    if (folded > 0) {
      const label = `+${folded} changed package${folded > 1 ? "s" : ""}`;
      items.push({ id: `${it.id}#folded`, label, parent: it.id, shape: "chip" });
    }
  }
}

// sizeOf estimates a leaf's size from its text: the label, method rows, and
// for boxes the stats line ("15 decls · 4 unresolved").
export function sizeOf(item: Item): { w: number; h: number } {
  const stats = item.shape === "box" ? 24 : 0;
  const text = Math.max(item.label.length, stats, ...(item.rows ?? []).map((r) => r.length + 2));
  const w = Math.min(280, Math.max(90, text * 7.5 + 24));
  return { w, h: 40 + 18 * (item.rows?.length ?? 0) };
}

const elk = new ELK();

const rootOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.randomSeed": "1",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
};

// layout places every item; positions are relative to the item's parent, as
// React Flow's parentId expects.
export async function layout(items: Item[], edges: Bundle[]): Promise<Map<string, Placed>> {
  const sorted = [...items].sort((a, b) => cmp(a.id, b.id));
  const nodes = new Map<string, ElkNode>();
  for (const it of sorted) {
    const n: ElkNode = { id: it.id, children: [] };
    if (it.shape === "container") {
      // Wide enough for the label, which sits in the top padding.
      n.layoutOptions = {
        "elk.padding": "[top=24,left=12,bottom=12,right=12]",
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": `(${Math.min(280, it.label.length * 7.5 + 24)}, 40)`,
      };
    } else {
      const { w, h } = sizeOf(it);
      n.width = w;
      n.height = h;
    }
    nodes.set(it.id, n);
  }
  const root: ElkNode = { id: "__root", layoutOptions: rootOptions, children: [], edges: [] };
  for (const it of sorted) {
    const parent = it.parent && nodes.has(it.parent) ? nodes.get(it.parent)! : root;
    parent.children!.push(nodes.get(it.id)!);
  }
  root.edges = [...edges]
    .filter((e) => nodes.has(e.from) && nodes.has(e.to))
    .sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to))
    .map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] }));
  const out = await elk.layout(root);
  const placed = new Map<string, Placed>();
  const walk = (n: ElkNode, parent?: string) => {
    for (const c of n.children ?? []) {
      placed.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0, ...(parent ? { parent } : {}) });
      walk(c, c.id);
    }
  };
  walk(out);
  return placed;
}
