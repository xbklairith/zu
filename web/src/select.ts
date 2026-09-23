// Selection: the N-hop neighbourhood of a set of seeds (the leaves under the
// selection). Direct neighbours (U4) are lit by scene() from the drawn arrows.
type Arc = { from: string; to: string };

// withinHops is every node at most n undirected hops from any seed, seeds included.
export function withinHops(arcs: readonly Arc[], seeds: Iterable<string>, n: number): Set<string> {
  const adj = new Map<string, string[]>();
  const add = (x: string, y: string) => {
    const l = adj.get(x);
    if (l) l.push(y);
    else adj.set(x, [y]);
  };
  for (const a of arcs) {
    add(a.from, a.to);
    add(a.to, a.from);
  }
  const seen = new Set(seeds);
  let ring = [...seen];
  for (let h = 0; h < n && ring.length; h++) {
    const next: string[] = [];
    for (const x of ring) {
      for (const y of adj.get(x) ?? []) {
        if (!seen.has(y)) {
          seen.add(y);
          next.push(y);
        }
      }
    }
    ring = next;
  }
  return seen;
}
