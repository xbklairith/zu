import { describe, expect, it } from "vitest";
import type { View } from "./data";
import { isGroup, MORE } from "./group";
import { sizeOf } from "./layout";
import { opening, scene, type Scene } from "./scene";
import { DEFAULT_STATE, toggle, type ViewState } from "./state";
import { nested, town } from "./testkit";
import { parseView } from "./data";
import change from "../../internal/export/testdata/shop.change.golden.json";

const at = (v: View, s: Partial<ViewState>) => scene(v, { ...DEFAULT_STATE, ...s }, { home: true });
const node = (sc: Scene, id: string) => sc.nodes.find((n) => n.id === id);

// drawn is what a scene draws outside box: each node's container, size and rows.
function drawn(sc: Scene, box: string) {
  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
  const under = (id: string) => {
    for (let x = byId.get(id)!.parent; x !== ""; x = byId.get(x)?.parent ?? "") if (x === box) return true;
    return false;
  };
  return sc.nodes.filter((n) => !under(n.id)).map((n) => ({
    id: n.id, parent: n.parent, tier: n.tier, ownTier: n.ownTier, ...(n.id === box ? {} : { size: sizeOf(n), label: n.label }),
  }));
}

// Every toggle of a drawn box leaves what is drawn outside it as it was.
function same(v: View, s: Partial<ViewState>) {
  const sc = at(v, s);
  const ts = sc.nodes.filter((n) => n.toggle && !isGroup(n.id));
  expect(ts.length).toBeGreaterThan(0);
  for (const t of ts) {
    const flipped = at(v, toggle({ ...DEFAULT_STATE, ...s }, t.toggleId ?? t.id));
    expect([t.id, drawn(flipped, t.id)]).toEqual([t.id, drawn(sc, t.id)]);
  }
}

describe("a view keeps what it drew as it opened (15)", () => {
  it("draws the same boxes outside an opened or closed box, at their sizes and in their rows", () => {
    const v = town();
    same(v, {});
    same(v, { depth: 2 });
    same(v, { depth: 1, toggled: ["m/k00"] });
    same(v, { depth: 1, stage: "classes" });
    same(nested, { depth: 1 });
    same(parseView(JSON.stringify(change)), {}); // a package closed at its declarations folds them into a row
  });
  it("keeps the view's fold chips; a closed chip hides a box opened inside it", () => {
    const v = town();
    const first = at(v, {});
    const chip = first.nodes.find((n) => n.id.endsWith(MORE) && n.parent !== "")!;
    const inside = first.grouping!.folded.get(chip.id)![0];
    expect(node(at(v, { toggled: [inside] }), inside)).toBeUndefined();
    expect(node(at(v, { toggled: [inside] }), chip.id)!.label).toBe(chip.label);
    expect(node(at(v, { toggled: [chip.id] }), inside)!.shape).toBe("box");
  });
  it("hides lines under the weight filter, never a box (A6)", () => {
    // m/k02 uses github.com/x/y over two packages, one pair each once it opens.
    const v = town();
    const sc = at(v, { depth: 1, minPairs: 2, toggled: ["m/k02"] });
    expect(node(sc, "github.com/x/y")).toBeDefined();
    expect(sc.edges.some((e) => e.to === "github.com/x/y")).toBe(false);
  });
  it("counts what an opened box holds as if every other opened box were closed", () => {
    // m/k01/s0 uses two packages of m/k02, and m/k10/s1 uses it.
    const v = town();
    const one = node(at(v, { depth: 1, toggled: ["m/k01"] }), "m/k01/s0")!;
    const two = node(at(v, { depth: 1, toggled: ["m/k01", "m/k02"] }), "m/k01/s0")!;
    expect([one.stats, two.stats]).toEqual(["uses 1 · used by 1", "uses 1 · used by 1"]);
  });
  it("lays out the view as it opened when the reader has opened or closed a box in it", () => {
    const v = town();
    expect(at(v, {}).ref).toBeUndefined();
    const sc = at(v, { depth: 1, toggled: ["m/k00", "m/k00/s0"] });
    expect(sc.ref!.nodes.map((n) => n.id)).toEqual(at(v, { depth: 1 }).nodes.map((n) => n.id));
    expect(sc.opened!.map((n) => [n.id, n.shape, n.toggle])).toEqual([["m/k00", "box", "expand"], ["m/k00/s0", "box", "expand"]]);
    expect(sizeOf(sc.opened![0])).toEqual(sizeOf(node(at(v, { depth: 1 }), "m/k00")!));
    // A hop limit draws what lies within it however the boxes open.
    expect(at(v, { depth: 1, toggled: ["m/k00"], selected: "m/k00/s0", hops: 1 }).ref).toBeUndefined();
  });
  it("makes the view as it opened once whatever the reader selects, unless a Fold chip holds the selection (N3)", () => {
    const v = town();
    const first = at(v, {});
    const box = first.nodes.find((n) => n.toggle === "expand" && !isGroup(n.id))!.id;
    const [chip, held] = [...first.grouping!.folded].find(([, ids]) => !ids[0].includes("#"))!;
    const made: string[] = [];
    const make = (b: ViewState) => (made.push(JSON.stringify(b)), at(v, b));
    const open = (selected: string | null) => opening(v, { ...DEFAULT_STATE, toggled: [box], selected }, make)!;
    // Any box outside a chip: the one scene of the view as it opened, a cache hit on the page.
    for (const sel of [null, "m/k04/s0", "m/k06/s1", "m/k09/s0", box]) expect(open(sel).nodes.map((n) => n.id)).toEqual(first.nodes.map((n) => n.id));
    expect(new Set(made).size).toBe(1);
    // A box in a closed chip: the chip opens in the view as it opened, as it does in the view.
    const ref = open(held[0]);
    expect(node(ref, held[0])).toBeDefined();
    expect(node(at(v, { toggled: [box], selected: held[0] }), held[0])).toBeDefined();
    expect(node(at(v, { toggled: [box, chip], selected: held[0] }), held[0])).toBeUndefined();
  });
});
