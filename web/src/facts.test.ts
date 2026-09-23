import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView } from "./data";
import { calls, imports, targets } from "./facts";

const v = parseView(JSON.stringify(golden));
const store = "example.com/shop/internal/store";

describe("panel facts", () => {
  it("lists a box's imports out and importers, by package, with counts", () => {
    const f = imports(v, "example.com/shop/internal");
    expect(f.out.map((r) => r.id)).toContain("github.com/lib/pq");
    expect(f.out.every((r) => !r.id.startsWith("example.com/shop/internal/"))).toBe(true);
    expect(f.in.map((r) => r.id)).toContain("example.com/shop");
  });
  it("lists a declaration's calls, counting its methods as the type", () => {
    const c = calls(v, `${store}.Repo`);
    expect(c.out).toEqual([
      { id: `${store}.Open`, count: 1 },
      { id: "github.com/lib/pq", count: 1 },
    ]);
    expect(c.in).toEqual([]);
  });
  it("lists the real targets behind an aggregate node", () => {
    const t = targets(v, "example.com/shop/internal", 1, "outside");
    expect(t.map((r) => r.id)).toEqual(["example.com/shop", "example.com/shop/tools/gen"]);
  });
});
