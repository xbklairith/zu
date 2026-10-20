import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import type { SourceFile, View } from "./data";
import { around, CODE_LINES, inline, paint, reader } from "./code";

const shop = golden as unknown as View;
const P = "internal/store/store.go";

describe("paint (19)", () => {
  it("cuts each line into the runs zu coloured, losing no text", () => {
    const lines = paint(shop.sources[P].split("\n"), shop.syntax![P]);
    expect(lines.length).toBe(shop.sources[P].split("\n").length);
    expect(lines.map((l) => l.map((s) => s.text).join("")).join("\n")).toBe(shop.sources[P]);
    expect(lines[1]).toEqual([{ text: "package", cls: "kw" }, { text: " store" }]);
    expect(lines[0]).toEqual([{ text: "// Package store keeps orders.", cls: "com" }]);
    expect(lines[4]).toEqual([{ text: "\t" }, { text: '"database/sql"', cls: "str" }]);
  });
  it("counts columns in UTF-16 units, as export.Syntax does", () => {
    expect(paint(['x := "é😀" // ไทย', "func"], [[5, 5, 3, 11, 6, 2], [0, 4, 1]])).toEqual([
      [{ text: "x := " }, { text: '"é😀"', cls: "str" }, { text: " " }, { text: "// ไทย", cls: "com" }],
      [{ text: "func", cls: "kw" }],
    ]);
    expect(paint(["n := 0x1F"], [[5, 4, 4]])).toEqual([[{ text: "n := " }, { text: "0x1F", cls: "num" }]]);
  });
  it("draws text plain where it has no runs, and cuts runs to their line", () => {
    expect(paint(["a", "b"], [])).toEqual([[{ text: "a" }], [{ text: "b" }]]);
    expect(paint(["a", "b"], [[0, 1, 1]])).toEqual([[{ text: "a", cls: "kw" }], [{ text: "b" }]]);
    expect(paint(["ab"], [[1, 9, 2, 0, 1, 1, 5, 1, 1]])).toEqual([[{ text: "a" }, { text: "b", cls: "com" }]]);
    expect(paint(["ab"], [[0, 1, 9]])).toEqual([[{ text: "ab" }]]); // a class this page does not know
  });
});

describe("around (19)", () => {
  it("is every line of a file that fits", () => {
    expect(around(3, 2, 5)).toEqual([0, 3]);
    expect(around(5, 5, 5)).toEqual([0, 5]);
  });
  it("centres size lines on the line, held inside the file", () => {
    expect(around(100, 50, 10)).toEqual([44, 54]);
    expect(around(100, 2, 10)).toEqual([0, 10]);
    expect(around(100, 100, 10)).toEqual([90, 100]);
  });
  it("draws CODE_LINES of a longer file", () => {
    expect(around(CODE_LINES + 1, CODE_LINES + 1)).toEqual([1, CODE_LINES + 1]);
  });
});

describe("inline (19)", () => {
  it("is a file the View carries, with its colour", () => {
    expect(inline(shop, P)).toEqual({ path: P, text: shop.sources[P], syntax: shop.syntax![P] });
  });
  it("is null for a file the View does not carry", () => {
    expect(inline(shop, "main.go")).toBeNull();
  });
});

describe("reader (19)", () => {
  it("reads each file once, and a new reader reads it again", async () => {
    const asked: string[] = [];
    const get = async (path: string): Promise<SourceFile | null> => {
      asked.push(path);
      return path === "gone.go" ? null : { path, text: "package a\n", syntax: [[0, 7, 1], []] };
    };
    const read = reader(get);
    const [a, b] = [read("a.go"), read("a.go")];
    expect(a).toBe(b);
    expect((await a)?.text).toBe("package a\n");
    expect(await read("gone.go")).toBeNull();
    await reader(get)("a.go");
    expect(asked).toEqual(["a.go", "gone.go", "a.go"]);
  });
});
