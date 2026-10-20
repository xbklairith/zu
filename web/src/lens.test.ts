import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import type { View } from "./data";
import { drawnCentre, enter, leave } from "./lens";
import { reveal } from "./search";
import { centreAt, DEFAULT_STATE } from "./state";

const shop = golden as unknown as View;
const S = "example.com/shop/internal/store";
const C = "example.com/shop/internal/checkout";

describe("the lens (17)", () => {
  it("enters the Screen at the selection's Centre, keeping the tree as it was", () => {
    const tree = { ...DEFAULT_STATE, focus: "example.com/shop/internal", selected: S, hops: 1 };
    expect(enter(shop, tree)).toEqual({ ...tree, centre: S });
    expect(enter(shop, { ...tree, selected: `${S}.Repo.Get` }).centre).toBe(`${S}.Repo`); // a method: its type
  });
  it("does nothing when the selection names no Centre", () => {
    for (const selected of [null, "outside", "externals", "example.com/shop/internal"]) {
      const s = { ...DEFAULT_STATE, selected };
      expect(enter(shop, s), String(selected)).toBe(s);
    }
  });
  it("leaves to the tree as it was while the Centre is the selection's", () => {
    const tree = { ...DEFAULT_STATE, focus: "example.com/shop/internal", selected: `${S}.Repo.Get`, hops: 1 };
    expect(leave(shop, { ...enter(shop, tree), more: true })).toEqual(tree);
  });
  it("leaves to the tree drawn at a new Centre, selected, after a re-centre", () => {
    const tree = { ...DEFAULT_STATE, selected: S, hops: 1 };
    expect(leave(shop, centreAt(enter(shop, tree), C))).toEqual(reveal(shop, C, tree));
    expect(reveal(shop, C, tree).selected).toBe(C);
  });
  it("leaves a near Centre, which the tree does not draw, to its package (18)", () => {
    const v = change as unknown as View;
    const tree = { ...DEFAULT_STATE, selected: S };
    expect(leave(v, centreAt(tree, `${C}.Cart`))).toEqual(reveal(v, C, tree));
    expect(leave(v, centreAt(tree, `${S}.Repo`))).toEqual(reveal(v, `${S}.Repo`, tree)); // drawn: itself
  });
  it("draws no Screen for a Centre a newer View lost, before revalidate drops it", () => {
    const s = centreAt(DEFAULT_STATE, `${S}.Open`);
    const newer = { ...shop, nodes: shop.nodes.filter((n) => n.id !== `${S}.Open`) };
    expect(drawnCentre(shop, s)).toBe(`${S}.Open`);
    expect(drawnCentre(newer, s)).toBeNull();
    expect(drawnCentre(shop, DEFAULT_STATE)).toBeNull();
  });
});
