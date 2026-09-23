import { describe, expect, it } from "vitest";
import { cut } from "./cut";
import { bundlesOver, externalsOf } from "./bundle";
import { decl, edge, exts, pkgs, view } from "./testkit";

const short = (bs: ReturnType<typeof bundlesOver>) => bs.map((b) => [b.from, b.to, b.pairs, b.members.length]);

describe("bundlesOver", () => {
  it("keeps member edges and hides externals when asked", () => {
    const v = view([...pkgs(["m/a", "m/b"], "m"), ...exts(["x.io/e"])],
      [edge("m/a", "m/b"), edge("m/a", "x.io/e")]);
    const c = cut(v, "", 2);
    expect(short(bundlesOver(v, c))).toEqual([["m/a", "m/b", 1, 1], ["m/a", "x.io/e", 1, 1]]);
    expect(bundlesOver(v, c, { externals: false }).map((b) => b.to)).toEqual(["m/b"]);
  });
  it("never draws an edge with no end inside the focus (outside→external)", () => {
    const v = view([...pkgs(["m/a"], "m"), ...pkgs(["n/b"], "n"), ...exts(["x.io/e"])],
      [edge("n/b", "x.io/e"), edge("n/b", "m/a")]);
    const bs = bundlesOver(v, cut(v, "m", 1));
    expect(bs.map((b) => `${b.from}→${b.to}`)).toEqual(["outside→m/a"]);
    const top = bundlesOver(v, cut(v, "", 1));
    expect(top.map((b) => `${b.from}→${b.to}`)).toEqual(["n→m", "n→x.io/e"]);
    expect(externalsOf(v, bundlesOver(v, cut(v, "m", 1)))).toEqual([]);
  });
  it("counts distinct declaration pairs, not edges; a method goes to its type; nothing leaves the package", () => {
    const v = view([...pkgs(["m/p"], "m", { detail: true }), ...pkgs(["m/q"], "m", { detail: true }),
      decl("m/p.T", "m/p"), decl("m/p.T.M", "m/p.T", "function"), decl("m/p.F", "m/p", "function"),
      decl("m/q.G", "m/q", "function")],
      [edge("m/p.F", "m/p.T.M", "calls"), edge("m/p.F", "m/p.T", "calls"), edge("m/p.F", "m/p.T", "embeds"),
        edge("m/p.T.M", "m/q.G", "calls"), edge("m/p", "m/q")]);
    expect(short(bundlesOver(v, cut(v, "m/p", 1)))).toEqual([["m/p.F", "m/p.T", 2, 3]]);
  });
  it("gives a bundle the status its members share, mixed beside unchanged ones (04 Part B)", () => {
    const st = (e: ReturnType<typeof edge>, status?: string) => ({ ...e, ...(status ? { status } : {}) });
    const v = view(pkgs(["m/a", "m/b", "m/c", "m/d"], "m"), [
      st(edge("m/a", "m/b"), "added"),
      st(edge("m/a", "m/c"), "added"), st({ ...edge("m/a", "m/c"), kind: "imports", count: 2 }),
      edge("m/a", "m/d"),
    ]);
    expect(bundlesOver(v, cut(v, "", 2)).map((b) => b.status)).toEqual(["added", "mixed", undefined]);
  });
});
