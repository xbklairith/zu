import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView, type View } from "./data";
import { breadcrumb, depthNote, edgesNote, honestyLine, redLegend, title, violationsNote } from "./headline";
import { pkgs, view } from "./testkit";

const v = parseView(JSON.stringify(golden));

describe("edgesNote (11)", () => {
  it("counts what auto hides and says how to see it", () => {
    expect(edgesNote(260)).toBe("260 dependencies hidden; select or hover a box to see its own.");
    expect(edgesNote(1)).toBe("1 dependency hidden; select or hover a box to see its own.");
  });
});

describe("header", () => {
  it("titles the view with its modules and commit", () => {
    const at = (head: View["head"], modules = v.modules) => title({ ...v, head, modules });
    expect(at({ commit: "90cb22a1b2c3d4e5f6", dirty: false })).toBe(
      "Project View · example.com/shop, example.com/shop/tools @ 90cb22a1b2c3",
    );
    expect(at({ commit: "90cb22a1b2c3d4e5f6", dirty: true })).toBe(
      "Project View · example.com/shop, example.com/shop/tools @ 90cb22a1b2c3, uncommitted changes",
    );
    expect(at({ commit: "", dirty: false }, ["a", "b", "c", "d", "e"])).toBe("Project View · a, b, c +2 @ worktree");
  });
  it("states what the view does not show", () => {
    expect(honestyLine(v)).toBe(
      "1 parse errors · 8 unresolved calls not drawn · 1 unresolved imports · unsupported: .sh 1, .ts 1",
    );
  });
  it("breadcrumb runs from the root through modules and segments", () => {
    expect(breadcrumb(v, "")).toEqual([{ id: "", label: "root" }]);
    expect(breadcrumb(v, "example.com/shop/internal/store")).toEqual([
      { id: "", label: "root" },
      { id: "example.com/shop", label: "example.com/shop" },
      { id: "example.com/shop/internal", label: "internal" },
      { id: "example.com/shop/internal/store", label: "store" },
    ]);
    expect(breadcrumb(v, "example.com/shop#pkg").at(-1)).toEqual({ id: "example.com/shop#pkg", label: "shop (package)" });
  });
  it("breadcrumb starts at home, not at a root around it (11)", () => {
    const h = view(pkgs(["x.io/m/pkg/a/x", "x.io/m/pkg/a/y", "x.io/m/pkg/b"], "x.io/m"));
    expect(breadcrumb(h, "", "x.io/m/pkg")).toEqual([{ id: "", label: "x.io/m/pkg" }]);
    expect(breadcrumb(h, "x.io/m/pkg", "x.io/m/pkg")).toEqual([{ id: "", label: "x.io/m/pkg" }]);
    expect(breadcrumb(h, "x.io/m/pkg/a/x", "x.io/m/pkg")).toEqual([
      { id: "", label: "x.io/m/pkg" }, { id: "x.io/m/pkg/a", label: "a" }, { id: "x.io/m/pkg/a/x", label: "x" },
    ]);
  });
  it("notes the depth and an over-budget level", () => {
    expect(depthNote(5, 3)).toBe("5 boxes at depth 3. Double-click to open a box, Esc to go up.");
    expect(depthNote(5, 2, false)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
    expect(depthNote(5, 2, false, 4)).toBe("5 boxes at depth 2 (collapsed from 4). Double-click to open a box, Esc to go up.");
    expect(depthNote(5, 2, false, 2)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
    expect(depthNote(70, 1)).toBe("70 boxes at depth 1. Double-click to open a box, Esc to go up. More than 60 boxes, drawn anyway.");
  });
});

describe("violationsNote (07)", () => {
  const red = { rule: "levels" as const, from: "m/a", to: "m/b" };
  it("words the Change View's section as zu diff does, new violations first", () => {
    expect(violationsNote({ new: [red], fixed: [], known: 2 })).toEqual({ heading: "New violations (1)", tail: "0 fixed, 2 pre-existing" });
    expect(violationsNote({ new: [], fixed: [red], known: 0 })).toEqual({ heading: "No new violations", tail: "1 fixed, 0 pre-existing" });
  });
});

describe("redLegend (07)", () => {
  it("names what red violates: zu.policy.yaml, or the Proposal drawn", () => {
    expect(redLegend(null)).toBe("violates zu.policy.yaml (levels or cycle); a red box holds one");
    expect(redLegend("Hexagon")).toBe("violates Proposal Hexagon's layers; a red box holds one");
  });
});
