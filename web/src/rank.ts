// Architecture ranks (11): where the Policy gives no Levels, each drawn
// sibling set is ranked from the dependencies between its members, so that a
// dependency sits below what depends on it (decisions.md, Levels rule: level 0
// at the bottom). Only the layout reads them. They are not Levels: nothing is
// badged with them, and nothing is a violation because of them.
import { cmp } from "./cut";

// Arc is a dependency between two siblings; weight is how many package pairs
// it carries (a bundle's pairs), 1 when absent.
export type Arc = { from: string; to: string; weight?: number };

// tiers ranks one sibling set, in three steps, sorted by id at every choice so
// the same input always gives the same ranks:
//  1. strongly connected components (Tarjan). Go forbids import cycles between
//     packages, but boxes that each hold several packages can form them.
//  2. inside each component, the lighter arcs of its cycles are set aside:
//     Eades, Lin and Smyth's greedy order (1993) on arc weights, and an arc
//     that points back in that order does not rank.
//  3. the longest path down over the arcs that remain: a node that depends on
//     nothing among its siblings is 0, any other is one more than its highest
//     dependency.
// Arcs to ids outside the set, and self-loops, are ignored.
export const tiers = (ids: readonly string[], arcs: readonly Arc[]): Map<string, number> => ranks(ids, arcs).tiers;

// Ranks is a ranking and how many dependencies run against it: the sibling
// pairs whose arcs step 2 set aside, so they point up the rows (0 without a
// cycle). The header shows the count; nothing colours those arcs.
export type Ranks = { tiers: Map<string, number>; against: number };

// ranks is tiers with the count of pairs set aside.
export function ranks(ids: readonly string[], arcs: readonly Arc[]): Ranks {
  const nodes = [...new Set(ids)].sort(cmp);
  const known = new Set(nodes);
  const weight = new Map<string, number>(); // "from\nto" → summed weight
  for (const a of arcs) {
    if (!known.has(a.from) || !known.has(a.to) || a.from === a.to) continue;
    const k = a.from + "\n" + a.to;
    weight.set(k, (weight.get(k) ?? 0) + (a.weight ?? 1));
  }
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const k of [...weight.keys()].sort(cmp)) {
    const [f, t] = k.split("\n");
    out.get(f)!.push(t);
  }
  const comp = components(nodes, out);
  const order = new Map<string, number>();
  const members = new Map<number, string[]>();
  for (const n of nodes) {
    const c = comp.get(n)!;
    const l = members.get(c);
    if (l) l.push(n);
    else members.set(c, [n]);
  }
  for (const m of members.values()) if (m.length > 1) greedy(m, out, weight).forEach((n, i) => order.set(n, i));
  // ranks: arcs that point back inside a component are set aside.
  const down = (v: string) =>
    out.get(v)!.filter((w) => comp.get(w) !== comp.get(v) || order.get(v)! < order.get(w)!);
  const rank = new Map<string, number>();
  const visit = (v: string): number => {
    const hit = rank.get(v);
    if (hit !== undefined) return hit;
    // Iterative: a long chain must not overflow the stack.
    const work = [v];
    while (work.length) {
      const x = work[work.length - 1];
      const todo = down(x).filter((w) => !rank.has(w));
      if (todo.length) {
        work.push(...todo);
        continue;
      }
      work.pop();
      if (!rank.has(x)) rank.set(x, Math.max(-1, ...down(x).map((w) => rank.get(w)!)) + 1);
    }
    return rank.get(v)!;
  };
  let against = 0;
  for (const k of weight.keys()) {
    const [f, t] = k.split("\n");
    if (comp.get(f) === comp.get(t) && order.get(f)! > order.get(t)!) against++;
  }
  return { tiers: new Map(nodes.map((n) => [n, visit(n)])), against };
}

// components numbers the strongly connected components (Tarjan, iterative).
function components(nodes: readonly string[], out: ReadonlyMap<string, string[]>): Map<string, number> {
  const at = new Map<string, number>();
  const low = new Map<string, number>();
  const comp = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  let next = 0;
  let count = 0;
  const open = (v: string) => {
    at.set(v, next);
    low.set(v, next++);
    stack.push(v);
    on.add(v);
  };
  for (const root of nodes) {
    if (at.has(root)) continue;
    open(root);
    const work: [string, number][] = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const [v, i] = top;
      const succ = out.get(v)!;
      if (i < succ.length) {
        top[1]++;
        const w = succ[i];
        if (!at.has(w)) {
          open(w);
          work.push([w, 0]);
        } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, at.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work[work.length - 1][0];
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
      }
      if (low.get(v) === at.get(v)) {
        for (;;) {
          const w = stack.pop()!;
          on.delete(w);
          comp.set(w, count);
          if (w === v) break;
        }
        count++;
      }
    }
  }
  return comp;
}

// greedy is Eades, Lin and Smyth's order of one component: sinks go to the
// end, sources to the front, and otherwise the node whose outgoing weight
// most exceeds its incoming weight goes to the front. Ties: the smallest id.
function greedy(members: readonly string[], out: ReadonlyMap<string, string[]>, weight: ReadonlyMap<string, number>): string[] {
  const left = new Set(members);
  const inW = new Map(members.map((m) => [m, 0]));
  const outW = new Map(members.map((m) => [m, 0]));
  const into = new Map<string, string[]>(members.map((m) => [m, []]));
  for (const f of members) for (const t of out.get(f)!) {
    if (!left.has(t)) continue;
    const w = weight.get(f + "\n" + t)!;
    outW.set(f, outW.get(f)! + w);
    inW.set(t, inW.get(t)! + w);
    into.get(t)!.push(f);
  }
  const front: string[] = [];
  const back: string[] = [];
  const take = (v: string) => {
    left.delete(v);
    for (const t of out.get(v)!) if (left.has(t)) inW.set(t, inW.get(t)! - weight.get(v + "\n" + t)!);
    for (const f of into.get(v)!) if (left.has(f)) outW.set(f, outW.get(f)! - weight.get(f + "\n" + v)!);
  };
  const sorted = [...members].sort(cmp);
  while (left.size) {
    const rest = sorted.filter((m) => left.has(m));
    const sink = rest.find((m) => outW.get(m) === 0);
    if (sink !== undefined) {
      back.unshift(sink);
      take(sink);
      continue;
    }
    const source = rest.find((m) => inW.get(m) === 0);
    const best = source ?? rest.reduce((b, m) => (outW.get(m)! - inW.get(m)! > outW.get(b)! - inW.get(b)! ? m : b));
    front.push(best);
    take(best);
  }
  return [...front, ...back];
}

// siblingTiers ranks every sibling set of a drawn tree. parent maps each
// drawn node to its container ("" at the top). An arc between two drawn nodes
// counts between the two siblings that hold its ends under their lowest
// common container, and arcs lifted onto the same pair add their weights; an
// arc between a container and something inside it counts nowhere.
export const siblingTiers = (parent: ReadonlyMap<string, string>, arcs: readonly Arc[]): Map<string, number> =>
  siblingRanks(parent, arcs).tiers;

// siblingRanks is siblingTiers with the pairs set aside, summed over every
// sibling set these ranks place: a set the Policy's Levels place (placed(its
// container) is true) is drawn by those, so its pairs are not counted. It is
// the seam where a grouping (12) would rank its groups.
export function siblingRanks(
  parent: ReadonlyMap<string, string>, arcs: readonly Arc[], placed: (container: string) => boolean = () => false,
): Ranks {
  const chain = (id: string) => {
    const c: string[] = [];
    for (let x: string | undefined = id; x !== undefined && x !== ""; x = parent.get(x)) c.unshift(x);
    return c;
  };
  const kids = new Map<string, string[]>();
  for (const [id, p] of parent) {
    const l = kids.get(p);
    if (l) l.push(id);
    else kids.set(p, [id]);
  }
  const lifted = new Map<string, Arc[]>();
  for (const a of arcs) {
    if (!parent.has(a.from) || !parent.has(a.to)) continue;
    const [x, y] = [chain(a.from), chain(a.to)];
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    if (i === x.length || i === y.length) continue;
    const p = parent.get(x[i])!;
    const arc = { from: x[i], to: y[i], weight: a.weight ?? 1 };
    const l = lifted.get(p);
    if (l) l.push(arc);
    else lifted.set(p, [arc]);
  }
  const out = new Map<string, number>();
  let against = 0;
  for (const [p, ids] of kids) {
    const r = ranks(ids, lifted.get(p) ?? []);
    for (const [id, t] of r.tiers) out.set(id, t);
    if (!placed(p)) against += r.against;
  }
  return { tiers: out, against };
}
