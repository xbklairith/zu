import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView } from "./data";
import { layout, scene, type Item } from "./layout";
import { autoDepth } from "./tree";

const v = parseView(JSON.stringify(golden));

describe("scene", () => {
  it("draws the shop root as containers, leaves and one oval per external", () => {
    const s = scene(v, "", autoDepth(v, ""));
    const byId = new Map(s.items.map((i) => [i.id, i]));
    expect(byId.get("example.com/shop")).toMatchObject({ shape: "container", label: "example.com/shop" });
    expect(byId.get("example.com/shop#pkg")).toMatchObject({ shape: "box", label: "shop (package)", parent: "example.com/shop" });
    expect(byId.get("example.com/shop/internal/store")).toMatchObject({ shape: "box", label: "store", parent: "example.com/shop/internal" });
    expect(byId.get("github.com/lib/pq")).toMatchObject({ shape: "oval" });
    expect(s.edges.length).toBeGreaterThan(0);
    for (const e of s.edges) {
      expect(byId.has(e.from) && byId.has(e.to)).toBe(true);
    }
  });
  it("a declaration view has method rows inside types", () => {
    const store = "example.com/shop/internal/store";
    const s = scene(v, store, autoDepth(v, store));
    const repo = s.items.find((i) => i.id === `${store}.Repo`);
    expect(repo).toMatchObject({ shape: "decl", label: "Repo", rows: ["Get", "Reset", "check"] });
  });
});

describe("layout", () => {
  it("is deterministic, finite and independent of input order", async () => {
    const s = scene(v, "", autoDepth(v, ""));
    const a = await layout(s.items, s.edges);
    const b = await layout(s.items, s.edges);
    const shuffled = await layout([...s.items].reverse() as Item[], [...s.edges].reverse());
    expect(a).toEqual(b);
    expect(shuffled).toEqual(a);
    expect(a.size).toBe(s.items.length);
    for (const p of a.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(a.get("example.com/shop/internal/store")?.parent).toBe("example.com/shop/internal");
  });
});
