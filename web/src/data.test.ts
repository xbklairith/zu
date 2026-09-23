import { describe, expect, it } from "vitest";
import { parseView } from "./data";

describe("parseView", () => {
  it("refuses a schema it does not know", () => {
    expect(() => parseView('{"schema":"2"}')).toThrow(/schema 2/);
  });
  it("accepts schema 1", () => {
    expect(parseView('{"schema":"1","nodes":[],"edges":[]}').schema).toBe("1");
  });
});
