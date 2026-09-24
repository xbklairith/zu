// What the reader has done to a view; the URL hash stores it (decisions.md, UI v1).

// STAGES is uml-viewer's declutter cycle (hierarchy.clj `declutter-modes`);
// declutter.ts defines each stage. LABELS are its button labels (draw.clj).
export const STAGES = ["full", "arrows", "triangles", "elements", "classes"] as const;
export type Stage = (typeof STAGES)[number];
export const LABELS: Record<Stage, string> = {
  full: "Declutter none",
  arrows: "Declutter arrows",
  triangles: "Remove arrows",
  elements: "Declutter elements",
  classes: "Declutter classes",
};

// EDGE_MODES (11): auto draws lines when there are few and on demand when
// there are many (edges.ts); on draws every line; off draws 05's triangles.
export const EDGE_MODES = ["auto", "on", "off"] as const;
export type EdgeMode = (typeof EDGE_MODES)[number];

export type ViewState = {
  focus: string; // box id, "X#pkg", or "" for the page root
  depth: number | null; // null = autoDepth
  toggled: string[]; // boxes flipped from their depth default (U2), sorted
  selected: string | null; // any node id, or a drawn box or aggregate
  hops: number | null; // show only nodes within N hops of the selection
  stage: Stage; // declutter stage (U6)
  edges: EdgeMode; // 11: "off" = 05's "Hide edges": triangles instead of lines, at any stage
  minPairs: number; // hide bundles with fewer package pairs (A6)
  externals: boolean; // draw external modules
  proposal: string | null; // 07: the Proposal drawn instead of the Package Tree, by name
};

export const DEFAULT_STATE: ViewState = {
  focus: "", depth: null, toggled: [], selected: null, hops: null,
  stage: "full", edges: "auto", minPairs: 1, externals: true, proposal: null,
};

export const LIMITS = { depth: 32, hops: 9, minPairs: 999 };

// encodeHash writes only what differs from the default, in a fixed key order,
// so the same state always gives the same URL.
export function encodeHash(s: ViewState): string {
  const p = new URLSearchParams();
  if (s.focus) p.set("f", s.focus);
  if (s.depth !== null) p.set("d", String(s.depth));
  for (const t of [...s.toggled].sort()) p.append("t", t);
  if (s.selected) p.set("s", s.selected);
  if (s.hops !== null) p.set("h", String(s.hops));
  if (s.stage !== "full") p.set("x", s.stage);
  if (s.edges !== "auto") p.set("l", s.edges === "off" ? "0" : "1");
  if (s.minPairs !== 1) p.set("w", String(s.minPairs));
  if (!s.externals) p.set("e", "0");
  if (s.proposal !== null) p.set("p", s.proposal);
  const q = p.toString();
  return q ? "#" + q : "";
}

// Known says which ids a hash may name: a focus, a toggle (a box with child
// boxes), a selection and (07) a Proposal.
export type Known = {
  box(id: string): boolean; folder(id: string): boolean; node(id: string): boolean; proposal?(name: string): boolean;
};

// decodeHash reads a hash from anywhere (a shared link is untrusted input):
// unknown ids and out-of-range numbers fall back to the default, never throw.
export function decodeHash(hash: string, known: Known): ViewState {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const int = (key: string, max: number): number | null => {
    const v = p.get(key);
    if (v === null || !/^[1-9]\d{0,2}$/.test(v)) return null;
    const n = Number(v);
    return n <= max ? n : null;
  };
  const focus = p.get("f") ?? "";
  const selected = p.get("s");
  const stage = p.get("x");
  const proposal = p.get("p");
  return {
    focus: known.box(focus) ? focus : "",
    depth: int("d", LIMITS.depth),
    toggled: [...new Set(p.getAll("t").filter((t) => known.folder(t)))].sort(),
    selected: selected !== null && known.node(selected) ? selected : null,
    hops: int("h", LIMITS.hops),
    stage: (STAGES as readonly string[]).includes(stage ?? "") ? (stage as Stage) : "full",
    edges: p.get("l") === "0" ? "off" : p.get("l") === "1" ? "on" : "auto",
    minPairs: int("w", LIMITS.minPairs) ?? 1,
    externals: p.get("e") !== "0",
    proposal: proposal !== null && known.proposal?.(proposal) ? proposal : null,
  };
}

// The address bar: the parts of location and history the hash needs.
export type Address = { pathname: string; search: string; hash: string };
export type Replacer = { replaceState(data: null, unused: string, url: string): void };

// storeHash writes s into the address bar without adding a history entry
// (Deviation 5). It skips a write that changes nothing, and returns false when
// the browser refuses replaceState (some do on file://): the view still works.
export function storeHash(page: Address, history: Replacer, s: ViewState): boolean {
  const hash = encodeHash(s);
  if (hash === (page.hash === "#" ? "" : page.hash)) return true;
  try {
    history.replaceState(null, "", page.pathname + page.search + hash);
    return true;
  } catch {
    return false;
  }
}

// Transitions. Each returns a new state; the page only calls these.
export const nextStage = (s: Stage): Stage => STAGES[(STAGES.indexOf(s) + 1) % STAGES.length];

export const drill = (s: ViewState, box: string): ViewState =>
  ({ ...s, focus: box, depth: null, toggled: [], selected: null, hops: null });

// propose draws a Proposal (or, with null, the Package Tree again) from the
// page root: the focus and selection name boxes of the other tree.
export const propose = (s: ViewState, name: string | null): ViewState => ({ ...drill(s, ""), proposal: name });

// up goes to the parent box and selects the box the reader came from.
export const up = (s: ViewState, parent: string): ViewState => ({ ...drill(s, parent), selected: s.focus || null });

// toggle flips a box in place; the page offers it only on boxes with children.
export const toggle = (s: ViewState, box: string): ViewState => ({
  ...s,
  toggled: s.toggled.includes(box) ? s.toggled.filter((t) => t !== box) : [...s.toggled, box].sort(),
});

export const select = (s: ViewState, id: string | null): ViewState =>
  ({ ...s, selected: id, hops: id === null ? null : s.hops });

// deeper and shallower start from the depth actually drawn (auto or chosen).
export const deeper = (s: ViewState, drawn: number): ViewState =>
  ({ ...s, depth: Math.min(LIMITS.depth, drawn + 1), toggled: [] });
export const shallower = (s: ViewState, drawn: number): ViewState =>
  ({ ...s, depth: Math.max(1, drawn - 1), toggled: [] });
