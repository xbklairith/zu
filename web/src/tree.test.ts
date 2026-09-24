import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { autoDepth } from "./cut";
import { boxStats, statsLine, parentBox } from "./tree";
import { bundles, containers, declLeaves, leavesAt, methodsOf, touchedExternals } from "./testkit";
import { parseView } from "./data";
import type { View } from "./data";

const pkgs = (ids: string[], module: string) =>
  ids.map((id) => ({ id, kind: "package" as const, module, loc: { path: "x.go", line: 1 } }));
const view = (nodes: View["nodes"], edges: View["edges"] = []): View =>
  ({ schema: "1", kind: "project", tool: "t", head: { commit: "", dirty: false },
     modules: [...new Set(nodes.map((n) => n.module!).filter(Boolean))].sort(),
     nodes, edges, sources: {},
     honesty: { parseErrors: [], unresolvedCalls: 0, unresolvedImports: 0, unsupported: {} } });

describe("Package Tree", () => {
  it("hugo shape: one module opens at its 37 top-level segments", () => {
    const ids = Array.from({ length: 37 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => `g.io/hugo/s${i}/p${j}`)).flat();
    const v = view(pkgs(ids, "g.io/hugo"));
    expect(autoDepth(v, "")).toBe(2);
    expect(leavesAt(v, "", 2)).toHaveLength(37);
  });
  it("kubernetes shape: 38 modules open at the modules", () => {
    const nodes = Array.from({ length: 38 }, (_, m) =>
      pkgs(Array.from({ length: 6 }, (_, j) => `k8s.io/m${m}/d${j}/x`), `k8s.io/m${m}`)).flat();
    const v = view(nodes);
    expect(autoDepth(v, "")).toBe(1);
    expect(leavesAt(v, "", 1)).toHaveLength(38);
  });
  it("draws an oversized first level anyway", () => {
    const v = view(pkgs(Array.from({ length: 70 }, (_, i) => `m/p${i}`), "m"));
    expect(autoDepth(v, "m")).toBe(1);
    expect(leavesAt(v, "m", 1)).toHaveLength(70);
  });
  it("a package that is also a container gets a #pkg leaf; nested modules are roots", () => {
    const v = view([...pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b"], "ex/shop"),
      ...pkgs(["ex/shop/tools/gen"], "ex/shop/tools")]);
    expect(leavesAt(v, "", 1)).toEqual(["ex/shop", "ex/shop/tools"]);
    expect(leavesAt(v, "ex/shop", 2)).toEqual(["ex/shop#pkg", "ex/shop/internal/a", "ex/shop/internal/b"]);
    expect(parentBox(v, "ex/shop/tools")).toBe("");
    expect(parentBox(v, "ex/shop/tools/gen")).toBe("ex/shop/tools");
  });
  it("Esc goes to the parent box, then to the root", () => {
    const v = view(pkgs(["m/a/b"], "m"));
    expect(parentBox(v, "m/a/b")).toBe("m/a");
    expect(parentBox(v, "m")).toBe("");
  });
  it("bundles imports to leaves, counts package pairs, maps outside and externals", () => {
    const nodes: View["nodes"] = [...pkgs(["m/a/x", "m/a/y", "m/b/z"], "m"), ...pkgs(["n/q"], "n"),
      ...Array.from({ length: 21 }, (_, i) => ({ id: `ext${i}`, kind: "external" as const, loc: { path: "go.mod", line: 1 } }))];
    const imp = (from: string, to: string) => ({ from, to, kind: "imports" as const, count: 1, loc: { path: "x.go", line: 1 } });
    const v = view(nodes, [imp("m/a/x", "m/b/z"), imp("m/a/y", "m/b/z"), imp("m/a/x", "m/a/y"), imp("m/b/z", "n/q"),
      ...Array.from({ length: 21 }, (_, i) => imp("m/a/x", `ext${i}`))]);
    expect(bundles(v, "m", 1)).toEqual([
      { from: "m/a", to: "externals", pairs: 21 },
      { from: "m/a", to: "m/b", pairs: 2 },
      { from: "m/b", to: "outside", pairs: 1 },
    ]);
    expect(touchedExternals(v, "m", 1)).toHaveLength(21);
  });
  it("containers are the boxes between the focus and its leaves", () => {
    const v = view(pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b"], "ex/shop"));
    expect(containers(v, "", 3)).toEqual([
      { id: "ex/shop", parent: "" },
      { id: "ex/shop/internal", parent: "ex/shop" },
    ]);
    expect(containers(v, "ex/shop", 1)).toEqual([]);
  });
});

describe("the shop golden", () => {
  const v = parseView(JSON.stringify(golden));
  it("opens fully expanded at two module roots", () => {
    const d = autoDepth(v, "");
    expect(leavesAt(v, "", d)).toEqual([
      "example.com/shop#pkg",
      "example.com/shop/internal/checkout",
      "example.com/shop/internal/money",
      "example.com/shop/internal/store",
      "example.com/shop/tools/gen",
    ]);
  });
  it("drilling into an included package shows its declarations, methods inside types", () => {
    const store = "example.com/shop/internal/store";
    expect(leavesAt(v, store, autoDepth(v, store))).toEqual(declLeaves(v, store));
    expect(declLeaves(v, store)).toContain(`${store}.Repo`);
    expect(declLeaves(v, store)).not.toContain(`${store}.Repo.Get`);
    expect(methodsOf(v, `${store}.Repo`)).toEqual([`${store}.Repo.Get`, `${store}.Repo.Reset`, `${store}.Repo.check`]);
  });
  it("a package without detail has no leaves", () => {
    expect(leavesAt(v, "example.com/shop/internal/checkout", 1)).toEqual([]);
  });
  it("the #pkg leaf drills into the package's own declarations", () => {
    expect(parentBox(v, "example.com/shop#pkg")).toBe("example.com/shop");
  });
  it("box stats sum the packages under a box", () => {
    expect(boxStats(v, "example.com/shop/internal")).toEqual({ packages: 3, decls: 23, unresolved: 8 });
    expect(boxStats(v, "example.com/shop#pkg").packages).toBe(1);
    // Once per View: the scene asks for every box on every change of state.
    expect(boxStats(v, "example.com/shop/internal")).toBe(boxStats(v, "example.com/shop/internal"));
    expect(boxStats(v, "example.com/shop/nope")).toEqual({ packages: 0, decls: 0, unresolved: 0 });
    const one = view(pkgs(["m/a", "m/a/b", "m/c"], "m").map((n) => ({ ...n, decls: 2 })));
    expect([boxStats(one, "m"), boxStats(one, "m/a"), boxStats(one, "m/a#pkg")].map((s) => [s.packages, s.decls])).toEqual([[3, 6], [2, 4], [1, 2]]);
  });
  it("a box's stats line says how it connects, then its packages (11)", () => {
    // Decls and unresolved calls are in the Panel; the box says what it uses.
    expect(statsLine({ uses: 2, usedBy: 5, packages: 3 })).toBe("uses 2 · used by 5 · 3 pkgs");
    expect(statsLine({ uses: 0, usedBy: 1, packages: 1 })).toBe("uses 0 · used by 1");
  });
});
