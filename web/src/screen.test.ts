import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import type { View, ViewEdge } from "./data";
import { centreOf, ROW_CAP, screenOf } from "./screen";
import { decl, edge, exts, pkgs, view } from "./testkit";

const shop = golden as unknown as View;
const S = "example.com/shop/internal/store";
const weighed = (from: string, to: string, count: number, kind: ViewEdge["kind"] = "imports"): ViewEdge =>
  ({ ...edge(from, to, kind), count });
const ids = (r: { boxes: { id: string }[] }) => r.boxes.map((b) => b.id);

describe("centreOf", () => {
  it("centres a package, a declaration or an external, and a method's type", () => {
    expect(centreOf(shop, S)).toBe(S);
    expect(centreOf(shop, `${S}.Open`)).toBe(`${S}.Open`);
    expect(centreOf(shop, `${S}.Repo`)).toBe(`${S}.Repo`);
    expect(centreOf(shop, `${S}.Repo.Get`)).toBe(`${S}.Repo`);
    expect(centreOf(shop, "github.com/lib/pq")).toBe("github.com/lib/pq");
  });
  it("centres the package of an X#pkg box, and nothing else that is not a node", () => {
    const v = view(pkgs(["m/a", "m/a/b"], "m"));
    expect(centreOf(v, "m/a#pkg")).toBe("m/a");
    for (const id of ["m", "outside", "externals", "m/a#demoted", "m#more", "m/nosuch", null]) {
      expect(centreOf(v, id), String(id)).toBeNull();
    }
  });
  it("centres nothing in a Change View (18 draws the Screen there)", () => {
    expect(centreOf(change as unknown as View, S)).toBeNull();
  });
});

describe("screenOf", () => {
  it("at a package: its importers above, what it imports below", () => {
    const s = screenOf(shop, S);
    expect(s.grain).toBe("package");
    expect(ids(s.above)).toEqual(["example.com/shop/internal/checkout"]);
    expect(ids(s.below)).toEqual(["example.com/shop/internal/money", "github.com/lib/pq"]);
    expect(s.below.boxes.map((b) => [b.label, b.size])).toEqual([["internal/money", "medium"], ["github.com/lib/pq", "small"]]);
    expect(screenOf(shop, "github.com/lib/pq")).toMatchObject({ grain: "package", below: { boxes: [], more: 0 } });
  });
  it("draws a package that imports the centre and is imported by it in both rows", () => {
    const s = screenOf(view(pkgs(["m/a", "m/b", "m/c"], "m"), [edge("m/a", "m/b"), edge("m/b", "m/a"), edge("m/c", "m/a")]), "m/a");
    expect(s.above.boxes.map((b) => [b.id, b.both])).toEqual([["m/b", true], ["m/c", false]]);
    expect(s.below.boxes.map((b) => [b.id, b.both])).toEqual([["m/b", true]]);
  });
  it("sizes a box by its Weight against the heaviest in its row", () => {
    const v = view([...pkgs(["m/core", "m/a", "m/b", "m/c", "m/d"], "m"), ...exts(["x.io/lib"])], [
      weighed("m/a", "m/core", 10), weighed("m/b", "m/core", 4), weighed("m/c", "m/core", 2), weighed("m/d", "m/core", 1),
      weighed("m/core", "m/a", 2), weighed("m/core", "x.io/lib", 1),
    ]);
    const s = screenOf(v, "m/core");
    // largest from half the heaviest, medium from a fifth, small below
    expect(s.above.boxes.map((b) => [b.id, b.weight, b.size])).toEqual([
      ["m/a", 10, "large"], ["m/b", 4, "medium"], ["m/c", 2, "medium"], ["m/d", 1, "small"],
    ]);
    // a row weighing at most 2 is flat; an external is always small
    expect(s.below.boxes.map((b) => [b.id, b.size])).toEqual([["m/a", "medium"], ["x.io/lib", "small"]]);
  });
  it("at a declaration: calls and embeds, a method drawn as its type", () => {
    const s = screenOf(shop, `${S}.Repo`);
    expect(s.grain).toBe("declaration");
    expect(ids(s.above)).toEqual([]); // Repo.Get calls Repo.check: inside the centre
    expect(ids(s.below)).toEqual([`${S}.Open`, "github.com/lib/pq"]); // Repo.Reset calls Open; Repo embeds pq
    expect(s.below.boxes[0]).toMatchObject({ label: "Open", sub: "internal/store" });
    expect(ids(screenOf(shop, `${S}.Open`).above)).toEqual([`${S}.Repo`]);
  });
  it("says what a declaration's Screen leaves out", () => {
    // Repo.check calls money.Add, which has no declarations on this page;
    // the store package has 4 Unresolved Calls (ADR 0002).
    expect(screenOf(shop, `${S}.Repo`)).toMatchObject({ offIn: 0, offOut: 1, unresolved: 4 });
    expect(screenOf(shop, `${S}.Open`)).toMatchObject({ offIn: 1, offOut: 0 }); // checkout.Place calls it
    expect(screenOf(shop, S)).toMatchObject({ offIn: 0, offOut: 0, unresolved: 0 }); // imports are all on the page
  });
  it("weighs a declaration by √(sites × declarations), so breadth counts", () => {
    const v = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.F", "m/a", "function"), decl("m/a.T", "m/a"),
      decl("m/a.T.x", "m/a.T", "function"), decl("m/a.T.y", "m/a.T", "function"), decl("m/a.G", "m/a", "function")], [
      weighed("m/a.T.x", "m/a.F", 3, "calls"), weighed("m/a.T.y", "m/a.F", 3, "calls"), weighed("m/a.G", "m/a.F", 6, "calls"),
    ]);
    expect(screenOf(v, "m/a.F").above.boxes.map((b) => [b.id, b.refs, b.members])).toEqual([["m/a.T", 6, 2], ["m/a.G", 6, 1]]);
  });
  it("never draws a type the centre embeds small", () => {
    const v = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.T", "m/a"), decl("m/a.T.x", "m/a.T", "function"),
      decl("m/a.F", "m/a", "function"), decl("m/a.E", "m/a")], [weighed("m/a.T.x", "m/a.F", 30, "calls"), weighed("m/a.T", "m/a.E", 1, "embeds")]);
    expect(screenOf(v, "m/a.T").below.boxes.map((b) => [b.id, b.size])).toEqual([["m/a.F", "large"], ["m/a.E", "medium"]]);
  });
  it(`draws ${ROW_CAP} boxes a row and counts the rest, or every box`, () => {
    const many = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
    const v = view(pkgs(["m/core", ...many], "m"), many.map((p) => edge(p, "m/core")));
    expect(screenOf(v, "m/core").above).toMatchObject({ more: 30 - ROW_CAP });
    expect(ids(screenOf(v, "m/core").above)).toEqual(many.slice(0, ROW_CAP));
    expect(screenOf(v, "m/core", true).above.boxes).toHaveLength(30);
    expect(screenOf(v, "m/core", true).above.more).toBe(0);
  });
});
