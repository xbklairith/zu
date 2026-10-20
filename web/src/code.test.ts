import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import type { DeclDiff, Loc, SourceFile, View, ViewEdge } from "./data";
import { around, behind, centre, CODE_LINES, inline, litNote, numbered, paint, reader } from "./code";
import { decl, pkgs, view } from "./testkit";

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

describe("centre (19)", () => {
  const n = CODE_LINES * 2;
  it("is the line drawn around while the lines drawn hold the first lit line, or none is lit", () => {
    expect(centre(n, 10, 0)).toBe(10);
    expect(centre(n, 10, CODE_LINES)).toBe(10);
    expect(centre(100, 1, 99)).toBe(1); // drawn whole
  });
  it("is the first lit line when they do not", () => {
    expect(centre(n, 10, CODE_LINES + 1)).toBe(CODE_LINES + 1);
    expect(centre(n, n, 1)).toBe(1);
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

// m.F calls m.G three times, in two files, and m.T's method M once; m.T
// embeds m.E; a call the change removed from F to H was written in base.
const at = (path: string, line: number): Loc => ({ path, line });
const call = (from: string, to: string, locs: Loc[], kind: ViewEdge["kind"] = "calls", status?: string): ViewEdge => ({
  from, to, kind, count: locs.length, loc: locs[0], ...(locs.length > 1 ? { more: locs.slice(1) } : {}), ...(status ? { status } : {}),
});
const lines = view(
  [...pkgs(["m"], "m"), decl("m.F", "m", "function"), decl("m.G", "m", "function"), decl("m.H", "m", "function"),
    decl("m.T", "m"), decl("m.T.M", "m.T", "function"), decl("m.E", "m")],
  [
    call("m.F", "m.G", [at("a.go", 4), at("a.go", 9), at("b.go", 2)]),
    call("m.F", "m.T.M", [at("a.go", 6)]),
    call("m.T", "m.E", [at("t.go", 3)], "embeds"),
    call("m.F", "m.H", [at("a.go", 5)], "calls", "removed"),
    { from: "m", to: "m", kind: "imports", count: 2, loc: at("a.go", 1) },
  ],
);
const is = (id: string) => (x: string) => x === id;

describe("behind (19)", () => {
  it("is where the calls and embeds from one end to the other are written, every one, by path and line", () => {
    expect(behind(lines, is("m.F"), is("m.G"))).toEqual([at("a.go", 4), at("a.go", 9), at("b.go", 2)]);
    expect(behind(lines, is("m.F"), (x) => x === "m.G" || x.startsWith("m.T"))).toEqual([at("a.go", 4), at("a.go", 6), at("a.go", 9), at("b.go", 2)]);
    expect(behind(lines, is("m.T"), is("m.E"))).toEqual([at("t.go", 3)]);
  });
  it("has none for a call the change removed: its lines are base's", () => {
    expect(behind(lines, is("m.F"), is("m.H"))).toEqual([]);
  });
  it("reads no import", () => {
    expect(behind(lines, is("m"), is("m"))).toEqual([]);
  });
});

describe("litNote (19)", () => {
  it("says where the lit lines are, in the shown file and in others", () => {
    expect(litNote([at("a.go", 4), at("a.go", 9), at("b.go", 2)], "a.go")).toBe("Lines 4, 9; in other files: b.go:2.");
    expect(litNote([at("a.go", 4)], "a.go")).toBe("Line 4.");
    expect(litNote([at("b.go", 2), at("c.go", 7)], "a.go")).toBe("In other files: b.go:2, c.go:7.");
  });
  it("lists at most eight places of each", () => {
    const many = Array.from({ length: 10 }, (_, i) => at("a.go", i + 1));
    expect(litNote(many, "a.go")).toBe("Lines 1, 2, 3, 4, 5, 6, 7, 8 and 2 more.");
  });
  it("says how to light lines, and why a removed call has none", () => {
    expect(litNote(null, "a.go")).toBe("Point at a call or embed to light the lines it is written on.");
    expect(litNote([], "a.go")).toBe("The change removed it: it has no line in head.");
  });
});

// 20: store.Repo.Get's own diff in the shop's Change View: one line added.
const get: DeclDiff = {
  basePath: "s.go", headPath: "s.go", baseStart: 42, baseLines: 3, headStart: 36, headLines: 3,
  lines: [" func Get() {", "-\tr.check()", "+\tr.hook()", " }"],
};

describe("numbered (20)", () => {
  it("numbers each line at base and at head, as the diff runs", () => {
    expect(numbered(get)).toEqual([
      { mark: " ", text: "func Get() {", base: 42, head: 36 },
      { mark: "-", text: "\tr.check()", base: 43 },
      { mark: "+", text: "\tr.hook()", head: 37 },
      { mark: " ", text: "}", base: 44, head: 38 },
    ]);
  });
  it("numbers a removed declaration at base only", () => {
    const gone: DeclDiff = { basePath: "s.go", baseStart: 18, baseLines: 2, headStart: 0, headLines: 0, lines: ["-type R interface {", "-}"] };
    expect(numbered(gone).map((r) => [r.base, r.head])).toEqual([[18, undefined], [19, undefined]]);
  });
});
