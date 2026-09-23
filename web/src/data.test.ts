import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView } from "./data";

describe("parseView", () => {
  it("refuses a schema it does not know", () => {
    expect(() => parseView('{"schema":"2"}')).toThrow(/schema 2/);
  });
  it("accepts schema 1", () => {
    expect(parseView('{"schema":"1","nodes":[],"edges":[]}').schema).toBe("1");
  });
  it("parses the Go golden", () => {
    const v = parseView(JSON.stringify(golden));
    expect(v.nodes.some((n) => n.id === "example.com/shop/internal/store.Repo")).toBe(true);
  });
});
