# 05 · Interaction — Plan

**Status:** approved 2026-09-24 (scrutinized, fixed, advisor sign-off). Builds on 04 as landed at de78b66.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).
> **Builds on:** 04 Parts A and B as landed (HEAD de78b66): `web/src/data.ts`, `tree.ts`, `layout.ts`, `change.ts`, `facts.ts`, `headline.ts`, `App.tsx`, `Canvas.tsx`, `Header.tsx`, `Panel.tsx`, and the goldens `internal/export/testdata/shop.view.golden.json` and `shop.change.golden.json`. Nothing is blocked.

**Goal:** Turn 04's read-only views into ones a reader can work with, in the same self-contained HTML file:
- select a node to light its neighbours (U4);
- expand and collapse boxes in place (U2, reduced);
- choose the collapse depth (A6);
- focus on N hops around the selection;
- hide weak edges and externals, and step through uml-viewer's declutter cycle (U6);
- search and jump (U8, A9);
- follow edges from the side panel (U5, full);
- keep all of this in the URL hash, so a link reopens the same view.

ELK moves into a Web Worker. The Change View (04 Part B) keeps everything it draws today and gains the same controls.

**Architecture:**
- **One pure function decides what is drawn:** `scene(view, state, { pin })` in `web/src/scene.ts`. It composes small pure modules:
  - `cut.ts`: which Package Tree boxes are leaves and which are containers, with in-place toggles;
  - `bundle.ts`: edges mapped to drawn nodes, with their members and Change Status;
  - `select.ts`: neighbours and hops;
  - `declutter.ts`: the U6 stages;
  - `state.ts`: `ViewState`, its transitions and the URL hash codec.
- **One tree algorithm:** 04's `tree.ts` and `facts.ts` become thin layers over `cut.ts` and `bundle.ts`. Two snapshot tests, written by 04's own code before it is replaced, prove the new code draws exactly what 04 drew, Change View included.
- **Layout:**
  - `layout.ts` turns a scene into an ELK graph, with 04's sizes and options.
  - `engine.ts` runs ELK in an inline `blob:` Web Worker (`elkjs/lib/elk-api.js` on the page, `elk-worker.min.js?worker&inline` in the worker).
  - `superseding()` terminates the worker when a newer layout starts, so a long layout never delays the next one.
- **React stays thin:** components hold no logic. They call `scene()` and the state transitions, and write the hash with `history.replaceState`.

**Tech Stack:** as 04 (React 19, `@xyflow/react` 12, `elkjs` 0.12, Vite 8 + `vite-plugin-singlefile`, `vitest` 5 in the node environment, pure modules only). No new dependencies.

**Source decisions:**
- `docx/core/decisions.md` "UI v1" and "Stack" (ELK in a Worker);
- requirements U2, U4, U5, U6, U8, A6, A9, and the performance budgets;
- ADR 0006 (self-contained, loads nothing) and ADR 0008 (Package Tree, drill in / Esc);
- 04 plan Deviations 1, 2, 5 and 7; 04 Part B's Q4 (changed subgraph, changed declarations in place).

**Out of Scope:**
- **U7 SVG/PNG export** (see Deviation 3).
- **Stdlib toggle** (see Deviation 2).
- Policy, Levels and violations (06). This feature leaves only the `pin` hook that keeps violation edges red through declutter.
- CRAP overlay (07). `serve` and watch mode (U1's "preserved across re-renders in watch mode" waits for watch mode).
- Expanding a box without a full re-layout (U2 full). The settled answer allows a full re-layout.
- 04's `facts.imports` prefix bug: fixed on main in a2fc2a2 (`tree.packagesIn`), which Task 2 keeps.

---

## Deviations from settled answers (found while planning — approved 2026-09-24 with the plan)

1. **The declutter stages are uml-viewer's (U6).** decisions.md settles "uml-viewer's declutter cycle" and names it "bundled → triangles → hide members → hide boxes → none". uml-viewer's own code defines it (unclebob/uml-viewer at 79cc1ef, read 2026-09-23):
   - `src/uml_viewer/domain/hierarchy.clj:263`: `declutter-modes [:full :arrows :triangles :elements :classes]`; `next-declutter` wraps from `:classes` back to `:full`.
   - `apply-declutter` (l.394): `:arrows`, `:triangles`, `:elements` and `:classes` all apply `collapse-arrows` (l.333); only `:triangles` sets `:hide-edges`; `:elements` adds `hide-elements` (l.355); `:classes` adds `hide-classes` (l.368).
   - `adapters/draw.clj:357` labels the button by the current stage: "Declutter none" (`:full`), "Declutter arrows", "Remove arrows" (`:triangles`), "Declutter elements", "Declutter classes".
   - `engine/hit.clj` `dep-indicators`: 12-unit triangles, incoming above the box, outgoing below; README l.152–156 and l.326–332: a triangle is red when any pair it stands for violates.

   So decisions.md's "none" is the wrap-around to no declutter, not "no edges". 05 maps each stage onto the Package Tree:

   | stage (hash `x`) | button | edges | method rows | leaves |
   |---|---|---|---|---|
   | `full` (default) | Declutter none | one line per leaf bundle | shown | all |
   | `arrows` | Declutter arrows | each leaf end lifted to its container, merged per direction, self-loops dropped | shown | all |
   | `triangles` | Remove arrows | the arrows as triangles on the boxes, no lines | shown | all |
   | `elements` | Declutter elements | the arrows as lines | hidden | all |
   | `classes` | Declutter classes | the arrows as lines | hidden | folded into their container, which becomes a box |

   - Lifting and folding happen only when more than one container holds leaves, as `collapse-arrows` does only with more than one package; with a single wrapping container, `classes` only hides rows.
   - uml-viewer's README says `elements` and `classes` also hide edges; its code draws lines again at both. 05 follows the code.
   - **Violations stay red** (06's `pin`): a merged arrow is red when any bundle it carries is, as a line or as a red triangle.
   - **"Hide edges" is a separate flag** (hash `l=0`, toolbar checkbox): triangles instead of lines at any stage, and no edges laid out. The selection's own edges are still drawn over the marks.
   - The `d` key steps to the next stage.
2. **No stdlib toggle.** decisions.md "UI v1" lists stdlib/external toggles, but the IR has no stdlib edges: `internal/scan/build.go` `imports()` (l.148–156) emits edges only for internal and external classes. A toggle would have nothing to show, and adding stdlib edges changes the IR schema (feature 01's golden). The externals toggle ships. Update the "UI v1" line when approving.
3. **U7 (SVG/PNG export) is out of 05.** It is a Should.
   - The shareable unit is already the HTML file (ADR 0006), and 03 writes Mermaid for text contexts.
   - A raster export of React Flow needs `html-to-image`, which draws through `foreignObject`. Under the page's `img-src data:` CSP that path is fragile across browsers.
   - It would add a dependency and a download path to a page whose promise is "loads nothing".

   It can return as its own small feature after 07.
4. **The CSP gains `worker-src blob:`.** Verified 2026-09-24 with Playwright against a single-file build from `file://` in Chromium (Chrome), Firefox and WebKit:
   - With `worker-src blob:`, ELK lays out in the inline worker in all three.
   - Without it, each browser refuses the worker (a CSP error) and `elk.layout()` never settles by itself. The Worker fires an `error` event, so `engine.ts` turns that into a rejected layout and the page shows "Layout failed: layout worker failed: blocked" instead of waiting forever.
   - There is **no main-thread fallback**. It would put a second 1.5 MB copy of ELK into every file (the kubernetes export is 8.1 MB against a 10 MB limit).
   - Safari itself is checked by hand in Task 13; Chromium, Firefox and WebKit by the committed harness `web/e2e/accept.mjs`.
5. **The hash is written with `history.replaceState`.** Changing the view adds no history entries, so the browser's Back leaves the page rather than stepping back through the view. Esc and the breadcrumb go up. `hashchange` (a pasted or edited link) is applied. A hash is untrusted input: unknown ids and out-of-range numbers fall back to the defaults, and ids are only ever looked up, never rendered as markup. If `replaceState` throws, the view still changes and the hash stays as it was.
6. **Focusing a container package's own declarations: `X#pkg`.** 04's code treats focus `X#pkg` as X's declarations, and 05 keeps that. Esc returns to `X`. In a URL hash, `X#pkg` is accepted only for a package that has child boxes.
7. **Search jumps to the package's parent at depth 1.** Revealing a package sets the focus to its parent box, at depth 1, and selects it. The package is then a plain leaf among its siblings, whatever the auto depth would have opened. Revealing a declaration focuses its package (`X#pkg` when X is a container) and selects it; a method stays selected and is drawn as its type's highlighted row. Revealing an external that falls in the aggregated "N external modules" oval selects that oval. The target is centred with 04 Part B's `setCenter` from the layout.
8. **Large views collapse depth automatically and say so (settled 2026-09-24).** This follows the requirements' performance budgets: "Above those sizes the tool should degrade by collapsing depth automatically and saying so, not by hanging." What 05 adds is the limit, set from ELK's cost, which follows the edges it routes more than the boxes. The auto depth (04, ≤ 60 leaves) already keeps the opening view small. Measured on the real kubernetes v1.37.0 graph with elk.bundled in node (2026-09-24):

   | scene | boxes | edges | ELK |
   |---|---|---|---|
   | page root, auto depth (04's opening view) | 39 | 175 | 0.5 s |
   | `k8s.io/kubernetes/pkg`, depth 1 | 33 | 184 | 0.6 s |
   | `k8s.io/kubernetes`, depth 2 | 90 | 379 | 1.8 s |
   | `k8s.io/kubernetes/pkg/controller`, depth 3 | 221 | 505 | 2.5 s |
   | `k8s.io/kubernetes/pkg`, depth 2 | 283 | 1,712 | did not finish in 240 s |
   | same, edges hidden | 283 | 0 | 0.06 s |
   | page root, depth 4, edges hidden | 1,812 | 0 | 0.4 s |

   The limit is **2,000 nodes or 500 laid-out edges** (`DRAW_LIMIT`; hidden edges are not laid out).
   - When the requested view is over it, the page draws the deepest depth under that view that fits (`fitDepth`), and a notice on the canvas says so: "Collapsed to depth N: depth M has E edges" ("B boxes" when boxes are what overflow). The notice has two buttons: *Draw depth M anyway*, for this graph only, and *Hide edges*, which sets the hide-edges flag.
   - The hash keeps the requested depth, so a shared link asks for the same view and collapses the same way. The header says "depth N (collapsed from M)", never "(chosen)", while the drawn depth differs from the requested one. `+` on a collapsed view requests drawn + 1 (and collapses again if that is still too big); the *Draw anyway* buttons draw the requested depth.
   - Only when even depth 1 is over the limit does the canvas show a card instead of starting a layout: "Even depth 1 is too big to lay out quickly. Draw N boxes and M edges at depth D? Layout may take minutes." Its buttons are *Hide edges*, *Go back one level* (up to the parent, when there is one) and *Draw anyway*, for this graph only. No measured kubernetes view at depth 1 is over the limit (`pkg`, 184 edges), so the card is proven by the unit test, not the corpus.

   No browser dialogs, per the page's own rules. The worker keeps the page responsive while a long layout runs, and a newer layout terminates it. React Flow's `onlyRenderVisibleElements` is on.

---

## The ViewState contract (UI ↔ URL)

`web/src/state.ts`. The hash holds only non-default fields, always in this key order, so one state gives one URL:

| key | field | default | range |
|---|---|---|---|
| `f` | `focus` | `""` (page root) | a box id, or `X#pkg` for a package with child boxes |
| `d` | `depth` | auto (`autoDepth`) | 1–32 |
| `t` (repeated, sorted) | `toggled` | none | box ids with children |
| `s` | `selected` | none | a box, node, `outside` or `externals` |
| `h` | `hops` | off | 1–9 |
| `x` | `stage` | `full` | `full`, `arrows`, `triangles`, `elements`, `classes` |
| `l` | `lines` | on | `0` = edges hidden |
| `w` | `minPairs` | 1 | 1–999 |
| `e` | `externals` | on | `0` = hidden |

Example: `#f=example.com%2Fshop&d=2&s=example.com%2Fshop%2Finternal%2Fstore&x=triangles`.

The Change View's full-project toggle (U10) stays in memory, as in 04: a link to a Change View opens on the changed subgraph.

---

## Tasks

### Task 1: View state, transitions and the URL hash

**Files:**
- Create: `web/src/state.ts`, `web/src/state.test.ts`

**Rules:** the contract table above. `storeHash` skips a write when the hash is unchanged, keeps path and query, and returns `false` when `replaceState` throws (a `file://` page in some browsers). `decodeHash` keeps a toggle only for a box with children (`folder`).

**Steps:**

- [x] **Write the failing test.**

**Create `web/src/state.test.ts`:**

````ts
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
````

- [x] **Run — expect FAIL:** `cd web && npx vitest run src/state.test.ts` → `Cannot find module './state'`.
- [x] **Implement.**

**Create `web/src/state.ts`:**

````ts
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

export type ViewState = {
  focus: string; // box id, "X#pkg", or "" for the page root
  depth: number | null; // null = autoDepth
  toggled: string[]; // boxes flipped from their depth default (U2), sorted
  selected: string | null; // any node id, or a drawn box or aggregate
  hops: number | null; // show only nodes within N hops of the selection
  stage: Stage; // declutter stage (U6)
  lines: boolean; // false = "Hide edges": triangles instead of lines, at any stage
  minPairs: number; // hide bundles with fewer package pairs (A6)
  externals: boolean; // draw external modules
};

export const DEFAULT_STATE: ViewState = {
  focus: "", depth: null, toggled: [], selected: null, hops: null,
  stage: "full", lines: true, minPairs: 1, externals: true,
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
  if (!s.lines) p.set("l", "0");
  if (s.minPairs !== 1) p.set("w", String(s.minPairs));
  if (!s.externals) p.set("e", "0");
  const q = p.toString();
  return q ? "#" + q : "";
}

// Known says which ids a hash may name: a focus, a toggle (a box with child
// boxes) and a selection.
export type Known = { box(id: string): boolean; folder(id: string): boolean; node(id: string): boolean };

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
  return {
    focus: known.box(focus) ? focus : "",
    depth: int("d", LIMITS.depth),
    toggled: [...new Set(p.getAll("t").filter((t) => known.folder(t)))].sort(),
    selected: selected !== null && known.node(selected) ? selected : null,
    hops: int("h", LIMITS.hops),
    stage: (STAGES as readonly string[]).includes(stage ?? "") ? (stage as Stage) : "full",
    lines: p.get("l") !== "0",
    minPairs: int("w", LIMITS.minPairs) ?? 1,
    externals: p.get("e") !== "0",
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
````

- [x] **Run — expect PASS:** `cd web && npx vitest run src/state.test.ts && npx tsc --noEmit` → 7 passed.
- [x] **Commit:** `git add web/src/state.ts web/src/state.test.ts && git commit -m "Add the view state, its transitions and the URL hash codec"`

---

### Task 2: The cut: boxes drawn, with in-place toggles

**Files:**
- Create: `web/src/cut.ts`, `web/src/cut.test.ts`, `web/src/testkit.ts`

**Rules:** 04's Package Tree (ADR 0008, `tree.ts` today) plus:
- **`toggled` (U2, in place):** a box at level L below the focus is open when `L < depth`; a toggled box flips that.
- **Declaration focus:** focus `X#pkg` (Deviation 6), or a package with no child boxes, shows the package's types and functions (`declsOf`). `noDetail` is set when the file has no declarations for it.
- **`leafOf`:** the leaf that draws a package: itself, its container's `#pkg` leaf, its nearest leaf ancestor, or `outside`.
- **`packagesIn`:** 04's a2c95fac fix (module roots, not string prefixes), shared by `facts.imports` and `boxStats`.

**Steps:**

- [ ] **Add the test builders** (only `*.test.ts` import `testkit.ts`, so the build drops it).

**Create `web/src/testkit.ts`:**

````ts
// Builders for synthetic Views in unit tests (not bundled: only *.test.ts import it).
import type { View, ViewEdge, ViewNode } from "./data";

const loc = { path: "x.go", line: 1 };

export const pkgs = (ids: string[], module: string, extra: Partial<ViewNode> = {}): ViewNode[] =>
  ids.map((id) => ({ id, kind: "package", module, loc, ...extra }));

export const exts = (ids: string[]): ViewNode[] => ids.map((id) => ({ id, kind: "external", loc }));

export const decl = (id: string, parent: string, kind: "type" | "function" = "type"): ViewNode =>
  ({ id, kind, parent, loc });

export const edge = (from: string, to: string, kind: ViewEdge["kind"] = "imports"): ViewEdge =>
  ({ from, to, kind, count: 1, loc });

export const view = (nodes: ViewNode[], edges: ViewEdge[] = []): View => ({
  schema: "1", kind: "project", tool: "", head: { commit: "", dirty: false },
  modules: [...new Set(nodes.map((n) => n.module ?? "").filter(Boolean))].sort(),
  nodes, edges, sources: {},
  honesty: { parseErrors: [], unresolvedCalls: 0, unresolvedImports: 0, unsupported: {} },
});
````

- [ ] **Write the failing test.**

**Create `web/src/cut.test.ts`:**

````ts
import { describe, expect, it } from "vitest";
import { autoDepth, cut, leafOf, packageOf, packagesIn, parentBox } from "./cut";
import { decl, pkgs, view } from "./testkit";

const shop = view([
  ...pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b/c"], "ex/shop"),
  ...pkgs(["ex/shop/tools/gen"], "ex/shop/tools"),
]);

describe("cut", () => {
  it("opens boxes above the depth and records each leaf's container", () => {
    const c = cut(shop, "", 2);
    expect(c.containers).toEqual(["ex/shop", "ex/shop/tools"]);
    expect(c.leaves).toEqual(["ex/shop#pkg", "ex/shop/internal", "ex/shop/tools/gen"]);
    expect(c.parent.get("ex/shop/internal")).toBe("ex/shop");
    expect(c.parent.get("ex/shop")).toBe("");
  });
  it("a toggled box flips in place, others keep the depth (U2)", () => {
    expect(cut(shop, "", 2, ["ex/shop/internal"]).leaves)
      .toEqual(["ex/shop#pkg", "ex/shop/internal/a", "ex/shop/internal/b", "ex/shop/tools/gen"]);
    expect(cut(shop, "", 2, ["ex/shop"]).leaves).toEqual(["ex/shop", "ex/shop/tools/gen"]);
  });
  it("toggling a box without children changes nothing", () => {
    expect(cut(shop, "", 2, ["ex/shop/internal/a"]).leaves).toEqual(cut(shop, "", 2).leaves);
  });
  it("a package focus shows its declarations; X#pkg does the same for a container package", () => {
    const v = view([...pkgs(["m/p"], "m", { detail: true }), ...pkgs(["m/p/q"], "m"),
      decl("m/p.T", "m/p"), decl("m/p.T.M", "m/p.T", "function"), decl("m/p.F", "m/p", "function")]);
    const c = cut(v, "m/p#pkg", 1);
    expect(c.decls).toBe(true);
    expect(c.leaves).toEqual(["m/p.F", "m/p.T"]);
    expect(cut(v, "m/p/q", 1)).toMatchObject({ decls: true, leaves: [], noDetail: true });
    expect(parentBox(v, "m/p#pkg")).toBe("m/p");
    expect(packageOf(v, "m/p.T.M")).toBe("m/p");
  });
  it("maps packages to leaves, their own #pkg leaf, or outside", () => {
    const c = cut(shop, "ex/shop", 1);
    const to = leafOf(shop, c);
    expect(to("ex/shop/internal/b/c")).toBe("ex/shop/internal");
    expect(to("ex/shop")).toBe("ex/shop#pkg");
    expect(to("ex/shop/tools/gen")).toBe("outside");
  });
  it("a box holds the packages under it, but not a nested module root", () => {
    expect(packagesIn(shop, "ex/shop").map((p) => p.id)).toEqual(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b/c"]);
    expect(packagesIn(shop, "ex/shop#pkg").map((p) => p.id)).toEqual(["ex/shop"]);
  });
  it("auto depth is 1 for a declaration focus", () => {
    expect(autoDepth(view([...pkgs(["m/p"], "m", { detail: true }), decl("m/p.T", "m/p")]), "m/p")).toBe(1);
  });
});
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/cut.test.ts` → `Cannot find module './cut'`.
- [ ] **Implement.**

**Create `web/src/cut.ts`:**

````ts
// The Package Tree as boxes (ADR 0008) and the cut of it one view draws.
import type { View, ViewNode } from "./data";

export const PKG = "#pkg"; // suffix of the leaf that stands for a container's own package
export const OUTSIDE = "outside"; // the aggregate for every package outside the focus
export const BOX_BUDGET = 60;

type Index = {
  node: Map<string, ViewNode>;
  children: Map<string, string[]>; // box → child boxes, sorted; "" → module roots
  parent: Map<string, string>; // box → parent box; module roots → ""
  pkg: Set<string>; // boxes that are also packages
  pkgs: ViewNode[]; // package nodes, sorted by id
};

const indexes = new WeakMap<View, Index>();

// index builds the box tree from package ids and their module (a nested
// module is a root of its own), once per View.
export function index(view: View): Index {
  const hit = indexes.get(view);
  if (hit) return hit;
  const node = new Map(view.nodes.map((n) => [n.id, n]));
  const kids = new Map<string, Set<string>>();
  const parent = new Map<string, string>();
  const pkg = new Set<string>();
  const link = (box: string, up: string) => {
    parent.set(box, up);
    if (!kids.has(up)) kids.set(up, new Set());
    kids.get(up)!.add(box);
  };
  const pkgs = view.nodes.filter((n) => n.kind === "package").sort((a, b) => cmp(a.id, b.id));
  for (const n of pkgs) {
    const m = n.module ?? n.id;
    pkg.add(n.id);
    link(m, "");
    const segs = n.id === m ? [] : n.id.slice(m.length + 1).split("/");
    let box = m;
    for (const s of segs) {
      link(box + "/" + s, box);
      box += "/" + s;
    }
  }
  const children = new Map([...kids].map(([k, v]) => [k, [...v].sort(cmp)]));
  const ix = { node, children, parent, pkg, pkgs };
  indexes.set(view, ix);
  return ix;
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// isBox: a Package Tree box, or "X#pkg" for a package X that also has child boxes.
export function isBox(view: View, id: string): boolean {
  const ix = index(view);
  if (!id.endsWith(PKG)) return ix.parent.has(id);
  const pkg = id.slice(0, -PKG.length);
  return ix.pkg.has(pkg) && childrenOf(view, pkg).length > 0;
}

export function childrenOf(view: View, box: string): string[] {
  return index(view).children.get(box) ?? [];
}

// parentBox is where Esc goes: "X#pkg" → X, a module root → "", "" → "".
export function parentBox(view: View, box: string): string {
  if (box.endsWith(PKG)) return box.slice(0, -PKG.length);
  return index(view).parent.get(box) ?? "";
}

// within: box is inside (or is) outer, following parent boxes, so a nested
// module root is never inside its parent module's box.
export function within(view: View, box: string, outer: string): boolean {
  if (outer === "") return true;
  for (let b = box; b !== ""; b = index(view).parent.get(b) ?? "") if (b === outer) return true;
  return false;
}

// packagesIn are the packages a box holds; "X#pkg" holds only X.
export function packagesIn(view: View, box: string): ViewNode[] {
  const own = box.endsWith(PKG) ? box.slice(0, -PKG.length) : null;
  return index(view).pkgs.filter((p) => (own !== null ? p.id === own : within(view, p.id, box)));
}

// packageOf is the package a declaration belongs to (a method's parent is its type).
export function packageOf(view: View, id: string): string | undefined {
  const { node } = index(view);
  let n = node.get(id);
  while (n && n.kind !== "package") n = n.parent ? node.get(n.parent) : undefined;
  return n?.id;
}

export type Cut = {
  focus: string;
  leaves: string[]; // sorted
  containers: string[]; // sorted
  parent: Map<string, string>; // leaf or container → enclosing container, "" at the top
  decls: boolean; // the leaves are the declarations of one package
  noDetail: boolean; // that package's declarations are not in the file
};

// declsOf are a package's types and functions, sorted; methods are rows of their type.
export function declsOf(view: View, pkg: string): string[] {
  return view.nodes.filter((n) => n.parent === pkg && (n.kind === "type" || n.kind === "function")).map((n) => n.id).sort(cmp);
}

// declFocus returns the package whose declarations a focus shows, or undefined.
function declFocus(view: View, focus: string): string | undefined {
  const ix = index(view);
  if (focus.endsWith(PKG)) return focus.slice(0, -PKG.length);
  return ix.pkg.has(focus) && childrenOf(view, focus).length === 0 ? focus : undefined;
}

// cut returns the boxes drawn under focus: a box at level L below the focus is
// open when L < depth, and a box in toggled flips that (U2, in place). An open
// box that is also a package holds a "<box>#pkg" leaf for its own package.
export function cut(view: View, focus: string, depth: number, toggled: readonly string[] = []): Cut {
  const leaves: string[] = [];
  const containers: string[] = [];
  const parent = new Map<string, string>();
  const ix = index(view);
  const pkgOnly = declFocus(view, focus);
  if (pkgOnly !== undefined) {
    const ds = declsOf(view, pkgOnly);
    for (const d of ds) parent.set(d, "");
    return {
      focus, leaves: ds, containers, parent, decls: true,
      noDetail: !ix.node.get(pkgOnly)?.detail,
    };
  }
  const flip = new Set(toggled);
  const visit = (box: string, level: number, up: string) => {
    const kids = childrenOf(view, box);
    parent.set(box, up);
    if (kids.length === 0 || (level < depth) === flip.has(box)) {
      leaves.push(box);
      return;
    }
    containers.push(box);
    if (ix.pkg.has(box)) {
      leaves.push(box + PKG);
      parent.set(box + PKG, box);
    }
    for (const k of kids) visit(k, level + 1, box);
  };
  if (focus !== "" && ix.pkg.has(focus)) {
    leaves.push(focus + PKG);
    parent.set(focus + PKG, "");
  }
  for (const k of childrenOf(view, focus)) visit(k, 1, "");
  return { focus, leaves: leaves.sort(cmp), containers: containers.sort(cmp), parent, decls: false, noDetail: false };
}

// leafOf maps a package to the leaf that draws it, or OUTSIDE when the cut
// does not contain it.
export function leafOf(view: View, c: Cut): (pkg: string) => string {
  const leaves = new Set(c.leaves);
  const open = new Set(c.containers);
  return (pkg) => {
    if (leaves.has(pkg)) return pkg;
    if (open.has(pkg) || pkg === c.focus) return leaves.has(pkg + PKG) ? pkg + PKG : OUTSIDE;
    for (let b = parentBox(view, pkg); b !== ""; b = parentBox(view, b)) {
      if (leaves.has(b)) return b;
      if (b === c.focus || open.has(b)) break;
    }
    return OUTSIDE;
  };
}

// autoDepth: start at 1 and go deeper while the next level has ≤ 60 leaves and
// more than this one (decision Q4, relative to the focus).
export function autoDepth(view: View, focus: string): number {
  let d = 1;
  for (;;) {
    const here = cut(view, focus, d).leaves.length;
    const next = cut(view, focus, d + 1).leaves.length;
    if (next > BOX_BUDGET || next <= here) return d;
    d++;
  }
}
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run src/cut.test.ts && npx tsc --noEmit` → 7 passed.
- [ ] **Commit:** `git add web/src/cut.ts web/src/cut.test.ts web/src/testkit.ts && git commit -m "Compute the drawn Package Tree cut with in-place toggles"`

---

### Task 3: Bundles over a cut; 04's tree.ts and facts.ts on top of them

**Files:**
- Create: `web/src/bundle.ts`, `web/src/bundle.test.ts`, `web/src/tree.snapshot.test.ts`, `web/src/__snapshots__/tree04.json` (written by 04's code)
- Modify: `web/src/tree.ts` (replaced), `web/src/facts.ts` (replaced), `web/src/facts.test.ts`, `web/src/Panel.tsx`

**Rules:**
- 04's mapping: packages to their leaf or `outside`; externals to themselves, or all to `externals` when more than 20 are touched. An edge is kept only when **one end is a drawn leaf**, so `outside→outside` and `outside→external` never show, and `externalsOf` counts only those edges (M1, addendum T3).
- New: `members` (the IR edges of a bundle, for the panel), `opts.externals = false`, and in a declaration cut `calls`/`embeds` with a method mapped to its type. Both ends must be declarations of the package.
- `status` (04 Part B, `tree.ts` `count`): the Change Status every member shares; `mixed` when changed members disagree or sit beside unchanged ones.
- **One tree algorithm, no dead code:** `tree.ts` keeps 04's names as thin calls into `cut.ts`/`bundle.ts`. `packageEnds` and 04's walkers go. `boxesOf` stays only as the two fields 04's `layout.ts` reads, until Task 7 replaces that file. `facts.targets` takes the drawn bundles and lists the member ends on the aggregate's side.
- **Proof of equivalence:** before `tree.ts` changes, a snapshot test records 04's whole tree API over both shop goldens (Project and Change View), every focus, depths 1–3. The rebuilt `tree.ts` must reproduce it byte for byte.

**Steps:**

- [ ] **Freeze 04's tree API** (this test runs against 04's own `tree.ts`).

**Create `web/src/tree.snapshot.test.ts`:**

````ts
// 04's Package Tree API over every focus of both shop goldens at depths 1–3.
// The snapshot was written by 04's own tree.ts before feature 05 moved it onto
// cut.ts and bundle.ts; the rebuilt tree must reproduce it exactly.
import { expect, it } from "vitest";
import project from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import { parseView, type View } from "./data";
import { boxStats, bundles, containers, leavesAt, touchedExternals } from "./tree";

// foci are the page root and every box a reader can drill into from it.
function foci(v: View): string[] {
  const decl = new Set(v.nodes.filter((n) => n.kind === "type" || n.kind === "function").map((n) => n.id));
  const out: string[] = [];
  const walk = (f: string) => {
    out.push(f);
    for (const l of leavesAt(v, f, 1)) if (!decl.has(l)) walk(l);
  };
  walk("");
  return out;
}

it("reproduces 04's tree on the shop goldens", async () => {
  const snap: Record<string, unknown> = {};
  for (const [name, g] of [["project", project], ["change", change]] as const) {
    const v = parseView(JSON.stringify(g));
    for (const f of foci(v)) {
      for (const d of [1, 2, 3]) {
        const leaves = leavesAt(v, f, d);
        snap[`${name} ${f || "(root)"} d=${d}`] = {
          leaves,
          containers: containers(v, f, d),
          bundles: bundles(v, f, d),
          touched: touchedExternals(v, f, d),
          stats: leaves.map((l) => [l, boxStats(v, l)]),
        };
      }
    }
  }
  await expect(JSON.stringify(snap, null, 1)).toMatchFileSnapshot("./__snapshots__/tree04.json");
});
````

**Run (writes the snapshot):** `cd web && npx vitest run -u src/tree.snapshot.test.ts`

- [ ] Review `web/src/__snapshots__/tree04.json` (about 41 KB: leaves, containers, bundles with status, touched externals and stats per focus) and commit it with this task.
- [ ] **Write the failing test.**

**Create `web/src/bundle.test.ts`:**

````ts
import { describe, expect, it } from "vitest";
import { cut } from "./cut";
import { bundlesOver, externalsOf } from "./bundle";
import { decl, edge, exts, pkgs, view } from "./testkit";

const short = (bs: ReturnType<typeof bundlesOver>) => bs.map((b) => [b.from, b.to, b.pairs, b.members.length]);

describe("bundlesOver", () => {
  it("keeps member edges and hides externals when asked", () => {
    const v = view([...pkgs(["m/a", "m/b"], "m"), ...exts(["x.io/e"])],
      [edge("m/a", "m/b"), edge("m/a", "x.io/e")]);
    const c = cut(v, "", 2);
    expect(short(bundlesOver(v, c))).toEqual([["m/a", "m/b", 1, 1], ["m/a", "x.io/e", 1, 1]]);
    expect(bundlesOver(v, c, { externals: false }).map((b) => b.to)).toEqual(["m/b"]);
  });
  it("never draws an edge with no end inside the focus (outside→external)", () => {
    const v = view([...pkgs(["m/a"], "m"), ...pkgs(["n/b"], "n"), ...exts(["x.io/e"])],
      [edge("n/b", "x.io/e"), edge("n/b", "m/a")]);
    const bs = bundlesOver(v, cut(v, "m", 1));
    expect(bs.map((b) => `${b.from}→${b.to}`)).toEqual(["outside→m/a"]);
    const top = bundlesOver(v, cut(v, "", 1));
    expect(top.map((b) => `${b.from}→${b.to}`)).toEqual(["n→m", "n→x.io/e"]);
    expect(externalsOf(v, bundlesOver(v, cut(v, "m", 1)))).toEqual([]);
  });
  it("counts distinct declaration pairs, not edges; a method goes to its type; nothing leaves the package", () => {
    const v = view([...pkgs(["m/p"], "m", { detail: true }), ...pkgs(["m/q"], "m", { detail: true }),
      decl("m/p.T", "m/p"), decl("m/p.T.M", "m/p.T", "function"), decl("m/p.F", "m/p", "function"),
      decl("m/q.G", "m/q", "function")],
      [edge("m/p.F", "m/p.T.M", "calls"), edge("m/p.F", "m/p.T", "calls"), edge("m/p.F", "m/p.T", "embeds"),
        edge("m/p.T.M", "m/q.G", "calls"), edge("m/p", "m/q")]);
    expect(short(bundlesOver(v, cut(v, "m/p", 1)))).toEqual([["m/p.F", "m/p.T", 2, 3]]);
  });
  it("gives a bundle the status its members share, mixed beside unchanged ones (04 Part B)", () => {
    const st = (e: ReturnType<typeof edge>, status?: string) => ({ ...e, ...(status ? { status } : {}) });
    const v = view(pkgs(["m/a", "m/b", "m/c", "m/d"], "m"), [
      st(edge("m/a", "m/b"), "added"),
      st(edge("m/a", "m/c"), "added"), st({ ...edge("m/a", "m/c"), kind: "imports", count: 2 }),
      edge("m/a", "m/d"),
    ]);
    expect(bundlesOver(v, cut(v, "", 2)).map((b) => b.status)).toEqual(["added", "mixed", undefined]);
  });
});
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/bundle.test.ts` → `Cannot find module './bundle'`.
- [ ] **Implement.**

**Create `web/src/bundle.ts`:**

````ts
// Edges of one cut, bundled between drawn nodes (04's rules, plus members and
// the externals toggle).
import type { View, ViewEdge } from "./data";
import { cmp, index, leafOf, type Cut } from "./cut";

export const EXTERNALS = "externals"; // the aggregate when a cut touches too many externals
export const EXTERNAL_BUDGET = 20;

// Bundle is every IR edge between two drawn nodes; pairs counts distinct
// from/to node pairs among its members. status is the Change Status its
// members share (04 Part B), "mixed" when they differ, absent when none changed.
export type Bundle = { from: string; to: string; pairs: number; members: ViewEdge[]; status?: string };

// statusOf is a bundle's status: the one status all members share, or "mixed"
// when changed members disagree or sit beside unchanged ones.
export function statusOf(members: readonly ViewEdge[]): string | undefined {
  const st = new Set(members.map((e) => e.status ?? ""));
  if (st.size === 1) return [...st][0] || undefined;
  return [...st].some((x) => x !== "") ? "mixed" : undefined;
}

// bundlesOver maps each edge's ends to drawn nodes and groups them.
// - Package cut: imports; packages go to their leaf or "outside", externals to
//   themselves, or all to "externals" when more than 20 are touched.
// - Declaration cut: calls and embeds between the package's declarations; a
//   method goes to its type.
// An edge is kept only when one end is a drawn leaf, so outside→outside and
// outside→external never show. Self-loops are dropped. Sorted by from, then to.
export function bundlesOver(view: View, c: Cut, opts: { externals: boolean } = { externals: true }): Bundle[] {
  const { node } = index(view);
  const leaves = new Set(c.leaves);
  const toLeaf = leafOf(view, c);
  const end = (id: string): string | null => {
    const n = node.get(id);
    if (!n) return null;
    if (c.decls) {
      const top = n.parent && leaves.has(n.parent) ? n.parent : id;
      return leaves.has(top) ? top : null;
    }
    if (n.kind === "external") return opts.externals ? id : null;
    return n.kind === "package" ? toLeaf(id) : null;
  };
  const kinds = c.decls ? ["calls", "embeds"] : ["imports"];
  const mapped: [string, string, ViewEdge][] = [];
  for (const e of view.edges) {
    if (!kinds.includes(e.kind)) continue;
    const from = end(e.from);
    const to = end(e.to);
    if (from === null || to === null || from === to || !(leaves.has(from) || leaves.has(to))) continue;
    mapped.push([from, to, e]);
  }
  const touched = new Set<string>();
  for (const [, , e] of mapped) for (const id of [e.from, e.to]) if (node.get(id)?.kind === "external") touched.add(id);
  const ext = (id: string) => (touched.size > EXTERNAL_BUDGET && touched.has(id) ? EXTERNALS : id);
  const groups = new Map<string, Bundle>();
  for (const [f, t, e] of mapped) {
    const from = ext(f);
    const to = ext(t);
    const key = from + "\n" + to;
    const b = groups.get(key) ?? { from, to, pairs: 0, members: [] };
    b.members.push(e);
    groups.set(key, b);
  }
  const out = [...groups.values()];
  for (const b of out) {
    b.members.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to) || cmp(x.kind, y.kind));
    b.pairs = new Set(b.members.map((e) => e.from + "\n" + e.to)).size;
    const st = statusOf(b.members);
    if (st) b.status = st;
  }
  return out.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to));
}

// externalsOf are the external modules a set of bundles touches, whether drawn
// as ovals or folded into "externals".
export function externalsOf(view: View, bundles: readonly Bundle[]): string[] {
  const { node } = index(view);
  const out = new Set<string>();
  for (const b of bundles) for (const e of b.members) for (const id of [e.from, e.to]) {
    if (node.get(id)?.kind === "external") out.add(id);
  }
  return [...out].sort(cmp);
}
````

- [ ] **Move 04's tree onto the cut** (04's `tree.test.ts` stays as it is).

**Replace `web/src/tree.ts` with:**

````ts
// 04's Package Tree API, now a thin layer over cut.ts and bundle.ts (feature
// 05): one tree algorithm, still guarded by 04's tests and the 04 snapshot.
import type { View } from "./data";
import { autoDepth, BOX_BUDGET, childrenOf, cut, index, OUTSIDE, packagesIn, parentBox, within } from "./cut";
import { bundlesOver, EXTERNAL_BUDGET, EXTERNALS, externalsOf } from "./bundle";

export { autoDepth, BOX_BUDGET, EXTERNAL_BUDGET, EXTERNALS, OUTSIDE, packagesIn, parentBox };

// boxesOf is kept for 04's layout.ts until Task 7 replaces it.
export const boxesOf = (view: View) => ({
  byId: index(view).node,
  boxes: new Map([...index(view).parent.keys()].map((id) => [id, { children: childrenOf(view, id).length > 0 }])),
});

export function leavesAt(view: View, focus: string, d: number): string[] {
  const c = cut(view, focus, d);
  return c.noDetail ? [] : c.leaves;
}

export function containers(view: View, focus: string, d: number): { id: string; parent: string }[] {
  const c = cut(view, focus, d);
  return c.containers.map((id) => ({ id, parent: c.parent.get(id) ?? "" }));
}

// placeOf is the container a drawn item sits in under focus ("" = the canvas).
export function placeOf(view: View, focus: string, id: string): string {
  if (cut(view, focus, 1).decls || id === OUTSIDE || id === EXTERNALS) return "";
  const p = parentBox(view, id);
  return p === "" || p === focus || !within(view, p, focus) ? "" : p;
}

// declLeaves are a package's types and functions; methods are rows of their type.
export function declLeaves(view: View, pkg: string): string[] {
  return view.nodes
    .filter((n) => (n.kind === "type" || n.kind === "function") && n.parent === pkg)
    .map((n) => n.id)
    .sort();
}

export function methodsOf(view: View, type: string): string[] {
  return view.nodes.filter((n) => n.kind === "function" && n.parent === type).map((n) => n.id).sort();
}

export type Bundle = { from: string; to: string; pairs: number; status?: string };

export const bundles = (view: View, focus: string, d: number): Bundle[] =>
  bundlesOver(view, cut(view, focus, d)).map(({ from, to, pairs, status }) => ({ from, to, pairs, ...(status ? { status } : {}) }));

export const touchedExternals = (view: View, focus: string, d: number): string[] =>
  externalsOf(view, bundlesOver(view, cut(view, focus, d)));

// boxStats sums the packages a box holds; a #pkg leaf holds only its package.
export function boxStats(view: View, box: string): { packages: number; decls: number; unresolved: number } {
  const s = { packages: 0, decls: 0, unresolved: 0 };
  for (const p of packagesIn(view, box)) {
    s.packages++;
    s.decls += p.decls ?? 0;
    s.unresolved += p.unresolved ?? 0;
  }
  return s;
}
````

- [ ] **Point facts at the drawn bundles.** First the test:

**Edit `web/src/facts.test.ts`:** replace

````ts
import { calls, imports, targets } from "./facts";
````

with

````ts
import { bundlesOver } from "./bundle";
import { cut } from "./cut";
import { calls, imports, targets } from "./facts";
````

**Edit `web/src/facts.test.ts`:** replace

````ts
targets(v, "example.com/shop/internal", 1, "outside")
````

with

````ts
targets(bundlesOver(v, cut(v, "example.com/shop/internal", 1)), "outside")
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/facts.test.ts` → `targets` is called with the old arguments.
**Replace `web/src/facts.ts` with:**

````ts
// What the side panel lists about a selection: edges grouped by the node at
// the other end, with counts.
import type { View } from "./data";
import type { Bundle } from "./bundle";
import { index, packagesIn } from "./cut";

export type Row = { id: string; count: number };

function group(ids: string[]): Row[] {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function across(view: View, kinds: string[], inside: (id: string) => boolean): { out: Row[]; in: Row[] } {
  const out: string[] = [];
  const inn: string[] = [];
  for (const e of view.edges) {
    if (!kinds.includes(e.kind)) continue;
    const f = inside(e.from);
    const t = inside(e.to);
    if (f && !t) out.push(e.to);
    if (t && !f) inn.push(e.from);
  }
  return { out: group(out), in: group(inn) };
}

// imports lists the packages a box imports from outside it and its importers.
export function imports(view: View, box: string): { out: Row[]; in: Row[] } {
  const pkgs = new Set(packagesIn(view, box).map((p) => p.id));
  if (pkgs.size === 0 && index(view).node.get(box)?.kind === "external") pkgs.add(box);
  return across(view, ["imports"], (id) => pkgs.has(id));
}

// calls lists a declaration's calls and embeds; a type's methods count as the type.
export function calls(view: View, decl: string): { out: Row[]; in: Row[] } {
  const byId = index(view).node;
  const inside = (id: string) => id === decl || byId.get(id)?.parent === decl;
  return across(view, ["calls", "embeds"], inside);
}

// targets lists the real nodes behind an aggregate ("outside", "externals"):
// the far ends of the drawn bundles that touch it.
export function targets(bundles: readonly Bundle[], agg: string): Row[] {
  const ids: string[] = [];
  for (const b of bundles) {
    for (const e of b.members) {
      if (b.from === agg) ids.push(e.from);
      if (b.to === agg) ids.push(e.to);
    }
  }
  return group(ids);
}
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
import type { Hunk, Loc, View, ViewNode } from "./data";
````

with

````tsx
import { bundlesOver } from "./bundle";
import { cut } from "./cut";
import type { Hunk, Loc, View, ViewNode } from "./data";
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
targets(shown ?? view, focus, depth, id)
````

with

````tsx
targets(bundlesOver(shown ?? view, cut(shown ?? view, focus, depth)), id)
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run && npx tsc --noEmit` → all of 04's tests, `tree.snapshot` and `bundle.test` pass.
- [ ] **Commit:** `git add web/src/bundle.ts web/src/bundle.test.ts web/src/tree.ts web/src/tree.snapshot.test.ts web/src/__snapshots__/tree04.json web/src/facts.ts web/src/facts.test.ts web/src/Panel.tsx && git commit -m "Bundle edges over a cut and rebuild 04's tree on it"`

---

### Task 4: Selection hops and the declutter cycle

**Files:**
- Create: `web/src/select.ts`, `web/src/select.test.ts`, `web/src/declutter.ts`, `web/src/declutter.test.ts`

**Rules:** `withinHops` takes a set of seeds (the leaves under the selection). `declutter` is Deviation 1, stage by stage; a merged arrow is pinned when any bundle it carries is, and its `status` is recomputed over all members.

**Steps:**

- [ ] **Write the failing tests.**

**Create `web/src/select.test.ts`:**

````ts
import { describe, expect, it } from "vitest";
import { withinHops } from "./select";

const arcs = [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "d", to: "b" }, { from: "c", to: "e" }];

describe("selection", () => {
  it("walks n hops in both directions from every seed", () => {
    expect(withinHops(arcs, ["a"], 1)).toEqual(new Set(["a", "b"]));
    expect(withinHops(arcs, ["a"], 2)).toEqual(new Set(["a", "b", "c", "d"]));
    expect(withinHops(arcs, ["a", "e"], 1)).toEqual(new Set(["a", "b", "e", "c"]));
    expect(withinHops(arcs, ["zz"], 3)).toEqual(new Set(["zz"]));
  });
});
````

**Create `web/src/declutter.test.ts`:**

````ts
import { describe, expect, it } from "vitest";
import { declutter } from "./declutter";
import type { Bundle } from "./bundle";
import type { Stage } from "./state";

const b = (from: string, to: string): Bundle =>
  ({ from, to, pairs: 1, members: [{ from, to, kind: "imports", count: 1, loc: { path: "x.go", line: 1 } }] });
// Containers A (a1, a2) and B (b1), and a top-level leaf t. a1→b1 is pinned.
const all = [b("a1", "a2"), b("a1", "b1"), b("a2", "b1"), b("t", "a1")];
const leaves = ["a1", "a2", "b1", "t"];
const parent = new Map([["a1", "A"], ["a2", "A"], ["b1", "B"], ["t", ""], ["A", ""], ["B", ""]]);
const pin = (x: Bundle) => x.from === "a1" && x.to === "b1";
const at = (s: Stage, lines = true) => declutter(s, lines, all, leaves, parent, pin);
const arrows = (s: Stage) => at(s).arrows.map((a) => `${a.from}→${a.to} ${a.pairs}${a.pinned ? " pinned" : ""}`);

describe("declutter (uml-viewer's cycle)", () => {
  it("full draws every leaf bundle as a line, with method rows", () => {
    expect(arrows("full")).toEqual(["a1→a2 1", "a1→b1 1 pinned", "a2→b1 1", "t→a1 1"]);
    expect([at("full").lines, at("full").rows, at("full").folded("a1")]).toEqual([true, true, false]);
  });
  it("arrows: one per direction between containers; edges inside a container go; a pin survives the merge", () => {
    expect(arrows("arrows")).toEqual(["A→B 2 pinned", "t→A 1"]);
    expect(at("arrows").lift("a2")).toBe("A");
  });
  it("triangles: the same arrows as marks on each box and on the leaves they carry", () => {
    const d = at("triangles");
    expect(d.lines).toBe(false);
    expect(d.marks.get("A")).toEqual({ in: true, out: true, inPinned: false, outPinned: true });
    expect(d.marks.get("b1")).toEqual({ in: true, out: false, inPinned: true, outPinned: false });
    expect(d.marks.get("t")).toEqual({ in: false, out: true, inPinned: false, outPinned: false });
  });
  it("elements hides method rows and draws lines again; classes folds leaves into their containers", () => {
    expect([at("elements").lines, at("elements").rows]).toEqual([true, false]);
    expect(leaves.filter(at("classes").folded)).toEqual(["a1", "a2", "b1"]);
    expect(arrows("classes")).toEqual(arrows("arrows"));
  });
  it("with a single container, arrows equals full and classes folds nothing", () => {
    const one = new Map([["a1", "A"], ["a2", "A"]]);
    const d = (s: Stage) => declutter(s, true, [b("a1", "a2")], ["a1", "a2"], one, pin);
    expect(d("arrows").arrows.map((a) => a.from + a.to)).toEqual(["a1a2"]);
    expect(d("classes").folded("a1")).toBe(false);
  });
  it("hide edges draws marks instead of lines at any stage", () => {
    const d = at("full", false);
    expect(d.lines).toBe(false);
    expect(d.marks.get("a2")).toEqual({ in: true, out: true, inPinned: false, outPinned: false });
  });
});
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/select.test.ts src/declutter.test.ts` → modules not found.
- [ ] **Implement.**

**Create `web/src/select.ts`:**

````ts
// Selection: the N-hop neighbourhood of a set of seeds (the leaves under the
// selection). Direct neighbours (U4) are lit by scene() from the drawn arrows.
type Arc = { from: string; to: string };

// withinHops is every node at most n undirected hops from any seed, seeds included.
export function withinHops(arcs: readonly Arc[], seeds: Iterable<string>, n: number): Set<string> {
  const adj = new Map<string, string[]>();
  const add = (x: string, y: string) => {
    const l = adj.get(x);
    if (l) l.push(y);
    else adj.set(x, [y]);
  };
  for (const a of arcs) {
    add(a.from, a.to);
    add(a.to, a.from);
  }
  const seen = new Set(seeds);
  let ring = [...seen];
  for (let h = 0; h < n && ring.length; h++) {
    const next: string[] = [];
    for (const x of ring) {
      for (const y of adj.get(x) ?? []) {
        if (!seen.has(y)) {
          seen.add(y);
          next.push(y);
        }
      }
    }
    ring = next;
  }
  return seen;
}
````

**Create `web/src/declutter.ts`:**

````ts
// U6: uml-viewer's declutter cycle, as unclebob/uml-viewer defines it in
// src/uml_viewer/domain/hierarchy.clj (`declutter-modes`, `apply-declutter`):
// - full: every bundle between leaves is a line;
// - arrows (`collapse-arrows`): one arrow per direction between containers; a
//   leaf's edges attach to its container, and edges inside one container go;
// - triangles: arrows, drawn as triangles on the boxes instead of lines;
// - elements (`hide-elements`): arrows as lines, method rows hidden;
// - classes (`hide-classes`): elements, and every leaf folds into its container.
// With one container or none (uml-viewer's single wrapping package), arrows
// equals full and classes only hides rows. "Hide edges" (lines = false) draws
// triangles at any stage. A pinned bundle (a violation, from 06) stays red:
// as a red line, or as red triangles where lines are hidden.
import { statusOf, type Bundle } from "./bundle";
import { cmp } from "./cut";
import type { Stage } from "./state";

export type Pin = (b: Bundle) => boolean;
export const NO_PINS: Pin = () => false;

// Arrow is one drawn edge: the bundles it carries, merged per direction.
export type Arrow = Bundle & { pinned: boolean; carries: Bundle[] };
export type Mark = { in: boolean; out: boolean; inPinned: boolean; outPinned: boolean };

export type Decluttered = {
  lift: (id: string) => string; // where a leaf's edges attach
  folded: (id: string) => boolean; // a leaf hidden inside its container
  arrows: Arrow[];
  lines: boolean; // false: draw marks instead of lines
  rows: boolean; // method rows inside types
  marks: Map<string, Mark>; // incoming (top) and outgoing (bottom) triangles, when !lines
};

export function declutter(
  stage: Stage, lines: boolean, bundles: readonly Bundle[],
  leaves: readonly string[], parent: ReadonlyMap<string, string>, pin: Pin,
): Decluttered {
  const up = (id: string) => parent.get(id) ?? "";
  const leaf = new Set(leaves);
  const multi = new Set(leaves.map(up).filter((p) => p !== "")).size > 1;
  const lift = (id: string) => (stage !== "full" && multi && leaf.has(id) && up(id) !== "" ? up(id) : id);
  const folded = (id: string) => stage === "classes" && multi && leaf.has(id) && up(id) !== "";

  const merged = new Map<string, Arrow>();
  for (const b of bundles) {
    const from = lift(b.from);
    const to = lift(b.to);
    if (from === to) continue;
    const key = from + "\n" + to;
    const a = merged.get(key) ?? { from, to, pairs: 0, members: [], pinned: false, carries: [] };
    a.carries.push(b);
    a.members.push(...b.members);
    a.pinned ||= pin(b);
    merged.set(key, a);
  }
  const arrows = [...merged.values()].sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to));
  for (const a of arrows) {
    a.pairs = new Set(a.members.map((e) => e.from + "\n" + e.to)).size;
    const st = statusOf(a.members);
    if (st) a.status = st;
  }

  const drawLines = lines && stage !== "triangles";
  const marks = new Map<string, Mark>();
  const mark = (id: string, dir: "in" | "out", pinned: boolean) => {
    const m = marks.get(id) ?? { in: false, out: false, inPinned: false, outPinned: false };
    m[dir] = true;
    if (pinned) m[dir === "in" ? "inPinned" : "outPinned"] = true;
    marks.set(id, m);
  };
  if (!drawLines) {
    for (const a of arrows) {
      for (const b of [a, ...a.carries]) {
        const p = b === a ? a.pinned : pin(b);
        mark(b.from, "out", p);
        mark(b.to, "in", p);
      }
    }
  }
  return { lift, folded, arrows, lines: drawLines, rows: stage === "full" || stage === "arrows" || stage === "triangles", marks };
}
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run src/select.test.ts src/declutter.test.ts && npx tsc --noEmit` → 7 passed.
- [ ] **Commit:** `git add web/src/select.ts web/src/select.test.ts web/src/declutter.ts web/src/declutter.test.ts && git commit -m "Add N-hop selection and uml-viewer's declutter cycle"`

---

### Task 5: The scene: one pure function for the canvas

**Files:**
- Create: `web/src/scene.ts`, `web/src/scene.test.ts`, `web/src/scene.snapshot.test.ts`, `web/src/__snapshots__/scene04.json` (written by 04's code)

**Rules:**
- `scene(view, state, { pin })` returns every node and edge the canvas draws, dimmed or not, plus `selected`, `selectedRow` and `bundles`.
- **Selection (M2, addendum d):** a drawn leaf or an open container selects itself. A method selects its type, and `selectedRow` is the method, drawn as the type's highlighted row. A package inside a closed box selects that box.
- **Hops** cut the leaves and bundles to those within N of the selection. **Lighting (U4):** the selection, what it holds, and the far ends of the bundles that touch it; everything else dims, containers never.
- **Declaration focus without detail:** no nodes and no edges, and `noDetail` so the page shows 04's "Declarations not included" card.
- **Change View (04 Part B), reproduced exactly:** `markChanges` gives every node its class from `change.ts` `nodeMark`, and opens each changed package drawn as a box onto its changed declarations with a `+N unchanged` chip (Q4). A box that folds changed packages is marked `has-change`, or, once it opens, gets a `+N changed packages` chip. `SceneEdge.status` is the bundle's status. The changed subgraph itself stays 04's `changedSubgraph` in `App` (see Notes).
- **Proof of equivalence:** as in Task 3, a snapshot of 04's `layout.ts` `scene` over every focus of the Project View, the Change View and its changed subgraph, at the auto depth and depths 1–3, must be reproduced by the new `scene` at default settings.

**Steps:**

- [ ] **Freeze 04's canvas** (this version of the test runs 04's `layout.ts` `scene`).

**Create `web/src/scene.snapshot.test.ts`:**

````ts
// What 04's canvas draws, over every focus of the shop goldens (the Change
// View whole and as its changed subgraph) at the auto depth and depths 1–3.
// The snapshot was written by 04's own layout.ts scene before feature 05
// replaced it; the new scene() at default settings must reproduce it exactly.
import { expect, it } from "vitest";
import project from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import { changedSubgraph } from "./change";
import { parseView, type View } from "./data";
import { scene } from "./layout";
import { autoDepth, leavesAt } from "./tree";

function foci(v: View): string[] {
  const decl = new Set(v.nodes.filter((n) => n.kind === "type" || n.kind === "function").map((n) => n.id));
  const out: string[] = [];
  const walk = (f: string) => {
    out.push(f);
    for (const l of leavesAt(v, f, 1)) if (!decl.has(l)) walk(l);
  };
  walk("");
  return out;
}

const drawn = (v: View, focus: string, depth: number | null) => {
  const s = scene(v, focus, depth ?? autoDepth(v, focus));
  return {
    nodes: s.items.map((i) => ({
      id: i.id, label: i.label, parent: i.parent ?? "", shape: i.shape,
      rows: i.rows ?? [], mark: i.mark ?? "", rowMarks: i.rowMarks ?? [],
    })),
    edges: s.edges.map((e) => ({ from: e.from, to: e.to, pairs: e.pairs, status: e.status ?? "" })),
  };
};

it("reproduces 04's canvas on the shop goldens", async () => {
  const snap: Record<string, unknown> = {};
  const ch = parseView(JSON.stringify(change));
  const views = [["project", parseView(JSON.stringify(project))], ["change", ch], ["subgraph", changedSubgraph(ch)]] as const;
  for (const [name, v] of views) {
    for (const f of foci(v)) {
      for (const d of [null, 1, 2, 3]) snap[`${name} ${f || "(root)"} d=${d ?? "auto"}`] = drawn(v, f, d);
    }
  }
  await expect(JSON.stringify(snap, null, 1)).toMatchFileSnapshot("./__snapshots__/scene04.json");
});
````

**Run (writes the snapshot):** `cd web && npx vitest run -u src/scene.snapshot.test.ts`

- [ ] Review `web/src/__snapshots__/scene04.json` (about 140 KB) and commit it with this task.
- [ ] **Write the failing test.**

**Create `web/src/scene.test.ts`:**

````ts
import { describe, expect, it } from "vitest";
import { knownIds, scene } from "./scene";
import { DEFAULT_STATE, up, type ViewState } from "./state";
import { decl, edge, exts, pkgs, view } from "./testkit";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import change from "../../internal/export/testdata/shop.change.golden.json";
import { parseView } from "./data";

const v = view([
  ...pkgs(["m", "m/api", "m/core/a", "m/core/b", "m/lone"], "m"),
  ...exts(["x.io/e"]),
], [
  edge("m", "m/api"), edge("m/api", "m/core/a"), edge("m/api", "m/core/b"), edge("m/core/a", "m/core/b"),
  edge("m/api", "x.io/e"),
]);
const at = (s: Partial<ViewState>) => scene(v, { ...DEFAULT_STATE, ...s });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const g = parseView(JSON.stringify(golden));
const store = "example.com/shop/internal/store";

describe("scene", () => {
  it("draws the cut with labels relative to their container", () => {
    const sc = at({ focus: "", depth: 2 });
    expect(sc.nodes.map((n) => [n.id, n.label, n.shape, n.toggle ?? ""])).toEqual([
      ["m", "m", "container", "collapse"],
      ["m#pkg", "m (package)", "box", ""],
      ["m/api", "api", "box", ""],
      ["m/core", "core", "box", "expand"],
      ["m/lone", "lone", "box", ""],
      ["x.io/e", "x.io/e", "oval", ""],
    ]);
    expect(sc.edges.map((e) => [e.id, e.pairs]))
      .toEqual([["m#pkg→m/api", 1], ["m/api→m/core", 2], ["m/api→x.io/e", 1]]);
  });
  it("hides weak bundles below minPairs unless pinned", () => {
    expect(ids(at({ depth: 2, minPairs: 2 }).edges)).toEqual(["m/api→m/core"]);
    const pinned = scene(v, { ...DEFAULT_STATE, depth: 2, minPairs: 2 }, { pin: (b) => b.to === "x.io/e" });
    expect(pinned.edges.map((e) => [e.id, e.pinned])).toEqual([["m/api→m/core", false], ["m/api→x.io/e", true]]);
  });
  it("selection lights direct neighbours and dims the rest (U4)", () => {
    const sc = at({ depth: 2, selected: "m/core" });
    expect(sc.nodes.filter((n) => !n.dim).map((n) => n.id)).toEqual(["m", "m/api", "m/core"]);
    expect(sc.edges.filter((e) => e.hot).map((e) => e.id)).toEqual(["m/api→m/core"]);
  });
  it("a container can be selected, so going up selects the box the reader left", () => {
    const sc = scene(g, up({ ...DEFAULT_STATE, focus: "example.com/shop/internal" }, "example.com/shop"));
    expect(sc.selected).toBe("example.com/shop/internal");
    expect(sc.nodes.find((n) => n.id === "example.com/shop/internal")).toMatchObject({ shape: "container", selected: true });
  });
  it("a selected method lights through its type and is its selected row", () => {
    const sc = scene(g, { ...DEFAULT_STATE, focus: store, selected: `${store}.Repo.Get` });
    expect([sc.selected, sc.selectedRow]).toEqual([`${store}.Repo`, `${store}.Repo.Get`]);
    expect(sc.edges.filter((e) => e.hot).map((e) => e.id)).toEqual([`${store}.Repo→${store}.Open`]);
  });
  it("a package inside a closed box is selected as that box; an unknown one is ignored", () => {
    expect(at({ depth: 2, selected: "m/core/a" }).selected).toBe("m/core");
    expect(at({ depth: 2, selected: "m/nope" }).selected).toBeNull();
  });
  it("focus N hops keeps only nearby nodes", () => {
    expect(ids(at({ depth: 2, selected: "m/core", hops: 1 }).nodes)).toEqual(["m", "m/api", "m/core"]);
  });
  it("declutter: arrows join containers, triangles mark boxes, classes fold leaves (uml-viewer)", () => {
    expect(ids(at({ depth: 3, stage: "arrows" }).edges)).toEqual(["m→m/core", "m→x.io/e"]);
    const tri = at({ depth: 3, stage: "triangles" });
    expect([tri.lines, tri.edges.length]).toEqual([false, 0]);
    expect(tri.nodes.find((n) => n.id === "m/core")?.mark).toMatchObject({ in: true, out: false });
    expect(at({ depth: 3, stage: "classes" }).nodes.map((n) => [n.id, n.shape]))
      .toEqual([["m", "container"], ["m/core", "box"], ["x.io/e", "oval"]]);
    const sel = at({ depth: 3, stage: "triangles", selected: "m/api" });
    expect(sel.edges.map((e) => [e.id, e.hot])).toEqual([["m→m/core", true], ["m→x.io/e", true]]);
  });
  it("hide edges keeps the stage and draws marks; pinned bundles mark red", () => {
    const sc = scene(v, { ...DEFAULT_STATE, depth: 2, lines: false }, { pin: (b) => b.to === "x.io/e" });
    expect([sc.stage, sc.lines, sc.edges.length]).toEqual(["full", false, 0]);
    expect(sc.nodes.find((n) => n.id === "x.io/e")?.mark).toEqual({ in: true, out: false, inPinned: true, outPinned: false });
  });
  it("a type lists its methods as rows until the elements stage", () => {
    const w = view([...pkgs(["m/p"], "m", { detail: true }), decl("m/p.T", "m/p"),
      decl("m/p.T.Put", "m/p.T", "function"), decl("m/p.T.Get", "m/p.T", "function")]);
    expect(scene(w, { ...DEFAULT_STATE, focus: "m/p" }).nodes[0]).toMatchObject({ id: "m/p.T", shape: "decl", methods: ["Get", "Put"] });
    expect(scene(w, { ...DEFAULT_STATE, focus: "m/p", stage: "elements" }).nodes[0].methods).toEqual([]);
  });
  it("a package without detail draws nothing, and says so", () => {
    expect(scene(g, { ...DEFAULT_STATE, focus: "example.com/shop#pkg" })).toMatchObject({ noDetail: true, nodes: [], edges: [] });
  });
  it("externals toggle removes ovals and their edges", () => {
    expect(ids(at({ depth: 2, externals: false }).nodes)).not.toContain("x.io/e");
  });
  it("knows which ids a hash may name", () => {
    const k = knownIds(v);
    expect([k.box(""), k.box("m/core"), k.box("m#pkg"), k.box("m/api#pkg"), k.box("x.io/e")]).toEqual([true, true, true, false, false]);
    expect([k.folder("m/core"), k.folder("m/api"), k.folder("m#pkg")]).toEqual([true, false, false]);
    expect([k.node("x.io/e"), k.node("outside"), k.node("m/nope")]).toEqual([true, true, false]);
  });
  it("is independent of input order", () => {
    const w = { ...v, nodes: [...v.nodes].reverse(), edges: [...v.edges].reverse() };
    expect(scene(w, { ...DEFAULT_STATE, depth: 2 })).toEqual(at({ depth: 2 }));
  });
  it("opens the shop golden fully expanded, and store at its declarations", () => {
    const top = scene(g, DEFAULT_STATE);
    expect(top.depth).toBe(3);
    expect(top.nodes.map((n) => [n.label, n.shape])).toEqual([
      ["example.com/shop", "container"], ["shop (package)", "box"], ["internal", "container"],
      ["checkout", "box"], ["money", "box"], ["store", "box"],
      ["example.com/shop/tools", "container"], ["gen", "box"],
      ["github.com/lib/pq", "oval"], ["golang.org/x/sync", "oval"],
    ]);
    expect(top.edges).toHaveLength(7);
    const sc = scene(g, { ...DEFAULT_STATE, focus: store });
    expect(sc.nodes.find((n) => n.label === "Repo")?.methods).toEqual(["Get", "Reset", "check"]);
  });
  it("Change View (04 Part B): opens changed packages onto their changed declarations and a chip", () => {
    const ch = parseView(JSON.stringify(change));
    const sc = scene(ch, DEFAULT_STATE);
    expect(sc.nodes.find((n) => n.id === store)).toMatchObject({ shape: "container", change: "st-modified" });
    expect(sc.nodes.filter((n) => n.parent === store).map((n) => n.label)).toEqual(["+10 unchanged", "Order", "ReadWriter", "Repo"]);
    expect(sc.nodes.find((n) => n.id === `${store}.Repo`)).toMatchObject({ methods: ["Get", "check"], rowMarks: ["st-modified", "st-modified"] });
    expect(sc.nodes.find((n) => n.id === "example.com/shop/tools/gen")?.change).toBe("affected");
    expect(sc.edges.filter((e) => e.status).map((e) => [e.id, e.status])).toEqual([
      ["example.com/shop#pkg→example.com/shop/internal/money", "added"],
      ["example.com/shop/internal/money→example.com/shop/internal/store", "reversed"],
    ]);
  });
  it("Change View: folded changed packages get a chip, or a has-change mark on a box", () => {
    const ch = parseView(JSON.stringify(change));
    const chip = scene(ch, { ...DEFAULT_STATE, depth: 1 }).nodes.find((n) => n.parent === "example.com/shop" && n.shape === "chip" && n.label.includes("package"));
    expect(chip?.label).toBe("+3 changed packages");
    const plain = { ...ch, nodes: ch.nodes.map((n) => (n.id === "example.com/shop" ? { ...n, status: undefined, detail: false } : n)) };
    const box = scene(plain, { ...DEFAULT_STATE, depth: 1 }).nodes.find((n) => n.id === "example.com/shop");
    expect(box?.shape).toBe("box");
    expect(box?.change).toContain("has-change");
  });
  it("Change View: a declaration opened by the change can be selected, a method as its row", () => {
    const ch = parseView(JSON.stringify(change));
    const sc = scene(ch, { ...DEFAULT_STATE, selected: `${store}.Repo.Get` });
    expect([sc.selected, sc.selectedRow]).toEqual([`${store}.Repo`, `${store}.Repo.Get`]);
    expect(sc.nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([`${store}.Repo`]);
  });
});
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/scene.test.ts` → `Cannot find module './scene'`.
- [ ] **Implement.**

**Create `web/src/scene.ts`:**

````ts
// scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
import { nodeMark, unchangedCount } from "./change";
import type { View } from "./data";
import { autoDepth, childrenOf, cmp, cut, declsOf, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
import { withinHops } from "./select";
import type { Known, Stage, ViewState } from "./state";

export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";

export type SceneNode = {
  id: string; label: string; parent: string; shape: Shape;
  dim: boolean; selected: boolean; toggle?: "expand" | "collapse";
  methods: string[]; // method rows of a type, empty once the stage hides members
  mark?: Mark; // incoming/outgoing triangles, when lines are hidden
  change?: string; // the Change View class (change.ts nodeMark, or "has-change")
  rowMarks?: string[]; // the Change View class of each method row
};
export type SceneEdge = {
  id: string; from: string; to: string; pairs: number; members: Bundle["members"];
  dim: boolean; hot: boolean; pinned: boolean;
  status?: string; // the Change Status its members share, or "mixed" (bundle.ts statusOf)
};
export type Scene = {
  depth: number; stage: Stage;
  lines: boolean; // edges are laid out; false = only the selection's edges, drawn over the marks
  nodes: SceneNode[]; edges: SceneEdge[];
  bundles: Bundle[]; // the leaf bundles behind the edges, for the panel
  selected: string | null; // the drawn node that stands for the selection
  selectedRow: string | null; // the selected method, drawn as a row of `selected`
  decls: boolean; noDetail: boolean;
};

// Options for callers other than the Project View: 06 passes pin (violations).
export type SceneOptions = { pin?: Pin };

const last = (id: string) => id.slice(id.lastIndexOf("/") + 1);

export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene {
  const pin = opts.pin ?? NO_PINS;
  const { node } = index(view);
  const depth = s.depth ?? autoDepth(view, s.focus);
  const c = cut(view, s.focus, depth, s.toggled);
  let kept = bundlesOver(view, c, { externals: s.externals }).filter((b) => b.pairs >= s.minPairs || pin(b));
  let leaves = new Set([...c.leaves, ...kept.flatMap((b) => [b.from, b.to])]);
  const open = new Set(c.containers);
  const up = (id: string) => c.parent.get(id) ?? "";
  const under = (id: string, outer: string) => {
    for (let x = id; x !== ""; x = up(x)) if (x === outer) return true;
    return false;
  };

  // anchor maps any id to the drawn node that stands for it: a method to its
  // type, a package to its leaf; a box or aggregate is itself.
  const toLeaf = leafOf(view, c);
  const anchor = (id: string): string | null => {
    if (leaves.has(id) || open.has(id)) return id;
    const n = node.get(id);
    if (n?.kind === "function" && n.parent && leaves.has(n.parent)) return n.parent;
    if (n?.kind === "package" && !c.decls) {
      const l = toLeaf(id);
      return l === OUTSIDE ? null : l;
    }
    return null;
  };
  let selected = s.selected === null ? null : anchor(s.selected);
  const selectedRow = selected !== null && s.selected !== null && node.get(s.selected)?.parent === selected
    && node.get(selected)?.kind === "type" ? s.selected : null;

  if (s.hops !== null && selected !== null) {
    const sel = selected;
    const near = withinHops(kept, [...leaves].filter((l) => under(l, sel)), s.hops);
    leaves = new Set([...leaves].filter((l) => near.has(l)));
    kept = kept.filter((b) => near.has(b.from) && near.has(b.to));
  }

  const d = declutter(s.stage, s.lines, kept, [...leaves], c.parent, pin);
  const shown = (id: string) => (d.folded(id) ? up(id) : id);
  const folds = new Set([...leaves].filter(d.folded).map(up));
  leaves = new Set([...leaves].filter((l) => !d.folded(l)));
  if (selected !== null) selected = shown(selected);

  const ids = new Set([...leaves, ...folds]);
  const inner = new Set<string>(); // containers that still hold a drawn node
  for (const id of ids) for (let p = up(id); p !== ""; p = up(p)) inner.add(p);
  for (const p of inner) ids.add(p);

  // Lighting (U4): the selection, what it holds, and the far end of every
  // bundle that touches it.
  const inSel = (x: string) => selected !== null && under(x, selected);
  const hot = (a: (typeof d.arrows)[number]) =>
    selected !== null && a.carries.some((b) => inSel(b.from) || inSel(b.to));
  const lit = new Set<string>();
  if (selected !== null) {
    for (const a of d.arrows) {
      if (!hot(a)) continue;
      for (const b of a.carries) for (const x of [a.from, a.to, b.from, b.to]) lit.add(shown(x));
    }
  }
  const bright = (id: string) => selected === null || inSel(id) || lit.has(id);

  const base = s.focus.endsWith(PKG) ? s.focus.slice(0, -PKG.length) : s.focus;
  const externals = externalsOf(view, kept).length;
  const label = (id: string, parent: string): string => {
    if (id === OUTSIDE) return "outside";
    if (id === EXTERNALS) return `${externals} external modules`;
    if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
    if (node.get(id)?.kind === "external") return id;
    if (c.decls) return id.slice(base.length + 1);
    const top = parent || base;
    return top ? id.slice(top.length + 1) : id;
  };
  const shape = (id: string): Shape => {
    if (inner.has(id)) return "container";
    if (id === OUTSIDE) return "outside";
    if (id === EXTERNALS || node.get(id)?.kind === "external") return "oval";
    return c.decls ? "decl" : "box";
  };

  const nodes: SceneNode[] = [...ids].sort(cmp).map((id) => {
    const parent = up(id);
    const n: SceneNode = {
      id, label: label(id, parent), parent, shape: shape(id),
      dim: false, selected: id === selected,
      methods: c.decls && d.rows
        ? view.nodes.filter((m) => m.parent === id && m.kind === "function").map((m) => m.id.slice(id.length + 1)).sort(cmp)
        : [],
    };
    n.dim = n.shape !== "container" && !bright(id);
    if (n.shape === "container") n.toggle = "collapse";
    else if (n.shape === "box" && !folds.has(id) && !id.endsWith(PKG) && childrenOf(view, id).length > 0) n.toggle = "expand";
    const m = d.lines ? undefined : d.marks.get(id);
    if (m) n.mark = m;
    return n;
  });
  const row = view.kind === "change" ? markChanges(view, c.decls, nodes, d.rows, s.selected) : null;
  if (row !== null) {
    selected = row.selected;
    for (const n of nodes) n.selected = n.id === selected;
  }

  const edges: SceneEdge[] = [];
  for (const a of d.arrows) {
    const h = hot(a);
    if (!ids.has(a.from) || !ids.has(a.to) || (!d.lines && !h)) continue;
    const e: SceneEdge = {
      id: `${a.from}→${a.to}`, from: a.from, to: a.to, pairs: a.pairs, members: a.members,
      hot: h, dim: selected !== null && !h, pinned: a.pinned,
    };
    if (a.status) e.status = a.status;
    edges.push(e);
  }
  edges.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to));
  return {
    depth, stage: s.stage, lines: d.lines, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, bundles: kept,
    selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
  };
}

// markChanges is 04 Part B's Change View marking (Q4), unchanged: each node
// gets its Change View class, and every changed package drawn as a box opens
// onto its changed declarations with a "+N unchanged" chip. A box that folds
// changed packages is marked "has-change", or, when it opens, gets a
// "+N changed packages" chip. It returns the selection when the selected id
// is one of the declarations it opened, so a pick from the changed list shows.
function markChanges(
  view: View, decls: boolean, nodes: SceneNode[], rows: boolean, pick: string | null,
): { selected: string; selectedRow: string | null } | null {
  const { node } = index(view);
  const mark = (id: string) => nodeMark(node.get(id)!) || undefined;
  const methodsOf = (id: string) =>
    rows ? view.nodes.filter((m) => m.parent === id && m.kind === "function").map((m) => m.id).sort(cmp) : [];
  const decl = (n: SceneNode) => {
    const ms = methodsOf(n.id);
    const cls = mark(n.id);
    if (cls) n.change = cls;
    if (ms.length) n.rowMarks = ms.map((m) => nodeMark(node.get(m)!));
  };
  if (decls) {
    for (const n of nodes) if (n.shape === "decl") decl(n);
    return null;
  }
  let found: { selected: string; selectedRow: string | null } | null = null;
  const add = (n: SceneNode) => {
    nodes.push(n);
    if (pick === n.id) found = { selected: n.id, selectedRow: null };
    else if (pick !== null && n.shape === "decl" && node.get(pick)?.parent === n.id) found = { selected: n.id, selectedRow: pick };
  };
  for (const it of [...nodes]) {
    if (it.shape !== "box") continue;
    const pkg = it.id.endsWith(PKG) ? it.id.slice(0, -PKG.length) : it.id;
    const n = node.get(pkg);
    if (n?.kind !== "package") {
      if (packagesIn(view, it.id).some((p) => p.status)) it.change = "has-change";
      continue;
    }
    const cls = mark(pkg);
    if (cls) it.change = cls;
    const folded = it.id.endsWith(PKG) ? 0 : packagesIn(view, it.id).filter((p) => p.id !== pkg && p.status).length;
    const ds = n.detail ? declsOf(view, pkg) : [];
    if (ds.length === 0) {
      if (folded > 0) it.change = `${it.change ?? ""} has-change`.trim();
      continue;
    }
    it.shape = "container";
    delete it.toggle;
    const inner = (id: string, label: string, shape: Shape): SceneNode =>
      ({ id, label, parent: it.id, shape, dim: it.dim, selected: false, methods: [] });
    for (const id of ds) {
      const d = inner(id, id.slice(pkg.length + 1), "decl");
      d.methods = methodsOf(id).map((m) => m.slice(id.length + 1));
      decl(d);
      add(d);
    }
    const more = unchangedCount(view, pkg);
    if (more > 0) add(inner(`${it.id}#unchanged`, `+${more} unchanged`, "chip"));
    if (folded > 0) add(inner(`${it.id}#folded`, `+${folded} changed package${folded > 1 ? "s" : ""}`, "chip"));
  }
  return found;
}

// knownIds says which ids a URL hash may name: boxes as a focus, boxes with
// children as toggles, and anything scene() can anchor as a selection.
export const knownIds = (view: View): Known => ({
  box: (id) => id === "" || isBox(view, id),
  folder: (id) => !id.endsWith(PKG) && childrenOf(view, id).length > 0,
  node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
});
````

- [ ] **Point the snapshot test at the new scene.**

**Edit `web/src/scene.snapshot.test.ts`:** replace

````ts
import { scene } from "./layout";
import { autoDepth, leavesAt } from "./tree";
````

with

````ts
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { leavesAt } from "./tree";
````

**Edit `web/src/scene.snapshot.test.ts`:** replace

````ts
  const s = scene(v, focus, depth ?? autoDepth(v, focus));
  return {
    nodes: s.items.map((i) => ({
      id: i.id, label: i.label, parent: i.parent ?? "", shape: i.shape,
      rows: i.rows ?? [], mark: i.mark ?? "", rowMarks: i.rowMarks ?? [],
    })),
````

with

````ts
  const s = scene(v, { ...DEFAULT_STATE, focus, depth });
  return {
    nodes: s.nodes.map((n) => ({
      id: n.id, label: n.label, parent: n.parent, shape: n.shape,
      rows: n.methods, mark: n.change ?? "", rowMarks: n.rowMarks ?? [],
    })),
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run && npx tsc --noEmit` → `scene.test` 18 passed; `scene.snapshot` matches 04's canvas.
- [ ] **Commit:** `git add web/src/scene.ts web/src/scene.test.ts web/src/scene.snapshot.test.ts web/src/__snapshots__/scene04.json && git commit -m "Compute the scene the canvas draws from the view state"`

---

### Task 6: Search, reveal and the key map

**Files:**
- Create: `web/src/search.ts`, `web/src/search.test.ts`, `web/src/keys.ts`, `web/src/keys.test.ts`

**Rules:** Deviation 7 for `reveal`. It keeps the stage and the hide-edges flag and resets toggles, hops, `minPairs` and externals, any of which could hide the target (nit: the comment now says so). A method stays selected as itself. `keyAction` returns `null` while Meta, Ctrl or Alt is held (M8).

**Steps:**

- [ ] **Write the failing tests.**

**Create `web/src/search.test.ts`:**

````ts
import { describe, expect, it } from "vitest";
import { reveal, search } from "./search";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { decl, edge, exts, pkgs, view } from "./testkit";

const v = view([
  ...pkgs(["m/store", "m/store/sql"], "m", { detail: true }), ...pkgs(["m/restore"], "m"),
  decl("m/store.Repo", "m/store"), decl("m/store.Repo.Get", "m/store.Repo", "function"),
  ...exts(Array.from({ length: 21 }, (_, i) => `x.io/e${i}`)),
], Array.from({ length: 21 }, (_, i) => edge("m/restore", `x.io/e${i}`)));

describe("search", () => {
  it("ranks exact names, then prefixes, then substrings", () => {
    expect(search(v, "store").map((h) => h.id)).toEqual(["m/store", "m/restore", "m/store/sql", "m/store.Repo", "m/store.Repo.Get"]);
    expect(search(v, "Get").map((h) => [h.id, h.name])).toEqual([["m/store.Repo.Get", "Repo.Get"]]);
    expect(search(v, "  ")).toEqual([]);
  });
  it("reveal draws and selects the target, a method as a row of its type", () => {
    for (const id of ["m/store/sql", "m/store.Repo", "m/store.Repo.Get", "x.io/e3"]) {
      expect(scene(v, reveal(v, id)).selected, id).not.toBeNull();
    }
    expect(reveal(v, "m/store.Repo.Get")).toMatchObject({ focus: "m/store#pkg", selected: "m/store.Repo.Get" });
    expect(scene(v, reveal(v, "m/store.Repo.Get")).selectedRow).toBe("m/store.Repo.Get");
    expect(reveal(v, "x.io/e3").selected).toBe("externals");
  });
  it("reveal keeps the stage and hide-edges, and resets what could hide the target", () => {
    const from = { ...DEFAULT_STATE, stage: "arrows" as const, lines: false, minPairs: 3, externals: false, hops: 2, toggled: ["m"] };
    expect(reveal(v, "m/store/sql", from)).toMatchObject({ stage: "arrows", lines: false, minPairs: 1, externals: true, hops: null, toggled: [] });
  });
});
````

**Create `web/src/keys.test.ts`:**

````ts
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
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/search.test.ts src/keys.test.ts` → modules not found.
- [ ] **Implement.**

**Create `web/src/search.ts`:**

````ts
// U8/A9: find a node by name and the state that shows it.
import type { NodeKind, View } from "./data";
import { childrenOf, cmp, index, packageOf, parentBox, PKG } from "./cut";
import { EXTERNALS } from "./bundle";
import { scene } from "./scene";
import { DEFAULT_STATE, type ViewState } from "./state";

export type Hit = { id: string; kind: NodeKind; name: string };

// name is what a reader types: the last path segment, or the part after the package.
function name(view: View, id: string): string {
  const n = index(view).node.get(id)!;
  if (n.kind === "package" || n.kind === "external") return id.slice(id.lastIndexOf("/") + 1);
  return id.slice((packageOf(view, id) ?? "").length + 1);
}

// search ranks exact names, then name prefixes, then any id substring
// (case-insensitive), shorter ids first, then by id.
export function search(view: View, query: string, limit = 20): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: [number, Hit][] = [];
  for (const n of view.nodes) {
    const nm = name(view, n.id);
    const low = nm.toLowerCase();
    const rank = low === q || low.endsWith("." + q) ? 0 : low.startsWith(q) ? 1 : n.id.toLowerCase().includes(q) ? 2 : -1;
    if (rank >= 0) scored.push([rank, { id: n.id, kind: n.kind, name: nm }]);
  }
  scored.sort(([ra, a], [rb, b]) => ra - rb || a.id.length - b.id.length || cmp(a.id, b.id));
  return scored.slice(0, limit).map(([, h]) => h);
}

// reveal returns a state that draws id and selects it (Deviation 7). It keeps
// the declutter stage and the hide-edges flag, and always resets the toggles,
// hops, weight filter and externals toggle, any of which could hide the target.
// A method stays selected as itself; scene() draws it as a row of its type.
export function reveal(view: View, id: string, from: ViewState = DEFAULT_STATE): ViewState {
  const n = index(view).node.get(id);
  if (!n) return from;
  const reset = { ...from, toggled: [] as string[], hops: null, minPairs: 1, externals: true };
  if (n.kind === "package") return { ...reset, focus: parentBox(view, id), depth: 1, selected: id };
  if (n.kind === "external") {
    const s = { ...reset, focus: "", depth: null, selected: id };
    return scene(view, s).nodes.some((x) => x.id === id) ? s : { ...s, selected: EXTERNALS };
  }
  const pkg = packageOf(view, id)!;
  return { ...reset, focus: childrenOf(view, pkg).length > 0 ? pkg + PKG : pkg, depth: null, selected: id };
}
````

**Create `web/src/keys.ts`:**

````ts
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
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run src/search.test.ts src/keys.test.ts && npx tsc --noEmit` → 6 passed.
- [ ] **Commit:** `git add web/src/search.ts web/src/search.test.ts web/src/keys.ts web/src/keys.test.ts && git commit -m "Add search, reveal and the keyboard map"`

---

### Task 7: Draw the scene: layout, canvas and page

**Files:**
- Create: `web/src/engine.ts`
- Modify: `web/src/layout.ts`, `web/src/layout.test.ts`, `web/src/Canvas.tsx`, `web/src/App.tsx`, `web/src/tree.ts` (all replaced); `web/src/testkit.ts`, `web/src/tree.test.ts`, `web/src/tree.snapshot.test.ts`, `web/src/scene.snapshot.test.ts`, `web/src/change.test.ts`

**Rules:**
- **Keep every 04 fix (addendum T9–T11):** the 24-character stats width, the container `MINIMUM_SIZE` sized to its label, spacing 24/48, `zoomOnDoubleClick={false}`, the `zu-drawn`, `zu-layout-start` and `zu-layout-end` marks, and clickable method rows.
- **Keep 04 Part B's page:** the legend, the changed list (U11), the full-project toggle (U10) over `changedSubgraph`, the `st-*`/`has-change`/chip marks, the edge signs and classes from `edgeMark`, and centring from the layout with `setCenter` on a measured wrapper (04 Part B's fix: `fitView` never resolved).
- **The layout (M5):** the engine lives in `App` for the page's life. A layout runs only when `JSON.stringify(elkGraph(sc))` changes, so selecting and dimming never lay out again. A newer layout terminates the worker and starts a new one (`superseding`); the older promise rejects with `Superseded`, which the page ignores. A failed layout resets the engine and shows "Layout failed: …". Until Task 8 the engine is `elk.bundled` on the main thread.
- `elkGraph` leaves edges out when lines are hidden; hot edges are then drawn over the marks but not laid out.
- `tree.ts` keeps only what page code still imports; 04's tree tests take the rest from `testkit.ts`. 04's `layout.test.ts` scene cases live on in `scene.test.ts` and `scene.snapshot`; 04's two Change View scene tests move into `scene.test.ts` (Task 5).

**Steps:**

- [ ] **Write the failing test** (replaces 04's `layout.test.ts`).

**Replace `web/src/layout.test.ts` with:**

````ts
import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView } from "./data";
import { absolute, elkGraph, layout, sizeOf, superseding, Superseded, triangles, type Stoppable } from "./layout";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";

const v = parseView(JSON.stringify(golden));
const elk = new ELK();

describe("layout", () => {
  it("places every scene node the same way twice, relative to its container", async () => {
    const sc = scene(v, DEFAULT_STATE);
    const a = await layout(sc, elk);
    const b = await layout(sc, elk);
    expect([...a.keys()].sort()).toEqual(sc.nodes.map((n) => n.id));
    for (const p of a.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(a).toEqual(b);
    expect(a.get("example.com/shop/internal/store")?.parent).toBe("example.com/shop/internal");
    const abs = absolute(a, "example.com/shop/internal/store")!;
    const [s, i, m] = ["example.com/shop/internal/store", "example.com/shop/internal", "example.com/shop"].map((id) => a.get(id)!);
    expect(abs).toEqual({ x: s.x + i.x + m.x, y: s.y + i.y + m.y });
  });
  it("sizes come from text: box stats, method rows, container labels; edges only with lines", () => {
    const g = elkGraph(scene(v, DEFAULT_STATE));
    expect(g.layoutOptions?.["elk.spacing.nodeNode"]).toBe("24");
    expect(g.children?.[0].layoutOptions?.["elk.nodeSize.constraints"]).toBe("MINIMUM_SIZE");
    expect(sizeOf({ id: "x", label: "gen", parent: "", shape: "box", dim: false, selected: false, methods: [] }).w).toBe(204);
    expect(sizeOf({ id: "x", label: "T", parent: "", shape: "decl", dim: false, selected: false, methods: ["Get", "Put"] }))
      .toEqual({ w: 90, h: 76 });
    expect(g.edges).toHaveLength(7);
    expect(elkGraph(scene(v, { ...DEFAULT_STATE, lines: false })).edges).toEqual([]);
  });
  it("triangles sit on the top and bottom edges, apex out (uml-viewer)", () => {
    expect(triangles(100, 40)).toEqual({ in: "50,-10.39 44,0 56,0", out: "44,40 56,40 50,50.39" });
  });
});

// fake is an engine whose layouts finish when the test says so.
function fakes() {
  const made: { stopped: boolean; jobs: { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] }[] = [];
  const make = (): Stoppable => {
    const f = { stopped: false, jobs: [] as { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] };
    made.push(f);
    return {
      layout: () => new Promise((resolve, reject) => f.jobs.push({ resolve, reject })),
      terminateWorker: () => void (f.stopped = true),
    };
  };
  return { made, make };
}

describe("superseding", () => {
  it("a newer layout stops the running worker and starts a fresh one", async () => {
    const { made, make } = fakes();
    const e = superseding(make);
    const old = e.layout({ id: "a" });
    const now = e.layout({ id: "b" });
    await expect(old).rejects.toBeInstanceOf(Superseded);
    expect(made.map((f) => f.stopped)).toEqual([true, false]);
    made[1].jobs[0].resolve({ id: "b" });
    await expect(now).resolves.toEqual({ id: "b" });
    const next = e.layout({ id: "c" });
    expect(made).toHaveLength(2);
    made[1].jobs[1].resolve({ id: "c" });
    await expect(next).resolves.toEqual({ id: "c" });
  });
  it("a failed worker is replaced on the next layout", async () => {
    const { made, make } = fakes();
    const e = superseding(make);
    const bad = e.layout({ id: "a" });
    made[0].jobs[0].reject(new Error("layout worker failed: blocked"));
    await expect(bad).rejects.toThrow("blocked");
    void e.layout({ id: "b" });
    expect(made.map((f) => f.stopped)).toEqual([true, false]);
  });
});
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/layout.test.ts` → `elkGraph` is not exported.
- [ ] **Implement.**

**Replace `web/src/layout.ts` with:**

````ts
// Where a scene is drawn. The ELK input comes from the scene alone: every list
// is sorted and sizes come from label lengths, never from the DOM, so the same
// View always lays out the same way. The engine is passed in: engine.ts for
// the page, elk.bundled.js in unit tests.
import type { ElkNode } from "elkjs/lib/elk-api";
import type { Scene, SceneNode } from "./scene";

export type Placed = { x: number; y: number; w: number; h: number; parent?: string };
export type Engine = { layout(graph: ElkNode): Promise<ElkNode> };

const ROW = 18;

// sizeOf estimates a node from its text: the label, the method rows, and for
// boxes the stats line ("15 decls · 4 unresolved").
export function sizeOf(n: SceneNode): { w: number; h: number } {
  const stats = n.shape === "box" ? 24 : 0;
  const text = Math.max(n.label.length, stats, ...n.methods.map((r) => r.length + 2));
  return { w: Math.min(280, Math.max(90, text * 7.5 + 24)), h: 40 + ROW * n.methods.length };
}

const rootOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.randomSeed": "1",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
};

// elkGraph is the layout input: containers as compound nodes wide enough for
// their label, leaves sized by sizeOf, and the edges only when lines are drawn.
export function elkGraph(sc: Scene): ElkNode {
  const byParent = new Map<string, SceneNode[]>();
  for (const n of sc.nodes) {
    const l = byParent.get(n.parent);
    if (l) l.push(n);
    else byParent.set(n.parent, [n]);
  }
  const build = (n: SceneNode): ElkNode => {
    if (n.shape !== "container") {
      const { w, h } = sizeOf(n);
      return { id: n.id, width: w, height: h };
    }
    return {
      id: n.id,
      layoutOptions: {
        "elk.padding": "[top=24,left=12,bottom=12,right=12]",
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": `(${Math.min(280, n.label.length * 7.5 + 24)}, 40)`,
      },
      children: (byParent.get(n.id) ?? []).map(build),
    };
  };
  return {
    id: "__root",
    layoutOptions: rootOptions,
    children: (byParent.get("") ?? []).map(build),
    edges: sc.lines ? sc.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })) : [],
  };
}

// positions flattens ELK's result; x and y are relative to the parent, as
// React Flow's parentId expects.
export function positions(g: ElkNode): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const walk = (n: ElkNode, parent?: string) => {
    for (const c of n.children ?? []) {
      out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0, ...(parent ? { parent } : {}) });
      walk(c, c.id);
    }
  };
  walk(g);
  return out;
}

export const layout = async (sc: Scene, engine: Engine) => positions(await engine.layout(elkGraph(sc)));

// absolute is a node's position on the canvas: its own plus its parents'.
export function absolute(placed: ReadonlyMap<string, Placed>, id: string): { x: number; y: number } | null {
  let p = placed.get(id);
  if (!p) return null;
  let x = 0;
  let y = 0;
  for (; p; p = p.parent ? placed.get(p.parent) : undefined) {
    x += p.x;
    y += p.y;
  }
  return { x, y };
}

// triangles are uml-viewer's dependency marks (engine/hit.clj `class-triangle`):
// 12 px equilateral, incoming with its apex above the top edge, outgoing with
// its apex below the bottom edge, both centred. Points are relative to the box.
export function triangles(w: number, h: number): { in: string; out: string } {
  const half = 6;
  const tip = +(12 * Math.sqrt(3) / 2).toFixed(2);
  const cx = w / 2;
  return {
    in: `${cx},${-tip} ${cx - half},0 ${cx + half},0`,
    out: `${cx - half},${h} ${cx + half},${h} ${cx},${h + tip}`,
  };
}

// An ELK that can be stopped: elk-api's terminateWorker (elk-api.d.ts).
export type Stoppable = Engine & { terminateWorker(): void };

export class Superseded extends Error {
  constructor() {
    super("a newer layout replaced this one");
  }
}

// superseding runs one layout at a time. A newer request terminates the
// running one's worker (ELK cannot cancel a job) and starts a fresh engine;
// the old promise rejects with Superseded. A failed engine is replaced on the
// next request, so one worker error does not stop every later layout.
export function superseding(make: () => Stoppable): Engine & { dispose(): void } {
  let elk: Stoppable | null = null;
  let running: { reject: (e: Error) => void } | null = null;
  const drop = () => {
    elk?.terminateWorker();
    elk = null;
  };
  const stop = () => {
    const r = running;
    running = null;
    drop();
    r?.reject(new Superseded());
  };
  return {
    layout(g) {
      if (running) stop();
      const mine = (elk ??= make());
      return new Promise<ElkNode>((resolve, reject) => {
        const job = { reject };
        running = job;
        mine.layout(g).then(
          (out) => {
            if (running !== job) return;
            running = null;
            resolve(out);
          },
          (err: Error) => {
            if (running !== job) return;
            running = null;
            if (elk === mine) drop();
            reject(err);
          },
        );
      });
    },
    dispose: () => {
      if (running) stop();
      else drop();
    },
  };
}
````

**Create `web/src/engine.ts`:**

````ts
// The page's layout engine. elk.bundled runs on the main thread until Task 8
// moves ELK into a Web Worker.
import ELK from "elkjs/lib/elk.bundled.js";
import { superseding } from "./layout";

export const pageEngine = () => superseding(() => new ELK());
````

**Replace `web/src/Canvas.tsx` with:**

````tsx
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useRef } from "react";
import "@xyflow/react/dist/style.css";
import { edgeMark } from "./change";
import { parentBox } from "./cut";
import type { View } from "./data";
import { absolute, triangles, type Placed } from "./layout";
import type { Scene, SceneNode } from "./scene";
import { boxStats } from "./tree";

type Data = {
  node: SceneNode;
  w: number;
  h: number;
  stats?: { packages: number; decls: number; unresolved: number };
  row: string | null;
  pick: (id: string) => void;
  toggle?: (id: string) => void;
};
type ZNode = Node<Data>;

function Ends() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

// Marks are the triangles drawn when lines are hidden: incoming on top,
// outgoing below, red when a pinned (violating) bundle rides them.
function Marks({ data }: { data: Data }) {
  const m = data.node.mark;
  if (!m) return null;
  const t = triangles(data.w, data.h);
  return (
    <svg className="marks" width={data.w} height={data.h} overflow="visible" aria-hidden="true">
      {m.in && <polygon points={t.in} className={m.inPinned ? "pinned" : undefined} />}
      {m.out && <polygon points={t.out} className={m.outPinned ? "pinned" : undefined} />}
    </svg>
  );
}

function Toggle({ data }: { data: Data }) {
  const { node, toggle } = data;
  if (!node.toggle || !toggle) return null;
  const open = node.toggle === "expand";
  return (
    <button
      type="button"
      className="toggle nodrag"
      aria-label={open ? `Open ${node.label} here` : `Close ${node.label}`}
      onClick={(e) => {
        e.stopPropagation();
        toggle(node.id);
      }}
    >
      {open ? "+" : "−"}
    </button>
  );
}

// cls: the shape, the Change View mark (04 Part B), selection and dimming.
const cls = (base: string, n: SceneNode, selected: boolean) =>
  `node ${base}${n.change ? ` ${n.change}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}`;

function BoxNode({ data, selected }: NodeProps<ZNode>) {
  const s = data.stats;
  return (
    <div className={cls("box", data.node, selected)} title={data.node.id}>
      <Ends />
      <Toggle data={data} />
      <div className="label">{data.node.label}</div>
      {s && (
        <div className="stats">
          {s.packages > 1 && `${s.packages} pkgs · `}
          {s.decls} decls{s.unresolved > 0 && ` · ${s.unresolved} unresolved`}
        </div>
      )}
      <Marks data={data} />
    </div>
  );
}

function ContainerNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("container", data.node, selected)} title={data.node.id}>
      <Ends />
      <Toggle data={data} />
      <div className="label">{data.node.label}</div>
      <Marks data={data} />
    </div>
  );
}

function OvalNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("oval", data.node, selected)} title={data.node.id}>
      <Ends />
      <div className="label">{data.node.label}</div>
      <Marks data={data} />
    </div>
  );
}

function OutsideNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("outside", data.node, selected)}>
      <Ends />
      <div className="label">{data.node.label}</div>
      <Marks data={data} />
    </div>
  );
}

function DeclNode({ data, selected }: NodeProps<ZNode>) {
  const { node } = data;
  return (
    <div className={cls("decl", node, selected)} title={node.id}>
      <Ends />
      <div className="label">{node.label}</div>
      {node.methods.map((r, i) => (
        <div
          key={r}
          className={`row ${node.rowMarks?.[i] ?? ""}${data.row === `${node.id}.${r}` ? " selected" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            data.pick(`${node.id}.${r}`);
          }}
        >
          .{r}
        </div>
      ))}
      <Marks data={data} />
    </div>
  );
}

function ChipNode({ data }: NodeProps<ZNode>) {
  return <div className={cls("chip", data.node, false)}>{data.node.label}</div>;
}

const nodeTypes = {
  container: ContainerNode,
  box: BoxNode,
  oval: OvalNode,
  outside: OutsideNode,
  decl: DeclNode,
  chip: ChipNode,
};

type Props = {
  view: View;
  sc: Scene;
  placed: Map<string, Placed>;
  edge?: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (node: SceneNode) => void;
  onToggle?: (id: string) => void;
  onEdge?: (id: string) => void;
  center?: { id: string; seq: number }; // a node to bring into view
};

// drawnFor is the drawn node standing for id: itself, its #pkg leaf, or the
// nearest enclosing box on the canvas.
function drawnFor(view: View, nodes: Map<string, SceneNode>, id: string): string | null {
  for (let b = id; b !== ""; b = parentBox(view, b)) {
    if (nodes.has(b)) return b;
    if (nodes.has(b + "#pkg")) return b + "#pkg";
  }
  return null;
}

// depth orders parents before children, as React Flow requires.
function depth(nodes: Map<string, SceneNode>, id: string): number {
  let d = 0;
  for (let p = nodes.get(id)?.parent; p; p = nodes.get(p)?.parent) d++;
  return d;
}

export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onEdge, center }: Props) {
  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
  const rf = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const target = center ? (sc.selected ?? drawnFor(view, byId, center.id)) : null;
  // Centre from the layout, not fitView: fitView waits for DOM-measured nodes,
  // and these are sized by the layout. The canvas is measured here, after the
  // commit that may have opened the panel beside it.
  useEffect(() => {
    const p = target === null ? undefined : placed.get(target);
    const at = target === null ? null : absolute(placed, target);
    const r = box.current?.getBoundingClientRect();
    if (!p || !at || !r || r.width === 0 || r.height === 0) return;
    const zoom = Math.min(1.2, (0.8 * r.width) / p.w, (0.8 * r.height) / p.h);
    void rf.setCenter(at.x + p.w / 2, at.y + p.h / 2, { zoom });
  }, [rf, target, placed, center?.seq]);
  const nodes: ZNode[] = [...sc.nodes]
    .sort((a, b) => depth(byId, a.id) - depth(byId, b.id) || (a.id < b.id ? -1 : 1))
    .map((node) => {
      const p = placed.get(node.id) ?? { x: 0, y: 0, w: 90, h: 40 };
      const stats = node.shape === "box" ? boxStats(view, node.id) : undefined;
      return {
        id: node.id,
        type: node.shape,
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        style: { width: p.w, height: p.h },
        ...(node.parent ? { parentId: node.parent, extent: "parent" as const } : {}),
        selected: node.selected,
        draggable: false,
        connectable: false,
        data: { node, w: p.w, h: p.h, stats, row: sc.selectedRow, pick: onSelect, toggle: onToggle },
      };
    });
  const rfEdges: Edge[] = sc.edges.map((e) => {
    const m = edgeMark(e.status);
    const label = [m.sign, e.pairs > 1 ? String(e.pairs) : ""].filter(Boolean).join(" ");
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      className: [m.cls, e.dim && "dim", e.hot && "hot", e.pinned && "pinned", e.id === edge && "selected"]
        .filter(Boolean)
        .join(" "),
      markerEnd: { type: MarkerType.ArrowClosed },
      ...(label ? { label } : {}),
    };
  });
  return (
    <div ref={box} className="flow">
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView={target === null}
        minZoom={0.05}
        zoomOnDoubleClick={false}
        onlyRenderVisibleElements
        onInit={() => performance.mark("zu-drawn")}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, n) => onSelect(n.id)}
        onNodeDoubleClick={(_, n) => {
          const node = byId.get(n.id);
          if (node) onOpen(node);
        }}
        onEdgeClick={(_, e) => onEdge?.(e.id)}
        onPaneClick={() => onSelect(null)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
````

**Replace `web/src/App.tsx` with:**

````tsx
import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import { changedSubgraph, nodeMark } from "./change";
import { parentBox } from "./cut";
import type { View } from "./data";
import { pageEngine } from "./engine";
import { Header } from "./Header";
import { elkGraph, positions, Superseded, type Placed } from "./layout";
import { Panel } from "./Panel";
import { scene, type SceneNode } from "./scene";
import { DEFAULT_STATE } from "./state";

const PKG = "#pkg";

function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <span className="swatch st-added">added</span>
      <span className="swatch st-removed">removed</span>
      <span className="swatch st-modified">modified</span>
      <span className="swatch st-moved">moved</span>
      <span className="swatch affected">affected</span>
      <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
    </div>
  );
}

// ChangedList is U11: the changed packages in the Structural Summary's
// bottom-up order, exactly as zu diff wrote them.
function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => void }) {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const ids = view.changed ?? [];
  return (
    <nav className="changed" aria-label="Changed packages">
      <h2>Changed packages ({ids.length})</h2>
      <ol>
        {ids.map((id) => {
          const n = byId.get(id);
          return (
            <li key={id}>
              <button type="button" className={`link ${n ? nodeMark(n) : ""}`} title={id} onClick={() => onPick(id)}>
                {id}
              </button>
              {n?.status && <span className="muted"> {n.status}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function App({ view: whole }: { view: View }) {
  const change = whole.kind === "change";
  const [full, setFull] = useState(false);
  // The Change View opens on the changed subgraph (Q4); U10 toggles to all of it.
  const view = useMemo(() => (change && !full ? changedSubgraph(whole) : whole), [whole, change, full]);
  const [focus, setFocus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
  const sc = useMemo(() => scene(view, { ...DEFAULT_STATE, focus, selected }), [view, focus, selected]);

  // One engine for the page's life; a layout runs only when its ELK input changes.
  const engine = useMemo(pageEngine, []);
  useEffect(() => () => engine.dispose(), [engine]);
  const graph = useMemo(() => JSON.stringify(elkGraph(sc)), [sc]);
  const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    performance.mark("zu-layout-start");
    engine.layout(JSON.parse(graph)).then(
      (out) => {
        performance.mark("zu-layout-end");
        setFailed(null);
        setPlaced({ graph, at: positions(out) });
      },
      (e: Error) => {
        if (!(e instanceof Superseded)) setFailed(e.message);
      },
    );
  }, [engine, graph]);

  const go = (box: string) => {
    setFocus(box);
    setSelected(null);
    setCenter(undefined);
  };
  const toggle = () => {
    setFull(!full);
    go("");
  };
  const pick = (id: string) => {
    setFocus("");
    setSelected(id);
    setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus !== "") go(parentBox(view, focus));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, focus]);

  const open = (n: SceneNode) => {
    if (n.shape === "box" || n.shape === "container") go(n.id);
  };
  const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
  const pkg = focus.endsWith(PKG) ? focus.slice(0, -PKG.length) : focus;

  return (
    <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
      <Header
        view={whole}
        focus={focus}
        boxes={boxes}
        depth={sc.depth}
        onFocus={go}
        full={change ? full : undefined}
        onToggle={toggle}
      />
      {change && <ChangedList view={whole} onPick={pick} />}
      <main className="canvas">
        {change && <Legend />}
        {sc.noDetail ? (
          <div className="empty">
            Declarations not included. Re-run with <code>-include {pkg}</code>
          </div>
        ) : failed !== null ? (
          <div className="empty" id="zu-status">
            Layout failed: {failed}
          </div>
        ) : placed && placed.graph === graph ? (
          <ReactFlowProvider key={focus}>
            <Canvas view={view} sc={sc} placed={placed.at} onSelect={setSelected} onOpen={open} center={center} />
          </ReactFlowProvider>
        ) : (
          <div className="empty" id="zu-status">
            Laying out…
          </div>
        )}
      </main>
      {selected && (
        <Panel
          view={whole}
          shown={view}
          focus={focus}
          depth={sc.depth}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
````

- [ ] **Shrink `tree.ts` to what the page imports; 04's tests take the rest from the test kit.**

**Replace `web/src/tree.ts` with:**

````ts
// 04's Package Tree names, now over cut.ts and bundle.ts (feature 05).
import type { View } from "./data";
import { packagesIn } from "./cut";

export { BOX_BUDGET, OUTSIDE, parentBox } from "./cut";
export { EXTERNALS } from "./bundle";

// boxStats sums the packages a box holds; a #pkg leaf holds only its package.
export function boxStats(view: View, box: string): { packages: number; decls: number; unresolved: number } {
  const s = { packages: 0, decls: 0, unresolved: 0 };
  for (const p of packagesIn(view, box)) {
    s.packages++;
    s.decls += p.decls ?? 0;
    s.unresolved += p.unresolved ?? 0;
  }
  return s;
}
````

**Edit `web/src/testkit.ts`:** replace

````ts
import type { View, ViewEdge, ViewNode } from "./data";
````

with

````ts
import type { View, ViewEdge, ViewNode } from "./data";
import { bundlesOver, externalsOf } from "./bundle";
import { cut } from "./cut";
````

**Append to `web/src/testkit.ts`:**

````ts

// 04's tree API (Task 3), kept for 04's tree tests once no page code needs it.
export const leavesAt = (v: View, focus: string, d: number): string[] => {
  const c = cut(v, focus, d);
  return c.noDetail ? [] : c.leaves;
};
export const containers = (v: View, focus: string, d: number) => {
  const c = cut(v, focus, d);
  return c.containers.map((id) => ({ id, parent: c.parent.get(id) ?? "" }));
};
export const bundles = (v: View, focus: string, d: number) =>
  bundlesOver(v, cut(v, focus, d)).map(({ from, to, pairs, status }) => ({ from, to, pairs, ...(status ? { status } : {}) }));
export const touchedExternals = (v: View, focus: string, d: number) => externalsOf(v, bundlesOver(v, cut(v, focus, d)));
export const declLeaves = (v: View, pkg: string) =>
  v.nodes.filter((n) => (n.kind === "type" || n.kind === "function") && n.parent === pkg).map((n) => n.id).sort();
export const methodsOf = (v: View, type: string) =>
  v.nodes.filter((n) => n.kind === "function" && n.parent === type).map((n) => n.id).sort();
````

**Edit `web/src/tree.test.ts`:** replace

````ts
import { autoDepth, boxStats, bundles, containers, touchedExternals, declLeaves, leavesAt, methodsOf, parentBox } from "./tree";
````

with

````ts
import { autoDepth } from "./cut";
import { boxStats, parentBox } from "./tree";
import { bundles, containers, declLeaves, leavesAt, methodsOf, touchedExternals } from "./testkit";
````

**Edit `web/src/tree.snapshot.test.ts`:** replace

````ts
import { boxStats, bundles, containers, leavesAt, touchedExternals } from "./tree";
````

with

````ts
import { bundles, containers, leavesAt, touchedExternals } from "./testkit";
import { boxStats } from "./tree";
````

**Edit `web/src/scene.snapshot.test.ts`:** replace

````ts
import { leavesAt } from "./tree";
````

with

````ts
import { leavesAt } from "./testkit";
````

**Edit `web/src/change.test.ts`:** replace

````ts
import { scene } from "./layout";
import { autoDepth, bundles } from "./tree";
````

with

````ts
import { autoDepth } from "./cut";
import { bundles } from "./testkit";
````

**Edit `web/src/change.test.ts`:** replace

````ts


describe("change scene", () => {
  it("opens changed packages onto their changed declarations and a chip", () => {
    const s = scene(v, "", autoDepth(v, ""));
    const store = s.items.find((i) => i.id === `${shop}store`);
    expect(store?.shape).toBe("container");
    expect(store?.mark).toBe("st-modified");
    const inStore = s.items.filter((i) => i.parent === `${shop}store`);
    expect(inStore.map((i) => i.label)).toEqual(["+10 unchanged", "Order", "ReadWriter", "Repo"]);
    const repo = inStore.find((i) => i.label === "Repo")!;
    expect(repo.rows).toEqual(["Get", "check"]);
    expect(repo.rowMarks).toEqual(["st-modified", "st-modified"]);
    expect(s.items.find((i) => i.id === "example.com/shop/tools/gen")?.mark).toBe("affected");
  });
  it("shows changed packages folded into a package box", () => {
    // At depth 1 the example.com/shop package box folds internal/checkout,
    // money and store, all changed; they must not vanish silently.
    const s = scene(v, "", 1);
    const chip = s.items.find((i) => i.parent === "example.com/shop" && i.shape === "chip" && i.label.includes("package"));
    expect(chip?.label).toBe("+3 changed packages");
    const full = { ...v, nodes: v.nodes.map((n) => (n.id === "example.com/shop" ? { ...n, status: undefined, detail: false } : n)) };
    const box = scene(full, "", 1).items.find((i) => i.id === "example.com/shop");
    expect(box?.shape).toBe("box");
    expect(box?.mark).toContain("has-change");
  });
});
````

with

````ts

````

- [ ] **Run — expect PASS:** `cd web && npx vitest run && npx tsc --noEmit && npm run build` → all pass, including `tree.snapshot`, `scene.snapshot`, 04's `tree.test`, `change.test` and `headline.test`.
- [ ] **Check in a browser:** `make build`, then open `zu export -html` of `testdata/shop` and a `zu diff -html`: the same boxes as before, double-click opens, Esc goes up, the changed list centres its pick.
- [ ] **Commit:** `git add web/src/layout.ts web/src/layout.test.ts web/src/engine.ts web/src/Canvas.tsx web/src/App.tsx web/src/tree.ts web/src/testkit.ts web/src/tree.test.ts web/src/tree.snapshot.test.ts web/src/scene.snapshot.test.ts web/src/change.test.ts && git commit -m "Draw the page from the scene"`

---

### Task 8: ELK in an inline Web Worker, and the CSP that allows it

**Files:**
- Modify: `web/embed_test.go`, `web/vite.config.ts`, `web/src/engine.ts` (replaced)

**Rules:** Deviation 4. The guard asserts Vite's inline-worker prelude `revokeObjectURL(self.location.href)`: 0 in the main-thread build, 1 with the worker (M7; `elk.bundled` and `new Worker` do not tell the two apart).

**Steps:**

- [ ] **Write the failing guard.**

**Edit `web/embed_test.go`:** replace

````go
	if !strings.Contains(page, "Content-Security-Policy") {
		t.Error("built page has no CSP")
	}
````

with

````go
	if !strings.Contains(page, "Content-Security-Policy") {
		t.Error("built page has no CSP")
	}
	if !strings.Contains(page, "worker-src blob:") {
		t.Error("CSP does not allow the inline layout worker (worker-src blob:)")
	}
	if !strings.Contains(page, "revokeObjectURL(self.location.href)") {
		t.Error("no inline worker in the page: ELK would lay out on the main thread")
	}
````

- [ ] **Run — expect FAIL:** `make build && go test ./web/ -run SelfContained` → `CSP does not allow the inline layout worker` and `no inline worker in the page`.
- [ ] **Implement.**

**Edit `web/vite.config.ts`:** replace

````ts
img-src data:; base-uri 'none'
````

with

````ts
img-src data:; worker-src blob:; base-uri 'none'
````

**Edit `web/vite.config.ts`:** replace

````ts
  build: { outDir: "dist", emptyOutDir: true },
````

with

````ts
  build: { outDir: "dist", emptyOutDir: true },
  // ELK's worker is built as a classic script and inlined as a blob: URL.
  worker: { format: "iife" },
````

**Replace `web/src/engine.ts` with:**

````ts
// The page's layout engine: ELK in an inline Web Worker (a blob: URL, allowed
// by the CSP's worker-src). A worker that cannot start fires an error event;
// that rejects the layout instead of leaving the page waiting.
import ELK from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker&inline";
import { superseding, type Stoppable } from "./layout";

function workerElk(): Stoppable {
  let fail: (e: Error) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  failed.catch(() => {});
  const elk = new ELK({
    workerFactory: () => {
      const w = new ElkWorker();
      w.addEventListener("error", (e) => fail(new Error(`layout worker failed: ${e.message || "blocked"}`)));
      return w;
    },
  });
  return { layout: (g) => Promise.race([elk.layout(g), failed]), terminateWorker: () => elk.terminateWorker() };
}

export const pageEngine = () => superseding(workerElk);
````

- [ ] **Run — expect PASS:** `make build && go test ./web/ -run SelfContained -v` → `--- PASS: TestBuiltPageIsSelfContained`; `grep -c 'revokeObjectURL(self.location.href)' web/dist/index.html` → 1.
- [ ] **Commit:** `git add web/embed_test.go web/vite.config.ts web/src/engine.ts && git commit -m "Lay out in an inline Web Worker"`

---

### Task 9: The view state drives the page

**Files:**
- Create: `web/src/useViewState.ts`
- Modify: `web/src/App.tsx` (replaced), `web/src/Header.tsx`, `web/src/headline.ts`, `web/src/headline.test.ts`, `web/src/scene.ts`, `web/src/scene.test.ts`, `web/src/styles.css`

**Rules:** the hash is read at start and on `hashchange` and written after every change (Deviation 5). Keys go through `keyAction`. Boxes get the in-place toggle. The depth note says "(chosen)" when the reader set the depth. A pick from the changed list shows the page root with the pick selected and centred, as in 04. The full-project toggle stays in memory, not in the hash. A Change View link whose `f=` names a box outside the changed subgraph turns the toggle on and draws the whole View at that focus, instead of an empty canvas.

**Steps:**

- [ ] **Write the failing test.**

**Edit `web/src/headline.test.ts`:** replace

````ts
    expect(depthNote(5, 3)).toBe("5 boxes at depth 3. Double-click to open a box, Esc to go up.");
````

with

````ts
    expect(depthNote(5, 3)).toBe("5 boxes at depth 3. Double-click to open a box, Esc to go up.");
    expect(depthNote(5, 2, false)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/headline.test.ts` → the note lacks "(chosen)".
- [ ] **Write the failing test** for a Change View link outside the changed subgraph.

**Edit `web/src/scene.test.ts`:** replace

````ts
import { knownIds, scene } from "./scene";
````

with

````ts
import { knownIds, openFull, scene } from "./scene";
import { changedSubgraph } from "./change";
````

**Edit `web/src/scene.test.ts`:** replace

````ts
  it("is independent of input order", () => {
````

with

````ts
  it("a Change View link focused outside the changed subgraph opens the whole View (U10)", () => {
    const ch = { ...v, kind: "change" as const, nodes: v.nodes.map((n) => (n.id === "m/api" ? { ...n, status: "modified" } : n)) };
    const sub = changedSubgraph(ch);
    expect(["", "m/api", "m/core", "m/lone"].map((f) => openFull(sub, f))).toEqual([false, false, true, true]);
  });
  it("is independent of input order", () => {
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/scene.test.ts` → `openFull` is not exported.
- [ ] **Implement.**

**Edit `web/src/headline.ts`:** replace

````ts
export function depthNote(boxes: number, depth: number): string {
  const note = `${boxes} boxes at depth ${depth}. Double-click to open a box, Esc to go up.`;
````

with

````ts
// auto is false when the reader chose the depth (A6), which the note says.
export function depthNote(boxes: number, depth: number, auto = true): string {
  const note = `${boxes} boxes at depth ${depth}${auto ? "" : " (chosen)"}. Double-click to open a box, Esc to go up.`;
````

**Edit `web/src/Header.tsx`:** replace

````tsx
  onFocus: (box: string) => void;
  full?: boolean;
````

with

````tsx
  onFocus: (box: string) => void;
  auto: boolean; // the depth is autoDepth's, not the reader's
  full?: boolean;
````

**Edit `web/src/Header.tsx`:** replace

````tsx
export function Header({ view, focus, boxes, depth, onFocus, full, onToggle }: Props) {
````

with

````tsx
export function Header({ view, focus, boxes, depth, onFocus, auto, full, onToggle }: Props) {
````

**Edit `web/src/Header.tsx`:** replace

````tsx
        {depthNote(boxes, depth)}
````

with

````tsx
        {depthNote(boxes, depth, auto)}
````

**Edit `web/src/scene.ts`:** replace

````ts
  node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
});
````

with

````ts
  node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
});

// openFull says a Change View focus (from a link) lies outside the changed
// subgraph, so the page opens the whole View at that focus (U10) rather than
// an empty canvas.
export const openFull = (sub: View, focus: string): boolean => !knownIds(sub).box(focus);
````

**Create `web/src/useViewState.ts`:**

````ts
// The view state of the page, kept in the URL hash (Deviation 5): read once at
// start, written after every change, and read again when the reader edits or
// pastes a link (hashchange).
import { useEffect, useMemo, useState } from "react";
import type { View } from "./data";
import { knownIds } from "./scene";
import { decodeHash, storeHash, type ViewState } from "./state";

export function useViewState(view: View): [ViewState, (next: (s: ViewState) => ViewState) => void] {
  const known = useMemo(() => knownIds(view), [view]);
  const [state, setState] = useState(() => decodeHash(window.location.hash, known));
  useEffect(() => {
    storeHash(window.location, window.history, state);
  }, [state]);
  useEffect(() => {
    const onHash = () => setState(decodeHash(window.location.hash, known));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [known]);
  return [state, setState];
}
````

**Replace `web/src/App.tsx` with:**

````tsx
import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import { changedSubgraph, nodeMark } from "./change";
import { parentBox } from "./cut";
import type { View } from "./data";
import { pageEngine } from "./engine";
import { Header } from "./Header";
import { keyAction } from "./keys";
import { elkGraph, positions, Superseded, type Placed } from "./layout";
import { Panel } from "./Panel";
import { openFull, scene, type SceneNode } from "./scene";
import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
import { useViewState } from "./useViewState";

const PKG = "#pkg";

function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <span className="swatch st-added">added</span>
      <span className="swatch st-removed">removed</span>
      <span className="swatch st-modified">modified</span>
      <span className="swatch st-moved">moved</span>
      <span className="swatch affected">affected</span>
      <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
    </div>
  );
}

// ChangedList is U11: the changed packages in the Structural Summary's
// bottom-up order, exactly as zu diff wrote them.
function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => void }) {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const ids = view.changed ?? [];
  return (
    <nav className="changed" aria-label="Changed packages">
      <h2>Changed packages ({ids.length})</h2>
      <ol>
        {ids.map((id) => {
          const n = byId.get(id);
          return (
            <li key={id}>
              <button type="button" className={`link ${n ? nodeMark(n) : ""}`} title={id} onClick={() => onPick(id)}>
                {id}
              </button>
              {n?.status && <span className="muted"> {n.status}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function App({ view: whole }: { view: View }) {
  const change = whole.kind === "change";
  const [state, update] = useViewState(whole);
  // The Change View opens on the changed subgraph (Q4); U10 toggles to all of
  // it. A link whose focus lies outside the subgraph opens all of it, at that
  // focus: from the start, and on a later hashchange.
  const [full, setFull] = useState(() => change && openFull(changedSubgraph(whole), state.focus));
  const view = useMemo(() => (change && !full ? changedSubgraph(whole) : whole), [whole, change, full]);
  useEffect(() => {
    if (change && !full && openFull(view, state.focus)) setFull(true);
  }, [change, full, view, state.focus]);
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
  const sc = useMemo(() => scene(view, state), [view, state]);

  // One engine for the page's life; a layout runs only when its ELK input
  // changes, so selecting and dimming never lay out again.
  const engine = useMemo(pageEngine, []);
  useEffect(() => () => engine.dispose(), [engine]);
  const graph = useMemo(() => JSON.stringify(elkGraph(sc)), [sc]);
  const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    performance.mark("zu-layout-start");
    engine.layout(JSON.parse(graph)).then(
      (out) => {
        performance.mark("zu-layout-end");
        setFailed(null);
        setPlaced({ graph, at: positions(out) });
      },
      (e: Error) => {
        if (!(e instanceof Superseded)) setFailed(e.message);
      },
    );
  }, [engine, graph]);

  const go = (box: string) => {
    update((s) => drill(s, box));
    setCenter(undefined);
  };
  const flip = () => {
    setFull(!full);
    go("");
  };
  // A pick from the changed list (U11) shows the page root with it selected and centred.
  const pick = (id: string) => {
    update((s) => ({ ...drill(s, ""), selected: id }));
    setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction(e.key, {
        searchOpen: false,
        selected: state.selected !== null,
        atRoot: state.focus === "",
        typing: e.target instanceof HTMLInputElement,
        mod: e.metaKey || e.ctrlKey || e.altKey,
      });
      if (a === "clearSelection") update((s) => select(s, null));
      else if (a === "up") update((s) => up(s, parentBox(view, s.focus)));
      else if (a === "declutter") update((s) => ({ ...s, stage: nextStage(s.stage) }));
      else if (a === "deeper") update((s) => deeper(s, sc.depth));
      else if (a === "shallower") update((s) => shallower(s, sc.depth));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, state, sc.depth, update]);

  const open = (n: SceneNode) => {
    if (n.shape === "box" || n.shape === "container") go(n.id);
  };
  const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
  const pkg = state.focus.endsWith(PKG) ? state.focus.slice(0, -PKG.length) : state.focus;

  return (
    <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
      <Header
        view={whole}
        focus={state.focus}
        boxes={boxes}
        depth={sc.depth}
        auto={state.depth === null}
        onFocus={go}
        full={change ? full : undefined}
        onToggle={flip}
      />
      {change && <ChangedList view={whole} onPick={pick} />}
      <main className="canvas">
        {change && <Legend />}
        {sc.noDetail ? (
          <div className="empty">
            Declarations not included. Re-run with <code>-include {pkg}</code>
          </div>
        ) : failed !== null ? (
          <div className="empty" id="zu-status">
            Layout failed: {failed}
          </div>
        ) : placed && placed.graph === graph ? (
          <ReactFlowProvider key={`${state.focus}\n${sc.depth}`}>
            <Canvas
              view={view}
              sc={sc}
              placed={placed.at}
              onSelect={(id) => update((s) => select(s, id))}
              onOpen={open}
              onToggle={(id) => update((s) => toggle(s, id))}
              center={center}
            />
          </ReactFlowProvider>
        ) : (
          <div className="empty" id="zu-status">
            Laying out…
          </div>
        )}
      </main>
      {state.selected && (
        <Panel
          view={whole}
          shown={view}
          focus={state.focus}
          depth={sc.depth}
          id={state.selected}
          onClose={() => update((s) => select(s, null))}
        />
      )}
    </div>
  );
}
````

**Edit `web/src/styles.css`:** replace

````css
  --del-bg: #ffebe9;
````

with

````css
  --del-bg: #ffebe9;
  --pin: #cf222e; /* a pinned (violating) edge, 06 */
````

**Edit `web/src/styles.css`:** replace

````css
    --del-bg: #3d1a1c;
````

with

````css
    --del-bg: #3d1a1c;
    --pin: #ff7b72;
````

**Append to `web/src/styles.css`:**

````css


/* Feature 05: selection, dimming, toggles and uml-viewer's triangles. The
   marks sit outside the box; .node is not positioned, so its overflow does not clip them. */
.node.dim,
.react-flow__edge.dim {
  opacity: 0.25;
}

.react-flow__edge.hot path,
.react-flow__edge.selected path {
  stroke-width: 2;
}

/* A changed edge keeps its Change View colour when lit. */
.react-flow__edge.hot:not(.edge-added, .edge-removed, .edge-reversed, .edge-mixed) path,
.react-flow__edge.selected:not(.edge-added, .edge-removed, .edge-reversed, .edge-mixed) path {
  stroke: var(--accent);
}

.react-flow__edge.pinned path {
  stroke: var(--pin);
}

.node .toggle {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--box-border);
  border-radius: 3px;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
  line-height: 14px;
  cursor: pointer;
}

.node .marks {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}

.node .marks polygon {
  fill: var(--muted);
}

.node .marks polygon.pinned {
  fill: var(--pin);
}

.row.selected {
  background: var(--mark);
}
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Check in a browser:** select a box (its neighbours stay lit), press `d` five times (full → arrows → triangles → elements → classes → full), `+`/`−`, reload: the hash brings the same view back. On a Change View, a link with `f=` naming an unchanged package far from the change opens the whole project at that package.
- [ ] **Commit:** `git add web/src/useViewState.ts web/src/App.tsx web/src/Header.tsx web/src/headline.ts web/src/headline.test.ts web/src/scene.ts web/src/scene.test.ts web/src/styles.css && git commit -m "Keep the view in the URL hash and wire selection, toggles and keys"`

---

### Task 10: Side panel, full (U5)

**Files:**
- Modify: `web/src/Panel.tsx`, `web/src/App.tsx`

**Rules:** build on 04's panel (addendum T13): every id it lists becomes a link that reveals, selects and centres its target (`jump`), leaving the changed subgraph when the target is outside it. Clicking an edge shows the edge's member IR edges, each with its status and source link. An aggregate lists the member ends of the scene's bundles. The selected edge is kept in `App`, not in the hash, because its id changes with depth. 04's Change section and hunks stay.

**Steps:**

- [ ] **Implement** (the logic is `reveal`, `targets` and `scene`, tested in Tasks 3, 5 and 6).

**Edit `web/src/Panel.tsx`:** replace

````tsx
import { bundlesOver } from "./bundle";
import { cut } from "./cut";
import type { Hunk, Loc, View, ViewNode } from "./data";
import { calls, imports, targets, type Row } from "./facts";
import { linkFor } from "./links";
import { EXTERNALS, OUTSIDE, boxStats } from "./tree";
````

with

````tsx
import type { Bundle } from "./bundle";
import type { Hunk, Loc, View, ViewNode } from "./data";
import { calls, imports, targets, type Row } from "./facts";
import { linkFor } from "./links";
import type { SceneEdge } from "./scene";
import { EXTERNALS, OUTSIDE, boxStats } from "./tree";
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
type Props = {
  view: View; // the whole View: facts list every edge
  shown?: View; // what the canvas draws, for aggregate targets (default view)
  focus: string;
  depth: number;
  id: string;
  onClose: () => void;
};

function Rows({ title, rows }: { title: string; rows: Row[] }) {
````

with

````tsx
// The panel shows a selected node (id) or a selected bundle edge. Every id it
// lists is a link: reveal draws and selects it (U5, full).
type Props = {
  view: View; // the whole View: facts list every edge
  id: string | null;
  edge: SceneEdge | null;
  bundles: Bundle[]; // the scene's bundles: an aggregate's real targets come from them
  onReveal: (id: string) => void;
  onClose: () => void;
};

function Rows({ title, rows, onReveal }: { title: string; rows: Row[]; onReveal: (id: string) => void }) {
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
            <li key={r.id}>
              <code>{r.id}</code>
              {r.count > 1 && <span className="muted"> ×{r.count}</span>}
````

with

````tsx
            <li key={r.id}>
              <button type="button" className="link" onClick={() => onReveal(r.id)}>
                <code>{r.id}</code>
              </button>
              {r.count > 1 && <span className="muted"> ×{r.count}</span>}
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
export function Panel({ view, shown, focus, depth, id, onClose }: Props) {
  const node = view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
  let body: React.ReactNode;
  if (id === OUTSIDE || id === EXTERNALS) {
    body = <Rows title={id === OUTSIDE ? "Packages outside this box" : "External modules"} rows={targets(bundlesOver(shown ?? view, cut(shown ?? view, focus, depth)), id)} />;
  } else if
````

with

````tsx
// Members lists the IR edges a bundle carries, each with where it is written.
function Members({ view, edge, onReveal }: { view: View; edge: SceneEdge; onReveal: (id: string) => void }) {
  return (
    <section>
      <h3>
        {edge.pairs} {edge.pairs === 1 ? "pair" : "pairs"} ({edge.members.length} edges)
      </h3>
      <ul className="rows">
        {edge.members.map((m, i) => (
          <li key={i}>
            <button type="button" className="link" onClick={() => onReveal(m.from)}>
              <code>{m.from}</code>
            </button>
            {` ${m.kind} `}
            <button type="button" className="link" onClick={() => onReveal(m.to)}>
              <code>{m.to}</code>
            </button>
            {m.count > 1 && <span className="muted"> ×{m.count}</span>}
            {m.status && <span className={`muted edge-${m.status}`}> {m.status}</span>}
            <Where view={view} loc={m.loc} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Panel({ view, id, edge, bundles, onReveal, onClose }: Props) {
  const title = edge ? `${edge.from} → ${edge.to}` : (id ?? "");
  const node = id === null ? undefined : view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
  let body: React.ReactNode;
  if (edge) {
    body = <Members view={view} edge={edge} onReveal={onReveal} />;
  } else if (id === OUTSIDE || id === EXTERNALS) {
    body = (
      <Rows
        title={id === OUTSIDE ? "Packages outside this box" : "External modules"}
        rows={targets(bundles, id)}
        onReveal={onReveal}
      />
    );
  } else if
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
        <Rows title="Calls and embeds out" rows={c.out} />
        <Rows title="Called or embedded by" rows={c.in} />
````

with

````tsx
        <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} />
        <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} />
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
        <Rows title="Imported by" rows={imports(view, node.id).in} />
      </>
    );
  } else {
````

with

````tsx
        <Rows title="Imported by" rows={imports(view, node.id).in} onReveal={onReveal} />
      </>
    );
  } else if (id !== null) {
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
        <Rows title="Imports" rows={f.out} />
        <Rows title="Imported by" rows={f.in} />
````

with

````tsx
        <Rows title="Imports" rows={f.out} onReveal={onReveal} />
        <Rows title="Imported by" rows={f.in} onReveal={onReveal} />
````

**Edit `web/src/Panel.tsx`:** replace

````tsx
        <code className="id">{id}</code>
````

with

````tsx
        <code className="id">{title}</code>
````

**Edit `web/src/App.tsx`:** replace

````tsx
import { Panel } from "./Panel";
````

with

````tsx
import { Panel } from "./Panel";
import { reveal } from "./search";
````

**Edit `web/src/App.tsx`:** replace

````tsx
  const sc = useMemo(() => scene(view, state), [view, state]);
````

with

````tsx
  const sc = useMemo(() => scene(view, state), [view, state]);
  // A selected bundle edge lives here, not in the hash: its id changes with depth.
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const edge = sc.edges.find((e) => e.id === edgeId) ?? null;
  const choose = (id: string | null) => {
    setEdgeId(null);
    update((s) => select(s, id));
  };
  // jump draws, selects and centres id (U5, A9), leaving the changed subgraph
  // when id is outside it.
  const jump = (id: string) => {
    setEdgeId(null);
    if (change && !full && !view.nodes.some((n) => n.id === id)) setFull(true);
    update((s) => reveal(whole, id, s));
    setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
  };
````

**Edit `web/src/App.tsx`:** replace

````tsx
      if (a === "clearSelection") update((s) => select(s, null));
````

with

````tsx
      if (a === "clearSelection") choose(null);
````

**Edit `web/src/App.tsx`:** replace

````tsx
              onSelect={(id) => update((s) => select(s, id))}
````

with

````tsx
              edge={edgeId}
              onSelect={choose}
              onEdge={(id) => {
                setEdgeId(id);
                update((s) => select(s, null));
              }}
````

**Edit `web/src/App.tsx`:** replace

````tsx
      {state.selected && (
        <Panel
          view={whole}
          shown={view}
          focus={state.focus}
          depth={sc.depth}
          id={state.selected}
          onClose={() => update((s) => select(s, null))}
        />
      )}
````

with

````tsx
      {(state.selected !== null || edge !== null) && (
        <Panel
          view={whole}
          id={state.selected}
          edge={edge}
          bundles={sc.bundles}
          onReveal={jump}
          onClose={() => choose(null)}
        />
      )}
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Check in a browser:** click a bundle → its members; click a member id → the canvas goes there and centres it; on a Change View, a member outside the subgraph switches to the full project.
- [ ] **Commit:** `git add web/src/Panel.tsx web/src/App.tsx && git commit -m "Link every id in the side panel and show bundle members"`

---

### Task 11: Toolbar, search box and the rest of the keys

**Files:**
- Create: `web/src/Toolbar.tsx`, `web/src/SearchBox.tsx`
- Modify: `web/src/App.tsx`, `web/src/Canvas.tsx`, `web/src/styles.css`

**Rules:** one control per `ViewState` field, each calling one tested transition. The search box lists `search()` hits; Enter or a click calls `jump`, which centres the target the way the changed list does (A9). `/` focuses the box, Esc closes it first, `f` fits the view. The component file is `SearchBox.tsx`: `Search.tsx` would clash with `search.ts` on a case-insensitive disk.

**Steps:**

- [ ] **Implement.**

**Create `web/src/Toolbar.tsx`:**

````tsx
import { deeper, LABELS, LIMITS, nextStage, shallower, type ViewState } from "./state";

type Props = { state: ViewState; depth: number; update: (next: (s: ViewState) => ViewState) => void };

// Toolbar: one control per ViewState field; each calls one state change.
export function Toolbar({ state, depth, update }: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="View">
      <span>
        depth{" "}
        <button type="button" aria-label="One level shallower (-)" onClick={() => update((s) => shallower(s, depth))}>
          −
        </button>{" "}
        {depth}
        {state.depth === null ? " (auto)" : ""}{" "}
        <button type="button" aria-label="One level deeper (+)" onClick={() => update((s) => deeper(s, depth))}>
          +
        </button>{" "}
        <button
          type="button"
          disabled={state.depth === null}
          onClick={() => update((s) => ({ ...s, depth: null, toggled: [] }))}
        >
          auto
        </button>
      </span>
      <label>
        hops{" "}
        <select
          value={state.hops ?? ""}
          disabled={state.selected === null}
          onChange={(e) => update((s) => ({ ...s, hops: e.target.value ? Number(e.target.value) : null }))}
        >
          <option value="">off</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      <button type="button" title="Next declutter stage (d)" onClick={() => update((s) => ({ ...s, stage: nextStage(s.stage) }))}>
        {LABELS[state.stage]}
      </button>
      <label>
        <input type="checkbox" checked={!state.lines} onChange={(e) => update((s) => ({ ...s, lines: !e.target.checked }))} />{" "}
        hide edges
      </label>
      <label>
        min pairs{" "}
        <input
          type="number"
          min={1}
          max={LIMITS.minPairs}
          value={state.minPairs}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1 && n <= LIMITS.minPairs) update((s) => ({ ...s, minPairs: n }));
          }}
        />
      </label>
      <label>
        <input type="checkbox" checked={state.externals} onChange={(e) => update((s) => ({ ...s, externals: e.target.checked }))} />{" "}
        externals
      </label>
    </div>
  );
}
````

**Create `web/src/SearchBox.tsx`:**

````tsx
import { useMemo, useState, type RefObject } from "react";
import type { View } from "./data";
import { search } from "./search";

type Props = {
  view: View;
  input: RefObject<HTMLInputElement | null>;
  onOpen: (open: boolean) => void;
  onPick: (id: string) => void;
};

// Search (U8/A9): up to 20 hits; ↑ ↓ move, Enter or a click picks. Esc is the
// page's key map (keys.ts): it closes the list before anything else.
export function SearchBox({ view, input, onOpen, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const hits = useMemo(() => search(view, query), [view, query]);
  const pick = (id: string) => {
    setQuery("");
    input.current?.blur();
    onPick(id);
  };
  return (
    <div className="search">
      <input
        ref={input}
        type="search"
        placeholder="Search (/)"
        aria-label="Search nodes"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAt(0);
        }}
        onFocus={() => onOpen(true)}
        onBlur={() => onOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setAt((i) => Math.min(i + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setAt((i) => Math.max(i - 1, 0));
          else if (e.key === "Enter" && hits[at]) pick(hits[at].id);
          else return;
          e.preventDefault();
        }}
      />
      {hits.length > 0 && (
        <ul className="hits" role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === at}
              className={i === at ? "at" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h.id);
              }}
            >
              {h.name} <span className="muted">{h.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
````

**Edit `web/src/Canvas.tsx`:** replace

````tsx
  center?: { id: string; seq: number }; // a node to bring into view
};
````

with

````tsx
  center?: { id: string; seq: number }; // a node to bring into view
  fit?: number; // fits the whole scene each time it changes (the f key)
};
````

**Edit `web/src/Canvas.tsx`:** replace

````tsx
export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onEdge, center }: Props) {
````

with

````tsx
export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onEdge, center, fit }: Props) {
````

**Edit `web/src/Canvas.tsx`:** replace

````tsx
  }, [rf, target, placed, center?.seq]);
````

with

````tsx
  }, [rf, target, placed, center?.seq]);
  useEffect(() => {
    if (fit) void rf.fitView();
  }, [rf, fit]);
````

**Edit `web/src/App.tsx`:** replace

````tsx
import { useEffect, useMemo, useState } from "react";
````

with

````tsx
import { useEffect, useMemo, useRef, useState } from "react";
````

**Edit `web/src/App.tsx`:** replace

````tsx
import { reveal } from "./search";
````

with

````tsx
import { reveal } from "./search";
import { SearchBox } from "./SearchBox";
````

**Edit `web/src/App.tsx`:** replace

````tsx
import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
````

with

````tsx
import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
import { Toolbar } from "./Toolbar";
````

**Edit `web/src/App.tsx`:** replace

````tsx
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
````

with

````tsx
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
  const searchBox = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fit, setFit] = useState(0);
````

**Edit `web/src/App.tsx`:** replace

````tsx
        searchOpen: false,
````

with

````tsx
        searchOpen,
````

**Edit `web/src/App.tsx`:** replace

````tsx
      if (a === "clearSelection") choose(null);
````

with

````tsx
      if (a === "search") {
        e.preventDefault();
        searchBox.current?.focus();
      } else if (a === "closeSearch") searchBox.current?.blur();
      else if (a === "fit") setFit((n) => n + 1);
      else if (a === "clearSelection") choose(null);
````

**Edit `web/src/App.tsx`:** replace

````tsx
  }, [view, state, sc.depth, update]);
````

with

````tsx
  }, [view, state, sc.depth, update, searchOpen]);
````

**Edit `web/src/App.tsx`:** replace

````tsx
      {change && <ChangedList view={whole} onPick={pick} />}
````

with

````tsx
      <div className="bar">
        <Toolbar state={state} depth={sc.depth} update={update} />
        <SearchBox view={whole} input={searchBox} onOpen={setSearchOpen} onPick={jump} />
      </div>
      {change && <ChangedList view={whole} onPick={pick} />}
````

**Edit `web/src/App.tsx`:** replace

````tsx
              center={center}
````

with

````tsx
              center={center}
              fit={fit}
````

**Edit `web/src/styles.css`:** replace

````css
  grid-template-rows: auto 1fr;
````

with

````css
  grid-template-rows: auto auto 1fr;
````

**Edit `web/src/styles.css`:** replace

````css
.canvas {
  grid-row: 2;
````

with

````css
.canvas {
  grid-row: 3;
````

**Edit `web/src/styles.css`:** replace

````css
.panel {
  grid-row: 2;
````

with

````css
.panel {
  grid-row: 3;
````

**Edit `web/src/styles.css`:** replace

````css
.changed {
  grid-row: 2;
````

with

````css
.changed {
  grid-row: 3;
````

**Append to `web/src/styles.css`:**

````css


.bar {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  padding: 4px 12px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
}

.toolbar input[type="number"] {
  width: 4em;
}

.search {
  position: relative;
  margin-left: auto;
}

.search .hits {
  position: absolute;
  right: 0;
  z-index: 10;
  min-width: 320px;
  max-height: 60vh;
  overflow: auto;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  background: var(--bg);
  border: 1px solid var(--line);
}

.search .hits li {
  padding: 2px 8px;
  cursor: pointer;
}

.search .hits li.at {
  background: var(--mark);
}
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Check in a browser:** `/`, type `Repo.Get`, Enter → focus `store`, the `.Get` row selected and centred, hash `#f=…store&s=…Repo.Get`; `d` → the stage button reads "Declutter arrows"; reload keeps it.
- [ ] **Commit:** `git add web/src/Toolbar.tsx web/src/SearchBox.tsx web/src/App.tsx web/src/Canvas.tsx web/src/styles.css && git commit -m "Add the toolbar and the search box"`

---

### Task 12: Large views collapse to a depth that fits

**Files:**
- Modify: `web/src/scene.ts`, `web/src/scene.test.ts`, `web/src/headline.ts`, `web/src/headline.test.ts`, `web/src/Header.tsx`, `web/src/App.tsx`, `web/src/styles.css`

**Rules:** Deviation 8. The requested depth stays in the hash; the page draws the deepest depth that fits and says so in a notice, never a browser dialog. The card appears only when even depth 1 is over the limit. "Draw depth M anyway" and "Draw anyway" hold for the current graph only and draw the requested depth. The header says "depth N (collapsed from M)", never "(chosen)", while the drawn depth differs from the requested one. `+` and `−` already start from the drawn depth (Task 1's `deeper`/`shallower`), so `+` on a collapsed view requests drawn + 1.

**Steps:**

- [ ] **Write the failing test.**

**Edit `web/src/scene.test.ts`:** replace

````ts
import { knownIds, openFull, scene } from "./scene";
````

with

````ts
import { DRAW_LIMIT, fitDepth, knownIds, openFull, scene, tooBig } from "./scene";
````

**Edit `web/src/scene.test.ts`:** replace

````ts
  it("is independent of input order", () => {
````

with

````ts
  it("limits a layout to 2,000 nodes or 500 drawn edges (Deviation 8)", () => {
    const big = (nodes: number, edges: number, lines = true) =>
      tooBig({ nodes: Array(nodes).fill(null), edges: Array(edges).fill(null), lines });
    expect(DRAW_LIMIT).toEqual({ nodes: 2000, edges: 500 });
    expect([big(2000, 500), big(2001, 0), big(10, 501), big(10, 501, false)]).toEqual([false, true, true, false]);
    expect(tooBig(at({ depth: 2 }))).toBe(false);
  });
  it("draws the deepest depth that fits, or asks when even depth 1 does not (Deviation 8)", () => {
    const sized = (edges: number[]) => (depth: number) =>
      ({ depth, nodes: [], edges: Array(edges[depth - 1]).fill(null), lines: true });
    const k8s = sized([184, 379, 505, 1712]);
    expect(fitDepth(k8s(4), k8s)).toBe(2);
    expect(fitDepth(k8s(2), k8s)).toBe(2);
    expect(fitDepth({ ...k8s(4), lines: false }, k8s)).toBe(4);
    const huge = sized([600, 900]);
    expect(fitDepth(huge(2), huge)).toBeNull();
    const tight = { nodes: 2000, edges: 2 };
    expect([1, 2].map((d) => at({ depth: d }).edges.length)).toEqual([1, 3]);
    expect(fitDepth(at({ depth: 2 }), (d) => at({ depth: d }), tight)).toBe(1);
  });
  it("is independent of input order", () => {
````

**Edit `web/src/headline.test.ts`:** replace

````ts
    expect(depthNote(5, 2, false)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
````

with

````ts
    expect(depthNote(5, 2, false)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
    expect(depthNote(5, 2, false, 4)).toBe("5 boxes at depth 2 (collapsed from 4). Double-click to open a box, Esc to go up.");
    expect(depthNote(5, 2, false, 2)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
````

- [ ] **Run — expect FAIL:** `cd web && npx vitest run src/scene.test.ts src/headline.test.ts` → `DRAW_LIMIT`, `tooBig` and `fitDepth` are not exported, and the note lacks "(collapsed from 4)".
- [ ] **Implement.**

**Edit `web/src/scene.ts`:** replace

````ts
// knownIds says which ids
````

with

````ts
// DRAW_LIMIT is the most the page lays out at once (Deviation 8): ELK's time
// grows with the edges it routes, and hidden lines are not laid out.
export const DRAW_LIMIT = { nodes: 2000, edges: 500 };
type Sized = { nodes: readonly unknown[]; edges: readonly unknown[]; lines: boolean };
export const tooBig = (sc: Sized, limit = DRAW_LIMIT): boolean =>
  sc.nodes.length > limit.nodes || (sc.lines && sc.edges.length > limit.edges);

// fitDepth is the depth to draw for the requested scene (Deviation 8): its own
// when it fits, else the deepest shallower depth that does, as at() draws it;
// null when even depth 1 is too big and the reader has to choose.
export function fitDepth(requested: Sized & { depth: number }, at: (depth: number) => Sized, limit = DRAW_LIMIT): number | null {
  if (!tooBig(requested, limit)) return requested.depth;
  for (let d = requested.depth - 1; d >= 1; d--) if (!tooBig(at(d), limit)) return d;
  return null;
}

// knownIds says which ids
````

**Edit `web/src/App.tsx`:** replace

````tsx
import { openFull, scene, type SceneNode } from "./scene";
````

with

````tsx
import { DRAW_LIMIT, fitDepth, openFull, scene, type SceneNode } from "./scene";
````

**Edit `web/src/App.tsx`:** replace

````tsx
  const sc = useMemo(() => scene(view, state), [view, state]);
````

with

````tsx
  const requested = useMemo(() => scene(view, state), [view, state]);
  // A view over DRAW_LIMIT draws the deepest depth that fits and says so; only
  // when even depth 1 is too big does the reader choose (Deviation 8).
  // "Draw depth M anyway" holds for this graph only.
  const wanted = useMemo(() => JSON.stringify(elkGraph(requested)), [requested]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const fitted = useMemo(() => {
    if (confirmed === wanted) return requested;
    const d = fitDepth(requested, (depth) => scene(view, { ...state, depth }));
    return d === null ? null : d === requested.depth ? requested : scene(view, { ...state, depth: d });
  }, [confirmed, wanted, requested, view, state]);
  const sc = fitted ?? requested;
  const ask = fitted === null;
````

**Edit `web/src/App.tsx`:** replace

````tsx
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    performance.mark("zu-layout-start");
````

with

````tsx
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (ask) return;
    performance.mark("zu-layout-start");
````

**Edit `web/src/App.tsx`:** replace

````tsx
  }, [engine, graph]);
````

with

````tsx
  }, [engine, graph, ask]);
````

**Edit `web/src/App.tsx`:** replace

````tsx
        {change && <Legend />}
````

with

````tsx
        {change && <Legend />}
        {sc !== requested && (
          <div className="notice" id="zu-notice" role="status">
            Collapsed to depth {sc.depth}: depth {requested.depth} has{" "}
            {requested.lines && requested.edges.length > DRAW_LIMIT.edges
              ? `${requested.edges.length} edges`
              : `${requested.nodes.length} boxes`}{" "}
            <button type="button" onClick={() => setConfirmed(wanted)}>
              Draw depth {requested.depth} anyway
            </button>{" "}
            <button type="button" onClick={() => update((s) => ({ ...s, lines: false }))}>
              Hide edges
            </button>
          </div>
        )}
````

**Edit `web/src/App.tsx`:** replace

````tsx
        ) : failed !== null ? (
````

with

````tsx
        ) : ask ? (
          <div className="empty ask" id="zu-status">
            <p>
              Even depth 1 is too big to lay out quickly. Draw {sc.nodes.length} boxes and{" "}
              {sc.lines ? sc.edges.length : 0} edges at depth {sc.depth}? Layout may take minutes.
            </p>
            <button type="button" onClick={() => update((s) => ({ ...s, lines: false }))}>
              Hide edges
            </button>{" "}
            {state.focus !== "" && (
              <button type="button" onClick={() => update((s) => up(s, parentBox(view, s.focus)))}>
                Go back one level
              </button>
            )}{" "}
            <button type="button" onClick={() => setConfirmed(wanted)}>
              Draw anyway
            </button>
          </div>
        ) : failed !== null ? (
````

**Edit `web/src/headline.ts`:** replace

````ts
// auto is false when the reader chose the depth (A6), which the note says.
export function depthNote(boxes: number, depth: number, auto = true): string {
  const note = `${boxes} boxes at depth ${depth}${auto ? "" : " (chosen)"}. Double-click to open a box, Esc to go up.`;
````

with

````ts
// auto is false when the reader chose the depth (A6), which the note says.
// from is the requested depth; when a large view was drawn shallower
// (Deviation 8), the note says that instead.
export function depthNote(boxes: number, depth: number, auto = true, from = depth): string {
  const how = from !== depth ? ` (collapsed from ${from})` : auto ? "" : " (chosen)";
  const note = `${boxes} boxes at depth ${depth}${how}. Double-click to open a box, Esc to go up.`;
````

**Edit `web/src/Header.tsx`:** replace

````tsx
  auto: boolean; // the depth is autoDepth's, not the reader's
````

with

````tsx
  auto: boolean; // the depth is autoDepth's, not the reader's
  from?: number; // the requested depth, when the drawn one is shallower (Deviation 8)
````

**Edit `web/src/Header.tsx`:** replace

````tsx
export function Header({ view, focus, boxes, depth, onFocus, auto, full, onToggle }: Props) {
````

with

````tsx
export function Header({ view, focus, boxes, depth, onFocus, auto, from, full, onToggle }: Props) {
````

**Edit `web/src/Header.tsx`:** replace

````tsx
        {depthNote(boxes, depth, auto)}
````

with

````tsx
        {depthNote(boxes, depth, auto, from)}
````

**Edit `web/src/App.tsx`:** replace

````tsx
        auto={state.depth === null}
````

with

````tsx
        auto={state.depth === null}
        from={requested.depth}
````

**Append to `web/src/styles.css`:**

````css

/* Deviation 8: the view was collapsed to fit the layout limit. */
.notice {
  position: absolute;
  z-index: 5;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  max-width: calc(100% - 16px);
  padding: 4px 8px;
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
}
````

- [ ] **Run — expect PASS:** `cd web && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Commit:** `git add web/src/scene.ts web/src/scene.test.ts web/src/headline.ts web/src/headline.test.ts web/src/Header.tsx web/src/App.tsx web/src/styles.css && git commit -m "Collapse a large view to the deepest depth that fits"`

---

### Task 13: Browser harness and acceptance

**Files:**
- Create: `web/e2e/package.json`, `web/e2e/accept.mjs`, `docx/features/05-interaction/acceptance.md`
- Modify: `.gitignore`

**Rules:** the harness lives in the repo and is committed. It builds its test pages from `web/dist/index.html` and the export goldens (as `export.Render` does), so it needs no `zu` run and no network. It is **not** part of `make check`: it needs Playwright's browsers, installed once with `npm run browsers` (`playwright-core install`). `web/e2e` has its own `package.json`, so the page's dependencies and lock file do not change; `tsc` and vitest do not see it (`tsconfig` includes only `src`, and it has no `*.test.*` file). Record each result in `acceptance.md`, as 04 did.

**Steps:**

- [ ] **Create the harness.**

**Create `web/e2e/package.json`:**

````
{
  "name": "zu-e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "browsers": "playwright-core install chromium firefox webkit",
    "accept": "node accept.mjs"
  },
  "devDependencies": {
    "playwright-core": "1.63.0"
  }
}
````

**Create `web/e2e/accept.mjs`:**

````
// Browser acceptance for the built page (05 Task 13). Not part of make check:
// it needs browsers. Run from web/e2e after `make build`:
//   npm install && npm run browsers && npm run accept
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
const golden = (f) => JSON.parse(readFileSync(join(here, "../../internal/export/testdata", f), "utf8"));
const marker = '<script id="zu-data" type="application/json">{}</script>';
if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
// As export.Render: the View as JSON in the marker, "<" escaped.
const page = (v) => tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c")));

const dir = mkdtempSync(join(tmpdir(), "zu-e2e-"));
const write = (name, html) => writeFileSync(join(dir, name), html);
const shop = golden("shop.view.golden.json");
const change = golden("shop.change.golden.json");
const loc = { path: "x.go", line: 1 };
const pkg = (id, module) => ({ id, kind: "package", module, loc });
const imp = (from, to) => ({ from, to, kind: "imports", count: 1, loc });
write("with.html", page(shop));
write("without.html", page(shop).replace(" worker-src blob:;", ""));
write("change.html", page(change));
// Two unchanged packages outside the changed subgraph (openFull).
const far = ["example.com/shop/far/a", "example.com/shop/far/b"];
write("far.html", page({ ...change, nodes: [...change.nodes, ...far.map((id) => pkg(id, "example.com/shop"))], edges: [...change.edges, imp(far[0], far[1])] }));
// 121 packages and 720 imports: over DRAW_LIMIT at depth 4, under it at depth 2.
const ids = [];
for (let g = 0; g < 24; g++) for (let i = 0; i < 5; i++) ids.push(`m/g${String(g).padStart(2, "0")}/p${i}`);
const edges = ids.flatMap((id, n) => [1, 2, 3, 4, 5, 6].map((k) => imp(id, ids[(n + 5 * k) % ids.length])));
write("big.html", page({ ...shop, modules: ["m"], nodes: [pkg("m", "m"), ...ids.map((id) => pkg(id, "m"))], edges, sources: {} }));

const base = "file://" + dir + "/";
const vp = (p) => p.locator(".react-flow__viewport").getAttribute("style");
const settle = (p) => p.waitForTimeout(900);
const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
const hash = (p) => p.evaluate(() => decodeURIComponent(location.hash));

async function run(b) {
  const out = {};
  // Project View
  let p = await b.newPage();
  const errors = [];
  p.on("console", (m) => /Content.Security|CSP/i.test(m.text()) && errors.push(m.text().slice(0, 120)));
  p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
  await p.goto(base + "with.html");
  await drawn(p);
  await settle(p);
  out.nodes = await p.locator(".react-flow__node").count();
  const v0 = await vp(p);
  await p.keyboard.press("/");
  await p.keyboard.type("Repo.Get");
  await p.keyboard.press("Enter");
  await settle(p);
  out.search = await hash(p);
  out.row = await p.locator(".row.selected").textContent().catch(() => null);
  const v1 = await vp(p);
  out.centred = v1 !== v0;
  await p.keyboard.press("f");
  await settle(p);
  out.fit = (await vp(p)) !== v1;
  const stages = [];
  for (let i = 0; i < 5; i++) {
    await p.keyboard.press("d");
    await p.waitForTimeout(200);
    stages.push(await p.locator(".toolbar button[title^='Next declutter']").textContent());
  }
  out.stages = stages.join(" > ");
  await p.keyboard.press("d");
  await p.reload();
  await drawn(p);
  out.afterReload = await p.locator(".toolbar button[title^='Next declutter']").textContent();
  await p.getByLabel("hide edges").check();
  await settle(p);
  out.hideEdges = [(await hash(p)).includes("l=0"), await p.locator(".react-flow__edge").count(), await p.locator(".node .marks polygon").count()];
  out.notice = await p.locator("#zu-notice").count();
  await p.close();
  // Change View
  p = await b.newPage();
  await p.goto(base + "change.html");
  await drawn(p);
  await settle(p);
  out.change = await p.locator(".react-flow__node").count();
  out.chips = await p.locator(".node.chip").allTextContents();
  const c0 = await vp(p);
  await p.locator("nav.changed button", { hasText: "internal/store" }).first().click();
  await settle(p);
  out.pickCentred = (await vp(p)) !== c0;
  out.picked = await p.locator(".node.selected .label").first().textContent().catch(() => null);
  // A link outside the changed subgraph opens the whole View there.
  await p.goto(base + "far.html#f=example.com/shop/far");
  await drawn(p);
  out.far = [await p.locator(".app.subgraph").count(), await p.locator(".react-flow__node").count()];
  await p.close();
  // A view over the limit collapses and says so (Deviation 8).
  p = await b.newPage();
  await p.goto(base + "big.html#d=4");
  await drawn(p);
  out.collapsed = await p.locator("#zu-notice").innerText().then((t) => t.split("Draw")[0].trim());
  out.header = await p.locator("header").innerText().then((t) => /depth \d+[^.]*/.exec(t)?.[0] ?? "");
  await p.getByRole("button", { name: "Hide edges" }).click();
  await settle(p);
  out.hidden = [await hash(p), await p.locator("#zu-notice").count()];
  await p.goto(base + "big.html#d=4");
  await p.locator("#zu-notice").waitFor();
  await p.getByRole("button", { name: "Draw depth 4 anyway" }).click();
  out.anyway = await p.locator("#zu-notice").count();
  await p.close();
  // Worker blocked by the CSP
  p = await b.newPage();
  await p.goto(base + "without.html");
  await p.locator("#zu-status", { hasText: "Layout failed" }).waitFor({ timeout: 15000 }).catch(() => {});
  out.blocked = await p.locator("#zu-status").textContent().catch(() => null);
  await p.close();
  out.errors = errors;
  return out;
}

const want = {
  nodes: 10,
  search: "#f=example.com/shop/internal/store&s=example.com/shop/internal/store.Repo.Get",
  row: ".Get",
  centred: true,
  fit: true,
  stages: "Declutter arrows > Remove arrows > Declutter elements > Declutter classes > Declutter none",
  afterReload: "Declutter arrows",
  hideEdges: [true, 1, 8],
  notice: 0,
  change: 19,
  chips: ["+4 unchanged", "+2 unchanged", "+10 unchanged"],
  pickCentred: true,
  picked: "store",
  far: [0, 2],
  collapsed: "Collapsed to depth 2: depth 4 has 720 edges",
  header: "depth 2 (collapsed from 4)",
  hidden: ["#d=4&l=0", 0],
  anyway: 0,
  blocked: "Layout failed: layout worker failed: blocked",
  errors: [],
};

const channel = process.env.ZU_E2E_CHANNEL;
let failed = 0;
for (const [name, type, opts] of [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]]) {
  const b = await type.launch(opts);
  const got = await run(b).finally(() => b.close());
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
````

**Edit `.gitignore`:** replace

````
/web/node_modules/
````

with

````
/web/node_modules/
/web/e2e/node_modules/
````

- [ ] `make check` passes (Go tests including the CSP guard, `tsc`, vitest, lint).
- [ ] **Browsers, from `file://`:** `make build && cd web/e2e && npm install && npm run browsers && npm run accept` → `chromium: ok`, `firefox: ok`, `webkit: ok` (20 checks each: nodes drawn by the worker, `/` search to `Repo.Get` centred and in the hash, `f` refits, `d` cycles five stages and survives a reload, hide edges, the Change View's chips and a centred changed-list pick, a Change View link outside the subgraph, a 720-edge view collapsed to depth 2 with its notice and header, no CSP errors, and "Layout failed: layout worker failed: blocked" without `worker-src blob:`). `ZU_E2E_CHANNEL=chrome npm run accept` uses an installed Chrome instead of Playwright's Chromium.
- [ ] **Safari by hand** (the harness drives WebKit, not Safari): the same checks.
- [ ] **Size:** `zu export -html` of kubernetes v1.37.0 is within 50 KB of 04's 8,065,460 B.
- [ ] **Timing:** on kubernetes, the opening view reaches `zu-drawn`; `k8s.io/kubernetes/pkg` at depth 2 draws depth 1 with "Collapsed to depth 1: depth 2 has 1712 edges"; *Hide edges* draws depth 2 in under a second. No measured corpus view at depth 1 is over the limit (`pkg`, 184 edges), so the card is checked by the unit test only.
- [ ] **Commit:** `git add .gitignore web/e2e/package.json web/e2e/package-lock.json web/e2e/accept.mjs docx/features/05-interaction/acceptance.md && git commit -m "Add the browser harness and record 05 acceptance"`

---

## Notes

- **Verified while planning (2026-09-24), mechanically.** A script extracted every code block and edit from this file and applied them, task by task, to a fresh `git archive` of main at de78b66 (04 Parts A and B landed). After each task it ran `tsc --noEmit` and vitest; the two snapshot steps ran 04's code first. Each of the 13 "expect FAIL" steps was run where it stands and failed. Every task then left `tsc` clean and vitest green: 38 tests at de78b66, then 45, 52, 57, 64, 83, 89 after Tasks 1–6, 89 through Task 8, 90 after Task 9 and 92 after Task 12, with 04's `tree.test`, `facts.test`, `change.test`, `headline.test` and both snapshots passing at every step. `go test ./...`, `make lint` and `go test ./web/ -run SelfContained` passed on the built page (1,888,220 B, 12,492 B more than 04's). Task 13's harness, as the plan writes it (`cd web/e2e && npm install && npm run accept`, with `ZU_E2E_CHANNEL=chrome`), printed `chromium: ok (20/20 checks)`, `firefox: ok (20/20 checks)` and `webkit: ok (20/20 checks)`: the shop View (10 nodes), `/` search to `Repo.Get` centred and in the hash, `f`, the five stages and their reload, hide edges (`l=0`, 1 edge, 8 triangles), the Change View (19 nodes, three `+N unchanged` chips, a centred pick of `store`), `#f=…/far` outside the changed subgraph drawn from the whole View, a 720-edge View at `#d=4` drawn at depth 2 with "Collapsed to depth 2: depth 4 has 720 edges" and the header "depth 2 (collapsed from 4)", *Hide edges* (`#d=4&l=0`, no notice), *Draw depth 4 anyway*, no CSP errors, and "Layout failed: layout worker failed: blocked" without `worker-src blob:`.
- **Equivalence with 04.** `tree.snapshot` (04's tree API) and `scene.snapshot` (04's canvas: Project View, Change View, changed subgraph; every focus; auto depth and depths 1–3) are written by 04's code in Tasks 3 and 5 and reproduced by 05's. 04's `layout.test.ts` is replaced in Task 7; its scene cases are covered by `scene.test.ts` and `scene.snapshot`, and its order-independence check by `scene.test.ts` "is independent of input order".
- **The Change View's path (04 Part B) is left as landed, and reproduced:** `App` still opens on `changedSubgraph` (both ends of every changed import, plus hop ≤ 1) and toggles to the full project; `scene()` carries 04's `markChanges` unchanged (changed packages open onto their changed declarations with a `+N unchanged` chip; folded changed packages get a `+N changed packages` chip, or `has-change` on a box); centring uses 04's `setCenter` from layout positions on a measured wrapper, which search and the panel links reuse. An earlier draft of this plan dimmed the Change View's neighbours through a `seeds` option; 04 Part B removes them instead (its `changedSubgraph`), so `seeds` is gone and `withinHops` takes the leaves under the selection.
- **Overlap with 04 Part B's files, for sequencing.** B3 has landed, so 05 builds on it; these 05 tasks change files B3 also changed: Task 3 (`tree.ts`, `facts.ts`, `Panel.tsx`), Task 5 (`scene.ts` reproduces `layout.ts` `markChanges`), Task 7 (`layout.ts`, `Canvas.tsx`, `App.tsx`, `tree.ts`, `change.test.ts`), Task 9 (`App.tsx`, `Header.tsx`, `styles.css`), Task 10 (`Panel.tsx`, `App.tsx`), Task 11 (`App.tsx`, `Canvas.tsx`, `styles.css`), Task 12 (`App.tsx`). Any further Part B change to those files should land before Task 3 starts, or be re-applied on top of 05.
- **A Change View link outside the changed subgraph.** `useViewState` reads the hash against the whole View, so `f=` may name a box the changed subgraph does not hold. The page then turns the full-project toggle (U10) on and draws the whole View at that focus (`openFull`, Task 9), rather than an empty canvas. The toggle's initial state is derived the same way, so a link never flashes the subgraph; a later `hashchange` to such a focus turns it on from an effect, one frame late. The shop diff cannot show it (its subgraph is the whole View), so the unit test uses a synthetic Change View.
- **Status colours** are 04 Part B's (AA, lowest contrast 5.83). 05 adds only `--pin`, and a lit or selected changed edge keeps its status colour.
- **Task count: 13.** Tasks 10–12 are UI wiring whose logic is tested in Tasks 1–6; each is one commit. If one grows, split it rather than adding logic to a component.

## Progress

- [ ] Task 1 · state and URL hash
- [ ] Task 2 · cut with in-place toggles
- [ ] Task 3 · bundles; 04's tree and facts over them
- [ ] Task 4 · selection hops and declutter
- [ ] Task 5 · scene
- [ ] Task 6 · search, reveal and keys
- [ ] Task 7 · layout, canvas and page from the scene
- [ ] Task 8 · ELK in a Web Worker + CSP
- [ ] Task 9 · view state drives the page
- [ ] Task 10 · side panel, full
- [ ] Task 11 · toolbar and search box
- [ ] Task 12 · large views collapse to a depth that fits
- [ ] Task 13 · browser harness and acceptance
