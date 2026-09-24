import { describe, expect, it } from "vitest";
import { DRAW_LIMIT, fitDepth, knownIds, openFull, scene, tooBig } from "./scene";
import { changedSubgraph } from "./change";
import { DEFAULT_STATE, up, type ViewState } from "./state";
import { decl, edge, exts, pkgs, view } from "./testkit";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import { parseView } from "./data";

const v = view([
  ...pkgs(["m", "m/api", "m/core/a", "m/core/b", "m/lone"], "m"),
  ...exts(["x.io/e"]),
], [
  edge("m", "m/api"), edge("m/api", "m/core/a"), edge("m/api", "m/core/b"), edge("m/core/a", "m/core/b"),
  edge("m/api", "x.io/e"),
]);
const at = (s: Partial<ViewState>) => scene(v, { ...DEFAULT_STATE, ...s });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const g = parseView(JSON.stringify(golden));
const store = "example.com/shop/internal/store";

describe("scene", () => {
  it("draws the cut with labels relative to their container", () => {
    const sc = at({ focus: "", depth: 2 });
    expect(sc.nodes.map((n) => [n.id, n.label, n.shape, n.toggle ?? ""])).toEqual([
      ["m", "m", "container", "collapse"],
      ["m#pkg", "m (package)", "box", ""],
      ["m/api", "api", "box", ""],
      ["m/core", "core", "box", "expand"],
      ["m/lone", "lone", "box", ""],
      ["x.io/e", "x.io/e", "oval", ""],
    ]);
    expect(sc.edges.map((e) => [e.id, e.pairs]))
      .toEqual([["m#pkg→m/api", 1], ["m/api→m/core", 2], ["m/api→x.io/e", 1]]);
  });
  it("drops the path prefix drawn siblings share, never from externals, the outside or a lone box (11)", () => {
    const k = view([...pkgs(["k8s.io/api"], "k8s.io/api"), ...pkgs(["k8s.io/kubelet/cm"], "k8s.io/kubelet"),
      ...pkgs(["k8s.io/kubernetes/pkg/a", "k8s.io/kubernetes/pkg/b"], "k8s.io/kubernetes"), ...exts(["k8s.io/klog"])],
      [edge("k8s.io/api", "k8s.io/klog")]);
    const top = scene(k, DEFAULT_STATE);
    expect(top.nodes.filter((n) => n.parent === "").map((n) => [n.id, n.label])).toEqual([
      ["k8s.io/api", "api"], ["k8s.io/klog", "k8s.io/klog"], ["k8s.io/kubelet", "kubelet"], ["k8s.io/kubernetes", "kubernetes"],
    ]);
    const one = scene(view(pkgs(["x.io/m/a", "x.io/m/b"], "x.io/m")), DEFAULT_STATE);
    expect(one.nodes.map((n) => n.label)).toEqual(["x.io/m", "a", "b"]);
  });
  it("hides weak bundles below minPairs unless pinned", () => {
    expect(ids(at({ depth: 2, minPairs: 2 }).edges)).toEqual(["m/api→m/core"]);
    const pinned = scene(v, { ...DEFAULT_STATE, depth: 2, minPairs: 2 }, { pin: (b) => b.to === "x.io/e" });
    expect(pinned.edges.map((e) => [e.id, e.pinned])).toEqual([["m/api→m/core", false], ["m/api→x.io/e", true]]);
  });
  it("selection lights direct neighbours and dims the rest (U4)", () => {
    const sc = at({ depth: 2, selected: "m/core" });
    expect(sc.nodes.filter((n) => !n.dim).map((n) => n.id)).toEqual(["m", "m/api", "m/core"]);
    expect(sc.edges.filter((e) => e.hot).map((e) => e.id)).toEqual(["m/api→m/core"]);
  });
  it("a container can be selected, so going up selects the box the reader left", () => {
    const sc = scene(g, up({ ...DEFAULT_STATE, focus: "example.com/shop/internal" }, "example.com/shop"));
    expect(sc.selected).toBe("example.com/shop/internal");
    expect(sc.nodes.find((n) => n.id === "example.com/shop/internal")).toMatchObject({ shape: "container", selected: true });
  });
  it("a selected method lights through its type and is its selected row", () => {
    const sc = scene(g, { ...DEFAULT_STATE, focus: store, selected: `${store}.Repo.Get` });
    expect([sc.selected, sc.selectedRow]).toEqual([`${store}.Repo`, `${store}.Repo.Get`]);
    expect(sc.edges.filter((e) => e.hot).map((e) => e.id)).toEqual([`${store}.Repo→${store}.Open`]);
  });
  it("a package inside a closed box is selected as that box; an unknown one is ignored", () => {
    expect(at({ depth: 2, selected: "m/core/a" }).selected).toBe("m/core");
    expect(at({ depth: 2, selected: "m/nope" }).selected).toBeNull();
  });
  it("focus N hops keeps only nearby nodes", () => {
    expect(ids(at({ depth: 2, selected: "m/core", hops: 1 }).nodes)).toEqual(["m", "m/api", "m/core"]);
  });
  it("declutter: arrows join containers, triangles mark boxes, classes fold leaves (uml-viewer)", () => {
    expect(ids(at({ depth: 3, stage: "arrows" }).edges)).toEqual(["m→m/core", "m→x.io/e"]);
    const tri = at({ depth: 3, stage: "triangles" });
    expect([tri.lines, tri.edges.length]).toEqual([false, 0]);
    expect(tri.nodes.find((n) => n.id === "m/core")?.mark).toMatchObject({ in: true, out: false });
    expect(at({ depth: 3, stage: "classes" }).nodes.map((n) => [n.id, n.shape]))
      .toEqual([["m", "container"], ["m/core", "box"], ["x.io/e", "oval"]]);
    const sel = at({ depth: 3, stage: "triangles", selected: "m/api" });
    expect(sel.edges.map((e) => [e.id, e.hot])).toEqual([["m→m/core", true], ["m→x.io/e", true]]);
  });
  it("hide edges keeps the stage and draws marks; pinned bundles mark red", () => {
    const sc = scene(v, { ...DEFAULT_STATE, depth: 2, lines: false }, { pin: (b) => b.to === "x.io/e" });
    expect([sc.stage, sc.lines, sc.edges.length]).toEqual(["full", false, 0]);
    expect(sc.nodes.find((n) => n.id === "x.io/e")?.mark).toEqual({ in: true, out: false, inPinned: true, outPinned: false });
  });
  it("a type lists its methods as rows until the elements stage", () => {
    const w = view([...pkgs(["m/p"], "m", { detail: true }), decl("m/p.T", "m/p"),
      decl("m/p.T.Put", "m/p.T", "function"), decl("m/p.T.Get", "m/p.T", "function")]);
    expect(scene(w, { ...DEFAULT_STATE, focus: "m/p" }).nodes[0]).toMatchObject({ id: "m/p.T", shape: "decl", methods: ["Get", "Put"] });
    expect(scene(w, { ...DEFAULT_STATE, focus: "m/p", stage: "elements" }).nodes[0].methods).toEqual([]);
  });
  it("a package without detail draws nothing, and says so", () => {
    expect(scene(g, { ...DEFAULT_STATE, focus: "example.com/shop#pkg" })).toMatchObject({ noDetail: true, nodes: [], edges: [] });
  });
  it("externals toggle removes ovals and their edges", () => {
    expect(ids(at({ depth: 2, externals: false }).nodes)).not.toContain("x.io/e");
  });
  it("knows which ids a hash may name", () => {
    const k = knownIds(v);
    expect([k.box(""), k.box("m/core"), k.box("m#pkg"), k.box("m/api#pkg"), k.box("x.io/e")]).toEqual([true, true, true, false, false]);
    expect([k.folder("m/core"), k.folder("m/api"), k.folder("m#pkg")]).toEqual([true, false, false]);
    expect([k.node("x.io/e"), k.node("outside"), k.node("m/nope")]).toEqual([true, true, false]);
  });
  it("a Change View link focused outside the changed subgraph opens the whole View (U10)", () => {
    const ch = { ...v, kind: "change" as const, nodes: v.nodes.map((n) => (n.id === "m/api" ? { ...n, status: "modified" } : n)) };
    const sub = changedSubgraph(ch);
    expect(["", "m/api", "m/core", "m/lone"].map((f) => openFull(sub, f))).toEqual([false, false, true, true]);
  });
  it("limits a layout to 2,000 nodes or 500 drawn edges (Deviation 8)", () => {
    const big = (nodes: number, edges: number, lines = true) =>
      tooBig({ nodes: Array(nodes).fill(null), edges: Array(edges).fill(null), lines });
    expect(DRAW_LIMIT).toEqual({ nodes: 2000, edges: 500 });
    expect([big(2000, 500), big(2001, 0), big(10, 501), big(10, 501, false)]).toEqual([false, true, true, false]);
    expect(tooBig(at({ depth: 2 }))).toBe(false);
  });
  it("draws the deepest depth that fits, or asks when even depth 1 does not (Deviation 8)", () => {
    const sized = (edges: number[]) => (depth: number) =>
      ({ depth, nodes: [], edges: Array(edges[depth - 1]).fill(null), lines: true });
    const k8s = sized([184, 379, 505, 1712]);
    expect(fitDepth(k8s(4), k8s)).toBe(2);
    expect(fitDepth(k8s(2), k8s)).toBe(2);
    expect(fitDepth({ ...k8s(4), lines: false }, k8s)).toBe(4);
    const huge = sized([600, 900]);
    expect(fitDepth(huge(2), huge)).toBeNull();
    const tight = { nodes: 2000, edges: 2 };
    expect([1, 2].map((d) => at({ depth: d }).edges.length)).toEqual([1, 3]);
    expect(fitDepth(at({ depth: 2 }), (d) => at({ depth: d }), tight)).toBe(1);
  });
  it("is independent of input order", () => {
    const w = { ...v, nodes: [...v.nodes].reverse(), edges: [...v.edges].reverse() };
    expect(scene(w, { ...DEFAULT_STATE, depth: 2 })).toEqual(at({ depth: 2 }));
  });
  it("opens the shop golden fully expanded, and store at its declarations", () => {
    const top = scene(g, DEFAULT_STATE);
    expect(top.depth).toBe(3);
    expect(top.nodes.map((n) => [n.label, n.shape])).toEqual([
      ["shop", "container"], ["shop (package)", "box"], ["internal", "container"],
      ["checkout", "box"], ["money", "box"], ["store", "box"],
      ["shop/tools", "container"], ["gen", "box"],
      ["github.com/lib/pq", "oval"], ["golang.org/x/sync", "oval"],
    ]);
    expect(top.edges).toHaveLength(7);
    const sc = scene(g, { ...DEFAULT_STATE, focus: store });
    expect(sc.nodes.find((n) => n.label === "Repo")?.methods).toEqual(["Get", "Reset", "check"]);
  });
  it("Change View (04 Part B): opens changed packages onto their changed declarations and a chip", () => {
    const ch = parseView(JSON.stringify(change));
    const sc = scene(ch, DEFAULT_STATE);
    expect(sc.nodes.find((n) => n.id === store)).toMatchObject({ shape: "container", change: "st-modified" });
    expect(sc.nodes.filter((n) => n.parent === store).map((n) => n.label)).toEqual(["+10 unchanged", "Order", "ReadWriter", "Repo"]);
    expect(sc.nodes.find((n) => n.id === `${store}.Repo`)).toMatchObject({ methods: ["Get", "check"], rowMarks: ["st-modified", "st-modified"] });
    expect(sc.nodes.find((n) => n.id === "example.com/shop/tools/gen")?.change).toBe("affected");
    expect(sc.edges.filter((e) => e.status).map((e) => [e.id, e.status])).toEqual([
      ["example.com/shop#pkg→example.com/shop/internal/money", "added"],
      ["example.com/shop/internal/money→example.com/shop/internal/store", "reversed"],
    ]);
  });
  it("Change View: folded changed packages get a chip, or a has-change mark on a box", () => {
    const ch = parseView(JSON.stringify(change));
    const chip = scene(ch, { ...DEFAULT_STATE, depth: 1 }).nodes.find((n) => n.parent === "example.com/shop" && n.shape === "chip" && n.label.includes("package"));
    expect(chip?.label).toBe("+3 changed packages");
    const plain = { ...ch, nodes: ch.nodes.map((n) => (n.id === "example.com/shop" ? { ...n, status: undefined, detail: false } : n)) };
    const box = scene(plain, { ...DEFAULT_STATE, depth: 1 }).nodes.find((n) => n.id === "example.com/shop");
    expect(box?.shape).toBe("box");
    expect(box?.change).toContain("has-change");
  });
  it("Change View: a declaration opened by the change can be selected, a method as its row", () => {
    const ch = parseView(JSON.stringify(change));
    const sc = scene(ch, { ...DEFAULT_STATE, selected: `${store}.Repo.Get` });
    expect([sc.selected, sc.selectedRow]).toEqual([`${store}.Repo`, `${store}.Repo.Get`]);
    expect(sc.nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([`${store}.Repo`]);
  });
});
