// The Package Tree (ADR 0008): boxes derived from package ids and their
// modules, drill-in focus, auto-collapse and edge bundling. Pure functions over
// a View, so the canvas stays thin.
import type { View, ViewNode } from "./data";

export const BOX_BUDGET = 60;
export const EXTERNAL_BUDGET = 20;
export const OUTSIDE = "outside";
export const EXTERNALS = "externals";
const PKG = "#pkg";

type Box = { id: string; parent: string; depth: number; pkg: boolean; children: boolean };
type Index = { boxes: Map<string, Box>; pkgs: ViewNode[]; byId: Map<string, ViewNode> };

const cache = new WeakMap<View, Index>();

// boxesOf indexes every box: module roots at depth 1 (parent ""), then one box
// per path segment down to each package. A nested module is a root of its own.
export function boxesOf(view: View): Index {
  const hit = cache.get(view);
  if (hit) return hit;
  const boxes = new Map<string, Box>();
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const pkgs = view.nodes.filter((n) => n.kind === "package").sort((a, b) => cmp(a.id, b.id));
  for (const p of pkgs) {
    const m = p.module ?? p.id;
    if (!boxes.has(m)) boxes.set(m, { id: m, parent: "", depth: 1, pkg: false, children: false });
  }
  for (const p of pkgs) {
    const m = p.module ?? p.id;
    let parent = boxes.get(m)!;
    for (const seg of segments(p.id, m)) {
      const id = `${parent.id}/${seg}`;
      let b = boxes.get(id);
      if (!b) {
        b = { id, parent: parent.id, depth: parent.depth + 1, pkg: false, children: false };
        boxes.set(id, b);
      }
      parent.children = true;
      parent = b;
    }
    parent.pkg = true;
  }
  const idx = { boxes, pkgs, byId };
  cache.set(view, idx);
  return idx;
}

function segments(id: string, module: string): string[] {
  return id === module ? [] : id.slice(module.length + 1).split("/");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function depthOf(idx: Index, box: string): number {
  return box === "" ? 0 : (idx.boxes.get(box)?.depth ?? 0);
}

// chain returns box and its parents up to a module root, nearest first.
function chain(idx: Index, box: string): string[] {
  const out: string[] = [];
  for (let b = idx.boxes.get(box); b; b = idx.boxes.get(b.parent)) out.push(b.id);
  return out;
}

function under(idx: Index, box: string, focus: string): boolean {
  return focus === "" || chain(idx, box).includes(focus);
}

// declPackage: the focus shows a package's declarations, either a leaf package
// or the #pkg leaf of a package that is also a container.
function declPackage(idx: Index, focus: string): string | null {
  if (focus.endsWith(PKG)) return focus.slice(0, -PKG.length);
  const b = idx.boxes.get(focus);
  return b && b.pkg && !b.children ? focus : null;
}

// leafOf maps a package to the box drawn for it at depth d below focus, or
// null when it lies outside the focus or is the focus itself.
function leafOf(idx: Index, pkg: string, focus: string, d: number): string | null {
  if (!under(idx, pkg, focus)) return null;
  const rel = depthOf(idx, pkg) - depthOf(idx, focus);
  if (rel === 0) return idx.boxes.get(pkg)!.children ? pkg + PKG : null;
  if (rel < d) return idx.boxes.get(pkg)!.children ? pkg + PKG : pkg;
  const c = chain(idx, pkg);
  return c[rel - d];
}

// leavesAt lists the boxes drawn at relative depth d under focus, sorted.
export function leavesAt(view: View, focus: string, d: number): string[] {
  const idx = boxesOf(view);
  const pkg = declPackage(idx, focus);
  if (pkg !== null) return idx.byId.get(pkg)?.detail ? declLeaves(view, pkg) : [];
  const out = new Set<string>();
  for (const p of idx.pkgs) {
    const l = leafOf(idx, p.id, focus, d);
    if (l !== null) out.add(l);
  }
  return [...out].sort(cmp);
}

// autoDepth is the deepest level with at most BOX_BUDGET leaves, starting at 1
// and going deeper only while that adds boxes.
export function autoDepth(view: View, focus: string): number {
  let d = 1;
  let n = leavesAt(view, focus, d).length;
  for (;;) {
    const next = leavesAt(view, focus, d + 1).length;
    if (next > BOX_BUDGET || next <= n) return d;
    d++;
    n = next;
  }
}

// parentBox is where Esc goes: the enclosing box, or "" above a module root.
export function parentBox(view: View, box: string): string {
  if (box.endsWith(PKG)) return box.slice(0, -PKG.length);
  return boxesOf(view).boxes.get(box)?.parent ?? "";
}

// containers are the boxes strictly between the focus and the leaves, each
// with the container it sits in ("" = the canvas).
export function containers(view: View, focus: string, d: number): { id: string; parent: string }[] {
  const idx = boxesOf(view);
  const out = new Map<string, string>();
  for (const leaf of leavesAt(view, focus, d)) {
    for (let b = parentBox(view, leaf); b !== "" && b !== focus && under(idx, b, focus); b = parentBox(view, b)) {
      out.set(b, placeOf(view, focus, b));
    }
  }
  return [...out].map(([id, parent]) => ({ id, parent })).sort((a, b) => cmp(a.id, b.id));
}

// placeOf is the container a drawn item sits in under focus ("" = the canvas).
export function placeOf(view: View, focus: string, id: string): string {
  const idx = boxesOf(view);
  if (declPackage(idx, focus) !== null || id === OUTSIDE || id === EXTERNALS) return "";
  const p = parentBox(view, id);
  if (p === "" || p === focus || !under(idx, p, focus)) return "";
  return p;
}

// declLeaves are a package's types and functions; methods are rows of their type.
export function declLeaves(view: View, pkg: string): string[] {
  return view.nodes
    .filter((n) => (n.kind === "type" || n.kind === "function") && n.parent === pkg)
    .map((n) => n.id)
    .sort(cmp);
}

export function methodsOf(view: View, type: string): string[] {
  return view.nodes
    .filter((n) => n.kind === "function" && n.parent === type)
    .map((n) => n.id)
    .sort(cmp);
}

export type Bundle = { from: string; to: string; pairs: number };

// bundles maps edges to drawn leaves and counts distinct node pairs per leaf
// pair. At package level these are imports; in a package's declaration view
// they are calls and embeds between its declarations. Edges with neither end
// inside the focus, and self-loops, are dropped.
export function bundles(view: View, focus: string, d: number): Bundle[] {
  const idx = boxesOf(view);
  const declPkg = declPackage(idx, focus);
  if (declPkg !== null) {
    const leaves = new Set(declLeaves(view, declPkg));
    const declOf = (id: string) => {
      const n = idx.byId.get(id);
      const top = n?.parent && leaves.has(n.parent) ? n.parent : id;
      return leaves.has(top) ? top : null;
    };
    return count(view.edges.filter((e) => e.kind !== "imports"), (e) => [declOf(e.from), declOf(e.to)]);
  }
  const { drawn, end } = packageEnds(view, focus, d);
  return count(drawn, (e) => [end(e.from), end(e.to)]);
}

// packageEnds returns the import edges a package-level focus draws and the
// map from a node id to the drawn leaf it attaches to.
export function packageEnds(view: View, focus: string, d: number) {
  const idx = boxesOf(view);
  const map = (id: string): string | null => {
    const n = idx.byId.get(id);
    if (!n) return null;
    if (n.kind === "external") return id;
    return leafOf(idx, id, focus, d) ?? OUTSIDE;
  };
  const imports = view.edges.filter((e) => e.kind === "imports");
  const drawn = imports.filter((e) => {
    const f = map(e.from);
    const t = map(e.to);
    return f !== null && t !== null && (inside(idx, f) || inside(idx, t));
  });
  const touched = new Set<string>();
  for (const e of drawn) {
    for (const id of [e.from, e.to]) if (idx.byId.get(id)?.kind === "external") touched.add(id);
  }
  const end = (id: string): string | null => {
    const m = map(id);
    return m !== null && touched.has(m) && touched.size > EXTERNAL_BUDGET ? EXTERNALS : m;
  };
  return { drawn, end };
}

function inside(idx: Index, leaf: string): boolean {
  return leaf !== OUTSIDE && leaf !== EXTERNALS && idx.byId.get(leaf)?.kind !== "external";
}

// count groups edges by their drawn ends and counts distinct node pairs.
function count<E extends { from: string; to: string }>(
  edges: E[],
  ends: (e: E) => (string | null)[],
): Bundle[] {
  const pairs = new Map<string, Set<string>>();
  for (const e of edges) {
    const [f, t] = ends(e);
    if (f === null || t === null || f === t) continue;
    const key = `${f}\u0000${t}`;
    if (!pairs.has(key)) pairs.set(key, new Set());
    pairs.get(key)!.add(`${e.from}\u0000${e.to}`);
  }
  return [...pairs]
    .map(([k, s]) => {
      const [from, to] = k.split("\u0000");
      return { from, to, pairs: s.size };
    })
    .sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));
}

// touchedExternals are the external modules the drawn import edges reach,
// whether drawn as ovals or folded into the "externals" aggregate.
export function touchedExternals(view: View, focus: string, d: number): string[] {
  const idx = boxesOf(view);
  const out = new Set<string>();
  for (const e of packageEnds(view, focus, d).drawn) {
    for (const id of [e.from, e.to]) if (idx.byId.get(id)?.kind === "external") out.add(id);
  }
  return [...out].sort(cmp);
}

// boxStats sums the packages a box holds; a #pkg leaf holds only its package.
// packagesIn are the packages a box holds: the #pkg leaf holds only its own
// package, and a nested module root is never inside its parent module's box.
export function packagesIn(view: View, box: string): ViewNode[] {
  const idx = boxesOf(view);
  const own = box.endsWith(PKG) ? box.slice(0, -PKG.length) : null;
  return idx.pkgs.filter((p) => (own !== null ? p.id === own : under(idx, p.id, box)));
}

export function boxStats(view: View, box: string): { packages: number; decls: number; unresolved: number } {
  const s = { packages: 0, decls: 0, unresolved: 0 };
  for (const p of packagesIn(view, box)) {
    s.packages++;
    s.decls += p.decls ?? 0;
    s.unresolved += p.unresolved ?? 0;
  }
  return s;
}
