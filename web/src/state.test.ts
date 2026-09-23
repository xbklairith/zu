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
      hops: 2, stage: "triangles", lines: false, minPairs: 4, externals: false };
    const h = encodeHash(s);
    expect(h).toBe("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0");
    expect(decodeHash(h, known)).toEqual({ ...s, toggled: ["m/a", "m/b"] });
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
