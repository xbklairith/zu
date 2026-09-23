// What 04's canvas draws, over every focus of the shop goldens (the Change
// View whole and as its changed subgraph) at the auto depth and depths 1–3.
// The snapshot was written by 04's own layout.ts scene before feature 05
// replaced it; the new scene() at default settings must reproduce it exactly.
import { expect, it } from "vitest";
import project from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import { changedSubgraph } from "./change";
import { parseView, type View } from "./data";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { leavesAt } from "./tree";

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

const drawn = (v: View, focus: string, depth: number | null) => {
  const s = scene(v, { ...DEFAULT_STATE, focus, depth });
  return {
    nodes: s.nodes.map((n) => ({
      id: n.id, label: n.label, parent: n.parent, shape: n.shape,
      rows: n.methods, mark: n.change ?? "", rowMarks: n.rowMarks ?? [],
    })),
    edges: s.edges.map((e) => ({ from: e.from, to: e.to, pairs: e.pairs, status: e.status ?? "" })),
  };
};

it("reproduces 04's canvas on the shop goldens", async () => {
  const snap: Record<string, unknown> = {};
  const ch = parseView(JSON.stringify(change));
  const views = [["project", parseView(JSON.stringify(project))], ["change", ch], ["subgraph", changedSubgraph(ch)]] as const;
  for (const [name, v] of views) {
    for (const f of foci(v)) {
      for (const d of [null, 1, 2, 3]) snap[`${name} ${f || "(root)"} d=${d ?? "auto"}`] = drawn(v, f, d);
    }
  }
  await expect(JSON.stringify(snap, null, 1)).toMatchFileSnapshot("./__snapshots__/scene04.json");
});
