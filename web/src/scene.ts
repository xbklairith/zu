// scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
import { nodeMark, unchangedCount } from "./change";
import type { View, ViewEdge } from "./data";
import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packageOf, packagesIn, PKG, ROOT_CLOSED, rootModule, within, type Cut } from "./cut";
import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
import { rolledRanks } from "./policy";
import { siblingRanks } from "./rank";
import { always, quiet, type Dir } from "./edges";
import { boxStats, statsLine } from "./tree";
import { shorten } from "./labels";
import { withinHops } from "./select";
import { badgesOf, BUDGET, capRows, factsOf, fold, foldInto, holdsProgram, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
import { centreOf } from "./screen";
import { toggle, type Known, type Stage, type ViewState } from "./state";

export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";

export type SceneNode = {
  id: string; label: string; parent: string; shape: Shape;
  dim: boolean; selected: boolean; toggle?: "expand" | "collapse";
  toggleId?: string; // 12: the id the toggle flips when not the node's own (the root module's ROOT_CLOSED)
  methods: string[]; // method rows of a type, empty once the stage hides members
  mark?: Mark; // incoming/outgoing triangles, when lines are hidden
  change?: string; // the Change View class (change.ts nodeMark, or "has-change")
  rowMarks?: string[]; // the Change View class of each method row
  rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
  tier?: number; // 11: its architecture rank among its siblings (rank.ts); only the layout reads it
  hint?: string; // 12: a group's tooltip (group.ts stripText, the fold's names)
  ownTier?: number; // 12: its rank before the row cap merged it into tier (group.ts capRows)
  stats?: string; // 11: a box's stats line (tree.ts statsLine); the canvas draws it and layout.ts sizes by it
  hub?: boolean; // 11: at rest, one of the HUBS most used boxes; drawn with a thicker border
  hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
  order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
  crap?: { risk: Risk; band: Band }; // 08: a box's rolled μ+σ, a function's own CRAP; null = no coverage data
  demoted?: boolean; // 12: a demoted box, drawn because its strip is open (group.ts)
  badges?: string[]; // 12: its path roles, drawn under the stats line (group.ts badgesOf)
};
export type SceneEdge = {
  id: string; from: string; to: string; pairs: number; members: Bundle["members"];
  dim: boolean; hot: boolean; pinned: boolean;
  status?: string; // the Change Status its members share, or "mixed" (bundle.ts statusOf)
  dir?: Dir; // 11: on a lit edge, out = the selection depends on the other end, in = the other end on it
};
export type Scene = {
  focus: string; // the box drawn: the state's focus, or home() for the page root (11)
  depth: number; stage: Stage;
  lines: boolean; // every edge is drawn at rest; false = the selection's edges, over marks (off) or none (auto)
  nodes: SceneNode[]; edges: SceneEdge[];
  all: SceneEdge[]; // 11: every edge the cut could draw, drawn or not; the canvas draws a hovered box's from here
  hidden: number; // 11: the lines auto leaves out at rest (edges.ts); 0 when every line is drawn
  against: number; // 11: dependencies that run against the rows (rank.ts siblingRanks); the header counts them
  entry: boolean; // 12: every box of the top row holds a program, so the axis names it entry points
  bundles: Bundle[]; // the leaf bundles behind the edges, for the panel
  selected: string | null; // the drawn node that stands for the selection
  selectedRow: string | null; // the selected method, drawn as a row of `selected`
  decls: boolean; noDetail: boolean;
  folded: number; // 12: the boxes closed fold chips hold; the header says so (N9)
  grouping?: Grouping; // 15: what a view with boxes opened in it keeps from this one
  ref?: Scene; // 15: the view as it opened (baseOf), when the reader has opened or closed boxes in it
  opened?: SceneNode[]; // 15: each region's box as the view drew it when it opened (a box the reader opened: closed), by id
};

// Grouping is what a view keeps, once the reader opens boxes in it, of the
// view as it opened (15): its fold chips and the boxes each holds, whether
// declutter lifted leaves out of their containers, and its cut.
export type Grouping = { folded: ReadonlyMap<string, readonly string[]>; multi: boolean; cut: Cut };

// baseOf is the view as it opened (15): the state without the boxes the
// reader opened or closed, and without the selection; group toggles stay.
// Null when there are none, or with a hop limit, which draws what lies
// within it however the boxes open.
export const baseOf = (s: ViewState): ViewState | null => {
  if (s.hops !== null) return null;
  const groups = s.toggled.filter(isGroup);
  return groups.length === s.toggled.length ? null : { ...s, toggled: groups, selected: null };
};

// holding is N3's rule: a box holds the selection when it is the selection's
// package ("#pkg") or a box above it, and the chip holding such a box opens.
function holding(view: View, selected: string | null): (box: string) => boolean {
  const selPkg = selected === null ? undefined : packageOf(view, selected);
  const chain = new Set<string>();
  for (let b = selPkg ?? selected ?? ""; b !== ""; b = index(view).parent.get(b) ?? "") chain.add(b);
  return (b) => (b.endsWith(PKG) ? b.slice(0, -PKG.length) === selPkg : chain.has(b));
}

// opening is the view as it opened (15), made by make: the scene of baseOf(s)
// or, when s selects a box in one of its Fold chips, of baseOf(s) with that
// chip toggled, so the chip is open there as it is in s (N3). The selection
// itself is left out, so selecting another box finds the same scene.
export function opening(view: View, s: ViewState, make: (b: ViewState) => Scene): Scene | null {
  const b = baseOf(s);
  if (b === null) return null;
  const first = make(b);
  if (s.selected === null) return first;
  const holds = holding(view, s.selected);
  const chip = [...(first.grouping?.folded ?? [])].find(([, ids]) => ids.some(holds))?.[0];
  return chip === undefined ? first : make(toggle(b, chip));
}

// Options for callers other than the Project View: 06 passes pin (violations);
// the page passes home (11), which draws the page root at home(view). base
// (15) is opening(view, s, …) with the same options, when the caller keeps
// it; scene makes it otherwise.
export type SceneOptions = { pin?: Pin; home?: boolean; base?: Scene | null };

const last = (id: string) => id.slice(id.lastIndexOf("/") + 1);

export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene {
  const pin = opts.pin ?? NO_PINS;
  const { node } = index(view);
  // 11: the page root opens at home, so the hash keeps no focus for it.
  const focus = s.focus === "" && opts.home ? home(view) : s.focus;
  const depth = s.depth ?? autoDepth(view, focus);
  // 12: demoted boxes wait in a strip at the bottom of their set (group.ts).
  // 12 (R5): at the page root, the repository's own module opens in place
  // among the modules nested in it; toggling it closes it.
  const root = focus === "" && opts.home && view.kind !== "change" && depth <= 1 ? rootModule(view) : null;
  const shut = root !== null && s.toggled.includes(root + ROOT_CLOSED);
  const flips = root === null || s.toggled.includes(root) ? s.toggled
    : shut ? s.toggled.filter((t) => t !== root + ROOT_CLOSED) : [...s.toggled, root];
  let grouped = strip(view, cut(view, focus, depth, flips), s.toggled);
  // 15: with boxes the reader opened or closed, what is drawn beside them is
  // what the view drew as it opened (baseOf): its chips, rows and counts.
  const ref = opts.base !== undefined ? opts.base : opening(view, s, (b) => scene(view, b, { pin: opts.pin, home: opts.home, base: null }));
  const holds = holding(view, s.selected); // the chip holding the selection opens (N3)
  // 12: at the automatic depth, a budget of boxes; the rest of each row folds
  // into a chip, ranked as the rows were before folding (group.ts fold).
  let before: Map<string, number> | null = null;
  const into = new Map<string, Set<string>>(); // strip → the boxes that import into it, before folding (M4)
  if (ref?.grouping) grouped = foldInto(grouped, ref.grouping.folded, s.toggled, holds);
  else if (s.depth === null && !grouped.cut.decls) {
    const c1 = grouped.cut;
    const low = (id: string) => isGroup(id) || grouped.opened.has(id);
    // A6: the weight filter hides lines; it never moves a box (15), so ranks count every bundle.
    const pre = bundlesOver(view, c1, { externals: s.externals });
    for (const b of pre) if (isStrip(b.to)) into.set(b.to, (into.get(b.to) ?? new Set()).add(b.from));
    const arcs = pre.filter((b) => !low(b.from) && !low(b.to));
    const { tiers } = siblingRanks(
      new Map([...c1.leaves, ...c1.containers].filter((id) => !low(id)).map((id) => [id, c1.parent.get(id) ?? ""])),
      arcs.map((b) => ({ from: b.from, to: b.to, weight: b.pairs })),
    );
    // Pinned boxes (the Policy's order) never fold, nor the children of the
    // root module drawn open at the page root, however it opened. Every fact
    // is the box's Rollup, summed once per View (B1).
    const rm = focus === "" && view.kind !== "change" ? rootModule(view) : null;
    const named = view.policy?.order ?? [];
    const own = (id: string) => (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
    const folded = fold(grouped, s.toggled, {
      budget: view.policy?.budget ?? BUDGET, arcs,
      first: (b) => (factsOf(view, b)?.changed ?? false) || named.some((o) => o === own(b) || (!b.endsWith(PKG) && within(view, o, b))),
      root: (b) => rm !== null && c1.parent.get(b) === rm,
      main: (b) => (factsOf(view, b)?.mains ?? 0) > 0,
      size: (b) => { const f = factsOf(view, b); return f ? f.decls - f.gen : 0; },
      holds,
    });
    if (folded !== grouped) before = tiers;
    grouped = folded;
  }
  const c = grouped.cut;
  const members = (g: string) => grouped.groups.get(g)
    ?? [...grouped.opened].filter((b) => c.parent.get(b) === grouped.at.get(g));
  // A6: the weight filter hides lines (kept); boxes, ranks and counts read every bundle (15).
  const every = bundlesOver(view, c, { externals: s.externals });
  let kept = every.filter((b) => b.pairs >= s.minPairs || pin(b));
  let leaves = new Set([...c.leaves, ...every.flatMap((b) => [b.from, b.to])]);
  const open = new Set(c.containers);
  const up = (id: string) => c.parent.get(id) ?? "";
  const under = (id: string, outer: string) => {
    for (let x = id; x !== ""; x = up(x)) if (x === outer) return true;
    return false;
  };

  // anchor maps any id to the drawn node that stands for it: a method to its
  // type, a package to its leaf; a box or aggregate is itself.
  const toLeaf = leafOf(view, c);
  const anchor = (id: string): string | null => {
    if (leaves.has(id) || open.has(id)) return id;
    const n = node.get(id);
    if (n?.kind === "function" && n.parent && leaves.has(n.parent)) return n.parent;
    if (n?.kind === "package" && !c.decls) {
      const l = toLeaf(id);
      return l === OUTSIDE ? null : l;
    }
    // 12: a box a group stands for, or one inside it, anchors to the group.
    for (let x = id; x !== ""; x = index(view).parent.get(x) ?? "") {
      const g = c.alias?.get(x);
      if (g !== undefined) return leaves.has(g) ? g : null;
    }
    return null;
  };
  let selected = s.selected === null ? null : anchor(s.selected);
  const selectedRow = selected !== null && s.selected !== null && node.get(s.selected)?.parent === selected
    && node.get(selected)?.kind === "type" ? s.selected : null;

  if (s.hops !== null && selected !== null) {
    const sel = selected;
    const near = withinHops(kept, [...leaves].filter((l) => under(l, sel)), s.hops);
    leaves = new Set([...leaves].filter((l) => near.has(l)));
    kept = kept.filter((b) => near.has(b.from) && near.has(b.to));
  }
  const ranked = s.hops !== null && selected !== null ? kept : every;

  const d = declutter(s.stage, s.edges !== "off", kept, [...leaves], c.parent, pin, ref?.grouping?.multi);
  const shown = (id: string) => (d.folded(id) ? up(id) : id);
  const folds = new Set([...leaves].filter(d.folded).map(up));
  leaves = new Set([...leaves].filter((l) => !d.folded(l)));
  if (selected !== null) selected = shown(selected);

  const ids = new Set([...leaves, ...folds]);
  const inner = new Set<string>(); // containers that still hold a drawn node
  for (const id of ids) for (let p = up(id); p !== ""; p = up(p)) inner.add(p);
  for (const p of inner) ids.add(p);

  // Lighting (U4): the selection, what it holds, and the far end of every
  // bundle that touches it.
  const inSel = (x: string) => selected !== null && under(x, selected);
  const hot = (a: (typeof d.arrows)[number]) =>
    selected !== null && a.carries.some((b) => inSel(b.from) || inSel(b.to));
  const lit = new Set<string>();
  if (selected !== null) {
    for (const a of d.arrows) {
      if (!hot(a)) continue;
      for (const b of a.carries) for (const x of [a.from, a.to, b.from, b.to]) lit.add(shown(x));
    }
  }
  const bright = (id: string) => selected === null || inSel(id) || lit.has(id);

  const base = focus.endsWith(PKG) ? focus.slice(0, -PKG.length) : focus;
  const externals = externalsOf(view, kept).length;
  // path: the label is the box's path below its container, which 11 shortens.
  const paths = new Set<string>();
  const label = (id: string, parent: string): string => {
    const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
    if (named !== undefined) return named;
    if (isStrip(id)) return stripText(view, members(id), 0).label;
    if (isFold(id)) return grouped.groups.has(id) ? `+${grouped.folded.get(id)!.length} more` : `fold ${grouped.folded.get(id)!.length}`;
    if (id === OUTSIDE) return "outside";
    if (id === EXTERNALS) return `${externals} external modules`;
    if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
    if (node.get(id)?.kind === "external") return id;
    if (c.decls) return id.slice(base.length + 1);
    paths.add(id);
    const top = parent || base;
    return top ? id.slice(top.length + 1) : id;
  };
  const shape = (id: string): Shape => {
    if (isGroup(id)) return "chip";
    if (inner.has(id)) return "container";
    if (id === OUTSIDE) return "outside";
    if (id === EXTERNALS || node.get(id)?.kind === "external") return "oval";
    return c.decls ? "decl" : "box";
  };

  const ranks = rolledRanks(view);
  const craps = rolledCrap(view);
  const funcs = view.metrics?.funcs ?? {};
  const order = view.policy?.order ?? [];
  const nodes: SceneNode[] = [...ids].sort(cmp).map((id) => {
    const parent = up(id);
    const n: SceneNode = {
      id, label: label(id, parent), parent, shape: shape(id),
      dim: false, selected: id === selected,
      methods: c.decls && d.rows
        ? view.nodes.filter((m) => m.parent === id && m.kind === "function").map((m) => m.id.slice(id.length + 1)).sort(cmp)
        : [],
    };
    n.dim = n.shape !== "container" && !bright(id);
    if (n.shape === "container") n.toggle = "collapse";
    else if (isGroup(id)) n.toggle = grouped.groups.has(id) ? "expand" : "collapse";
    else if (n.shape === "box" && !folds.has(id) && !id.endsWith(PKG) && childrenOf(view, id).length > 0) n.toggle = "expand";
    if (id === root && n.toggle) n.toggleId = root + ROOT_CLOSED;
    if (grouped.opened.has(id)) n.demoted = true;
    if (isFold(id) && grouped.groups.has(id)) {
      // 12: a closed fold chip names what it holds in its tooltip, as labels drop their shared prefix.
      n.hint = shorten(grouped.folded.get(id)!.map((b) => b.replace(PKG, ""))).join(", ");
    }
    if (n.shape === "box" && !c.decls) {
      const b = badgesOf(view, id);
      if (b.length) n.badges = b;
    }
    const m = d.lines ? undefined : d.marks.get(id);
    if (m) n.mark = m;
    // A "#pkg" leaf is its own package; any other box rolls up what it holds.
    const r = n.shape !== "box" && n.shape !== "container" ? undefined
      : id.endsWith(PKG) ? node.get(id.slice(0, -PKG.length))?.rank : ranks.get(id);
    if (r !== undefined) n.rank = r;
    const k = n.shape === "decl" ? (node.get(id)?.kind === "function" && funcs[id] ? (funcs[id].crap ?? null) : undefined)
      : n.shape !== "box" && n.shape !== "container" ? undefined
      : id.endsWith(PKG) ? packageRisk(view, id.slice(0, -PKG.length)) : craps.get(id);
    if (k !== undefined) n.crap = { risk: k, band: crapBand(k) };
    const o = order.indexOf(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
    if (o >= 0 && n.shape !== "decl") n.order = o;
    return n;
  });
  // 11: siblings drop the path prefix they share (labels.ts).
  const sets = new Map<string, SceneNode[]>();
  for (const n of nodes) if (paths.has(n.id)) sets.set(n.parent, [...(sets.get(n.parent) ?? []), n]);
  for (const set of sets.values()) shorten(set.map((n) => n.label)).forEach((l, i) => (set[i].label = l));
  if (!c.decls) markHidden(view, nodes, (id) => {
    const l = toLeaf(id);
    const at = l === OUTSIDE ? null : d.lift(shown(l));
    return at !== null && ids.has(at) ? at : null;
  });
  const row = view.kind === "change" ? markChanges(view, c.decls, nodes, d.rows, s.selected) : null;
  if (row !== null) {
    selected = row.selected;
    for (const n of nodes) n.selected = n.id === selected;
  }
  // 11: every drawn node's architecture rank, from the bundles this cut
  // keeps, drawn or not, so showing or hiding lines never moves a box.
  // A sibling set with a Policy rank is placed by it (layout.ts ranked).
  const byPolicy = new Set(nodes.filter((n) => n.rank !== undefined).map((n) => n.parent));
  // 12: a strip, and the demoted boxes it opens onto, sit below the rows
  // and do not rank: what imports them would otherwise climb over them.
  // A fold chip joins them, and the boxes left keep the rows they had
  // before the others folded.
  const bottom = (id: string) => isGroup(id) || grouped.opened.has(id);
  const { tiers, against } = siblingRanks(
    new Map(nodes.filter((n) => !bottom(n.id)).map((n) => [n.id, n.parent])),
    ranked.map((b) => ({ from: shown(b.from), to: shown(b.to), weight: b.pairs })),
    (p) => byPolicy.has(p),
  );
  for (const n of nodes) {
    n.tier = bottom(n.id) ? -1 : before?.get(n.id) ?? tiers.get(n.id);
  }
  // 12: at most MAX_ROWS rows in a set the Policy does not place, the
  // bottom row of groups counted; a box keeps its rank as its own tier, which
  // orders a merged row (layout.ts).
  const low = new Set(nodes.filter((n) => n.tier === -1).map((n) => n.parent));
  const rowSets = new Map<string, SceneNode[]>();
  for (const n of nodes) if (!byPolicy.has(n.parent) && n.tier !== undefined && n.tier >= 0) rowSets.set(n.parent, [...(rowSets.get(n.parent) ?? []), n]);
  for (const set of rowSets.values()) {
    const top = Math.max(...set.map((n) => n.tier!));
    const counts = Array.from({ length: top + 1 }, (_, t) => set.filter((n) => n.tier === t).length);
    const rows = capRows(counts, MAX_ROWS - (low.has(set[0].parent) ? 1 : 0));
    if (rows) for (const n of set) [n.ownTier, n.tier] = [n.tier, rows[n.tier!]];
  }

  // 11: auto draws at rest only what must show when there are too many lines
  // to follow: violations, changed imports, and the imports behind the
  // Affected Set (edges.ts always). Everything else waits for a selection.
  const drawable = d.arrows.filter((a) => ids.has(a.from) && ids.has(a.to));
  const hush = quiet(s.edges, d.lines, drawable.length);
  const marked = (id: string) => (node.get(id) ? nodeMark(node.get(id)!) : "");
  const affected = (e: ViewEdge) => view.kind === "change" && marked(e.from) === "affected" && marked(e.to) !== "";
  const all: SceneEdge[] = [];
  const edges: SceneEdge[] = [];
  let hidden = 0;
  for (const a of drawable) {
    const h = hot(a);
    const e: SceneEdge = {
      id: `${a.from}→${a.to}`, from: a.from, to: a.to, pairs: a.pairs, members: a.members,
      hot: h, dim: selected !== null && !h, pinned: a.pinned,
    };
    if (a.status) e.status = a.status;
    if (h) e.dir = a.carries.some((b) => inSel(b.from)) ? "out" : "in";
    all.push(e);
    const rest = !hush || always(a, affected); // drawn with nothing selected
    if (!rest) hidden++;
    if (d.lines ? rest || h : h) edges.push(e);
  }
  const byEnds = (x: SceneEdge, y: SceneEdge) => cmp(x.from, y.from) || cmp(x.to, y.to);
  edges.sort(byEnds);
  all.sort(byEnds);
  const usedBy = connect(view, nodes, ranked.map((b) => [shown(b.from), shown(b.to)] as const).filter(([f, t]) => ids.has(f) && ids.has(t)), selected === null);
  // A strip's "used by" counts boxes: a closed fold chip counts as each of
  // its boxes that imports into the strip (M4).
  const users = (strip: string) => {
    const out = new Set<string>();
    for (const u of usedBy.get(strip) ?? []) {
      if (isFold(u) && grouped.groups.has(u)) for (const m of grouped.groups.get(u)!) { if (into.get(strip)?.has(m)) out.add(m); }
      else out.add(u);
    }
    return out.size;
  };
  for (const n of nodes) {
    if (!isStrip(n.id)) continue;
    const t = stripText(view, members(n.id), users(n.id));
    n.label = t.label;
    if (t.hint) n.hint = t.hint;
  }
  const opened = ref ? keep(view, ref, nodes, { up, open, inner, toLeaf, every, shown, members }) : undefined;
  // 12 (R6): the top row is the entry points when every box in it holds a program.
  const tops = nodes.filter((n) => n.parent === "" && (n.tier ?? -1) >= 0);
  const high = Math.max(...tops.map((n) => n.tier!));
  const topRow = tops.filter((n) => n.tier === high);
  const entry = !c.decls && topRow.length > 0 && topRow.every((n) => (n.shape === "box" || n.shape === "container") && holdsProgram(view, n.id));
  return {
    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, entry, bundles: kept,
    selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
    folded: [...grouped.folds].reduce((n, f) => n + (grouped.groups.get(f)?.length ?? 0), 0),
    grouping: ref?.grouping ?? { folded: grouped.folded, multi: d.multi, cut: c },
    ...(ref ? { ref, opened } : {}),
  };
}

type Tree = {
  up: (id: string) => string; open: ReadonlySet<string>; inner: ReadonlySet<string>;
  toLeaf: (pkg: string) => string; every: readonly Bundle[]; shown: (id: string) => string;
  members: (group: string) => string[];
};

// keep gives a view the reader opened or closed boxes in what the view as it
// opened (ref) drew beside them (15), so they keep their sizes and rows: each
// node ref drew under the same container keeps its rows (tier, ownTier) and,
// in the same shape, its counts (stats, a group's label and tooltip). A box
// the reader opened is a region: what it holds counts every box outside it as
// the view drew it when it opened, and every other opened box as closed. It
// returns each opened box as drawn closed, for the layout (place.ts).
function keep(view: View, ref: Scene, nodes: SceneNode[], t: Tree): SceneNode[] {
  const { node } = index(view);
  const was = new Map(ref.nodes.map((n) => [n.id, n]));
  const baseOpen = new Set(ref.grouping!.cut.containers);
  const baseLeaf = leafOf(view, ref.grouping!.cut);
  const aside = (id: string) => id === OUTSIDE || id === EXTERNALS || node.get(id)?.kind === "external";
  // A region is a box the reader opened, or a container of the view as it
  // opened that now holds other children (a package closed at the
  // declarations, whose unchanged ones fold into a row).
  const kids = (ns: readonly SceneNode[]) => {
    const m = new Map<string, string[]>();
    for (const n of ns) m.set(n.parent, [...(m.get(n.parent) ?? []), n.id]);
    return (id: string) => JSON.stringify((m.get(id) ?? []).sort(cmp));
  };
  const [then, now] = [kids(ref.nodes), kids(nodes)];
  const regrown = (n: SceneNode) => n.shape === "container" && was.get(n.id)?.shape === "container" && then(n.id) !== now(n.id);
  const opened = new Set(nodes.filter((n) => (t.open.has(n.id) && t.inner.has(n.id) && !baseOpen.has(n.id)) || regrown(n)).map((n) => n.id));
  const regionOf = (id: string) => {
    for (let x = t.up(id); x !== ""; x = t.up(x)) if (opened.has(x)) return x;
    return "";
  };
  const under = (id: string, outer: string) => {
    for (let x = id; x !== ""; x = t.up(x)) if (x === outer) return true;
    return false;
  };
  // item is what x sees of package p: inside x's region, the child of the
  // region that holds p; outside it, as the region's own box sees p.
  const item = (p: string, x: string): string | null => {
    if (node.get(p)?.kind !== "package") return null;
    for (let q = regionOf(x); ; q = regionOf(q)) {
      if (q === "") {
        const l = baseLeaf(p);
        return aside(l) ? null : l;
      }
      if (!within(view, p, q)) continue;
      let e = t.toLeaf(p);
      if (e === OUTSIDE) return null;
      while (t.up(e) !== q && t.up(e) !== "") e = t.up(e);
      return t.up(e) === q ? e : null;
    }
  };
  const counts = (x: string) => {
    const uses = new Set<string>();
    const usedBy = new Set<string>();
    for (const b of t.every) {
      const [out, inn] = [under(t.shown(b.from), x), under(t.shown(b.to), x)];
      if (out === inn) continue;
      for (const e of b.members) {
        const i = item(out ? e.to : e.from, x);
        if (i !== null && !under(i, x)) (out ? uses : usedBy).add(i);
      }
    }
    return { uses: uses.size, usedBy: usedBy.size, packages: boxStats(view, x).packages };
  };
  for (const n of nodes) {
    const w = was.get(n.id);
    if (w !== undefined && w.parent === n.parent) {
      if (w.tier === undefined) delete n.tier;
      else n.tier = w.tier;
      if (w.ownTier === undefined) delete n.ownTier;
      else n.ownTier = w.ownTier;
      if (w.shape === n.shape) {
        if (w.stats !== undefined) n.stats = w.stats;
        if (isGroup(n.id)) [n.label, n.hint] = [w.label, w.hint];
        if (n.hint === undefined) delete n.hint;
        continue;
      }
    }
    if (n.shape === "box") n.stats = statsLine(counts(n.id));
    else if (isStrip(n.id)) {
      const st = stripText(view, t.members(n.id), counts(n.id).usedBy);
      n.label = st.label;
      if (st.hint) n.hint = st.hint;
    }
  }
  return nodes.filter((n) => opened.has(n.id)).map((n) => {
    if (regrown(n)) return was.get(n.id)!; // as the view drew it when it opened
    const b: SceneNode = { ...n, shape: "box", toggle: "expand", methods: [], stats: statsLine(counts(n.id)) };
    const g = badgesOf(view, n.id);
    if (g.length) b.badges = g;
    return b;
  });
}

// HUBS is how many of the most used boxes are emphasised at rest (11).
export const HUBS = 3;

// connect gives each box its stats line (11): the distinct drawn nodes at the
// other end of its dependencies, from the bundles the cut keeps, each end
// drawn where it shows (links), the same source as the ranks. Not from the
// lines: a declutter stage merges them into its containers' arrows. So the
// text and the box's size are the same whatever the stage, edge mode, hover
// or selection. Only project nodes count (A2): the externals oval and the
// outside box stand beside the rows, not in them, so a box in the bottom row
// ("depends on nothing here") reads uses 0; the Panel lists its externals.
// At rest the HUBS boxes used by the most (at least one; ties by id) are
// marked hub: where to start reading.
function connect(view: View, nodes: SceneNode[], links: readonly (readonly [string, string])[], rest: boolean): Map<string, Set<string>> {
  const aside = new Set(nodes.filter((n) => n.shape === "oval" || n.shape === "outside").map((n) => n.id));
  const uses = new Map<string, Set<string>>();
  const usedBy = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    const s = m.get(k);
    if (s) s.add(v);
    else m.set(k, new Set([v]));
  };
  for (const [from, to] of links) {
    if (from === to || aside.has(from) || aside.has(to)) continue;
    add(uses, from, to);
    add(usedBy, to, from);
  }
  const boxes = nodes.filter((n) => n.shape === "box");
  for (const n of boxes) {
    n.stats = statsLine({ uses: uses.get(n.id)?.size ?? 0, usedBy: usedBy.get(n.id)?.size ?? 0, packages: boxStats(view, n.id).packages });
  }
  if (!rest) return usedBy;
  const by = (n: SceneNode) => usedBy.get(n.id)?.size ?? 0;
  for (const n of boxes.filter((b) => by(b) > 0).sort((a, b) => by(b) - by(a) || cmp(a.id, b.id)).slice(0, HUBS)) n.hub = true;
  return usedBy;
}

// markHidden marks each drawn node that holds both ends of a violating import
// (07). Such an import has no line: bundlesOver drops an edge inside one leaf,
// and declutter a bundle it lifts to a self-loop (05 Deviation 1). The mark
// keeps "violations stay red" true at every depth and stage. Levels come
// first: one bad import can close many cycle arcs.
function markHidden(view: View, nodes: SceneNode[], drawn: (pkg: string) => string | null) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of view.edges) {
    if (e.violation === undefined || e.kind !== "imports") continue;
    const at = drawn(e.from);
    if (at === null || at !== drawn(e.to)) continue;
    const n = byId.get(at)!;
    (n.hidden ??= []).push(e);
  }
  const first = (e: ViewEdge) => (e.violation === "levels" ? 0 : 1);
  for (const n of nodes) n.hidden?.sort((a, b) => first(a) - first(b) || cmp(a.from, b.from) || cmp(a.to, b.to));
}

// markChanges is 04 Part B's Change View marking (Q4), unchanged: each node
// gets its Change View class, and every changed package drawn as a box opens
// onto its changed declarations with a "+N unchanged" chip. A box that folds
// changed packages is marked "has-change", or, when it opens, gets a
// "+N changed packages" chip. It returns the selection when the selected id
// is one of the declarations it opened, so a pick from the changed list shows.
function markChanges(
  view: View, decls: boolean, nodes: SceneNode[], rows: boolean, pick: string | null,
): { selected: string; selectedRow: string | null } | null {
  const { node } = index(view);
  const mark = (id: string) => nodeMark(node.get(id)!) || undefined;
  const methodsOf = (id: string) =>
    rows ? view.nodes.filter((m) => m.parent === id && m.kind === "function").map((m) => m.id).sort(cmp) : [];
  const decl = (n: SceneNode) => {
    const ms = methodsOf(n.id);
    const cls = mark(n.id);
    if (cls) n.change = cls;
    if (ms.length) n.rowMarks = ms.map((m) => nodeMark(node.get(m)!));
  };
  if (decls) {
    for (const n of nodes) if (n.shape === "decl") decl(n);
    return null;
  }
  let found: { selected: string; selectedRow: string | null } | null = null;
  const add = (n: SceneNode) => {
    nodes.push(n);
    if (pick === n.id) found = { selected: n.id, selectedRow: null };
    else if (pick !== null && n.shape === "decl" && node.get(pick)?.parent === n.id) found = { selected: n.id, selectedRow: pick };
  };
  for (const it of [...nodes]) {
    if (it.shape !== "box") continue;
    const pkg = it.id.endsWith(PKG) ? it.id.slice(0, -PKG.length) : it.id;
    const n = node.get(pkg);
    if (n?.kind !== "package") {
      if (packagesIn(view, it.id).some((p) => p.status)) it.change = "has-change";
      continue;
    }
    const cls = mark(pkg);
    if (cls) it.change = cls;
    const folded = it.id.endsWith(PKG) ? 0 : packagesIn(view, it.id).filter((p) => p.id !== pkg && p.status).length;
    const ds = n.detail ? declsOf(view, pkg) : [];
    if (ds.length === 0) {
      if (folded > 0) it.change = `${it.change ?? ""} has-change`.trim();
      continue;
    }
    it.shape = "container";
    delete it.toggle;
    const inner = (id: string, label: string, shape: Shape): SceneNode =>
      ({ id, label, parent: it.id, shape, dim: it.dim, selected: false, methods: [] });
    for (const id of ds) {
      const d = inner(id, id.slice(pkg.length + 1), "decl");
      d.methods = methodsOf(id).map((m) => m.slice(id.length + 1));
      decl(d);
      add(d);
    }
    const more = unchangedCount(view, pkg);
    if (more > 0) add(inner(`${it.id}#unchanged`, `+${more} unchanged`, "chip"));
    if (folded > 0) add(inner(`${it.id}#folded`, `+${folded} changed package${folded > 1 ? "s" : ""}`, "chip"));
  }
  return found;
}

// DRAW_LIMIT is the most the page lays out at once (Deviation 8): ELK's time
// grows with the edges it routes, and hidden lines are not laid out.
export const DRAW_LIMIT = { nodes: 2000, edges: 500 };
type Sized = { nodes: readonly unknown[]; edges: readonly unknown[]; lines: boolean };
export const tooBig = (sc: Sized, limit = DRAW_LIMIT): boolean =>
  sc.nodes.length > limit.nodes || (sc.lines && sc.edges.length > limit.edges);

// fitDepth is the depth to draw for the requested scene (Deviation 8): its own
// when it fits, else the deepest shallower depth that does, as at() draws it;
// null when even depth 1 is too big and the reader has to choose.
export function fitDepth(requested: Sized & { depth: number }, at: (depth: number) => Sized, limit = DRAW_LIMIT): number | null {
  if (!tooBig(requested, limit)) return requested.depth;
  for (let d = requested.depth - 1; d >= 1; d--) if (!tooBig(at(d), limit)) return d;
  return null;
}

// knownIds says which ids a URL hash may name: boxes as a focus, boxes with
// children as toggles, anything scene() can anchor as a selection, a
// Proposal outside a Change View: the Change View's violations are zu diff's,
// under zu.policy.yaml, so it never draws a Proposal's; and (17) a Centre.
export const knownIds = (view: View): Known => ({
  box: (id) => id === "" || isBox(view, id),
  folder: (id) => knownGroup(view, id) || (!id.endsWith(PKG) && childrenOf(view, id).length > 0)
    || (id.endsWith(ROOT_CLOSED) && id.slice(0, -ROOT_CLOSED.length) === rootModule(view)),
  node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS || knownGroup(view, id),
  proposal: (name) => view.kind !== "change" && (view.policy?.proposals?.some((p) => p.name === name) ?? false),
  centre: (id) => centreOf(view, id) === id, // 17: never in a Change View, never a method
});

// openFull says a Change View focus (from a link) lies outside the changed
// subgraph, so the page opens the whole View at that focus (U10) rather than
// an empty canvas.
export const openFull = (sub: View, focus: string): boolean => !knownIds(sub).box(focus);
