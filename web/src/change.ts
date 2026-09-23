// The Change View's marks and its opening subgraph. Pure functions over a
// View whose statuses, Moves and hops come from zu diff (Go), never from here.
import type { View, ViewNode } from "./data";

// nodeMark is the class a node is drawn with: its Change Status, a Move, or
// membership of the Affected Set (an unchanged package with a hop).
export function nodeMark(n: ViewNode): string {
  if (n.status) return `st-${n.status}`;
  if (n.movedFrom) return "st-moved";
  if (n.hop !== undefined && n.hop > 0) return "affected";
  return "";
}

const SIGNS: Record<string, string> = { added: "+", removed: "−", reversed: "⇄", mixed: "±" };

// edgeMark is the class and label sign of a bundle with this status.
export function edgeMark(status: string | undefined): { cls: string; sign: string } {
  return status && SIGNS[status] ? { cls: `edge-${status}`, sign: SIGNS[status] } : { cls: "", sign: "" };
}

// packageOfDecl walks a declaration's parents to its package.
export function packageOfDecl(byId: Map<string, ViewNode>, id: string): string | null {
  for (let n = byId.get(id); n; n = n.parent ? byId.get(n.parent) : undefined) {
    if (n.kind === "package") return n.id;
  }
  return null;
}

// changedSubgraph is the opening view (Q4): the changed packages, the
// packages one hop away in the Affected Set, the far end of every changed
// import, the externals they import, and the edges among what is kept.
export function changedSubgraph(view: View): View {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const keep = new Set<string>();
  for (const n of view.nodes) {
    if (n.kind === "package" && (n.status || (n.hop !== undefined && n.hop <= 1) || view.changed?.includes(n.id))) keep.add(n.id);
  }
  // Both ends of a changed import are part of the change, near or not.
  for (const e of view.edges) {
    if (e.kind === "imports" && e.status && (keep.has(e.from) || keep.has(e.to))) {
      keep.add(e.from);
      keep.add(e.to);
    }
  }
  for (const n of view.nodes) {
    if (n.kind === "type" || n.kind === "function") {
      const p = packageOfDecl(byId, n.id);
      if (p !== null && keep.has(p)) keep.add(n.id);
    }
  }
  for (const e of view.edges) {
    if (e.kind !== "imports") continue;
    if (keep.has(e.from) && byId.get(e.to)?.kind === "external") keep.add(e.to);
  }
  return {
    ...view,
    nodes: view.nodes.filter((n) => keep.has(n.id)),
    edges: view.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

// unchangedCount is how many of a package's declarations the view does not
// draw: its decls count (head) minus the head declarations present.
export function unchangedCount(view: View, pkg: string): number {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const total = byId.get(pkg)?.decls ?? 0;
  let drawn = 0;
  for (const n of view.nodes) {
    if ((n.kind === "type" || n.kind === "function") && n.status !== "removed" && packageOfDecl(byId, n.id) === pkg) drawn++;
  }
  return Math.max(0, total - drawn);
}
