// Where a scene is drawn once the reader opens and closes boxes (15, U2).
// The view as it opened (Scene.ref) is laid out once, as 11 and 12 lay out
// any view, and so is each box the reader opened, on its own (a region);
// grow then sets each region in its box's place. Nothing else is laid out
// again: a box keeps its place in its row, those right of an opened box move
// right by what it grew, and the rows below it down by what its row grew.
// Everything is a function of the scene, so of the hash (U3): the order the
// boxes opened in never shows, and closing a box restores the layout it had.
import { cmp } from "./cut";
import { elkGraph, headers, layout, levelsOf, orderOf, ownTiersOf, PAD_X, rowsOf, sizeOf, type Engine, type Placed } from "./layout";
import type { Scene, SceneNode } from "./scene";

// regions are the scenes each opened box is laid out from: the box, alone at
// the top, and what it holds outside the boxes opened inside it, which are
// drawn closed (Scene.opened). Sorted by the box's id.
export function regions(sc: Scene): Scene[] {
  const closed = new Map((sc.opened ?? []).map((n) => [n.id, n]));
  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
  const regionOf = (id: string) => {
    for (let x = byId.get(id)?.parent ?? ""; x !== ""; x = byId.get(x)?.parent ?? "") if (closed.has(x)) return x;
    return "";
  };
  const within = new Map<string, SceneNode[]>();
  for (const n of sc.nodes) {
    const r = regionOf(n.id);
    if (r !== "") within.set(r, [...(within.get(r) ?? []), closed.get(n.id) ?? n]);
  }
  return [...closed.keys()].sort(cmp).map((r) => ({
    ...sc, nodes: [{ ...byId.get(r)!, parent: "" }, ...(within.get(r) ?? [])], edges: [], all: [], ref: undefined, opened: undefined,
  }));
}

// grow places sc from its frames: "" is the layout of the view as it opened,
// and each opened box's id the layout of its region. In every container,
// deepest first, a child keeps the place its frame gave it, moved right by
// what the siblings left of it in its row grew and down by what the rows
// above it grew; a container grows by what its rows did, never narrower than
// its frame drew it. Null when a frame lacks a node the scene draws, or draws
// one it does not: the page then lays the scene out whole.
export function grow(sc: Scene, frames: ReadonlyMap<string, ReadonlyMap<string, Placed>>): Map<string, Placed> | null {
  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
  const opened = new Set((sc.opened ?? []).map((n) => n.id));
  const kids = new Map<string, SceneNode[]>([["", []]]);
  for (const n of sc.nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  const frameOf = (c: string): string => (c === "" || opened.has(c) ? c : frameOf(byId.get(c)?.parent ?? ""));
  const depth = (id: string) => {
    let d = 0;
    for (let p = byId.get(id)?.parent ?? ""; p !== ""; p = byId.get(p)?.parent ?? "") d++;
    return d;
  };
  const out = new Map<string, Placed>();
  const size = new Map<string, { w: number; h: number }>();
  const lay = (c: string): { w: number; h: number } | null => {
    const src = frames.get(frameOf(c));
    const ks = kids.get(c) ?? [];
    if (!src || [...src.values()].filter((p) => (p.parent ?? "") === c).length !== ks.length) return null;
    if (ks.some((k) => src.get(k.id) === undefined)) return null;
    let dy = 0;
    let right = 0;
    for (const row of rowsOf(ks.map((k) => k.id), src)) {
      row.sort((a, b) => src.get(a)!.x - src.get(b)!.x || cmp(a, b));
      let dx = 0;
      let was = -Infinity;
      let now = -Infinity;
      for (const id of row) {
        const p = src.get(id)!;
        const n = byId.get(id)!;
        const a = n.shape === "container" ? size.get(id)! : sizeOf(n);
        const x = p.x + dx;
        out.set(id, { x, y: p.y + dy, w: a.w, h: a.h, ...(c === "" ? {} : { parent: c }) });
        dx += a.w - p.w;
        right = Math.max(right, x + a.w);
        was = Math.max(was, p.y + p.h);
        now = Math.max(now, p.y + a.h);
      }
      dy += now - was;
    }
    if (c === "") return { w: 0, h: 0 };
    const own = src.get(c)!;
    return { w: Math.max(own.w, right + PAD_X / 2), h: own.h + dy };
  };
  const containers = [...kids.keys()].filter((c) => c !== "").sort((a, b) => depth(b) - depth(a) || cmp(a, b));
  for (const c of [...containers, ""]) {
    const s = lay(c);
    if (s === null) return null;
    size.set(c, s);
  }
  return out;
}

// frameKey is everything a layout of f reads: its ELK input, container
// headers, order, levels and own tiers.
export const frameKey = (f: Scene): string =>
  JSON.stringify([elkGraph(f), [...headers(f)], [...orderOf(f)], [...levelsOf(f)], [...ownTiersOf(f)]]);

// place lays sc out: the view as it opened and each region from cache when
// laid out before, one after another (superseding runs one layout at a time),
// then grow. A scene with no box opened or closed is laid out whole.
export async function place(sc: Scene, engine: Engine, cache: Map<string, Map<string, Placed>> = new Map()): Promise<Map<string, Placed>> {
  const one = async (f: Scene) => {
    const k = frameKey(f);
    const hit = cache.get(k);
    if (hit) return hit;
    const p = await layout(f, engine);
    cache.set(k, p);
    return p;
  };
  if (!sc.ref || !sc.opened) return one(sc);
  const frames = new Map([["", await one(sc.ref)]]);
  for (const r of regions(sc)) frames.set(r.nodes[0].id, await one(r));
  return grow(sc, frames) ?? one(sc);
}

// show is the page's layout effect (App.tsx): it places sc and hands the
// layout to draw, or the error to fail. It returns the effect's cleanup:
// once the page asks for another layout, this one draws nothing, even when
// it finishes last. A toggle closed again before its region is laid out
// comes from cache at once, so no newer engine job supersedes the open (B1).
export function show(
  sc: Scene, engine: Engine, cache: Map<string, Map<string, Placed>>,
  draw: (at: Map<string, Placed>) => void, fail: (e: Error) => void,
): () => void {
  let live = true;
  place(sc, engine, cache).then(
    (at) => live && draw(at),
    (e: Error) => live && fail(e),
  );
  return () => {
    live = false;
  };
}
