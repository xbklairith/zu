// U8 keyboard map. Esc peels one layer: search, then selection, then focus.
export type Action =
  | "search" | "closeSearch" | "clearSelection" | "up" | "declutter" | "fit" | "deeper" | "shallower";

// mod: Meta, Ctrl or Alt is held, so the key belongs to the browser (⌘− zooms, ⌘D bookmarks).
export type KeyContext = { searchOpen: boolean; selected: boolean; atRoot: boolean; typing: boolean; mod: boolean };

export function keyAction(key: string, ctx: KeyContext): Action | null {
  if (ctx.mod) return null;
  if (key === "Escape") {
    if (ctx.searchOpen) return "closeSearch";
    if (ctx.selected) return "clearSelection";
    return ctx.atRoot ? null : "up";
  }
  if (ctx.typing) return null;
  switch (key) {
    case "/": return "search";
    case "d": return "declutter";
    case "f": return "fit";
    case "+": case "=": return "deeper";
    case "-": return "shallower";
  }
  return null;
}
