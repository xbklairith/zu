import { describe, expect, it } from "vitest";
import { keyAction } from "./keys";

const ctx = { searchOpen: false, selected: false, atRoot: false, typing: false, mod: false };

describe("keys", () => {
  it("Esc closes search, then clears the selection, then goes up, then does nothing", () => {
    expect(keyAction("Escape", { ...ctx, searchOpen: true, selected: true })).toBe("closeSearch");
    expect(keyAction("Escape", { ...ctx, selected: true })).toBe("clearSelection");
    expect(keyAction("Escape", ctx)).toBe("up");
    expect(keyAction("Escape", { ...ctx, atRoot: true })).toBeNull();
  });
  it("letters do nothing while typing in the search box", () => {
    expect(keyAction("/", ctx)).toBe("search");
    expect(keyAction("d", { ...ctx, typing: true })).toBeNull();
  });
  it("keys with Meta, Ctrl or Alt belong to the browser", () => {
    for (const k of ["-", "=", "d", "f", "Escape"]) expect(keyAction(k, { ...ctx, mod: true }), k).toBeNull();
  });
});
