import { describe, expect, it } from "vitest";
import { diffLink, fileDiffLink, linkFor } from "./links";

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

// 14: the Change View's links, which zu computed.
const change = {
  blob: "",
  base: "https://github.com/o/r/blob/bbbb/{path}#L{line}",
  files: { "a/a.go": "https://github.com/o/r/compare/b...h#diff-6f0e", "x.go": "javascript:alert(1)" },
  nodes: { "m/a.F": "https://github.com/o/r/compare/b...h#diff-6f0eR3" },
};

describe("Change View links (14)", () => {
  it("links what the change removed at base, and nothing at a dirty head", () => {
    expect(linkFor(change, "a/a.go", 2, "base")).toBe("https://github.com/o/r/blob/bbbb/a/a.go#L2");
    expect(linkFor(change, "a/a.go", 2)).toBeNull();
  });
  it("gives a declaration's and a file's place on the compare page, https only", () => {
    expect(diffLink(change, "m/a.F")).toBe("https://github.com/o/r/compare/b...h#diff-6f0eR3");
    expect(fileDiffLink(change, "a/a.go")).toBe("https://github.com/o/r/compare/b...h#diff-6f0e");
    expect(fileDiffLink(change, "x.go")).toBeNull();
  });
  it("gives nothing for an id or path it lacks, inherited names included", () => {
    expect(diffLink(change, "m/a.G")).toBeNull();
    expect(diffLink(change, "constructor")).toBeNull();
    expect(fileDiffLink(gh, "a/a.go")).toBeNull();
  });
});
