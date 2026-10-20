import { describe, expect, it } from "vitest";
import { keyAction } from "./keys";

const ctx = { searchOpen: false, selected: false, atRoot: false, typing: false, mod: false, screen: false, change: false };

describe("keys", () => {
  it("Esc closes search, then clears the selection, then goes up, then does nothing", () => {
    expect(keyAction("Escape", { ...ctx, searchOpen: true, selected: true })).toBe("closeSearch");
    expect(keyAction("Escape", { ...ctx, selected: true })).toBe("clearSelection");
    expect(keyAction("Escape", ctx)).toBe("up");
    expect(keyAction("Escape", { ...ctx, atRoot: true })).toBeNull();
  });
  it("s enters and leaves the Screen; Esc on it leaves it after closing search (17)", () => {
    expect(keyAction("s", ctx)).toBe("lens");
    expect(keyAction("s", { ...ctx, screen: true })).toBe("lens");
    expect(keyAction("s", { ...ctx, typing: true })).toBeNull();
    expect(keyAction("Escape", { ...ctx, screen: true, searchOpen: true })).toBe("closeSearch");
    expect(keyAction("Escape", { ...ctx, screen: true, selected: true, atRoot: true })).toBe("lens");
  });
  it("the tree's keys do nothing on the Screen, but / and f do (17)", () => {
    for (const k of ["d", "+", "=", "-"]) expect(keyAction(k, { ...ctx, screen: true }), k).toBeNull();
    expect(keyAction("/", { ...ctx, screen: true })).toBe("search");
    expect(keyAction("f", { ...ctx, screen: true })).toBe("fit");
  });
  it("n and p walk a Change View, from the tree or the Screen (18)", () => {
    for (const screen of [false, true]) {
      expect(keyAction("n", { ...ctx, change: true, screen })).toBe("next");
      expect(keyAction("p", { ...ctx, change: true, screen })).toBe("previous");
    }
    expect(keyAction("n", ctx)).toBeNull(); // a Project View has no walk
    expect(keyAction("p", ctx)).toBeNull();
    expect(keyAction("n", { ...ctx, change: true, typing: true })).toBeNull();
    expect(keyAction("n", { ...ctx, change: true, mod: true })).toBeNull();
  });
  it("letters do nothing while typing in the search box", () => {
    expect(keyAction("/", ctx)).toBe("search");
    expect(keyAction("d", { ...ctx, typing: true })).toBeNull();
  });
  it("keys with Meta, Ctrl or Alt belong to the browser", () => {
    for (const k of ["-", "=", "d", "f", "Escape"]) expect(keyAction(k, { ...ctx, mod: true }), k).toBeNull();
  });
});
