// The Package Tree as boxes (ADR 0008) and the cut of it one view draws.
import type { View, ViewNode } from "./data";

export const PKG = "#pkg"; // suffix of the leaf that stands for a container's own package
export const OUTSIDE = "outside"; // the aggregate for every package outside the focus
export const BOX_BUDGET = 60;

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
  for (const n of pkgs) {
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
// does not contain it.
export function leafOf(view: View, c: Cut): (pkg: string) => string {
  const leaves = new Set(c.leaves);
  const open = new Set(c.containers);
  return (pkg) => {
    if (leaves.has(pkg)) return pkg;
    if (open.has(pkg) || pkg === c.focus) return leaves.has(pkg + PKG) ? pkg + PKG : OUTSIDE;
    for (let b = parentBox(view, pkg); b !== ""; b = parentBox(view, b)) {
      if (leaves.has(b)) return b;
      if (b === c.focus || open.has(b)) break;
    }
    return OUTSIDE;
  };
}

// autoDepth: start at 1 and go deeper while the next level has ≤ 60 leaves and
// more than this one (decision Q4, relative to the focus).
export function autoDepth(view: View, focus: string): number {
  let d = 1;
  for (;;) {
    const here = cut(view, focus, d).leaves.length;
    const next = cut(view, focus, d + 1).leaves.length;
    if (next > BOX_BUDGET || next <= here) return d;
    d++;
  }
}
