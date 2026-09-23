// 06: the Policy's violations, drawn red through 05's pin hook. A bundle is
// red when any edge inside it breaks a rule (decisions.md, Levels rule: "a
// bundled edge is red if any pair inside it is"); internal/export marks the
// edges, so the UI evaluates no rule itself.
import type { View } from "./data";
import { NO_PINS, type Pin } from "./declutter";

export const violating: Pin = (b) => b.members.some((e) => e.violation !== undefined);

// pinFor is the pin a page passes to scene: none without a Policy.
export const pinFor = (view: View): Pin => (view.policy ? violating : NO_PINS);
