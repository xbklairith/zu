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

const pad = (i: number) => String(i).padStart(2, "0");

// town: eighteen boxes under m, each of two to four packages; every fourth
// nests two more under its first, every fifth has a package of its own.
// Imports run between the boxes' packages, in a ring and across it, so
// opening a box splits the bundles that met it; m/testdata is demoted and
// m/k02 uses one external over two packages.
const K = 18;
const box = (i: number) => `m/k${pad(i % K)}`;
export function town(): View {
  const nodes: ViewNode[] = [];
  const edges: ViewEdge[] = [];
  for (let i = 0; i < K; i++) {
    const b = box(i);
    if (i % 5 === 0) nodes.push(...pkgs([b], "m", { decls: 2 }));
    for (let j = 0; j < 2 + (i % 3); j++) nodes.push(...pkgs([`${b}/s${j}`], "m", { decls: ((i * 3 + j) % 7) + 1 }));
    if (i % 4 === 0) nodes.push(...pkgs([`${b}/s0/u`, `${b}/s0/v`], "m", { decls: 3 }));
    edges.push(edge(`${b}/s0`, `${box(i + 1)}/s1`), edge(`${b}/s1`, `${box(i * 7 + 3)}/s0`));
    if (i % 4 === 0) edges.push(edge(`${b}/s0/u`, `${box(i + 5)}/s0`), edge(`${box(i + 9)}/s1`, `${b}/s0/v`));
  }
  nodes.push(...pkgs(["m/testdata/a", "m/testdata/b"], "m", { demoted: "name" }), ...exts(["github.com/x/y"]));
  edges.push(edge("m/k03/s0", "m/testdata/a"), edge("m/k02/s0", "github.com/x/y"), edge("m/k02/s1", "github.com/x/y"));
  // m/k01/s0 uses two packages of m/k02: one bundle of two pairs while m/k02
  // is closed, two of one pair each once it opens.
  edges.push(edge("m/k01/s0", "m/k02/s0"));
  return view(nodes, edges);
}

// nested: the root module k at the page root, beside the modules it uses (12, R5).
export const nested = view([
  ...pkgs(["k/cmd", "k/pkg/a", "k/pkg/b", "k/pkg/c/d", "k/pkg/c/e"], "k"),
  ...pkgs(["api/v1", "api/v2"], "api"),
  ...pkgs(["client"], "client"),
], [edge("k/cmd", "k/pkg/a"), edge("k/pkg/a", "api/v1"), edge("k/pkg/b", "k/pkg/c/d"), edge("client", "api/v1"), edge("k/pkg/c/e", "api/v2")]);
