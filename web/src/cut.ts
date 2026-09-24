// The Package Tree as boxes (ADR 0008) and the cut of it one view draws.
import type { View, ViewNode } from "./data";

export const PKG = "#pkg"; // suffix of the leaf that stands for a container's own package
export const OUTSIDE = "outside"; // the aggregate for every package outside the focus
// DEPTH_LEAVES is the most leaves autoDepth draws (04); not the Budget (12, group.ts BUDGET).
export const DEPTH_LEAVES = 60;

type Index = {
  node: Map<string, ViewNode>;
  children: Map<string, string[]>; // box → child boxes, sorted; "" → module roots
  parent: Map<string, string>; // box → parent box; module roots → ""
  pkg: Set<string>; // boxes that are also packages
  pkgs: ViewNode[]; // package nodes, sorted by id
};

const indexes = new WeakMap<View, Index>();

// index builds the box tree from package ids and their module (a nested
// module is a root of its own), once per View.
export function index(view: View): Index {
  const hit = indexes.get(view);
  if (hit) return hit;
  const node = new Map(view.nodes.map((n) => [n.id, n]));
  const kids = new Map<string, Set<string>>();
  const parent = new Map<string, string>();
  const pkg = new Set<string>();
  const link = (box: string, up: string) => {
    parent.set(box, up);
    if (!kids.has(up)) kids.set(up, new Set());
    kids.get(up)!.add(box);
  };
  const pkgs = view.nodes.filter((n) => n.kind === "package").sort((a, b) => cmp(a.id, b.id));
  // 07: a Proposal's View names every box's parent, up to a layer box at the
  // top; only the chains of packages in this View are linked.
  const rg = view.regroup;
  for (const n of rg ? pkgs : []) {
    pkg.add(n.id);
    for (let box = n.id; box !== ""; ) {
      const up = rg!.parent[box] ?? "";
      link(box, up);
      box = up;
    }
  }
  for (const n of rg ? [] : pkgs) {
    const m = n.module ?? n.id;
    pkg.add(n.id);
    link(m, "");
    const segs = n.id === m ? [] : n.id.slice(m.length + 1).split("/");
    let box = m;
    for (const s of segs) {
      link(box + "/" + s, box);
      box += "/" + s;
    }
  }
  const children = new Map([...kids].map(([k, v]) => [k, [...v].sort(cmp)]));
  const ix = { node, children, parent, pkg, pkgs };
  indexes.set(view, ix);
  return ix;
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// isBox: a Package Tree box, or "X#pkg" for a package X that also has child boxes.
export function isBox(view: View, id: string): boolean {
  const ix = index(view);
  if (!id.endsWith(PKG)) return ix.parent.has(id);
  const pkg = id.slice(0, -PKG.length);
  return ix.pkg.has(pkg) && childrenOf(view, pkg).length > 0;
}

export function childrenOf(view: View, box: string): string[] {
  return index(view).children.get(box) ?? [];
}

// parentBox is where Esc goes: "X#pkg" → X, a module root → "", "" → "".
export function parentBox(view: View, box: string): string {
  if (box.endsWith(PKG)) return box.slice(0, -PKG.length);
  return index(view).parent.get(box) ?? "";
}

// within: box is inside (or is) outer, following parent boxes, so a nested
// module root is never inside its parent module's box.
export function within(view: View, box: string, outer: string): boolean {
  if (outer === "") return true;
  for (let b = box; b !== ""; b = index(view).parent.get(b) ?? "") if (b === outer) return true;
  return false;
}

// packagesIn are the packages a box holds; "X#pkg" holds only X.
export function packagesIn(view: View, box: string): ViewNode[] {
  const own = box.endsWith(PKG) ? box.slice(0, -PKG.length) : null;
  return index(view).pkgs.filter((p) => (own !== null ? p.id === own : within(view, p.id, box)));
}

// packageOf is the package a declaration belongs to (a method's parent is its type).
export function packageOf(view: View, id: string): string | undefined {
  const { node } = index(view);
  let n = node.get(id);
  while (n && n.kind !== "package") n = n.parent ? node.get(n.parent) : undefined;
  return n?.id;
}

export type Cut = {
  focus: string;
  leaves: string[]; // sorted
  containers: string[]; // sorted
  parent: Map<string, string>; // leaf or container → enclosing container, "" at the top
  decls: boolean; // the leaves are the declarations of one package
  noDetail: boolean; // that package's declarations are not in the file
  alias?: ReadonlyMap<string, string>; // 12: a box drawn by a group leaf instead (group.ts)
};

// declsOf are a package's types and functions, sorted; methods are rows of their type.
export function declsOf(view: View, pkg: string): string[] {
  return view.nodes.filter((n) => n.parent === pkg && (n.kind === "type" || n.kind === "function")).map((n) => n.id).sort(cmp);
}

// declFocus returns the package whose declarations a focus shows, or undefined.
function declFocus(view: View, focus: string): string | undefined {
  const ix = index(view);
  if (focus.endsWith(PKG)) return focus.slice(0, -PKG.length);
  return ix.pkg.has(focus) && childrenOf(view, focus).length === 0 ? focus : undefined;
}

// cut returns the boxes drawn under focus: a box at level L below the focus is
// open when L < depth, and a box in toggled flips that (U2, in place). An open
// box that is also a package holds a "<box>#pkg" leaf for its own package.
export function cut(view: View, focus: string, depth: number, toggled: readonly string[] = []): Cut {
  const leaves: string[] = [];
  const containers: string[] = [];
  const parent = new Map<string, string>();
  const ix = index(view);
  const pkgOnly = declFocus(view, focus);
  if (pkgOnly !== undefined) {
    const ds = declsOf(view, pkgOnly);
    for (const d of ds) parent.set(d, "");
    return {
      focus, leaves: ds, containers, parent, decls: true,
      noDetail: !ix.node.get(pkgOnly)?.detail,
    };
  }
  const flip = new Set(toggled);
  const visit = (box: string, level: number, up: string) => {
    const kids = childrenOf(view, box);
    parent.set(box, up);
    if (kids.length === 0 || (level < depth) === flip.has(box)) {
      leaves.push(box);
      return;
    }
    containers.push(box);
    if (ix.pkg.has(box)) {
      leaves.push(box + PKG);
      parent.set(box + PKG, box);
    }
    for (const k of kids) visit(k, level + 1, box);
  };
  if (focus !== "" && ix.pkg.has(focus)) {
    leaves.push(focus + PKG);
    parent.set(focus + PKG, "");
  }
  for (const k of childrenOf(view, focus)) visit(k, 1, "");
  return { focus, leaves: leaves.sort(cmp), containers: containers.sort(cmp), parent, decls: false, noDetail: false };
}

// leafOf maps a package to the leaf that draws it, or OUTSIDE when the cut
// does not contain it. A box a group leaf stands for (12, Cut.alias) maps to it.
export function leafOf(view: View, c: Cut): (pkg: string) => string {
  const leaves = new Set(c.leaves);
  const open = new Set(c.containers);
  const alias = c.alias ?? new Map<string, string>();
  const drawn = (b: string) => (leaves.has(b) ? b : alias.get(b));
  return (pkg) => {
    const at = drawn(pkg);
    if (at !== undefined) return at;
    if (open.has(pkg) || pkg === c.focus) return drawn(pkg + PKG) ?? OUTSIDE;
    for (let b = parentBox(view, pkg); b !== ""; b = parentBox(view, b)) {
      const l = drawn(b);
      if (l !== undefined) return l;
      if (b === c.focus || open.has(b)) break;
    }
    return OUTSIDE;
  };
}

// home is the box the page root opens at (11): down from the root through
// every box that holds exactly one child box and nothing else (no package of
// its own), while that child holds boxes too. A single-module repository with
// a root package (hugo) opens at the module; kubernetes, with 38 module roots,
// at the root. The root around one box draws nothing the box does not.
// A Change View opens at the page root, as it did before 11: its subgraph can
// be one changed package deep inside a module.
export function home(view: View): string {
  if (view.kind === "change") return "";
  const ix = index(view);
  let at = "";
  for (;;) {
    const kids = childrenOf(view, at);
    if (kids.length !== 1 || ix.pkg.has(at) || childrenOf(view, kids[0]).length === 0) return at;
    at = kids[0];
  }
}

// upTo is where Esc and "Go back one level" go from focus (11): nowhere
// (null) at the page root or at home, the page root from home's children, and
// the parent box elsewhere, as 05 did. So going up never lands on a root that
// differs from home only by the boxes home descends through. 12: the root
// module opens in place at the page root (rootModule), so up from inside it
// is the page root too.
export function upTo(view: View, focus: string): string | null {
  const h = home(view);
  if (focus === "" || focus === h) return null;
  const p = parentBox(view, focus);
  return p === h || (h === "" && view.kind !== "change" && p === rootModule(view)) ? "" : p;
}

// autoDepth: start at 1 and go deeper while the next level has ≤ 60 leaves and
// more than this one (decision Q4, relative to the focus).
export function autoDepth(view: View, focus: string): number {
  let d = 1;
  for (;;) {
    const here = cut(view, focus, d).leaves.length;
    const next = cut(view, focus, d + 1).leaves.length;
    if (next > DEPTH_LEAVES || next <= here) return d;
    d++;
  }
}

// ROOT_CLOSED, after the root module's id, is the toggle that closes it at the
// page root (N10): a pre-12 link's t=<root module> meant "open it in place",
// which is now the default, so that toggle keeps meaning open.
export const ROOT_CLOSED = "#closed";

// rootModule is the module at the repository's root when other modules are
// nested under it (R5: kubernetes and its staging modules), or null. A
// package's directory (from its file) less its path below its module is the
// module's directory; "." is the root. The page root opens it in place.
export function rootModule(view: View): string | null {
  if (view.modules.length < 2) return null;
  for (const p of index(view).pkgs) {
    const m = p.module;
    if (!m || (p.id !== m && !p.id.startsWith(m + "/"))) continue;
    const below = p.id === m ? "" : p.id.slice(m.length + 1);
    const slash = p.loc.path.lastIndexOf("/");
    const dir = slash < 0 ? "." : p.loc.path.slice(0, slash);
    if (below === "" ? dir === "." : dir === below) return m;
  }
  return null;
}
