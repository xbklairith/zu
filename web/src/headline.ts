// Header text: what the view is, what it leaves out, and where the reader is.
import type { View } from "./data";
import { DEPTH_LEAVES, parentBox } from "./tree";

const PKG = "#pkg";

export function title(view: View): string {
  const shown = view.modules.slice(0, 3).join(", ");
  const more = view.modules.length > 3 ? ` +${view.modules.length - 3}` : "";
  const at = view.head.commit
    ? view.head.commit.slice(0, 12) + (view.head.dirty ? ", uncommitted changes" : "")
    : "worktree";
  const kind = view.kind === "change" ? "Change View" : "Project View";
  return `${kind} · ${shown}${more} @ ${at}`;
}

export function honestyLine(view: View): string {
  const h = view.honesty;
  const unsupported = Object.keys(h.unsupported)
    .sort()
    .map((k) => `${k} ${h.unsupported[k]}`)
    .join(", ");
  return [
    `${h.parseErrors.length} parse errors`,
    `${h.unresolvedCalls} unresolved calls not drawn`,
    `${h.unresolvedImports} unresolved imports`,
    `unsupported: ${unsupported || "none"}`,
  ].join(" · ");
}

export type Crumb = { id: string; label: string };

// breadcrumb lists the boxes from the page root down to focus.
// With a home (11, cut.ts), the page root is drawn as home: the trail starts
// there, named by its id, and its link goes to the page root.
export function breadcrumb(view: View, focus: string, home = ""): Crumb[] {
  const path: string[] = [];
  for (let b = focus; b !== "" && b !== home; b = parentBox(view, b)) path.unshift(b);
  const crumbs: Crumb[] = [{ id: "", label: home || "root" }];
  for (const id of path) {
    const parent = crumbs.length === 1 ? home : crumbs[crumbs.length - 1].id;
    let label: string;
    const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
    if (named !== undefined) label = named;
    else if (id.endsWith(PKG)) label = `${id.slice(id.lastIndexOf("/") + 1, -PKG.length)} (package)`;
    else if (parent === "" || !id.startsWith(parent + "/")) label = id;
    else label = id.slice(parent.length + 1);
    crumbs.push({ id, label });
  }
  return crumbs;
}

// auto is false when the reader chose the depth (A6), which the note says.
// from is the requested depth; when a large view was drawn shallower
// (Deviation 8), the note says that instead.
// folded (12) is how many boxes the Budget folded into "+N more" chips.
export function depthNote(boxes: number, depth: number, auto = true, from = depth, folded = 0): string {
  const how = from !== depth ? ` (collapsed from ${from})` : auto ? "" : " (chosen)";
  const fold = folded > 0 ? `, ${folded} boxes folded` : "";
  const note = `${boxes} boxes at depth ${depth}${how}${fold}. Double-click to open a box, Esc to go up.`;
  return boxes > DEPTH_LEAVES ? `${note} More than ${DEPTH_LEAVES} boxes, drawn anyway.` : note;
}

// edgesNote says what auto left out (11): the lines, and how to see a box's own.
export const edgesNote = (hidden: number): string =>
  `${hidden} ${hidden === 1 ? "dependency" : "dependencies"} hidden; select or hover a box to see its own.`;

// againstNote counts the dependencies that point up the rows (11): those the
// ranking set aside to break a cycle between boxes, and nothing when there
// are none. No colour marks them.
export const againstNote = (n: number): string =>
  n === 0 ? "" : `${n} ${n === 1 ? "dependency runs" : "dependencies run"} against the order.`;

// violationsNote words the Change View's violations section as zu diff's
// violationsBlock does (internal/diff/violations.go): new first, then the rest.
export function violationsNote(d: NonNullable<View["violations"]>): { heading: string; tail: string } {
  return {
    heading: d.new.length === 0 ? "No new violations" : `New violations (${d.new.length})`,
    tail: `${d.fixed.length} fixed, ${d.known} pre-existing`,
  };
}

// redLegend says what a red edge or box violates: the Policy's Levels and
// cycles, or, while a Proposal is drawn, only that Proposal's layers.
export const redLegend = (proposal: string | null): string =>
  `violates ${proposal === null ? "zu.policy.yaml (levels or cycle)" : `Proposal ${proposal}'s layers`}; a red box holds one`;
