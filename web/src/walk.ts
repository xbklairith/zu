// 18: the walk through a change, n and p, in the decided reading order
// (decisions.md, Change reading order): each new violation's importer, then
// the changed packages bottom-up (view.changed, the Structural Summary's
// order), each followed by the Centres of its changed declarations, by id.
// Each step re-centres the Screen; the hash keeps only the Centre.
import type { View } from "./data";
import { cmp, packageOf } from "./cut";
import { centreOf, screenView } from "./screen";
import { centreAt, type ViewState } from "./state";

const walks = new WeakMap<View, string[]>();

// walkOf is the walk's Centres, each once: empty in a Project View.
export function walkOf(view: View): string[] {
  const hit = walks.get(view);
  if (hit) return hit;
  const inside = new Map<string, Set<string>>(); // a package's changed declarations' Centres
  for (const n of view.nodes) {
    const pkg = (n.kind === "type" || n.kind === "function") && (n.status || n.movedFrom) ? packageOf(view, n.id) : undefined;
    const c = centreOf(view, n.id);
    if (pkg !== undefined && c !== null) inside.set(pkg, (inside.get(pkg) ?? new Set()).add(c));
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (pkg: string) => {
    if (seen.has(pkg) || centreOf(view, pkg) !== pkg) return;
    for (const id of [pkg, ...[...(inside.get(pkg) ?? [])].sort(cmp)]) {
      if (!seen.has(id)) out.push(id);
      seen.add(id);
    }
  };
  for (const x of view.violations?.new ?? []) visit(x.from);
  for (const pkg of view.changed ?? []) visit(pkg);
  walks.set(view, out);
  return out;
}

// placeOf is a Centre's place on the walk: its index; for a Centre off the
// walk, just after its package's, so n goes on into that package; or just
// before the walk (the tree, or a package the walk does not visit).
function placeOf(view: View, walk: string[], centre: string | null): number {
  if (centre === null) return -0.5;
  const i = walk.indexOf(centre);
  return i >= 0 ? i : walk.indexOf(packageOf(screenView(view), centre) ?? centre) + 0.5;
}

// step is s one step along the walk, forward (n) or back (p): from the tree,
// n starts it. Past either end s is returned as it is.
export function step(view: View, s: ViewState, dir: 1 | -1): ViewState {
  const walk = walkOf(view);
  const at = placeOf(view, walk, s.centre);
  const to = dir > 0 ? Math.floor(at) + 1 : Math.ceil(at) - 1;
  return to >= 0 && to < walk.length ? centreAt(s, walk[to]) : s;
}

// walkAt says which step a Centre is, from 1, or null off the walk.
export function walkAt(view: View, centre: string | null): { at: number | null; of: number } {
  const walk = walkOf(view);
  const i = centre === null ? -1 : walk.indexOf(centre);
  return { at: i >= 0 ? i + 1 : null, of: walk.length };
}
