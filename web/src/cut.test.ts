import { describe, expect, it } from "vitest";
import { autoDepth, cut, home, leafOf, packageOf, packagesIn, parentBox, upTo } from "./cut";
import { decl, edge, exts, pkgs, view } from "./testkit";

const shop = view([
  ...pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b/c"], "ex/shop"),
  ...pkgs(["ex/shop/tools/gen"], "ex/shop/tools"),
]);

describe("home (11)", () => {
  it("opens through boxes that hold one box and nothing else", () => {
    // hugo: one module with a root package and child boxes opens at the module.
    expect(home(view(pkgs(["h", "h/a", "h/b"], "h")))).toBe("h");
    // a module without a root package, one box deeper, and only one below it.
    expect(home(view(pkgs(["x.io/m/pkg/a", "x.io/m/pkg/b"], "x.io/m")))).toBe("x.io/m/pkg");
    // two module roots, as in shop (ex/shop and ex/shop/tools), stay at the root.
    expect(home(shop)).toBe("");
    // a box whose only child is a leaf is where the tree ends: stop above it.
    expect(home(view(pkgs(["x.io/m/a"], "x.io/m")))).toBe("x.io/m");
    // a box that is also a package holds more than its one child.
    expect(home(view(pkgs(["h", "h/a", "h/a/x", "h/a/y"], "h")))).toBe("h");
  });
  it("is the page root in a Change View, which opens where it did before 11", () => {
    const one = view(pkgs(["h", "h/a", "h/b"], "h"));
    expect(home({ ...one, kind: "change" })).toBe("");
    expect(upTo({ ...one, kind: "change" }, "h")).toBe("");
  });
  it("does not count external modules: hugo's root holds its module and an externals oval", () => {
    const h = view([...pkgs(["h", "h/a", "h/b"], "h"), ...exts(["x.io/e"])], [edge("h/a", "x.io/e")]);
    expect(home(h)).toBe("h");
  });
  it("goes up to the page root, never to a root that differs from home only by the wrapper", () => {
    const h = view(pkgs(["x.io/m/pkg/a/x", "x.io/m/pkg/a/y", "x.io/m/pkg/b"], "x.io/m"));
    expect(home(h)).toBe("x.io/m/pkg");
    expect(upTo(h, "")).toBeNull(); // Esc at the page root does nothing
    expect(upTo(h, "x.io/m/pkg")).toBeNull(); // nor at home named by a link
    expect(upTo(h, "x.io/m/pkg/a")).toBe(""); // home's children go to the page root
    expect(upTo(h, "x.io/m/pkg/a/x")).toBe("x.io/m/pkg/a"); // below that, as 05 did
    expect(upTo(shop, "ex/shop/internal")).toBe(""); // 12: ex/shop, the root module, opens in place at the page root
    expect(upTo(shop, "ex/shop")).toBe("");
  });
});

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
