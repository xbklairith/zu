import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import type { View } from "./data";
import { isGroup } from "./group";
import type { Placed } from "./layout";
import { frameKey, place } from "./place";
import { scene } from "./scene";
import { DEFAULT_STATE, toggle, type ViewState } from "./state";
import { decl, edge, exts, nested, pkgs, town, view } from "./testkit";
import { parseView } from "./data";
import change from "../../internal/export/testdata/shop.change.golden.json";

const elk = new ELK();
const at = (v: View, s: ViewState) => place(scene(v, s, { home: true }), elk);
const state = (s: Partial<ViewState>): ViewState => ({ ...DEFAULT_STATE, ...s });

// rows are siblings whose vertical extents overlap, top to bottom.
function rows(m: ReadonlyMap<string, Placed>, parent: string): string[][] {
  const ids = [...m.keys()].filter((id) => (m.get(id)!.parent ?? "") === parent).sort((a, b) => m.get(a)!.y - m.get(b)!.y);
  const out: string[][] = [];
  let bottom = -Infinity;
  for (const id of ids) {
    const p = m.get(id)!;
    if (out.length && p.y < bottom) {
      out[out.length - 1].push(id);
      bottom = Math.max(bottom, p.y + p.h);
    } else {
      out.push([id]);
      bottom = p.y + p.h;
    }
  }
  return out;
}
const bottomOf = (m: ReadonlyMap<string, Placed>, row: string[]) => Math.max(...row.map((id) => m.get(id)!.y + m.get(id)!.h));

// inPlace is 15's stability criterion for one toggle of b: every node outside
// b is still drawn at its size; b and the boxes around it keep their places;
// a sibling of one of them to its right in its row moves right by exactly
// what that one grew, and a sibling in a row below it moves down by exactly
// what that row grew. Nothing else moves by a pixel.
function inPlace(before: ReadonlyMap<string, Placed>, after: ReadonlyMap<string, Placed>, b: string): string[] {
  const up = (m: ReadonlyMap<string, Placed>, id: string) => m.get(id)?.parent ?? "";
  const under = (m: ReadonlyMap<string, Placed>, id: string) => {
    for (let x = up(m, id); x !== ""; x = up(m, x)) if (x === b) return true;
    return false;
  };
  const outside = (m: ReadonlyMap<string, Placed>) => [...m.keys()].filter((id) => !under(m, id)).sort();
  const bad: string[] = [];
  if (JSON.stringify(outside(before)) !== JSON.stringify(outside(after))) bad.push("drawn set changed");
  const chain = new Map<string, string>(); // container → its child on b's chain
  for (let x = b; ; x = up(before, x)) {
    chain.set(up(before, x), x);
    if (up(before, x) === "") break;
  }
  const byRow = new Map<string, string[][]>();
  for (const id of outside(before)) {
    if (!after.has(id)) continue;
    const [p, q] = [before.get(id)!, after.get(id)!];
    const onChain = [...chain.values()].includes(id);
    if (!onChain && (p.w !== q.w || p.h !== q.h)) bad.push(`${id} resized`);
    const c = p.parent ?? "";
    const x = chain.get(c);
    let [dx, dy] = [0, 0];
    if (x !== undefined && x !== id) {
      const rs = byRow.get(c) ?? rows(before, c);
      byRow.set(c, rs);
      const [rx, ri] = [rs.findIndex((r) => r.includes(x)), rs.findIndex((r) => r.includes(id))];
      if (ri === rx && p.x > before.get(x)!.x) dx = after.get(x)!.w - before.get(x)!.w;
      if (ri > rx) dy = bottomOf(after, rs[rx]) - bottomOf(before, rs[rx]);
    }
    if (q.x !== p.x + dx || q.y !== p.y + dy) bad.push(`${id} moved (${q.x - p.x}, ${q.y - p.y}), expected (${dx}, ${dy})`);
  }
  return bad;
}

// faults are what no layout may draw: two siblings that overlap, or a child
// outside its container.
function faults(m: ReadonlyMap<string, Placed>): string[] {
  const bad: string[] = [];
  const kids = new Map<string, string[]>();
  for (const [id, p] of m) kids.set(p.parent ?? "", [...(kids.get(p.parent ?? "") ?? []), id]);
  for (const [c, ids] of kids) {
    const box = m.get(c);
    for (const [i, a] of ids.entries()) {
      const p = m.get(a)!;
      if (box && (p.x < 0 || p.y < 0 || p.x + p.w > box.w || p.y + p.h > box.h)) bad.push(`${a} outside ${c}`);
      for (const b of ids.slice(i + 1)) {
        const q = m.get(b)!;
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) bad.push(`${a} overlaps ${b}`);
      }
    }
  }
  return bad;
}

// toggles are the ids a reader can flip on a drawn box (not a group's).
const toggles = async (v: View, s: ViewState) =>
  scene(v, s, { home: true }).nodes.filter((n) => n.toggle && !isGroup(n.id)).map((n) => ({ id: n.id, flip: n.toggleId ?? n.id }));

async function checkAll(v: View, s: ViewState) {
  const before = await at(v, s);
  const found: string[] = faults(before);
  const ts = await toggles(v, s);
  expect(ts.length).toBeGreaterThan(0);
  for (const t of ts) {
    const opened = toggle(s, t.flip);
    const after = await at(v, opened);
    found.push(...[...inPlace(before, after, t.id), ...faults(after)].map((m) => `${t.flip}: ${m}`));
    // Toggling back restores the layout exactly.
    const back = await at(v, toggle(opened, t.flip));
    if (JSON.stringify([...back]) !== JSON.stringify([...before])) found.push(`${t.flip}: not restored`);
  }
  expect(found).toEqual([]);
}

describe("open in place (15, U2)", () => {
  it("keeps every other box in place when a box of the first view opens or closes", async () => {
    await checkAll(town(), state({}));
  });
  it("and at an explicit depth, closing a container too", async () => {
    await checkAll(town(), state({ depth: 2 }));
  });
  it("and inside a box the reader opened", async () => {
    const v = town();
    for (const b of ["m/k00", "m/k04", "m/k01"]) await checkAll(v, state({ depth: 1, toggled: [b] }));
    await checkAll(v, state({ depth: 1, toggled: ["m/k00", "m/k00/s0"] }));
  });
  it("whatever the line filter hides (w)", async () => {
    await checkAll(town(), state({ depth: 1, minPairs: 2 }));
  });
  it("at the classes stage", async () => {
    await checkAll(town(), state({ depth: 1, stage: "classes" }));
  });
  it("for the root module at the page root, and the boxes opened inside it", async () => {
    await checkAll(nested, state({ depth: 1 }));
    await checkAll(nested, state({ depth: 1, toggled: ["k/pkg"] }));
  });
  it("in a Change View", async () => {
    const v = parseView(JSON.stringify(change));
    await checkAll(v, state({}));
    await checkAll(v, state({ depth: 2 }));
  });
  it("lays a hash out the same however it was reached (U3)", async () => {
    // Three orders of the same boxes, as a pasted hash may list them, each
    // opened one at a time and closed again through one shared cache, as
    // the page keeps it: every layout equals a cold one.
    const v = town();
    const cache = new Map<string, Map<string, Placed>>();
    const lay = (toggled: string[], c?: typeof cache) => place(scene(v, state({ depth: 1, toggled }), { home: true }), elk, c);
    const orders = [["m/k04", "m/k00", "m/k04/s0"], ["m/k04/s0", "m/k04", "m/k00"], ["m/k00", "m/k04/s0", "m/k04"]];
    const found: string[] = [];
    for (const o of orders) {
      for (const ts of [1, 2, 3, 2, 1, 0].map((n) => o.slice(0, n))) {
        const [warm, cold] = [await lay(ts, cache), await lay(ts)];
        if (JSON.stringify([...warm]) !== JSON.stringify([...cold])) found.push(ts.join(","));
      }
    }
    expect(found).toEqual([]);
    const all = await Promise.all(orders.map((o) => lay(o, cache)));
    for (const m of all) expect([...m]).toEqual([...all[0]]);
  });
  it("sets in place a container the view draws with other children than the opening view did (regrown)", async () => {
    // Closed at the declarations, the changed root package m keeps its box
    // but folds its unchanged declarations into a chip, so its children
    // change though the reader never opened it: it is a region of its own.
    const v: View = {
      ...view([
        ...pkgs(["m"], "m", { detail: true, decls: 2, status: "modified", hop: 0 }),
        { ...decl("m.main", "m", "function"), status: "modified" },
        decl("m.old", "m", "function"),
        ...pkgs(["m/a"], "m", { detail: true, decls: 1, status: "modified", hop: 0 }),
        { ...decl("m/a.F", "m/a", "function"), status: "modified" },
        ...pkgs(["m/tools/gen"], "m/tools", { hop: 1 }),
        ...exts(["x/y"]),
      ], [edge("m", "m/a"), edge("m/a", "x/y"), edge("m/tools/gen", "m/a")]),
      kind: "change", base: { commit: "", dirty: false }, changed: ["m", "m/a"],
    };
    const s = toggle(state({}), "m");
    const sc = scene(v, s, { home: true });
    expect(sc.opened!.map((n) => n.id)).toEqual(["m"]);
    const kids = (ns: typeof sc.nodes) => ns.filter((n) => n.parent === "m").map((n) => n.id).sort();
    expect(kids(sc.nodes)).not.toEqual(kids(sc.ref!.nodes));
    const [before, cache] = [await at(v, state({})), new Map<string, Map<string, Placed>>()];
    const after = await place(sc, elk, cache);
    // Nothing above or left of it moves.
    const m = before.get("m")!;
    const moved = [...before].filter(([id, p]) => after.has(id) && (p.parent ?? "") === "" && id !== "m" &&
      (p.y + p.h <= m.y || p.x + p.w <= m.x) && (after.get(id)!.x !== p.x || after.get(id)!.y !== p.y));
    expect(moved.map(([id]) => id)).toEqual([]);
    expect([after.get("m")!.x, after.get("m")!.y]).toEqual([m.x, m.y]);
    expect(inPlace(before, after, "m")).toEqual([]);
    expect(faults(after)).toEqual([]);
    // Set in place from the opening view and m's region, never laid out whole.
    expect(cache.has(frameKey(sc))).toBe(false);
  });
});
