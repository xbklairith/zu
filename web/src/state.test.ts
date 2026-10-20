import { describe, expect, it } from "vitest";
import {
  centreAt, decodeHash, deeper, DEFAULT_STATE, drill, encodeHash, nextStage, select, shallower, storeHash, toggle, up,
  type ViewState,
} from "./state";

const known = {
  box: (id: string) => ["", "m/a", "m/b", "m/a#pkg"].includes(id),
  folder: (id: string) => ["m/a", "m/b"].includes(id),
  node: (id: string) => id.startsWith("m/"),
  centre: (id: string) => ["m/a", "m/b"].includes(id),
};

describe("URL hash", () => {
  it("the default state is an empty hash", () => {
    expect(encodeHash(DEFAULT_STATE)).toBe("");
    expect(decodeHash("", known)).toEqual(DEFAULT_STATE);
  });
  it("round-trips every field, with toggles sorted", () => {
    const s: ViewState = { focus: "m/a#pkg", depth: 3, toggled: ["m/b", "m/a"], selected: "m/a.T",
      hops: 2, stage: "triangles", edges: "off", minPairs: 4, externals: false, proposal: null, centre: "m/b", more: true };
    const h = encodeHash(s);
    expect(h).toBe("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0&c=m%2Fb&m=1");
    expect(decodeHash(h, known)).toEqual({ ...s, toggled: ["m/a", "m/b"] });
  });
  it("keeps the edge mode as l: absent for auto, 1 for on, 0 for off, as 05's links wrote it (11)", () => {
    expect(["auto", "on", "off"].map((edges) => encodeHash({ ...DEFAULT_STATE, edges } as ViewState))).toEqual(["", "#l=1", "#l=0"]);
    expect(["", "#l=1", "#l=0", "#l=2"].map((h) => decodeHash(h, known).edges)).toEqual(["auto", "on", "off", "auto"]);
  });
  it("reads the links 05, 07 and 09 recorded as they meant them: l=0 is still edges off (11)", () => {
    // 09's paint.mjs views, 05's acceptance hash, and 05/07's round-trip hash.
    expect(decodeHash("#d=3&l=0", known)).toEqual({ ...DEFAULT_STATE, depth: 3, edges: "off" });
    expect(decodeHash("#f=m%2Fa&d=6&l=0", known)).toEqual({ ...DEFAULT_STATE, focus: "m/a", depth: 6, edges: "off" });
    expect(decodeHash("#d=2&l=0", known)).toEqual({ ...DEFAULT_STATE, depth: 2, edges: "off" });
    expect(decodeHash("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0", known)).toEqual({
      focus: "m/a#pkg", depth: 3, toggled: ["m/a", "m/b"], selected: "m/a.T", hops: 2, stage: "triangles",
      edges: "off", minPairs: 4, externals: false, proposal: null, centre: null, more: false,
    });
    // Each writes back unchanged.
    for (const h of ["#d=3&l=0", "#f=m%2Fa&d=6&l=0", "#d=2&l=0"]) expect(encodeHash(decodeHash(h, known))).toBe(h);
  });
  it("drops unknown ids, childless toggles and bad numbers instead of failing", () => {
    expect(decodeHash("#f=evil&d=0&d=abc&t=nope&t=m%2Fa%23pkg&s=%3Cb%3E&h=-1&x=none&w=99999", known))
      .toEqual(DEFAULT_STATE);
  });
  it("keeps the Screen's Centre as c, and its rows drawn whole as m, only with a Centre (17)", () => {
    expect(decodeHash("#c=m%2Fb&m=1", known)).toEqual({ ...DEFAULT_STATE, centre: "m/b", more: true });
    expect(decodeHash("#c=m%2Fb", known)).toEqual({ ...DEFAULT_STATE, centre: "m/b" });
    expect(decodeHash("#m=1", known)).toEqual(DEFAULT_STATE);
    expect(decodeHash("#c=m%2Fa.T&m=1", known)).toEqual(DEFAULT_STATE); // not a Centre
    const { centre: _, ...older } = known; // a Known without centre (a Change View) names none
    expect(decodeHash("#c=m%2Fb", older)).toEqual(DEFAULT_STATE);
  });
  it("adds a history entry only when the Centre changes, so Back walks the Screens (17)", () => {
    const calls: string[] = [];
    const history = {
      replaceState: (_: null, __: string, url: string) => void calls.push("replace " + url),
      pushState: (_: null, __: string, url: string) => void calls.push("push " + url),
    };
    const page = { pathname: "/z", search: "", hash: "#s=m%2Fa" };
    const tree = { ...DEFAULT_STATE, selected: "m/a" };
    storeHash(page, history, centreAt(tree, "m/a"), tree); // into the Screen
    storeHash({ ...page, hash: "#s=m%2Fa&c=m%2Fa" }, history, centreAt(tree, "m/b"), centreAt(tree, "m/a")); // re-centred
    storeHash({ ...page, hash: "#s=m%2Fa&c=m%2Fb" }, history, { ...centreAt(tree, "m/b"), more: true }, centreAt(tree, "m/b"));
    storeHash({ ...page, hash: "#s=m%2Fa&c=m%2Fb&m=1" }, history, tree, centreAt(tree, "m/b")); // back to the tree
    expect(calls).toEqual(["push /z#s=m%2Fa&c=m%2Fa", "push /z#s=m%2Fa&c=m%2Fb", "replace /z#s=m%2Fa&c=m%2Fb&m=1", "push /z#s=m%2Fa"]);
    const refuses = { replaceState: () => {}, pushState: () => { throw new Error("SecurityError"); } };
    expect(storeHash(page, refuses, centreAt(tree, "m/a"), tree)).toBe(false);
  });
  it("stores the hash with replaceState, clears it for the default, survives a refusal", () => {
    const writes: string[] = [];
    const history = { replaceState: (_: null, __: string, url: string) => void writes.push(url) };
    const page = { pathname: "/x/zu.html", search: "", hash: "" };
    expect(storeHash(page, history, { ...DEFAULT_STATE, focus: "m/a" })).toBe(true);
    expect(storeHash({ ...page, hash: "#f=m%2Fa" }, history, { ...DEFAULT_STATE, focus: "m/a" })).toBe(true);
    expect(storeHash({ ...page, hash: "#f=m%2Fa" }, history, DEFAULT_STATE)).toBe(true);
    expect(writes).toEqual(["/x/zu.html#f=m%2Fa", "/x/zu.html"]);
    const refuses = { replaceState: () => { throw new Error("SecurityError"); } };
    expect(storeHash(page, refuses, { ...DEFAULT_STATE, focus: "m/a" })).toBe(false);
  });
});

describe("transitions", () => {
  it("drilling resets depth, toggles, selection and hops; up selects where it came from", () => {
    const s = { ...DEFAULT_STATE, depth: 3, toggled: ["m/a"], selected: "m/a", hops: 2 };
    expect(drill(s, "m/a")).toEqual({ ...DEFAULT_STATE, focus: "m/a" });
    expect(up({ ...DEFAULT_STATE, focus: "m/a" }, "")).toEqual({ ...DEFAULT_STATE, selected: "m/a" });
  });
  it("toggle adds and removes, sorted", () => {
    expect(toggle(toggle(DEFAULT_STATE, "m/b"), "m/a").toggled).toEqual(["m/a", "m/b"]);
    expect(toggle({ ...DEFAULT_STATE, toggled: ["m/a"] }, "m/a").toggled).toEqual([]);
  });
  it("a new Centre draws its rows capped again, and keeps the tree as it was (17)", () => {
    const s = { ...DEFAULT_STATE, focus: "m/a", selected: "m/a", centre: "m/a", more: true };
    expect(centreAt(s, "m/b")).toEqual({ ...s, centre: "m/b", more: false });
  });
  it("clearing the selection clears hops; depth steps stay within 1..32; the cycle wraps to full", () => {
    expect(select({ ...DEFAULT_STATE, selected: "x", hops: 2 }, null)).toMatchObject({ selected: null, hops: null });
    expect(shallower(DEFAULT_STATE, 1).depth).toBe(1);
    expect(deeper(DEFAULT_STATE, 32).depth).toBe(32);
    expect(nextStage("full")).toBe("arrows");
    expect(nextStage("classes")).toBe("full");
  });
});
