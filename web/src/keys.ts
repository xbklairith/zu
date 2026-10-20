// U8 keyboard map. Esc peels one layer: search, then (17) the Screen, then
// selection, then focus. n is kept for 18's walk through a change.
export type Action =
  | "search" | "closeSearch" | "clearSelection" | "up" | "declutter" | "fit" | "deeper" | "shallower" | "lens";

// mod: Meta, Ctrl or Alt is held, so the key belongs to the browser (⌘− zooms, ⌘D bookmarks).
// screen: the Screen is drawn (17), so the tree's own keys do nothing.
export type KeyContext = { searchOpen: boolean; selected: boolean; atRoot: boolean; typing: boolean; mod: boolean; screen: boolean };

export function keyAction(key: string, ctx: KeyContext): Action | null {
  if (ctx.mod) return null;
  if (key === "Escape") {
    if (ctx.searchOpen) return "closeSearch";
    if (ctx.screen) return "lens";
    if (ctx.selected) return "clearSelection";
    return ctx.atRoot ? null : "up";
  }
  if (ctx.typing) return null;
  switch (key) {
    case "/": return "search";
    case "f": return "fit";
    case "s": return "lens";
  }
  if (ctx.screen) return null;
  switch (key) {
    case "d": return "declutter";
    case "+": case "=": return "deeper";
    case "-": return "shallower";
  }
  return null;
}
