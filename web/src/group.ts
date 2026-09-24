// Grouping (12): the first view sets aside what a reader does not start from.
// Two kinds of group leaf stand for boxes of one sibling set:
//  - the strip ("<parent>#demoted"): the boxes internal/export demoted
//    (policy.Demoted: tests, tools and samples by name, and generated code),
//    drawn at the bottom of their set;
//  - a fold chip ("<parent>#more"): the boxes of the set the budget left
//    out, drawn in the bottom row beside the strip.
// Toggling a group's id (U2's t) opens it in place. The model never authors
// the graph: a group only stands for boxes the cut drew, and the lines to and
// from them attach to it (cut.ts leafOf, Cut.alias).
import { childrenOf, cmp, index, isBox, PKG, type Cut } from "./cut";
import type { View } from "./data";

export const STRIP = "#demoted";
export const MORE = "#more";

export const isStrip = (id: string) => id.endsWith(STRIP);
export const isFold = (id: string) => id.endsWith(MORE);
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
// decls and gen count declarations (gen: those in generated files, from the
// IR's per-declaration flag); mains, packages main; changed, any status.
export type Rollup = { pkgs: number; name: number; generated: number; decls: number; gen: number; mains: number; changed: boolean };
const rollups = new WeakMap<View, Map<string, Rollup>>();

// rollup counts, per box (and "X#pkg"), its packages and the demoted ones. A
// changed package (a Change View status) is never demoted: a changed box
// always shows.
function rollup(view: View): Map<string, Rollup> {
  const hit = rollups.get(view);
  if (hit) return hit;
  const ix = index(view);
  const out = new Map<string, Rollup>();
  const add = (b: string, p: (typeof ix.pkgs)[number], kind: string | undefined) => {
    const t = out.get(b) ?? { pkgs: 0, name: 0, generated: 0, decls: 0, gen: 0, mains: 0, changed: false };
    t.pkgs++;
    if (kind === "name") t.name++;
    else if (kind === "generated") t.generated++;
    t.decls += p.decls ?? 0;
    t.gen += p.genDecls ?? 0;
    if (p.main) t.mains++;
    if (p.status) t.changed = true;
    out.set(b, t);
  };
  for (const p of ix.pkgs) {
    const kind = p.status ? undefined : p.demoted;
    add(p.id + PKG, p, kind);
    for (let b = p.id; b !== ""; b = ix.parent.get(b) ?? "") add(b, p, kind);
  }
  rollups.set(view, out);
  return out;
}

// factsOf is a box's Rollup (undefined for a box that holds no package).
export const factsOf = (view: View, box: string): Rollup | undefined => rollup(view).get(box);

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
  folds: Set<string>; // every fold chip drawn, closed or open
  folded: Map<string, string[]>; // fold chip → the boxes it holds, closed or open
};

// strip replaces, in each sibling set of c, the demoted boxes with one strip,
// unless the strip is toggled open or every box of the set is demoted (the
// reader went inside them). Sets are visited from the top, so a demoted
// container takes what it holds with it.
export function strip(view: View, c: Cut, toggled: readonly string[]): Grouped {
  const none: Grouped = { cut: c, groups: new Map(), opened: new Set(), strips: new Set(), at: new Map(), folds: new Set(), folded: new Map() };
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

// BUDGET is how many boxes the first view draws before it folds (R4): under
// Brown's 20 and NDepend's 20 (docx/research/architecture-diagrams.md §5).
export const BUDGET = 15; // the glossary's Budget; cut.ts DEPTH_LEAVES is autoDepth's limit

export type Keep = {
  budget: number;
  arcs: readonly { from: string; to: string }[]; // dependencies between drawn nodes
  first: (box: string) => boolean; // changed, or named by the Policy: never folded
  main: (box: string) => boolean; // holds a package main
  size: (box: string) => number; // hand-written declarations: those not in generated files
  holds?: (box: string) => boolean; // holds the selection: its chip opens (N3)
};

// fold keeps at most budget boxes of the cut, in this order: changed and
// Policy-named boxes; then entry points (no sibling imports it, it holds a
// package main and it uses a sibling), which would fold by size alone; then
// by hand-written declarations, ties by id, islands (no sibling uses it and it
// uses none) after every other box. A sibling is a project box of the same
// set. In each sibling set the rest fold into one chip, in a row of its own
// at the bottom, unless it is toggled open or holds the selection (either
// opens it; both close it); a single box left over stays drawn, as a chip
// would not save room. One chip per set, not per row: a deep ranking (a ring
// of 24 boxes ranks one box a row) would leave a box a row, and fold nothing.
export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
  const c = g.cut;
  const box = (id: string) => !isGroup(id) && !g.opened.has(id);
  const drawn = c.leaves.filter(box);
  if (c.decls || drawn.length <= k.budget) return g;
  // A sibling imports x when an arc into x comes from inside one of x's siblings.
  const up = (id: string) => c.parent.get(id) ?? "";
  const imported = new Set<string>();
  const uses = new Set<string>();
  const drawnIds = new Set([...c.leaves, ...c.containers]);
  for (const a of k.arcs) {
    // Only project boxes are siblings (M2): the outside, the externals oval
    // and an external module are drawn beside the rows, not in them.
    if (!drawnIds.has(a.from) || !drawnIds.has(a.to)) continue;
    for (let f = a.from; f !== ""; f = up(f)) {
      if (up(f) === up(a.to)) {
        if (f !== a.to) [imported, uses].forEach((s, i) => s.add(i === 0 ? a.to : f));
        break;
      }
    }
  }
  const entry = (id: string) => !imported.has(id) && uses.has(id) && k.main(id);
  const island = (id: string) => !imported.has(id) && !uses.has(id);
  // Each key once, not per comparison (B1).
  const keys = new Map(drawn.map((id) => [id, [k.first(id) ? 0 : 1, entry(id) ? 0 : 1, island(id) ? 1 : 0, -k.size(id)]]));
  const order = [...drawn].sort((a, b) => {
    const [x, y] = [keys.get(a)!, keys.get(b)!];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3] || cmp(a, b);
  });
  const rows = new Map<string, string[]>(); // chip id → the boxes it would hold
  const at = new Map<string, string>();
  for (const id of order.slice(k.budget)) {
    if (k.first(id)) continue;
    const p = up(id);
    const chip = `${p === "" ? c.focus : p}${MORE}`;
    rows.set(chip, [...(rows.get(chip) ?? []), id]);
    at.set(chip, p);
  }
  const flip = new Set(toggled);
  const out: Grouped = { ...g, groups: new Map(g.groups), at: new Map(g.at), folds: new Set(g.folds), folded: new Map(g.folded) };
  const alias = new Map(c.alias ?? []);
  const gone = new Set<string>();
  for (const [chip, ids] of [...rows].sort(([a], [b]) => cmp(a, b))) {
    if (ids.length < 2) continue;
    out.at.set(chip, at.get(chip)!);
    out.folds.add(chip);
    out.folded.set(chip, ids.sort(cmp));
    // A chip that holds the selection opens (N3); its toggle still flips it.
    if (flip.has(chip) !== (k.holds !== undefined && ids.some(k.holds))) continue;
    out.groups.set(chip, ids);
    for (const id of ids) {
      gone.add(id);
      alias.set(id, chip);
    }
  }
  if (out.folds.size === g.folds.size) return g;
  const parent = new Map(c.parent);
  for (const id of gone) parent.delete(id);
  const chips = [...out.folds].filter((f) => !g.folds.has(f));
  for (const f of chips) parent.set(f, out.at.get(f)!);
  return { ...out, cut: { ...c, leaves: [...c.leaves.filter((l) => !gone.has(l)), ...chips].sort(cmp), parent, alias } };
}


// rankNote is what the Panel says of a box whose set the row cap merged: its
// own rank, which the merged row no longer shows (0 = depends on nothing here).
export const rankNote = (ownTier: number | undefined): string | null =>
  ownTier === undefined || ownTier < 0 ? null : `rank ${ownTier} in its set before rows merged (0 = depends on nothing here)`;

// MAX_ROWS is the most rows one sibling set is drawn in (R3).
export const MAX_ROWS = 7;

// capRows merges the rows of one sibling set, given as its box count per row
// from the bottom, into at most max: the row each merges into, or null when
// they fit. Rows merge with their neighbours from the bottom up, where the
// dependencies are, and no merged row holds more boxes than it must: the
// least capacity that fits (binary search), filled bottom-up, with each row
// left keeping its own once the rows left can hold them one each. A rank the
// fold emptied is not a row (N2): only ranks that hold a box count, and an
// empty one maps to the row of the live rank below it.
export function capRows(counts: readonly number[], max = MAX_ROWS): number[] | null {
  const live = counts.flatMap((c, i) => (c > 0 ? [i] : []));
  if (live.length <= max) return null;
  const rows = capLive(live.map((i) => counts[i]), max);
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < counts.length; i++) {
    const k = live.indexOf(i);
    if (k >= 0) at = rows[k];
    out.push(at);
  }
  return out;
}

function capLive(counts: readonly number[], max: number): number[] {
  const n = counts.length;
  const pack = (cap: number): number[] => {
    const row: number[] = [];
    let at = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const open = i > 0 && row[i - 1] === at;
      if (open && (sum + counts[i] > cap || n - i <= max - at - 1)) {
        at++;
        sum = 0;
      }
      row.push(at);
      sum += counts[i];
    }
    return row;
  };
  let lo = 1; // a row heavier than the capacity keeps a row of its own
  let hi = counts.reduce((a, b) => a + b, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pack(mid)[n - 1] < max) hi = mid;
    else lo = mid + 1;
  }
  return pack(lo);
}
