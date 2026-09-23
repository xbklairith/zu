import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView, type View } from "./data";
import { breadcrumb, depthNote, honestyLine, title } from "./headline";

const v = parseView(JSON.stringify(golden));

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
  it("notes the depth and an over-budget level", () => {
    expect(depthNote(5, 3)).toBe("5 boxes at depth 3. Double-click to open a box, Esc to go up.");
    expect(depthNote(5, 2, false)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
    expect(depthNote(70, 1)).toBe("70 boxes at depth 1. Double-click to open a box, Esc to go up. More than 60 boxes, drawn anyway.");
  });
});
