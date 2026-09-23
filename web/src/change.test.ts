import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.change.golden.json";
import { changedSubgraph, edgeMark, nodeMark, unchangedCount } from "./change";
import { parseView } from "./data";
import { scene } from "./layout";
import { autoDepth, bundles } from "./tree";

const v = parseView(JSON.stringify(golden));
const shop = "example.com/shop/internal/";
const node = (id: string) => v.nodes.find((n) => n.id === id)!;

describe("change marks", () => {
  it("maps a node's status, Move and hop to one mark", () => {
    expect(nodeMark(node(`${shop}store`))).toBe("st-modified");
    expect(nodeMark(node(`${shop}store.ReadWriter`))).toBe("st-removed");
    expect(nodeMark(node(`${shop}money.Plus`))).toBe("st-moved");
    expect(nodeMark(node("example.com/shop/tools/gen"))).toBe("affected");
    expect(nodeMark(node(`${shop}store.Repo`))).toBe("");
    expect(nodeMark({ ...node(`${shop}store`), status: "added" })).toBe("st-added");
  });
  it("maps an edge status to a class and a sign", () => {
    expect(edgeMark("added")).toEqual({ cls: "edge-added", sign: "+" });
    expect(edgeMark("removed")).toEqual({ cls: "edge-removed", sign: "−" });
    expect(edgeMark("reversed")).toEqual({ cls: "edge-reversed", sign: "⇄" });
    expect(edgeMark("mixed")).toEqual({ cls: "edge-mixed", sign: "±" });
    expect(edgeMark(undefined)).toEqual({ cls: "", sign: "" });
  });
  it("gives a bundle the status its edges share", () => {
    const b = bundles(v, "", autoDepth(v, "")).find((e) => e.from === `${shop}money` && e.to === `${shop}store`);
    expect(b?.status).toBe("reversed");
  });
});

describe("changed subgraph", () => {
  it("keeps the changed packages and their importers one hop away", () => {
    const g = changedSubgraph(v);
    const pkgs = g.nodes.filter((n) => n.kind === "package").map((n) => n.id);
    expect(pkgs).toEqual([
      "example.com/shop",
      `${shop}checkout`,
      `${shop}money`,
      `${shop}store`,
      "example.com/shop/tools/gen",
    ]);
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(g.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(ids.has(`${shop}store.Repo.Get`)).toBe(true);
  });
  it("keeps a package reached only by a changed import", () => {
    const dep = { ...node("example.com/shop/tools/gen"), id: "example.com/shop/dep", hop: undefined };
    const edge = { ...v.edges[0], from: `${shop}store`, to: dep.id, kind: "imports" as const, status: "added" };
    const g = changedSubgraph({ ...v, nodes: [...v.nodes, dep], edges: [...v.edges, edge] });
    expect(g.nodes.some((n) => n.id === dep.id)).toBe(true);
    expect(g.edges.some((e) => e.to === dep.id)).toBe(true);
  });
  it("drops packages further out", () => {
    const far = { ...node("example.com/shop/tools/gen"), id: "example.com/shop/far", hop: 2 };
    const g = changedSubgraph({ ...v, nodes: [...v.nodes, far] });
    expect(g.nodes.some((n) => n.id === far.id)).toBe(false);
  });
  it("counts the declarations a changed package does not draw", () => {
    // store: 14 declarations; Order, Repo (parent of changed methods), Repo.Get
    // and Repo.check are drawn; the removed ReadWriter is not one of the 14.
    expect(unchangedCount(v, `${shop}store`)).toBe(10);
    expect(unchangedCount(v, `${shop}money`)).toBe(2);
  });
});

describe("change scene", () => {
  it("opens changed packages onto their changed declarations and a chip", () => {
    const s = scene(v, "", autoDepth(v, ""));
    const store = s.items.find((i) => i.id === `${shop}store`);
    expect(store?.shape).toBe("container");
    expect(store?.mark).toBe("st-modified");
    const inStore = s.items.filter((i) => i.parent === `${shop}store`);
    expect(inStore.map((i) => i.label)).toEqual(["+10 unchanged", "Order", "ReadWriter", "Repo"]);
    const repo = inStore.find((i) => i.label === "Repo")!;
    expect(repo.rows).toEqual(["Get", "check"]);
    expect(repo.rowMarks).toEqual(["st-modified", "st-modified"]);
    expect(s.items.find((i) => i.id === "example.com/shop/tools/gen")?.mark).toBe("affected");
  });
});
