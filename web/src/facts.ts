// What the side panel lists about a selection: edges grouped by the node at
// the other end, with counts.
import type { View } from "./data";
import { boxesOf, packageEnds, packagesIn } from "./tree";

export type Row = { id: string; count: number };

function group(ids: string[]): Row[] {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function across(view: View, kinds: string[], inside: (id: string) => boolean): { out: Row[]; in: Row[] } {
  const out: string[] = [];
  const inn: string[] = [];
  for (const e of view.edges) {
    if (!kinds.includes(e.kind)) continue;
    const f = inside(e.from);
    const t = inside(e.to);
    if (f && !t) out.push(e.to);
    if (t && !f) inn.push(e.from);
  }
  return { out: group(out), in: group(inn) };
}

// imports lists the packages a box imports from outside it and its importers.
export function imports(view: View, box: string): { out: Row[]; in: Row[] } {
  const pkgs = new Set(packagesIn(view, box).map((p) => p.id));
  if (pkgs.size === 0 && boxesOf(view).byId.get(box)?.kind === "external") pkgs.add(box);
  return across(view, ["imports"], (id) => pkgs.has(id));
}

// calls lists a declaration's calls and embeds; a type's methods count as the type.
export function calls(view: View, decl: string): { out: Row[]; in: Row[] } {
  const byId = boxesOf(view).byId;
  const inside = (id: string) => id === decl || byId.get(id)?.parent === decl;
  return across(view, ["calls", "embeds"], inside);
}

// targets lists the real nodes behind an aggregate ("outside", "externals").
export function targets(view: View, focus: string, d: number, agg: string): Row[] {
  const { drawn, end } = packageEnds(view, focus, d);
  const ids: string[] = [];
  for (const e of drawn) {
    if (end(e.from) === agg) ids.push(e.from);
    if (end(e.to) === agg) ids.push(e.to);
  }
  return group(ids);
}
