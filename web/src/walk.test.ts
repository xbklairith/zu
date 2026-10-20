import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import type { View } from "./data";
import { DEFAULT_STATE } from "./state";
import { step, walkAt, walkOf } from "./walk";

const shop = golden as unknown as View;
const v = change as unknown as View;
const S = "example.com/shop/internal/store";
const C = "example.com/shop/internal/checkout";
const M = "example.com/shop/internal/money";
const ROOT = "example.com/shop";

describe("walkOf (18)", () => {
  it("walks the changed packages bottom-up, each followed by the Centres of its changed declarations", () => {
    // a method's Centre is its type: Repo for Repo.Get and Repo.check; Plus is money.Add moved
    expect(walkOf(v)).toEqual([
      S, `${S}.Order`, `${S}.ReadWriter`, `${S}.Repo`, M, `${M}.Plus`, C, `${C}.Total`, ROOT, `${ROOT}.main`,
    ]);
  });
  it("starts at each new violation's importer, with its package's steps, each step once", () => {
    const w = walkOf({ ...v, violations: { new: [{ rule: "levels", from: C, to: S }], fixed: [], known: 0 } });
    expect(w).toEqual([
      C, `${C}.Total`, S, `${S}.Order`, `${S}.ReadWriter`, `${S}.Repo`, M, `${M}.Plus`, ROOT, `${ROOT}.main`,
    ]);
  });
  it("is empty in a Project View", () => {
    expect(walkOf(shop)).toEqual([]);
  });
});

describe("step (18)", () => {
  const tree = { ...DEFAULT_STATE, focus: "example.com/shop/internal", selected: C };
  it("n starts the walk from the tree, keeping the tree's fields; n and p step along it and stop at its ends", () => {
    const first = step(v, tree, 1);
    expect(first).toEqual({ ...tree, centre: S });
    expect(step(v, first, 1).centre).toBe(`${S}.Order`);
    expect(step(v, step(v, first, 1), -1).centre).toBe(S);
    expect(step(v, first, -1)).toBe(first);
    const last = { ...tree, centre: `${ROOT}.main` };
    expect(step(v, last, 1)).toBe(last);
    expect(step(v, last, -1).centre).toBe(ROOT);
    expect(step(v, tree, -1)).toBe(tree);
  });
  it("goes on from a Centre off the walk at its package's place, or from the start", () => {
    const cart = { ...tree, centre: `${C}.Cart` }; // near, in checkout
    expect(step(v, cart, 1).centre).toBe(`${C}.Total`);
    expect(step(v, cart, -1).centre).toBe(C);
    const pq = { ...tree, centre: "github.com/lib/pq" }; // in no package of the walk
    expect(step(v, pq, 1).centre).toBe(S);
    expect(step(v, pq, -1)).toBe(pq);
  });
  it("draws the next Centre's rows capped again", () => {
    expect(step(v, { ...tree, centre: S, more: true }, 1)).toMatchObject({ centre: `${S}.Order`, more: false });
  });
  it("does nothing in a Project View", () => {
    expect(step(shop, tree, 1)).toBe(tree);
  });
});

describe("walkAt (18)", () => {
  it("says which step of the walk a Centre is, if any", () => {
    expect(walkAt(v, S)).toEqual({ at: 1, of: 10 });
    expect(walkAt(v, `${ROOT}.main`)).toEqual({ at: 10, of: 10 });
    expect(walkAt(v, `${C}.Cart`)).toEqual({ at: null, of: 10 });
    expect(walkAt(v, null)).toEqual({ at: null, of: 10 });
  });
});
