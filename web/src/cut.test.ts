import { describe, expect, it } from "vitest";
import { autoDepth, cut, leafOf, packageOf, packagesIn, parentBox } from "./cut";
import { decl, pkgs, view } from "./testkit";

const shop = view([
  ...pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b/c"], "ex/shop"),
  ...pkgs(["ex/shop/tools/gen"], "ex/shop/tools"),
]);

describe("cut", () => {
  it("opens boxes above the depth and records each leaf's container", () => {
    const c = cut(shop, "", 2);
    expect(c.containers).toEqual(["ex/shop", "ex/shop/tools"]);
    expect(c.leaves).toEqual(["ex/shop#pkg", "ex/shop/internal", "ex/shop/tools/gen"]);
    expect(c.parent.get("ex/shop/internal")).toBe("ex/shop");
    expect(c.parent.get("ex/shop")).toBe("");
  });
  it("a toggled box flips in place, others keep the depth (U2)", () => {
    expect(cut(shop, "", 2, ["ex/shop/internal"]).leaves)
      .toEqual(["ex/shop#pkg", "ex/shop/internal/a", "ex/shop/internal/b", "ex/shop/tools/gen"]);
    expect(cut(shop, "", 2, ["ex/shop"]).leaves).toEqual(["ex/shop", "ex/shop/tools/gen"]);
  });
  it("toggling a box without children changes nothing", () => {
    expect(cut(shop, "", 2, ["ex/shop/internal/a"]).leaves).toEqual(cut(shop, "", 2).leaves);
  });
  it("a package focus shows its declarations; X#pkg does the same for a container package", () => {
    const v = view([...pkgs(["m/p"], "m", { detail: true }), ...pkgs(["m/p/q"], "m"),
      decl("m/p.T", "m/p"), decl("m/p.T.M", "m/p.T", "function"), decl("m/p.F", "m/p", "function")]);
    const c = cut(v, "m/p#pkg", 1);
    expect(c.decls).toBe(true);
    expect(c.leaves).toEqual(["m/p.F", "m/p.T"]);
    expect(cut(v, "m/p/q", 1)).toMatchObject({ decls: true, leaves: [], noDetail: true });
    expect(parentBox(v, "m/p#pkg")).toBe("m/p");
    expect(packageOf(v, "m/p.T.M")).toBe("m/p");
  });
  it("maps packages to leaves, their own #pkg leaf, or outside", () => {
    const c = cut(shop, "ex/shop", 1);
    const to = leafOf(shop, c);
    expect(to("ex/shop/internal/b/c")).toBe("ex/shop/internal");
    expect(to("ex/shop")).toBe("ex/shop#pkg");
    expect(to("ex/shop/tools/gen")).toBe("outside");
  });
  it("a box holds the packages under it, but not a nested module root", () => {
    expect(packagesIn(shop, "ex/shop").map((p) => p.id)).toEqual(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b/c"]);
    expect(packagesIn(shop, "ex/shop#pkg").map((p) => p.id)).toEqual(["ex/shop"]);
  });
  it("auto depth is 1 for a declaration focus", () => {
    expect(autoDepth(view([...pkgs(["m/p"], "m", { detail: true }), decl("m/p.T", "m/p")]), "m/p")).toBe(1);
  });
});
