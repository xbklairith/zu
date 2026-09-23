// 04's Package Tree API over every focus of both shop goldens at depths 1–3.
// The snapshot was written by 04's own tree.ts before feature 05 moved it onto
// cut.ts and bundle.ts; the rebuilt tree must reproduce it exactly.
import { expect, it } from "vitest";
import project from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import { parseView, type View } from "./data";
import { bundles, containers, leavesAt, touchedExternals } from "./testkit";
import { boxStats } from "./tree";

// foci are the page root and every box a reader can drill into from it.
function foci(v: View): string[] {
  const decl = new Set(v.nodes.filter((n) => n.kind === "type" || n.kind === "function").map((n) => n.id));
  const out: string[] = [];
  const walk = (f: string) => {
    out.push(f);
    for (const l of leavesAt(v, f, 1)) if (!decl.has(l)) walk(l);
  };
  walk("");
  return out;
}

it("reproduces 04's tree on the shop goldens", async () => {
  const snap: Record<string, unknown> = {};
  for (const [name, g] of [["project", project], ["change", change]] as const) {
    const v = parseView(JSON.stringify(g));
    for (const f of foci(v)) {
      for (const d of [1, 2, 3]) {
        const leaves = leavesAt(v, f, d);
        snap[`${name} ${f || "(root)"} d=${d}`] = {
          leaves,
          containers: containers(v, f, d),
          bundles: bundles(v, f, d),
          touched: touchedExternals(v, f, d),
          stats: leaves.map((l) => [l, boxStats(v, l)]),
        };
      }
    }
  }
  await expect(JSON.stringify(snap, null, 1)).toMatchFileSnapshot("./__snapshots__/tree04.json");
});
