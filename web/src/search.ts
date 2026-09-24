// U8/A9: find a node by name and the state that shows it.
import type { NodeKind, View } from "./data";
import { demotedBox, STRIP } from "./group";
import { childrenOf, cmp, index, packageOf, parentBox, PKG } from "./cut";
import { EXTERNALS } from "./bundle";
import { scene } from "./scene";
import { DEFAULT_STATE, type ViewState } from "./state";

export type Hit = { id: string; kind: NodeKind; name: string };

// name is what a reader types: the last path segment, or the part after the package.
function name(view: View, id: string): string {
  const n = index(view).node.get(id)!;
  if (n.kind === "package" || n.kind === "external") return id.slice(id.lastIndexOf("/") + 1);
  return id.slice((packageOf(view, id) ?? "").length + 1);
}

// search ranks exact names, then name prefixes, then any id substring
// (case-insensitive), shorter ids first, then by id.
export function search(view: View, query: string, limit = 20): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: [number, Hit][] = [];
  for (const n of view.nodes) {
    const nm = name(view, n.id);
    const low = nm.toLowerCase();
    const rank = low === q || low.endsWith("." + q) ? 0 : low.startsWith(q) ? 1 : n.id.toLowerCase().includes(q) ? 2 : -1;
    if (rank >= 0) scored.push([rank, { id: n.id, kind: n.kind, name: nm }]);
  }
  scored.sort(([ra, a], [rb, b]) => ra - rb || a.id.length - b.id.length || cmp(a.id, b.id));
  return scored.slice(0, limit).map(([, h]) => h);
}

// reveal returns a state that draws id and selects it (Deviation 7). It keeps
// the declutter stage and the hide-edges flag, and always resets the toggles,
// hops, weight filter and externals toggle, any of which could hide the target.
// A method stays selected as itself; scene() draws it as a row of its type.
export function reveal(view: View, id: string, from: ViewState = DEFAULT_STATE): ViewState {
  const n = index(view).node.get(id);
  if (!n) return from;
  const reset = { ...from, toggled: [] as string[], hops: null, minPairs: 1, externals: true };
  if (n.kind === "package") {
    // 12: a demoted package waits in its strip, so the strip opens.
    const focus = parentBox(view, id);
    return { ...reset, focus, depth: 1, selected: id, toggled: demotedBox(view, id) ? [focus + STRIP] : [] };
  }
  if (n.kind === "external") {
    const s = { ...reset, focus: "", depth: null, selected: id };
    return scene(view, s).nodes.some((x) => x.id === id) ? s : { ...s, selected: EXTERNALS };
  }
  const pkg = packageOf(view, id)!;
  return { ...reset, focus: childrenOf(view, pkg).length > 0 ? pkg + PKG : pkg, depth: null, selected: id };
}
