# 15 · Open in place — Plan

**Status:** APPROVED 2026-09-25 (scrutiny-15 rulings applied, replay matched through T5 on b753c3a, T6 hit only 08's Firefox reload flake; advisor sign-off), with amendment A1 and the rulings below. History: Revised for scrutiny-15, not approved. History: first drafted 2026-09-25 (v1), then revised the same day (v2) under the lead's rulings on scrutiny-15 (**Revision for scrutiny-15**).

**Amendment and rulings at approval (they win over the text below):**
- **A1 (Task 2): a regrown container gets its own constructed test.** `regrown` (a container in both the opening view and the view whose children differ though the reader didn't toggle it, e.g. a Change View package whose unchanged declarations fold into a row once it is closed at the declarations) came after scrutiny, and only the shop Change View fixture covers it. Add to `place.test.ts` a hand-built scene where such a container's children change, asserting:
  1. nothing above or left of it moves;
  2. `faults()` finds nothing;
  3. it doesn't fall back to a whole layout.

  It must be red with `regrown` removed from `keep()`. In the glossary's **Region** entry, add: "…or a container the view draws with other children than the opening view did (regrown)."
- **Q1 (the Firefox reload crash):** no retry loop in T6. accept.mjs's own rerun stays the only one. Report a crash as 12–14 did. The rate is rising (2/8 at 08, 3/5 on main now); 16 investigates it.
- **Q2 (panning at fit zoom): accepted as built.** At fit zoom the first view fills the canvas, so most opens pan. At a reader's own zoom, only an open that leaves the canvas pans. Relative positions never change. Add that sentence to Risks. `reveal` fires only after a toggle (the `flipped` ref), never on 13's live redraw.

**Base.** Every diff here is against `main` at b753c3a, which contains all of 14 and 14b. The diffs were cut from a scratch branch built on a `git archive` of b753c3a, one commit per task. The plan was then replayed on a fresh copy of that archive (**Replay record**).

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 14's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/15-open-in-place/replay.py docx/features/15-open-in-place/plan.md "$S"; rm -rf "$S"
```

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Task 6's `make check`);
- Playwright's three browsers (Tasks 3–6).

---

## Revision for scrutiny-15

What changed from v1, ruling by ruling:

| Ruling | v2 |
|---|---|
| Q1: chip and Strip toggles, per-region Budget | Out of scope, listed there as a possible later feature. |
| Q2: `w` | Accepted as drafted (Deviation 6). The doc amendment keeps A6's wording. |
| Q3: `replay.py` | Copied next to this plan, unchanged, so the folder stands alone. |
| **B1**, a stale layout lands last | Task 4. The layout effect's body moves into `place.ts`'s `show()` (Task 3). Task 4 gives `show()` a `live` guard and returns it as the effect's cleanup, so a layout the page no longer wants never calls `setPlaced`.<br>- The unit test replays the scrutiny's order: the first view is cached, an open goes to a slow engine, its cleanup runs, and the close comes from cache. The open finishes last. The test is red on Task 3 (the open is drawn) and green with the guard.<br>- `place.mjs` opens a box not opened before and closes it one task later, with no wait for the layout, then checks that the drawing matches the hash. It too was red on Task 3 in all three engines (**Replay record**). |
| **M2**, a selection makes the opening view again | `baseOf` drops `selected`. `opening(view, s, make)` makes the scene of `baseOf(s)`; when a Fold chip of that scene holds the selection (N3's rule, now `holding()`), it makes `baseOf(s)` with that chip toggled instead. XOR with the selection-held chip is exactly how the chip is open in `s`. Test (`keep.test`): with a box open, five selections outside any chip make one opening view (a scene-cache hit on the page); a selection inside a chip opens the chip in the opening view and in the view, and toggling the chip closes it. Measured on kubernetes: a selection with a box open, 69–78 ms → 26–31 ms (**Measurements**). |
| **M3**, "back" | U3's text and the user's check now use the real re-entry path: a pasted or edited URL (`hashchange`, `useViewState.ts`). The hash is written with `replaceState`, so toggles add no history entries. |
| **M4**, overshoot | The scrutiny's figures are in **Risks**: after one or two opens a row reaches 2,085 px on hugo and 2,048 px on kubernetes, against ROW_MAX 1,280. Task 5 adds the camera pan: when a box the reader toggled is drawn past the canvas's edge, the viewport pans, just enough to bring its top-left and as much of it as fits into view (`viewport.ts reveal`). It never zooms and never moves a box. The pan is not animated, so reduced motion needs no case of its own. `place.mjs` zooms in about the canvas's top-left until a box sits near its bottom-right, opens it, and checks that the box is in view, the zoom is kept, and nothing above or left of it moved. It is red on Task 4 in all three engines. |
| Nit 5, U3 test | It is real now. Three orders of the same boxes, unsorted as a pasted hash may list them, are opened one at a time and closed again through one shared frame cache. Every layout is compared with a cold one, and the three final layouts are equal. |
| Nit 6, `inPlace` | `checkAll` also runs `faults()` on every layout: no two siblings overlap, and every child lies inside its container. |
| Nit 7, `fitted` | The page makes every scene through one function (`sceneOf`), so a fitted depth's scenes, and their opening views, come from the same cache. |
| Nit 8, Firefox's worst case | In **Risks**, with the scene pass named as the lever. |
| Not covered: a Change View | `place.test` and `keep.test` run on the shop Change View (`shop.change.golden.json`), the first view and depth 2. It found a real gap: at the declarations, closing a package keeps it a container and folds its unchanged declarations into a row, so its children change while it stays open. v1's `grow` fell back to a whole layout there, and `tools`, `lib/pq` and `x/sync` moved 118.5 px left. v2 makes such a container a region too (`keep()`'s `regrown`), and the Change View passes every toggle. |

---

## Goal

Meet U2 in full: "Expand and collapse a component in place, without re-laying out the whole graph" (Must). When the reader opens a box, every other box keeps its place, so the reader's mental map survives. Closing the box again restores the layout exactly.

U2 has been reduced since 05 ("UI v1: … U2 reduced (full re-layout allowed)"). Today each toggle makes a new scene, and `App.tsx` lays the whole of it out again in ELK:
- `engine.layout(JSON.parse(graph))`, then `arrange`;
- the old drawing is dropped (`placed.graph !== key`);
- the page shows "Laying out…";
- React Flow remounts and refits.

A box's neighbours can change rank, rows re-wrap, and a box above or left of the one opened can move. It did in 12 of 12 toggles on hugo and 12 of 16 on kubernetes (**Measurements**).

## Architecture

**The layout is a function of the hash, built from two kinds of layout that ELK already makes.**

1. **The opening view** (the view as it opened). `baseOf(state)` is the state with every box toggle and the selection removed. The box toggles include the root module's `#closed` toggle.
   - Group toggles stay, because a Strip or Fold chip belongs to the view's grouping.
   - When the selection lies in a Fold chip of that view, `opening()` also toggles that chip (N3), so the chip is open in the opening view exactly as it is in the view.
   - With no box toggles, the view is its own opening view, and it is laid out whole, as before 15.
   - A hop limit (`h=`) has no opening view either, because it draws only what lies within it, however the boxes are opened.

   The opening view's scene is laid out as 11 and 12 lay out any view: ELK, then `arrange` (ranks, packing, ROW_MAX, row cap).

2. **A region for each container whose content the reader changed.** That is a box the reader opened, or a container of the opening view that now holds other children: a package closed at the declarations, whose unchanged ones fold into a row. A region is a small scene:
   - the container itself, alone at the top;
   - the nodes whose nearest region is that container;
   - any region inside it, drawn as the opening view drew it (a box the reader opened: closed) (`Scene.opened`).

   Each region is laid out on its own, with the same `layout()`, so it gets the same ranks, rows and packing.

3. **`grow`** combines the opening view's layout and the region layouts, container by container, deepest first:
   - Every child keeps the x and y its frame gave it. Its x moves right by what the siblings left of it in its row grew. Its y moves down by what the rows above it grew.
   - A container's height is its frame's height plus its rows' growth.
   - A container's width is the larger of its frame's width and its widest row plus padding.
   - When a frame is missing a node the scene draws, or draws one the scene does not, `grow` returns null and the scene is laid out whole, as before 15. It never fell back in the tests, in the scrutiny's probes (hugo and kubernetes, 61 layouts) or in the measurements.

**For `grow` to keep the rest in place, the scene must draw the rest as the opening view drew it.** So once a box is opened, `scene()` takes the following from the opening view (`Scene.grouping` and `keep()`):
- **Fold chips** (12). The opening view's chips and the boxes each one holds are applied with `foldInto`, split out of `fold`.
  - A closed chip also hides what is opened inside its boxes.
  - A chip whose box is closed is skipped.
  - No Budget applies inside an opened box: it draws every child.
- **declutter's lift** (`multi`). At the arrows and classes stages, whether leaves are lifted into their containers stays as the opening view decided. Opening a box does not start lifting elsewhere.
- **Rows** (`tier`, `ownTier`). Every node the opening view drew under the same parent keeps them.
- **Counts** (a box's stats, and a Strip's or chip's label and tooltip). Every node the opening view drew in the same shape keeps them.

A node inside a region has no counterpart in the opening view, so its counts come from the **lift rule**:
- a package inside the node's region is counted as the region's child that holds it;
- a package outside the region is counted as the enclosing region sees it;
- at the top, it is counted as the leaf the opening view drew.

So every other opened box counts as closed, and a count never depends on what else is open.

**A6 changes meaning slightly: `w` hides lines, never boxes.** Ranks, fold arcs, ovals and counts now read every bundle; only drawn lines are filtered by `minPairs`. Before 15, raising `w` could remove an external oval or re-rank a row, and then opening a box would change what the filter removed. A hop limit still ranks by the lines it keeps.

**The page (`App.tsx`, `Canvas.tsx`)** changes in these ways:
- **Scene cache.** The page makes every scene through `sceneOf`, which keeps up to 32 scenes by state and makes the opening view through the same cache. Closing the last box therefore draws the first scene without making it again. With a box open, a selection finds the same opening view. A fitted depth's scenes come from the same cache.
- **Layout.** The page lays out with `place()`, which keeps up to 64 frames keyed by their whole layout input (`frameKey`).
- **The layout effect** is `show()`. Its cleanup stops a layout the page no longer wants from drawing, even when that layout finishes last (B1).
- **Keeping the drawing.** A toggle keeps the old drawing, and the reader's pan and zoom, while its layout runs. It does so when the opening view's graph is the same, which is 13's rule for a newer View extended to toggles. Anything that changes the opening view (depth, stage, focus, `w`, `e` or a group toggle) lays out afresh and refits as before.
- **Camera pan.** When the box the reader toggled is drawn past the canvas's edge, the viewport pans just enough to show its top-left, and as much of it as fits (`reveal`). The pan never zooms and never moves a box.

**No animation.** Every other box stays anchored. The only boxes that move are those right of or below the opened box, and they shift aside by whole widths and heights in one frame. The camera pan is not animated either. A tween would detach edges from their boxes mid-flight in React Flow and add a timing surface to the tests. Reduced motion is respected trivially, because nothing is animated.

**Determinism (U3).**
- The drawn layout is `place(scene(view, state))`. The scene is a pure function of the View and the state. The opening view is `opening(view, state, …)`, a pure function of the View and the state, and each region is a pure function of the scene.
- ELK is deterministic for the same input; 11's goldens already rely on that. `arrange` and `grow` are pure and sort every map they walk.
- The two caches (scenes by state, frames by their full input) only skip work whose result would be equal.
- `show()`'s guard makes the drawing the current state's layout, whatever order the layouts finish in.

So a hash lays out the same however it was reached: by toggling in any order, by a pasted or edited URL (`hashchange`), or by a cold load. The unit test "lays a hash out the same however it was reached" opens and closes three unsorted orders of the same boxes through one shared cache. Every layout equals a cold one, and the three final layouts are equal. Closing a box restores the prior layout exactly, because the state, and therefore the input to every layout, is the prior one (tested for every toggle).

**Stability criterion (the test oracle, `place.test.ts`'s `inPlace` and `faults`).** For a toggle of box B:
1. Outside B, the same nodes are drawn.
2. None of them changes size, except the containers on B's chain (B and its ancestors).
3. Each node on B's chain keeps its x and y.
4. A sibling of a chain node X, in X's row and to its right, moves right by exactly X's width growth, and by nothing else.
5. A sibling in a row below X's row moves down by exactly that row's bottom growth.
6. Every other node moves by 0 px.
7. In every layout, before and after, no two siblings overlap and every child lies inside its container.
8. Toggling back gives a layout equal to the one before (`toEqual` on every placed node).

The browser check (`place.mjs`) proves the part a reader sees: no box above the opened box's row, or left of it in its row, moves by a pixel, in chromium, firefox and webkit. React Flow draws only the nodes on screen and pans with transforms, so the browser checks that part only. `inPlace` and `faults` prove the rest in vitest, with ELK.

**Files.**
- `web/src/declutter.ts`: `multi` returned; `given` parameter.
- `web/src/group.ts`: `foldInto` split out of `fold`.
- `web/src/scene.ts`: `baseOf`, `holding`, `opening`, `Grouping`, `grouping`/`ref`/`opened`, `keep`; bundles `every` vs `kept`.
- `web/src/layout.ts`: exports `rowsOf` and `PAD_X`.
- `web/src/place.ts` (new): `regions`, `grow`, `frameKey`, `place`, `show`.
- `web/src/viewport.ts`: `reveal`.
- `web/src/App.tsx`, `web/src/Canvas.tsx`.
- Tests:
  - `web/src/testkit.ts` (`town`, `nested`);
  - `web/src/keep.test.ts` and `web/src/place.test.ts` (new);
  - `web/src/viewport.test.ts`;
  - `web/e2e/place.mjs` (new; also the measurement tool);
  - `web/e2e/package.json`.

**Overlap with 14.** 14 and 14b are on `main` at b753c3a, which is this plan's base. 15 touches none of 14's files: `Panel.tsx`, `Header.tsx`, `accept.mjs`, `serve.mjs`, `data.ts`, `links.ts` and `links.test.ts` are unchanged. `App.tsx` and `Canvas.tsx` are shared neighbours, and 14 changed neither. 15's browser check is a new `place.mjs`. It drops WebKit's benign `ResizeObserver` notice by equality, as 14's A1 does in `serve.mjs`.

## Out of scope

- An animated transition, or an animated pan (see **Architecture**: none is needed).
- **A possible later feature:** opening a Fold chip or Strip in place, and a Budget inside an opened box. Group toggles belong to the opening view, so they lay it out afresh and refit, as before 15 (Deviations 3 and 4).
- Keeping the layout across depth, stage, focus, `w`, `e` or a newer View from `zu serve`. Each of these lays the view out afresh; for a newer View, 13 already keeps the old drawing until the new one is ready.
- A TypeScript row packer to replace ELK for regions, and a faster scene pass (**Notes**).

## Deviations and decisions for review

1. **The layout is defined as opening view + grow, not as one ELK run.**
   - Rows wrap on the opening view's widths, so a row that holds an opened box may pass ROW_MAX (1,280 px), where a whole layout would have wrapped it.
   - A grown row is not re-centred.
   - A container is never narrower than its frame drew it.

   A whole layout of the same hash could therefore differ. Both are deterministic, but only opening view + grow keeps the reader's map, so the hash means opening view + grow.
2. **A box keeps the counts of the opening view.** "uses 3 · used by 5" on a box does not change when a neighbour opens, although lines now run to the neighbour's children. Counts inside an opened box follow the lift rule. Before 15, a count changed with every toggle. The count is load-bearing: `sizeOf` measures the stats text, so a changing count would resize the box.
3. **Group toggles lay out afresh and refit.** This covers a Fold chip or Strip toggle, and a selection that moves into or out of a closed Fold chip (N3), since the chip it opens belongs to the opening view. Before 15, these did the same.
4. **No Budget inside an opened box.** Before 15, opening a box refolded the whole view against the Budget, which could fold boxes elsewhere. Now the Budget is decided on the opening view, and an opened box draws all its children.
5. **A hop limit (`h=`) lays out afresh.** It draws only what lies within the limit, so it has no stable opening view.
6. **`w` hides lines, never boxes (A6).** Before 15, `w` also dropped external ovals whose only lines it hid, and ranked rows by the kept lines only. Scrutiny found this load-bearing: under `w`, splitting a bundle would change the drawn set outside the opened box.
7. **The first toggle makes one extra scene** (the opening view): about 45 ms on kubernetes, and a few ms on hugo. It is cached, and it is included in the measured times. A selection with a box open no longer makes it again.
8. **The camera may pan when a box is opened.** It pans only when the box is drawn past the canvas's edge, and only enough to show the box's top-left and as much of it as fits. Every box keeps its place in the layout; only the reader's viewport moves, and in one step.

## Measurements

`web/e2e/place.mjs`, given pages, clicks every toggle of the first view (not groups'), open and then closed again. For each toggle it records:
- ms from the click until the box is drawn the other way, plus a frame;
- how many nodes outside the box moved or resized, in layout coordinates;
- whether any node above the box's row, or left of it in its row, moved;
- whether the page restored the first drawing exactly;
- whether "Laying out…" showed.

The pages were built by `zu scan -html` from the Test Corpus (read-only, `-out` into scratch):
- hugo v0.166.0, 193 packages;
- kubernetes v1.37.0, 2,963 packages.

The before pages were built with `main` at b753c3a, and the after pages with Task 5. The browser viewport was 1400×900, on an Apple-silicon Mac, and each engine ran one pass.

**Before (b753c3a):**

| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank | panned |
|---|---|---|---|---|---|---|---|---|---|
| hugo.html | chromium | 12 | 45 / 59 | 46 / 60 | 16 / 17 | 12 | 12 | 12 | 0 |
| k8s.html | chromium | 16 | 91 / 103 | 79 / 96 | 20 / 20 | 12 | 16 | 16 | 0 |
| hugo.html | firefox | 12 | 59 / 78 | 60 / 73 | 16 / 17 | 12 | 12 | 12 | 0 |
| k8s.html | firefox | 16 | 111 / 208 | 109 / 244 | 20 / 20 | 12 | 16 | 16 | 0 |
| hugo.html | webkit | 12 | 45 / 60 | 46 / 60 | 16 / 17 | 12 | 12 | 12 | 0 |
| k8s.html | webkit | 16 | 90 / 211 | 80 / 107 | 20 / 20 | 12 | 16 | 16 | 0 |

**After (Task 5):**

| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank | panned |
|---|---|---|---|---|---|---|---|---|---|
| hugo.html | chromium | 12 | 45 / 65 | 28 / 30 | 5 / 10 | 0 | 12 | 0 | 5 |
| k8s.html | chromium | 16 | 83 / 102 | 29 / 42 | 1 / 20 | 0 | 16 | 0 | 10 |
| hugo.html | firefox | 12 | 56 / 109 | 35 / 43 | 5 / 10 | 0 | 12 | 0 | 5 |
| k8s.html | firefox | 16 | 92 / 124 | 44 / 87 | 1 / 20 | 0 | 16 | 0 | 10 |
| hugo.html | webkit | 12 | 55 / 91 | 43 / 45 | 8 / 13 | 0 | 12 | 0 | 5 |
| k8s.html | webkit | 16 | 82 / 150 | 44 / 61 | 6 / 20 | 0 | 16 | 0 | 10 |

How to read the tables:
- **"others moved"** (median / max) counts the drawn nodes outside the toggled box that changed place or size. After 15, these are only the boxes to its right in its row and in the rows below, moved aside by what it grew (`place.test`'s `inPlace` proves the amount).
- **"toggles moving a box above or left"** falls from 12 of 12 (hugo) and 12 of 16 (kubernetes) to 0.
- **"blank"** falls from every toggle to none.
- **"restored"** is every toggle, before and after.
- **"panned"** counts toggles where Task 5's camera moved, because the opened box ran past the canvas's edge. That happened on 5 of 12 toggles on hugo and 10 of 16 on kubernetes. The harness runs at fit zoom, where the view fills the canvas, so any growth past the right or bottom edge pans. At a reader's own zoom, the camera pans only when the opened box leaves the canvas. After a pan, the harness compares only nodes drawn both times and starts the next toggle on a fresh page.

Times:
- The median open is within 11's 110 ms everywhere: at most 92 ms, on Firefox with kubernetes.
- Close is a cache hit: 28–44 ms median, against 46–109 ms before.
- The worst single open is 150 ms (WebKit, kubernetes), against 211 ms before. See **Risks**.

**A selection with a box open (M2).** This is the node scene pass: vitest on the same pages' Views, with the first view's first expandable box open, selecting seven boxes in turn through the page's scene cache.

| Page | Box open | v1: ms per selection | v2: ms per selection |
|---|---|---|---|
| kubernetes | `k8s.io/api` | 71 78 77 70 69 69 73 | 27 26 30 26 28 30 31 |
| hugo | `github.com/gohugoio/hugo/cache` | 8 9 7 7 6 6 6 | 2 2 2 2 2 2 4 |

These were taken while a browser measurement ran on the same machine, so the absolute times may be high. The two versions ran side by side.

v1 made the opening view again for every selection; v2 finds it in the cache. No layout runs in either case.

## Doc amendments (exact text; not task steps)

**`docx/core/decisions.md`, line 41 (UI v1).** Replace:

> U1, U3, U4, U5 full; U2 reduced (full re-layout allowed);

with:

> U1–U5 full (U2 from 15; from 05 to 14 it was reduced, full re-layout allowed);

and append to the end of the same bullet, after "…are not in the Policy hash.", as inline prose like **Grouping (12)**:

> **Open in place (15):** a view's layout is the view as it opened plus a region for each container whose content the reader changed, each laid out on its own and set in its container's place. The view as it opened is the hash without box toggles (the root module's included) and without the selection; Fold chip and Strip toggles are kept, and the chip holding the selection is toggled in it, as N3 opens it. A region is a box the reader opened, or a container that now holds other children (a package closed at the declarations). A box keeps its place in its row; siblings right of an opened box move right by what it grew, and the rows below move down by what its row grew. Rows are not re-centred and may pass 1,280 px. Closing the box restores the prior layout exactly, and a hash lays out the same however it was reached (U3); a layout the page no longer wants never draws. Beside an opened box, the rows, Fold chips, Budget, declutter lift and counts are the view's as it opened. An opened box draws all its children, with no Budget, and their counts see every other opened box as closed. The weight filter (`w`) hides lines and never a box: ranks, ovals and counts read every bundle. A hop limit, a Fold chip or Strip toggle, a selection into or out of a closed Fold chip, or a change of depth, stage, focus, `w` or `e` lays the view out afresh and refits it. When an opened box is drawn past the canvas's edge, the camera pans just enough to show its top-left and as much of it as fits, never zooming or moving a box. Nothing is animated.

**`docx/glossary.md`, Budget.** Replace:

> How many boxes a view drawn at its automatic depth shows before the rest fold, across all its sibling sets: 15, or the Policy's `budget:`.

with:

> How many boxes a view drawn at its automatic depth shows before the rest fold, across all its sibling sets: 15, or the Policy's `budget:`. It is decided on the view as it opens: opening a box neither refolds the rest nor folds what the box holds (15).

**`docx/glossary.md`, a new entry after Fold Chip:**

> ## Region
>
> A box the reader opened, or a container that now holds other children than the view as it opened drew, with what it holds, laid out on its own and set in that container's place in the view as it opened: the view the hash draws without the boxes the reader opened or closed, and without the selection (15). A Region inside a Region is drawn there as the view as it opened drew it (a box the reader opened: closed), and is laid out on its own. ("Base" names the other side of a change, so the view as it opened is never called the base.)

**`docx/core/requirements-draft.md`, A6:** no change. "hide edges below a configurable weight" now holds literally (Deviation 6).

## Tasks

### Task 1: The scene keeps the view as it opened (`scene.ts`)

The tests (`keep.test.ts`) use two new testkit Views and one existing fixture:
- **`town`:** 18 boxes under `m`, some nested and some with packages of their own, with ring and cross imports, a demoted `m/testdata` and one external.
- **`nested`:** the root module at the page root.
- **the shop Change View.**

They check:
- Every toggle leaves each node drawn outside the box with the same parent, rows, size and label. This runs at the first view, at depth 2, inside an opened box, at the classes stage, on `nested` and on the Change View.
- A closed Fold chip hides a box opened inside it, keeps its label, and draws the box once the chip opens.
- `w` hides an external's lines but keeps its oval.
- A box inside an opened box keeps "uses 1 · used by 1" when a second box opens.
- `ref` and `opened`, and no `ref` with a hop limit.
- With a box open, selections outside any chip make one opening view. A selection inside a chip opens it (N3).

**Files:**
- Tests: `web/src/testkit.ts`, `web/src/keep.test.ts` (new)
- Code: `web/src/declutter.ts`, `web/src/group.ts`, `web/src/scene.ts`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/web/src/keep.test.ts b/web/src/keep.test.ts
new file mode 100644
index 0000000..079fafa
--- /dev/null
+++ b/web/src/keep.test.ts
@@ -0,0 +1,97 @@
+import { describe, expect, it } from "vitest";
+import type { View } from "./data";
+import { isGroup, MORE } from "./group";
+import { sizeOf } from "./layout";
+import { opening, scene, type Scene } from "./scene";
+import { DEFAULT_STATE, toggle, type ViewState } from "./state";
+import { nested, town } from "./testkit";
+import { parseView } from "./data";
+import change from "../../internal/export/testdata/shop.change.golden.json";
+
+const at = (v: View, s: Partial<ViewState>) => scene(v, { ...DEFAULT_STATE, ...s }, { home: true });
+const node = (sc: Scene, id: string) => sc.nodes.find((n) => n.id === id);
+
+// drawn is what a scene draws outside box: each node's container, size and rows.
+function drawn(sc: Scene, box: string) {
+  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
+  const under = (id: string) => {
+    for (let x = byId.get(id)!.parent; x !== ""; x = byId.get(x)?.parent ?? "") if (x === box) return true;
+    return false;
+  };
+  return sc.nodes.filter((n) => !under(n.id)).map((n) => ({
+    id: n.id, parent: n.parent, tier: n.tier, ownTier: n.ownTier, ...(n.id === box ? {} : { size: sizeOf(n), label: n.label }),
+  }));
+}
+
+// Every toggle of a drawn box leaves what is drawn outside it as it was.
+function same(v: View, s: Partial<ViewState>) {
+  const sc = at(v, s);
+  const ts = sc.nodes.filter((n) => n.toggle && !isGroup(n.id));
+  expect(ts.length).toBeGreaterThan(0);
+  for (const t of ts) {
+    const flipped = at(v, toggle({ ...DEFAULT_STATE, ...s }, t.toggleId ?? t.id));
+    expect([t.id, drawn(flipped, t.id)]).toEqual([t.id, drawn(sc, t.id)]);
+  }
+}
+
+describe("a view keeps what it drew as it opened (15)", () => {
+  it("draws the same boxes outside an opened or closed box, at their sizes and in their rows", () => {
+    const v = town();
+    same(v, {});
+    same(v, { depth: 2 });
+    same(v, { depth: 1, toggled: ["m/k00"] });
+    same(v, { depth: 1, stage: "classes" });
+    same(nested, { depth: 1 });
+    same(parseView(JSON.stringify(change)), {}); // a package closed at its declarations folds them into a row
+  });
+  it("keeps the view's fold chips; a closed chip hides a box opened inside it", () => {
+    const v = town();
+    const first = at(v, {});
+    const chip = first.nodes.find((n) => n.id.endsWith(MORE) && n.parent !== "")!;
+    const inside = first.grouping!.folded.get(chip.id)![0];
+    expect(node(at(v, { toggled: [inside] }), inside)).toBeUndefined();
+    expect(node(at(v, { toggled: [inside] }), chip.id)!.label).toBe(chip.label);
+    expect(node(at(v, { toggled: [chip.id] }), inside)!.shape).toBe("box");
+  });
+  it("hides lines under the weight filter, never a box (A6)", () => {
+    // m/k02 uses github.com/x/y over two packages, one pair each once it opens.
+    const v = town();
+    const sc = at(v, { depth: 1, minPairs: 2, toggled: ["m/k02"] });
+    expect(node(sc, "github.com/x/y")).toBeDefined();
+    expect(sc.edges.some((e) => e.to === "github.com/x/y")).toBe(false);
+  });
+  it("counts what an opened box holds as if every other opened box were closed", () => {
+    // m/k01/s0 uses two packages of m/k02, and m/k10/s1 uses it.
+    const v = town();
+    const one = node(at(v, { depth: 1, toggled: ["m/k01"] }), "m/k01/s0")!;
+    const two = node(at(v, { depth: 1, toggled: ["m/k01", "m/k02"] }), "m/k01/s0")!;
+    expect([one.stats, two.stats]).toEqual(["uses 1 · used by 1", "uses 1 · used by 1"]);
+  });
+  it("lays out the view as it opened when the reader has opened or closed a box in it", () => {
+    const v = town();
+    expect(at(v, {}).ref).toBeUndefined();
+    const sc = at(v, { depth: 1, toggled: ["m/k00", "m/k00/s0"] });
+    expect(sc.ref!.nodes.map((n) => n.id)).toEqual(at(v, { depth: 1 }).nodes.map((n) => n.id));
+    expect(sc.opened!.map((n) => [n.id, n.shape, n.toggle])).toEqual([["m/k00", "box", "expand"], ["m/k00/s0", "box", "expand"]]);
+    expect(sizeOf(sc.opened![0])).toEqual(sizeOf(node(at(v, { depth: 1 }), "m/k00")!));
+    // A hop limit draws what lies within it however the boxes open.
+    expect(at(v, { depth: 1, toggled: ["m/k00"], selected: "m/k00/s0", hops: 1 }).ref).toBeUndefined();
+  });
+  it("makes the view as it opened once whatever the reader selects, unless a Fold chip holds the selection (N3)", () => {
+    const v = town();
+    const first = at(v, {});
+    const box = first.nodes.find((n) => n.toggle === "expand" && !isGroup(n.id))!.id;
+    const [chip, held] = [...first.grouping!.folded].find(([, ids]) => !ids[0].includes("#"))!;
+    const made: string[] = [];
+    const make = (b: ViewState) => (made.push(JSON.stringify(b)), at(v, b));
+    const open = (selected: string | null) => opening(v, { ...DEFAULT_STATE, toggled: [box], selected }, make)!;
+    // Any box outside a chip: the one scene of the view as it opened, a cache hit on the page.
+    for (const sel of [null, "m/k04/s0", "m/k06/s1", "m/k09/s0", box]) expect(open(sel).nodes.map((n) => n.id)).toEqual(first.nodes.map((n) => n.id));
+    expect(new Set(made).size).toBe(1);
+    // A box in a closed chip: the chip opens in the view as it opened, as it does in the view.
+    const ref = open(held[0]);
+    expect(node(ref, held[0])).toBeDefined();
+    expect(node(at(v, { toggled: [box], selected: held[0] }), held[0])).toBeDefined();
+    expect(node(at(v, { toggled: [box, chip], selected: held[0] }), held[0])).toBeUndefined();
+  });
+});
diff --git a/web/src/testkit.ts b/web/src/testkit.ts
index b455460..7b382a1 100644
--- a/web/src/testkit.ts
+++ b/web/src/testkit.ts
@@ -39,3 +39,38 @@ export const declLeaves = (v: View, pkg: string) =>
   v.nodes.filter((n) => (n.kind === "type" || n.kind === "function") && n.parent === pkg).map((n) => n.id).sort();
 export const methodsOf = (v: View, type: string) =>
   v.nodes.filter((n) => n.kind === "function" && n.parent === type).map((n) => n.id).sort();
+
+const pad = (i: number) => String(i).padStart(2, "0");
+
+// town: eighteen boxes under m, each of two to four packages; every fourth
+// nests two more under its first, every fifth has a package of its own.
+// Imports run between the boxes' packages, in a ring and across it, so
+// opening a box splits the bundles that met it; m/testdata is demoted and
+// m/k02 uses one external over two packages.
+const K = 18;
+const box = (i: number) => `m/k${pad(i % K)}`;
+export function town(): View {
+  const nodes: ViewNode[] = [];
+  const edges: ViewEdge[] = [];
+  for (let i = 0; i < K; i++) {
+    const b = box(i);
+    if (i % 5 === 0) nodes.push(...pkgs([b], "m", { decls: 2 }));
+    for (let j = 0; j < 2 + (i % 3); j++) nodes.push(...pkgs([`${b}/s${j}`], "m", { decls: ((i * 3 + j) % 7) + 1 }));
+    if (i % 4 === 0) nodes.push(...pkgs([`${b}/s0/u`, `${b}/s0/v`], "m", { decls: 3 }));
+    edges.push(edge(`${b}/s0`, `${box(i + 1)}/s1`), edge(`${b}/s1`, `${box(i * 7 + 3)}/s0`));
+    if (i % 4 === 0) edges.push(edge(`${b}/s0/u`, `${box(i + 5)}/s0`), edge(`${box(i + 9)}/s1`, `${b}/s0/v`));
+  }
+  nodes.push(...pkgs(["m/testdata/a", "m/testdata/b"], "m", { demoted: "name" }), ...exts(["github.com/x/y"]));
+  edges.push(edge("m/k03/s0", "m/testdata/a"), edge("m/k02/s0", "github.com/x/y"), edge("m/k02/s1", "github.com/x/y"));
+  // m/k01/s0 uses two packages of m/k02: one bundle of two pairs while m/k02
+  // is closed, two of one pair each once it opens.
+  edges.push(edge("m/k01/s0", "m/k02/s0"));
+  return view(nodes, edges);
+}
+
+// nested: the root module k at the page root, beside the modules it uses (12, R5).
+export const nested = view([
+  ...pkgs(["k/cmd", "k/pkg/a", "k/pkg/b", "k/pkg/c/d", "k/pkg/c/e"], "k"),
+  ...pkgs(["api/v1", "api/v2"], "api"),
+  ...pkgs(["client"], "client"),
+], [edge("k/cmd", "k/pkg/a"), edge("k/pkg/a", "api/v1"), edge("k/pkg/b", "k/pkg/c/d"), edge("client", "api/v1"), edge("k/pkg/c/e", "api/v2")]);
```

- [x] **Run:** `cd web && npx vitest run src/keep.test.ts` Expected: FAIL (6 of 6; e.g. `Cannot read properties of undefined (reading 'nodes')` on `sc.ref`, and `opening is not a function`)

- [x] **Keep the opening view's chips and lift, and copy its rows and counts**

```diff
diff --git a/web/src/declutter.ts b/web/src/declutter.ts
index 0a8f53d..d7361d6 100644
--- a/web/src/declutter.ts
+++ b/web/src/declutter.ts
@@ -28,15 +28,17 @@ export type Decluttered = {
   lines: boolean; // false: draw marks instead of lines
   rows: boolean; // method rows inside types
   marks: Map<string, Mark>; // incoming (top) and outgoing (bottom) triangles, when !lines
+  multi: boolean; // leaves sit in more than one container: arrows and classes lift them
 };
 
 export function declutter(
   stage: Stage, lines: boolean, bundles: readonly Bundle[],
   leaves: readonly string[], parent: ReadonlyMap<string, string>, pin: Pin,
+  given?: boolean, // 15: multi as the view drew it when it opened, so opening a box lifts nothing else
 ): Decluttered {
   const up = (id: string) => parent.get(id) ?? "";
   const leaf = new Set(leaves);
-  const multi = new Set(leaves.map(up).filter((p) => p !== "")).size > 1;
+  const multi = given ?? new Set(leaves.map(up).filter((p) => p !== "")).size > 1;
   const lift = (id: string) => (stage !== "full" && multi && leaf.has(id) && up(id) !== "" ? up(id) : id);
   const folded = (id: string) => stage === "classes" && multi && leaf.has(id) && up(id) !== "";
 
@@ -76,5 +78,5 @@ export function declutter(
       }
     }
   }
-  return { lift, folded, arrows, lines: drawLines, rows: stage === "full" || stage === "arrows" || stage === "triangles", marks };
+  return { lift, folded, arrows, lines: drawLines, rows: stage === "full" || stage === "arrows" || stage === "triangles", marks, multi };
 }
diff --git a/web/src/group.ts b/web/src/group.ts
index ea43500..d7c31a9 100644
--- a/web/src/group.ts
+++ b/web/src/group.ts
@@ -219,25 +219,36 @@ export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
     return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3] || cmp(a, b);
   });
   const rows = new Map<string, string[]>(); // chip id → the boxes it would hold
-  const at = new Map<string, string>();
   for (const id of order.slice(k.budget)) {
     if (held(id)) continue;
     const p = up(id);
     const chip = `${p === "" ? c.focus : p}${MORE}`;
     rows.set(chip, [...(rows.get(chip) ?? []), id]);
-    at.set(chip, p);
   }
+  return foldInto(g, new Map([...rows].filter(([, ids]) => ids.length >= 2)), toggled, k.holds);
+}
+
+// foldInto folds the boxes each chip holds, as fold chose them: fold for the
+// view as it opens, and scene for a view the reader then opened boxes in
+// (15), so the chips stay as they were. A closed chip hides what its boxes
+// hold, opened or not.
+export function foldInto(
+  g: Grouped, rows: ReadonlyMap<string, readonly string[]>, toggled: readonly string[], holds?: (box: string) => boolean,
+): Grouped {
+  const c = g.cut;
+  const up = (id: string) => c.parent.get(id) ?? "";
   const flip = new Set(toggled);
   const out: Grouped = { ...g, groups: new Map(g.groups), at: new Map(g.at), folds: new Set(g.folds), folded: new Map(g.folded) };
   const alias = new Map(c.alias ?? []);
   const gone = new Set<string>();
-  for (const [chip, ids] of [...rows].sort(([a], [b]) => cmp(a, b))) {
-    if (ids.length < 2) continue;
-    out.at.set(chip, at.get(chip)!);
+  for (const [chip, held] of [...rows].sort(([a], [b]) => cmp(a, b))) {
+    const ids = [...held].sort(cmp);
+    if (ids.some((id) => !c.parent.has(id))) continue; // its box is closed
+    out.at.set(chip, up(ids[0]));
     out.folds.add(chip);
-    out.folded.set(chip, ids.sort(cmp));
+    out.folded.set(chip, ids);
     // A chip that holds the selection opens (N3); its toggle still flips it.
-    if (flip.has(chip) !== (k.holds !== undefined && ids.some(k.holds))) continue;
+    if (flip.has(chip) !== (holds !== undefined && ids.some(holds))) continue;
     out.groups.set(chip, ids);
     for (const id of ids) {
       gone.add(id);
@@ -245,14 +256,20 @@ export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
     }
   }
   if (out.folds.size === g.folds.size) return g;
+  const hidden = (id: string) => {
+    for (let x = id; x !== ""; x = up(x)) if (gone.has(x)) return true;
+    return false;
+  };
   const parent = new Map(c.parent);
-  for (const id of gone) parent.delete(id);
+  for (const id of parent.keys()) if (hidden(id)) parent.delete(id);
   const chips = [...out.folds].filter((f) => !g.folds.has(f));
   for (const f of chips) parent.set(f, out.at.get(f)!);
-  return { ...out, cut: { ...c, leaves: [...c.leaves.filter((l) => !gone.has(l)), ...chips].sort(cmp), parent, alias } };
+  return {
+    ...out,
+    cut: { ...c, leaves: [...c.leaves.filter((l) => !hidden(l)), ...chips].sort(cmp), containers: c.containers.filter((x) => !hidden(x)), parent, alias },
+  };
 }
 
-
 // rankNote is what the Panel says of a box whose set the row cap merged: its
 // own rank, which the merged row no longer shows (0 = depends on nothing here).
 export const rankNote = (ownTier: number | undefined): string | null =>
diff --git a/web/src/scene.ts b/web/src/scene.ts
index 41116b6..1971fed 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -1,7 +1,7 @@
 // scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
 import { nodeMark, unchangedCount } from "./change";
 import type { View, ViewEdge } from "./data";
-import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packageOf, packagesIn, PKG, ROOT_CLOSED, rootModule, within } from "./cut";
+import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packageOf, packagesIn, PKG, ROOT_CLOSED, rootModule, within, type Cut } from "./cut";
 import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
@@ -11,8 +11,8 @@ import { always, quiet, type Dir } from "./edges";
 import { boxStats, statsLine } from "./tree";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
-import { badgesOf, BUDGET, capRows, factsOf, fold, holdsProgram, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
-import type { Known, Stage, ViewState } from "./state";
+import { badgesOf, BUDGET, capRows, factsOf, fold, foldInto, holdsProgram, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
+import { toggle, type Known, type Stage, type ViewState } from "./state";
 
 export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
 
@@ -56,11 +56,54 @@ export type Scene = {
   selectedRow: string | null; // the selected method, drawn as a row of `selected`
   decls: boolean; noDetail: boolean;
   folded: number; // 12: the boxes closed fold chips hold; the header says so (N9)
+  grouping?: Grouping; // 15: what a view with boxes opened in it keeps from this one
+  ref?: Scene; // 15: the view as it opened (baseOf), when the reader has opened or closed boxes in it
+  opened?: SceneNode[]; // 15: each region's box as the view drew it when it opened (a box the reader opened: closed), by id
 };
 
+// Grouping is what a view keeps, once the reader opens boxes in it, of the
+// view as it opened (15): its fold chips and the boxes each holds, whether
+// declutter lifted leaves out of their containers, and its cut.
+export type Grouping = { folded: ReadonlyMap<string, readonly string[]>; multi: boolean; cut: Cut };
+
+// baseOf is the view as it opened (15): the state without the boxes the
+// reader opened or closed, and without the selection; group toggles stay.
+// Null when there are none, or with a hop limit, which draws what lies
+// within it however the boxes open.
+export const baseOf = (s: ViewState): ViewState | null => {
+  if (s.hops !== null) return null;
+  const groups = s.toggled.filter(isGroup);
+  return groups.length === s.toggled.length ? null : { ...s, toggled: groups, selected: null };
+};
+
+// holding is N3's rule: a box holds the selection when it is the selection's
+// package ("#pkg") or a box above it, and the chip holding such a box opens.
+function holding(view: View, selected: string | null): (box: string) => boolean {
+  const selPkg = selected === null ? undefined : packageOf(view, selected);
+  const chain = new Set<string>();
+  for (let b = selPkg ?? selected ?? ""; b !== ""; b = index(view).parent.get(b) ?? "") chain.add(b);
+  return (b) => (b.endsWith(PKG) ? b.slice(0, -PKG.length) === selPkg : chain.has(b));
+}
+
+// opening is the view as it opened (15), made by make: the scene of baseOf(s)
+// or, when s selects a box in one of its Fold chips, of baseOf(s) with that
+// chip toggled, so the chip is open there as it is in s (N3). The selection
+// itself is left out, so selecting another box finds the same scene.
+export function opening(view: View, s: ViewState, make: (b: ViewState) => Scene): Scene | null {
+  const b = baseOf(s);
+  if (b === null) return null;
+  const first = make(b);
+  if (s.selected === null) return first;
+  const holds = holding(view, s.selected);
+  const chip = [...(first.grouping?.folded ?? [])].find(([, ids]) => ids.some(holds))?.[0];
+  return chip === undefined ? first : make(toggle(b, chip));
+}
+
 // Options for callers other than the Project View: 06 passes pin (violations);
-// the page passes home (11), which draws the page root at home(view).
-export type SceneOptions = { pin?: Pin; home?: boolean };
+// the page passes home (11), which draws the page root at home(view). base
+// (15) is opening(view, s, …) with the same options, when the caller keeps
+// it; scene makes it otherwise.
+export type SceneOptions = { pin?: Pin; home?: boolean; base?: Scene | null };
 
 const last = (id: string) => id.slice(id.lastIndexOf("/") + 1);
 
@@ -78,14 +121,20 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const flips = root === null || s.toggled.includes(root) ? s.toggled
     : shut ? s.toggled.filter((t) => t !== root + ROOT_CLOSED) : [...s.toggled, root];
   let grouped = strip(view, cut(view, focus, depth, flips), s.toggled);
+  // 15: with boxes the reader opened or closed, what is drawn beside them is
+  // what the view drew as it opened (baseOf): its chips, rows and counts.
+  const ref = opts.base !== undefined ? opts.base : opening(view, s, (b) => scene(view, b, { pin: opts.pin, home: opts.home, base: null }));
+  const holds = holding(view, s.selected); // the chip holding the selection opens (N3)
   // 12: at the automatic depth, a budget of boxes; the rest of each row folds
   // into a chip, ranked as the rows were before folding (group.ts fold).
   let before: Map<string, number> | null = null;
   const into = new Map<string, Set<string>>(); // strip → the boxes that import into it, before folding (M4)
-  if (s.depth === null && !grouped.cut.decls) {
+  if (ref?.grouping) grouped = foldInto(grouped, ref.grouping.folded, s.toggled, holds);
+  else if (s.depth === null && !grouped.cut.decls) {
     const c1 = grouped.cut;
     const low = (id: string) => isGroup(id) || grouped.opened.has(id);
-    const pre = bundlesOver(view, c1, { externals: s.externals }).filter((b) => b.pairs >= s.minPairs || pin(b));
+    // A6: the weight filter hides lines; it never moves a box (15), so ranks count every bundle.
+    const pre = bundlesOver(view, c1, { externals: s.externals });
     for (const b of pre) if (isStrip(b.to)) into.set(b.to, (into.get(b.to) ?? new Set()).add(b.from));
     const arcs = pre.filter((b) => !low(b.from) && !low(b.to));
     const { tiers } = siblingRanks(
@@ -98,17 +147,13 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     const rm = focus === "" && view.kind !== "change" ? rootModule(view) : null;
     const named = view.policy?.order ?? [];
     const own = (id: string) => (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
-    // The selection's package and the boxes above it: the chip holding one opens (N3).
-    const selPkg = s.selected === null ? undefined : packageOf(view, s.selected);
-    const chain = new Set<string>();
-    for (let b = selPkg ?? s.selected ?? ""; b !== ""; b = index(view).parent.get(b) ?? "") chain.add(b);
     const folded = fold(grouped, s.toggled, {
       budget: view.policy?.budget ?? BUDGET, arcs,
       first: (b) => (factsOf(view, b)?.changed ?? false) || named.some((o) => o === own(b) || (!b.endsWith(PKG) && within(view, o, b))),
       root: (b) => rm !== null && c1.parent.get(b) === rm,
       main: (b) => (factsOf(view, b)?.mains ?? 0) > 0,
       size: (b) => { const f = factsOf(view, b); return f ? f.decls - f.gen : 0; },
-      holds: (b) => (b.endsWith(PKG) ? own(b) === selPkg : chain.has(b)),
+      holds,
     });
     if (folded !== grouped) before = tiers;
     grouped = folded;
@@ -116,8 +161,10 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const c = grouped.cut;
   const members = (g: string) => grouped.groups.get(g)
     ?? [...grouped.opened].filter((b) => c.parent.get(b) === grouped.at.get(g));
-  let kept = bundlesOver(view, c, { externals: s.externals }).filter((b) => b.pairs >= s.minPairs || pin(b));
-  let leaves = new Set([...c.leaves, ...kept.flatMap((b) => [b.from, b.to])]);
+  // A6: the weight filter hides lines (kept); boxes, ranks and counts read every bundle (15).
+  const every = bundlesOver(view, c, { externals: s.externals });
+  let kept = every.filter((b) => b.pairs >= s.minPairs || pin(b));
+  let leaves = new Set([...c.leaves, ...every.flatMap((b) => [b.from, b.to])]);
   const open = new Set(c.containers);
   const up = (id: string) => c.parent.get(id) ?? "";
   const under = (id: string, outer: string) => {
@@ -153,8 +200,9 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     leaves = new Set([...leaves].filter((l) => near.has(l)));
     kept = kept.filter((b) => near.has(b.from) && near.has(b.to));
   }
+  const ranked = s.hops !== null && selected !== null ? kept : every;
 
-  const d = declutter(s.stage, s.edges !== "off", kept, [...leaves], c.parent, pin);
+  const d = declutter(s.stage, s.edges !== "off", kept, [...leaves], c.parent, pin, ref?.grouping?.multi);
   const shown = (id: string) => (d.folded(id) ? up(id) : id);
   const folds = new Set([...leaves].filter(d.folded).map(up));
   leaves = new Set([...leaves].filter((l) => !d.folded(l)));
@@ -271,7 +319,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const bottom = (id: string) => isGroup(id) || grouped.opened.has(id);
   const { tiers, against } = siblingRanks(
     new Map(nodes.filter((n) => !bottom(n.id)).map((n) => [n.id, n.parent])),
-    kept.map((b) => ({ from: shown(b.from), to: shown(b.to), weight: b.pairs })),
+    ranked.map((b) => ({ from: shown(b.from), to: shown(b.to), weight: b.pairs })),
     (p) => byPolicy.has(p),
   );
   for (const n of nodes) {
@@ -316,7 +364,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const byEnds = (x: SceneEdge, y: SceneEdge) => cmp(x.from, y.from) || cmp(x.to, y.to);
   edges.sort(byEnds);
   all.sort(byEnds);
-  const usedBy = connect(view, nodes, kept.map((b) => [shown(b.from), shown(b.to)] as const).filter(([f, t]) => ids.has(f) && ids.has(t)), selected === null);
+  const usedBy = connect(view, nodes, ranked.map((b) => [shown(b.from), shown(b.to)] as const).filter(([f, t]) => ids.has(f) && ids.has(t)), selected === null);
   // A strip's "used by" counts boxes: a closed fold chip counts as each of
   // its boxes that imports into the strip (M4).
   const users = (strip: string) => {
@@ -333,6 +381,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     n.label = t.label;
     if (t.hint) n.hint = t.hint;
   }
+  const opened = ref ? keep(view, ref, nodes, { up, open, inner, toLeaf, every, shown, members }) : undefined;
   // 12 (R6): the top row is the entry points when every box in it holds a program.
   const tops = nodes.filter((n) => n.parent === "" && (n.tier ?? -1) >= 0);
   const high = Math.max(...tops.map((n) => n.tier!));
@@ -342,7 +391,106 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, entry, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
     folded: [...grouped.folds].reduce((n, f) => n + (grouped.groups.get(f)?.length ?? 0), 0),
+    grouping: ref?.grouping ?? { folded: grouped.folded, multi: d.multi, cut: c },
+    ...(ref ? { ref, opened } : {}),
+  };
+}
+
+type Tree = {
+  up: (id: string) => string; open: ReadonlySet<string>; inner: ReadonlySet<string>;
+  toLeaf: (pkg: string) => string; every: readonly Bundle[]; shown: (id: string) => string;
+  members: (group: string) => string[];
+};
+
+// keep gives a view the reader opened or closed boxes in what the view as it
+// opened (ref) drew beside them (15), so they keep their sizes and rows: each
+// node ref drew under the same container keeps its rows (tier, ownTier) and,
+// in the same shape, its counts (stats, a group's label and tooltip). A box
+// the reader opened is a region: what it holds counts every box outside it as
+// the view drew it when it opened, and every other opened box as closed. It
+// returns each opened box as drawn closed, for the layout (place.ts).
+function keep(view: View, ref: Scene, nodes: SceneNode[], t: Tree): SceneNode[] {
+  const { node } = index(view);
+  const was = new Map(ref.nodes.map((n) => [n.id, n]));
+  const baseOpen = new Set(ref.grouping!.cut.containers);
+  const baseLeaf = leafOf(view, ref.grouping!.cut);
+  const aside = (id: string) => id === OUTSIDE || id === EXTERNALS || node.get(id)?.kind === "external";
+  // A region is a box the reader opened, or a container of the view as it
+  // opened that now holds other children (a package closed at the
+  // declarations, whose unchanged ones fold into a row).
+  const kids = (ns: readonly SceneNode[]) => {
+    const m = new Map<string, string[]>();
+    for (const n of ns) m.set(n.parent, [...(m.get(n.parent) ?? []), n.id]);
+    return (id: string) => JSON.stringify((m.get(id) ?? []).sort(cmp));
   };
+  const [then, now] = [kids(ref.nodes), kids(nodes)];
+  const regrown = (n: SceneNode) => n.shape === "container" && was.get(n.id)?.shape === "container" && then(n.id) !== now(n.id);
+  const opened = new Set(nodes.filter((n) => (t.open.has(n.id) && t.inner.has(n.id) && !baseOpen.has(n.id)) || regrown(n)).map((n) => n.id));
+  const regionOf = (id: string) => {
+    for (let x = t.up(id); x !== ""; x = t.up(x)) if (opened.has(x)) return x;
+    return "";
+  };
+  const under = (id: string, outer: string) => {
+    for (let x = id; x !== ""; x = t.up(x)) if (x === outer) return true;
+    return false;
+  };
+  // item is what x sees of package p: inside x's region, the child of the
+  // region that holds p; outside it, as the region's own box sees p.
+  const item = (p: string, x: string): string | null => {
+    if (node.get(p)?.kind !== "package") return null;
+    for (let q = regionOf(x); ; q = regionOf(q)) {
+      if (q === "") {
+        const l = baseLeaf(p);
+        return aside(l) ? null : l;
+      }
+      if (!within(view, p, q)) continue;
+      let e = t.toLeaf(p);
+      if (e === OUTSIDE) return null;
+      while (t.up(e) !== q && t.up(e) !== "") e = t.up(e);
+      return t.up(e) === q ? e : null;
+    }
+  };
+  const counts = (x: string) => {
+    const uses = new Set<string>();
+    const usedBy = new Set<string>();
+    for (const b of t.every) {
+      const [out, inn] = [under(t.shown(b.from), x), under(t.shown(b.to), x)];
+      if (out === inn) continue;
+      for (const e of b.members) {
+        const i = item(out ? e.to : e.from, x);
+        if (i !== null && !under(i, x)) (out ? uses : usedBy).add(i);
+      }
+    }
+    return { uses: uses.size, usedBy: usedBy.size, packages: boxStats(view, x).packages };
+  };
+  for (const n of nodes) {
+    const w = was.get(n.id);
+    if (w !== undefined && w.parent === n.parent) {
+      if (w.tier === undefined) delete n.tier;
+      else n.tier = w.tier;
+      if (w.ownTier === undefined) delete n.ownTier;
+      else n.ownTier = w.ownTier;
+      if (w.shape === n.shape) {
+        if (w.stats !== undefined) n.stats = w.stats;
+        if (isGroup(n.id)) [n.label, n.hint] = [w.label, w.hint];
+        if (n.hint === undefined) delete n.hint;
+        continue;
+      }
+    }
+    if (n.shape === "box") n.stats = statsLine(counts(n.id));
+    else if (isStrip(n.id)) {
+      const st = stripText(view, t.members(n.id), counts(n.id).usedBy);
+      n.label = st.label;
+      if (st.hint) n.hint = st.hint;
+    }
+  }
+  return nodes.filter((n) => opened.has(n.id)).map((n) => {
+    if (regrown(n)) return was.get(n.id)!; // as the view drew it when it opened
+    const b: SceneNode = { ...n, shape: "box", toggle: "expand", methods: [], stats: statsLine(counts(n.id)) };
+    const g = badgesOf(view, n.id);
+    if (g.length) b.badges = g;
+    return b;
+  });
 }
 
 // HUBS is how many of the most used boxes are emphasised at rest (11).
```

- [x] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS (256 tests)

- [x] **Commit:** `Draw beside an opened box what the view drew as it opened`

### Task 2: Lay out only what an opened box holds (`place.ts`)

The tests (`place.test.ts`, with ELK) check the stability criterion (`inPlace` and `faults`) and exact restore for every toggle in these views:
- `town`: the first view, depth 2, inside three different opened boxes, and two levels deep;
- under `w=2`;
- at the classes stage;
- `nested`: the root module, and a box inside it;
- the shop Change View: the first view and depth 2.

They also check U3: three unsorted orders, opened and closed through one shared cache, each equal to a cold layout.

**Files:**
- Test: `web/src/place.test.ts` (new)
- Code: `web/src/layout.ts` (two exports), `web/src/place.ts` (new)

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/web/src/place.test.ts b/web/src/place.test.ts
new file mode 100644
index 0000000..b3404f4
--- /dev/null
+++ b/web/src/place.test.ts
@@ -0,0 +1,162 @@
+import { describe, expect, it } from "vitest";
+import ELK from "elkjs/lib/elk.bundled.js";
+import type { View } from "./data";
+import { isGroup } from "./group";
+import type { Placed } from "./layout";
+import { place } from "./place";
+import { scene } from "./scene";
+import { DEFAULT_STATE, toggle, type ViewState } from "./state";
+import { nested, town } from "./testkit";
+import { parseView } from "./data";
+import change from "../../internal/export/testdata/shop.change.golden.json";
+
+const elk = new ELK();
+const at = (v: View, s: ViewState) => place(scene(v, s, { home: true }), elk);
+const state = (s: Partial<ViewState>): ViewState => ({ ...DEFAULT_STATE, ...s });
+
+// rows are siblings whose vertical extents overlap, top to bottom.
+function rows(m: ReadonlyMap<string, Placed>, parent: string): string[][] {
+  const ids = [...m.keys()].filter((id) => (m.get(id)!.parent ?? "") === parent).sort((a, b) => m.get(a)!.y - m.get(b)!.y);
+  const out: string[][] = [];
+  let bottom = -Infinity;
+  for (const id of ids) {
+    const p = m.get(id)!;
+    if (out.length && p.y < bottom) {
+      out[out.length - 1].push(id);
+      bottom = Math.max(bottom, p.y + p.h);
+    } else {
+      out.push([id]);
+      bottom = p.y + p.h;
+    }
+  }
+  return out;
+}
+const bottomOf = (m: ReadonlyMap<string, Placed>, row: string[]) => Math.max(...row.map((id) => m.get(id)!.y + m.get(id)!.h));
+
+// inPlace is 15's stability criterion for one toggle of b: every node outside
+// b is still drawn at its size; b and the boxes around it keep their places;
+// a sibling of one of them to its right in its row moves right by exactly
+// what that one grew, and a sibling in a row below it moves down by exactly
+// what that row grew. Nothing else moves by a pixel.
+function inPlace(before: ReadonlyMap<string, Placed>, after: ReadonlyMap<string, Placed>, b: string): string[] {
+  const up = (m: ReadonlyMap<string, Placed>, id: string) => m.get(id)?.parent ?? "";
+  const under = (m: ReadonlyMap<string, Placed>, id: string) => {
+    for (let x = up(m, id); x !== ""; x = up(m, x)) if (x === b) return true;
+    return false;
+  };
+  const outside = (m: ReadonlyMap<string, Placed>) => [...m.keys()].filter((id) => !under(m, id)).sort();
+  const bad: string[] = [];
+  if (JSON.stringify(outside(before)) !== JSON.stringify(outside(after))) bad.push("drawn set changed");
+  const chain = new Map<string, string>(); // container → its child on b's chain
+  for (let x = b; ; x = up(before, x)) {
+    chain.set(up(before, x), x);
+    if (up(before, x) === "") break;
+  }
+  const byRow = new Map<string, string[][]>();
+  for (const id of outside(before)) {
+    if (!after.has(id)) continue;
+    const [p, q] = [before.get(id)!, after.get(id)!];
+    const onChain = [...chain.values()].includes(id);
+    if (!onChain && (p.w !== q.w || p.h !== q.h)) bad.push(`${id} resized`);
+    const c = p.parent ?? "";
+    const x = chain.get(c);
+    let [dx, dy] = [0, 0];
+    if (x !== undefined && x !== id) {
+      const rs = byRow.get(c) ?? rows(before, c);
+      byRow.set(c, rs);
+      const [rx, ri] = [rs.findIndex((r) => r.includes(x)), rs.findIndex((r) => r.includes(id))];
+      if (ri === rx && p.x > before.get(x)!.x) dx = after.get(x)!.w - before.get(x)!.w;
+      if (ri > rx) dy = bottomOf(after, rs[rx]) - bottomOf(before, rs[rx]);
+    }
+    if (q.x !== p.x + dx || q.y !== p.y + dy) bad.push(`${id} moved (${q.x - p.x}, ${q.y - p.y}), expected (${dx}, ${dy})`);
+  }
+  return bad;
+}
+
+// faults are what no layout may draw: two siblings that overlap, or a child
+// outside its container.
+function faults(m: ReadonlyMap<string, Placed>): string[] {
+  const bad: string[] = [];
+  const kids = new Map<string, string[]>();
+  for (const [id, p] of m) kids.set(p.parent ?? "", [...(kids.get(p.parent ?? "") ?? []), id]);
+  for (const [c, ids] of kids) {
+    const box = m.get(c);
+    for (const [i, a] of ids.entries()) {
+      const p = m.get(a)!;
+      if (box && (p.x < 0 || p.y < 0 || p.x + p.w > box.w || p.y + p.h > box.h)) bad.push(`${a} outside ${c}`);
+      for (const b of ids.slice(i + 1)) {
+        const q = m.get(b)!;
+        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) bad.push(`${a} overlaps ${b}`);
+      }
+    }
+  }
+  return bad;
+}
+
+// toggles are the ids a reader can flip on a drawn box (not a group's).
+const toggles = async (v: View, s: ViewState) =>
+  scene(v, s, { home: true }).nodes.filter((n) => n.toggle && !isGroup(n.id)).map((n) => ({ id: n.id, flip: n.toggleId ?? n.id }));
+
+async function checkAll(v: View, s: ViewState) {
+  const before = await at(v, s);
+  const found: string[] = faults(before);
+  const ts = await toggles(v, s);
+  expect(ts.length).toBeGreaterThan(0);
+  for (const t of ts) {
+    const opened = toggle(s, t.flip);
+    const after = await at(v, opened);
+    found.push(...[...inPlace(before, after, t.id), ...faults(after)].map((m) => `${t.flip}: ${m}`));
+    // Toggling back restores the layout exactly.
+    const back = await at(v, toggle(opened, t.flip));
+    if (JSON.stringify([...back]) !== JSON.stringify([...before])) found.push(`${t.flip}: not restored`);
+  }
+  expect(found).toEqual([]);
+}
+
+describe("open in place (15, U2)", () => {
+  it("keeps every other box in place when a box of the first view opens or closes", async () => {
+    await checkAll(town(), state({}));
+  });
+  it("and at an explicit depth, closing a container too", async () => {
+    await checkAll(town(), state({ depth: 2 }));
+  });
+  it("and inside a box the reader opened", async () => {
+    const v = town();
+    for (const b of ["m/k00", "m/k04", "m/k01"]) await checkAll(v, state({ depth: 1, toggled: [b] }));
+    await checkAll(v, state({ depth: 1, toggled: ["m/k00", "m/k00/s0"] }));
+  });
+  it("whatever the line filter hides (w)", async () => {
+    await checkAll(town(), state({ depth: 1, minPairs: 2 }));
+  });
+  it("at the classes stage", async () => {
+    await checkAll(town(), state({ depth: 1, stage: "classes" }));
+  });
+  it("for the root module at the page root, and the boxes opened inside it", async () => {
+    await checkAll(nested, state({ depth: 1 }));
+    await checkAll(nested, state({ depth: 1, toggled: ["k/pkg"] }));
+  });
+  it("in a Change View", async () => {
+    const v = parseView(JSON.stringify(change));
+    await checkAll(v, state({}));
+    await checkAll(v, state({ depth: 2 }));
+  });
+  it("lays a hash out the same however it was reached (U3)", async () => {
+    // Three orders of the same boxes, as a pasted hash may list them, each
+    // opened one at a time and closed again through one shared cache, as
+    // the page keeps it: every layout equals a cold one.
+    const v = town();
+    const cache = new Map<string, Map<string, Placed>>();
+    const lay = (toggled: string[], c?: typeof cache) => place(scene(v, state({ depth: 1, toggled }), { home: true }), elk, c);
+    const orders = [["m/k04", "m/k00", "m/k04/s0"], ["m/k04/s0", "m/k04", "m/k00"], ["m/k00", "m/k04/s0", "m/k04"]];
+    const found: string[] = [];
+    for (const o of orders) {
+      for (const ts of [1, 2, 3, 2, 1, 0].map((n) => o.slice(0, n))) {
+        const [warm, cold] = [await lay(ts, cache), await lay(ts)];
+        if (JSON.stringify([...warm]) !== JSON.stringify([...cold])) found.push(ts.join(","));
+      }
+    }
+    expect(found).toEqual([]);
+    const all = await Promise.all(orders.map((o) => lay(o, cache)));
+    for (const m of all) expect([...m]).toEqual([...all[0]]);
+  });
+});
```

- [x] **Run:** `cd web && npx vitest run src/place.test.ts` Expected: FAIL (`Cannot find module './place'`)

- [x] **Add `place`**

```diff
diff --git a/web/src/layout.ts b/web/src/layout.ts
index 2c1f5a9..dc763ad 100644
--- a/web/src/layout.ts
+++ b/web/src/layout.ts
@@ -129,7 +129,7 @@ export const ROW_MAX = 1280;
 // WRAP_GAP is the space between the rows one rank wraps into, a quarter of
 // the 24 between two ranks, so a wrapped rank reads as one (packed).
 export const WRAP_GAP = 6;
-const PAD_X = 24; // a container's elk.padding, left and right
+export const PAD_X = 24; // a container's elk.padding, left and right
 
 // ranked puts siblings with a higher rank above those with a lower one, in
 // every container. A sibling set in which any node has a Policy rank uses
@@ -380,7 +380,7 @@ function siblings(placed: ReadonlyMap<string, Placed>): Map<string, string[]> {
 
 // rowsOf splits siblings into rows, top to bottom: siblings whose vertical
 // extents overlap share an ELK layer.
-function rowsOf(ids: string[], placed: ReadonlyMap<string, Placed>): string[][] {
+export function rowsOf(ids: string[], placed: ReadonlyMap<string, Placed>): string[][] {
   const sorted = [...ids].sort((a, b) => placed.get(a)!.y - placed.get(b)!.y || cmp(a, b));
   const rows: string[][] = [];
   let bottom = -Infinity;
diff --git a/web/src/place.ts b/web/src/place.ts
new file mode 100644
index 0000000..ca0bfbf
--- /dev/null
+++ b/web/src/place.ts
@@ -0,0 +1,112 @@
+// Where a scene is drawn once the reader opens and closes boxes (15, U2).
+// The view as it opened (Scene.ref) is laid out once, as 11 and 12 lay out
+// any view, and so is each box the reader opened, on its own (a region);
+// grow then sets each region in its box's place. Nothing else is laid out
+// again: a box keeps its place in its row, those right of an opened box move
+// right by what it grew, and the rows below it down by what its row grew.
+// Everything is a function of the scene, so of the hash (U3): the order the
+// boxes opened in never shows, and closing a box restores the layout it had.
+import { cmp } from "./cut";
+import { elkGraph, headers, layout, levelsOf, orderOf, ownTiersOf, PAD_X, rowsOf, sizeOf, type Engine, type Placed } from "./layout";
+import type { Scene, SceneNode } from "./scene";
+
+// regions are the scenes each opened box is laid out from: the box, alone at
+// the top, and what it holds outside the boxes opened inside it, which are
+// drawn closed (Scene.opened). Sorted by the box's id.
+export function regions(sc: Scene): Scene[] {
+  const closed = new Map((sc.opened ?? []).map((n) => [n.id, n]));
+  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
+  const regionOf = (id: string) => {
+    for (let x = byId.get(id)?.parent ?? ""; x !== ""; x = byId.get(x)?.parent ?? "") if (closed.has(x)) return x;
+    return "";
+  };
+  const within = new Map<string, SceneNode[]>();
+  for (const n of sc.nodes) {
+    const r = regionOf(n.id);
+    if (r !== "") within.set(r, [...(within.get(r) ?? []), closed.get(n.id) ?? n]);
+  }
+  return [...closed.keys()].sort(cmp).map((r) => ({
+    ...sc, nodes: [{ ...byId.get(r)!, parent: "" }, ...(within.get(r) ?? [])], edges: [], all: [], ref: undefined, opened: undefined,
+  }));
+}
+
+// grow places sc from its frames: "" is the layout of the view as it opened,
+// and each opened box's id the layout of its region. In every container,
+// deepest first, a child keeps the place its frame gave it, moved right by
+// what the siblings left of it in its row grew and down by what the rows
+// above it grew; a container grows by what its rows did, never narrower than
+// its frame drew it. Null when a frame lacks a node the scene draws, or draws
+// one it does not: the page then lays the scene out whole.
+export function grow(sc: Scene, frames: ReadonlyMap<string, ReadonlyMap<string, Placed>>): Map<string, Placed> | null {
+  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
+  const opened = new Set((sc.opened ?? []).map((n) => n.id));
+  const kids = new Map<string, SceneNode[]>([["", []]]);
+  for (const n of sc.nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
+  const frameOf = (c: string): string => (c === "" || opened.has(c) ? c : frameOf(byId.get(c)?.parent ?? ""));
+  const depth = (id: string) => {
+    let d = 0;
+    for (let p = byId.get(id)?.parent ?? ""; p !== ""; p = byId.get(p)?.parent ?? "") d++;
+    return d;
+  };
+  const out = new Map<string, Placed>();
+  const size = new Map<string, { w: number; h: number }>();
+  const lay = (c: string): { w: number; h: number } | null => {
+    const src = frames.get(frameOf(c));
+    const ks = kids.get(c) ?? [];
+    if (!src || [...src.values()].filter((p) => (p.parent ?? "") === c).length !== ks.length) return null;
+    if (ks.some((k) => src.get(k.id) === undefined)) return null;
+    let dy = 0;
+    let right = 0;
+    for (const row of rowsOf(ks.map((k) => k.id), src)) {
+      row.sort((a, b) => src.get(a)!.x - src.get(b)!.x || cmp(a, b));
+      let dx = 0;
+      let was = -Infinity;
+      let now = -Infinity;
+      for (const id of row) {
+        const p = src.get(id)!;
+        const n = byId.get(id)!;
+        const a = n.shape === "container" ? size.get(id)! : sizeOf(n);
+        const x = p.x + dx;
+        out.set(id, { x, y: p.y + dy, w: a.w, h: a.h, ...(c === "" ? {} : { parent: c }) });
+        dx += a.w - p.w;
+        right = Math.max(right, x + a.w);
+        was = Math.max(was, p.y + p.h);
+        now = Math.max(now, p.y + a.h);
+      }
+      dy += now - was;
+    }
+    if (c === "") return { w: 0, h: 0 };
+    const own = src.get(c)!;
+    return { w: Math.max(own.w, right + PAD_X / 2), h: own.h + dy };
+  };
+  const containers = [...kids.keys()].filter((c) => c !== "").sort((a, b) => depth(b) - depth(a) || cmp(a, b));
+  for (const c of [...containers, ""]) {
+    const s = lay(c);
+    if (s === null) return null;
+    size.set(c, s);
+  }
+  return out;
+}
+
+// frameKey is everything a layout of f reads: its ELK input, container
+// headers, order, levels and own tiers.
+export const frameKey = (f: Scene): string =>
+  JSON.stringify([elkGraph(f), [...headers(f)], [...orderOf(f)], [...levelsOf(f)], [...ownTiersOf(f)]]);
+
+// place lays sc out: the view as it opened and each region from cache when
+// laid out before, one after another (superseding runs one layout at a time),
+// then grow. A scene with no box opened or closed is laid out whole.
+export async function place(sc: Scene, engine: Engine, cache: Map<string, Map<string, Placed>> = new Map()): Promise<Map<string, Placed>> {
+  const one = async (f: Scene) => {
+    const k = frameKey(f);
+    const hit = cache.get(k);
+    if (hit) return hit;
+    const p = await layout(f, engine);
+    cache.set(k, p);
+    return p;
+  };
+  if (!sc.ref || !sc.opened) return one(sc);
+  const frames = new Map([["", await one(sc.ref)]]);
+  for (const r of regions(sc)) frames.set(r.nodes[0].id, await one(r));
+  return grow(sc, frames) ?? one(sc);
+}
```

- [x] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS (264 tests)

- [x] **Commit:** `Lay out only the boxes the reader opened, and set them in place`

### Task 3: The page opens a box in place (`App.tsx`)

The browser check (`place.mjs`, in chromium, firefox and webkit) uses a `town.html` page, the same `town` as in the unit tests. It zooms in, opens `m/k00/s0` inside the open `m/k00`, then closes it. It checks:
- the box opens;
- at least 5 nodes above `m/k00`'s row, or left of it in the row, are unchanged;
- closing redraws the first drawing exactly;
- the viewport transform is kept;
- "Laying out…" never shows;
- there are no page errors, except WebKit's benign `ResizeObserver` notice, matched exactly.

The same script, given page files, measures instead (**Measurements**).

`App.tsx` makes every scene through `sceneOf`, which also covers the fitted depth. It lays out through `show()`, the layout effect's body moved into `place.ts` so that Task 4 can test it.

**Files:**
- Test: `web/e2e/place.mjs` (new), `web/e2e/package.json`
- Code: `web/src/App.tsx`, `web/src/place.ts`

**Steps:**

- [ ] **Write the failing browser check**

```diff
diff --git a/web/e2e/package.json b/web/e2e/package.json
index 87f3634..9ab346a 100644
--- a/web/e2e/package.json
+++ b/web/e2e/package.json
@@ -5,7 +5,8 @@
   "scripts": {
     "browsers": "playwright-core install chromium firefox webkit",
     "accept": "node accept.mjs",
-    "accept-serve": "node serve.mjs"
+    "accept-serve": "node serve.mjs",
+    "accept-place": "node place.mjs"
   },
   "devDependencies": {
     "playwright-core": "1.63.0"
diff --git a/web/e2e/place.mjs b/web/e2e/place.mjs
new file mode 100644
index 0000000..6d23380
--- /dev/null
+++ b/web/e2e/place.mjs
@@ -0,0 +1,182 @@
+// Browser acceptance for open in place (15, U2). Not part of make check: it
+// needs browsers. Run from web/e2e after `make build`: npm run accept-place.
+// With page files as arguments (zu scan -html), it measures instead: every
+// toggle of each page's first view, opened and closed again, in chromium,
+// firefox and webkit, with what else moved and how long until it drew.
+// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
+import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
+import { tmpdir } from "node:os";
+import { basename, join, resolve } from "node:path";
+import { chromium, firefox, webkit } from "playwright-core";
+
+const here = new URL(".", import.meta.url).pathname;
+const pages = process.argv.slice(2).map((f) => resolve(f));
+const dir = mkdtempSync(join(tmpdir(), "zu-place-"));
+process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
+
+// town: place.test.ts's View, eighteen boxes under m, as a page.
+function town() {
+  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
+  const marker = '<script id="zu-data" type="application/json">{}</script>';
+  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
+  const shop = JSON.parse(readFileSync(join(here, "../../internal/export/testdata/shop.view.golden.json"), "utf8"));
+  const loc = { path: "x.go", line: 1 };
+  const pkg = (id, extra = {}) => ({ id, kind: "package", module: "m", loc, ...extra });
+  const imp = (from, to) => ({ from, to, kind: "imports", count: 1, loc });
+  const box = (i) => `m/k${String(i % 18).padStart(2, "0")}`;
+  const nodes = [];
+  const edges = [];
+  for (let i = 0; i < 18; i++) {
+    const b = box(i);
+    if (i % 5 === 0) nodes.push(pkg(b, { decls: 2 }));
+    for (let j = 0; j < 2 + (i % 3); j++) nodes.push(pkg(`${b}/s${j}`, { decls: ((i * 3 + j) % 7) + 1 }));
+    if (i % 4 === 0) nodes.push(pkg(`${b}/s0/u`, { decls: 3 }), pkg(`${b}/s0/v`, { decls: 3 }));
+    edges.push(imp(`${b}/s0`, `${box(i + 1)}/s1`), imp(`${b}/s1`, `${box(i * 7 + 3)}/s0`));
+    if (i % 4 === 0) edges.push(imp(`${b}/s0/u`, `${box(i + 5)}/s0`), imp(`${box(i + 9)}/s1`, `${b}/s0/v`));
+  }
+  nodes.push(pkg("m/testdata/a", { demoted: "name" }), pkg("m/testdata/b", { demoted: "name" }), { id: "github.com/x/y", kind: "external", loc });
+  edges.push(imp("m/k03/s0", "m/testdata/a"), imp("m/k02/s0", "github.com/x/y"), imp("m/k02/s1", "github.com/x/y"), imp("m/k01/s0", "m/k02/s0"));
+  const v = { ...shop, modules: ["m"], sources: {}, nodes, edges };
+  const f = join(dir, "town.html");
+  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c"))));
+  return f;
+}
+
+// drawing is every drawn node: its place on the canvas (React Flow's
+// transform) and its size, by id. React Flow draws only the nodes on screen.
+const drawing = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".react-flow__node")].map((e) =>
+  [e.dataset.id, `${e.style.transform} ${e.offsetWidth}x${e.offsetHeight}`])));
+const viewport = (p) => p.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform ?? "");
+const toggles = (p) => p.evaluate(() => [...document.querySelectorAll(".react-flow__node .toggle")]
+  .map((e) => e.closest(".react-flow__node").dataset.id).filter((id) => !id.includes("#")));
+
+// flip clicks id's toggle and resolves once the page draws it the other way
+// (its type flips between box and container) and a frame has passed: ms from
+// the click. The page is watched for "Laying out…" meanwhile.
+const flip = (p, id) => p.evaluate(async (id) => {
+  const sel = `.react-flow__node[data-id="${CSS.escape(id)}"]`;
+  const was = document.querySelector(sel).classList.contains("react-flow__node-container");
+  let blank = false;
+  const t0 = performance.now();
+  document.querySelector(`${sel} .toggle`).click();
+  await new Promise((done) => {
+    const tick = () => {
+      if (document.getElementById("zu-status")) blank = true;
+      const n = document.querySelector(sel);
+      if (n && n.classList.contains("react-flow__node-container") !== was) requestAnimationFrame(() => done());
+      else requestAnimationFrame(tick);
+    };
+    tick();
+  });
+  return { ms: performance.now() - t0, blank };
+}, id);
+
+const settle = (p) => p.waitForTimeout(300);
+const box = (d) => {
+  const [, x, y, w, h] = /translate\(([-\d.]+)px, ([-\d.]+)px\) (\d+)x(\d+)/.exec(d).map(Number);
+  return { x, y, w, h };
+};
+
+// wrong is how many nodes that must stay moved or resized: those above the
+// box at the top that holds id, or left of it in its row.
+function wrong(a, b, id) {
+  const top = Object.keys(a).filter((k) => id === k || id.startsWith(k + "/")).map((k) => box(a[k])).sort((x, y) => y.w * y.h - x.w * x.h)[0];
+  return Object.keys(a).filter((k) => {
+    const n = box(a[k]);
+    const stays = n.y + n.h <= top.y || (n.x + n.w <= top.x && n.y < top.y + top.h);
+    return stays && k in b && a[k] !== b[k];
+  }).length;
+}
+
+// moved is how many nodes outside id, drawn before and after, changed place or size.
+const moved = (a, b, id) => Object.keys(a).filter((k) => k !== id && !k.startsWith(id + "/") && !k.startsWith(id + "#") && k in b && a[k] !== b[k]).length;
+
+async function open(b, file) {
+  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
+  const errors = [];
+  // WebKit's one benign notice, dropped by equality as 14's serve.mjs does (A1).
+  p.on("pageerror", (e) => e.message === "ResizeObserver loop completed with undelivered notifications." || errors.push(e.message));
+  await p.goto("file://" + file);
+  await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
+  await p.waitForTimeout(500);
+  return { p, errors };
+}
+
+const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
+
+async function measure(name, b) {
+  for (const file of pages) {
+    const { p } = await open(b, file);
+    const first = await drawing(p);
+    const rows = [];
+    for (const id of await toggles(p)) {
+      const o = await flip(p, id);
+      await settle(p);
+      const opened = await drawing(p);
+      const c = await flip(p, id);
+      await settle(p);
+      rows.push({ open: o.ms, close: c.ms, moved: moved(first, opened, id), wrong: wrong(first, opened, id), restored: await drawing(p).then((d) => Object.keys(first).every((k) => d[k] === first[k])), blank: o.blank || c.blank });
+    }
+    const f = (k) => `${Math.round(median(rows.map((r) => r[k])))} / ${Math.round(Math.max(...rows.map((r) => r[k])))}`;
+    console.log(`| ${basename(file)} | ${name} | ${rows.length} | ${f("open")} | ${f("close")} | ${f("moved")} | ${rows.filter((r) => r.wrong > 0).length} | ${rows.filter((r) => r.restored).length} | ${rows.filter((r) => r.blank).length} |`);
+    await p.close();
+  }
+}
+
+// accept: on town, opening m/k00/s0 (inside the open m/k00) moves nothing
+// drawn above m/k00's row or left of m/k00 in it (place.test.ts proves the
+// rest: what moves, moves aside by what the box grew). Closing it draws the
+// first view again exactly, with no blank page between and the reader's pan
+// and zoom kept.
+async function accept(name, b, file) {
+  const { p, errors } = await open(b, file);
+  await p.mouse.move(700, 450);
+  await p.mouse.wheel(0, -200); // zoom in: the view must keep it
+  await p.waitForTimeout(400);
+  const vp = await viewport(p);
+  const first = await drawing(p);
+  const o = await flip(p, "m/k00/s0");
+  await settle(p);
+  const opened = await drawing(p);
+  const vpOpen = await viewport(p);
+  const c = await flip(p, "m/k00/s0");
+  await settle(p);
+  const back = await drawing(p);
+  const k00 = box(first["m/k00"]);
+  const aside = Object.keys(first).filter((k) => {
+    const b = box(first[k]);
+    return b.y + b.h <= k00.y || (b.x + b.w <= k00.x && b.y < k00.y + k00.h);
+  });
+  return {
+    opened: opened["m/k00/s0/u"] !== undefined,
+    others: aside.length >= 5 && aside.every((k) => first[k] === opened[k]),
+    restored: Object.keys(first).every((k) => back[k] === first[k]), // WebKit may draw more of the edge of the screen
+    kept: vp !== "" && vp === vpOpen && vp === (await viewport(p)),
+    blank: o.blank || c.blank,
+    errors,
+  };
+}
+const want = { opened: true, others: true, restored: true, kept: true, blank: false, errors: [] };
+
+const channel = process.env.ZU_E2E_CHANNEL;
+const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
+if (pages.length) {
+  console.log("| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank |");
+  console.log("|---|---|---|---|---|---|---|---|---|");
+  for (const [name, type, opts] of engines) {
+    const b = await type.launch(opts);
+    await measure(name, b).finally(() => b.close().catch(() => {}));
+  }
+  process.exit(0);
+}
+const file = town();
+let failed = 0;
+for (const [name, type, opts] of engines) {
+  const b = await type.launch(opts);
+  const got = await accept(name, b, file).finally(() => b.close().catch(() => {}));
+  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
+  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
+  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
+  failed += bad.length;
+}
+process.exit(failed ? 1 : 0);
```

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node place.mjs` Expected: FAIL (3/6 in each engine: `others`, `kept` and `blank`)

- [ ] **Place the scene, and keep the drawing while a toggle lays out**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 12cac03..1010cd3 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -9,18 +9,21 @@ import { pageEngine } from "./engine";
 import { Header } from "./Header";
 import { redLegend, violationsNote } from "./headline";
 import { keyAction } from "./keys";
-import { arrange, ownTiersOf, elkGraph, headers, levelsOf, orderOf, Superseded, type Placed } from "./layout";
+import { elkGraph, headers, Superseded, type Placed } from "./layout";
+import { show } from "./place";
 import { Panel } from "./Panel";
 import { pinFor } from "./policy";
 import { PROPOSAL_NOTICE, proposalView } from "./proposal";
 import { reveal } from "./search";
 import { SearchBox } from "./SearchBox";
-import { DRAW_LIMIT, fitDepth, HUBS, openFull, scene, type Scene, type SceneNode } from "./scene";
-import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
+import { DRAW_LIMIT, fitDepth, HUBS, opening, openFull, scene, type Scene, type SceneNode } from "./scene";
+import { deeper, drill, nextStage, select, shallower, toggle, up, type ViewState } from "./state";
 import { Toolbar } from "./Toolbar";
 import { useViewState } from "./useViewState";
 
 const PKG = "#pkg";
+const FRAMES = 64; // 15: the most layouts the page keeps (place.ts)
+const SCENES = 32; // 15: and scenes
 
 type LegendProps = {
   change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null;
@@ -112,7 +115,7 @@ function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => voi
 }
 
 // Drawing is a finished layout and what it was made for.
-type Drawing = { whole: View; view: View; sc: Scene; graph: string; at: Map<string, Placed> };
+type Drawing = { whole: View; view: View; sc: Scene; graph: string; base: string; at: Map<string, Placed> };
 
 export function App({ view: whole }: { view: View }) {
   const change = whole.kind === "change";
@@ -137,7 +140,23 @@ export function App({ view: whole }: { view: View }) {
   const [searchOpen, setSearchOpen] = useState(false);
   const [fit, setFit] = useState(0);
   const pin = useMemo(() => pinFor(whole), [whole]); // 06: violations stay red
-  const requested = useMemo(() => scene(view, state, { pin, home: true }), [view, state, pin]);
+  // 15: the scenes of this View by state, so the view as it opened is made
+  // once while the reader opens and closes boxes and selects in it, and
+  // closing the last box draws the first view without making it again.
+  const sceneOf = useMemo(() => {
+    const at = new Map<string, Scene>();
+    const made = (s: ViewState, base: Scene | null): Scene => {
+      const k = JSON.stringify(s);
+      const hit = at.get(k);
+      if (hit) return hit;
+      if (at.size >= SCENES) at.clear();
+      const sc = scene(view, s, { pin, home: true, base });
+      at.set(k, sc);
+      return sc;
+    };
+    return (s: ViewState) => made(s, opening(view, s, (b) => made(b, null)));
+  }, [view, pin]);
+  const requested = useMemo(() => sceneOf(state), [sceneOf, state]);
   // A view over DRAW_LIMIT draws the deepest depth that fits and says so; only
   // when even depth 1 is too big does the reader choose (Deviation 8).
   // "Draw depth M anyway" holds for this graph only.
@@ -145,9 +164,9 @@ export function App({ view: whole }: { view: View }) {
   const [confirmed, setConfirmed] = useState<string | null>(null);
   const fitted = useMemo(() => {
     if (confirmed === wanted) return requested;
-    const d = fitDepth(requested, (depth) => scene(view, { ...state, depth }, { pin, home: true }));
-    return d === null ? null : d === requested.depth ? requested : scene(view, { ...state, depth: d }, { pin, home: true });
-  }, [confirmed, wanted, requested, view, state, pin]);
+    const d = fitDepth(requested, (depth) => sceneOf({ ...state, depth }));
+    return d === null ? null : d === requested.depth ? requested : sceneOf({ ...state, depth: d });
+  }, [confirmed, wanted, requested, sceneOf, state]);
   const sc = fitted ?? requested;
   const ask = fitted === null;
   // A selected bundle edge lives here, not in the hash: its id changes with depth.
@@ -170,30 +189,33 @@ export function App({ view: whole }: { view: View }) {
   // changes, so selecting and dimming never lay out again.
   const engine = useMemo(pageEngine, []);
   useEffect(() => () => engine.dispose(), [engine]);
-  const graph = useMemo(() => JSON.stringify(elkGraph(sc)), [sc]);
+  // 15: and on the view as it opened, which places what the reader did not open.
+  const opened = useMemo(() => JSON.stringify(elkGraph(sc.ref ?? sc)), [sc]);
+  const graph = useMemo(() => JSON.stringify(elkGraph(sc)) + (sc.ref ? opened : ""), [sc, opened]);
   // 11: what packed widens containers to; a change lays out again.
   const heads = useMemo(() => JSON.stringify([...headers(sc)]), [sc]);
   const key = graph + "\n" + heads;
-  // The Policy's order is a property of the nodes in graph, so a layout of
-  // graph may read the order of any scene that produced it.
-  const order = useMemo(() => orderOf(sc), [sc]);
-  // 11: likewise each node's level: graph holds the rows ranked made.
-  const levels = useMemo(() => levelsOf(sc), [sc]);
-  const ownTiers = useMemo(() => ownTiersOf(sc), [sc]); // 12: a merged row's order
+  // 15: every layout of the page's life by its input (place.ts frameKey), so
+  // a toggle lays out only the box it opened, and closing it lays out nothing.
+  const frames = useRef(new Map<string, Map<string, Placed>>());
   // 13: a layout keeps the View and scene it was made for, so while zu
   // serve's newer View lays out the page goes on drawing the last one, in the
-  // same React Flow, and the reader's pan and zoom stay.
+  // same React Flow, and the reader's pan and zoom stay. 15: so too while a
+  // box the reader opened or closed lays out, when the view as it opened is
+  // the same; anything else that lays the view out again starts afresh.
   const [placed, setPlaced] = useState<Drawing | null>(null);
   const [failed, setFailed] = useState<string | null>(null);
   useEffect(() => {
     if (ask) return;
     const made = { whole, view, sc };
     performance.mark("zu-layout-start");
-    engine.layout(JSON.parse(graph)).then(
-      (out) => {
+    if (frames.current.size > FRAMES) frames.current.clear();
+    show(
+      sc, engine, frames.current,
+      (at) => {
         performance.mark("zu-layout-end");
         setFailed(null);
-        setPlaced({ ...made, graph: graph + "\n" + heads, at: arrange(out, order, new Map(JSON.parse(heads) as [string, number][]), levels, ownTiers) });
+        setPlaced({ ...made, graph: graph + "\n" + heads, base: opened, at });
       },
       (e: Error) => {
         if (!(e instanceof Superseded)) setFailed(e.message);
@@ -254,8 +276,8 @@ export function App({ view: whole }: { view: View }) {
     ? null
     : placed.graph === key
       ? { view, sc, at: placed.at }
-      : placed.whole !== whole && `${state.focus}\n${placed.sc.depth}` === frame
-        ? placed
+      : (placed.whole !== whole || placed.base === opened) && `${state.focus}\n${placed.sc.depth}` === frame
+        ? placed // 13: a newer View; 15: a toggle, until its layout is done
         : null;
 
   return (
diff --git a/web/src/place.ts b/web/src/place.ts
index ca0bfbf..4c7d4ca 100644
--- a/web/src/place.ts
+++ b/web/src/place.ts
@@ -110,3 +110,12 @@ export async function place(sc: Scene, engine: Engine, cache: Map<string, Map<st
   for (const r of regions(sc)) frames.set(r.nodes[0].id, await one(r));
   return grow(sc, frames) ?? one(sc);
 }
+
+// show is the page's layout effect (App.tsx): it places sc and hands the
+// layout to draw, or the error to fail.
+export function show(
+  sc: Scene, engine: Engine, cache: Map<string, Map<string, Placed>>,
+  draw: (at: Map<string, Placed>) => void, fail: (e: Error) => void,
+): void {
+  place(sc, engine, cache).then(draw, fail);
+}
```

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node place.mjs` Expected: PASS (6 checks in each engine)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [ ] **Commit:** `Open and close a box in place, keeping every other box where it was`

### Task 4: A layout the page no longer wants never draws (B1)

The race: the reader opens a box and closes it again before the box's region is laid out. The close comes from the frame cache at once, so no newer engine job supersedes the open (`superseding` in `layout.ts`). The open finishes last, and without a guard its `setPlaced` overwrites the current drawing. `shown` then keeps it, because its opening view is the same.

The tests:
- **vitest:** the first view is cached. `show()` of the open runs on a 30 ms engine, its cleanup runs as React would, and `show()` of the first view follows. The drawing must be the first view's layout.
- **`place.mjs`:** it opens a box not opened before and closes it one task later (`setTimeout(0)`), with no wait for its layout. The final drawing must match the hash.

**Files:**
- Tests: `web/src/place.test.ts`, `web/e2e/place.mjs`
- Code: `web/src/place.ts`, `web/src/App.tsx`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/web/e2e/place.mjs b/web/e2e/place.mjs
index 6d23380..bb1274d 100644
--- a/web/e2e/place.mjs
+++ b/web/e2e/place.mjs
@@ -127,7 +127,7 @@ async function measure(name, b) {
 // drawn above m/k00's row or left of m/k00 in it (place.test.ts proves the
 // rest: what moves, moves aside by what the box grew). Closing it draws the
 // first view again exactly, with no blank page between and the reader's pan
-// and zoom kept.
+// and zoom kept, and so does closing it before it is laid out (B1).
 async function accept(name, b, file) {
   const { p, errors } = await open(b, file);
   await p.mouse.move(700, 450);
@@ -142,6 +142,21 @@ async function accept(name, b, file) {
   const c = await flip(p, "m/k00/s0");
   await settle(p);
   const back = await drawing(p);
+  // B1: open a box not opened before and close it again a task later, once
+  // its layout has started and before its region is laid out (no wait). The
+  // page must draw the hash: the first view, with the box closed.
+  const fresh = await p.evaluate(() => [...document.querySelectorAll(".react-flow__node:not(.react-flow__node-container) .toggle")]
+    .map((e) => e.closest(".react-flow__node").dataset.id).find((id) => !id.includes("#") && id !== "m/k00/s0"));
+  await p.evaluate(async (id) => {
+    const toggle = () => document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .toggle`).click();
+    toggle();
+    await new Promise((ok) => setTimeout(ok, 0));
+    toggle();
+  }, fresh);
+  await settle(p);
+  await settle(p);
+  const raced = await drawing(p);
+  const hashed = await p.evaluate(() => decodeURIComponent(location.hash));
   const k00 = box(first["m/k00"]);
   const aside = Object.keys(first).filter((k) => {
     const b = box(first[k]);
@@ -152,11 +167,12 @@ async function accept(name, b, file) {
     others: aside.length >= 5 && aside.every((k) => first[k] === opened[k]),
     restored: Object.keys(first).every((k) => back[k] === first[k]), // WebKit may draw more of the edge of the screen
     kept: vp !== "" && vp === vpOpen && vp === (await viewport(p)),
+    raced: fresh !== undefined && !hashed.includes(fresh) && Object.keys(first).every((k) => raced[k] === first[k]),
     blank: o.blank || c.blank,
     errors,
   };
 }
-const want = { opened: true, others: true, restored: true, kept: true, blank: false, errors: [] };
+const want = { opened: true, others: true, restored: true, kept: true, raced: true, blank: false, errors: [] };
 
 const channel = process.env.ZU_E2E_CHANNEL;
 const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
diff --git a/web/src/place.test.ts b/web/src/place.test.ts
index b3404f4..3ca8695 100644
--- a/web/src/place.test.ts
+++ b/web/src/place.test.ts
@@ -2,8 +2,8 @@ import { describe, expect, it } from "vitest";
 import ELK from "elkjs/lib/elk.bundled.js";
 import type { View } from "./data";
 import { isGroup } from "./group";
-import type { Placed } from "./layout";
-import { place } from "./place";
+import type { Engine, Placed } from "./layout";
+import { place, show } from "./place";
 import { scene } from "./scene";
 import { DEFAULT_STATE, toggle, type ViewState } from "./state";
 import { nested, town } from "./testkit";
@@ -159,4 +159,24 @@ describe("open in place (15, U2)", () => {
     const all = await Promise.all(orders.map((o) => lay(o, cache)));
     for (const m of all) expect([...m]).toEqual([...all[0]]);
   });
+  it("draws the hash's layout when an earlier toggle's finishes after it (B1)", async () => {
+    // The reader opens m/k00 and closes it again before its region is laid
+    // out. The close comes from cache at once; the open finishes last. The
+    // page runs each layout as an effect, and React runs an effect's cleanup
+    // before the next one starts.
+    const v = town();
+    const s = state({ depth: 1 });
+    const cache = new Map<string, Map<string, Placed>>();
+    const first = scene(v, s, { home: true });
+    await place(first, elk, cache);
+    const slow: Engine = { layout: (g) => new Promise((ok) => setTimeout(ok, 30)).then(() => elk.layout(g)) };
+    let drawn: Map<string, Placed> | null = null;
+    const draw = (at: Map<string, Placed>) => (drawn = at);
+    const fail = (e: Error) => { throw e; };
+    const opened = show(scene(v, toggle(s, "m/k00"), { home: true }), slow, cache, draw, fail) as (() => void) | void;
+    if (opened) opened();
+    show(first, slow, cache, draw, fail);
+    await new Promise((ok) => setTimeout(ok, 200));
+    expect([...drawn!]).toEqual([...(await place(first, elk))]);
+  });
 });
```

- [ ] **Run:** `cd web && npx vitest run src/place.test.ts` Expected: FAIL (1 of 9: the drawing is the open's layout, not the first view's)

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node place.mjs` Expected: FAIL (6/7 in each engine: `raced`)

- [ ] **Guard the layout effect**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 1010cd3..7d652a0 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -210,7 +210,8 @@ export function App({ view: whole }: { view: View }) {
     const made = { whole, view, sc };
     performance.mark("zu-layout-start");
     if (frames.current.size > FRAMES) frames.current.clear();
-    show(
+    // 15 (B1): once the page wants another layout, this one draws nothing.
+    return show(
       sc, engine, frames.current,
       (at) => {
         performance.mark("zu-layout-end");
diff --git a/web/src/place.ts b/web/src/place.ts
index 4c7d4ca..27ff3b9 100644
--- a/web/src/place.ts
+++ b/web/src/place.ts
@@ -112,10 +112,20 @@ export async function place(sc: Scene, engine: Engine, cache: Map<string, Map<st
 }
 
 // show is the page's layout effect (App.tsx): it places sc and hands the
-// layout to draw, or the error to fail.
+// layout to draw, or the error to fail. It returns the effect's cleanup:
+// once the page asks for another layout, this one draws nothing, even when
+// it finishes last. A toggle closed again before its region is laid out
+// comes from cache at once, so no newer engine job supersedes the open (B1).
 export function show(
   sc: Scene, engine: Engine, cache: Map<string, Map<string, Placed>>,
   draw: (at: Map<string, Placed>) => void, fail: (e: Error) => void,
-): void {
-  place(sc, engine, cache).then(draw, fail);
+): () => void {
+  let live = true;
+  place(sc, engine, cache).then(
+    (at) => live && draw(at),
+    (e: Error) => live && fail(e),
+  );
+  return () => {
+    live = false;
+  };
 }
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS (265 tests)

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node place.mjs` Expected: PASS (7 checks in each engine)

- [ ] **Commit:** `Draw only the layout of the current hash, whatever order layouts finish in`

### Task 5: Show an opened box that grew past the canvas (M4)

The tests:
- **`place.mjs`** runs on a second page. It zooms in about the canvas's top-left until a box sits near the bottom-right, then opens the lowest box that has a toggle and lies wholly on the canvas. It checks:
  - the box's top-left is in view, and so is its far edge on each axis unless the box is wider or taller than the canvas (then its near edge is at PAD);
  - the viewport moved and the zoom is kept;
  - nothing above or left of the box moved in the layout.

  A node's recorded place is its `style.transform` in flow coordinates, so the pan cannot change it. The check `still` therefore proves that the layout rule held through the pan: nothing above or left moved. `inPlace` in vitest proves the exact amounts for the rest.
- **vitest `reveal`:** a box in view stays put; a box that grew past the right and bottom edges pans just enough; a box too wide keeps its left at PAD; a box whose top-left is off the canvas comes back.

The browser check goes first, because `make build` type-checks the unit tests.

**Files:**
- Tests: `web/e2e/place.mjs`, `web/src/viewport.test.ts`
- Code: `web/src/viewport.ts`, `web/src/Canvas.tsx`

**Steps:**

- [ ] **Write the failing browser check**

```diff
diff --git a/web/e2e/place.mjs b/web/e2e/place.mjs
index bb1274d..bb67c82 100644
--- a/web/e2e/place.mjs
+++ b/web/e2e/place.mjs
@@ -106,8 +106,9 @@ const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
 
 async function measure(name, b) {
   for (const file of pages) {
-    const { p } = await open(b, file);
+    let { p } = await open(b, file);
     const first = await drawing(p);
+    const vp = await viewport(p);
     const rows = [];
     for (const id of await toggles(p)) {
       const o = await flip(p, id);
@@ -115,10 +116,18 @@ async function measure(name, b) {
       const opened = await drawing(p);
       const c = await flip(p, id);
       await settle(p);
-      rows.push({ open: o.ms, close: c.ms, moved: moved(first, opened, id), wrong: wrong(first, opened, id), restored: await drawing(p).then((d) => Object.keys(first).every((k) => d[k] === first[k])), blank: o.blank || c.blank });
+      // After a pan (15's camera, Task 5) React Flow draws other nodes: compare
+      // those drawn both times, and start the next toggle on a fresh page.
+      const d = await drawing(p);
+      const panned = (await viewport(p)) !== vp;
+      rows.push({ open: o.ms, close: c.ms, moved: moved(first, opened, id), wrong: wrong(first, opened, id), restored: Object.keys(first).every((k) => (panned && !(k in d)) || d[k] === first[k]), blank: o.blank || c.blank, panned });
+      if (panned) {
+        await p.close();
+        ({ p } = await open(b, file));
+      }
     }
     const f = (k) => `${Math.round(median(rows.map((r) => r[k])))} / ${Math.round(Math.max(...rows.map((r) => r[k])))}`;
-    console.log(`| ${basename(file)} | ${name} | ${rows.length} | ${f("open")} | ${f("close")} | ${f("moved")} | ${rows.filter((r) => r.wrong > 0).length} | ${rows.filter((r) => r.restored).length} | ${rows.filter((r) => r.blank).length} |`);
+    console.log(`| ${basename(file)} | ${name} | ${rows.length} | ${f("open")} | ${f("close")} | ${f("moved")} | ${rows.filter((r) => r.wrong > 0).length} | ${rows.filter((r) => r.restored).length} | ${rows.filter((r) => r.blank).length} | ${rows.filter((r) => r.panned).length} |`);
     await p.close();
   }
 }
@@ -162,23 +171,65 @@ async function accept(name, b, file) {
     const b = box(first[k]);
     return b.y + b.h <= k00.y || (b.x + b.w <= k00.x && b.y < k00.y + k00.h);
   });
+  const vpBack = await viewport(p);
+  await p.close();
   return {
     opened: opened["m/k00/s0/u"] !== undefined,
     others: aside.length >= 5 && aside.every((k) => first[k] === opened[k]),
     restored: Object.keys(first).every((k) => back[k] === first[k]), // WebKit may draw more of the edge of the screen
-    kept: vp !== "" && vp === vpOpen && vp === (await viewport(p)),
+    kept: vp !== "" && vp === vpOpen && vp === vpBack,
     raced: fresh !== undefined && !hashed.includes(fresh) && Object.keys(first).every((k) => raced[k] === first[k]),
     blank: o.blank || c.blank,
     errors,
   };
 }
-const want = { opened: true, others: true, restored: true, kept: true, raced: true, blank: false, errors: [] };
+// shown: zoomed in about the canvas's top-left until a box sits near its
+// bottom-right, opening the box pans the camera, never zooms and moves no
+// box, until the box's top-left is in view and as much of it as fits (M4).
+async function shown(b, file) {
+  const { p, errors } = await open(b, file);
+  const pane = await p.locator(".react-flow").boundingBox();
+  await p.mouse.move(pane.x + 5, pane.y + 5);
+  for (let i = 0; i < 6; i++) {
+    await p.mouse.wheel(0, -100);
+    await p.waitForTimeout(300);
+  }
+  const rect = (id) => p.evaluate((id) => {
+    const c = document.querySelector(".react-flow").getBoundingClientRect();
+    const r = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`).getBoundingClientRect();
+    return { x: r.x - c.x, y: r.y - c.y, r: r.right - c.x, b: r.bottom - c.y, w: c.width, h: c.height };
+  }, id);
+  // The box with a toggle lowest on the canvas and wholly on it.
+  const id = await p.evaluate(() => {
+    const c = document.querySelector(".react-flow").getBoundingClientRect();
+    return [...document.querySelectorAll(".react-flow__node:not(.react-flow__node-container) .toggle")]
+      .map((e) => [e.closest(".react-flow__node").dataset.id, e.closest(".react-flow__node").getBoundingClientRect()])
+      .filter(([id, r]) => !id.includes("#") && r.x >= c.x && r.y >= c.y && r.right <= c.right && r.bottom <= c.bottom)
+      .sort(([, a], [, b]) => b.bottom - a.bottom)[0]?.[0];
+  });
+  const first = await drawing(p);
+  const zoom = (v) => /scale\(([\d.]+)\)/.exec(v)?.[1];
+  const vp = await viewport(p);
+  await flip(p, id);
+  await settle(p);
+  const r = await rect(id);
+  const moved = await viewport(p);
+  const opened = await drawing(p);
+  await p.close();
+  const fits = (lo, hi, room) => lo >= 0 && lo <= room && (hi <= room + 1 || lo <= 25);
+  return {
+    revealed: id !== undefined && fits(r.x, r.r, r.w) && fits(r.y, r.b, r.h) && moved !== vp && zoom(moved) === zoom(vp),
+    still: wrong(first, opened, id) === 0,
+    errors,
+  };
+}
+const want = { opened: true, others: true, restored: true, kept: true, raced: true, blank: false, revealed: true, still: true, errors: [] };
 
 const channel = process.env.ZU_E2E_CHANNEL;
 const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
 if (pages.length) {
-  console.log("| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank |");
-  console.log("|---|---|---|---|---|---|---|---|---|");
+  console.log("| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank | panned |");
+  console.log("|---|---|---|---|---|---|---|---|---|---|");
   for (const [name, type, opts] of engines) {
     const b = await type.launch(opts);
     await measure(name, b).finally(() => b.close().catch(() => {}));
@@ -189,7 +240,10 @@ const file = town();
 let failed = 0;
 for (const [name, type, opts] of engines) {
   const b = await type.launch(opts);
-  const got = await accept(name, b, file).finally(() => b.close().catch(() => {}));
+  const got = await (async () => {
+    const [a, s] = [await accept(name, b, file), await shown(b, file)];
+    return { ...a, ...s, errors: [...a.errors, ...s.errors] };
+  })().finally(() => b.close().catch(() => {}));
   const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
   for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
   console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
```

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node place.mjs` Expected: FAIL (8/9 in each engine: `revealed`)

- [ ] **Write the failing unit tests**

```diff
diff --git a/web/src/viewport.test.ts b/web/src/viewport.test.ts
index 01e2950..d632809 100644
--- a/web/src/viewport.test.ts
+++ b/web/src/viewport.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from "vitest";
 import css from "./styles.css?raw";
-import { FLOOR, LABEL_PX, mapByDefault, PAD, readableFit, READABLE_PX } from "./viewport";
+import { FLOOR, LABEL_PX, mapByDefault, PAD, readableFit, READABLE_PX, reveal } from "./viewport";
 
 const canvas = { w: 1000, h: 600 };
 
@@ -42,3 +42,22 @@ describe("mapByDefault (11)", () => {
     expect([mapByDefault(1600), mapByDefault(900), mapByDefault(899), mapByDefault(390)]).toEqual([true, true, false, false]);
   });
 });
+
+describe("reveal (15)", () => {
+  // canvas is 1000 × 600; at zoom 2 a layout unit is 2 px.
+  const v = { x: -100, y: -50, zoom: 2 };
+  it("leaves a box in view where it is", () => {
+    expect(reveal(v, { x: 100, y: 50, w: 100, h: 50 }, canvas)).toBeNull(); // 100..300 × 50..150 px
+  });
+  it("pans just enough to show a box that grew past the canvas's right or bottom edge", () => {
+    // 700..1100 × 400..700 px: 100 past the right, 100 past the bottom.
+    expect(reveal(v, { x: 400, y: 225, w: 200, h: 150 }, canvas)).toEqual({ x: -200 - PAD, y: -150 - PAD, zoom: 2 });
+  });
+  it("keeps the box's top-left in view when all of it does not fit", () => {
+    // 700..2700 px wide: its left goes to PAD, and the rest runs off the right.
+    expect(reveal(v, { x: 400, y: 50, w: 1000, h: 50 }, canvas)).toEqual({ x: -100 - (700 - PAD), y: -50, zoom: 2 });
+  });
+  it("brings a box whose top-left is off the canvas back into view", () => {
+    expect(reveal(v, { x: 20, y: 10, w: 50, h: 20 }, canvas)).toEqual({ x: -100 + (60 + PAD), y: -50 + (30 + PAD), zoom: 2 });
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/viewport.test.ts` Expected: FAIL (4 of 10: `reveal is not a function`)

- [ ] **Pan to what the reader opened**

```diff
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
index b68845a..82c0dc2 100644
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -22,7 +22,7 @@ import { around } from "./edges";
 import { absolute, triangles, type Placed } from "./layout";
 import { crapGrade, crapLabel } from "./metrics";
 import type { Scene, SceneEdge, SceneNode } from "./scene";
-import { mapByDefault, readableFit } from "./viewport";
+import { mapByDefault, readableFit, reveal } from "./viewport";
 
 type Data = {
   node: SceneNode;
@@ -285,6 +285,27 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
     setWhole(all);
     void rf.setViewport(v);
   }, [rf, fit, placed, target]);
+  // 15 (M4): a box the reader opened keeps its place, and so does every other
+  // box; when it grew past the canvas's edge, the camera pans, just enough to
+  // show its top-left and as much of it as fits (viewport.ts reveal). Never
+  // animated, so reduced motion needs no case of its own.
+  const flipped = useRef<{ id: string; shape: SceneNode["shape"] } | null>(null);
+  const flip = useMemo(() => onToggle && ((t: string) => {
+    const n = sc.nodes.find((x) => (x.toggleId ?? x.id) === t);
+    flipped.current = n ? { id: n.id, shape: n.shape } : null;
+    onToggle(t);
+  }), [onToggle, sc]);
+  useEffect(() => {
+    const f = flipped.current;
+    const p = f === null ? undefined : placed.get(f.id);
+    const at = f === null ? null : absolute(placed, f.id);
+    const r = box.current?.getBoundingClientRect();
+    // Until the layout draws the box the other way, the page draws the last one.
+    if (f === null || byId.get(f.id)?.shape === f.shape || !p || !at || !r || r.width === 0) return;
+    flipped.current = null;
+    const v = reveal(rf.getViewport(), { ...at, w: p.w, h: p.h }, { w: r.width, h: r.height });
+    if (v) void rf.setViewport(v);
+  }, [rf, sc, placed]); // byId comes from sc
   // 11: while lines are on demand, a hovered box draws its own over the rest.
   const [hover, setHover] = useState<string | null>(null);
   const nodes: ZNode[] = useMemo(() => [...sc.nodes]
@@ -302,9 +323,9 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
         selected: node.selected,
         draggable: false,
         connectable: false,
-        data: { node, w: p.w, h: p.h, row: sc.selectedRow, pick: onSelect, toggle: onToggle },
+        data: { node, w: p.w, h: p.h, row: sc.selectedRow, pick: onSelect, toggle: flip },
       };
-    }), [sc, placed, onSelect, onToggle]); // byId comes from sc
+    }), [sc, placed, onSelect, flip]); // byId comes from sc
   const drawn = new Set(sc.edges.map((e) => e.id));
   const hovered: SceneEdge[] = sc.lines || hover === null || hover === sc.selected ? []
     : around(sc.all, hover, (id) => byId.get(id)?.parent ?? "").filter((e) => !drawn.has(e.id)).map((e) => ({ ...e, hot: true, dim: false }));
diff --git a/web/src/viewport.ts b/web/src/viewport.ts
index 1b6b189..2115c31 100644
--- a/web/src/viewport.ts
+++ b/web/src/viewport.ts
@@ -45,3 +45,19 @@ export function readableFit(rects: readonly Rect[], canvas: { w: number; h: numb
   }
   return { x: canvas.w / 2 - cx * zoom, y: PAD - top * zoom, zoom, whole: false };
 }
+
+// reveal is the viewport that brings r (absolute, in layout units) into view
+// on a canvas of w × h px, moved as little as it can and never zoomed (15): a
+// box the reader opened that grew past the canvas's edge. Its top-left comes
+// into view, and as much of it as fits, PAD from the edges. Null when r is in
+// view already.
+export function reveal(v: Viewport, r: Rect, canvas: { w: number; h: number }): Viewport | null {
+  const pan = (at: number, size: number, offset: number, room: number) => {
+    const [start, end] = [at * v.zoom + offset, (at + size) * v.zoom + offset];
+    if (start >= 0 && end <= room) return 0;
+    const d = end > room ? room - PAD - end : 0;
+    return start + d < PAD ? PAD - start : d;
+  };
+  const [dx, dy] = [pan(r.x, r.w, v.x, canvas.w), pan(r.y, r.h, v.y, canvas.h)];
+  return dx === 0 && dy === 0 ? null : { x: v.x + dx, y: v.y + dy, zoom: v.zoom };
+}
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS (269 tests)

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node place.mjs` Expected: PASS (9 checks in each engine)

- [ ] **Commit:** `Pan to an opened box that grew past the canvas, moving no box`

### Task 6: Acceptance

**Files:**
- Record: `docx/features/15-open-in-place/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (10 checks in each engine)

- [ ] **Measure** (by hand; not a replay step).
  1. Build `bin/zu` at b753c3a into a scratch copy.
  2. For hugo and kubernetes in `.zu/corpus/` (read-only; never clone), run `zu scan -out <scratch>/ir.json -html <scratch>/before/<name>.html <corpus dir>`. `-out` keeps the IR out of the corpus.
  3. Do the same with Task 5's `bin/zu` into `<scratch>/after/`.
  4. From `web/e2e`, run `node place.mjs <scratch>/before/*.html` and then `node place.mjs <scratch>/after/*.html`.
  5. Record both tables in `acceptance.md`.

  Pass criteria for the after table:
  - "toggles moving a box above or left" is 0;
  - "restored" equals "toggles";
  - "blank" is 0;
  - the median open and close times are within 110 ms in every engine.

  Report the worst case.

- [ ] **The user's check** (by hand). On a real repository's page:
  1. Open a box in the middle of a row, then one inside it, and close both. Nothing above or left moves, and the view does not jump. Where an opened box runs past the edge, the view pans just enough to show it, and nothing moves.
  2. Open a box, copy the URL, close the box, and paste the URL into the address bar. The hash changes (`hashchange`), and the page draws the layout it had when the URL was copied. Reload it; the layout is the same.
  3. Double-click a box's toggle quickly. The page ends as the hash says.

  U2 is recorded as met in `decisions.md` once this passes.

- [ ] **Commit:** `Record open in place's acceptance`

---

## Risks

- **Opening view + grow can draw rows much wider than ROW_MAX** (Deviation 1). The scrutiny measured whole-layout widths after one or two opens:

  | Page | Opened | Width |
  |---|---|---|
  | hugo | `markup` → `markup/goldmark` | 2,085 px |
  | hugo | `common` | 1,645 px |
  | kubernetes | `pkg` → `pkg/api` | 2,048 px |
  | kubernetes | `component-base/config` | 1,954 px |

  ROW_MAX is 1,280. Task 5's pan shows the box the reader opened. The rest of a wide row is reached by panning, as in any wide view.
- **`grow` falls back to a whole layout** when a frame and the scene disagree on the nodes drawn. That fallback moves boxes. The tests, the scrutiny's 61 probe layouts and both measured pages never hit it, but a View shape none of them has might. v1 missed one such shape (**Revision for scrutiny-15**, the Change View). A fallback costs the old behaviour for that one toggle, not a wrong drawing.
- **Counts are the opening view's** (Deviation 2). A reader who opens a neighbour might expect "uses N" to change. It does not, by design.
- **Memory:** up to 32 scenes and 64 frames per page. The scrutiny measured about 17 MB of heap for 32 kubernetes scenes. The caches are cleared when they overflow, or when the View or the pins change.
- **The worst single open on kubernetes is over 11's budget**, at 150 ms on WebKit and 124 ms on Firefox (v1 measured 161 ms on Firefox). Every median is within budget. Close is a cache hit. Open is the scene pass (about 45 ms on kubernetes, including the opening view the first time) plus one region in ELK. The scene pass is the lever for the worst case, and it is a follow-up (**Notes**). ELK and `grow` are not the cost.
- **The `w` semantics change** (Deviation 6) can add external ovals, with no lines, to a view that had `w` raised. It can also re-rank rows under `w`. Both are what A6's text says; a reader of an old `w=` hash sees the ovals.
- **Firefox's reload flake (08) fails `accept.mjs` now and then**, on `main` as on 15. In v1's runs of `main`'s own code, Firefox crashed on a reload in 3 of 5 runs, and 1 run failed. A rerun passes.
- **`place.mjs` waits fixed times:** 300 ms after each toggle before reading the drawing, and 300–400 ms after each zoom step. A much slower machine could read a drawing that is not finished. It did not happen in the replay or in the measurements. Its B1 step closes the box one task after opening it; on a machine where a region lays out within that task, the step passes without reproducing the race. The vitest test is the deterministic proof.

## Notes

- **Task count: 6**, within Quick mode's limit and the lead's 9.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given, in the replay.
  - Task 1 is red on assertions: the scene has no `ref` and no `opening`, and counts and chips change.
  - Task 2 is red on the missing module.
  - Task 3 is red in the browser against Task 2: the old page refits and blanks.
  - Task 4 is red on the race, in vitest and in all three browsers.
  - Task 5 is red in the browser (the opened box runs off the canvas) and in vitest (`reveal` is missing).
- **The model never authors the graph.** 15 moves no node or edge between containers. It places only what the parser's View and the scene already draw. The IR is untouched.
- **Follow-ups, not in 15:**
  - A TypeScript row packer could lay out regions without ELK. ELK's worker is 1.5 MB of the page, but the opening view still needs it.
  - The scene pass on kubernetes (about 45 ms) is now the largest part of a toggle, so speeding it up would cut open times further.
  - Counts could update live if the stats line were sized as if each number had a fixed width. That would retire Deviation 2. This was the scrutiny's optional suggestion.

## Replay record

The plan was replayed on 2026-09-25. Command: `python3 -u replay.py plan.md <dir>`. The tree was a clean checkout of the scratch repository's first commit, a `git archive` of b753c3a whose tree hash equals b753c3a's (`git checkout` then `git clean -fdx`, keeping only `node_modules`, which were cloned from the real repo).

| Task | Step | Want | Got |
|---|---|---|---|
| 1 | `vitest keep.test.ts` | red | exit 1, 6 of 6 fail |
| 1 | `vitest run && typecheck` | green | exit 0 (256 tests) |
| 2 | `vitest place.test.ts` | red | exit 1 (`Cannot find module './place'`) |
| 2 | `vitest run && typecheck` | green | exit 0 (264) |
| 3 | `make build && place.mjs` | red | exit 1 (3/6: `others`, `kept`, `blank`) |
| 3 | `make build && place.mjs` | green | exit 0 (6/6 × 3 engines) |
| 3 | `accept.mjs` | green | exit 0 (57/57 × 3) |
| 4 | `vitest place.test.ts` | red | exit 1 (1 of 9: the B1 test) |
| 4 | `make build && place.mjs` | red | exit 1 (6/7: `raced`) |
| 4 | `vitest run && typecheck` | green | exit 0 (265) |
| 4 | `make build && place.mjs` | green | exit 0 (7/7 × 3) |
| 5 | `make build && place.mjs` | red | exit 1 (8/9: `revealed`) |
| 5 | `vitest viewport.test.ts` | red | exit 1 (4 fail) |
| 5 | `vitest run && typecheck` | green | exit 0 (269) |
| 5 | `make build && place.mjs` | green | exit 0 (9/9 × 3) |
| 6 | `make check` | green | exit 0; replay.py prints only the last line, so the lint output was read in an earlier `make check` of the identical tree: empty |
| 6 | `accept.mjs` | green | **exit 1**: Firefox `page.reload: Page crashed`, twice (08's flake, **Risks**) |
| 6 | `serve.mjs` | green | exit 0 (10/10 × 3) |

`accept.mjs` was run three more times on the replayed tree:
- run 1 passed, 57/57 in each engine;
- run 2 failed: Firefox crashed on a reload, and crashed again on the rerun;
- run 3 passed: Firefox crashed once, and the rerun passed.

On `main`'s own code, v1 saw the same crash in 3 of 5 runs.

After the replay, the replayed tree (`git write-tree`) is byte-identical to the scratch branch the diffs were cut from: `2b263677…` both.
