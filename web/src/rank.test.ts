import { describe, expect, it } from "vitest";
import { ranks, siblingRanks, siblingTiers, tiers, type Arc } from "./rank";

const arcs = (s: string): Arc[] =>
  s.split(" ").map((p) => {
    const [ends, w] = p.split("*");
    const [from, to] = ends.split(">");
    return w ? { from, to, weight: Number(w) } : { from, to };
  });
const listed = (m: Map<string, number>) => Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : 1)));

describe("tiers", () => {
  it("puts a dependency below its dependents, on the longest path", () => {
    // a → b → c and a → c: c is 0, b is 1, a is 2 (not 1: the longest path).
    expect(listed(tiers(["a", "b", "c", "d"], arcs("a>b b>c a>c")))).toEqual({ a: 2, b: 1, c: 0, d: 0 });
  });
  it("ignores self-loops and arcs that leave the set", () => {
    expect(listed(tiers(["a", "b"], arcs("a>a a>z z>b")))).toEqual({ a: 0, b: 0 });
  });
  it("breaks a cycle at its lightest arc", () => {
    // a ⇄ b with 5 pairs down and 1 back: a over b. b → c → a with more
    // weight on c → a than on a → b puts c over a over b.
    expect(listed(tiers(["a", "b"], arcs("a>b*5 b>a*1")))).toEqual({ a: 1, b: 0 });
    expect(listed(tiers(["a", "b"], arcs("a>b*1 b>a*5")))).toEqual({ a: 0, b: 1 });
    expect(listed(tiers(["a", "b", "c"], arcs("a>b*2 b>c*1 c>a*3")))).toEqual({ a: 1, b: 0, c: 2 });
  });
  it("breaks a tie by id, whatever order the input came in", () => {
    const one = tiers(["a", "b"], arcs("a>b b>a"));
    expect(listed(one)).toEqual({ a: 1, b: 0 });
    expect(tiers(["b", "a"], arcs("b>a a>b"))).toEqual(one);
  });
  it("adds the weights of repeated arcs", () => {
    expect(listed(tiers(["a", "b"], arcs("a>b*1 a>b*1 b>a*1")))).toEqual({ a: 1, b: 0 });
  });
  it("ranks a long chain without overflowing the stack", () => {
    const ids = Array.from({ length: 20000 }, (_, i) => `n${String(i).padStart(5, "0")}`);
    const t = tiers(ids, ids.slice(1).map((id, i) => ({ from: ids[i], to: id })));
    expect([t.get(ids[0]), t.get(ids[19999])]).toEqual([19999, 0]);
  });
});

describe("against the order (11)", () => {
  it("counts the sibling pairs whose arcs were set aside, 0 without a cycle", () => {
    expect(ranks(["a", "b", "c"], arcs("a>b b>c a>c")).against).toBe(0);
    expect(ranks(["a", "b"], arcs("a>b*5 b>a*1")).against).toBe(1);
    // Repeated arcs of one pair are one dependency.
    expect(ranks(["a", "b"], arcs("a>b*3 b>a b>a")).against).toBe(1);
    // c over a over b: b → c points up.
    expect(ranks(["a", "b", "c"], arcs("a>b*2 b>c*1 c>a*3")).against).toBe(1);
    expect(ranks(["a", "b"], arcs("a>b")).tiers).toEqual(tiers(["a", "b"], arcs("a>b")));
  });
  it("adds up every sibling set, counting lifted pairs once", () => {
    const parent = new Map([["A", ""], ["B", ""], ["a1", "A"], ["a2", "A"], ["b1", "B"]]);
    // A ⇄ B (lifted from three arcs) and a1 ⇄ a2 inside A: two.
    const r = siblingRanks(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1"));
    expect(r.against).toBe(2);
    expect(r.tiers).toEqual(siblingTiers(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1")));
    // A set the Policy's Levels place is not drawn by these ranks: not counted.
    expect(siblingRanks(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1"), (p) => p === "").against).toBe(1);
    expect(siblingRanks(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1"), (p) => p === "A").against).toBe(1);
  });
});

describe("siblingTiers", () => {
  // A (a1, a2) and B (b1) at the top, with t beside them.
  const parent = new Map([["A", ""], ["B", ""], ["t", ""], ["a1", "A"], ["a2", "A"], ["b1", "B"]]);
  it("lifts each arc to the siblings under its ends' lowest common container", () => {
    expect(listed(siblingTiers(parent, arcs("a1>a2 a2>b1 t>a1")))).toEqual({ A: 1, B: 0, a1: 1, a2: 0, b1: 0, t: 2 });
  });
  it("adds the weights of arcs lifted onto one pair of siblings", () => {
    // a1 → b1 and a2 → b1 outweigh b1 → a1 together, not alone.
    expect(listed(siblingTiers(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3")))).toMatchObject({ A: 1, B: 0 });
  });
  it("counts nothing for an arc between a container and what it holds", () => {
    expect(listed(siblingTiers(parent, arcs("A>a1 a2>A")))).toEqual({ A: 0, B: 0, a1: 0, a2: 0, b1: 0, t: 0 });
  });
});
