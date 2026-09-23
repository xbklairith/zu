import { describe, expect, it } from "vitest";
import { declutter } from "./declutter";
import type { Bundle } from "./bundle";
import type { Stage } from "./state";

const b = (from: string, to: string): Bundle =>
  ({ from, to, pairs: 1, members: [{ from, to, kind: "imports", count: 1, loc: { path: "x.go", line: 1 } }] });
// Containers A (a1, a2) and B (b1), and a top-level leaf t. a1→b1 is pinned.
const all = [b("a1", "a2"), b("a1", "b1"), b("a2", "b1"), b("t", "a1")];
const leaves = ["a1", "a2", "b1", "t"];
const parent = new Map([["a1", "A"], ["a2", "A"], ["b1", "B"], ["t", ""], ["A", ""], ["B", ""]]);
const pin = (x: Bundle) => x.from === "a1" && x.to === "b1";
const at = (s: Stage, lines = true) => declutter(s, lines, all, leaves, parent, pin);
const arrows = (s: Stage) => at(s).arrows.map((a) => `${a.from}→${a.to} ${a.pairs}${a.pinned ? " pinned" : ""}`);

describe("declutter (uml-viewer's cycle)", () => {
  it("full draws every leaf bundle as a line, with method rows", () => {
    expect(arrows("full")).toEqual(["a1→a2 1", "a1→b1 1 pinned", "a2→b1 1", "t→a1 1"]);
    expect([at("full").lines, at("full").rows, at("full").folded("a1")]).toEqual([true, true, false]);
  });
  it("arrows: one per direction between containers; edges inside a container go; a pin survives the merge", () => {
    expect(arrows("arrows")).toEqual(["A→B 2 pinned", "t→A 1"]);
    expect(at("arrows").lift("a2")).toBe("A");
  });
  it("triangles: the same arrows as marks on each box and on the leaves they carry", () => {
    const d = at("triangles");
    expect(d.lines).toBe(false);
    expect(d.marks.get("A")).toEqual({ in: true, out: true, inPinned: false, outPinned: true });
    expect(d.marks.get("b1")).toEqual({ in: true, out: false, inPinned: true, outPinned: false });
    expect(d.marks.get("t")).toEqual({ in: false, out: true, inPinned: false, outPinned: false });
  });
  it("elements hides method rows and draws lines again; classes folds leaves into their containers", () => {
    expect([at("elements").lines, at("elements").rows]).toEqual([true, false]);
    expect(leaves.filter(at("classes").folded)).toEqual(["a1", "a2", "b1"]);
    expect(arrows("classes")).toEqual(arrows("arrows"));
  });
  it("with a single container, arrows equals full and classes folds nothing", () => {
    const one = new Map([["a1", "A"], ["a2", "A"]]);
    const d = (s: Stage) => declutter(s, true, [b("a1", "a2")], ["a1", "a2"], one, pin);
    expect(d("arrows").arrows.map((a) => a.from + a.to)).toEqual(["a1a2"]);
    expect(d("classes").folded("a1")).toBe(false);
  });
  it("hide edges draws marks instead of lines at any stage", () => {
    const d = at("full", false);
    expect(d.lines).toBe(false);
    expect(d.marks.get("a2")).toEqual({ in: true, out: true, inPinned: false, outPinned: false });
  });
});
