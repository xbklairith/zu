// 04's Package Tree API, now a thin layer over cut.ts and bundle.ts (feature
// 05): one tree algorithm, still guarded by 04's tests and the 04 snapshot.
import type { View } from "./data";
import { autoDepth, BOX_BUDGET, childrenOf, cut, index, OUTSIDE, packagesIn, parentBox, within } from "./cut";
import { bundlesOver, EXTERNAL_BUDGET, EXTERNALS, externalsOf } from "./bundle";

export { autoDepth, BOX_BUDGET, EXTERNAL_BUDGET, EXTERNALS, OUTSIDE, packagesIn, parentBox };

// boxesOf is kept for 04's layout.ts until Task 7 replaces it.
export const boxesOf = (view: View) => ({
  byId: index(view).node,
  boxes: new Map([...index(view).parent.keys()].map((id) => [id, { children: childrenOf(view, id).length > 0 }])),
});

export function leavesAt(view: View, focus: string, d: number): string[] {
  const c = cut(view, focus, d);
  return c.noDetail ? [] : c.leaves;
}

export function containers(view: View, focus: string, d: number): { id: string; parent: string }[] {
  const c = cut(view, focus, d);
  return c.containers.map((id) => ({ id, parent: c.parent.get(id) ?? "" }));
}

// placeOf is the container a drawn item sits in under focus ("" = the canvas).
export function placeOf(view: View, focus: string, id: string): string {
  if (cut(view, focus, 1).decls || id === OUTSIDE || id === EXTERNALS) return "";
  const p = parentBox(view, id);
  return p === "" || p === focus || !within(view, p, focus) ? "" : p;
}

// declLeaves are a package's types and functions; methods are rows of their type.
export function declLeaves(view: View, pkg: string): string[] {
  return view.nodes
    .filter((n) => (n.kind === "type" || n.kind === "function") && n.parent === pkg)
    .map((n) => n.id)
    .sort();
}

export function methodsOf(view: View, type: string): string[] {
  return view.nodes.filter((n) => n.kind === "function" && n.parent === type).map((n) => n.id).sort();
}

export type Bundle = { from: string; to: string; pairs: number; status?: string };

export const bundles = (view: View, focus: string, d: number): Bundle[] =>
  bundlesOver(view, cut(view, focus, d)).map(({ from, to, pairs, status }) => ({ from, to, pairs, ...(status ? { status } : {}) }));

export const touchedExternals = (view: View, focus: string, d: number): string[] =>
  externalsOf(view, bundlesOver(view, cut(view, focus, d)));

// boxStats sums the packages a box holds; a #pkg leaf holds only its package.
export function boxStats(view: View, box: string): { packages: number; decls: number; unresolved: number } {
  const s = { packages: 0, decls: 0, unresolved: 0 };
  for (const p of packagesIn(view, box)) {
    s.packages++;
    s.decls += p.decls ?? 0;
    s.unresolved += p.unresolved ?? 0;
  }
  return s;
}
