// scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
import { nodeMark, unchangedCount } from "./change";
import type { View, ViewEdge } from "./data";
import { autoDepth, childrenOf, cmp, cut, declsOf, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
import { rolledRanks } from "./policy";
import { withinHops } from "./select";
import type { Known, Stage, ViewState } from "./state";

export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";

export type SceneNode = {
  id: string; label: string; parent: string; shape: Shape;
  dim: boolean; selected: boolean; toggle?: "expand" | "collapse";
  methods: string[]; // method rows of a type, empty once the stage hides members
  mark?: Mark; // incoming/outgoing triangles, when lines are hidden
  change?: string; // the Change View class (change.ts nodeMark, or "has-change")
  rowMarks?: string[]; // the Change View class of each method row
  rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
  hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
  order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
};
export type SceneEdge = {
  id: string; from: string; to: string; pairs: number; members: Bundle["members"];
  dim: boolean; hot: boolean; pinned: boolean;
  status?: string; // the Change Status its members share, or "mixed" (bundle.ts statusOf)
};
export type Scene = {
  depth: number; stage: Stage;
  lines: boolean; // edges are laid out; false = only the selection's edges, drawn over the marks
  nodes: SceneNode[]; edges: SceneEdge[];
  bundles: Bundle[]; // the leaf bundles behind the edges, for the panel
  selected: string | null; // the drawn node that stands for the selection
  selectedRow: string | null; // the selected method, drawn as a row of `selected`
  decls: boolean; noDetail: boolean;
};

// Options for callers other than the Project View: 06 passes pin (violations).
export type SceneOptions = { pin?: Pin };

const last = (id: string) => id.slice(id.lastIndexOf("/") + 1);

export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene {
  const pin = opts.pin ?? NO_PINS;
  const { node } = index(view);
  const depth = s.depth ?? autoDepth(view, s.focus);
  const c = cut(view, s.focus, depth, s.toggled);
  let kept = bundlesOver(view, c, { externals: s.externals }).filter((b) => b.pairs >= s.minPairs || pin(b));
  let leaves = new Set([...c.leaves, ...kept.flatMap((b) => [b.from, b.to])]);
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

  const d = declutter(s.stage, s.lines, kept, [...leaves], c.parent, pin);
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

  const base = s.focus.endsWith(PKG) ? s.focus.slice(0, -PKG.length) : s.focus;
  const externals = externalsOf(view, kept).length;
  const label = (id: string, parent: string): string => {
    const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
    if (named !== undefined) return named;
    if (id === OUTSIDE) return "outside";
    if (id === EXTERNALS) return `${externals} external modules`;
    if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
    if (node.get(id)?.kind === "external") return id;
    if (c.decls) return id.slice(base.length + 1);
    const top = parent || base;
    return top ? id.slice(top.length + 1) : id;
  };
  const shape = (id: string): Shape => {
    if (inner.has(id)) return "container";
    if (id === OUTSIDE) return "outside";
    if (id === EXTERNALS || node.get(id)?.kind === "external") return "oval";
    return c.decls ? "decl" : "box";
  };

  const ranks = rolledRanks(view);
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
    else if (n.shape === "box" && !folds.has(id) && !id.endsWith(PKG) && childrenOf(view, id).length > 0) n.toggle = "expand";
    const m = d.lines ? undefined : d.marks.get(id);
    if (m) n.mark = m;
    // A "#pkg" leaf is its own package; any other box rolls up what it holds.
    const r = n.shape !== "box" && n.shape !== "container" ? undefined
      : id.endsWith(PKG) ? node.get(id.slice(0, -PKG.length))?.rank : ranks.get(id);
    if (r !== undefined) n.rank = r;
    const o = order.indexOf(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
    if (o >= 0 && n.shape !== "decl") n.order = o;
    return n;
  });
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

  const edges: SceneEdge[] = [];
  for (const a of d.arrows) {
    const h = hot(a);
    if (!ids.has(a.from) || !ids.has(a.to) || (!d.lines && !h)) continue;
    const e: SceneEdge = {
      id: `${a.from}→${a.to}`, from: a.from, to: a.to, pairs: a.pairs, members: a.members,
      hot: h, dim: selected !== null && !h, pinned: a.pinned,
    };
    if (a.status) e.status = a.status;
    edges.push(e);
  }
  edges.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to));
  return {
    depth, stage: s.stage, lines: d.lines, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, bundles: kept,
    selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
  };
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
// children as toggles, and anything scene() can anchor as a selection.
export const knownIds = (view: View): Known => ({
  box: (id) => id === "" || isBox(view, id),
  folder: (id) => !id.endsWith(PKG) && childrenOf(view, id).length > 0,
  node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
});

// openFull says a Change View focus (from a link) lies outside the changed
// subgraph, so the page opens the whole View at that focus (U10) rather than
// an empty canvas.
export const openFull = (sub: View, focus: string): boolean => !knownIds(sub).box(focus);
