// 17: the Screen (glossary: Screen, Centre, Weight). One node, the Centre,
// with what depends on it in the row above and what it depends on in the row
// below, after codezoom's screens. A pure function of the View and the hash:
// rows come only from the View's edges.
import type { NodeKind, View, ViewEdge } from "./data";
import { cmp, index, packageOf, PKG } from "./cut";
import { INSET, ROW_MAX, textWidth } from "./layout";
import { LABEL_PX } from "./viewport";

export const ROW_CAP = 24; // the boxes a row draws before "+N more"
export const LARGE_SHARE = 1 / 2; // of the row's heaviest Weight: drawn large
export const MEDIUM_SHARE = 1 / 5; // drawn medium; less is small
export const FLAT_ROW_MAX = 2; // a row whose heaviest weighs no more is drawn medium

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
};
export type Row = { boxes: Box[]; more: number }; // more: boxes past ROW_CAP, not drawn
export type Screen = {
  centre: string; kind: NodeKind; grain: Grain; above: Row; below: Row;
  unresolved: number; // declaration grain: the Centre's package's Unresolved Calls (ADR 0002)
  offIn: number; offOut: number; // declaration grain: calls and embeds with declarations not on this page
};

// typeOf is the type a method belongs to, or undefined.
function typeOf(view: View, id: string): string | undefined {
  const { node } = index(view);
  const n = node.get(id);
  return n?.kind === "function" && n.parent !== undefined && node.get(n.parent)?.kind === "type" ? n.parent : undefined;
}

// centreOf is the Centre a selection names: a package (its box "X#pkg" too),
// a type, a function or an external; a method names its type. Boxes that are
// not nodes, aggregates and groups name none, and a Change View has no
// Screen yet (18).
export function centreOf(view: View, id: string | null): string | null {
  if (id === null || view.kind === "change") return null;
  const n = index(view).node.get(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
  if (!n) return null;
  return typeOf(view, n.id) ?? n.id;
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

type Tally = { refs: number; ends: Set<string>; embeds: boolean };

function rowOf(view: View, tallies: Map<string, Tally>, other: Map<string, Tally>, grain: Grain, below: boolean, all: boolean): Row {
  const boxes: Box[] = [...tallies].map(([id, t]) => ({
    id, kind: index(view).node.get(id)!.kind, ...labelOf(view, id),
    refs: t.refs, members: t.ends.size,
    weight: grain === "package" ? t.refs : Math.sqrt(t.refs * t.ends.size),
    size: "medium" as Size, both: other.has(id),
  }));
  boxes.sort((a, b) => b.weight - a.weight || cmp(a.id, b.id));
  const max = boxes[0]?.weight ?? 0;
  for (const b of boxes) {
    b.size = b.kind === "external" ? "small" // a library is always small
      : max <= FLAT_ROW_MAX ? "medium"
      : b.weight >= max * LARGE_SHARE ? "large" : b.weight >= max * MEDIUM_SHARE ? "medium" : "small";
    if (below && b.size === "small" && b.kind !== "external" && tallies.get(b.id)!.embeds) b.size = "medium"; // what the Centre embeds
  }
  return all || boxes.length <= ROW_CAP ? { boxes, more: 0 } : { boxes: boxes.slice(0, ROW_CAP), more: boxes.length - ROW_CAP };
}

// screenOf is the Screen of centre (a centreOf id); all draws every box of
// both rows.
export function screenOf(view: View, centre: string, all = false): Screen {
  const c = index(view).node.get(centre)!;
  const grain: Grain = c.kind === "package" || c.kind === "external" ? "package" : "declaration";
  const kinds: ViewEdge["kind"][] = grain === "package" ? ["imports"] : ["calls", "embeds"];
  const boxOf = (id: string) => (grain === "package" ? id : (typeOf(view, id) ?? id));
  const above = new Map<string, Tally>();
  const below = new Map<string, Tally>();
  for (const e of view.edges) {
    if (!kinds.includes(e.kind)) continue;
    const [from, to] = [boxOf(e.from) === centre, boxOf(e.to) === centre];
    if (from === to) continue; // inside the Centre, or away from it
    const [rows, end] = to ? [above, e.from] : [below, e.to];
    const id = boxOf(end);
    const t = rows.get(id) ?? { refs: 0, ends: new Set<string>(), embeds: false };
    t.refs += e.count;
    t.ends.add(end);
    t.embeds ||= e.kind === "embeds";
    rows.set(id, t);
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
    above: rowOf(view, above, below, grain, false, all), below: rowOf(view, below, above, grain, true, all),
    unresolved, offIn, offOut,
  };
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
// is the node it draws, or null for a "+N more" chip.
export type Drawn = {
  id: string; ref: string | null; row: "above" | "centre" | "below"; kind: NodeKind | "more";
  label: string; sub: string; facts: string; size: Size | "centre"; both: boolean;
  x: number; y: number; w: number; h: number;
};
export type ScreenDrawing = { nodes: Drawn[]; edges: { id: string; from: string; to: string }[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// factsOf says what a box's Weight is made of.
export const factsOf = (grain: Grain, b: Box): string =>
  grain === "package" ? plural(b.refs, "file", "files")
    : `${plural(b.refs, "use", "uses")} · ${plural(b.members, "declaration", "declarations")}`;

function sized(d: Omit<Drawn, "w" | "h" | "x" | "y">): Drawn {
  const text = Math.max(
    textWidth(d.label) * (FONT[d.size] / LABEL_PX),
    (Math.max(textWidth(d.sub), textWidth(d.facts)) * SMALL_PX) / LABEL_PX,
  );
  const lines = (d.sub ? 1 : 0) + (d.facts ? 1 : 0);
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
  const centre = sized({
    id: s.centre, ref: s.centre, row: "centre", kind: s.kind, label: s.centre, sub: "",
    facts: s.grain === "package" ? "imports" : "calls and embeds", size: "centre", both: false,
  });
  centre.x = -centre.w / 2;
  const nodes: Drawn[] = [centre];
  const edges: ScreenDrawing["edges"] = [];
  for (const [row, r, prefix] of [["above", s.above, "up:"], ["below", s.below, "down:"]] as const) {
    const drawn = r.boxes.map((b) =>
      sized({ id: prefix + b.id, ref: b.id, row, kind: b.kind, label: b.label, sub: b.sub, facts: (b.both ? "↻ " : "") + factsOf(s.grain, b), size: b.size, both: b.both }));
    if (r.more > 0) drawn.push(sized({ id: prefix + "#more", ref: null, row, kind: "more", label: `+${r.more} more`, sub: "", facts: "", size: "small", both: false }));
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
    for (const b of drawn) {
      if (b.ref === null) continue;
      edges.push(row === "above" ? { id: `${b.id}>`, from: b.id, to: centre.id } : { id: `>${b.id}`, from: centre.id, to: b.id });
    }
  }
  return { nodes, edges };
}

// screenNote says what a Screen's rows and sizes are, and what it leaves out
// (silence is how a diagram lies): calls and embeds, into it and out of it,
// with declarations the page does not hold, and its package's Unresolved
// Calls (ADR 0002).
export function screenNote(s: Screen): string {
  if (s.grain === "package") return "Above: what imports it. Below: what it imports. Size: files that import.";
  const uses = (n: number, way: string) => n > 0 && `${plural(n, "call or embed", "calls and embeds")} ${way}`;
  const off = [uses(s.offIn, "into it"), uses(s.offOut, "out of it")].filter(Boolean);
  const out = [
    off.length > 0 && `${off.join(" and ")}, with declarations in packages not included (re-run with -include)`,
    s.unresolved > 0 && `${plural(s.unresolved, "unresolved call", "unresolved calls")} in its package`,
  ].filter(Boolean);
  return "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations)."
    + (out.length ? ` Not drawn: ${out.join("; ")}.` : "");
}
