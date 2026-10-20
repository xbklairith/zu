// 18: the walk through a change, n and p, in the decided reading order
// (decisions.md, Change reading order): each new violation's importers, then
// the changed packages bottom-up (view.changed, the Structural Summary's
// order), each followed by the Centres of its changed declarations, by id.
// Each step re-centres the Screen; the hash keeps only the Centre.
import type { View, Violation } from "./data";
import { cmp, index, packageOf } from "./cut";
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
  for (const x of view.violations?.new ?? []) for (const [from] of breaking(view, x)) visit(from);
  for (const pkg of view.changed ?? []) visit(pkg);
  walks.set(view, out);
  return out;
}

// boxes is the chain of Package Tree boxes from a package's module root down
// to the package itself, as policy/cycles.go's boxes.
function boxes(id: string, module: string): string[] {
  const chain = [module];
  for (let i = module.length + 1; id !== module && i <= id.length; i++) {
    if (i === id.length || id[i] === "/") chain.push(id.slice(0, i));
  }
  return chain;
}

// breaking is the head imports that break x, as [importer, imported]
// packages, sorted: a Levels violation's own; a cycle names Package Tree
// boxes (06), so each import whose arc policy/cycles.go's lift makes x's.
export function breaking(view: View, x: Violation): [string, string][] {
  if (x.rule !== "cycle") return [[x.from, x.to]];
  const nodes = index(view).node;
  const module = (id: string) => {
    const n = nodes.get(id);
    return n?.kind === "package" ? n.module : undefined;
  };
  const out: [string, string][] = [];
  for (const e of view.edges) {
    const [mf, mt] = [module(e.from), module(e.to)];
    if (e.kind !== "imports" || e.status === "removed" || e.from === e.to || !mf || !mt) continue;
    const [cf, ct] = [boxes(e.from, mf), boxes(e.to, mt)];
    let k = 0;
    while (k < cf.length && k < ct.length && cf[k] === ct[k]) k++;
    const arc = mf !== mt ? [mf, mt] : [cf[Math.min(k, cf.length - 1)], ct[Math.min(k, ct.length - 1)]];
    if (arc[0] === x.from && arc[1] === x.to) out.push([e.from, e.to]);
  }
  return out.sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
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
