// 04's Package Tree names, now over cut.ts and bundle.ts (feature 05).
import type { View, ViewNode } from "./data";
import { index, PKG } from "./cut";

export { BOX_BUDGET, OUTSIDE, parentBox } from "./cut";
export { EXTERNALS } from "./bundle";

export type BoxStats = { packages: number; decls: number; unresolved: number };
const NONE: BoxStats = Object.freeze({ packages: 0, decls: 0, unresolved: 0 });
const stats = new WeakMap<View, Map<string, BoxStats>>();

// boxStats sums the packages a box holds; a #pkg leaf holds only its package.
// Every box's sums come from one pass up the box tree, once per View (11):
// the scene asks for each drawn box on every change of state.
export function boxStats(view: View, box: string): BoxStats {
  let all = stats.get(view);
  if (!all) {
    all = new Map();
    const ix = index(view);
    const add = (id: string, p: ViewNode) => {
      const s = all!.get(id) ?? { ...NONE };
      s.packages++;
      s.decls += p.decls ?? 0;
      s.unresolved += p.unresolved ?? 0;
      all!.set(id, s);
    };
    for (const p of ix.pkgs) {
      add(p.id + PKG, p);
      for (let b = p.id; b !== ""; b = ix.parent.get(b) ?? "") add(b, p);
    }
    stats.set(view, all);
  }
  return all.get(box) ?? NONE;
}

// statsLine is what a box shows under its label (11): how it connects, then
// how many packages it holds when more than one. Decls and unresolved calls
// are in the Panel; with lines hidden at rest, the box says what it uses.
export const statsLine = (s: { uses: number; usedBy: number; packages: number }): string =>
  `uses ${s.uses} · used by ${s.usedBy}${s.packages > 1 ? ` · ${s.packages} pkgs` : ""}`;
