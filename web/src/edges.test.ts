import { describe, expect, it } from "vitest";
import { always, around, EDGE_LIMIT, quiet } from "./edges";
import { edge } from "./testkit";

describe("edge mode (11)", () => {
  it("auto hides lines at rest only above the limit, and only where lines would be drawn", () => {
    expect([quiet("auto", true, EDGE_LIMIT), quiet("auto", true, EDGE_LIMIT + 1)]).toEqual([false, true]);
    expect([quiet("on", true, 500), quiet("off", false, 500), quiet("auto", false, 500)]).toEqual([false, false, false]);
  });
  it("always draws violations, changed imports and the imports that make a package affected", () => {
    const e = edge("a", "b");
    const none = () => false;
    expect(always({ pinned: false, members: [e] }, none)).toBe(false);
    expect(always({ pinned: true, members: [e] }, none)).toBe(true);
    expect(always({ pinned: false, status: "added", members: [e] }, none)).toBe(true);
    expect(always({ pinned: false, members: [e] }, (x) => x.from === "a")).toBe(true);
  });
  it("finds a box's own edges, and those of what it holds, as in or out", () => {
    // A holds a1; b and c sit beside it.
    const up = (id: string) => ({ a1: "A" })[id] ?? "";
    const es = [
      { id: "a1→b", from: "a1", to: "b" }, { id: "c→A", from: "c", to: "A" },
      { id: "b→c", from: "b", to: "c" }, { id: "A→a1", from: "A", to: "a1" },
    ];
    expect(around(es, "A", up).map((e) => `${e.id} ${e.dir}`)).toEqual(["a1→b out", "c→A in", "A→a1 out"]);
    expect(around(es, "c", up).map((e) => `${e.id} ${e.dir}`)).toEqual(["c→A out", "b→c in"]);
    expect(es[0]).not.toHaveProperty("dir");
  });
});
