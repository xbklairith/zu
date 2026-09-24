// Edges on demand (11). A view with more lines than a reader can follow draws
// none at rest: each box's own lines appear when it is selected or hovered,
// dependencies and dependents in two styles. Lines never move a box: the
// layout reads ranks, not edges (layout.ts). The mode lives in the URL hash
// (state.ts): auto (the default), on, off (05's "hide edges": triangles).
import type { ViewEdge } from "./data";
import type { EdgeMode } from "./state";

// EDGE_LIMIT is the most lines auto draws at rest. Measured on the Test
// Corpus's default views (11 acceptance): zu 23 and cobra 6 stay drawn, hugo
// 260 and kubernetes 175 go on demand. At 40 or fewer, over at most 60 boxes
// (BOX_BUDGET), each line can still be followed from end to end.
export const EDGE_LIMIT = 40;

// quiet says auto hides the lines at rest: lines would be drawn (not off, not
// the triangles stage) and there are more than EDGE_LIMIT of them.
export const quiet = (mode: EdgeMode, lines: boolean, drawable: number): boolean =>
  mode === "auto" && lines && drawable > EDGE_LIMIT;

// always: an arrow auto draws even at rest. A violation (pinned, 06), a
// changed import (04: any Change Status), or an import that puts its importer
// in the Affected Set (affected, from the Change View's marks).
export const always = (
  a: { pinned: boolean; status?: string; members: readonly ViewEdge[] }, affected: (e: ViewEdge) => boolean,
): boolean => a.pinned || a.status !== undefined || a.members.some(affected);

export type Dir = "in" | "out";
type Drawable = { id: string; from: string; to: string };

// around are the edges of id, or of anything drawn inside it, each marked
// out (id depends on the other end) or in (the other end depends on id). An
// edge inside id is out. up is a drawn node's container, "" at the top.
export function around<E extends Drawable>(edges: readonly E[], id: string, up: (id: string) => string): (E & { dir: Dir })[] {
  const inside = (x: string) => {
    for (let y = x; y !== ""; y = up(y)) if (y === id) return true;
    return false;
  };
  const out: (E & { dir: Dir })[] = [];
  for (const e of edges) {
    if (inside(e.from)) out.push({ ...e, dir: "out" });
    else if (inside(e.to)) out.push({ ...e, dir: "in" });
  }
  return out;
}
