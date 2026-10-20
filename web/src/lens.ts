// 17: the two lenses, the tree and the Screen, and the way between them (the
// s key). The tree's fields of the hash stay as the reader left them while
// the Screen is drawn.
import type { View } from "./data";
import { index, packageOf } from "./cut";
import { centreOf, screenView } from "./screen";
import { reveal } from "./search";
import { centreAt, type ViewState } from "./state";

// enter draws the Screen of the selection's Centre: a method's type, a
// package's own box's package. A selection that names none leaves s as it is.
export function enter(view: View, s: ViewState): ViewState {
  const c = centreOf(view, s.selected);
  return c === null ? s : centreAt(s, c);
}

// leave draws the tree again: as the reader left it while the Centre is
// still the selection's, else drawn at the Centre with it selected, as a
// search pick is (reveal). 18: a near Centre is not in the tree; its package is.
export function leave(view: View, s: ViewState): ViewState {
  const tree = { ...s, centre: null, more: false };
  if (s.centre === null || centreOf(view, s.selected) === s.centre) return tree;
  return reveal(view, index(view).node.has(s.centre) ? s.centre : packageOf(screenView(view), s.centre)!, tree);
}

// drawnCentre is the Centre the page draws: s's while view has it. A newer
// View from zu serve's watch can lose it, and the page renders with that View
// before revalidate drops the Centre from s: it draws the tree meanwhile.
export const drawnCentre = (view: View, s: ViewState): string | null =>
  s.centre !== null && centreOf(view, s.centre) === s.centre ? s.centre : null;
