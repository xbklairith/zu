// Header text: what the view is, what it leaves out, and where the reader is.
import type { View } from "./data";
import { BOX_BUDGET, parentBox } from "./tree";

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
export function breadcrumb(view: View, focus: string): Crumb[] {
  const path: string[] = [];
  for (let b = focus; b !== ""; b = parentBox(view, b)) path.unshift(b);
  const crumbs: Crumb[] = [{ id: "", label: "root" }];
  for (const id of path) {
    const parent = crumbs[crumbs.length - 1].id;
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
export function depthNote(boxes: number, depth: number, auto = true, from = depth): string {
  const how = from !== depth ? ` (collapsed from ${from})` : auto ? "" : " (chosen)";
  const note = `${boxes} boxes at depth ${depth}${how}. Double-click to open a box, Esc to go up.`;
  return boxes > BOX_BUDGET ? `${note} More than ${BOX_BUDGET} boxes, drawn anyway.` : note;
}
