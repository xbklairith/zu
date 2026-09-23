// 04's Package Tree names, now over cut.ts and bundle.ts (feature 05).
import type { View } from "./data";
import { packagesIn } from "./cut";

export { BOX_BUDGET, OUTSIDE, parentBox } from "./cut";
export { EXTERNALS } from "./bundle";

// boxStats sums the packages a box holds; a #pkg leaf holds only its package.
export function boxStats(view: View, box: string): { packages: number; decls: number; unresolved: number } {
  const s = { packages: 0, decls: 0, unresolved: 0 };
  for (const p of packagesIn(view, box)) {
    s.packages++;
    s.decls += p.decls ?? 0;
    s.unresolved += p.unresolved ?? 0;
  }
  return s;
}
