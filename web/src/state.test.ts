import { describe, expect, it } from "vitest";
import {
  decodeHash, deeper, DEFAULT_STATE, drill, encodeHash, nextStage, select, shallower, storeHash, toggle, up,
  type ViewState,
} from "./state";

const known = {
  box: (id: string) => ["", "m/a", "m/b", "m/a#pkg"].includes(id),
  folder: (id: string) => ["m/a", "m/b"].includes(id),
  node: (id: string) => id.startsWith("m/"),
};

describe("URL hash", () => {
  it("the default state is an empty hash", () => {
    expect(encodeHash(DEFAULT_STATE)).toBe("");
    expect(decodeHash("", known)).toEqual(DEFAULT_STATE);
  });
  it("round-trips every field, with toggles sorted", () => {
    const s: ViewState = { focus: "m/a#pkg", depth: 3, toggled: ["m/b", "m/a"], selected: "m/a.T",
      hops: 2, stage: "triangles", edges: "off", minPairs: 4, externals: false, proposal: null };
    const h = encodeHash(s);
    expect(h).toBe("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0");
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
      edges: "off", minPairs: 4, externals: false, proposal: null,
    });
    // Each writes back unchanged.
    for (const h of ["#d=3&l=0", "#f=m%2Fa&d=6&l=0", "#d=2&l=0"]) expect(encodeHash(decodeHash(h, known))).toBe(h);
  });
  it("drops unknown ids, childless toggles and bad numbers instead of failing", () => {
    expect(decodeHash("#f=evil&d=0&d=abc&t=nope&t=m%2Fa%23pkg&s=%3Cb%3E&h=-1&x=none&w=99999", known))
      .toEqual(DEFAULT_STATE);
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
  it("clearing the selection clears hops; depth steps stay within 1..32; the cycle wraps to full", () => {
    expect(select({ ...DEFAULT_STATE, selected: "x", hops: 2 }, null)).toMatchObject({ selected: null, hops: null });
    expect(shallower(DEFAULT_STATE, 1).depth).toBe(1);
    expect(deeper(DEFAULT_STATE, 32).depth).toBe(32);
    expect(nextStage("full")).toBe("arrows");
    expect(nextStage("classes")).toBe("full");
  });
});
