// U6: uml-viewer's declutter cycle, as unclebob/uml-viewer defines it in
// src/uml_viewer/domain/hierarchy.clj (`declutter-modes`, `apply-declutter`):
// - full: every bundle between leaves is a line;
// - arrows (`collapse-arrows`): one arrow per direction between containers; a
//   leaf's edges attach to its container, and edges inside one container go;
// - triangles: arrows, drawn as triangles on the boxes instead of lines;
// - elements (`hide-elements`): arrows as lines, method rows hidden;
// - classes (`hide-classes`): elements, and every leaf folds into its container.
// With one container or none (uml-viewer's single wrapping package), arrows
// equals full and classes only hides rows. "Hide edges" (lines = false) draws
// triangles at any stage. A pinned bundle (a violation, from 06) stays red:
// as a red line, or as red triangles where lines are hidden.
import { statusOf, type Bundle } from "./bundle";
import { cmp } from "./cut";
import type { Stage } from "./state";

export type Pin = (b: Bundle) => boolean;
export const NO_PINS: Pin = () => false;

// Arrow is one drawn edge: the bundles it carries, merged per direction.
export type Arrow = Bundle & { pinned: boolean; carries: Bundle[] };
export type Mark = { in: boolean; out: boolean; inPinned: boolean; outPinned: boolean };

export type Decluttered = {
  lift: (id: string) => string; // where a leaf's edges attach
  folded: (id: string) => boolean; // a leaf hidden inside its container
  arrows: Arrow[];
  lines: boolean; // false: draw marks instead of lines
  rows: boolean; // method rows inside types
  marks: Map<string, Mark>; // incoming (top) and outgoing (bottom) triangles, when !lines
};

export function declutter(
  stage: Stage, lines: boolean, bundles: readonly Bundle[],
  leaves: readonly string[], parent: ReadonlyMap<string, string>, pin: Pin,
): Decluttered {
  const up = (id: string) => parent.get(id) ?? "";
  const leaf = new Set(leaves);
  const multi = new Set(leaves.map(up).filter((p) => p !== "")).size > 1;
  const lift = (id: string) => (stage !== "full" && multi && leaf.has(id) && up(id) !== "" ? up(id) : id);
  const folded = (id: string) => stage === "classes" && multi && leaf.has(id) && up(id) !== "";

  const merged = new Map<string, Arrow>();
  for (const b of bundles) {
    const from = lift(b.from);
    const to = lift(b.to);
    if (from === to) continue;
    const key = from + "\n" + to;
    const a = merged.get(key) ?? { from, to, pairs: 0, members: [], pinned: false, carries: [] };
    a.carries.push(b);
    a.members.push(...b.members);
    a.pinned ||= pin(b);
    merged.set(key, a);
  }
  const arrows = [...merged.values()].sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to));
  for (const a of arrows) {
    a.pairs = new Set(a.members.map((e) => e.from + "\n" + e.to)).size;
    const st = statusOf(a.members);
    if (st) a.status = st;
  }

  const drawLines = lines && stage !== "triangles";
  const marks = new Map<string, Mark>();
  const mark = (id: string, dir: "in" | "out", pinned: boolean) => {
    const m = marks.get(id) ?? { in: false, out: false, inPinned: false, outPinned: false };
    m[dir] = true;
    if (pinned) m[dir === "in" ? "inPinned" : "outPinned"] = true;
    marks.set(id, m);
  };
  if (!drawLines) {
    for (const a of arrows) {
      for (const b of [a, ...a.carries]) {
        const p = b === a ? a.pinned : pin(b);
        mark(b.from, "out", p);
        mark(b.to, "in", p);
      }
    }
  }
  return { lift, folded, arrows, lines: drawLines, rows: stage === "full" || stage === "arrows" || stage === "triangles", marks };
}
