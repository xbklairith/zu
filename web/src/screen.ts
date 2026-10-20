// 17: the Screen (glossary: Screen, Centre, Weight). One node, the Centre,
// with what depends on it in the row above and what it depends on in the row
// below, after codezoom's screens. A pure function of the View and the hash:
// rows come only from the View's edges.
import type { NodeKind, View, ViewEdge } from "./data";
import { cmp, index, packageOf, PKG } from "./cut";

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
