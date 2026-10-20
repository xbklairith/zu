// 17: the Screen (glossary: Screen, Centre, Weight). One node, the Centre,
// with what depends on it in the row above and what it depends on in the row
// below, after codezoom's screens. A pure function of the View and the hash:
// rows come only from the View's edges. 18: in a Change View, from its edges
// and near's, each box and line marked by its Change Status.
import type { Loc, NodeKind, View, ViewEdge } from "./data";
import { statusOf } from "./bundle";
import { nodeMark } from "./change";
import { behind } from "./code";
import { cmp, index, packageOf, PKG } from "./cut";
import { INSET, ROW_MAX, textWidth } from "./layout";
import { LABEL_PX } from "./viewport";

export const ROW_CAP = 24; // the boxes a row draws before "+N more"
export const LARGE_SHARE = 1 / 2; // of the row's heaviest Weight: drawn large
export const MEDIUM_SHARE = 1 / 5; // drawn medium; less is small
export const FLAT_ROW_MAX = 2; // a row whose heaviest weighs no more is drawn medium
export const MEMBER_CAP = 8; // 18: the changed members a Centre lists before "+N more"

export type Size = "small" | "medium" | "large";
// The Screen's grain follows its Centre: imports between packages and
// externals, or calls and embeds between declarations.
export type Grain = "package" | "declaration";
export type Box = {
  id: string; kind: NodeKind; label: string;
  sub: string; // a declaration's package, or a package's module when the View has several
  refs: number; // package grain: files that import; declaration grain: call sites and embeds
  members: number; // declaration grain: declarations at this box's end of them
  weight: number; size: Size;
  both: boolean; // drawn in both rows: an import cycle or mutual calls with the Centre
  mark: string; // 18: change.ts nodeMark, or "has-change" for a type with a changed method
  status?: string; // 18: its line's: the Change Status its edges share, or "mixed" (bundle.ts statusOf)
  ghost: boolean; // 18: where a reversed import's far end was in base
  violation: boolean; // 18: its line holds an import the Policy forbids, drawn red as the tree's (06)
};
// more: boxes past ROW_CAP, not drawn; a row's ghosts come after its boxes, uncapped
export type Row = { boxes: Box[]; more: number };
export type Screen = {
  centre: string; kind: NodeKind; grain: Grain; above: Row; below: Row;
  unresolved: number; // declaration grain: the Centre's package's Unresolved Calls (ADR 0002)
  offIn: number; offOut: number; // declaration grain: calls and embeds with declarations not on this page
  change?: CentreChange; // 18: a Change View's only
};
// Member is a changed declaration in the Centre, signed + ~ − or → (a Move).
export type Member = { id: string; label: string; sign: string };
// CentreChange is the Centre's mark, its changed members (MEMBER_CAP of them,
// then more), and its package's hop in the Affected Set, absent when it is not
// in it; reach is, for a changed package, how many packages import it,
// directly or not, over head's imports (ADR 0009).
export type CentreChange = { mark: string; members: Member[]; more: number; hop?: number; reach: number };

// screenView is the View a Screen reads: a Change View's nodes and edges with
// near's (18), the unchanged declarations one call or embed from the change,
// merged once; any other View as it is.
const merged = new WeakMap<View, View>();
export function screenView(view: View): View {
  if (!view.near) return view;
  let v = merged.get(view);
  if (!v) {
    const { near, ...rest } = view;
    v = { ...rest, nodes: [...view.nodes, ...near.nodes], edges: [...view.edges, ...near.edges] };
    merged.set(view, v);
  }
  return v;
}

// typeOf is the type a method belongs to, or undefined.
function typeOf(view: View, id: string): string | undefined {
  const { node } = index(view);
  const n = node.get(id);
  return n?.kind === "function" && n.parent !== undefined && node.get(n.parent)?.kind === "type" ? n.parent : undefined;
}

// centreOf is the Centre a selection names: a package (its box "X#pkg" too),
// a type, a function or an external; a method names its type. Boxes that are
// not nodes, aggregates and groups name none. In a Change View a near
// declaration names itself too (18).
export function centreOf(view: View, id: string | null): string | null {
  if (id === null) return null;
  const v = screenView(view);
  const n = index(v).node.get(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
  if (!n) return null;
  return typeOf(v, n.id) ?? n.id;
}

// markOf is the class a Screen box is drawn with (18): its node's mark, or
// "has-change" for a type with a changed method, as the tree marks a box with
// changes inside.
const changedTypes = new WeakMap<View, Set<string>>();
function markOf(view: View, id: string): string {
  const n = index(view).node.get(id)!;
  const m = nodeMark(n);
  if (m || n.kind !== "type") return m;
  let types = changedTypes.get(view);
  if (!types) {
    types = new Set(view.nodes.filter((x) => (x.status || x.movedFrom) && typeOf(view, x.id)).map((x) => x.parent!));
    changedTypes.set(view, types);
  }
  return types.has(id) ? "has-change" : "";
}

// labelOf names a node as a Screen box does: a package by its path in its
// module, an external by its path, a declaration by its name in its package.
function labelOf(view: View, id: string): { label: string; sub: string } {
  const n = index(view).node.get(id)!;
  if (n.kind === "external") return { label: id, sub: "" };
  if (n.kind === "package") {
    const m = n.module ?? "";
    return { label: id.startsWith(m + "/") ? id.slice(m.length + 1) : id, sub: view.modules.length > 1 ? m : "" };
  }
  const pkg = packageOf(view, id) ?? "";
  return { label: id.slice(pkg.length + 1), sub: labelOf(view, pkg).label };
}

type Tally = { refs: number; ends: Set<string>; embeds: boolean; edges: ViewEdge[] };

function rowOf(view: View, tallies: Map<string, Tally>, other: Map<string, Tally>, grain: Grain, below: boolean, all: boolean, ghosts: string[]): Row {
  const boxes: Box[] = [...tallies].map(([id, t]) => ({
    id, kind: index(view).node.get(id)!.kind, ...labelOf(view, id),
    refs: t.refs, members: t.ends.size,
    weight: grain === "package" ? t.refs : Math.sqrt(t.refs * t.ends.size),
    size: "medium" as Size, both: other.has(id),
    mark: markOf(view, id), status: statusOf(t.edges), ghost: false, violation: t.edges.some((e) => e.violation !== undefined),
  }));
  boxes.sort((a, b) => b.weight - a.weight || cmp(a.id, b.id));
  const max = boxes[0]?.weight ?? 0;
  for (const b of boxes) {
    b.size = b.kind === "external" ? "small" // a library is always small
      : max <= FLAT_ROW_MAX ? "medium"
      : b.weight >= max * LARGE_SHARE ? "large" : b.weight >= max * MEDIUM_SHARE ? "medium" : "small";
    if (below && b.size === "small" && b.kind !== "external" && tallies.get(b.id)!.embeds) b.size = "medium"; // what the Centre embeds
  }
  // A ghost is drawn small and plain, past the cap: a reversal is never hidden.
  const ghost = (id: string): Box => ({
    id, kind: index(view).node.get(id)!.kind, ...labelOf(view, id), refs: 0, members: 0, weight: 0,
    size: "small", both: false, mark: "", status: "reversed", ghost: true, violation: false,
  });
  const drawn = all || boxes.length <= ROW_CAP ? boxes : boxes.slice(0, ROW_CAP);
  return { boxes: [...drawn, ...ghosts.sort(cmp).map(ghost)], more: boxes.length - drawn.length };
}

const SIGNS: Record<string, string> = { added: "+", modified: "~", removed: "−" };

// changeOf is a Change View Centre's CentreChange: a package lists its
// changed declarations, a type its changed methods.
function changeOf(view: View, centre: string, kind: NodeKind): CentreChange {
  const inside = (id: string) => (kind === "package" ? packageOf(view, id) === centre : kind === "type" && typeOf(view, id) === centre);
  const all = view.nodes
    .filter((n) => (n.kind === "type" || n.kind === "function") && (n.status || n.movedFrom) && inside(n.id))
    .map((n) => ({ id: n.id, label: n.id.slice(centre.length + 1), sign: n.status ? SIGNS[n.status] : "→" }))
    .sort((a, b) => cmp(a.id, b.id));
  const pkg = kind === "external" ? undefined : kind === "package" ? centre : packageOf(view, centre);
  const hop = pkg === undefined ? undefined : index(view).node.get(pkg)?.hop;
  return {
    mark: markOf(view, centre), members: all.slice(0, MEMBER_CAP), more: Math.max(0, all.length - MEMBER_CAP),
    hop, reach: hop === 0 ? reachOf(view, pkg!) : 0,
  };
}

// reachOf counts the packages that import pkg, directly or not, over head's
// imports: a removed import is base's.
const importers = new WeakMap<View, Map<string, string[]>>();
function reachOf(view: View, pkg: string): number {
  let by = importers.get(view);
  if (!by) {
    by = new Map();
    for (const e of view.edges) {
      if (e.kind !== "imports" || e.status === "removed") continue;
      const from = by.get(e.to);
      if (from) from.push(e.from);
      else by.set(e.to, [e.from]);
    }
    importers.set(view, by);
  }
  const seen = new Set([pkg]);
  for (const id of seen) for (const from of by.get(id) ?? []) seen.add(from);
  return seen.size - 1;
}

// screenOf is the Screen of centre (a centreOf id); all draws every box of
// both rows.
export function screenOf(within: View, centre: string, all = false): Screen {
  const view = screenView(within);
  const c = index(view).node.get(centre)!;
  const grain: Grain = c.kind === "package" || c.kind === "external" ? "package" : "declaration";
  const kinds: ViewEdge["kind"][] = grain === "package" ? ["imports"] : ["calls", "embeds"];
  const boxOf = (id: string) => (grain === "package" ? id : (typeOf(view, id) ?? id));
  const above = new Map<string, Tally>();
  const below = new Map<string, Tally>();
  const ghosts = { above: [] as string[], below: [] as string[] };
  for (const e of view.edges) {
    if (!kinds.includes(e.kind)) continue;
    const [from, to] = [boxOf(e.from) === centre, boxOf(e.to) === centre];
    if (from === to) continue; // inside the Centre, or away from it
    const [rows, end] = to ? [above, e.from] : [below, e.to];
    const id = boxOf(end);
    const t = rows.get(id) ?? { refs: 0, ends: new Set<string>(), embeds: false, edges: [] };
    t.refs += e.count;
    t.ends.add(end);
    t.embeds ||= e.kind === "embeds";
    t.edges.push(e);
    rows.set(id, t);
    // A reversed import is head's; base had it the other way round.
    if (e.status === "reversed") (to ? ghosts.below : ghosts.above).push(id);
  }
  let [unresolved, offIn, offOut] = [0, 0, 0];
  if (grain === "declaration") {
    unresolved = index(view).node.get(packageOf(view, centre) ?? "")?.unresolved ?? 0;
    for (const n of view.nodes) {
      if (n.id !== centre && typeOf(view, n.id) !== centre) continue;
      offIn += n.offIn ?? 0;
      offOut += n.offOut ?? 0;
    }
  }
  return {
    centre, kind: c.kind, grain,
    above: rowOf(view, above, below, grain, false, all, ghosts.above),
    below: rowOf(view, below, above, grain, true, all, ghosts.below),
    unresolved, offIn, offOut,
    ...(view.kind === "change" ? { change: changeOf(view, centre, c.kind) } : {}),
  };
}

// placesOf is where the calls and embeds a Screen box's line stands for are
// written (19, code.ts behind): drawn is the box's id or its line's ("up:X",
// "up:X>", ">down:X"). It is null for the Centre, a "+N more" chip and a
// Screen of imports, which light no line.
export function placesOf(within: View, centre: string, drawn: string): Loc[] | null {
  const view = screenView(within);
  const { node } = index(view);
  const kind = node.get(centre)?.kind;
  const box = drawn.replace(/^>|>$/g, "");
  const [up, id] = box.startsWith("up:") ? [true, box.slice(3)] : box.startsWith("down:") ? [false, box.slice(5)] : [false, ""];
  if ((kind !== "type" && kind !== "function") || !node.has(id)) return null;
  const boxOf = (x: string) => typeOf(view, x) ?? x;
  const [c, far] = [(x: string) => boxOf(x) === centre, (x: string) => boxOf(x) === id];
  return up ? behind(view, far, c) : behind(view, c, far);
}

// Drawing a Screen: no ELK. Each row is lines of boxes, heaviest first, each
// line centred under or over the Centre and at most ROW_MAX wide; the first
// line of a row is the one nearest the Centre, and each line is laid out
// from its middle (outward).
export const GAP_ROW = 72; // between the Centre and a row's first line
const GAP_LINE = 12; // between the lines of a row
const GAP_BOX = 16; // between the boxes of a line
// The label px, as in styles.css: small is .node's own size, so the floor zoom
// (viewport.ts FLOOR) draws no Screen label under READABLE_PX.
export const FONT: Record<Size | "centre", number> = { small: 12, medium: 13, large: 15, centre: 15 };
const MIN_W: Record<Size | "centre", number> = { small: 72, medium: 90, large: 120, centre: 160 };
const SMALL_PX = 11; // .screen-box .sub and .facts
const LINE = 14; // a .sub or .facts line

// Drawn is one box of a Screen as React Flow draws it. A box in both rows is
// drawn twice: id is its row's prefix and the node's id ("up:", "down:"); ref
// is the node it draws, or null for a "+N more" chip. 18: mark, ghost and
// status are its Box's; members are the Centre's lines, "~ Get". A line
// carries its box's status, ghost and violation.
export type Drawn = {
  id: string; ref: string | null; row: "above" | "centre" | "below"; kind: NodeKind | "more";
  label: string; sub: string; facts: string; size: Size | "centre"; both: boolean;
  mark: string; ghost: boolean; status?: string; members: string[];
  x: number; y: number; w: number; h: number;
};
export type ScreenEdge = { id: string; from: string; to: string; status?: string; ghost?: true; violation?: true };
export type ScreenDrawing = { nodes: Drawn[]; edges: ScreenEdge[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// factsOf says what a box's Weight is made of.
export const factsOf = (grain: Grain, b: Box): string =>
  grain === "package" ? plural(b.refs, "file", "files")
    : `${plural(b.refs, "use", "uses")} · ${plural(b.members, "declaration", "declarations")}`;

function sized(d: Omit<Drawn, "w" | "h" | "x" | "y">): Drawn {
  const text = Math.max(
    textWidth(d.label) * (FONT[d.size] / LABEL_PX),
    (Math.max(textWidth(d.sub), textWidth(d.facts), ...d.members.map(textWidth)) * SMALL_PX) / LABEL_PX,
  );
  const lines = (d.sub ? 1 : 0) + (d.facts ? 1 : 0) + d.members.length;
  return { ...d, x: 0, y: 0, w: Math.max(MIN_W[d.size], Math.ceil(text + INSET)), h: Math.ceil(FONT[d.size] * 1.4) + 16 + LINE * lines };
}

// lines wraps a row's boxes, in order, into lines at most ROW_MAX wide.
function lines(boxes: Drawn[]): Drawn[][] {
  const out: Drawn[][] = [];
  let width = 0;
  for (const b of boxes) {
    const last = out[out.length - 1];
    if (last && width + GAP_BOX + b.w <= ROW_MAX) {
      last.push(b);
      width += GAP_BOX + b.w;
    } else {
      out.push([b]);
      width = b.w;
    }
  }
  return out;
}

// outward orders a line from its middle: its heaviest box there, the next
// right of it, the next left, and so on, so the floor zoom, centred on the
// Centre, shows the heaviest boxes. A "+N more" chip ends the line.
function outward(line: Drawn[]): Drawn[] {
  const out: Drawn[] = [];
  line.filter((b) => b.ref !== null).forEach((b, i) => (i % 2 === 0 ? out.unshift(b) : out.push(b)));
  return [...out, ...line.filter((b) => b.ref === null)];
}

// placeScreen places a Screen: the Centre's top-left at (-w/2, 0), the rows
// above and below it, and a line from each box to the Centre or from the
// Centre to it.
export function placeScreen(s: Screen): ScreenDrawing {
  const c = s.change;
  const centre = sized({
    id: s.centre, ref: s.centre, row: "centre", kind: s.kind, label: s.centre, sub: "",
    facts: s.grain === "package" ? "imports" : "calls and embeds", size: "centre", both: false,
    mark: c?.mark ?? "", ghost: false,
    members: c ? [...c.members.map((m) => `${m.sign} ${m.label}`), ...(c.more > 0 ? [`+${c.more} more`] : [])] : [],
  });
  centre.x = -centre.w / 2;
  const nodes: Drawn[] = [centre];
  const edges: ScreenEdge[] = [];
  for (const [row, r, prefix] of [["above", s.above, "up:"], ["below", s.below, "down:"]] as const) {
    const drawn = r.boxes.map((b) => sized({
      id: prefix + b.id, ref: b.id, row, kind: b.kind, label: b.label, sub: b.sub,
      facts: b.ghost ? "⇄ in base" : (b.both ? "↻ " : "") + factsOf(s.grain, b), size: b.size, both: b.both,
      mark: b.mark, ghost: b.ghost, status: b.status, members: [],
    }));
    if (r.more > 0) drawn.push(sized({ id: prefix + "#more", ref: null, row, kind: "more", label: `+${r.more} more`, sub: "", facts: "", size: "small", both: false, mark: "", ghost: false, members: [] }));
    let edge = row === "above" ? -GAP_ROW : centre.h + GAP_ROW; // the line's side nearest the Centre
    for (const line of lines(drawn).map(outward)) {
      let x = -(line.reduce((w, b) => w + b.w, 0) + GAP_BOX * (line.length - 1)) / 2;
      const h = Math.max(...line.map((b) => b.h));
      for (const b of line) {
        [b.x, b.y] = [x, row === "above" ? edge - b.h : edge];
        x += b.w + GAP_BOX;
      }
      edge += row === "above" ? -(h + GAP_LINE) : h + GAP_LINE;
    }
    nodes.push(...drawn);
    for (const b of r.boxes) {
      const id = prefix + b.id;
      const marks = {
        ...(b.status ? { status: b.status } : {}), ...(b.ghost ? { ghost: true as const } : {}),
        ...(b.violation ? { violation: true as const } : {}),
      };
      edges.push(row === "above" ? { id: `${id}>`, from: id, to: centre.id, ...marks } : { id: `>${id}`, from: centre.id, to: id, ...marks });
    }
  }
  return { nodes, edges };
}

// screenNote says what a Screen's rows and sizes are, and what it leaves out
// (silence is how a diagram lies): calls and embeds, into it and out of it,
// with declarations the page does not hold, and its package's Unresolved
// Calls (ADR 0002). 18: in a Change View, where the Centre's package sits in
// the Affected Set (ADR 0009).
export function screenNote(s: Screen): string {
  return (s.grain === "package" ? "Above: what imports it. Below: what it imports. Size: files that import." : declNote(s)) + affectedNote(s);
}

function declNote(s: Screen): string {
  const uses = (n: number, way: string) => n > 0 && `${plural(n, "call or embed", "calls and embeds")} ${way}`;
  const off = [uses(s.offIn, "into it"), uses(s.offOut, "out of it")].filter(Boolean);
  const out = [
    off.length > 0 && `${off.join(" and ")}, with ${s.change ? "unchanged declarations more than one call or embed from the change" : "declarations in packages not included (re-run with -include)"}`,
    s.unresolved > 0 && `${plural(s.unresolved, "unresolved call", "unresolved calls")} in its package`,
  ].filter(Boolean);
  return "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations)."
    + (out.length ? ` Not drawn: ${out.join("; ")}.` : "");
}

function affectedNote(s: Screen): string {
  const c = s.change;
  if (!c || s.kind === "external") return "";
  // A Centre marked removed with no hop is in a removed package: base's only.
  const where = c.hop === undefined ? (c.mark === "st-removed" ? "removed, so not in it (the Affected Set is head's)" : "not in it")
    : c.hop > 0 ? `${plural(c.hop, "import", "imports")} from a changed package`
    : `changed; ${c.reach === 0 ? "no package imports it" : `${plural(c.reach, "package imports", "packages import")} it, directly or not`}`;
  return ` Affected Set${s.grain === "declaration" ? " (its package)" : ""}: ${where}.`;
}
