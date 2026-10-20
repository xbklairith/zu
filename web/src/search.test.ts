import { describe, expect, it } from "vitest";
import { reveal, search } from "./search";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { decl, edge, exts, pkgs, view } from "./testkit";

const v = view([
  ...pkgs(["m/store", "m/store/sql"], "m", { detail: true }), ...pkgs(["m/restore"], "m"),
  decl("m/store.Repo", "m/store"), decl("m/store.Repo.Get", "m/store.Repo", "function"),
  ...exts(Array.from({ length: 21 }, (_, i) => `x.io/e${i}`)),
], Array.from({ length: 21 }, (_, i) => edge("m/restore", `x.io/e${i}`)));

describe("search", () => {
  it("ranks exact names, then prefixes, then substrings", () => {
    expect(search(v, "store").map((h) => h.id)).toEqual(["m/store", "m/restore", "m/store/sql", "m/store.Repo", "m/store.Repo.Get"]);
    expect(search(v, "Get").map((h) => [h.id, h.name])).toEqual([["m/store.Repo.Get", "Repo.Get"]]);
    expect(search(v, "  ")).toEqual([]);
  });
  it("ranks word starts between prefixes and substrings (17)", () => {
    const w = view([
      ...pkgs(["m/a"], "m", { detail: true }),
      decl("m/a.ReadWriter", "m/a"), decl("m/a.HTTPServer", "m/a"), decl("m/a.rwLock", "m/a"),
      decl("m/a.newWaveSpawner", "m/a", "function"),
    ]);
    expect(search(w, "RW").map((h) => h.name)).toEqual(["rwLock", "ReadWriter"]); // a prefix first
    expect(search(w, "wsp").map((h) => h.name)).toEqual(["newWaveSpawner"]); // from any word, in any case
    expect(search(w, "HSe").map((h) => h.name)).toEqual(["HTTPServer"]); // capitals before a word are one word
    expect(search(w, "ns")).toEqual([]); // the words are consecutive: New, Spawner skips Wave
  });
  it("reveal draws and selects the target, a method as a row of its type", () => {
    for (const id of ["m/store/sql", "m/store.Repo", "m/store.Repo.Get", "x.io/e3"]) {
      expect(scene(v, reveal(v, id)).selected, id).not.toBeNull();
    }
    expect(reveal(v, "m/store.Repo.Get")).toMatchObject({ focus: "m/store#pkg", selected: "m/store.Repo.Get" });
    expect(scene(v, reveal(v, "m/store.Repo.Get")).selectedRow).toBe("m/store.Repo.Get");
    expect(reveal(v, "x.io/e3").selected).toBe("externals");
  });
  it("reveal keeps the stage and hide-edges, and resets what could hide the target", () => {
    const from = { ...DEFAULT_STATE, stage: "arrows" as const, edges: "off" as const, minPairs: 3, externals: false, hops: 2, toggled: ["m"] };
    expect(reveal(v, "m/store/sql", from)).toMatchObject({ stage: "arrows", edges: "off", minPairs: 1, externals: true, hops: null, toggled: [] });
  });
});
