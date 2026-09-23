// Builders for synthetic Views in unit tests (not bundled: only *.test.ts import it).
import type { View, ViewEdge, ViewNode } from "./data";

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
