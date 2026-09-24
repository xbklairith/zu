// 06: the Policy's violations, drawn red through 05's pin hook. A bundle is
// red when any edge inside it breaks a rule (decisions.md, Levels rule: "a
// bundled edge is red if any pair inside it is"); internal/export marks the
// edges, so the UI evaluates no rule itself.
import { index } from "./cut";
import type { View } from "./data";
import { NO_PINS, type Pin } from "./declutter";

export const violating: Pin = (b) => b.members.some((e) => e.violation !== undefined);

// pinFor is the pin a page passes to scene: none without a Policy.
export const pinFor = (view: View): Pin => (view.policy ? violating : NO_PINS);

const rolled = new WeakMap<View, Map<string, number>>();

// rolledRanks is every box's rank: a package's own, and for a box the highest
// rank among the packages under it (uml-viewer hierarchy.clj rolled-level,
// l.112; README: "a component inherits the max level of its elements").
export function rolledRanks(view: View): Map<string, number> {
  const hit = rolled.get(view);
  if (hit) return hit;
  const { parent, pkgs } = index(view);
  const out = new Map<string, number>();
  for (const p of pkgs) {
    if (p.rank === undefined) continue;
    for (let b = p.id; b !== ""; b = parent.get(b) ?? "") out.set(b, Math.max(out.get(b) ?? 0, p.rank));
  }
  rolled.set(view, out);
  return out;
}
