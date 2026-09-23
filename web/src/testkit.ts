// Builders for synthetic Views in unit tests (not bundled: only *.test.ts import it).
import type { View, ViewEdge, ViewNode } from "./data";
import { bundlesOver, externalsOf } from "./bundle";
import { cut } from "./cut";

const loc = { path: "x.go", line: 1 };

export const pkgs = (ids: string[], module: string, extra: Partial<ViewNode> = {}): ViewNode[] =>
  ids.map((id) => ({ id, kind: "package", module, loc, ...extra }));

export const exts = (ids: string[]): ViewNode[] => ids.map((id) => ({ id, kind: "external", loc }));

export const decl = (id: string, parent: string, kind: "type" | "function" = "type"): ViewNode =>
  ({ id, kind, parent, loc });

export const edge = (from: string, to: string, kind: ViewEdge["kind"] = "imports"): ViewEdge =>
  ({ from, to, kind, count: 1, loc });

export const view = (nodes: ViewNode[], edges: ViewEdge[] = []): View => ({
  schema: "1", kind: "project", tool: "", head: { commit: "", dirty: false },
  modules: [...new Set(nodes.map((n) => n.module ?? "").filter(Boolean))].sort(),
  nodes, edges, sources: {},
  honesty: { parseErrors: [], unresolvedCalls: 0, unresolvedImports: 0, unsupported: {} },
});

// 04's tree API (Task 3), kept for 04's tree tests once no page code needs it.
export const leavesAt = (v: View, focus: string, d: number): string[] => {
  const c = cut(v, focus, d);
  return c.noDetail ? [] : c.leaves;
};
export const containers = (v: View, focus: string, d: number) => {
  const c = cut(v, focus, d);
  return c.containers.map((id) => ({ id, parent: c.parent.get(id) ?? "" }));
};
export const bundles = (v: View, focus: string, d: number) =>
  bundlesOver(v, cut(v, focus, d)).map(({ from, to, pairs, status }) => ({ from, to, pairs, ...(status ? { status } : {}) }));
export const touchedExternals = (v: View, focus: string, d: number) => externalsOf(v, bundlesOver(v, cut(v, focus, d)));
export const declLeaves = (v: View, pkg: string) =>
  v.nodes.filter((n) => (n.kind === "type" || n.kind === "function") && n.parent === pkg).map((n) => n.id).sort();
export const methodsOf = (v: View, type: string) =>
  v.nodes.filter((n) => n.kind === "function" && n.parent === type).map((n) => n.id).sort();
