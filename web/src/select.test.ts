import { describe, expect, it } from "vitest";
import { withinHops } from "./select";

const arcs = [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "d", to: "b" }, { from: "c", to: "e" }];

describe("selection", () => {
  it("walks n hops in both directions from every seed", () => {
    expect(withinHops(arcs, ["a"], 1)).toEqual(new Set(["a", "b"]));
    expect(withinHops(arcs, ["a"], 2)).toEqual(new Set(["a", "b", "c", "d"]));
    expect(withinHops(arcs, ["a", "e"], 1)).toEqual(new Set(["a", "b", "e", "c"]));
    expect(withinHops(arcs, ["zz"], 3)).toEqual(new Set(["zz"]));
  });
});
