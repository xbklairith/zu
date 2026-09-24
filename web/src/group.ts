// Grouping (12): the first view sets aside what a reader does not start from.
// Two kinds of group leaf stand for boxes of one sibling set:
//  - the strip ("<parent>#demoted"): the boxes internal/export demoted
//    (policy.Demoted: tests, tools and samples by name, and generated code),
//    drawn at the bottom of their set;
//  - a fold chip ("<parent>#fold:<tier>"): the boxes of one row the budget
//    left out.
// Toggling a group's id (U2's t) opens it in place. The model never authors
// the graph: a group only stands for boxes the cut drew, and the lines to and
// from them attach to it (cut.ts leafOf, Cut.alias).
import { childrenOf, cmp, index, isBox, PKG, type Cut } from "./cut";
import type { View } from "./data";

export const STRIP = "#demoted";
export const FOLD = "#fold:";

const FOLD_ID = /#fold:-?\d+$/;
export const isStrip = (id: string) => id.endsWith(STRIP);
export const isFold = (id: string) => FOLD_ID.test(id);
export const isGroup = (id: string) => isStrip(id) || isFold(id);
// groupParent is the box whose children a group stands for ("" at the top).
export const groupParent = (id: string) => id.slice(0, id.lastIndexOf("#"));
// knownGroup: a group id a hash may toggle, over a box of this View.
export const knownGroup = (view: View, id: string) => {
  if (!isGroup(id)) return false;
  const p = groupParent(id);
  return p === "" || (isBox(view, p) && childrenOf(view, p.endsWith(PKG) ? p.slice(0, -PKG.length) : p).length > 0);
};

// Rollup is what a box holds, summed once per View (like tree.ts boxStats):
// every grouping question reads it in O(1), never walking the packages again.
type Rollup = { pkgs: number; name: number; generated: number };
const rollups = new WeakMap<View, Map<string, Rollup>>();

// rollup counts, per box (and "X#pkg"), its packages and the demoted ones. A
// changed package (a Change View status) is never demoted: a changed box
// always shows.
function rollup(view: View): Map<string, Rollup> {
  const hit = rollups.get(view);
  if (hit) return hit;
  const ix = index(view);
  const out = new Map<string, Rollup>();
  const add = (b: string, kind: string | undefined) => {
    const t = out.get(b) ?? { pkgs: 0, name: 0, generated: 0 };
    t.pkgs++;
    if (kind === "name") t.name++;
    else if (kind === "generated") t.generated++;
    out.set(b, t);
  };
  for (const p of ix.pkgs) {
    const kind = p.status ? undefined : p.demoted;
    add(p.id + PKG, kind);
    for (let b = p.id; b !== ""; b = ix.parent.get(b) ?? "") add(b, kind);
  }
  rollups.set(view, out);
  return out;
}

// demotedBox: a box is demoted when every package in it is; "name" when any
// of them is demoted by name, else "generated".
export function demotedBox(view: View, box: string): "name" | "generated" | undefined {
  const t = rollup(view).get(box);
  if (!t || t.name + t.generated < t.pkgs) return undefined;
  return t.name > 0 ? "name" : "generated";
}

export type Grouped = {
  cut: Cut;
  groups: Map<string, string[]>; // group leaf → the boxes it stands for, sorted
  opened: Set<string>; // demoted boxes drawn because their strip is toggled open
  strips: Set<string>; // every strip drawn, closed or open
  at: Map<string, string>; // group leaf → its container in the cut ("" at the top)
};

// strip replaces, in each sibling set of c, the demoted boxes with one strip,
// unless the strip is toggled open or every box of the set is demoted (the
// reader went inside them). Sets are visited from the top, so a demoted
// container takes what it holds with it.
export function strip(view: View, c: Cut, toggled: readonly string[]): Grouped {
  const none: Grouped = { cut: c, groups: new Map(), opened: new Set(), strips: new Set(), at: new Map() };
  if (c.decls) return none;
  const kids = new Map<string, string[]>();
  for (const id of [...c.leaves, ...c.containers]) {
    const p = c.parent.get(id) ?? "";
    kids.set(p, [...(kids.get(p) ?? []), id]);
  }
  const level = (id: string) => {
    let d = 0;
    for (let x = id; x !== ""; x = c.parent.get(x) ?? "") d++;
    return d;
  };
  const flip = new Set(toggled);
  const gone = new Set<string>(); // replaced, with everything under it
  const alias = new Map(c.alias ?? []);
  const out: Grouped = { ...none, groups: new Map(), at: new Map() };
  for (const p of [...kids.keys()].sort((a, b) => level(a) - level(b) || cmp(a, b))) {
    if (p !== "" && gone.has(p)) {
      for (const k of kids.get(p)!) gone.add(k);
      continue;
    }
    const set = kids.get(p)!.sort(cmp);
    const low = set.filter((k) => demotedBox(view, k) !== undefined);
    if (low.length === 0 || low.length === set.length) continue;
    // A group is named after the box whose children it holds: the focus at the top.
    const id = (p === "" ? c.focus : p) + STRIP;
    out.strips.add(id);
    out.at.set(id, p);
    if (flip.has(id)) {
      for (const k of low) out.opened.add(k);
      continue;
    }
    for (const k of low) {
      gone.add(k);
      alias.set(k, id);
    }
    out.groups.set(id, low);
  }
  if (out.strips.size === 0) return none;
  const parent = new Map(c.parent);
  for (const g of gone) parent.delete(g);
  const strips = [...out.strips];
  for (const s of strips) parent.set(s, out.at.get(s)!);
  return {
    ...out,
    cut: {
      ...c,
      leaves: [...c.leaves.filter((l) => !gone.has(l)), ...strips].sort(cmp),
      containers: c.containers.filter((x) => !gone.has(x)),
      parent,
      alias,
    },
  };
}

// stripText is a strip's one line and its tooltip: how many packages it sets
// aside, of which kind, and how many drawn boxes import into it (gap G4: a
// demoted box can matter, and the count says so without drawing it). The
// tooltip gives the kinds apart, only when there are two.
export function stripText(view: View, members: readonly string[], usedBy: number): { label: string; hint?: string } {
  let name = 0;
  let generated = 0;
  for (const m of members) {
    const t = rollup(view).get(m);
    name += t?.name ?? 0;
    generated += t?.generated ?? 0;
  }
  const n = name + generated;
  const kind = generated === 0 ? "tests & tools" : name === 0 ? "generated" : "tests, tools & generated";
  const label = `${n} ${kind} · used by ${usedBy}`;
  return name > 0 && generated > 0 ? { label, hint: `${name} tests & tools · ${generated} generated` } : { label };
}
