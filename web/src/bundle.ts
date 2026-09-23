// Edges of one cut, bundled between drawn nodes (04's rules, plus members and
// the externals toggle).
import type { View, ViewEdge } from "./data";
import { cmp, index, leafOf, type Cut } from "./cut";

export const EXTERNALS = "externals"; // the aggregate when a cut touches too many externals
export const EXTERNAL_BUDGET = 20;

// Bundle is every IR edge between two drawn nodes; pairs counts distinct
// from/to node pairs among its members. status is the Change Status its
// members share (04 Part B), "mixed" when they differ, absent when none changed.
export type Bundle = { from: string; to: string; pairs: number; members: ViewEdge[]; status?: string };

// statusOf is a bundle's status: the one status all members share, or "mixed"
// when changed members disagree or sit beside unchanged ones.
export function statusOf(members: readonly ViewEdge[]): string | undefined {
  const st = new Set(members.map((e) => e.status ?? ""));
  if (st.size === 1) return [...st][0] || undefined;
  return [...st].some((x) => x !== "") ? "mixed" : undefined;
}

// bundlesOver maps each edge's ends to drawn nodes and groups them.
// - Package cut: imports; packages go to their leaf or "outside", externals to
//   themselves, or all to "externals" when more than 20 are touched.
// - Declaration cut: calls and embeds between the package's declarations; a
//   method goes to its type.
// An edge is kept only when one end is a drawn leaf, so outside→outside and
// outside→external never show. Self-loops are dropped. Sorted by from, then to.
export function bundlesOver(view: View, c: Cut, opts: { externals: boolean } = { externals: true }): Bundle[] {
  const { node } = index(view);
  const leaves = new Set(c.leaves);
  const toLeaf = leafOf(view, c);
  const end = (id: string): string | null => {
    const n = node.get(id);
    if (!n) return null;
    if (c.decls) {
      const top = n.parent && leaves.has(n.parent) ? n.parent : id;
      return leaves.has(top) ? top : null;
    }
    if (n.kind === "external") return opts.externals ? id : null;
    return n.kind === "package" ? toLeaf(id) : null;
  };
  const kinds = c.decls ? ["calls", "embeds"] : ["imports"];
  const mapped: [string, string, ViewEdge][] = [];
  for (const e of view.edges) {
    if (!kinds.includes(e.kind)) continue;
    const from = end(e.from);
    const to = end(e.to);
    if (from === null || to === null || from === to || !(leaves.has(from) || leaves.has(to))) continue;
    mapped.push([from, to, e]);
  }
  const touched = new Set<string>();
  for (const [, , e] of mapped) for (const id of [e.from, e.to]) if (node.get(id)?.kind === "external") touched.add(id);
  const ext = (id: string) => (touched.size > EXTERNAL_BUDGET && touched.has(id) ? EXTERNALS : id);
  const groups = new Map<string, Bundle>();
  for (const [f, t, e] of mapped) {
    const from = ext(f);
    const to = ext(t);
    const key = from + "\n" + to;
    const b = groups.get(key) ?? { from, to, pairs: 0, members: [] };
    b.members.push(e);
    groups.set(key, b);
  }
  const out = [...groups.values()];
  for (const b of out) {
    b.members.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to) || cmp(x.kind, y.kind));
    b.pairs = new Set(b.members.map((e) => e.from + "\n" + e.to)).size;
    const st = statusOf(b.members);
    if (st) b.status = st;
  }
  return out.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to));
}

// externalsOf are the external modules a set of bundles touches, whether drawn
// as ovals or folded into "externals".
export function externalsOf(view: View, bundles: readonly Bundle[]): string[] {
  const { node } = index(view);
  const out = new Set<string>();
  for (const b of bundles) for (const e of b.members) for (const id of [e.from, e.to]) {
    if (node.get(id)?.kind === "external") out.add(id);
  }
  return [...out].sort(cmp);
}
