// 07: a Proposal drawn on request (ADR 0008): the real packages regrouped into
// one box per layer, inner first, and an Unassigned box, with the ranks and
// violations internal/export evaluated for the Proposal. The page draws the
// View this returns with the same scene, so depth, declutter, selection and
// badges all work; the page never evaluates a rule itself.
import type { View, ViewEdge, ViewNode } from "./data";
import { knownIds } from "./scene";
import { decodeHash, type ViewState } from "./state";

// PROPOSAL_NOTICE is uml-viewer's banner (policy.clj proposal-notice, l.62).
export const PROPOSAL_NOTICE = "PROPOSAL — not instantiated in code";
export const UNASSIGNED = "proposal:unassigned";
export const layerBox = (i: number) => `proposal:${i}`;

const under = (id: string, prefix: string) => id === prefix || id.startsWith(prefix + "/");

// relative is an id as drawn at the top of a layer: without its module path.
const relative = (id: string, module: string | undefined) =>
  module && id.startsWith(module + "/") ? id.slice(module.length + 1) : id;

const cache = new WeakMap<View, Map<string, View>>();

// proposalView is view regrouped by the Proposal named name, or view itself
// when it has no such Proposal. A ranked package hangs under the longest
// member of its layer that covers it, with the real boxes between them
// (hierarchy.clj proposal-view, l.479: layers hold the real modules their
// members claim); an unranked one sits in Unassigned. Omitted packages go,
// with their declarations and edges.
export function proposalView(view: View, name: string): View {
  const hit = cache.get(view)?.get(name);
  if (hit) return hit;
  const p = view.policy?.proposals?.find((x) => x.name === name);
  if (!p) return view;
  const omitted = (id: string) => (p.omit ?? []).some((o) => under(id, o));
  const parent: Record<string, string> = {};
  const label: Record<string, string> = { [UNASSIGNED]: "Unassigned" };
  p.layers.forEach((l, i) => (label[layerBox(i)] = l.name));
  const kept = new Set<string>();
  const used = new Set<string>();
  for (const n of view.nodes) {
    if (n.kind !== "package" || omitted(n.id)) continue;
    kept.add(n.id);
    const r = p.ranks[n.id];
    const root = r === undefined ? undefined
      : p.layers[r].members.filter((m) => under(n.id, m)).sort((a, b) => b.length - a.length)[0];
    if (root === undefined) {
      parent[n.id] = UNASSIGNED;
      label[n.id] = relative(n.id, n.module);
      used.add(UNASSIGNED);
      continue;
    }
    parent[root] = layerBox(r);
    label[root] = relative(root, n.module);
    used.add(layerBox(r));
    let up = root;
    for (const seg of n.id === root ? [] : n.id.slice(root.length + 1).split("/")) {
      parent[`${up}/${seg}`] = up;
      up = `${up}/${seg}`;
    }
  }
  for (const box of Object.keys(label)) if (box.startsWith("proposal:") && !used.has(box)) delete label[box];
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const pkgOf = (n: ViewNode): string | undefined => {
    let x: ViewNode | undefined = n;
    while (x && x.kind !== "package") x = x.parent ? byId.get(x.parent) : undefined;
    return x?.id;
  };
  const nodes: ViewNode[] = [];
  for (const n of view.nodes) {
    if (n.kind === "external") nodes.push(n);
    else if (n.kind === "package" && kept.has(n.id)) {
      const { rank: _, ...rest } = n;
      nodes.push(p.ranks[n.id] === undefined ? rest : { ...rest, rank: p.ranks[n.id] });
    } else if (n.kind !== "package" && kept.has(pkgOf(n) ?? "")) nodes.push(n);
  }
  const ids = new Set(nodes.map((n) => n.id));
  const bad = new Set(p.violations.map((e) => `${e.from}\n${e.to}`));
  const edges: ViewEdge[] = [];
  for (const e of view.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const { violation: _, ...rest } = e;
    edges.push(e.kind === "imports" && bad.has(`${e.from}\n${e.to}`) ? { ...rest, violation: "levels" } : rest);
  }
  const out: View = { ...view, nodes, edges, regroup: { parent, label } };
  if (!cache.has(view)) cache.set(view, new Map());
  cache.get(view)!.set(name, out);
  return out;
}

// readHash decodes a hash in two passes: the Proposal first, then the focus,
// toggles and selection against the tree that Proposal draws.
export function readHash(hash: string, view: View): ViewState {
  const s = decodeHash(hash, knownIds(view));
  return s.proposal === null ? s : decodeHash(hash, knownIds(proposalView(view, s.proposal)));
}
