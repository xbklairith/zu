import { describe, expect, it } from "vitest";
import { linkFor } from "./links";

const gh = { blob: "https://github.com/o/r/blob/90cb22a/{path}#L{line}" };

describe("linkFor", () => {
  it("fills path segments encoded and the line", () => {
    expect(linkFor(gh, "internal/a b/x.go", 12)).toBe("https://github.com/o/r/blob/90cb22a/internal/a%20b/x.go#L12");
  });
  it("refuses anything but https", () => {
    expect(linkFor({ blob: "javascript:alert(1)//{path}" }, "x.go", 1)).toBeNull();
    expect(linkFor({ blob: "http://h/{path}" }, "x.go", 1)).toBeNull();
  });
  it("gives nothing without links", () => {
    expect(linkFor(undefined, "x.go", 1)).toBeNull();
  });
});
