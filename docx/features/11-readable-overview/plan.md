# 11 · A readable overview — Plan

**Status:** APPROVED 2026-09-25 (scrutiny + advisor sign-off); amendments A1–A3 at the end of this header apply. Drafted 2026-09-25. Drafted in a scratch copy of `main` at c5013ef; every diff here applies unchanged to `main` at b8645e4 (10's later commits and the research commit touch none of these files, checked with `git apply --check`). Replayed green on a fresh `git archive` of b8645e4 (see Replay record). Proposed doc amendments (decisions.md UI v1, glossary) are Deviation 13; they are not task steps. Revised after the lead's screenshot review and the user's "not yet": Task 6 now also sizes boxes to their text, wraps rows to the screen, lets the reader hide the minimap (Deviation 14), and says at rest how boxes connect, what the rows mean and where to start (Deviation 15). Then aligned with the lead's grouping ruling (from `docx/research/architecture-diagrams.md` §5, R6 and R7): structural axis labels and a count of the dependencies that run against the order (Deviation 16). Grouping itself is feature 12; 11 builds none of it and names the seams 12 extends (Seams for 12). Then revised for the lead's rulings on the outside scrutiny (`scrutiny-11.md`): Deviation 17. acceptance.md is written when zu implements this plan (Task 8); the prototype's measurements are under Prototype evidence. **Numbering:** 10's plan calls watch and live redraw "feature 11". This plan takes 11 because the lead asked for it; watch would move to 12, and 10's plan and decisions.md l.46 text (10's Deviation 14) would say 12. The lead decides.

**Amendments at approval (2026-09-25):**
- **A1 (Task 6):** in k8s-after.png the bottom box `mount-utils` reads "uses 1 · used by 1" with its "· N pkgs" cut off, so the box is still sized below its text. Fix `sizeOf` or the stats line so no box's text is clipped, and add a case with that label.
- **A2 (Task 6):** bottom-rank boxes read "uses 1" under the axis label "depends on nothing here" because the externals oval is counted. "uses N" counts sibling boxes only; externals go in the Panel. Add a vitest case.
- **A3 (Task 7):** `firstView`'s wide.html fixture forces `#d=2` so that the minimap appears. It is a test of wrap, clipping and minimap, not a realistic first view. Say so in the check's comment.
- **Numbering:** watch and live redraw become feature 13; grouping is 12.


> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is 10's script unchanged. It applies every code block to a fresh copy of `main`, task by task, the way an implementer would:

- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. It prints one line per step and exits 1 if any step misbehaves. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 docx/features/11-readable-overview/replay.py docx/features/11-readable-overview/plan.md "$S"; rm -rf "$S"
```

The replay needs Go, git, `patch`, Python 3, npm and Node, `golangci-lint` (Task 8), and Playwright's three browsers (Task 7). Type-check with `tsc --noEmit` (`npm run typecheck`), never `tsc -b`: `-b` writes a `.js` beside every `.ts` in `web/src`, and vitest then imports the stale `.js`. While this plan was drafted, that hid a change to `layout.ts` behind a test that kept failing.

**Goal:** make the Project View of a large repository readable at first sight. The user's report: "hugo k8s not easy to understand". Measured on the default views at main (1600 × 1000, three engines; Prototype evidence, below):

- hugo draws 37 boxes plus an externals oval at depth 2, and kubernetes 38 at depth 1;
- every line is drawn at rest: 260 on hugo and 175 on kubernetes, a hairball;
- `fitView` (minZoom 0.05) shrinks the labels to 2.7 px and 2.8 px;
- nothing gives an order: which box depends on which cannot be read off the page;
- hugo spends a level on its one module box (`github.com/gohugoio/hugo`);
- labels repeat long prefixes (`k8s.io/…`).

After this plan, the same views open with 11 px labels, 0 lines at rest, and a note saying how many are hidden. Boxes stand in rows by architecture rank, dependencies below what depends on them. Hovering or selecting a box draws its own lines, solid for what it depends on and dotted for what depends on it. The page opens inside a module that is the only box at the root, and siblings drop the path prefix they share.

**Architecture:**
- **`rank.ts` (new, pure).** `tiers(ids, arcs)` ranks one sibling set. First Tarjan's strongly connected components. Inside each, Eades–Lin–Smyth's greedy order on arc weights (bundle pairs) sets aside the lighter arcs of each cycle. Then the longest path down: 0 is a node that depends on nothing among its siblings. Ties break by id. `siblingTiers(parent, arcs)` lifts each arc to the two siblings that hold its ends under their lowest common container, and ranks every sibling set.
- **`scene.ts`: `tier` per drawn node**, from the bundles the cut keeps. This is **not a Level**: nothing badges it and nothing is a violation because of it.
- **`layout.ts`: ranks, not edges, place the nodes.** `elkGraph` passes ELK no drawn edge. `ranked` (07's step nodes) runs on every scene: a sibling set with any Policy rank uses the Policy's ranks, and any other set uses tiers. A rank wider than `WRAP` (10) boxes wraps into rows of 10, and from Task 6 a row also ends before it grows wider than `ROW_MAX` (1280 px). Network-simplex placement stacks the rows 24 px apart, and a post-pass centres them (Task 2's `centred`, which Task 6 replaces with `packed`, used by the page and the tests alike). Lines come and go without moving a box.
- **`edges.ts` (new, pure): edges on demand.** `quiet(mode, lines, n)` says when auto hides lines at rest, `always(arrow, affected)` names what stays drawn anyway, and `around(edges, id, up)` gives a box's own lines with their direction. The mode (`auto` default, `on`, `off`) is `l` in the URL hash. `scene` returns `all` (every drawable line), `hidden` (how many auto left out) and `lines` (whether every line is drawn at rest).
- **`labels.ts` (new, pure): `shorten`** drops the leading path segments that all siblings share.
- **`cut.ts`: `home(view)`**, the container the page opens at: down from the root through containers with one child each. External modules do not count. `scene(view, s, {home: true})` resolves an empty focus to it; only the page passes `home`. `upTo(view, focus)` is where Esc goes, and never a root that differs from home only by a wrapper. `breadcrumb(view, focus, home)` starts at home.
- **`viewport.ts` (new, pure): `readableFit`**, the first view. It shows the whole scene when it fits with labels of 11 px or more. Otherwise it zooms to 11 px labels and shows the top of the scene, and a React Flow `MiniMap` shows the rest; a button in the Controls hides it.
- **Boxes fit their text and say how they connect (Task 6).** A box's stats line is `uses N · used by M · K pkgs` (`tree.ts` `statsLine`, counted by `scene` from every drawable line). `sizeOf` measures label, stats and rows with a table of the label font's glyph advances, with no cap. `packed` widens a container to its header.
- **Reading aids (Task 6).** An axis beside the canvas ("uses ↓", and "depends on nothing here" at the bottom), a one-line legend strip above the canvas, at rest a thicker border on the 3 most used boxes (`hub`), and, when there are any, a header count, "N dependencies run against the order" (`rank.ts` `siblingRanks`). A rank that wraps keeps its rows 6 px apart, against 24 between ranks (`layout.ts` `packed`). Enter or Space on a focused box selects it.
- **UI:** a three-state `edges` select in the toolbar replaces 05's "hide edges" checkbox. The header has a hidden-lines note, the legend says what solid and dotted mean, and hover state lives in `Canvas`.

**Tech Stack:** React 19, `@xyflow/react` 12.11 (`MiniMap` is part of it: no new dependency), elkjs 0.12, vitest, `playwright-core` from `web/e2e`. No Go change.

**Source decisions:**
- decisions.md UI v1 (l.41): U6's declutter cycle, violations stay red, view state in the URL hash, the 2,000-node / 500-edge collapse; the Levels rule (l.22): level 0 drawn at the bottom.
- 05 Deviation 1 (declutter stages, "hide edges" = triangles), 05 Deviation 8 (`DRAW_LIMIT`), 06 (pinned bundles red), 07 (`ranked` step nodes: ELK ignores partitioning inside compound nodes), 04 Part B (Change View marks).
- CLAUDE.md: "The model never authors the graph". Ranks, labels and the home box are computed from the parser's nodes and edges only; nothing is invented.

**Out of scope:**
- Edge bundling or routing around boxes. A hovered line that spans several ranks passes under the boxes in between (Risks).
- Changing `DRAW_LIMIT` or the depth rule (`BOX_BUDGET`, 05). hugo still opens at the depth the budget picks.
- A Change View home. `changedSubgraph` already roots a Change View; `home` returns `""` for any Change View, so it opens where it did before 11 (Deviation 17).
- Watch and live redraw (10's "feature 11"; see Status).

---

## Deviations and decisions for review

1. **Cycles are broken by weight, not only condensed.** The design said "SCC condensation plus longest path". On hugo's depth-1 view the lifted arcs make one strongly connected component of 25 of its 38 boxes, so condensation alone gives a rank of 25, which is no order at all. Inside each component, Eades, Lin and Smyth's greedy feedback-arc order (1993) keeps the heavier arcs, weighted by bundle pairs, and sets aside the arcs that point back. On hugo it sets aside 39 of 260 arcs and gives 17 ranks, at most 8 boxes in one. On kubernetes it sets aside none (11 ranks, at most 8 boxes in one). Set-aside arcs are drawn like any other line: they get no mark and no colour. Red keeps the one meaning it has today, a pinned bundle (a Policy violation, 06; decisions.md "violations stay red"), which ranks never set. Deterministic: sorted input, ties by the smallest id, iterative (a 20,000-node chain is tested).

   **The package anchor was measured and lost.** Go's package import graph is acyclic, so a box can be ranked with no heuristic: take the longest-path rank of each package, give the box the highest of its packages', and compact the values to 0, 1, … within the sibling set. Measured on the default views, top rank first (a prototype probe, not committed):

   | Repo (boxes) | Method | Ranks | Widest row | Row widths, top to bottom | Lines against or across the order |
   |---|---|---|---|---|---|
   | hugo (38) | Eades | **17** | 8 | 1,1,1,2,1,2,1,1,2,1,3,3,3,8,1,2,5 | 39 of 260 |
   | hugo (38) | anchor | 22 | 4 | 1,1,2,1,1,3,2,1,2,1,1,2,1,4,2,2,1,1,2,2,4,1 | 55 of 260 |
   | kubernetes (39) | Eades | **11** | 8 | 1,1,2,6,8,6,3,2,2,7,1 | 0 of 175 |
   | kubernetes (39) | anchor | 21 | 4 | 1,1,4,2,1,1,2,2,2,2,1,2,1,1,1,4,2,2,4,2,1 | 31 of 175 |
   | zu (5) | Eades | 3 | 3 | 1,1,3 | 0 |
   | zu (5) | anchor | 4 | 2 | 1,1,1,2 | 0 |
   | cobra (6) | Eades | 3 | 4 | 1,1,4 | 0 of 6 |
   | cobra (6) | anchor | 3 | 4 | 1,1,4 | 0 of 6 |

   (The lines column counts the lines between siblings whose ends sit in the same rank or run upward. zu's default view has none between its top-level siblings.) Eades wins. It gives fewer ranks (hugo 17 against 22, kubernetes 11 against 21), and fewer lines against the order: the anchor has no dropped arc to explain, but a box that holds both a low and a high package still has lines running upward. Every row stays within `WRAP`. At `ROW_MAX` (Deviation 14) kubernetes' 8-box rank draws as rows of 7 and 1; hugo's rows all fit.
   **Wide ranks wrap.** hugo and kubernetes need no wrapping (at most 8 per row), but a flat `internal/` of leaves all lands in one rank. `WRAP` = 10 boxes per row, in the siblings' order. A 25-box rank draws as rows of 10, 10 and 5 (layout.test.ts).
2. **The layout no longer sees drawn edges, and the rank rows are centred.** ELK gets only 07's step edges (O(n)), so drawing, hiding or hovering lines never moves a box. That is what makes B's "the layout is computed without edges" hold. React Flow already draws lines from the nodes' handles, not from ELK's routes (07's `inOrder` relies on it). Three option changes, each measured:
   - `nodePlacement.strategy: NETWORK_SIMPLEX`. The default Brandes–Köpf placement put each rank right of the one below, a staircase: hugo 2219 px wide for an 1800 px rank, kubernetes 3419 px for 1876. A `centred` pass then puts each row's middle over its siblings' middle. Task 6 replaces it with `packed`, which the page uses too (until then only `layout()` applied it; Deviation 14).
   - `spacing.nodeNodeBetweenLayers` 48 → 12. With a step layer between every two ranks, that is 24 px between ranks.
   - `spacing.edgeEdgeBetweenLayers` and `edgeNodeBetweenLayers` 0. Otherwise a rank's many step edges add space: kubernetes was 1208 px high, 808 px with this.
   ELK's time no longer grows with the lines drawn.
3. **D, the single-child descent, is resolved in `scene`, not written to the hash.** `focus: ""` still means "the page root" in the hash, so every hash round-trips unchanged. The page (and only the page) passes `{home: true}`, and `scene` then draws `home(view)` as the focus. The breadcrumb shows it, so hugo opens at `root / github.com/gohugoio/hugo`. At the root a single box would add nothing, so clicking "root" draws the home again: no `f=` sentinel is needed. Consequences:
   - **`d=N` shifts one level down** in a link to a repository with one module: N now counts below the module, not below the root. Old links open one level deeper than before.
   - In 05's declutter, a home view whose leaves sit in one container behaves as uml-viewer's single wrapping package: arrows equals full and classes only hides rows (05 Deviation 1). The e2e policy page shows this (Task 7).
   - **A Change View opens at the page root, as before 11.** `home` returns `""` for `kind: "change"`. The scrutiny found that without that check, a Change View whose only change is `hugolib/doctree` opened inside `hugolib` (cut.test.ts now covers it). A Proposal's layer boxes are not single-child chains, so `home` returns `""` there too.
   - **External modules do not count.** hugo's root holds its module and the externals oval ("79 external modules"). `home` walks the Package Tree only, which has no externals, and the home view still draws the oval (cut.test.ts, scene.test.ts).
   - **Going up.** Esc and "Go back one level" use `upTo`. Nothing happens at the page root or at home named by a link, a child of home goes to the page root (which draws home), and below that the parent box, as 05 did. The keys' `atRoot` is `upTo(…) === null`.
   - **The breadcrumb starts at home**, named by its id (`github.com/gohugoio/hugo`), with no "root" crumb above it. Its link goes to the page root, which draws home.
   - **Deep links and search are unchanged.** A hash with `f=` draws exactly what it drew before, with or without `home`, and so does a search pick, which sets `f` to the page root and selects the box (scene.test.ts).
4. **What auto hides, what off draws, and hover.** Auto with too many lines draws no line and no triangle at rest. The header says "N dependencies hidden; select or hover a box to see its own." Off is 05's "hide edges" unchanged: triangles, plus the selection's lines. The triangles stage (05) draws triangles whatever the mode. Hover lives in React state only (not the hash, not the scene). It adds the hovered box's lines only when lines are not all drawn already, from `scene.all` through `around`. The contract below has the full table.
5. **Auto draws at rest whatever must show** (F): a pinned bundle (a violation or a cycle arc, 06), an arrow with a Change Status (04), and an import from an Affected package to a marked one (04's Affected Set). So a Change View and a Policy View keep their meaning with the other lines hidden.
6. **The first view, and the `f` key, use `readableFit`; the Controls' fit button keeps React Flow's `fitView`.** The zoom floor is 11/12 (`.node` is 12 px; a test reads it from styles.css). `minZoom` stays 0.05, so a reader can still zoom out by hand. When the scene does not fit at the floor, its top sits 24 px below the canvas top, centred on its first row but clamped so no empty space shows beside it. A node the hash selects is centred instead of fitted, as before. The MiniMap (in `@xyflow/react` already) shows only when the first view is not whole. It is styled by CSS variables and makes no request, so the CSP is unchanged; the e2e run logs no CSP error in any engine.
7. **`tooBig` still counts drawn lines only** (`sc.lines && sc.edges.length > 500`). In auto with lines hidden, a view no longer collapses for its edge count, only for its 2,000 nodes. ELK no longer lays edges out, and 500 hidden lines cost nothing to draw. The e2e page `big.html` (720 imports) therefore asks for `l=1`, so 05's collapse is still tested. The decisions.md wording "500 laid-out edges" becomes "500 drawn lines" (Deviation 13).
8. **`EDGE_LIMIT` is 40.** Measured on the Test Corpus's default views: zu (at d120649) draws 24 lines and cobra 6, which stay drawn; hugo draws 260 and kubernetes 175, which go on demand. At 05's budget of 60 boxes, 40 lines can still be followed end to end. `on` draws every line for a reader who wants the hairball.
9. **Labels drop whole shared segments only.** In a sibling set of two or more, `shorten` drops the leading path segments all of them share, capped so the shortest label keeps its last segment: a label is never empty. A lone box is kept whole, because with nothing beside it nothing tells what was dropped. The full id stays in the box's `title` and in the Panel. 04's `scene04.json` snapshot changes in exactly two labels: `example.com/shop` → `shop` and `example.com/shop/tools` → `shop/tools`, twelve times each.
10. **Tiers are recomputed per scene,** from the bundles the scene keeps (after `minPairs`, externals and the cut). A deeper depth, a focus or a minimum pair count can re-rank siblings. That is intended: the ranks describe the lines the reader can ask to see.
11. **e2e amendments** (Task 7), each with its reason. 39 checks become 47:
    - `hidden`: the "Hide edges" checkbox is now the `edges` select; the check picks "off".
    - `collapsed`, `header`, `anyway`: `big.html#d=4&l=1`, because auto would hide its 720 lines (Deviation 7). The page opens at `m`, so the texts read "depth 1 (collapsed from 4)".
    - `change`: the first view is readable and may need a pan, and React Flow renders only what is on screen. The check zooms out with the Controls' fit button before counting the 19 nodes.
    - `ranks`, `redBox`, `panel`, `crap`: the fixtures open at `m` (home), so each depth drops by one and `m`'s own entries go. At `d=2` below `m` the leaves sit in one container, so arrows equals full (Deviation 3). The violation shows as a red line or red triangles at every stage instead of a red box, and the check now counts both. The red box after the arrows stage lifts a violation into a container; `policy.test.ts` ("violations hidden inside a box", depth 3 at every stage) still covers that case.
    - `fit`: the `f` key refits through `readableFit`, including after the hash centred a node.
    - new `overview`, on `big.html#d=1` (24 boxes, 144 lines): the note, 0 lines at rest, labels at 11 px or more on screen, a hover that draws both an `out` and an `in` line, none after the mouse leaves, and a minimap.
    - new `firstView` (Deviation 14), on `wide.html#d=2` at 1600 × 1000: 151 packages in one rank (taller than the screen once wrapped rows close up, and over the 60-box budget, hence `d=2`), with long names, 123,456 decls and 99 unresolved calls each, and one 62-character name. Want `[0, 3, 0, 0, 1]`: no `.label` or `.stats` clipped (`scrollWidth > clientWidth`), 3 rows found, no box (containers aside) of the top 3 rows partly off the canvas or under the minimap, and the minimap's button hides it (0) and shows it again (1). On Task 5's page with Task 6 as it was before the review, each engine gave `[1, 3, 3, 1, 1]`.
    - new `reading` (Deviation 15), on `big.html#d=1`: the axis reads `uses↓`, `depends on nothing here`; 3 boxes are drawn as hubs; the legend names them ("thick border: the 3 most used"); the header says "21 dependencies run against the order." (big.html's 24 groups form a ring, each using the next 6, so any order has at least 1 + 2 + … + 6 = 21 against it).
    - new `selectLines` and `keyboard` (Deviation 17), on `big.html#d=1`: a clicked box draws as many `dep-out` and `dep-in` lines as its stats line says (6 and 6), the `dep-in` dash is `2 3`; Esc clears it, and with the mouse away, Enter on the focused box selects it and draws the same 6 and 6.
    - new `narrowMap` (Deviation 17), `wide.html#d=2` at 800 × 900: no minimap at first; its button shows it.
    - new `policyRest` and `changeRest` (Deviation 17): `bigpolicy.html#d=1` (big.html with one violation) draws 1 line at rest, pinned; `bigchange.html` (big.html as a Change View with one added import), shown as the full project (25 boxes at depth 2), draws 1 line at rest, the added import's arrow.
12. **Old hashes keep their meaning, except an absent `l`.** 05 wrote `l=0` for "hide edges", and 05's, 07's and 09's records use it (`#d=3&l=0`, `#f=…pkg&d=6&l=0`, `…&d=2&l=0`, and the round-trip hash of 05/07). It still reads as off, and each writes back unchanged (state.test.ts). An absent `l` meant "lines on" and now means auto; that is the design's new default. 09's paint.mjs "default view, edges on" row measured the bare page. On kubernetes, 175 lines is over `EDGE_LIMIT`, so the bare page would now draw none. The script's usage names `#l=1` for that row (Task 7), so the row keeps measuring what it measured. kubernetes has no home (38 module roots), so 09's `d=3` and `d=6` are unchanged.
13. **Doc amendments, proposed for approval** (not task steps):
    - `decisions.md` l.41 (UI v1), replace "Views over 2,000 nodes or 500 laid-out edges collapse depth automatically and say so." with:
      > Views over 2,000 nodes or 500 drawn lines collapse depth automatically and say so. **Readable overview (11):** siblings are placed in rows by architecture rank (dependencies below dependents: Tarjan components, Eades–Lin–Smyth weighted cycle break, longest path; the Policy's Levels win in any sibling set that has one; more than 10 in a rank, or wider than 1,280 px, wrap into rows 6 px apart), from ranks alone, never from edges, so lines never move a box. Edges `auto` (default) / `on` / `off` in the hash (`l`); auto draws no line at rest over 40, except violations, changed imports and Affected imports, and a selected or hovered box draws its own (solid: it depends on; dotted: depends on it). The first view keeps labels at 11 px or more and pans (with a minimap) rather than shrink them. The page opens below single-child containers (external modules not counted), its breadcrumb starts there, and Esc never goes above it; siblings drop their shared path prefix, the full id in the title. `l=0` still means off. An axis labels the rows structurally ("uses ↓", "depends on nothing here" at the bottom); row names come only from Levels. The header counts the dependencies the cycle break set aside where it places the rows ("N dependencies run against the order", when there are any), with no colour. A Change View opens at the page root.
    - `glossary.md`, after **Level**, add:
      > ## Architecture Rank
      >
      > Where a box sits in the Project View when the Policy gives its siblings no Levels: dependencies below what depends on them, computed from the imports between the siblings. A placement only: nothing is a violation because of it. Distinct from a Level, which the Policy declares.

14. **The lead's screenshot review, all in Task 6.**
    - **The stats line was clipped.** A box read "N pkgs · N decls · N unresolved", and `sizeOf` allowed 24 characters at 7.5 px, capped at 280 px. Unresolved calls and decls now stay in the Panel (which already lists packages, declarations and unresolved calls) and the header; the box line is Deviation 15's. `scene` puts the line on each box node (`stats`), so `Canvas` draws and `sizeOf` measures the same text.
    - **`sizeOf` measures the text instead of counting characters.** `textWidth` adds each glyph's advance in the label font (600 12px system-ui). The advances were measured with canvas `measureText` in chromium, firefox and webkit on macOS, which agree to 0.01 px, and rounded up to 0.1 px. A glyph outside the table counts 12 px, the widest (`W`). Stats and method rows are smaller fonts, so the label table bounds them. The 280 px cap is gone: a long name makes a wide box. A label's line also reserves 18 px for a rank badge and 22 px for the toggle. The vitest case uses the longest stats line, `uses 9999 · used by 9999 · 99999 pkgs`.
    - **ELK's minimum size for a container was never met, and it stretched heights.** The minimum carried a container's label width. With `INCLUDE_CHILDREN`, ELK left the width at the content's (`shop#pkg`: 114 px against a 133 px minimum) and made the node taller: e2e's Change View `checkout` went from 76 px to 146 px, and `internal/store` fell below a 720 px window. The minimum is gone. `packed` widens a container to `containerWidth`: its label, rank badge, and toggle (22 px) or CRAP badge (72 px).
    - **The page never centred its rows.** `centred` (Task 2) ran inside `layout()`, which only the tests call. `App` built its positions with `inOrder(positions(…))`, so kubernetes' clipped sides in the first measurement were uncentred rows. `arrange` is now the one post-pass, used by `layout()` and `App` alike: flatten, apply the Policy order, then `packed`. `packed` lays each row GAP apart in ELK's order and centres it in its container, deepest containers first. `App` keys its layout on the container widths as well as the ELK input, because ELK no longer sees them.
    - **Rows fit the screen: a width budget, not a count chosen from the viewport.** Choosing `WRAP` from the canvas at fit time would make the layout depend on the window. Resizing would move boxes, and a hash would draw differently on another screen. `WRAP` = 7 alone would not hold either: kubernetes' widest box is 272 px, and 7 of those with gaps come to 2,048 px. So `ranked` closes a row at `WRAP` (10) boxes or before it grows wider than `ROW_MAX` = 1280 layout px, whichever comes first. A container counts as its own widest row plus padding. At the floor zoom 1280 px is 1,173 screen px, so the top rows show whole on a canvas 1,221 px wide or more (at 1600 × 1000 the canvas is 1,600 px). A single box wider than `ROW_MAX` gets a row of its own.
    - **The MiniMap can be hidden, not reserved in the fit.** The first view is anchored at the top, so the MiniMap (200 × 150 px, bottom right) covers what is lowest on screen. Reserving its corner in the fit would narrow every row for the whole session. A button in the Controls (▦, "Hide the minimap" / "Show the minimap", `aria-pressed`) toggles it, and the e2e `firstView` check proves that no box of the top 3 rows is under it at 1600 × 1000.

15. **Reading the overview at rest (the user: "not yet" easy to understand).** With lines hidden, nothing said how a box connects, what the rows mean or where to begin.
    - **Relationships on the box.** The stats line is `uses N · used by M`, then `· K pkgs` when a box holds more than one package (`tree.ts` `statsLine`). N and M count the distinct drawn nodes at the other end of the box's dependencies: the bundles the cut keeps, each end mapped to the node that draws it, the same source as the ranks (Deviation 17 corrects an earlier count from the drawn lines). So the text, and with it the box's size and the layout, is the same whatever the declutter stage, edge mode, hover or selection (scene.test.ts). The externals oval counts as a drawn node. Every box now carries at least `uses 0 · used by 0`, about 140 px, so `ROW_MAX` binds before `WRAP` for boxes; `WRAP` still binds for 90 px declarations (layout.test.ts moved its case there).
    - **What the rows mean.** A 22 px axis to the left of the canvas reads "uses ↓" at the top and "depends on nothing here" at the bottom (Deviations 16, 17) (vertical text, the arrow upright; `role="note"` with the full sentence as its label). It is a column beside the canvas, not over it, so the fit measures the canvas without it. Its `aria-label` is "Rows: a box uses the rows below it; at the bottom, boxes that depend on nothing here". The legend is a one-line strip above the canvas, no longer an overlay, because an always-shown legend covered boxes (the e2e hover could not reach `m/g00`). It opens with "rows are dependency order: a box mostly uses the rows below it". The on-demand lines entry now reads "hover or select a box for its lines: solid, it uses · dotted, used by".
    - **Where to start.** At rest (nothing selected) the `HUBS` = 3 boxes used by the most, at least one, ties by id, get `hub`: a 3 px border in the box's own border colour, with the padding 2 px smaller so the text keeps its room. It is named in the legend ("thick border: the 3 most used"). There is no new colour: red stays the violation's, and change marks keep border colour and outline. hugo marks `common`, `config` and `hugofs`; kubernetes marks `api`, `apimachinery` and `client-go`.

16. **The grouping ruling's two changes (R6, R7 of `docx/research/architecture-diagrams.md`).** The rows are ranks computed from imports, so the axis names only what the ranks guarantee.
    - **Structural labels.** The bottom of the axis reads "depends on nothing here", not "foundations": a box in the bottom rank uses none of its siblings (apart from dependencies counted against the order, below), which is all the rank says about it; in a sibling set the Policy's Levels place, the Levels decide instead. "uses ↓" runs along the axis. The ruling kept "entry points" at the top; Deviation 17 drops it. Semantic row names (a layer's name) come only from the Policy's Levels; 11 names no rows.
    - **The count of dependencies against the order.** The header adds "N dependencies run against the order." (`headline.ts` `againstNote`; "1 dependency runs"; nothing at 0, Deviation 17). N is the number of sibling pairs whose arcs the Eades–Lin–Smyth pass set aside to break a cycle (Deviation 1), summed over every sibling set these ranks place (not one the Policy's Levels place, Deviation 17): `rank.ts` `ranks` returns `{ tiers, against }`, `siblingRanks` sums it, and `tiers` and `siblingTiers` are unchanged wrappers. Repeated or lifted arcs of one pair count once. It is computed where tiers are, from the bundles the cut keeps, so the edge mode, hover and selection never change it (scene.test.ts). Nothing colours those arcs: red stays the violation's. hugo, at depth 1: 39 (its boxes are directories that each hold several packages, so boxes form cycles that packages cannot); kubernetes: 0.
    - The count is Eades' greedy, not a minimum feedback arc set, so it can be higher than the least possible; on the e2e ring it is the least (21).

17. **The outside scrutiny (`scrutiny-11.md`), as the lead ruled.** All in Tasks 5–7.
    - **M1: the stats counted lines, not dependencies.** `connect` counted `scene.all`, which the arrows, triangles and classes stages lift to containers. At depth 2 in the arrows stage, 134 of hugo's 151 boxes and 197 of kubernetes' 198 read "uses 0 · used by 0", and the hubs were arbitrary. `connect` now counts the kept bundles, each end mapped through `shown` to the node that draws it: the ranks' source. A new scene.test.ts case at depth 2 gives the same stats and hubs in the full, arrows and triangles stages. The e2e `selectLines` check proves a selected box draws as many lines out and in as its stats say.
    - **M2: "entry points" was not true.** Longest-path ranks drop each box as low as its dependencies allow; they do not lift a box nothing uses to the top. kubernetes' default view has 6 such boxes mid-page or low (`sample-cli-plugin` and `hack/tools/instrumentation` at tier 6, `hack/tools` at tier 1), and hugo has `scripts` on row 13 of 17. The axis keeps "uses ↓" and "depends on nothing here", which rank 0 guarantees. Entry points (`cmd`/`main` detection) are 12's.
    - **M3: `home` changed the Change View.** See Deviation 3.
    - **M4: "used by" had a removed edge's dash.** 04 draws `.edge-removed` with `stroke-dasharray: 6 4`, and 11 gave `.dep-in` the same. `.dep-in` is now `2 3`, which nothing else in `styles.css` uses. The legend says "dotted, used by".
    - **M5: a wrapped rank read as two.** `packed` re-stacks each set's rows top to bottom (it gets each node's level, `levelsOf`): the rows one rank wraps into sit `WRAP_GAP` = 6 px apart, and two ranks keep ELK's 24. A container shrinks by what its rows gave up. The corrected count for kubernetes is 11 ranks in 13 rows: rank 6 wraps 6 + 2 and rank 1 wraps 6 + 1.
    - **M6: the count covered Levels-placed sets.** `siblingRanks` takes `placed(container)`, and `scene` passes the containers whose children carry a Policy rank; their pairs are not counted (rank.test.ts, scene.test.ts).
    - **Performance.** `boxStats` walked every package for each box, and 11 moved it into `scene`, which runs on every change of state. Measured with the same probe (`scene` at kubernetes depth 4, 1812 nodes, six runs, Node 24): main (d120649, whose `web/` equals b8645e4's) 46–79 ms; before this fix 531–579 ms; now 62–107 ms. The first run builds the stats. `boxStats` now fills every box's sums in one pass up the box tree, once per View (a `WeakMap`, like `index`).
    - **The minimap starts hidden in a window under 900 px wide** (`viewport.ts` `mapByDefault`); its button shows it. On a 390 px phone it covered 4 to 8 boxes.
    - **The count is hidden at 0.** "0 dependencies run against the order." was noise on every acyclic view (kubernetes).
    - **Keyboard.** React Flow's Enter on a focused node selects it in React Flow's own store, which zu does not use. `nodesFocusable` stays on, and the canvas's `onKeyDown` selects the focused node on Enter or Space, as a click does. A button inside a box keeps its own keys. The e2e `keyboard` check covers it.
    - **e2e in a Change View and a Policy View:** the `policyRest` and `changeRest` checks (Deviation 11).
    - **Deferred** to Risks: kubernetes at 1280 × 720, and the header's height on a phone.

---

## Seams for 12 (grouping)

Feature 12 adds a module-level top view, noise demotion, a ~15-box budget with "+N" folds, a 7-row cap, opening the root module in place, and the Policy keys `demote` and `budget`. 11 builds none of them. It leaves these seams, each covered by 11's tests:

- **Rank: `rank.ts` `siblingRanks(parent, arcs, placed)`.** It ranks every sibling set of whatever tree `parent` describes and returns `{ tiers, against }`; `placed` names the sets another order places. A group is one more container in `parent`; its members rank inside it and the groups rank against each other, with no change to `rank.ts`.
- **Home: `cut.ts` `home(view)`.** The one place that decides which box the page root opens at; `upTo` and the breadcrumb follow it. Opening the root module in place changes where `home` stops.
- **Fold: `cut.ts` `cut(view, focus, depth, toggled)` and `leafOf`.** A leaf may already stand for many packages (a closed box, `OUTSIDE`). A "+N" fold is another such leaf: `leafOf` maps the folded packages to it, and bundles, tiers, stats and the against count follow without change.
- **Rows: `layout.ts` `ranked()`** with `WRAP` and `ROW_MAX`, and `packed`'s `levelsOf`. A row cap is a third limit where these two close a row.
- **Axis: `Canvas.tsx` `.axis`.** Named bands from Levels or groups would replace its three structural labels.

## The contract

**Hash:** `l` absent = `auto`, `l=1` = `on`, `l=0` = `off`. Any other value reads as `auto`. The other keys are unchanged.

**Lines**, per mode and 05 stage. "Hot" is 05's selection highlight (the selected box's lines, others dimmed), and "own" is the hovered box's lines from `around`. A pinned line is red; a pinned triangle is red.

| Mode | Stage | More than 40 lines? | At rest | Box selected | Box hovered |
|---|---|---|---|---|---|
| auto | full, arrows, elements, classes | no | every line (as before 11) | hot | nothing added |
| auto | full, arrows, elements, classes | yes | no line and no triangle, except pinned, changed and Affected lines; header note with the count | its own lines, `dep-out` solid and `dep-in` dotted (`2 3`) | its own lines, the same two styles |
| on | full, arrows, elements, classes | any | every line | hot | nothing added |
| off | any | any | 05's triangles (pinned red) | 05: its lines | its own lines |
| auto, on | triangles | any | 05's triangles (pinned red) | 05: its lines | its own lines |

**Change View (04):** it opens at the page root, as before 11. Every arrow with a Change Status, and every import from an Affected package to a marked one, is drawn at rest in auto. The `+N unchanged` chips and dimming are unchanged. **Policy View (06/07):** pinned lines are drawn at rest in auto, and a red box (07) still marks a violation hidden inside one box. A sibling set with any Policy rank is placed by it; unranked siblings beside ranked ones stand at level 0 (07, unchanged). A Proposal (07) places its layers by its own ranks.

**Layout:** for the same scene the same positions, whatever the edge mode, hover or selection (unit-tested: `elkGraph` is identical across modes). Rows hold at most 10 siblings of one rank and are at most 1280 px wide, a container counting as its widest row; a single wider box has its own row. No label or stats line is clipped: boxes and containers are as wide as their text. A box's stats line is `uses N · used by M[ · K pkgs]`, the same in every edge mode. The header counts the dependencies against the order when there are any, the same in every edge mode and declutter stage; so are the stats. Enter or Space on a focused box selects it.

**Going up:** Esc and "Go back one level" do nothing at the page root or at home. From a child of home they go to the page root, which draws home; elsewhere they go to the parent box. The breadcrumb's first crumb is home, named by its id, or "root" when there is no home.

**First view:** `readableFit(rects, canvas)`. When the whole scene fits at zoom ≥ 11/12 (at most 1.2), it is centred. Otherwise the zoom is 11/12, the scene's top sits 24 px below the canvas top, and x is centred on its first row, clamped to the scene's sides. `whole` is false and the MiniMap shows, until the reader hides it with its Controls button.

**At rest:** the axis and the legend strip always show; with nothing selected, the 3 most used boxes have a 3 px border.

---

# Tasks

### Task 1: Architecture ranks (`rank.ts`)

Pure ranking of one sibling set, then of a whole drawn tree. No UI.

**Files:**
- Create: `web/src/rank.ts`, `web/src/rank.test.ts`

**Steps:**

- [x] **Write the failing test**

<!-- file: web/src/rank.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import { siblingTiers, tiers, type Arc } from "./rank";

const arcs = (s: string): Arc[] =>
  s.split(" ").map((p) => {
    const [ends, w] = p.split("*");
    const [from, to] = ends.split(">");
    return w ? { from, to, weight: Number(w) } : { from, to };
  });
const listed = (m: Map<string, number>) => Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : 1)));

describe("tiers", () => {
  it("puts a dependency below its dependents, on the longest path", () => {
    // a → b → c and a → c: c is 0, b is 1, a is 2 (not 1: the longest path).
    expect(listed(tiers(["a", "b", "c", "d"], arcs("a>b b>c a>c")))).toEqual({ a: 2, b: 1, c: 0, d: 0 });
  });
  it("ignores self-loops and arcs that leave the set", () => {
    expect(listed(tiers(["a", "b"], arcs("a>a a>z z>b")))).toEqual({ a: 0, b: 0 });
  });
  it("breaks a cycle at its lightest arc", () => {
    // a ⇄ b with 5 pairs down and 1 back: a over b. b → c → a with more
    // weight on c → a than on a → b puts c over a over b.
    expect(listed(tiers(["a", "b"], arcs("a>b*5 b>a*1")))).toEqual({ a: 1, b: 0 });
    expect(listed(tiers(["a", "b"], arcs("a>b*1 b>a*5")))).toEqual({ a: 0, b: 1 });
    expect(listed(tiers(["a", "b", "c"], arcs("a>b*2 b>c*1 c>a*3")))).toEqual({ a: 1, b: 0, c: 2 });
  });
  it("breaks a tie by id, whatever order the input came in", () => {
    const one = tiers(["a", "b"], arcs("a>b b>a"));
    expect(listed(one)).toEqual({ a: 1, b: 0 });
    expect(tiers(["b", "a"], arcs("b>a a>b"))).toEqual(one);
  });
  it("adds the weights of repeated arcs", () => {
    expect(listed(tiers(["a", "b"], arcs("a>b*1 a>b*1 b>a*1")))).toEqual({ a: 1, b: 0 });
  });
  it("ranks a long chain without overflowing the stack", () => {
    const ids = Array.from({ length: 20000 }, (_, i) => `n${String(i).padStart(5, "0")}`);
    const t = tiers(ids, ids.slice(1).map((id, i) => ({ from: ids[i], to: id })));
    expect([t.get(ids[0]), t.get(ids[19999])]).toEqual([19999, 0]);
  });
});

describe("siblingTiers", () => {
  // A (a1, a2) and B (b1) at the top, with t beside them.
  const parent = new Map([["A", ""], ["B", ""], ["t", ""], ["a1", "A"], ["a2", "A"], ["b1", "B"]]);
  it("lifts each arc to the siblings under its ends' lowest common container", () => {
    expect(listed(siblingTiers(parent, arcs("a1>a2 a2>b1 t>a1")))).toEqual({ A: 1, B: 0, a1: 1, a2: 0, b1: 0, t: 2 });
  });
  it("adds the weights of arcs lifted onto one pair of siblings", () => {
    // a1 → b1 and a2 → b1 outweigh b1 → a1 together, not alone.
    expect(listed(siblingTiers(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3")))).toMatchObject({ A: 1, B: 0 });
  });
  it("counts nothing for an arc between a container and what it holds", () => {
    expect(listed(siblingTiers(parent, arcs("A>a1 a2>A")))).toEqual({ A: 0, B: 0, a1: 0, a2: 0, b1: 0, t: 0 });
  });
});
```

- [x] **Run:** `cd web && npx vitest run src/rank.test.ts` Expected: FAIL (`Failed to resolve import "./rank"`)

- [x] **Implement**

<!-- file: web/src/rank.ts -->
```ts
// Architecture ranks (11): where the Policy gives no Levels, each drawn
// sibling set is ranked from the dependencies between its members, so that a
// dependency sits below what depends on it (decisions.md, Levels rule: level 0
// at the bottom). Only the layout reads them. They are not Levels: nothing is
// badged with them, and nothing is a violation because of them.
import { cmp } from "./cut";

// Arc is a dependency between two siblings; weight is how many package pairs
// it carries (a bundle's pairs), 1 when absent.
export type Arc = { from: string; to: string; weight?: number };

// tiers ranks one sibling set, in three steps, sorted by id at every choice so
// the same input always gives the same ranks:
//  1. strongly connected components (Tarjan). Go forbids import cycles between
//     packages, but boxes that each hold several packages can form them.
//  2. inside each component, the lighter arcs of its cycles are set aside:
//     Eades, Lin and Smyth's greedy order (1993) on arc weights, and an arc
//     that points back in that order does not rank.
//  3. the longest path down over the arcs that remain: a node that depends on
//     nothing among its siblings is 0, any other is one more than its highest
//     dependency.
// Arcs to ids outside the set, and self-loops, are ignored.
export function tiers(ids: readonly string[], arcs: readonly Arc[]): Map<string, number> {
  const nodes = [...new Set(ids)].sort(cmp);
  const known = new Set(nodes);
  const weight = new Map<string, number>(); // "from\nto" → summed weight
  for (const a of arcs) {
    if (!known.has(a.from) || !known.has(a.to) || a.from === a.to) continue;
    const k = a.from + "\n" + a.to;
    weight.set(k, (weight.get(k) ?? 0) + (a.weight ?? 1));
  }
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const k of [...weight.keys()].sort(cmp)) {
    const [f, t] = k.split("\n");
    out.get(f)!.push(t);
  }
  const comp = components(nodes, out);
  const order = new Map<string, number>();
  const members = new Map<number, string[]>();
  for (const n of nodes) {
    const c = comp.get(n)!;
    const l = members.get(c);
    if (l) l.push(n);
    else members.set(c, [n]);
  }
  for (const m of members.values()) if (m.length > 1) greedy(m, out, weight).forEach((n, i) => order.set(n, i));
  // ranks: arcs that point back inside a component are set aside.
  const down = (v: string) =>
    out.get(v)!.filter((w) => comp.get(w) !== comp.get(v) || order.get(v)! < order.get(w)!);
  const rank = new Map<string, number>();
  const visit = (v: string): number => {
    const hit = rank.get(v);
    if (hit !== undefined) return hit;
    // Iterative: a long chain must not overflow the stack.
    const work = [v];
    while (work.length) {
      const x = work[work.length - 1];
      const todo = down(x).filter((w) => !rank.has(w));
      if (todo.length) {
        work.push(...todo);
        continue;
      }
      work.pop();
      if (!rank.has(x)) rank.set(x, Math.max(-1, ...down(x).map((w) => rank.get(w)!)) + 1);
    }
    return rank.get(v)!;
  };
  return new Map(nodes.map((n) => [n, visit(n)]));
}

// components numbers the strongly connected components (Tarjan, iterative).
function components(nodes: readonly string[], out: ReadonlyMap<string, string[]>): Map<string, number> {
  const at = new Map<string, number>();
  const low = new Map<string, number>();
  const comp = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  let next = 0;
  let count = 0;
  const open = (v: string) => {
    at.set(v, next);
    low.set(v, next++);
    stack.push(v);
    on.add(v);
  };
  for (const root of nodes) {
    if (at.has(root)) continue;
    open(root);
    const work: [string, number][] = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const [v, i] = top;
      const succ = out.get(v)!;
      if (i < succ.length) {
        top[1]++;
        const w = succ[i];
        if (!at.has(w)) {
          open(w);
          work.push([w, 0]);
        } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, at.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work[work.length - 1][0];
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
      }
      if (low.get(v) === at.get(v)) {
        for (;;) {
          const w = stack.pop()!;
          on.delete(w);
          comp.set(w, count);
          if (w === v) break;
        }
        count++;
      }
    }
  }
  return comp;
}

// greedy is Eades, Lin and Smyth's order of one component: sinks go to the
// end, sources to the front, and otherwise the node whose outgoing weight
// most exceeds its incoming weight goes to the front. Ties: the smallest id.
function greedy(members: readonly string[], out: ReadonlyMap<string, string[]>, weight: ReadonlyMap<string, number>): string[] {
  const left = new Set(members);
  const inW = new Map(members.map((m) => [m, 0]));
  const outW = new Map(members.map((m) => [m, 0]));
  const into = new Map<string, string[]>(members.map((m) => [m, []]));
  for (const f of members) for (const t of out.get(f)!) {
    if (!left.has(t)) continue;
    const w = weight.get(f + "\n" + t)!;
    outW.set(f, outW.get(f)! + w);
    inW.set(t, inW.get(t)! + w);
    into.get(t)!.push(f);
  }
  const front: string[] = [];
  const back: string[] = [];
  const take = (v: string) => {
    left.delete(v);
    for (const t of out.get(v)!) if (left.has(t)) inW.set(t, inW.get(t)! - weight.get(v + "\n" + t)!);
    for (const f of into.get(v)!) if (left.has(f)) outW.set(f, outW.get(f)! - weight.get(f + "\n" + v)!);
  };
  const sorted = [...members].sort(cmp);
  while (left.size) {
    const rest = sorted.filter((m) => left.has(m));
    const sink = rest.find((m) => outW.get(m) === 0);
    if (sink !== undefined) {
      back.unshift(sink);
      take(sink);
      continue;
    }
    const source = rest.find((m) => inW.get(m) === 0);
    const best = source ?? rest.reduce((b, m) => (outW.get(m)! - inW.get(m)! > outW.get(b)! - inW.get(b)! ? m : b));
    front.push(best);
    take(best);
  }
  return [...front, ...back];
}

// siblingTiers ranks every sibling set of a drawn tree. parent maps each
// drawn node to its container ("" at the top). An arc between two drawn nodes
// counts between the two siblings that hold its ends under their lowest
// common container, and arcs lifted onto the same pair add their weights; an
// arc between a container and something inside it counts nowhere.
export function siblingTiers(parent: ReadonlyMap<string, string>, arcs: readonly Arc[]): Map<string, number> {
  const chain = (id: string) => {
    const c: string[] = [];
    for (let x: string | undefined = id; x !== undefined && x !== ""; x = parent.get(x)) c.unshift(x);
    return c;
  };
  const kids = new Map<string, string[]>();
  for (const [id, p] of parent) {
    const l = kids.get(p);
    if (l) l.push(id);
    else kids.set(p, [id]);
  }
  const lifted = new Map<string, Arc[]>();
  for (const a of arcs) {
    if (!parent.has(a.from) || !parent.has(a.to)) continue;
    const [x, y] = [chain(a.from), chain(a.to)];
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    if (i === x.length || i === y.length) continue;
    const p = parent.get(x[i])!;
    const arc = { from: x[i], to: y[i], weight: a.weight ?? 1 };
    const l = lifted.get(p);
    if (l) l.push(arc);
    else lifted.set(p, [arc]);
  }
  const out = new Map<string, number>();
  for (const [p, ids] of kids) for (const [id, r] of tiers(ids, lifted.get(p) ?? [])) out.set(id, r);
  return out;
}
```

- [x] **Run:** `cd web && npx vitest run src/rank.test.ts && npx tsc --noEmit` Expected: PASS, 9 tests

### Task 2: The layout places ranks, not edges

`scene` gives each drawn node its `tier` (Deviation 1), and `elkGraph` stops passing drawn edges. `ranked` runs on every scene: the Policy's ranks where a sibling set has one, tiers elsewhere. A rank of more than `WRAP` (10) boxes wraps into rows (Deviation 1). The rows are 24 px apart and, in `layout()`, centred (Deviation 2; the page centres them from Task 6).

**Files:**
- Modify: `web/src/scene.ts`, `web/src/layout.ts`, `web/src/layout.test.ts`

**Steps:**

- [x] **Write the failing tests.** "no drawn edge" replaces the old edge assertion. The step-node test now sees only step edges. 07's "keeps edges that climb" becomes "ranks inside siblings of one rank". Four new tests cover architecture ranks, one of them the wrap.

```diff
diff --git a/web/src/layout.test.ts b/web/src/layout.test.ts
--- a/web/src/layout.test.ts
+++ b/web/src/layout.test.ts
@@ -3,7 +3,7 @@ import ELK from "elkjs/lib/elk.bundled.js";
 import type { ElkNode } from "elkjs/lib/elk-api";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { parseView } from "./data";
-import { absolute, elkGraph, inOrder, layout, orderOf, positions, sizeOf, superseding, Superseded, triangles, type Stoppable } from "./layout";
+import { absolute, elkGraph, inOrder, layout, orderOf, positions, sizeOf, superseding, Superseded, triangles, WRAP, type Stoppable } from "./layout";
 import { scene } from "./scene";
 import { DEFAULT_STATE } from "./state";
 import { edge, pkgs, view } from "./testkit";
@@ -24,15 +24,14 @@ describe("layout", () => {
     const [s, i, m] = ["example.com/shop/internal/store", "example.com/shop/internal", "example.com/shop"].map((id) => a.get(id)!);
     expect(abs).toEqual({ x: s.x + i.x + m.x, y: s.y + i.y + m.y });
   });
-  it("sizes come from text: box stats, method rows, container labels; edges only with lines", () => {
+  it("sizes come from text: box stats, method rows, container labels; no drawn edge", () => {
     const g = elkGraph(scene(v, DEFAULT_STATE));
     expect(g.layoutOptions?.["elk.spacing.nodeNode"]).toBe("24");
     expect(g.children?.[0].layoutOptions?.["elk.nodeSize.constraints"]).toBe("MINIMUM_SIZE");
     expect(sizeOf({ id: "x", label: "gen", parent: "", shape: "box", dim: false, selected: false, methods: [] }).w).toBe(204);
     expect(sizeOf({ id: "x", label: "T", parent: "", shape: "decl", dim: false, selected: false, methods: ["Get", "Put"] }))
       .toEqual({ w: 90, h: 76 });
-    expect(g.edges).toHaveLength(7);
-    expect(elkGraph(scene(v, { ...DEFAULT_STATE, lines: false })).edges).toEqual([]);
+    expect(g.edges!.filter((e) => !e.id.includes("__rank:"))).toEqual([]);
   });
   it("triangles sit on the top and bottom edges, apex out (uml-viewer)", () => {
     expect(triangles(100, 40)).toEqual({ in: "50,-10.39 44,0 56,0", out: "44,40 56,40 50,50.39" });
@@ -64,14 +63,11 @@ describe("levels and order (07)", () => {
     expect(absolute(a, "m/x")!.x).toBeLessThan(absolute(a, "m/core")!.x); // order: [m/x, m/core]
   });
 
-  it("steps between ranks, and leaves edges that climb the ranks out of the layout", () => {
+  it("steps between ranks, and gives ELK no other edge", () => {
     const g = elkGraph(scene(levels, { ...DEFAULT_STATE, depth: 3 }));
     const m = g.children![0];
     expect(m.children!.map((c) => c.id)).toEqual(["m/x", "m/core", "m/api", "__rank:m:1"]);
-    expect(g.edges!.map((e) => e.id)).toEqual([
-      "m/api/h→m/core/a", "__rank:m:1→m/x", "__rank:m:1→m/core", "m/api→__rank:m:1",
-    ]);
-    expect(JSON.stringify(elkGraph(scene(v, DEFAULT_STATE)))).not.toContain("__rank");
+    expect(g.edges!.map((e) => e.id)).toEqual(["__rank:m:1→m/x", "__rank:m:1→m/core", "m/api→__rank:m:1"]);
   });
 
   it("never places a higher rank below a lower one on zu's own layering", async () => {
@@ -94,17 +90,13 @@ describe("levels and order (07)", () => {
     expect([...a.keys()].some((id) => id.startsWith("__rank"))).toBe(false);
   });
 
-  it("keeps edges that climb only inside siblings of one rank, and still ranks inside them", async () => {
-    // m/a and m/b both roll up to rank 1, and each imports up into the other:
-    // the edges do not climb between m/a and m/b, so they stay in the input,
-    // where with the steps inside m/a and m/b they form a cycle ELK breaks.
+  it("ranks inside siblings of one rank, whichever way edges point", async () => {
+    // m/a and m/b both roll up to rank 1, and each imports up into the other.
     const x = view(
       [...pkgs(["m/a/hi", "m/b/hi"], "m", { rank: 1 }), ...pkgs(["m/a/lo", "m/b/lo"], "m", { rank: 0 })],
       [{ ...edge("m/a/lo", "m/b/hi"), violation: "levels" }, { ...edge("m/b/lo", "m/a/hi"), violation: "levels" }],
     );
-    const sc = scene(x, { ...DEFAULT_STATE, depth: 3 });
-    expect(elkGraph(sc).edges!.map((e) => e.id)).toEqual(expect.arrayContaining(["m/a/lo→m/b/hi", "m/b/lo→m/a/hi"]));
-    const a = await layout(sc, elk);
+    const a = await layout(scene(x, { ...DEFAULT_STATE, depth: 3 }), elk);
     for (const p of ["m/a", "m/b"]) expect(absolute(a, `${p}/hi`)!.y, p).toBeLessThan(absolute(a, `${p}/lo`)!.y);
   });
 
@@ -132,6 +124,75 @@ describe("levels and order (07)", () => {
   });
 });
 
+// 11: without Levels, each sibling set is ranked from its own dependencies.
+describe("architecture ranks (11)", () => {
+  it("draws a dependency below what depends on it", async () => {
+    // m/web → m/app → m/db, m/web → m/db, and m/tool alone: web over app
+    // over db, tool with db at the bottom. m/app/x → m/app/y inside m/app.
+    const x = view(pkgs(["m/web", "m/app/x", "m/app/y", "m/db", "m/tool"], "m"), [
+      edge("m/web", "m/app/x"), edge("m/app/x", "m/db"), edge("m/web", "m/db"), edge("m/app/x", "m/app/y"),
+    ]);
+    const sc = scene(x, { ...DEFAULT_STATE, depth: 3 });
+    expect(Object.fromEntries(sc.nodes.map((n) => [n.id, n.tier])))
+      .toEqual({ m: 0, "m/app": 1, "m/app/x": 1, "m/app/y": 0, "m/db": 0, "m/tool": 0, "m/web": 2 });
+    const a = await layout(sc, elk);
+    const y = (id: string) => absolute(a, id)!.y;
+    expect(y("m/web")).toBeLessThan(y("m/app"));
+    expect(y("m/app/x")).toBeLessThan(y("m/app/y"));
+    expect(y("m/app") + a.get("m/app")!.h).toBeLessThan(y("m/db"));
+    expect(y("m/tool")).toBe(y("m/db"));
+  });
+
+  it("stacks ranks as rows over one centre, as wide as the widest row, not a staircase", async () => {
+    // m/a → m/b → m/c over six leaves m/l0..m/l5 that m/c imports: hugo's
+    // shape. ELK's default placement drew each rank right of the one below.
+    const leaves = Array.from({ length: 6 }, (_, i) => `m/l${i}`);
+    const x = view(pkgs(["m/a", "m/b", "m/c", ...leaves], "m"), [
+      edge("m/a", "m/b"), edge("m/b", "m/c"), ...leaves.map((l) => edge("m/c", l)),
+    ]);
+    const a = await layout(scene(x, { ...DEFAULT_STATE, focus: "m" }), elk);
+    const mid = (id: string) => a.get(id)!.x + a.get(id)!.w / 2;
+    const row = leaves.map((l) => a.get(l)!);
+    const left = Math.min(...row.map((r) => r.x));
+    const right = Math.max(...row.map((r) => r.x + r.w));
+    for (const id of ["m/a", "m/b", "m/c"]) expect(Math.abs(mid(id) - (left + right) / 2)).toBeLessThan(1);
+    const all = [...a.values()];
+    expect(Math.max(...all.map((r) => r.x + r.w)) - Math.min(...all.map((r) => r.x))).toBe(right - left);
+    // Two ranks are one step layer apart, 12 px either side of it, however
+    // many step edges fan out: kubernetes' 38 boxes were 1208 px high, 808 so.
+    const gap = (hi: string, lo: string) => a.get(lo)!.y - (a.get(hi)!.y + a.get(hi)!.h);
+    expect([gap("m/a", "m/b"), gap("m/c", "m/l0")]).toEqual([24, 24]);
+  });
+
+  it("wraps a rank wider than WRAP boxes into rows of WRAP, in order", async () => {
+    // m/top over 25 leaves of rank 0, as a flat internal/ of leaves would be.
+    const leaves = Array.from({ length: 25 }, (_, i) => `m/l${String(i).padStart(2, "0")}`);
+    const x = view(pkgs(["m/top", ...leaves], "m"), leaves.map((l) => edge("m/top", l)));
+    const a = await layout(scene(x, { ...DEFAULT_STATE, focus: "m" }), elk);
+    const rows = new Map<number, string[]>();
+    for (const l of leaves) rows.set(a.get(l)!.y, [...(rows.get(a.get(l)!.y) ?? []), l]);
+    expect(WRAP).toBe(10);
+    expect([...rows.values()].map((r) => r.length)).toEqual([10, 10, 5]);
+    expect([...rows.values()].map((r) => r[0])).toEqual(["m/l00", "m/l10", "m/l20"]);
+    expect(Math.min(...rows.keys())).toBeGreaterThan(a.get("m/top")!.y);
+  });
+
+  it("uses the Policy's ranks in a sibling set that has one, and tiers in the others", async () => {
+    // m/api is rank 1 and m/core rank 0; m/util/lo and m/util/hi are
+    // unranked, and hi imports lo.
+    const x = {
+      ...view([...pkgs(["m/api"], "m", { rank: 1 }), ...pkgs(["m/core"], "m", { rank: 0 }), ...pkgs(["m/util/hi", "m/util/lo"], "m")],
+        [edge("m/core", "m/api"), edge("m/util/hi", "m/util/lo")]),
+      policy: { hash: "sha256:p", levels: [["m/core"], ["m/api"]] },
+    };
+    const a = await layout(scene(x, { ...DEFAULT_STATE, depth: 3 }), elk);
+    const y = (id: string) => absolute(a, id)!.y;
+    expect(y("m/api")).toBeLessThan(y("m/core")); // the Policy wins over core → api
+    expect(y("m/util")).toBe(y("m/core")); // unranked beside ranked: level 0
+    expect(y("m/util/hi")).toBeLessThan(y("m/util/lo")); // no rank inside m/util: tiers
+  });
+});
+
 // fake is an engine whose layouts finish when the test says so.
 function fakes() {
   const made: { stopped: boolean; jobs: { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] }[] = [];
```

- [x] **Run:** `cd web && npx vitest run src/layout.test.ts` Expected: FAIL (drawn edges still in `elkGraph`, no `tier`, rows not centred)

- [x] **Implement**

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -6,6 +6,7 @@ import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
 import { rolledRanks } from "./policy";
+import { siblingTiers } from "./rank";
 import { withinHops } from "./select";
 import type { Known, Stage, ViewState } from "./state";
 
@@ -19,6 +20,7 @@ export type SceneNode = {
   change?: string; // the Change View class (change.ts nodeMark, or "has-change")
   rowMarks?: string[]; // the Change View class of each method row
   rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
+  tier?: number; // 11: its architecture rank among its siblings (rank.ts); only the layout reads it
   hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
   order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
   crap?: { risk: Risk; band: Band }; // 08: a box's rolled μ+σ, a function's own CRAP; null = no coverage data
@@ -166,6 +168,13 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     selected = row.selected;
     for (const n of nodes) n.selected = n.id === selected;
   }
+  // 11: every drawn node's architecture rank, from the bundles this cut
+  // keeps, drawn or not, so showing or hiding lines never moves a box.
+  const tiers = siblingTiers(
+    new Map(nodes.map((n) => [n.id, n.parent])),
+    kept.map((b) => ({ from: shown(b.from), to: shown(b.to), weight: b.pairs })),
+  );
+  for (const n of nodes) n.tier = tiers.get(n.id);
 
   const edges: SceneEdge[] = [];
   for (const a of d.arrows) {
```

```diff
diff --git a/web/src/layout.ts b/web/src/layout.ts
--- a/web/src/layout.ts
+++ b/web/src/layout.ts
@@ -28,14 +28,25 @@ const rootOptions = {
   "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
   "elk.hierarchyHandling": "INCLUDE_CHILDREN",
   "elk.spacing.nodeNode": String(GAP),
-  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
+  // 11: 12, not 48: ELK routes no edge now, and ranked's step layers
+  // double every gap between two ranks.
+  "elk.layered.spacing.nodeNodeBetweenLayers": "12",
+  // 11: the step nodes are zero-size, and the default placement (Brandes-Köpf)
+  // set each rank beside the one below it, a staircase twice as wide as the
+  // widest rank (hugo 2219 px for a 1800 px rank). Network simplex keeps
+  // them within the widest; centred then puts each over the middle.
+  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
+  // 11: and a rank's many step edges add no space between two ranks.
+  "elk.layered.spacing.edgeEdgeBetweenLayers": "0",
+  "elk.layered.spacing.edgeNodeBetweenLayers": "0",
 };
 
 // elkGraph is the layout input: containers as compound nodes wide enough for
-// their label, leaves sized by sizeOf, and the edges only when lines are drawn.
-// Siblings in the Policy's order come first; inOrder places them. When any
-// node has a rank, level 0 is drawn at the bottom (decisions.md, Levels rule):
-// see ranked below.
+// their label, and leaves sized by sizeOf. It holds no drawn edge (11): the
+// ranks alone place the nodes, so lines can come and go (edges.ts) and
+// nothing moves. Siblings in the Policy's order come first; inOrder places
+// them. Level 0 is drawn at the bottom (decisions.md, Levels rule): see
+// ranked below.
 export function elkGraph(sc: Scene): ElkNode {
   const byParent = new Map<string, SceneNode[]>();
   for (const n of sc.nodes) {
@@ -45,7 +56,7 @@ export function elkGraph(sc: Scene): ElkNode {
   }
   const last = Number.MAX_SAFE_INTEGER;
   for (const l of byParent.values()) l.sort((a, b) => (a.order ?? last) - (b.order ?? last));
-  const rank = sc.nodes.some((n) => n.rank !== undefined) ? ranked(sc, byParent) : null;
+  const rank = sc.nodes.some((n) => n.rank !== undefined || n.tier !== undefined) ? ranked(byParent) : null;
   const build = (n: SceneNode): ElkNode => {
     if (n.shape !== "container") {
       const { w, h } = sizeOf(n);
@@ -61,60 +72,54 @@ export function elkGraph(sc: Scene): ElkNode {
       children: [...(byParent.get(n.id) ?? []).map(build), ...(rank?.steps.get(n.id) ?? [])],
     };
   };
-  const edges = sc.lines ? sc.edges.filter((e) => rank?.keeps(e) ?? true) : [];
   return {
     id: "__root",
     layoutOptions: rootOptions,
     children: [...(byParent.get("") ?? []).map(build), ...(rank?.steps.get("") ?? [])],
-    edges: [...edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })), ...(rank?.edges ?? [])],
+    edges: rank?.edges ?? [],
   };
 }
 
 export const STEP = "__rank:"; // the id prefix of ranked's invisible nodes
 
+// WRAP is the most siblings of one rank drawn side by side (11). A wider rank,
+// such as a flat internal/ of leaves that all land in rank 0, wraps into rows
+// of WRAP, in the siblings' order, each row below the last.
+export const WRAP = 10;
+
 // ranked puts siblings with a higher rank above those with a lower one, in
-// every container; unranked nodes count as level 0, as in uml-viewer
-// (layout.clj place-classes, l.293). ELK's own partitioning orders a flat
+// every container. A sibling set in which any node has a Policy rank uses
+// the Policy's ranks, unranked nodes counting as level 0, as in uml-viewer
+// (layout.clj place-classes, l.293); any other set uses the architecture
+// ranks scene computed (rank.ts, 11). ELK's own partitioning orders a flat
 // graph but is ignored inside compound nodes with INCLUDE_CHILDREN, which zu
-// needs (measured in elkjs 0.12), so between each two ranks present among
-// siblings ranked adds an invisible zero-size step node, with an edge from
-// every node of the higher rank to it and from it to every node of the lower:
-// O(n) edges. A drawn edge that climbs the ranks between the siblings under
-// its lowest common container (a violation, or an unranked importer) is left
-// out of the layout input, so it cannot fight those steps; the canvas still
-// draws it. An edge that climbs only deeper, inside siblings of one rank,
-// stays in, and ELK breaks the cycle it makes with the inner steps.
-function ranked(sc: Scene, byParent: ReadonlyMap<string, SceneNode[]>) {
-  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
-  const level = (n: SceneNode) => n.rank ?? 0;
+// needs (measured in elkjs 0.12), so between each two rows ranked adds an
+// invisible zero-size step node, with an edge from every node of the upper
+// row to it and from it to every node of the lower: O(n) edges, and the only
+// edges ELK sees. A row is a rank, or WRAP boxes of a wider one.
+function ranked(byParent: ReadonlyMap<string, SceneNode[]>) {
   const steps = new Map<string, ElkNode[]>();
   const edges: { id: string; sources: string[]; targets: string[] }[] = [];
   for (const [parent, kids] of byParent) {
+    const policy = kids.some((k) => k.rank !== undefined);
+    const level = (n: SceneNode) => (policy ? n.rank : n.tier) ?? 0;
     const levels = [...new Set(kids.map(level))].sort((a, b) => b - a);
-    for (let i = 0; i + 1 < levels.length; i++) {
-      const id = `${STEP}${parent}:${levels[i]}`;
+    const rows: { name: string; nodes: SceneNode[] }[] = [];
+    for (const l of levels) {
+      const at = kids.filter((k) => level(k) === l);
+      for (let i = 0; i < at.length; i += WRAP) rows.push({ name: i === 0 ? `${l}` : `${l}.${i / WRAP}`, nodes: at.slice(i, i + WRAP) });
+    }
+    for (let i = 0; i + 1 < rows.length; i++) {
+      const id = `${STEP}${parent}:${rows[i].name}`;
       steps.set(parent, [...(steps.get(parent) ?? []), { id, width: 0, height: 0 }]);
+      const [upper, lower] = [new Set(rows[i].nodes), new Set(rows[i + 1].nodes)];
       for (const k of kids) {
-        if (level(k) === levels[i]) edges.push({ id: `${k.id}→${id}`, sources: [k.id], targets: [id] });
-        if (level(k) === levels[i + 1]) edges.push({ id: `${id}→${k.id}`, sources: [id], targets: [k.id] });
+        if (upper.has(k)) edges.push({ id: `${k.id}→${id}`, sources: [k.id], targets: [id] });
+        if (lower.has(k)) edges.push({ id: `${id}→${k.id}`, sources: [id], targets: [k.id] });
       }
     }
   }
-  // chain is a node and its containers, outermost first.
-  const chain = (id: string) => {
-    const out: SceneNode[] = [];
-    for (let n = byId.get(id); n; n = byId.get(n.parent)) out.unshift(n);
-    return out;
-  };
-  // keeps: the two sides of the edge under their lowest common container do
-  // not climb the ranks.
-  const keeps = (e: { from: string; to: string }) => {
-    const [a, b] = [chain(e.from), chain(e.to)];
-    let i = 0;
-    while (i < a.length && i < b.length && a[i] === b[i]) i++;
-    return i === a.length || i === b.length || level(a[i]) >= level(b[i]);
-  };
-  return { steps, edges, keeps };
+  return { steps, edges };
 }
 
 // positions flattens ELK's result; x and y are relative to the parent, as
@@ -132,7 +137,7 @@ export function positions(g: ElkNode): Map<string, Placed> {
   return out;
 }
 
-export const layout = async (sc: Scene, engine: Engine) => inOrder(positions(await engine.layout(elkGraph(sc))), orderOf(sc));
+export const layout = async (sc: Scene, engine: Engine) => centred(inOrder(positions(await engine.layout(elkGraph(sc))), orderOf(sc)));
 
 // orderOf is each ordered node's index in the Policy's order.
 export const orderOf = (sc: Scene): ReadonlyMap<string, number> =>
@@ -149,30 +154,10 @@ export const orderOf = (sc: Scene): ReadonlyMap<string, number> =>
 // ELK's placement.
 export function inOrder(placed: Map<string, Placed>, order: ReadonlyMap<string, number>): Map<string, Placed> {
   if (order.size === 0) return placed;
-  const byParent = new Map<string, string[]>();
-  for (const [id, p] of placed) {
-    const l = byParent.get(p.parent ?? "");
-    if (l) l.push(id);
-    else byParent.set(p.parent ?? "", [id]);
-  }
   const out = new Map(placed);
   const last = Number.MAX_SAFE_INTEGER;
-  for (const ids of byParent.values()) {
-    // rows: siblings whose vertical extents overlap share an ELK layer.
-    ids.sort((a, b) => placed.get(a)!.y - placed.get(b)!.y || cmp(a, b));
-    const rows: string[][] = [];
-    let bottom = -Infinity;
-    for (const id of ids) {
-      const p = placed.get(id)!;
-      if (rows.length && p.y < bottom) {
-        rows[rows.length - 1].push(id);
-        bottom = Math.max(bottom, p.y + p.h);
-      } else {
-        rows.push([id]);
-        bottom = p.y + p.h;
-      }
-    }
-    for (const row of rows) {
+  for (const ids of siblings(placed).values()) {
+    for (const row of rowsOf(ids, placed)) {
       if (!row.some((id) => order.has(id))) continue;
       let x = Math.min(...row.map((id) => placed.get(id)!.x));
       row.sort((a, b) => (order.get(a) ?? last) - (order.get(b) ?? last) || cmp(a, b));
@@ -186,6 +171,54 @@ export function inOrder(placed: Map<string, Placed>, order: ReadonlyMap<string,
   return out;
 }
 
+// centred moves each row of siblings sideways so that its middle is the
+// middle of all the siblings (11): ranks read as a stack, not a staircase. A
+// row keeps its order and spacing, and never leaves its container, which is
+// at least as wide as its widest row. Lines follow, as in inOrder.
+export function centred(placed: Map<string, Placed>): Map<string, Placed> {
+  const out = new Map(placed);
+  for (const ids of siblings(placed).values()) {
+    const at = ids.map((id) => placed.get(id)!);
+    const mid = (Math.min(...at.map((p) => p.x)) + Math.max(...at.map((p) => p.x + p.w))) / 2;
+    for (const row of rowsOf(ids, placed)) {
+      const ps = row.map((id) => placed.get(id)!);
+      const dx = mid - (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x + p.w))) / 2;
+      for (const id of row) out.set(id, { ...placed.get(id)!, x: placed.get(id)!.x + dx });
+    }
+  }
+  return out;
+}
+
+// siblings groups placed ids by their container ("" at the top).
+function siblings(placed: ReadonlyMap<string, Placed>): Map<string, string[]> {
+  const byParent = new Map<string, string[]>();
+  for (const [id, p] of placed) {
+    const l = byParent.get(p.parent ?? "");
+    if (l) l.push(id);
+    else byParent.set(p.parent ?? "", [id]);
+  }
+  return byParent;
+}
+
+// rowsOf splits siblings into rows, top to bottom: siblings whose vertical
+// extents overlap share an ELK layer.
+function rowsOf(ids: string[], placed: ReadonlyMap<string, Placed>): string[][] {
+  const sorted = [...ids].sort((a, b) => placed.get(a)!.y - placed.get(b)!.y || cmp(a, b));
+  const rows: string[][] = [];
+  let bottom = -Infinity;
+  for (const id of sorted) {
+    const p = placed.get(id)!;
+    if (rows.length && p.y < bottom) {
+      rows[rows.length - 1].push(id);
+      bottom = Math.max(bottom, p.y + p.h);
+    } else {
+      rows.push([id]);
+      bottom = p.y + p.h;
+    }
+  }
+  return rows;
+}
+
 // absolute is a node's position on the canvas: its own plus its parents'.
 export function absolute(placed: ReadonlyMap<string, Placed>, id: string): { x: number; y: number } | null {
   let p = placed.get(id);
```

- [x] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

### Task 3: Siblings drop their shared prefix

**Files:**
- Create: `web/src/labels.ts`, `web/src/labels.test.ts`
- Modify: `web/src/scene.ts`, `web/src/scene.test.ts`, `web/src/__snapshots__/scene04.json`

**Steps:**

- [x] **Write the failing tests.** The snapshot's two labels change (Deviation 9).

<!-- file: web/src/labels.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import { shorten } from "./labels";

describe("shorten", () => {
  it("drops the whole segments every sibling shares", () => {
    expect(shorten(["k8s.io/api", "k8s.io/apimachinery", "k8s.io/kubernetes/hack/tools"]))
      .toEqual(["api", "apimachinery", "kubernetes/hack/tools"]);
    expect(shorten(["github.com/a/x/p", "github.com/a/x/q"])).toEqual(["p", "q"]);
  });
  it("never cuts inside a segment", () => {
    expect(shorten(["k8s.io/api", "k8s.io2/api"])).toEqual(["k8s.io/api", "k8s.io2/api"]);
  });
  it("never empties a label: one that is all prefix keeps its last segment", () => {
    expect(shorten(["k8s.io/kubernetes", "k8s.io/kubernetes/hack"])).toEqual(["kubernetes", "kubernetes/hack"]);
    expect(shorten(["a", "a/b"])).toEqual(["a", "a/b"]);
  });
  it("keeps a label alone, and nothing, as they are", () => {
    expect(shorten(["k8s.io/api"])).toEqual(["k8s.io/api"]);
    expect(shorten([])).toEqual([]);
  });
});
```

```diff
diff --git a/web/src/scene.test.ts b/web/src/scene.test.ts
--- a/web/src/scene.test.ts
+++ b/web/src/scene.test.ts
@@ -33,6 +33,17 @@ describe("scene", () => {
     expect(sc.edges.map((e) => [e.id, e.pairs]))
       .toEqual([["m#pkg→m/api", 1], ["m/api→m/core", 2], ["m/api→x.io/e", 1]]);
   });
+  it("drops the path prefix drawn siblings share, never from externals, the outside or a lone box (11)", () => {
+    const k = view([...pkgs(["k8s.io/api"], "k8s.io/api"), ...pkgs(["k8s.io/kubelet/cm"], "k8s.io/kubelet"),
+      ...pkgs(["k8s.io/kubernetes/pkg/a", "k8s.io/kubernetes/pkg/b"], "k8s.io/kubernetes"), ...exts(["k8s.io/klog"])],
+      [edge("k8s.io/api", "k8s.io/klog")]);
+    const top = scene(k, DEFAULT_STATE);
+    expect(top.nodes.filter((n) => n.parent === "").map((n) => [n.id, n.label])).toEqual([
+      ["k8s.io/api", "api"], ["k8s.io/klog", "k8s.io/klog"], ["k8s.io/kubelet", "kubelet"], ["k8s.io/kubernetes", "kubernetes"],
+    ]);
+    const one = scene(view(pkgs(["x.io/m/a", "x.io/m/b"], "x.io/m")), DEFAULT_STATE);
+    expect(one.nodes.map((n) => n.label)).toEqual(["x.io/m", "a", "b"]);
+  });
   it("hides weak bundles below minPairs unless pinned", () => {
     expect(ids(at({ depth: 2, minPairs: 2 }).edges)).toEqual(["m/api→m/core"]);
     const pinned = scene(v, { ...DEFAULT_STATE, depth: 2, minPairs: 2 }, { pin: (b) => b.to === "x.io/e" });
@@ -126,9 +137,9 @@ describe("scene", () => {
     const top = scene(g, DEFAULT_STATE);
     expect(top.depth).toBe(3);
     expect(top.nodes.map((n) => [n.label, n.shape])).toEqual([
-      ["example.com/shop", "container"], ["shop (package)", "box"], ["internal", "container"],
+      ["shop", "container"], ["shop (package)", "box"], ["internal", "container"],
       ["checkout", "box"], ["money", "box"], ["store", "box"],
-      ["example.com/shop/tools", "container"], ["gen", "box"],
+      ["shop/tools", "container"], ["gen", "box"],
       ["github.com/lib/pq", "oval"], ["golang.org/x/sync", "oval"],
     ]);
     expect(top.edges).toHaveLength(7);
```

```diff
diff --git a/web/src/__snapshots__/scene04.json b/web/src/__snapshots__/scene04.json
--- a/web/src/__snapshots__/scene04.json
+++ b/web/src/__snapshots__/scene04.json
@@ -3,7 +3,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -57,7 +57,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -141,7 +141,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "box",
     "rows": [],
@@ -150,7 +150,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "box",
     "rows": [],
@@ -201,7 +201,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -228,7 +228,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -294,7 +294,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -348,7 +348,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -1971,7 +1971,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -2112,7 +2112,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -2202,7 +2202,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -2229,7 +2229,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "box",
     "rows": [],
@@ -2280,7 +2280,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -2316,7 +2316,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -2382,7 +2382,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -2523,7 +2523,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -4512,7 +4512,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -4653,7 +4653,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -4743,7 +4743,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -4770,7 +4770,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "box",
     "rows": [],
@@ -4821,7 +4821,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -4857,7 +4857,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -4923,7 +4923,7 @@
   "nodes": [
    {
     "id": "example.com/shop",
-    "label": "example.com/shop",
+    "label": "shop",
     "parent": "",
     "shape": "container",
     "rows": [],
@@ -5064,7 +5064,7 @@
    },
    {
     "id": "example.com/shop/tools",
-    "label": "example.com/shop/tools",
+    "label": "shop/tools",
     "parent": "",
     "shape": "container",
     "rows": [],
```

- [x] **Run:** `cd web && npx vitest run src/labels.test.ts src/scene.test.ts` Expected: FAIL (`Failed to resolve import "./labels"`)

- [x] **Implement**

<!-- file: web/src/labels.ts -->
```ts
// Shorter labels (11): siblings drawn side by side often share a long path
// prefix (k8s.io/…, github.com/org/…). The full id stays in the box's title
// and in the Panel.

// shorten drops the leading path segments that every label of one sibling set
// shares, whole segments only: "k8s.io/api" and "k8s.io/apimachinery" draw as
// "api" and "apimachinery". It never empties a label, so it keeps at least the
// last segment of the shortest, and a label alone is kept whole: with nothing
// beside it, nothing tells the reader what was dropped.
export function shorten(labels: readonly string[]): string[] {
  if (labels.length < 2) return [...labels];
  const segs = labels.map((l) => l.split("/"));
  const most = Math.min(...segs.map((s) => s.length)) - 1;
  let k = 0;
  while (k < most && segs.every((s) => s[k] === segs[0][k])) k++;
  return segs.map((s) => s.slice(k).join("/"));
}
```

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -7,6 +7,7 @@ import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
 import { rolledRanks } from "./policy";
 import { siblingTiers } from "./rank";
+import { shorten } from "./labels";
 import { withinHops } from "./select";
 import type { Known, Stage, ViewState } from "./state";
 
@@ -110,6 +111,8 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
 
   const base = s.focus.endsWith(PKG) ? s.focus.slice(0, -PKG.length) : s.focus;
   const externals = externalsOf(view, kept).length;
+  // path: the label is the box's path below its container, which 11 shortens.
+  const paths = new Set<string>();
   const label = (id: string, parent: string): string => {
     const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
     if (named !== undefined) return named;
@@ -118,6 +121,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
     if (node.get(id)?.kind === "external") return id;
     if (c.decls) return id.slice(base.length + 1);
+    paths.add(id);
     const top = parent || base;
     return top ? id.slice(top.length + 1) : id;
   };
@@ -158,6 +162,10 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     if (o >= 0 && n.shape !== "decl") n.order = o;
     return n;
   });
+  // 11: siblings drop the path prefix they share (labels.ts).
+  const sets = new Map<string, SceneNode[]>();
+  for (const n of nodes) if (paths.has(n.id)) sets.set(n.parent, [...(sets.get(n.parent) ?? []), n]);
+  for (const set of sets.values()) shorten(set.map((n) => n.label)).forEach((l, i) => (set[i].label = l));
   if (!c.decls) markHidden(view, nodes, (id) => {
     const l = toLeaf(id);
     const at = l === OUTSIDE ? null : d.lift(shown(l));
```

- [x] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

### Task 4: Edges on demand: auto, on, off

`ViewState.lines: boolean` becomes `edges: "auto" | "on" | "off"` (the contract). `scene` applies `quiet` and `always`, counts `hidden`, and returns `all`. Each drawn edge gets `dir` relative to the selection. `Canvas` draws the hovered box's lines through `around`. The toolbar gets the select, the header the note, and the legend the two styles.

**Files:**
- Create: `web/src/edges.ts`, `web/src/edges.test.ts`
- Modify: `web/src/state.ts`, `web/src/state.test.ts`, `web/src/scene.ts`, `web/src/scene.test.ts`, `web/src/headline.ts`, `web/src/headline.test.ts`, `web/src/policy.test.ts`, `web/src/search.test.ts`, `web/src/App.tsx`, `web/src/Canvas.tsx`, `web/src/Header.tsx`, `web/src/Toolbar.tsx`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing tests.** `policy.test.ts` and `search.test.ts` only rename `lines: false` to `edges: "off"`. `state.test.ts` also reads the hashes 05, 07 and 09 recorded (Deviation 12).

<!-- file: web/src/edges.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import { always, around, EDGE_LIMIT, quiet } from "./edges";
import { edge } from "./testkit";

describe("edge mode (11)", () => {
  it("auto hides lines at rest only above the limit, and only where lines would be drawn", () => {
    expect([quiet("auto", true, EDGE_LIMIT), quiet("auto", true, EDGE_LIMIT + 1)]).toEqual([false, true]);
    expect([quiet("on", true, 500), quiet("off", false, 500), quiet("auto", false, 500)]).toEqual([false, false, false]);
  });
  it("always draws violations, changed imports and the imports that make a package affected", () => {
    const e = edge("a", "b");
    const none = () => false;
    expect(always({ pinned: false, members: [e] }, none)).toBe(false);
    expect(always({ pinned: true, members: [e] }, none)).toBe(true);
    expect(always({ pinned: false, status: "added", members: [e] }, none)).toBe(true);
    expect(always({ pinned: false, members: [e] }, (x) => x.from === "a")).toBe(true);
  });
  it("finds a box's own edges, and those of what it holds, as in or out", () => {
    // A holds a1; b and c sit beside it.
    const up = (id: string) => ({ a1: "A" })[id] ?? "";
    const es = [
      { id: "a1→b", from: "a1", to: "b" }, { id: "c→A", from: "c", to: "A" },
      { id: "b→c", from: "b", to: "c" }, { id: "A→a1", from: "A", to: "a1" },
    ];
    expect(around(es, "A", up).map((e) => `${e.id} ${e.dir}`)).toEqual(["a1→b out", "c→A in", "A→a1 out"]);
    expect(around(es, "c", up).map((e) => `${e.id} ${e.dir}`)).toEqual(["c→A out", "b→c in"]);
    expect(es[0]).not.toHaveProperty("dir");
  });
});
```

```diff
diff --git a/web/src/state.test.ts b/web/src/state.test.ts
--- a/web/src/state.test.ts
+++ b/web/src/state.test.ts
@@ -17,11 +17,27 @@ describe("URL hash", () => {
   });
   it("round-trips every field, with toggles sorted", () => {
     const s: ViewState = { focus: "m/a#pkg", depth: 3, toggled: ["m/b", "m/a"], selected: "m/a.T",
-      hops: 2, stage: "triangles", lines: false, minPairs: 4, externals: false, proposal: null };
+      hops: 2, stage: "triangles", edges: "off", minPairs: 4, externals: false, proposal: null };
     const h = encodeHash(s);
     expect(h).toBe("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0");
     expect(decodeHash(h, known)).toEqual({ ...s, toggled: ["m/a", "m/b"] });
   });
+  it("keeps the edge mode as l: absent for auto, 1 for on, 0 for off, as 05's links wrote it (11)", () => {
+    expect(["auto", "on", "off"].map((edges) => encodeHash({ ...DEFAULT_STATE, edges } as ViewState))).toEqual(["", "#l=1", "#l=0"]);
+    expect(["", "#l=1", "#l=0", "#l=2"].map((h) => decodeHash(h, known).edges)).toEqual(["auto", "on", "off", "auto"]);
+  });
+  it("reads the links 05, 07 and 09 recorded as they meant them: l=0 is still edges off (11)", () => {
+    // 09's paint.mjs views, 05's acceptance hash, and 05/07's round-trip hash.
+    expect(decodeHash("#d=3&l=0", known)).toEqual({ ...DEFAULT_STATE, depth: 3, edges: "off" });
+    expect(decodeHash("#f=m%2Fa&d=6&l=0", known)).toEqual({ ...DEFAULT_STATE, focus: "m/a", depth: 6, edges: "off" });
+    expect(decodeHash("#d=2&l=0", known)).toEqual({ ...DEFAULT_STATE, depth: 2, edges: "off" });
+    expect(decodeHash("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0", known)).toEqual({
+      focus: "m/a#pkg", depth: 3, toggled: ["m/a", "m/b"], selected: "m/a.T", hops: 2, stage: "triangles",
+      edges: "off", minPairs: 4, externals: false, proposal: null,
+    });
+    // Each writes back unchanged.
+    for (const h of ["#d=3&l=0", "#f=m%2Fa&d=6&l=0", "#d=2&l=0"]) expect(encodeHash(decodeHash(h, known))).toBe(h);
+  });
   it("drops unknown ids, childless toggles and bad numbers instead of failing", () => {
     expect(decodeHash("#f=evil&d=0&d=abc&t=nope&t=m%2Fa%23pkg&s=%3Cb%3E&h=-1&x=none&w=99999", known))
       .toEqual(DEFAULT_STATE);
```

```diff
diff --git a/web/src/scene.test.ts b/web/src/scene.test.ts
--- a/web/src/scene.test.ts
+++ b/web/src/scene.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it } from "vitest";
 import { DRAW_LIMIT, fitDepth, knownIds, openFull, scene, tooBig } from "./scene";
+import { elkGraph } from "./layout";
 import { changedSubgraph } from "./change";
 import { DEFAULT_STATE, up, type ViewState } from "./state";
 import { decl, edge, exts, pkgs, view } from "./testkit";
@@ -82,10 +83,43 @@ describe("scene", () => {
     expect(sel.edges.map((e) => [e.id, e.hot])).toEqual([["m→m/core", true], ["m→x.io/e", true]]);
   });
   it("hide edges keeps the stage and draws marks; pinned bundles mark red", () => {
-    const sc = scene(v, { ...DEFAULT_STATE, depth: 2, lines: false }, { pin: (b) => b.to === "x.io/e" });
+    const sc = scene(v, { ...DEFAULT_STATE, depth: 2, edges: "off" }, { pin: (b) => b.to === "x.io/e" });
     expect([sc.stage, sc.lines, sc.edges.length]).toEqual(["full", false, 0]);
     expect(sc.nodes.find((n) => n.id === "x.io/e")?.mark).toEqual({ in: true, out: false, inPinned: true, outPinned: false });
   });
+  it("auto draws every line up to the limit, then only what must show, and a selection's own (11)", () => {
+    // 12 packages, each importing every later one: 66 lines.
+    const ids12 = Array.from({ length: 12 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
+    const many = view(pkgs(ids12, "m"), ids12.flatMap((a, i) => ids12.slice(i + 1).map((b) => edge(a, b))));
+    const pin = (b: { from: string; to: string }) => b.from === "m/p00" && b.to === "m/p11";
+    const rest = scene(many, { ...DEFAULT_STATE, depth: 2 }, { pin });
+    expect([rest.lines, rest.hidden, rest.all.length, rest.edges.map((e) => e.id)]).toEqual([false, 65, 66, ["m/p00→m/p11"]]);
+    expect(rest.nodes.some((n) => n.mark)).toBe(false); // no triangles either: that is off
+    const sel = scene(many, { ...DEFAULT_STATE, depth: 2, selected: "m/p05" }, { pin });
+    expect(sel.edges.filter((e) => e.hot).map((e) => `${e.from}>${e.to.slice(-2)} ${e.dir}`)).toEqual([
+      "m/p00>05 in", "m/p01>05 in", "m/p02>05 in", "m/p03>05 in", "m/p04>05 in",
+      "m/p05>06 out", "m/p05>07 out", "m/p05>08 out", "m/p05>09 out", "m/p05>10 out", "m/p05>11 out",
+    ]);
+    expect(sel.edges.filter((e) => !e.hot).map((e) => e.id)).toEqual(["m/p00→m/p11"]);
+    const on = scene(many, { ...DEFAULT_STATE, depth: 2, edges: "on" }, { pin });
+    expect([on.lines, on.hidden, on.edges.length]).toEqual([true, 0, 66]);
+    const off = scene(many, { ...DEFAULT_STATE, depth: 2, edges: "off" }, { pin });
+    expect([off.lines, off.hidden, off.edges.length, off.nodes.filter((n) => n.mark).length]).toEqual([false, 0, 0, 12]);
+    expect([at({ depth: 2 }).lines, at({ depth: 2 }).hidden]).toEqual([true, 0]); // 3 lines: all drawn
+    // The ranks, not the lines, place the boxes: the layout input is the same in every mode.
+    const g = JSON.stringify(elkGraph(rest));
+    expect([sel, on, off].map((x) => JSON.stringify(elkGraph(x)) === g)).toEqual([true, true, true]);
+  });
+  it("auto draws a Change View's changed imports and the imports behind the Affected Set at rest (11)", () => {
+    const ids12 = Array.from({ length: 12 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
+    const status = (id: string) => (id === "m/p11" ? { status: "modified" } : id === "m/p10" ? { hop: 1 } : {});
+    const ch = {
+      ...view(ids12.map((id) => ({ ...pkgs([id], "m")[0], ...status(id) })),
+        ids12.flatMap((a, i) => ids12.slice(i + 1).map((b) => (a === "m/p00" && b === "m/p01" ? { ...edge(a, b), status: "added" } : edge(a, b))))),
+      kind: "change" as const,
+    };
+    expect(scene(ch, { ...DEFAULT_STATE, depth: 2 }).edges.map((e) => e.id)).toEqual(["m/p00→m/p01", "m/p10→m/p11"]);
+  });
   it("a type lists its methods as rows until the elements stage", () => {
     const w = view([...pkgs(["m/p"], "m", { detail: true }), decl("m/p.T", "m/p"),
       decl("m/p.T.Put", "m/p.T", "function"), decl("m/p.T.Get", "m/p.T", "function")]);
```

```diff
diff --git a/web/src/headline.test.ts b/web/src/headline.test.ts
--- a/web/src/headline.test.ts
+++ b/web/src/headline.test.ts
@@ -1,10 +1,17 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { parseView, type View } from "./data";
-import { breadcrumb, depthNote, honestyLine, redLegend, title, violationsNote } from "./headline";
+import { breadcrumb, depthNote, edgesNote, honestyLine, redLegend, title, violationsNote } from "./headline";
 
 const v = parseView(JSON.stringify(golden));
 
+describe("edgesNote (11)", () => {
+  it("counts what auto hides and says how to see it", () => {
+    expect(edgesNote(260)).toBe("260 dependencies hidden; select or hover a box to see its own.");
+    expect(edgesNote(1)).toBe("1 dependency hidden; select or hover a box to see its own.");
+  });
+});
+
 describe("header", () => {
   it("titles the view with its modules and commit", () => {
     const at = (head: View["head"], modules = v.modules) => title({ ...v, head, modules });
```

```diff
diff --git a/web/src/policy.test.ts b/web/src/policy.test.ts
--- a/web/src/policy.test.ts
+++ b/web/src/policy.test.ts
@@ -32,7 +32,7 @@ describe("violations through 05's pin hook", () => {
   it("keeps a violation drawn below minPairs and as red triangles without lines", () => {
     const sc = scene(v, { ...DEFAULT_STATE, depth: 3, minPairs: 5 }, { pin: pinFor(v) });
     expect(sc.edges.map((e) => e.id)).toEqual(["m/core/b→m/api/r"]);
-    const marks = scene(v, { ...DEFAULT_STATE, depth: 3, lines: false }, { pin: pinFor(v) });
+    const marks = scene(v, { ...DEFAULT_STATE, depth: 3, edges: "off" }, { pin: pinFor(v) });
     expect(marks.nodes.find((n) => n.id === "m/api/r")?.mark?.inPinned).toBe(true);
   });
 
```

```diff
diff --git a/web/src/search.test.ts b/web/src/search.test.ts
--- a/web/src/search.test.ts
+++ b/web/src/search.test.ts
@@ -25,7 +25,7 @@ describe("search", () => {
     expect(reveal(v, "x.io/e3").selected).toBe("externals");
   });
   it("reveal keeps the stage and hide-edges, and resets what could hide the target", () => {
-    const from = { ...DEFAULT_STATE, stage: "arrows" as const, lines: false, minPairs: 3, externals: false, hops: 2, toggled: ["m"] };
-    expect(reveal(v, "m/store/sql", from)).toMatchObject({ stage: "arrows", lines: false, minPairs: 1, externals: true, hops: null, toggled: [] });
+    const from = { ...DEFAULT_STATE, stage: "arrows" as const, edges: "off" as const, minPairs: 3, externals: false, hops: 2, toggled: ["m"] };
+    expect(reveal(v, "m/store/sql", from)).toMatchObject({ stage: "arrows", edges: "off", minPairs: 1, externals: true, hops: null, toggled: [] });
   });
 });
```

- [ ] **Run:** `cd web && npx vitest run src/edges.test.ts src/state.test.ts src/scene.test.ts src/headline.test.ts` Expected: FAIL (`Failed to resolve import "./edges"`, `edgesNote` undefined, `l` not read)

- [ ] **Implement**

<!-- file: web/src/edges.ts -->
```ts
// Edges on demand (11). A view with more lines than a reader can follow draws
// none at rest: each box's own lines appear when it is selected or hovered,
// dependencies and dependents in two styles. Lines never move a box: the
// layout reads ranks, not edges (layout.ts). The mode lives in the URL hash
// (state.ts): auto (the default), on, off (05's "hide edges": triangles).
import type { ViewEdge } from "./data";
import type { EdgeMode } from "./state";

// EDGE_LIMIT is the most lines auto draws at rest. Measured on the Test
// Corpus's default views (11 acceptance): zu 23 and cobra 6 stay drawn, hugo
// 260 and kubernetes 175 go on demand. At 40 or fewer, over at most 60 boxes
// (BOX_BUDGET), each line can still be followed from end to end.
export const EDGE_LIMIT = 40;

// quiet says auto hides the lines at rest: lines would be drawn (not off, not
// the triangles stage) and there are more than EDGE_LIMIT of them.
export const quiet = (mode: EdgeMode, lines: boolean, drawable: number): boolean =>
  mode === "auto" && lines && drawable > EDGE_LIMIT;

// always: an arrow auto draws even at rest. A violation (pinned, 06), a
// changed import (04: any Change Status), or an import that puts its importer
// in the Affected Set (affected, from the Change View's marks).
export const always = (
  a: { pinned: boolean; status?: string; members: readonly ViewEdge[] }, affected: (e: ViewEdge) => boolean,
): boolean => a.pinned || a.status !== undefined || a.members.some(affected);

export type Dir = "in" | "out";
type Drawable = { id: string; from: string; to: string };

// around are the edges of id, or of anything drawn inside it, each marked
// out (id depends on the other end) or in (the other end depends on id). An
// edge inside id is out. up is a drawn node's container, "" at the top.
export function around<E extends Drawable>(edges: readonly E[], id: string, up: (id: string) => string): (E & { dir: Dir })[] {
  const inside = (x: string) => {
    for (let y = x; y !== ""; y = up(y)) if (y === id) return true;
    return false;
  };
  const out: (E & { dir: Dir })[] = [];
  for (const e of edges) {
    if (inside(e.from)) out.push({ ...e, dir: "out" });
    else if (inside(e.to)) out.push({ ...e, dir: "in" });
  }
  return out;
}
```

```diff
diff --git a/web/src/state.ts b/web/src/state.ts
--- a/web/src/state.ts
+++ b/web/src/state.ts
@@ -12,6 +12,11 @@ export const LABELS: Record<Stage, string> = {
   classes: "Declutter classes",
 };
 
+// EDGE_MODES (11): auto draws lines when there are few and on demand when
+// there are many (edges.ts); on draws every line; off draws 05's triangles.
+export const EDGE_MODES = ["auto", "on", "off"] as const;
+export type EdgeMode = (typeof EDGE_MODES)[number];
+
 export type ViewState = {
   focus: string; // box id, "X#pkg", or "" for the page root
   depth: number | null; // null = autoDepth
@@ -19,7 +24,7 @@ export type ViewState = {
   selected: string | null; // any node id, or a drawn box or aggregate
   hops: number | null; // show only nodes within N hops of the selection
   stage: Stage; // declutter stage (U6)
-  lines: boolean; // false = "Hide edges": triangles instead of lines, at any stage
+  edges: EdgeMode; // 11: "off" = 05's "Hide edges": triangles instead of lines, at any stage
   minPairs: number; // hide bundles with fewer package pairs (A6)
   externals: boolean; // draw external modules
   proposal: string | null; // 07: the Proposal drawn instead of the Package Tree, by name
@@ -27,7 +32,7 @@ export type ViewState = {
 
 export const DEFAULT_STATE: ViewState = {
   focus: "", depth: null, toggled: [], selected: null, hops: null,
-  stage: "full", lines: true, minPairs: 1, externals: true, proposal: null,
+  stage: "full", edges: "auto", minPairs: 1, externals: true, proposal: null,
 };
 
 export const LIMITS = { depth: 32, hops: 9, minPairs: 999 };
@@ -42,7 +47,7 @@ export function encodeHash(s: ViewState): string {
   if (s.selected) p.set("s", s.selected);
   if (s.hops !== null) p.set("h", String(s.hops));
   if (s.stage !== "full") p.set("x", s.stage);
-  if (!s.lines) p.set("l", "0");
+  if (s.edges !== "auto") p.set("l", s.edges === "off" ? "0" : "1");
   if (s.minPairs !== 1) p.set("w", String(s.minPairs));
   if (!s.externals) p.set("e", "0");
   if (s.proposal !== null) p.set("p", s.proposal);
@@ -77,7 +82,7 @@ export function decodeHash(hash: string, known: Known): ViewState {
     selected: selected !== null && known.node(selected) ? selected : null,
     hops: int("h", LIMITS.hops),
     stage: (STAGES as readonly string[]).includes(stage ?? "") ? (stage as Stage) : "full",
-    lines: p.get("l") !== "0",
+    edges: p.get("l") === "0" ? "off" : p.get("l") === "1" ? "on" : "auto",
     minPairs: int("w", LIMITS.minPairs) ?? 1,
     externals: p.get("e") !== "0",
     proposal: proposal !== null && known.proposal?.(proposal) ? proposal : null,
```

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -7,6 +7,7 @@ import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
 import { rolledRanks } from "./policy";
 import { siblingTiers } from "./rank";
+import { always, quiet, type Dir } from "./edges";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
 import type { Known, Stage, ViewState } from "./state";
@@ -30,11 +31,14 @@ export type SceneEdge = {
   id: string; from: string; to: string; pairs: number; members: Bundle["members"];
   dim: boolean; hot: boolean; pinned: boolean;
   status?: string; // the Change Status its members share, or "mixed" (bundle.ts statusOf)
+  dir?: Dir; // 11: on a lit edge, out = the selection depends on the other end, in = the other end on it
 };
 export type Scene = {
   depth: number; stage: Stage;
-  lines: boolean; // edges are laid out; false = only the selection's edges, drawn over the marks
+  lines: boolean; // every edge is drawn at rest; false = the selection's edges, over marks (off) or none (auto)
   nodes: SceneNode[]; edges: SceneEdge[];
+  all: SceneEdge[]; // 11: every edge the cut could draw, drawn or not; the canvas draws a hovered box's from here
+  hidden: number; // 11: the lines auto leaves out at rest (edges.ts); 0 when every line is drawn
   bundles: Bundle[]; // the leaf bundles behind the edges, for the panel
   selected: string | null; // the drawn node that stands for the selection
   selectedRow: string | null; // the selected method, drawn as a row of `selected`
@@ -84,7 +88,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     kept = kept.filter((b) => near.has(b.from) && near.has(b.to));
   }
 
-  const d = declutter(s.stage, s.lines, kept, [...leaves], c.parent, pin);
+  const d = declutter(s.stage, s.edges !== "off", kept, [...leaves], c.parent, pin);
   const shown = (id: string) => (d.folded(id) ? up(id) : id);
   const folds = new Set([...leaves].filter(d.folded).map(up));
   leaves = new Set([...leaves].filter((l) => !d.folded(l)));
@@ -184,20 +188,34 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   );
   for (const n of nodes) n.tier = tiers.get(n.id);
 
+  // 11: auto draws at rest only what must show when there are too many lines
+  // to follow: violations, changed imports, and the imports behind the
+  // Affected Set (edges.ts always). Everything else waits for a selection.
+  const drawable = d.arrows.filter((a) => ids.has(a.from) && ids.has(a.to));
+  const hush = quiet(s.edges, d.lines, drawable.length);
+  const marked = (id: string) => (node.get(id) ? nodeMark(node.get(id)!) : "");
+  const affected = (e: ViewEdge) => view.kind === "change" && marked(e.from) === "affected" && marked(e.to) !== "";
+  const all: SceneEdge[] = [];
   const edges: SceneEdge[] = [];
-  for (const a of d.arrows) {
+  let hidden = 0;
+  for (const a of drawable) {
     const h = hot(a);
-    if (!ids.has(a.from) || !ids.has(a.to) || (!d.lines && !h)) continue;
     const e: SceneEdge = {
       id: `${a.from}→${a.to}`, from: a.from, to: a.to, pairs: a.pairs, members: a.members,
       hot: h, dim: selected !== null && !h, pinned: a.pinned,
     };
     if (a.status) e.status = a.status;
-    edges.push(e);
+    if (h) e.dir = a.carries.some((b) => inSel(b.from)) ? "out" : "in";
+    all.push(e);
+    const rest = !hush || always(a, affected); // drawn with nothing selected
+    if (!rest) hidden++;
+    if (d.lines ? rest || h : h) edges.push(e);
   }
-  edges.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to));
+  const byEnds = (x: SceneEdge, y: SceneEdge) => cmp(x.from, y.from) || cmp(x.to, y.to);
+  edges.sort(byEnds);
+  all.sort(byEnds);
   return {
-    depth, stage: s.stage, lines: d.lines, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, bundles: kept,
+    depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
   };
 }
```

```diff
diff --git a/web/src/headline.ts b/web/src/headline.ts
--- a/web/src/headline.ts
+++ b/web/src/headline.ts
@@ -57,6 +57,10 @@ export function depthNote(boxes: number, depth: number, auto = true, from = dept
   return boxes > BOX_BUDGET ? `${note} More than ${BOX_BUDGET} boxes, drawn anyway.` : note;
 }
 
+// edgesNote says what auto left out (11): the lines, and how to see a box's own.
+export const edgesNote = (hidden: number): string =>
+  `${hidden} ${hidden === 1 ? "dependency" : "dependencies"} hidden; select or hover a box to see its own.`;
+
 // violationsNote words the Change View's violations section as zu diff's
 // violationsBlock does (internal/diff/violations.go): new first, then the rest.
 export function violationsNote(d: NonNullable<View["violations"]>): { heading: string; tail: string } {
```

```diff
diff --git a/web/src/Header.tsx b/web/src/Header.tsx
--- a/web/src/Header.tsx
+++ b/web/src/Header.tsx
@@ -1,6 +1,6 @@
 import { useState } from "react";
 import type { View } from "./data";
-import { breadcrumb, depthNote, honestyLine, title } from "./headline";
+import { breadcrumb, depthNote, edgesNote, honestyLine, title } from "./headline";
 
 type Props = {
   view: View;
@@ -10,11 +10,12 @@ type Props = {
   onFocus: (box: string) => void;
   auto: boolean; // the depth is autoDepth's, not the reader's
   from?: number; // the requested depth, when the drawn one is shallower (Deviation 8)
+  hidden?: number; // 11: lines auto leaves out at rest
   full?: boolean; // Change View only: showing the full project, not the changed subgraph
   onToggle?: () => void;
 };
 
-export function Header({ view, focus, boxes, depth, onFocus, auto, from, full, onToggle }: Props) {
+export function Header({ view, focus, boxes, depth, onFocus, auto, from, hidden = 0, full, onToggle }: Props) {
   const compare = view.links?.compare?.startsWith("https://") ? view.links.compare : null;
   const [showErrors, setShowErrors] = useState(false);
   const errors = view.honesty.parseErrors;
@@ -56,6 +57,7 @@ export function Header({ view, focus, boxes, depth, onFocus, auto, from, full, o
       </nav>
       <p className="note">
         {depthNote(boxes, depth, auto, from)}
+        {hidden > 0 && <span id="zu-edges"> {edgesNote(hidden)}</span>}
         {full !== undefined && (
           <>
             {" "}
```

```diff
diff --git a/web/src/Toolbar.tsx b/web/src/Toolbar.tsx
--- a/web/src/Toolbar.tsx
+++ b/web/src/Toolbar.tsx
@@ -1,4 +1,4 @@
-import { deeper, LABELS, LIMITS, nextStage, propose, shallower, type ViewState } from "./state";
+import { deeper, EDGE_MODES, LABELS, LIMITS, nextStage, propose, shallower, type EdgeMode, type ViewState } from "./state";
 
 type Props = {
   state: ViewState; depth: number; update: (next: (s: ViewState) => ViewState) => void;
@@ -43,9 +43,15 @@ export function Toolbar({ state, depth, update, proposals }: Props) {
       <button type="button" title="Next declutter stage (d)" onClick={() => update((s) => ({ ...s, stage: nextStage(s.stage) }))}>
         {LABELS[state.stage]}
       </button>
-      <label>
-        <input type="checkbox" checked={!state.lines} onChange={(e) => update((s) => ({ ...s, lines: !e.target.checked }))} />{" "}
-        hide edges
+      <label title="auto: every line when there are few, a box's own on selection or hover when there are many; off: triangles">
+        edges{" "}
+        <select value={state.edges} onChange={(e) => update((s) => ({ ...s, edges: e.target.value as EdgeMode }))}>
+          {EDGE_MODES.map((m) => (
+            <option key={m} value={m}>
+              {m}
+            </option>
+          ))}
+        </select>
       </label>
       <label>
         min pairs{" "}
```

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -21,11 +21,15 @@ import { useViewState } from "./useViewState";
 
 const PKG = "#pkg";
 
-type LegendProps = { change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null };
+type LegendProps = {
+  change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null;
+  onDemand: boolean; // 11: lines show for a selected or hovered box
+};
 
-function Legend({ change, policy, ranks, crap, proposal }: LegendProps) {
+function Legend({ change, policy, ranks, crap, proposal, onDemand }: LegendProps) {
   return (
     <div className="legend" aria-label="Legend">
+      {onDemand && <span className="dirs">a box's lines: solid, it depends on · dashed, depends on it</span>}
       {change && (
         <>
           <span className="swatch st-added">added</span>
@@ -236,6 +240,7 @@ export function App({ view: whole }: { view: View }) {
         depth={sc.depth}
         auto={state.depth === null}
         from={requested.depth}
+        hidden={sc.hidden}
         onFocus={go}
         full={change ? full : undefined}
         onToggle={flip}
@@ -256,8 +261,15 @@ export function App({ view: whole }: { view: View }) {
             {PROPOSAL_NOTICE}: {state.proposal}
           </div>
         )}
-        {(change || rules || ranks || crap) && (
-          <Legend change={change} policy={rules} ranks={ranks} crap={crap} proposal={proposed === whole ? null : state.proposal} />
+        {(change || rules || ranks || crap || !sc.lines) && (
+          <Legend
+            change={change}
+            policy={rules}
+            ranks={ranks}
+            crap={crap}
+            proposal={proposed === whole ? null : state.proposal}
+            onDemand={!sc.lines}
+          />
         )}
         {sc !== requested && (
           <div className="notice" id="zu-notice" role="status">
@@ -268,7 +280,7 @@ export function App({ view: whole }: { view: View }) {
             <button type="button" onClick={() => setConfirmed(wanted)}>
               Draw depth {requested.depth} anyway
             </button>{" "}
-            <button type="button" onClick={() => update((s) => ({ ...s, lines: false }))}>
+            <button type="button" onClick={() => update((s) => ({ ...s, edges: "off" }))}>
               Hide edges
             </button>
           </div>
@@ -283,7 +295,7 @@ export function App({ view: whole }: { view: View }) {
               Even depth 1 is too big to lay out quickly. Draw {sc.nodes.length} boxes and{" "}
               {sc.lines ? sc.edges.length : 0} edges at depth {sc.depth}? Layout may take minutes.
             </p>
-            <button type="button" onClick={() => update((s) => ({ ...s, lines: false }))}>
+            <button type="button" onClick={() => update((s) => ({ ...s, edges: "off" }))}>
               Hide edges
             </button>{" "}
             {state.focus !== "" && (
```

```diff
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -10,14 +10,15 @@ import {
   type NodeProps,
   useReactFlow,
 } from "@xyflow/react";
-import { useEffect, useRef } from "react";
+import { useEffect, useMemo, useRef, useState } from "react";
 import "@xyflow/react/dist/style.css";
 import { edgeMark } from "./change";
 import { parentBox } from "./cut";
 import type { View } from "./data";
+import { around } from "./edges";
 import { absolute, triangles, type Placed } from "./layout";
 import { crapGrade, crapLabel } from "./metrics";
-import type { Scene, SceneNode } from "./scene";
+import type { Scene, SceneEdge, SceneNode } from "./scene";
 import { boxStats } from "./tree";
 
 type Data = {
@@ -250,7 +251,9 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
   useEffect(() => {
     if (fit) void rf.fitView();
   }, [rf, fit]);
-  const nodes: ZNode[] = [...sc.nodes]
+  // 11: while lines are on demand, a hovered box draws its own over the rest.
+  const [hover, setHover] = useState<string | null>(null);
+  const nodes: ZNode[] = useMemo(() => [...sc.nodes]
     .sort((a, b) => depth(byId, a.id) - depth(byId, b.id) || (a.id < b.id ? -1 : 1))
     .map((node) => {
       const p = placed.get(node.id) ?? { x: 0, y: 0, w: 90, h: 40 };
@@ -268,8 +271,11 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
         connectable: false,
         data: { node, w: p.w, h: p.h, stats, row: sc.selectedRow, pick: onSelect, toggle: onToggle },
       };
-    });
-  const rfEdges: Edge[] = sc.edges.map((e) => {
+    }), [sc, placed, view, onSelect, onToggle]); // byId comes from sc
+  const drawn = new Set(sc.edges.map((e) => e.id));
+  const hovered: SceneEdge[] = sc.lines || hover === null || hover === sc.selected ? []
+    : around(sc.all, hover, (id) => byId.get(id)?.parent ?? "").filter((e) => !drawn.has(e.id)).map((e) => ({ ...e, hot: true, dim: false }));
+  const rfEdges: Edge[] = [...sc.edges, ...hovered].map((e) => {
     const m = edgeMark(e.status);
     const label = [m.sign, e.pairs > 1 ? String(e.pairs) : ""].filter(Boolean).join(" ");
     return {
@@ -277,7 +283,7 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
       source: e.from,
       target: e.to,
       type: "smoothstep",
-      className: [m.cls, e.dim && "dim", e.hot && "hot", e.pinned && "pinned", e.id === edge && "selected"]
+      className: [m.cls, e.dim && "dim", e.hot && "hot", e.dir && `dep-${e.dir}`, e.pinned && "pinned", e.id === edge && "selected"]
         .filter(Boolean)
         .join(" "),
       markerEnd: { type: MarkerType.ArrowClosed },
@@ -304,6 +310,8 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
         }}
         onEdgeClick={(_, e) => onEdge?.(e.id)}
         onPaneClick={() => onSelect(null)}
+        onNodeMouseEnter={(_, n) => setHover(n.id)}
+        onNodeMouseLeave={() => setHover(null)}
       >
         <Background />
         <Controls showInteractive={false} />
```

```diff
diff --git a/web/src/styles.css b/web/src/styles.css
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -481,6 +481,12 @@ button.st-removed {
   stroke: var(--pin);
 }
 
+/* 11: a lit edge is solid when the lit box depends on the other end, and
+   dashed when the other end depends on it. */
+.react-flow__edge.dep-in path {
+  stroke-dasharray: 6 4;
+}
+
 .node .toggle {
   position: absolute;
   top: 2px;
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

### Task 5: Open below single-child containers (`home`)

**Files:**
- Modify: `web/src/cut.ts`, `web/src/cut.test.ts`, `web/src/scene.ts`, `web/src/scene.test.ts`, `web/src/headline.ts`, `web/src/headline.test.ts`, `web/src/Header.tsx`, `web/src/App.tsx`

**Steps:**

- [ ] **Write the failing tests.** `cut.test.ts` covers `home`, including a Change View, which stays at the page root (Deviation 3).

```diff
diff --git a/web/src/cut.test.ts b/web/src/cut.test.ts
--- a/web/src/cut.test.ts
+++ b/web/src/cut.test.ts
@@ -1,12 +1,46 @@
 import { describe, expect, it } from "vitest";
-import { autoDepth, cut, leafOf, packageOf, packagesIn, parentBox } from "./cut";
-import { decl, pkgs, view } from "./testkit";
+import { autoDepth, cut, home, leafOf, packageOf, packagesIn, parentBox, upTo } from "./cut";
+import { decl, edge, exts, pkgs, view } from "./testkit";
 
 const shop = view([
   ...pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b/c"], "ex/shop"),
   ...pkgs(["ex/shop/tools/gen"], "ex/shop/tools"),
 ]);
 
+describe("home (11)", () => {
+  it("opens through boxes that hold one box and nothing else", () => {
+    // hugo: one module with a root package and child boxes opens at the module.
+    expect(home(view(pkgs(["h", "h/a", "h/b"], "h")))).toBe("h");
+    // a module without a root package, one box deeper, and only one below it.
+    expect(home(view(pkgs(["x.io/m/pkg/a", "x.io/m/pkg/b"], "x.io/m")))).toBe("x.io/m/pkg");
+    // two module roots, as in shop (ex/shop and ex/shop/tools), stay at the root.
+    expect(home(shop)).toBe("");
+    // a box whose only child is a leaf is where the tree ends: stop above it.
+    expect(home(view(pkgs(["x.io/m/a"], "x.io/m")))).toBe("x.io/m");
+    // a box that is also a package holds more than its one child.
+    expect(home(view(pkgs(["h", "h/a", "h/a/x", "h/a/y"], "h")))).toBe("h");
+  });
+  it("is the page root in a Change View, which opens where it did before 11", () => {
+    const one = view(pkgs(["h", "h/a", "h/b"], "h"));
+    expect(home({ ...one, kind: "change" })).toBe("");
+    expect(upTo({ ...one, kind: "change" }, "h")).toBe("");
+  });
+  it("does not count external modules: hugo's root holds its module and an externals oval", () => {
+    const h = view([...pkgs(["h", "h/a", "h/b"], "h"), ...exts(["x.io/e"])], [edge("h/a", "x.io/e")]);
+    expect(home(h)).toBe("h");
+  });
+  it("goes up to the page root, never to a root that differs from home only by the wrapper", () => {
+    const h = view(pkgs(["x.io/m/pkg/a/x", "x.io/m/pkg/a/y", "x.io/m/pkg/b"], "x.io/m"));
+    expect(home(h)).toBe("x.io/m/pkg");
+    expect(upTo(h, "")).toBeNull(); // Esc at the page root does nothing
+    expect(upTo(h, "x.io/m/pkg")).toBeNull(); // nor at home named by a link
+    expect(upTo(h, "x.io/m/pkg/a")).toBe(""); // home's children go to the page root
+    expect(upTo(h, "x.io/m/pkg/a/x")).toBe("x.io/m/pkg/a"); // below that, as 05 did
+    expect(upTo(shop, "ex/shop/internal")).toBe("ex/shop"); // no home: as 05 did
+    expect(upTo(shop, "ex/shop")).toBe("");
+  });
+});
+
 describe("cut", () => {
   it("opens boxes above the depth and records each leaf's container", () => {
     const c = cut(shop, "", 2);
```

```diff
diff --git a/web/src/scene.test.ts b/web/src/scene.test.ts
--- a/web/src/scene.test.ts
+++ b/web/src/scene.test.ts
@@ -45,6 +45,23 @@ describe("scene", () => {
     const one = scene(view(pkgs(["x.io/m/a", "x.io/m/b"], "x.io/m")), DEFAULT_STATE);
     expect(one.nodes.map((n) => n.label)).toEqual(["x.io/m", "a", "b"]);
   });
+  it("draws the page root at home, and any other focus as asked (11)", () => {
+    const h = view(pkgs(["h", "h/a", "h/b"], "h"), [edge("h/a", "h/b")]);
+    const root = scene(h, DEFAULT_STATE, { home: true });
+    expect([root.focus, root.depth, root.nodes.map((n) => n.label)]).toEqual(["h", 1, ["h (package)", "a", "b"]]);
+    expect(scene(h, { ...DEFAULT_STATE, focus: "h/a" }, { home: true }).focus).toBe("h/a");
+    expect(scene(h, DEFAULT_STATE).focus).toBe(""); // without the option: the root, as 05 drew it
+  });
+  it("draws the externals at home, and a deep link or a search pick as before (11)", () => {
+    const h = view([...pkgs(["h", "h/a", "h/a/x", "h/b"], "h"), ...exts(["x.io/e"])], [edge("h/a/x", "x.io/e"), edge("h/b", "h/a/x")]);
+    const root = scene(h, DEFAULT_STATE, { home: true });
+    expect([root.focus, root.nodes.filter((n) => n.shape === "oval").map((n) => n.id)]).toEqual(["h", ["x.io/e"]]);
+    for (const s of [{ focus: "h/a" }, { focus: "h/a", depth: 2 }, { selected: "h/a/x" }, { focus: "h/a", selected: "h/a/x" }]) {
+      const deep = { ...DEFAULT_STATE, ...s };
+      expect(scene(h, deep, { home: true }).nodes).toEqual(scene(h, { ...deep, focus: deep.focus || "h" }).nodes);
+    }
+    expect(scene(h, { ...DEFAULT_STATE, selected: "h/a/x" }, { home: true }).nodes.find((n) => n.selected)?.id).toBe("h/a/x");
+  });
   it("hides weak bundles below minPairs unless pinned", () => {
     expect(ids(at({ depth: 2, minPairs: 2 }).edges)).toEqual(["m/api→m/core"]);
     const pinned = scene(v, { ...DEFAULT_STATE, depth: 2, minPairs: 2 }, { pin: (b) => b.to === "x.io/e" });
```

```diff
diff --git a/web/src/headline.test.ts b/web/src/headline.test.ts
--- a/web/src/headline.test.ts
+++ b/web/src/headline.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { parseView, type View } from "./data";
 import { breadcrumb, depthNote, edgesNote, honestyLine, redLegend, title, violationsNote } from "./headline";
+import { pkgs, view } from "./testkit";
 
 const v = parseView(JSON.stringify(golden));
 
@@ -38,6 +39,14 @@ describe("header", () => {
     ]);
     expect(breadcrumb(v, "example.com/shop#pkg").at(-1)).toEqual({ id: "example.com/shop#pkg", label: "shop (package)" });
   });
+  it("breadcrumb starts at home, not at a root around it (11)", () => {
+    const h = view(pkgs(["x.io/m/pkg/a/x", "x.io/m/pkg/a/y", "x.io/m/pkg/b"], "x.io/m"));
+    expect(breadcrumb(h, "", "x.io/m/pkg")).toEqual([{ id: "", label: "x.io/m/pkg" }]);
+    expect(breadcrumb(h, "x.io/m/pkg", "x.io/m/pkg")).toEqual([{ id: "", label: "x.io/m/pkg" }]);
+    expect(breadcrumb(h, "x.io/m/pkg/a/x", "x.io/m/pkg")).toEqual([
+      { id: "", label: "x.io/m/pkg" }, { id: "x.io/m/pkg/a", label: "a" }, { id: "x.io/m/pkg/a/x", label: "x" },
+    ]);
+  });
   it("notes the depth and an over-budget level", () => {
     expect(depthNote(5, 3)).toBe("5 boxes at depth 3. Double-click to open a box, Esc to go up.");
     expect(depthNote(5, 2, false)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
```

- [ ] **Run:** `cd web && npx vitest run src/cut.test.ts src/scene.test.ts src/headline.test.ts` Expected: FAIL (`home` is not exported)

- [ ] **Implement.** `App` passes `{home: true}` in its three `scene` calls and reads the focus back from the scene. Esc and "Go back one level" go through `upTo`, and the header's breadcrumb starts at home (Deviation 3).

```diff
diff --git a/web/src/cut.ts b/web/src/cut.ts
--- a/web/src/cut.ts
+++ b/web/src/cut.ts
@@ -179,6 +179,35 @@ export function leafOf(view: View, c: Cut): (pkg: string) => string {
   };
 }
 
+// home is the box the page root opens at (11): down from the root through
+// every box that holds exactly one child box and nothing else (no package of
+// its own), while that child holds boxes too. A single-module repository with
+// a root package (hugo) opens at the module; kubernetes, with 38 module roots,
+// at the root. The root around one box draws nothing the box does not.
+// A Change View opens at the page root, as it did before 11: its subgraph can
+// be one changed package deep inside a module.
+export function home(view: View): string {
+  if (view.kind === "change") return "";
+  const ix = index(view);
+  let at = "";
+  for (;;) {
+    const kids = childrenOf(view, at);
+    if (kids.length !== 1 || ix.pkg.has(at) || childrenOf(view, kids[0]).length === 0) return at;
+    at = kids[0];
+  }
+}
+
+// upTo is where Esc and "Go back one level" go from focus (11): nowhere
+// (null) at the page root or at home, the page root from home's children, and
+// the parent box elsewhere, as 05 did. So going up never lands on a root that
+// differs from home only by the boxes home descends through.
+export function upTo(view: View, focus: string): string | null {
+  const h = home(view);
+  if (focus === "" || focus === h) return null;
+  const p = parentBox(view, focus);
+  return p === h ? "" : p;
+}
+
 // autoDepth: start at 1 and go deeper while the next level has ≤ 60 leaves and
 // more than this one (decision Q4, relative to the focus).
 export function autoDepth(view: View, focus: string): number {
```

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -1,7 +1,7 @@
 // scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
 import { nodeMark, unchangedCount } from "./change";
 import type { View, ViewEdge } from "./data";
-import { autoDepth, childrenOf, cmp, cut, declsOf, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
+import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
 import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
@@ -34,6 +34,7 @@ export type SceneEdge = {
   dir?: Dir; // 11: on a lit edge, out = the selection depends on the other end, in = the other end on it
 };
 export type Scene = {
+  focus: string; // the box drawn: the state's focus, or home() for the page root (11)
   depth: number; stage: Stage;
   lines: boolean; // every edge is drawn at rest; false = the selection's edges, over marks (off) or none (auto)
   nodes: SceneNode[]; edges: SceneEdge[];
@@ -45,16 +46,19 @@ export type Scene = {
   decls: boolean; noDetail: boolean;
 };
 
-// Options for callers other than the Project View: 06 passes pin (violations).
-export type SceneOptions = { pin?: Pin };
+// Options for callers other than the Project View: 06 passes pin (violations);
+// the page passes home (11), which draws the page root at home(view).
+export type SceneOptions = { pin?: Pin; home?: boolean };
 
 const last = (id: string) => id.slice(id.lastIndexOf("/") + 1);
 
 export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene {
   const pin = opts.pin ?? NO_PINS;
   const { node } = index(view);
-  const depth = s.depth ?? autoDepth(view, s.focus);
-  const c = cut(view, s.focus, depth, s.toggled);
+  // 11: the page root opens at home, so the hash keeps no focus for it.
+  const focus = s.focus === "" && opts.home ? home(view) : s.focus;
+  const depth = s.depth ?? autoDepth(view, focus);
+  const c = cut(view, focus, depth, s.toggled);
   let kept = bundlesOver(view, c, { externals: s.externals }).filter((b) => b.pairs >= s.minPairs || pin(b));
   let leaves = new Set([...c.leaves, ...kept.flatMap((b) => [b.from, b.to])]);
   const open = new Set(c.containers);
@@ -113,7 +117,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   }
   const bright = (id: string) => selected === null || inSel(id) || lit.has(id);
 
-  const base = s.focus.endsWith(PKG) ? s.focus.slice(0, -PKG.length) : s.focus;
+  const base = focus.endsWith(PKG) ? focus.slice(0, -PKG.length) : focus;
   const externals = externalsOf(view, kept).length;
   // path: the label is the box's path below its container, which 11 shortens.
   const paths = new Set<string>();
@@ -215,7 +219,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   edges.sort(byEnds);
   all.sort(byEnds);
   return {
-    depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, bundles: kept,
+    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
   };
 }
```

```diff
diff --git a/web/src/headline.ts b/web/src/headline.ts
--- a/web/src/headline.ts
+++ b/web/src/headline.ts
@@ -31,12 +31,14 @@ export function honestyLine(view: View): string {
 export type Crumb = { id: string; label: string };
 
 // breadcrumb lists the boxes from the page root down to focus.
-export function breadcrumb(view: View, focus: string): Crumb[] {
+// With a home (11, cut.ts), the page root is drawn as home: the trail starts
+// there, named by its id, and its link goes to the page root.
+export function breadcrumb(view: View, focus: string, home = ""): Crumb[] {
   const path: string[] = [];
-  for (let b = focus; b !== ""; b = parentBox(view, b)) path.unshift(b);
-  const crumbs: Crumb[] = [{ id: "", label: "root" }];
+  for (let b = focus; b !== "" && b !== home; b = parentBox(view, b)) path.unshift(b);
+  const crumbs: Crumb[] = [{ id: "", label: home || "root" }];
   for (const id of path) {
-    const parent = crumbs[crumbs.length - 1].id;
+    const parent = crumbs.length === 1 ? home : crumbs[crumbs.length - 1].id;
     let label: string;
     const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
     if (named !== undefined) label = named;
```

```diff
diff --git a/web/src/Header.tsx b/web/src/Header.tsx
--- a/web/src/Header.tsx
+++ b/web/src/Header.tsx
@@ -5,6 +5,7 @@ import { breadcrumb, depthNote, edgesNote, honestyLine, title } from "./headline
 type Props = {
   view: View;
   focus: string;
+  home?: string; // 11: the box the page root draws (cut.ts home)
   boxes: number;
   depth: number;
   onFocus: (box: string) => void;
@@ -15,7 +16,7 @@ type Props = {
   onToggle?: () => void;
 };
 
-export function Header({ view, focus, boxes, depth, onFocus, auto, from, hidden = 0, full, onToggle }: Props) {
+export function Header({ view, focus, home = "", boxes, depth, onFocus, auto, from, hidden = 0, full, onToggle }: Props) {
   const compare = view.links?.compare?.startsWith("https://") ? view.links.compare : null;
   const [showErrors, setShowErrors] = useState(false);
   const errors = view.honesty.parseErrors;
@@ -42,7 +43,7 @@ export function Header({ view, focus, boxes, depth, onFocus, auto, from, hidden
         </ul>
       )}
       <nav className="crumbs" aria-label="Focus">
-        {breadcrumb(view, focus).map((c, i, all) => (
+        {breadcrumb(view, focus, home).map((c, i, all) => (
           <span key={c.id}>
             {i > 0 && <span className="sep"> / </span>}
             {i === all.length - 1 ? (
```

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -2,7 +2,7 @@ import { useEffect, useMemo, useRef, useState } from "react";
 import { ReactFlowProvider } from "@xyflow/react";
 import { Canvas } from "./Canvas";
 import { changedSubgraph, nodeMark } from "./change";
-import { parentBox } from "./cut";
+import { home, upTo } from "./cut";
 import type { View } from "./data";
 import { pageEngine } from "./engine";
 import { Header } from "./Header";
@@ -121,6 +121,7 @@ export function App({ view: whole }: { view: View }) {
   // focus: from the start, and on a later hashchange.
   const [full, setFull] = useState(() => change && openFull(changedSubgraph(whole), state.focus));
   const view = useMemo(() => (change && !full ? changedSubgraph(whole) : proposed), [whole, proposed, change, full]);
+  const homeBox = useMemo(() => home(view), [view]); // 11: what the page root draws
   useEffect(() => {
     if (change && !full && openFull(view, state.focus)) setFull(true);
   }, [change, full, view, state.focus]);
@@ -129,7 +130,7 @@ export function App({ view: whole }: { view: View }) {
   const [searchOpen, setSearchOpen] = useState(false);
   const [fit, setFit] = useState(0);
   const pin = useMemo(() => pinFor(whole), [whole]); // 06: violations stay red
-  const requested = useMemo(() => scene(view, state, { pin }), [view, state, pin]);
+  const requested = useMemo(() => scene(view, state, { pin, home: true }), [view, state, pin]);
   // A view over DRAW_LIMIT draws the deepest depth that fits and says so; only
   // when even depth 1 is too big does the reader choose (Deviation 8).
   // "Draw depth M anyway" holds for this graph only.
@@ -137,8 +138,8 @@ export function App({ view: whole }: { view: View }) {
   const [confirmed, setConfirmed] = useState<string | null>(null);
   const fitted = useMemo(() => {
     if (confirmed === wanted) return requested;
-    const d = fitDepth(requested, (depth) => scene(view, { ...state, depth }, { pin }));
-    return d === null ? null : d === requested.depth ? requested : scene(view, { ...state, depth: d }, { pin });
+    const d = fitDepth(requested, (depth) => scene(view, { ...state, depth }, { pin, home: true }));
+    return d === null ? null : d === requested.depth ? requested : scene(view, { ...state, depth: d }, { pin, home: true });
   }, [confirmed, wanted, requested, view, state, pin]);
   const sc = fitted ?? requested;
   const ask = fitted === null;
@@ -201,7 +202,7 @@ export function App({ view: whole }: { view: View }) {
       const a = keyAction(e.key, {
         searchOpen,
         selected: state.selected !== null,
-        atRoot: state.focus === "",
+        atRoot: upTo(view, state.focus) === null,
         typing: e.target instanceof HTMLInputElement,
         mod: e.metaKey || e.ctrlKey || e.altKey,
       });
@@ -211,7 +212,7 @@ export function App({ view: whole }: { view: View }) {
       } else if (a === "closeSearch") searchBox.current?.blur();
       else if (a === "fit") setFit((n) => n + 1);
       else if (a === "clearSelection") choose(null);
-      else if (a === "up") update((s) => up(s, parentBox(view, s.focus)));
+      else if (a === "up") update((s) => up(s, upTo(view, s.focus) ?? ""));
       else if (a === "declutter") update((s) => ({ ...s, stage: nextStage(s.stage) }));
       else if (a === "deeper") update((s) => deeper(s, sc.depth));
       else if (a === "shallower") update((s) => shallower(s, sc.depth));
@@ -229,13 +230,14 @@ export function App({ view: whole }: { view: View }) {
   const ranks = sc.nodes.some((n) => n.rank !== undefined);
   const crap = sc.nodes.some((n) => n.crap); // 08: only with a coverprofile (A7)
   const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
-  const pkg = state.focus.endsWith(PKG) ? state.focus.slice(0, -PKG.length) : state.focus;
+  const pkg = sc.focus.endsWith(PKG) ? sc.focus.slice(0, -PKG.length) : sc.focus;
 
   return (
     <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
       <Header
         view={proposed}
-        focus={state.focus}
+        focus={sc.focus}
+        home={homeBox}
         boxes={boxes}
         depth={sc.depth}
         auto={state.depth === null}
@@ -298,8 +300,8 @@ export function App({ view: whole }: { view: View }) {
             <button type="button" onClick={() => update((s) => ({ ...s, edges: "off" }))}>
               Hide edges
             </button>{" "}
-            {state.focus !== "" && (
-              <button type="button" onClick={() => update((s) => up(s, parentBox(view, s.focus)))}>
+            {upTo(view, state.focus) !== null && (
+              <button type="button" onClick={() => update((s) => up(s, upTo(view, s.focus) ?? ""))}>
                 Go back one level
               </button>
             )}{" "}
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

### Task 6: A readable first view, and a minimap

The first view (Deviation 6), the lead's screenshot review (Deviation 14), reading at rest (Deviation 15) and the grouping ruling's two changes (Deviation 16): boxes as wide as their text that say what they use and are used by, rows no wider than the screen, a minimap the reader can hide, an axis and legend that say what the rows mean, the 3 most used boxes marked, and a count of the dependencies against the order.

**Files:**
- Create: `web/src/viewport.ts`, `web/src/viewport.test.ts`
- Modify: `web/src/Canvas.tsx`, `web/src/styles.css`, `web/src/App.tsx`, `web/src/Header.tsx`, `web/src/layout.ts`, `web/src/layout.test.ts`, `web/src/scene.ts`, `web/src/scene.test.ts`, `web/src/tree.ts`, `web/src/tree.test.ts`, `web/src/rank.ts`, `web/src/rank.test.ts`, `web/src/headline.ts`, `web/src/headline.test.ts`

**Steps:**

- [ ] **Write the failing tests.** `viewport.test.ts` is new. `layout.test.ts` adds `textWidth`, text-sized boxes with the longest stats line, the `ROW_MAX` wrap (containers counted), and a container widened to its label but no taller than its rows. `scene.test.ts` adds the uses/used-by counts (the same across edge modes and selection) and the hubs and the against count; `tree.test.ts` the stats line; `rank.test.ts` the pairs set aside; `headline.test.ts` `againstNote`. The WRAP case moves to declarations.

<!-- file: web/src/viewport.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import css from "./styles.css?raw";
import { FLOOR, LABEL_PX, mapByDefault, PAD, readableFit, READABLE_PX } from "./viewport";

const canvas = { w: 1000, h: 600 };

describe("readableFit (11)", () => {
  it("reads the label size the floor is computed from out of styles.css", () => {
    expect(/\n\.node \{[^}]*font-size: (\d+)px/.exec(css)?.[1]).toBe(String(LABEL_PX));
    expect(FLOOR * LABEL_PX).toBeCloseTo(READABLE_PX);
  });
  it("centres a scene that fits at a readable zoom, and does not blow up a small one", () => {
    const v = readableFit([{ x: 0, y: 0, w: 100, h: 40 }], canvas);
    expect(v).toEqual({ x: 500 - 50 * 1.2, y: 300 - 20 * 1.2, zoom: 1.2, whole: true });
    const wide = readableFit([{ x: 0, y: 0, w: 1000, h: 40 }], canvas);
    expect([wide.zoom, wide.whole]).toEqual([(1000 - 2 * PAD) / 1000, true]);
  });
  it("never goes below the floor: the top of the scene at the top, its first row centred", () => {
    // Three rows: a narrow top row at x 1000..1200, a wide row below it.
    const rects = [
      { x: 1000, y: 0, w: 200, h: 40 },
      ...Array.from({ length: 12 }, (_, i) => ({ x: i * 200, y: 100, w: 180, h: 40 })),
      { x: 0, y: 2000, w: 100, h: 40 },
    ];
    const v = readableFit(rects, canvas);
    expect([v.zoom, v.whole, v.y]).toEqual([FLOOR, false, PAD]);
    expect(v.x).toBeCloseTo(500 - 1100 * FLOOR); // the top row's centre in the middle
  });
  it("keeps the scene's edge at the canvas edge rather than show empty space beside it", () => {
    // The top row at the far left of a wide scene.
    const rects = [{ x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 100, w: 4000, h: 40 }, { x: 0, y: 2000, w: 100, h: 40 }];
    const v = readableFit(rects, canvas);
    expect(v.x).toBeCloseTo(PAD);
  });
  it("draws nothing for an empty scene", () => {
    expect(readableFit([], canvas)).toEqual({ x: 0, y: 0, zoom: 1, whole: true });
  });
});

describe("mapByDefault (11)", () => {
  it("shows the minimap at first only in a window 900 px wide or more", () => {
    expect([mapByDefault(1600), mapByDefault(900), mapByDefault(899), mapByDefault(390)]).toEqual([true, true, false, false]);
  });
});
```

```diff
diff --git a/web/src/layout.test.ts b/web/src/layout.test.ts
--- a/web/src/layout.test.ts
+++ b/web/src/layout.test.ts
@@ -3,10 +3,10 @@ import ELK from "elkjs/lib/elk.bundled.js";
 import type { ElkNode } from "elkjs/lib/elk-api";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { parseView } from "./data";
-import { absolute, elkGraph, inOrder, layout, orderOf, positions, sizeOf, superseding, Superseded, triangles, WRAP, type Stoppable } from "./layout";
+import { absolute, containerWidth, elkGraph, INSET, inOrder, layout, orderOf, positions, ROW_MAX, sizeOf, superseding, Superseded, textWidth, triangles, WRAP, WRAP_GAP, type Stoppable } from "./layout";
 import { scene } from "./scene";
 import { DEFAULT_STATE } from "./state";
-import { edge, pkgs, view } from "./testkit";
+import { decl, edge, pkgs, view } from "./testkit";
 
 const v = parseView(JSON.stringify(golden));
 const elk = new ELK();
@@ -27,12 +27,27 @@ describe("layout", () => {
   it("sizes come from text: box stats, method rows, container labels; no drawn edge", () => {
     const g = elkGraph(scene(v, DEFAULT_STATE));
     expect(g.layoutOptions?.["elk.spacing.nodeNode"]).toBe("24");
-    expect(g.children?.[0].layoutOptions?.["elk.nodeSize.constraints"]).toBe("MINIMUM_SIZE");
-    expect(sizeOf({ id: "x", label: "gen", parent: "", shape: "box", dim: false, selected: false, methods: [] }).w).toBe(204);
+    expect(sizeOf({ id: "x", label: "gen", parent: "", shape: "box", dim: false, selected: false, methods: [] }).w).toBe(90);
     expect(sizeOf({ id: "x", label: "T", parent: "", shape: "decl", dim: false, selected: false, methods: ["Get", "Put"] }))
       .toEqual({ w: 90, h: 76 });
     expect(g.edges!.filter((e) => !e.id.includes("__rank:"))).toEqual([]);
   });
+  it("measures text with the label font's glyph advances, the widest for any other glyph", () => {
+    expect(textWidth("W")).toBe(12);
+    expect(textWidth("iii")).toBeCloseTo(9.9);
+    expect(textWidth("é")).toBe(12);
+  });
+  it("sizes a box so its label and stats line are never clipped (11)", () => {
+    const box = { id: "x", parent: "", shape: "box" as const, dim: false, selected: false, methods: [] };
+    // The longest stats line: 9,999 boxes either way, 99,999 packages.
+    const stats = "uses 9999 · used by 9999 · 99999 pkgs";
+    expect(sizeOf({ ...box, label: "gen", stats }).w).toBe(Math.ceil(textWidth(stats) + INSET));
+    // No cap: a long label widens its box.
+    const long = "staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal";
+    expect(sizeOf({ ...box, label: long }).w).toBe(Math.ceil(textWidth(long) + INSET));
+    // The rank badge and the toggle take room from the label's line only.
+    expect(sizeOf({ ...box, label: long, rank: 2, toggle: "expand", stats }).w).toBe(Math.ceil(textWidth(long) + INSET + 18 + 22));
+  });
   it("triangles sit on the top and bottom edges, apex out (uml-viewer)", () => {
     expect(triangles(100, 40)).toEqual({ in: "50,-10.39 44,0 56,0", out: "44,40 56,40 50,50.39" });
   });
@@ -165,16 +180,62 @@ describe("architecture ranks (11)", () => {
   });
 
   it("wraps a rank wider than WRAP boxes into rows of WRAP, in order", async () => {
-    // m/top over 25 leaves of rank 0, as a flat internal/ of leaves would be.
-    const leaves = Array.from({ length: 25 }, (_, i) => `m/l${String(i).padStart(2, "0")}`);
-    const x = view(pkgs(["m/top", ...leaves], "m"), leaves.map((l) => edge("m/top", l)));
-    const a = await layout(scene(x, { ...DEFAULT_STATE, focus: "m" }), elk);
+    // 25 types in one package, 90 px each: WRAP binds before ROW_MAX. (Boxes
+    // carry a stats line, so ROW_MAX binds first for them: the next test.)
+    const types = Array.from({ length: 25 }, (_, i) => `m/p.T${String(i).padStart(2, "0")}`);
+    const x = view([...pkgs(["m/p"], "m"), ...types.map((t) => decl(t, "m/p"))]);
+    const sc = scene(x, { ...DEFAULT_STATE, focus: "m/p" });
+    expect(sc.decls).toBe(true);
+    const a = await layout(sc, elk);
     const rows = new Map<number, string[]>();
-    for (const l of leaves) rows.set(a.get(l)!.y, [...(rows.get(a.get(l)!.y) ?? []), l]);
+    for (const t of types) rows.set(a.get(t)!.y, [...(rows.get(a.get(t)!.y) ?? []), t]);
     expect(WRAP).toBe(10);
     expect([...rows.values()].map((r) => r.length)).toEqual([10, 10, 5]);
-    expect([...rows.values()].map((r) => r[0])).toEqual(["m/l00", "m/l10", "m/l20"]);
-    expect(Math.min(...rows.keys())).toBeGreaterThan(a.get("m/top")!.y);
+    expect([...rows.values()].map((r) => r[0])).toEqual(["m/p.T00", "m/p.T10", "m/p.T20"]);
+  });
+
+  it("wraps a rank before its row grows wider than ROW_MAX, counting what containers hold", async () => {
+    // m/top over 12 leaves with long names, then over three containers of
+    // five such leaves each: no row may be wider than ROW_MAX.
+    const long = (p: string, i: number) => `${p}/${"subsystem_".repeat(3)}${String(i).padStart(2, "0")}`;
+    const leaves = Array.from({ length: 12 }, (_, i) => long("m", i));
+    const inner = ["m/a", "m/b", "m/c"].flatMap((c) => Array.from({ length: 5 }, (_, i) => long(c, i)));
+    const x = view(pkgs(["m/top", ...leaves, ...inner], "m"), leaves.map((l) => edge("m/top", l)));
+    const a = await layout(scene(x, { ...DEFAULT_STATE, focus: "m", depth: 2 }), elk);
+    const top = [...leaves, "m/a", "m/b", "m/c"].filter((id) => a.get(id)!.parent === undefined);
+    const rows = new Map<number, string[]>();
+    for (const id of top) rows.set(a.get(id)!.y, [...(rows.get(a.get(id)!.y) ?? []), id]);
+    const width = (r: string[]) => Math.max(...r.map((id) => a.get(id)!.x + a.get(id)!.w)) - Math.min(...r.map((id) => a.get(id)!.x));
+    expect(ROW_MAX).toBe(1280);
+    expect(rows.size).toBeGreaterThan(3);
+    // A rank's rows sit WRAP_GAP apart, closer than two ranks (24): they read as one.
+    const ys = [...rows.keys()].sort((p, q) => p - q);
+    const bottom = (y: number) => Math.max(...rows.get(y)!.map((id) => a.get(id)!.y + a.get(id)!.h));
+    const topRow = a.get("m/top")!;
+    expect(ys[0] - (topRow.y + topRow.h)).toBe(24);
+    for (let i = 0; i + 1 < ys.length; i++) expect(ys[i + 1] - bottom(ys[i])).toBe(WRAP_GAP);
+    for (const r of rows.values()) expect(width(r)).toBeLessThanOrEqual(ROW_MAX);
+    // each row takes boxes while they fit: the next row's first would not.
+    const sorted = [...rows].sort(([y1], [y2]) => y1 - y2).map(([, r]) => r);
+    for (let i = 0; i + 1 < sorted.length; i++) {
+      const next = a.get(sorted[i + 1][0])!;
+      if (sorted[i].length < WRAP) expect(width(sorted[i]) + 24 + next.w).toBeGreaterThan(ROW_MAX);
+    }
+  });
+
+  it("widens a container to its label, and keeps it as short as its rows (11)", async () => {
+    // One small leaf under a long name, beside a sibling: ELK's minimum size
+    // was not met in width and added height instead.
+    const x = view(pkgs(["m/controller_manager_and_scheduler_plugins/x", "m/y"], "m"));
+    const sc = scene(x, { ...DEFAULT_STATE, focus: "m", depth: 2 });
+    const c = sc.nodes.find((n) => n.id === "m/controller_manager_and_scheduler_plugins")!;
+    const a = await layout(sc, elk);
+    const box = a.get(c.id)!;
+    expect(box.w).toBe(containerWidth(c));
+    expect(box.h).toBe(24 + 40 + 12);
+    const leaf = a.get("m/controller_manager_and_scheduler_plugins/x")!;
+    expect(leaf.x + leaf.w / 2).toBeCloseTo(box.w / 2); // centred in it
+    expect(elkGraph(sc).children!.find((n) => n.id === c.id)!.layoutOptions!["elk.nodeSize.minimum"]).toBeUndefined();
   });
 
   it("uses the Policy's ranks in a sibling set that has one, and tiers in the others", async () => {
```

```diff
diff --git a/web/src/scene.test.ts b/web/src/scene.test.ts
--- a/web/src/scene.test.ts
+++ b/web/src/scene.test.ts
@@ -21,6 +21,54 @@ const g = parseView(JSON.stringify(golden));
 const store = "example.com/shop/internal/store";
 
 describe("scene", () => {
+  // 11: m/a uses m/b and m/c; m/b uses m/c; m/c holds two packages.
+  const uses = view(pkgs(["m/a", "m/b", "m/c/x", "m/c/y"], "m"), [edge("m/a", "m/b"), edge("m/a", "m/c/x"), edge("m/a", "m/c/y"), edge("m/b", "m/c/x")]);
+  it("gives each box its stats line: the distinct drawn boxes it uses and is used by, then packages (11)", () => {
+    const at = (s: ViewState) => Object.fromEntries(scene(uses, s).nodes.map((n) => [n.id, n.stats]));
+    const want = { "m/a": "uses 2 · used by 0", "m/b": "uses 1 · used by 1", "m/c": "uses 0 · used by 2 · 2 pkgs" };
+    expect(at({ ...DEFAULT_STATE, focus: "m", depth: 1 })).toEqual(want);
+    // The count is the same whatever lines are drawn, selected or hidden.
+    expect(at({ ...DEFAULT_STATE, focus: "m", depth: 1, edges: "off", selected: "m/b" })).toEqual(want);
+    const g = parseView(JSON.stringify(golden));
+    const sc = scene(g, { ...DEFAULT_STATE, focus: "example.com/shop", depth: 1 });
+    expect(sc.nodes.filter((x) => x.shape !== "box" && x.stats !== undefined)).toEqual([]);
+  });
+  it("counts the dependencies that run against the rows (11)", () => {
+    const at = (w: typeof uses, s: Partial<ViewState> = {}) => scene(w, { ...DEFAULT_STATE, focus: "m", depth: 1, ...s }).against;
+    expect(at(uses)).toBe(0);
+    // m/c/x uses m/a: boxes m/a and m/c now form a cycle, and one of its pairs is set aside.
+    const loop = view(pkgs(["m/a", "m/b", "m/c/x", "m/c/y"], "m"), [...uses.edges, edge("m/c/x", "m/a")]);
+    expect(at(loop)).toBe(1);
+    expect(at(loop, { edges: "off", selected: "m/b" })).toBe(1);
+    // With a Level on m/a, the Policy places the top set: its cycle is not counted.
+    const placed = { ...view([...pkgs(["m/a"], "m", { rank: 1 }), ...pkgs(["m/b", "m/c/x", "m/c/y"], "m")], loop.edges), policy: { hash: "sha256:p", levels: [["m/a"]] } };
+    expect(at(placed)).toBe(0);
+  });
+  it("counts uses and used by from the dependencies, not the lines, at every declutter stage (11)", () => {
+    // Depth 2, two containers: the arrows stage merges every line into m/a → m/b.
+    const two = view(pkgs(["m/a/p", "m/a/q", "m/b/r", "m/b/s"], "m"),
+      [edge("m/a/p", "m/b/r"), edge("m/a/q", "m/b/r"), edge("m/a/q", "m/b/s"), edge("m/b/r", "m/b/s")]);
+    const at = (stage: ViewState["stage"]) => {
+      const sc = scene(two, { ...DEFAULT_STATE, focus: "m", depth: 2, stage });
+      return [Object.fromEntries(sc.nodes.filter((n) => n.stats).map((n) => [n.id, n.stats])), sc.nodes.filter((n) => n.hub).map((n) => n.id)];
+    };
+    const want = [
+      { "m/a/p": "uses 1 · used by 0", "m/a/q": "uses 2 · used by 0", "m/b/r": "uses 1 · used by 2", "m/b/s": "uses 0 · used by 2" },
+      ["m/b/r", "m/b/s"],
+    ];
+    expect(at("arrows")).toEqual(want);
+    expect(at("full")).toEqual(want);
+    expect(at("triangles")).toEqual(want);
+  });
+  it("emphasises the 3 most used boxes, at rest only (11)", () => {
+    const hubs = (s: ViewState) => scene(uses, s).nodes.filter((n) => n.hub).map((n) => n.id);
+    // m/a is used by none, so only two qualify.
+    expect(hubs({ ...DEFAULT_STATE, focus: "m", depth: 1 })).toEqual(["m/c", "m/b"].sort());
+    expect(hubs({ ...DEFAULT_STATE, focus: "m", depth: 1, selected: "m/a" })).toEqual([]);
+    // Four boxes used by one each: the ties go by id.
+    const four = view(pkgs(["m/a", "m/b", "m/c", "m/d", "m/e"], "m"), ["m/b", "m/c", "m/d", "m/e"].map((t) => edge("m/a", t)));
+    expect(scene(four, { ...DEFAULT_STATE, focus: "m", depth: 1 }).nodes.filter((n) => n.hub).map((n) => n.id)).toEqual(["m/b", "m/c", "m/d"]);
+  });
   it("draws the cut with labels relative to their container", () => {
     const sc = at({ focus: "", depth: 2 });
     expect(sc.nodes.map((n) => [n.id, n.label, n.shape, n.toggle ?? ""])).toEqual([
```

```diff
diff --git a/web/src/tree.test.ts b/web/src/tree.test.ts
--- a/web/src/tree.test.ts
+++ b/web/src/tree.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { autoDepth } from "./cut";
-import { boxStats, parentBox } from "./tree";
+import { boxStats, statsLine, parentBox } from "./tree";
 import { bundles, containers, declLeaves, leavesAt, methodsOf, touchedExternals } from "./testkit";
 import { parseView } from "./data";
 import type { View } from "./data";
@@ -98,5 +98,15 @@ describe("the shop golden", () => {
   it("box stats sum the packages under a box", () => {
     expect(boxStats(v, "example.com/shop/internal")).toEqual({ packages: 3, decls: 23, unresolved: 8 });
     expect(boxStats(v, "example.com/shop#pkg").packages).toBe(1);
+    // Once per View: the scene asks for every box on every change of state.
+    expect(boxStats(v, "example.com/shop/internal")).toBe(boxStats(v, "example.com/shop/internal"));
+    expect(boxStats(v, "example.com/shop/nope")).toEqual({ packages: 0, decls: 0, unresolved: 0 });
+    const one = view(pkgs(["m/a", "m/a/b", "m/c"], "m").map((n) => ({ ...n, decls: 2 })));
+    expect([boxStats(one, "m"), boxStats(one, "m/a"), boxStats(one, "m/a#pkg")].map((s) => [s.packages, s.decls])).toEqual([[3, 6], [2, 4], [1, 2]]);
+  });
+  it("a box's stats line says how it connects, then its packages (11)", () => {
+    // Decls and unresolved calls are in the Panel; the box says what it uses.
+    expect(statsLine({ uses: 2, usedBy: 5, packages: 3 })).toBe("uses 2 · used by 5 · 3 pkgs");
+    expect(statsLine({ uses: 0, usedBy: 1, packages: 1 })).toBe("uses 0 · used by 1");
   });
 });
```

```diff
diff --git a/web/src/rank.test.ts b/web/src/rank.test.ts
--- a/web/src/rank.test.ts
+++ b/web/src/rank.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest";
-import { siblingTiers, tiers, type Arc } from "./rank";
+import { ranks, siblingRanks, siblingTiers, tiers, type Arc } from "./rank";
 
 const arcs = (s: string): Arc[] =>
   s.split(" ").map((p) => {
@@ -39,6 +39,28 @@ describe("tiers", () => {
   });
 });
 
+describe("against the order (11)", () => {
+  it("counts the sibling pairs whose arcs were set aside, 0 without a cycle", () => {
+    expect(ranks(["a", "b", "c"], arcs("a>b b>c a>c")).against).toBe(0);
+    expect(ranks(["a", "b"], arcs("a>b*5 b>a*1")).against).toBe(1);
+    // Repeated arcs of one pair are one dependency.
+    expect(ranks(["a", "b"], arcs("a>b*3 b>a b>a")).against).toBe(1);
+    // c over a over b: b → c points up.
+    expect(ranks(["a", "b", "c"], arcs("a>b*2 b>c*1 c>a*3")).against).toBe(1);
+    expect(ranks(["a", "b"], arcs("a>b")).tiers).toEqual(tiers(["a", "b"], arcs("a>b")));
+  });
+  it("adds up every sibling set, counting lifted pairs once", () => {
+    const parent = new Map([["A", ""], ["B", ""], ["a1", "A"], ["a2", "A"], ["b1", "B"]]);
+    // A ⇄ B (lifted from three arcs) and a1 ⇄ a2 inside A: two.
+    const r = siblingRanks(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1"));
+    expect(r.against).toBe(2);
+    expect(r.tiers).toEqual(siblingTiers(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1")));
+    // A set the Policy's Levels place is not drawn by these ranks: not counted.
+    expect(siblingRanks(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1"), (p) => p === "").against).toBe(1);
+    expect(siblingRanks(parent, arcs("a1>b1*2 a2>b1*2 b1>a1*3 a1>a2*2 a2>a1"), (p) => p === "A").against).toBe(1);
+  });
+});
+
 describe("siblingTiers", () => {
   // A (a1, a2) and B (b1) at the top, with t beside them.
   const parent = new Map([["A", ""], ["B", ""], ["t", ""], ["a1", "A"], ["a2", "A"], ["b1", "B"]]);
```

```diff
diff --git a/web/src/headline.test.ts b/web/src/headline.test.ts
--- a/web/src/headline.test.ts
+++ b/web/src/headline.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { parseView, type View } from "./data";
-import { breadcrumb, depthNote, edgesNote, honestyLine, redLegend, title, violationsNote } from "./headline";
+import { againstNote, breadcrumb, depthNote, edgesNote, honestyLine, redLegend, title, violationsNote } from "./headline";
 import { pkgs, view } from "./testkit";
 
 const v = parseView(JSON.stringify(golden));
@@ -13,6 +13,14 @@ describe("edgesNote (11)", () => {
   });
 });
 
+describe("againstNote (11)", () => {
+  it("counts the dependencies that point up the rows, and says nothing at 0", () => {
+    expect(againstNote(0)).toBe("");
+    expect(againstNote(1)).toBe("1 dependency runs against the order.");
+    expect(againstNote(4)).toBe("4 dependencies run against the order.");
+  });
+});
+
 describe("header", () => {
   it("titles the view with its modules and commit", () => {
     const at = (head: View["head"], modules = v.modules) => title({ ...v, head, modules });
```

- [ ] **Run:** `cd web && npx vitest run src/viewport.test.ts src/layout.test.ts src/scene.test.ts src/tree.test.ts src/rank.test.ts src/headline.test.ts` Expected: FAIL (`Failed to resolve import "./viewport"`; `textWidth`, `statsLine`, `ROW_MAX`, `WRAP_GAP`, `ranks`, `siblingRanks`, `againstNote` and `mapByDefault` are not exported; no box has `stats` or `hub`)

- [ ] **Implement.** `Canvas` drops the `fitView` prop. An effect applies `readableFit` on the first draw (unless the hash centres a node) and on each `f`. The MiniMap shows when the view is not whole, and a Controls button hides and shows it (Deviations 6, 14). `BoxNode` draws the node's `stats`, and a `hub` class. The axis is a column beside the canvas; the legend becomes a strip above it (App, styles.css). `rank.ts` counts the pairs set aside, `scene` carries the sum as `against`, and `Header` shows `againstNote` (Deviation 16). `layout.ts` measures text, wraps at `ROW_MAX`, drops ELK's container minimum and replaces `centred` with `packed`. `arrange` is the post-pass `App` and `layout()` share.

<!-- file: web/src/viewport.ts -->
```ts
// The first view of a scene (11): all of it when its labels stay readable,
// else its top at a readable zoom, and the reader pans. fitView alone shrank
// hugo and kubernetes until box labels were about 3 px high.

export const LABEL_PX = 12; // .node font-size in styles.css
export const READABLE_PX = 11; // the smallest label the first view draws
export const FLOOR = READABLE_PX / LABEL_PX;
export const MAX_ZOOM = 1.2; // as Canvas centres a node: a small scene is not blown up
export const PAD = 24; // px between the scene and the canvas edge

// mapByDefault: below 900 px of window width the minimap would cover much of
// the canvas (on a phone, 4 to 8 boxes), so it starts hidden; its button in
// the controls shows it.
export const MAP_MIN_WIDTH = 900;
export const mapByDefault = (windowWidth: number): boolean => windowWidth >= MAP_MIN_WIDTH;

export type Rect = { x: number; y: number; w: number; h: number };
export type Viewport = { x: number; y: number; zoom: number };

// readableFit is the viewport that shows rects (absolute, in layout units) on
// a canvas of w × h px. When the whole scene fits at FLOOR or more, it is
// centred, as fitView would; whole says so. Otherwise the zoom is FLOOR and the
// top of the scene sits at the top of the canvas: the highest ranks, which
// depend on the rest, centred across it, but never so far that empty space
// shows beside the scene.
export function readableFit(rects: readonly Rect[], canvas: { w: number; h: number }): Viewport & { whole: boolean } {
  if (rects.length === 0) return { x: 0, y: 0, zoom: 1, whole: true };
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  const [w, h] = [right - left, bottom - top];
  const fit = Math.min(MAX_ZOOM, (canvas.w - 2 * PAD) / w, (canvas.h - 2 * PAD) / h);
  if (fit >= FLOOR) {
    return { x: canvas.w / 2 - ((left + right) / 2) * fit, y: canvas.h / 2 - ((top + bottom) / 2) * fit, zoom: fit, whole: true };
  }
  const zoom = FLOOR;
  let cx = (left + right) / 2;
  if (w * zoom > canvas.w - 2 * PAD) {
    // the first row: every rect that starts within one box height of the top.
    const row = rects.filter((r) => r.y < top + 40);
    const mid = (Math.min(...row.map((r) => r.x)) + Math.max(...row.map((r) => r.x + r.w))) / 2;
    const half = (canvas.w / 2 - PAD) / zoom;
    cx = Math.min(Math.max(mid, left + half), right - half);
  }
  return { x: canvas.w / 2 - cx * zoom, y: PAD - top * zoom, zoom, whole: false };
}
```

```diff
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -1,8 +1,10 @@
 import {
   Background,
+  ControlButton,
   Controls,
   Handle,
   MarkerType,
+  MiniMap,
   Position,
   ReactFlow,
   type Edge,
@@ -19,13 +21,12 @@ import { around } from "./edges";
 import { absolute, triangles, type Placed } from "./layout";
 import { crapGrade, crapLabel } from "./metrics";
 import type { Scene, SceneEdge, SceneNode } from "./scene";
-import { boxStats } from "./tree";
+import { mapByDefault, readableFit } from "./viewport";
 
 type Data = {
   node: SceneNode;
   w: number;
   h: number;
-  stats?: { packages: number; decls: number; unresolved: number };
   row: string | null;
   pick: (id: string) => void;
   toggle?: (id: string) => void;
@@ -78,7 +79,7 @@ function Toggle({ data }: { data: Data }) {
 // (07), the CRAP fill (08), selection and dimming.
 const cls = (base: string, n: SceneNode, selected: boolean) =>
   `node ${base}${n.change ? ` ${n.change}` : ""}${n.hidden ? " hides-violation" : ""}${n.rank !== undefined ? " ranked" : ""}` +
-  `${n.crap ? ` crap-${n.crap.band}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}`;
+  `${n.crap ? ` crap-${n.crap.band}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}${n.hub ? " hub" : ""}`;
 
 // Crap is the CRAP badge (08), at the lower right, or in a container's
 // header: the number and its band in words, so the fill is never the only
@@ -110,7 +111,6 @@ function Rank({ node }: { node: SceneNode }) {
 }
 
 function BoxNode({ data, selected }: NodeProps<ZNode>) {
-  const s = data.stats;
   return (
     <div className={cls("box", data.node, selected)} title={data.node.id}>
       <Ends />
@@ -118,12 +118,7 @@ function BoxNode({ data, selected }: NodeProps<ZNode>) {
       <Crap node={data.node} />
       <Toggle data={data} />
       <div className="label">{data.node.label}</div>
-      {s && (
-        <div className="stats">
-          {s.packages > 1 && `${s.packages} pkgs · `}
-          {s.decls} decls{s.unresolved > 0 && ` · ${s.unresolved} unresolved`}
-        </div>
-      )}
+      {data.node.stats && <div className="stats">{data.node.stats}</div>}
       <Marks data={data} />
     </div>
   );
@@ -209,7 +204,7 @@ type Props = {
   onToggle?: (id: string) => void;
   onEdge?: (id: string) => void;
   center?: { id: string; seq: number }; // a node to bring into view
-  fit?: number; // fits the whole scene each time it changes (the f key)
+  fit?: number; // the first view again each time it changes (the f key)
 };
 
 // drawnFor is the drawn node standing for id: itself, its #pkg leaf, or the
@@ -248,16 +243,31 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
     const cy = at.y + p.h / 2;
     void rf.setViewport({ x: r.width / 2 - cx * zoom, y: r.height / 2 - cy * zoom, zoom });
   }, [rf, target, placed, center?.seq]);
+  // 11: the first view, unless a node is centred instead, and the f key show
+  // the scene at a readable zoom (viewport.ts), not fitView's; a scene larger
+  // than that gets a minimap, which the reader can hide.
+  const [whole, setWhole] = useState(true);
+  // The minimap covers the canvas's lower right corner; its button in the
+  // controls hides it, and shows it again. A narrow window starts without it.
+  const [map, setMap] = useState(() => mapByDefault(window.innerWidth));
+  const fitted = useRef<number | null>(null);
   useEffect(() => {
-    if (fit) void rf.fitView();
-  }, [rf, fit]);
+    const r = box.current?.getBoundingClientRect();
+    const first = fitted.current === null;
+    if (fitted.current === (fit ?? 0) || !r || r.width === 0 || r.height === 0) return;
+    fitted.current = fit ?? 0;
+    if (first && target !== null) return;
+    const rects = [...placed].map(([id, p]) => ({ ...absolute(placed, id)!, w: p.w, h: p.h }));
+    const { whole: all, ...v } = readableFit(rects, { w: r.width, h: r.height });
+    setWhole(all);
+    void rf.setViewport(v);
+  }, [rf, fit, placed, target]);
   // 11: while lines are on demand, a hovered box draws its own over the rest.
   const [hover, setHover] = useState<string | null>(null);
   const nodes: ZNode[] = useMemo(() => [...sc.nodes]
     .sort((a, b) => depth(byId, a.id) - depth(byId, b.id) || (a.id < b.id ? -1 : 1))
     .map((node) => {
       const p = placed.get(node.id) ?? { x: 0, y: 0, w: 90, h: 40 };
-      const stats = node.shape === "box" ? boxStats(view, node.id) : undefined;
       return {
         id: node.id,
         type: node.shape,
@@ -269,9 +279,9 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
         selected: node.selected,
         draggable: false,
         connectable: false,
-        data: { node, w: p.w, h: p.h, stats, row: sc.selectedRow, pick: onSelect, toggle: onToggle },
+        data: { node, w: p.w, h: p.h, row: sc.selectedRow, pick: onSelect, toggle: onToggle },
       };
-    }), [sc, placed, view, onSelect, onToggle]); // byId comes from sc
+    }), [sc, placed, onSelect, onToggle]); // byId comes from sc
   const drawn = new Set(sc.edges.map((e) => e.id));
   const hovered: SceneEdge[] = sc.lines || hover === null || hover === sc.selected ? []
     : around(sc.all, hover, (id) => byId.get(id)?.parent ?? "").filter((e) => !drawn.has(e.id)).map((e) => ({ ...e, hot: true, dim: false }));
@@ -291,18 +301,36 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
     };
   });
   return (
-    <div ref={box} className="flow">
+    <div className="flow-row">
+      {/* 11: what the rows mean. Higher rows use lower ones (ranked, rank.ts);
+          the bottom rank uses none of its siblings. Nothing more is promised:
+          longest-path ranks do not lift a box nothing uses to the top. */}
+      <div className="axis" role="note" aria-label="Rows: a box uses the rows below it; at the bottom, boxes that depend on nothing here">
+        <span className="uses">
+          <span className="v">uses</span>
+          <span>↓</span>
+        </span>
+        <span className="v">depends on nothing here</span>
+      </div>
+    {/* 11: Enter or Space on a focused box selects it, as a click does; a
+        button inside the box keeps its own keys. */}
+    <div ref={box} className="flow" onKeyDown={(e) => {
+      const n = e.target as HTMLElement;
+      if (!n.classList?.contains("react-flow__node") || (e.key !== "Enter" && e.key !== " ")) return;
+      e.preventDefault();
+      onSelect(n.getAttribute("data-id"));
+    }}>
       <ReactFlow
         nodes={nodes}
         edges={rfEdges}
         nodeTypes={nodeTypes}
-        fitView={target === null}
         minZoom={0.05}
         zoomOnDoubleClick={false}
         onlyRenderVisibleElements
         onInit={() => performance.mark("zu-drawn")}
         nodesDraggable={false}
         nodesConnectable={false}
+        nodesFocusable
         onNodeClick={(_, n) => onSelect(n.id)}
         onNodeDoubleClick={(_, n) => {
           const node = byId.get(n.id);
@@ -314,8 +342,16 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
         onNodeMouseLeave={() => setHover(null)}
       >
         <Background />
-        <Controls showInteractive={false} />
+        <Controls showInteractive={false}>
+          {!whole && (
+            <ControlButton className="zu-map" onClick={() => setMap((m) => !m)} title={map ? "Hide the minimap" : "Show the minimap"} aria-label={map ? "Hide the minimap" : "Show the minimap"} aria-pressed={map}>
+              ▦
+            </ControlButton>
+          )}
+        </Controls>
+        {!whole && map && <MiniMap pannable zoomable ariaLabel="Minimap" />}
       </ReactFlow>
     </div>
+    </div>
   );
 }
```

```diff
diff --git a/web/src/styles.css b/web/src/styles.css
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -129,10 +129,40 @@ pre {
   grid-column: 2;
   position: relative;
   min-height: 0;
+  display: flex; /* 11: the legend strip, then the axis and the flow */
+  flex-direction: column;
 }
 
-.flow {
+/* 11: the axis beside the canvas says what the rank rows mean. */
+.flow-row {
+  display: flex;
+  flex: 1;
+  min-height: 0;
   width: 100%;
+}
+.axis {
+  flex: 0 0 22px;
+  display: flex;
+  flex-direction: column;
+  justify-content: space-between;
+  align-items: center;
+  padding: 8px 0;
+  border-right: 1px solid var(--line);
+  color: var(--muted);
+  font-size: 11px;
+  white-space: nowrap;
+}
+.axis .v {
+  writing-mode: vertical-rl;
+}
+.axis .uses {
+  display: flex;
+  flex-direction: column;
+  align-items: center;
+}
+.flow {
+  flex: 1;
+  min-width: 0;
   height: 100%;
 }
 
@@ -153,6 +183,9 @@ pre {
   --xy-edge-label-color: var(--fg);
   --xy-controls-button-background-color: var(--box);
   --xy-controls-button-color: var(--fg);
+  --xy-minimap-background-color: var(--bg);
+  --xy-minimap-node-background-color: var(--line);
+  --xy-minimap-mask-background-color: rgba(128, 128, 128, 0.2);
 }
 
 .react-flow__handle {
@@ -206,6 +239,16 @@ pre {
 .node.selected {
   outline: 2px solid var(--accent);
 }
+/* 11: one of the most used boxes, at rest. The border is thicker, in its own
+   colour; the padding gives back the 2 px so the text keeps its room. */
+.node.box.hub {
+  border-width: 3px;
+  padding: 2px 6px;
+}
+.legend .swatch.hub {
+  border-width: 3px;
+  border-color: var(--box-border);
+}
 
 .stats,
 .row {
@@ -347,20 +390,15 @@ button.st-removed {
   stroke-width: 2;
 }
 
+/* 11: a strip above the canvas, not over it, so it never covers a box. */
 .legend {
-  position: absolute;
-  z-index: 5;
-  left: 8px;
-  top: 8px;
   display: flex;
   flex-wrap: wrap;
   gap: 8px;
-  max-width: 60%;
   padding: 4px 8px;
   font-size: 11px;
   background: var(--bg);
-  border: 1px solid var(--line);
-  border-radius: 6px;
+  border-bottom: 1px solid var(--line);
 }
 .legend .swatch {
   padding: 0 6px;
@@ -482,9 +520,9 @@ button.st-removed {
 }
 
 /* 11: a lit edge is solid when the lit box depends on the other end, and
-   dashed when the other end depends on it. */
+   dotted when the other end depends on it: not 6 4, a removed edge's dash (04). */
 .react-flow__edge.dep-in path {
-  stroke-dasharray: 6 4;
+  stroke-dasharray: 2 3;
 }
 
 .node .toggle {
```

```diff
diff --git a/web/src/layout.ts b/web/src/layout.ts
--- a/web/src/layout.ts
+++ b/web/src/layout.ts
@@ -11,14 +11,49 @@ export type Engine = { layout(graph: ElkNode): Promise<ElkNode> };
 
 const ROW = 18;
 
-// sizeOf estimates a node from its text: the label, the method rows, and for
-// boxes the stats line ("15 decls · 4 unresolved").
+// ADVANCE is the width in px of each glyph from " " to "~", then "·", in the
+// label font (.node .label: 600 12px system-ui), measured with canvas
+// measureText in chromium, firefox and webkit on macOS (they agree to 0.01
+// px) and rounded up. Stats lines are 400 11px, narrower glyph for glyph.
+const ADVANCE = [
+  3.2, 4.1, 6.5, 8, 8, 12, 8.9, 4, 5, 5, 5.8, 8, 4, 5.8, 4, 4, 8, 6, 7.6, 7.9, 8.1, 7.8, 8.1, 7.2, 8.2, 8.1, 4, 4, 8, 8, 8, 6.6,
+  11.1, 8.6, 8.2, 8.9, 8.9, 7.4, 7.1, 9.1, 9.3, 3.7, 7, 8.4, 7.1, 10.8, 9.2, 9.4, 8, 9.4, 8.2, 8, 7.9, 9.1, 8.5, 12, 8.6, 8.3, 8.1,
+  5, 4, 5, 8, 7.4, 6, 7, 7.7, 7, 7.7, 7.1, 4.8, 7.6, 7.5, 3.3, 3.3, 7, 3.4, 11, 7.4, 7.4, 7.7, 7.7, 5.1, 6.7, 4.8, 7.4, 6.9, 9.9,
+  6.8, 7, 6.7, 5, 3.5, 5, 8, 4,
+];
+const WIDEST = 12; // "W", and any glyph not in ADVANCE
+const MONO = 7; // a method row's glyph: .row is 11px ui-monospace, 6.6 px in Menlo
+
+// textWidth is how wide s draws in the label font.
+export function textWidth(s: string): number {
+  let w = 0;
+  for (const ch of s) {
+    const c = ch.codePointAt(0)!;
+    w += c >= 32 && c < 127 ? ADVANCE[c - 32] : ch === "·" ? ADVANCE[95] : WIDEST;
+  }
+  return w;
+}
+
+// INSET is what a node's border box adds to its text: .node's padding, 8 px
+// each side, and its 1 px border.
+export const INSET = 18;
+
+// sizeOf sizes a node to its text (11): the label, plus the rank badge's
+// padding (.node.ranked .label) and the toggle's corner on the label's line;
+// a box's stats line; a type's method rows. Nothing is capped, so no text is
+// clipped: a long name makes a wide box.
 export function sizeOf(n: SceneNode): { w: number; h: number } {
-  const stats = n.shape === "box" ? 24 : 0;
-  const text = Math.max(n.label.length, stats, ...n.methods.map((r) => r.length + 2));
-  return { w: Math.min(280, Math.max(90, text * 7.5 + 24)), h: 40 + ROW * n.methods.length };
+  const label = textWidth(n.label) + (n.rank !== undefined ? 18 : 0) + (n.toggle ? 22 : 0);
+  const text = Math.max(label, textWidth(n.stats ?? ""), ...n.methods.map((r) => (r.length + 2) * MONO));
+  return { w: Math.max(90, Math.ceil(text + INSET)), h: 40 + ROW * n.methods.length };
 }
 
+// containerWidth is the least a container is drawn: its label, its rank
+// badge, and its header's right end, where the toggle sits, or the CRAP badge
+// beside it (.node.container[class*="crap-"] .label).
+export const containerWidth = (n: SceneNode): number =>
+  Math.ceil(textWidth(n.label) + INSET + (n.rank !== undefined ? 18 : 0) + (n.crap ? 72 : 22));
+
 const GAP = 24; // elk.spacing.nodeNode
 
 const rootOptions = {
@@ -34,7 +69,7 @@ const rootOptions = {
   // 11: the step nodes are zero-size, and the default placement (Brandes-Köpf)
   // set each rank beside the one below it, a staircase twice as wide as the
   // widest rank (hugo 2219 px for a 1800 px rank). Network simplex keeps
-  // them within the widest; centred then puts each over the middle.
+  // them within the widest; packed then puts each over the middle.
   "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
   // 11: and a rank's many step edges add no space between two ranks.
   "elk.layered.spacing.edgeEdgeBetweenLayers": "0",
@@ -64,11 +99,8 @@ export function elkGraph(sc: Scene): ElkNode {
     }
     return {
       id: n.id,
-      layoutOptions: {
-        "elk.padding": "[top=24,left=12,bottom=12,right=12]",
-        "elk.nodeSize.constraints": "MINIMUM_SIZE",
-        "elk.nodeSize.minimum": `(${Math.min(280, n.label.length * 7.5 + 24)}, 40)`,
-      },
+      // No minimum size: packed widens a container to its header (11).
+      layoutOptions: { "elk.padding": "[top=24,left=12,bottom=12,right=12]" },
       children: [...(byParent.get(n.id) ?? []).map(build), ...(rank?.steps.get(n.id) ?? [])],
     };
   };
@@ -82,10 +114,19 @@ export function elkGraph(sc: Scene): ElkNode {
 
 export const STEP = "__rank:"; // the id prefix of ranked's invisible nodes
 
-// WRAP is the most siblings of one rank drawn side by side (11). A wider rank,
-// such as a flat internal/ of leaves that all land in rank 0, wraps into rows
-// of WRAP, in the siblings' order, each row below the last.
+// WRAP is the most siblings of one rank drawn side by side (11), and ROW_MAX
+// the widest such a row may be, in layout px. A wider rank, such as a flat
+// internal/ of leaves that all land in rank 0, wraps into rows, in the
+// siblings' order, each row below the last. At the first view's zoom (FLOOR,
+// viewport.ts) ROW_MAX is 1173 screen px, so the top rows show whole on a
+// canvas 1221 px wide. The layout never reads the canvas: resizing the window
+// moves no box.
 export const WRAP = 10;
+export const ROW_MAX = 1280;
+// WRAP_GAP is the space between the rows one rank wraps into, a quarter of
+// the 24 between two ranks, so a wrapped rank reads as one (packed).
+export const WRAP_GAP = 6;
+const PAD_X = 24; // a container's elk.padding, left and right
 
 // ranked puts siblings with a higher rank above those with a lower one, in
 // every container. A sibling set in which any node has a Policy rank uses
@@ -96,19 +137,70 @@ export const WRAP = 10;
 // needs (measured in elkjs 0.12), so between each two rows ranked adds an
 // invisible zero-size step node, with an edge from every node of the upper
 // row to it and from it to every node of the lower: O(n) edges, and the only
-// edges ELK sees. A row is a rank, or WRAP boxes of a wider one.
+// edges ELK sees. A row is a rank, or as much of a wider one as WRAP and
+// ROW_MAX allow; a container counts as wide as its own widest row.
+// levelIn is the level ranked places each of one set of siblings at.
+const levelIn = (kids: readonly SceneNode[]) => {
+  const policy = kids.some((k) => k.rank !== undefined);
+  return (n: SceneNode) => (policy ? n.rank : n.tier) ?? 0;
+};
+
+// levelsOf is every node's level among its siblings, for packed: rows of one
+// level are one rank's wrap. Empty when the scene is not ranked.
+export function levelsOf(sc: Scene): Map<string, number> {
+  if (!sc.nodes.some((n) => n.rank !== undefined || n.tier !== undefined)) return new Map();
+  const byParent = new Map<string, SceneNode[]>();
+  for (const n of sc.nodes) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
+  const out = new Map<string, number>();
+  for (const kids of byParent.values()) {
+    const level = levelIn(kids);
+    for (const k of kids) out.set(k.id, level(k));
+  }
+  return out;
+}
+
 function ranked(byParent: ReadonlyMap<string, SceneNode[]>) {
   const steps = new Map<string, ElkNode[]>();
   const edges: { id: string; sources: string[]; targets: string[] }[] = [];
-  for (const [parent, kids] of byParent) {
-    const policy = kids.some((k) => k.rank !== undefined);
-    const level = (n: SceneNode) => (policy ? n.rank : n.tier) ?? 0;
+  const rowsOf = new Map<string, { name: string; nodes: SceneNode[] }[]>();
+  const wide = new Map<string, number>();
+  const widthOf = (n: SceneNode): number => {
+    if (n.shape !== "container") return sizeOf(n).w;
+    let w = wide.get(n.id);
+    if (w === undefined) {
+      const rows = rowsFor(n.id);
+      w = Math.max(containerWidth(n), ...rows.map((r) => span(r.nodes) + PAD_X));
+      wide.set(n.id, w);
+    }
+    return w;
+  };
+  const span = (ns: readonly SceneNode[]) => ns.reduce((w, k) => w + widthOf(k), 0) + GAP * Math.max(0, ns.length - 1);
+  const rowsFor = (parent: string) => {
+    const hit = rowsOf.get(parent);
+    if (hit) return hit;
+    const kids = byParent.get(parent) ?? [];
+    const level = levelIn(kids);
     const levels = [...new Set(kids.map(level))].sort((a, b) => b - a);
     const rows: { name: string; nodes: SceneNode[] }[] = [];
     for (const l of levels) {
-      const at = kids.filter((k) => level(k) === l);
-      for (let i = 0; i < at.length; i += WRAP) rows.push({ name: i === 0 ? `${l}` : `${l}.${i / WRAP}`, nodes: at.slice(i, i + WRAP) });
+      let row: SceneNode[] = [];
+      let part = 0;
+      const close = () => {
+        rows.push({ name: part === 0 ? `${l}` : `${l}.${part}`, nodes: row });
+        part++;
+        row = [];
+      };
+      for (const k of kids.filter((x) => level(x) === l)) {
+        if (row.length > 0 && (row.length === WRAP || span([...row, k]) > ROW_MAX)) close();
+        row.push(k);
+      }
+      close();
     }
+    rowsOf.set(parent, rows);
+    return rows;
+  };
+  for (const [parent, kids] of byParent) {
+    const rows = rowsFor(parent);
     for (let i = 0; i + 1 < rows.length; i++) {
       const id = `${STEP}${parent}:${rows[i].name}`;
       steps.set(parent, [...(steps.get(parent) ?? []), { id, width: 0, height: 0 }]);
@@ -137,7 +229,19 @@ export function positions(g: ElkNode): Map<string, Placed> {
   return out;
 }
 
-export const layout = async (sc: Scene, engine: Engine) => centred(inOrder(positions(await engine.layout(elkGraph(sc))), orderOf(sc)));
+// arrange turns ELK's result into what the canvas draws: flattened, in the
+// Policy's order, packed. The page (App) and layout both use it.
+export const arrange = (
+  out: ElkNode, order: ReadonlyMap<string, number>, header: ReadonlyMap<string, number>, levels: ReadonlyMap<string, number> = new Map(),
+) => packed(inOrder(positions(out), order), header, levels);
+
+export const layout = async (sc: Scene, engine: Engine) =>
+  arrange(await engine.layout(elkGraph(sc)), orderOf(sc), headers(sc), levelsOf(sc));
+
+// headers is the least width of each container: its label and badges. ELK
+// never sees it, so a page keys its layout on it as well as on elkGraph.
+export const headers = (sc: Scene): Map<string, number> =>
+  new Map(sc.nodes.filter((n) => n.shape === "container").map((n) => [n.id, containerWidth(n)]));
 
 // orderOf is each ordered node's index in the Policy's order.
 export const orderOf = (sc: Scene): ReadonlyMap<string, number> =>
@@ -171,20 +275,64 @@ export function inOrder(placed: Map<string, Placed>, order: ReadonlyMap<string,
   return out;
 }
 
-// centred moves each row of siblings sideways so that its middle is the
-// middle of all the siblings (11): ranks read as a stack, not a staircase. A
-// row keeps its order and spacing, and never leaves its container, which is
-// at least as wide as its widest row. Lines follow, as in inOrder.
-export function centred(placed: Map<string, Placed>): Map<string, Placed> {
+// packed lays each row of siblings side by side, GAP apart and in the order
+// ELK and inOrder gave them, then centres every row in its container (11):
+// ranks read as a stack, not a staircase. A container is as wide as its widest
+// row, or as its own header needs (containerWidth), whichever is more; the
+// deepest are sized first, so a parent packs its children at their final
+// widths. ELK's minimum size for a compound node was not met in width with
+// INCLUDE_CHILDREN, and stretched the node's height instead, so the header's
+// width is applied here. Rows keep ELK's order and the gap ELK left between
+// two ranks, but the rows one rank wraps into (levels: the same level) close
+// up to WRAP_GAP, and a container shrinks by what its rows gave up. Lines
+// follow, as in inOrder.
+export function packed(
+  placed: Map<string, Placed>, header: ReadonlyMap<string, number>, levels: ReadonlyMap<string, number> = new Map(),
+): Map<string, Placed> {
   const out = new Map(placed);
-  for (const ids of siblings(placed).values()) {
-    const at = ids.map((id) => placed.get(id)!);
-    const mid = (Math.min(...at.map((p) => p.x)) + Math.max(...at.map((p) => p.x + p.w))) / 2;
-    for (const row of rowsOf(ids, placed)) {
-      const ps = row.map((id) => placed.get(id)!);
-      const dx = mid - (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x + p.w))) / 2;
-      for (const id of row) out.set(id, { ...placed.get(id)!, x: placed.get(id)!.x + dx });
+  const kids = siblings(placed);
+  const depth = (id: string) => {
+    let d = 0;
+    for (let p = placed.get(id)?.parent; p !== undefined; p = placed.get(p)?.parent) d++;
+    return d;
+  };
+  const order = [...kids.keys()].filter((p) => p !== "").sort((a, b) => depth(b) - depth(a) || cmp(a, b));
+  const lay = (ids: string[], left: number, least: number) => {
+    const rows = rowsOf(ids, out).map((r) => r.sort((a, b) => out.get(a)!.x - out.get(b)!.x || cmp(a, b)));
+    const span = (r: string[]) => r.reduce((w, id) => w + out.get(id)!.w, 0) + GAP * (r.length - 1);
+    const inner = Math.max(least, ...rows.map(span));
+    for (const r of rows) {
+      let x = left + (inner - span(r)) / 2;
+      for (const id of r) {
+        out.set(id, { ...out.get(id)!, x });
+        x += out.get(id)!.w + GAP;
+      }
     }
+    return inner;
+  };
+  // stack re-places rows top to bottom and returns how much lower (or, < 0,
+  // higher) the last row's bottom ends than ELK put it.
+  const stack = (ids: string[]) => {
+    const rows = rowsOf(ids, placed);
+    const top = (r: string[]) => Math.min(...r.map((id) => placed.get(id)!.y));
+    const bottom = (r: string[], m: ReadonlyMap<string, Placed>) => Math.max(...r.map((id) => m.get(id)!.y + m.get(id)!.h));
+    const wrap = (a: string[], b: string[]) => levels.has(a[0]) && levels.get(a[0]) === levels.get(b[0]);
+    for (let k = 1; k < rows.length; k++) {
+      const gap = wrap(rows[k - 1], rows[k]) ? WRAP_GAP : top(rows[k]) - bottom(rows[k - 1], placed);
+      const shift = bottom(rows[k - 1], out) + gap - top(rows[k]);
+      for (const id of rows[k]) out.set(id, { ...out.get(id)!, y: placed.get(id)!.y + shift });
+    }
+    return rows.length ? bottom(rows[rows.length - 1], out) - bottom(rows[rows.length - 1], placed) : 0;
+  };
+  for (const c of order) {
+    const inner = lay(kids.get(c)!, PAD_X / 2, (header.get(c) ?? 0) - PAD_X);
+    const grown = stack(kids.get(c)!);
+    out.set(c, { ...out.get(c)!, w: inner + PAD_X, h: placed.get(c)!.h + grown });
+  }
+  const top = kids.get("") ?? [];
+  if (top.length) {
+    lay(top, Math.min(...top.map((id) => placed.get(id)!.x)), 0);
+    stack(top);
   }
   return out;
 }
```

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -6,8 +6,9 @@ import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
 import { rolledRanks } from "./policy";
-import { siblingTiers } from "./rank";
+import { siblingRanks } from "./rank";
 import { always, quiet, type Dir } from "./edges";
+import { boxStats, statsLine } from "./tree";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
 import type { Known, Stage, ViewState } from "./state";
@@ -23,6 +24,8 @@ export type SceneNode = {
   rowMarks?: string[]; // the Change View class of each method row
   rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
   tier?: number; // 11: its architecture rank among its siblings (rank.ts); only the layout reads it
+  stats?: string; // 11: a box's stats line (tree.ts statsLine); the canvas draws it and layout.ts sizes by it
+  hub?: boolean; // 11: at rest, one of the HUBS most used boxes; drawn with a thicker border
   hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
   order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
   crap?: { risk: Risk; band: Band }; // 08: a box's rolled μ+σ, a function's own CRAP; null = no coverage data
@@ -40,6 +43,7 @@ export type Scene = {
   nodes: SceneNode[]; edges: SceneEdge[];
   all: SceneEdge[]; // 11: every edge the cut could draw, drawn or not; the canvas draws a hovered box's from here
   hidden: number; // 11: the lines auto leaves out at rest (edges.ts); 0 when every line is drawn
+  against: number; // 11: dependencies that run against the rows (rank.ts siblingRanks); the header counts them
   bundles: Bundle[]; // the leaf bundles behind the edges, for the panel
   selected: string | null; // the drawn node that stands for the selection
   selectedRow: string | null; // the selected method, drawn as a row of `selected`
@@ -186,9 +190,12 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   }
   // 11: every drawn node's architecture rank, from the bundles this cut
   // keeps, drawn or not, so showing or hiding lines never moves a box.
-  const tiers = siblingTiers(
+  // A sibling set with a Policy rank is placed by it (layout.ts ranked).
+  const byPolicy = new Set(nodes.filter((n) => n.rank !== undefined).map((n) => n.parent));
+  const { tiers, against } = siblingRanks(
     new Map(nodes.map((n) => [n.id, n.parent])),
     kept.map((b) => ({ from: shown(b.from), to: shown(b.to), weight: b.pairs })),
+    (p) => byPolicy.has(p),
   );
   for (const n of nodes) n.tier = tiers.get(n.id);
 
@@ -218,12 +225,45 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const byEnds = (x: SceneEdge, y: SceneEdge) => cmp(x.from, y.from) || cmp(x.to, y.to);
   edges.sort(byEnds);
   all.sort(byEnds);
+  connect(view, nodes, kept.map((b) => [shown(b.from), shown(b.to)] as const).filter(([f, t]) => ids.has(f) && ids.has(t)), selected === null);
   return {
-    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, bundles: kept,
+    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
   };
 }
 
+// HUBS is how many of the most used boxes are emphasised at rest (11).
+export const HUBS = 3;
+
+// connect gives each box its stats line (11): the distinct drawn nodes at the
+// other end of its dependencies, from the bundles the cut keeps, each end
+// drawn where it shows (links), the same source as the ranks. Not from the
+// lines: a declutter stage merges them into its containers' arrows. So the
+// text and the box's size are the same whatever the stage, edge mode, hover
+// or selection. At rest the HUBS boxes used by the most (at least one; ties
+// by id) are marked hub: where to start reading.
+function connect(view: View, nodes: SceneNode[], links: readonly (readonly [string, string])[], rest: boolean) {
+  const uses = new Map<string, Set<string>>();
+  const usedBy = new Map<string, Set<string>>();
+  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
+    const s = m.get(k);
+    if (s) s.add(v);
+    else m.set(k, new Set([v]));
+  };
+  for (const [from, to] of links) {
+    if (from === to) continue;
+    add(uses, from, to);
+    add(usedBy, to, from);
+  }
+  const boxes = nodes.filter((n) => n.shape === "box");
+  for (const n of boxes) {
+    n.stats = statsLine({ uses: uses.get(n.id)?.size ?? 0, usedBy: usedBy.get(n.id)?.size ?? 0, packages: boxStats(view, n.id).packages });
+  }
+  if (!rest) return;
+  const by = (n: SceneNode) => usedBy.get(n.id)?.size ?? 0;
+  for (const n of boxes.filter((b) => by(b) > 0).sort((a, b) => by(b) - by(a) || cmp(a.id, b.id)).slice(0, HUBS)) n.hub = true;
+}
+
 // markHidden marks each drawn node that holds both ends of a violating import
 // (07). Such an import has no line: bundlesOver drops an edge inside one leaf,
 // and declutter a bundle it lifts to a self-loop (05 Deviation 1). The mark
```

```diff
diff --git a/web/src/tree.ts b/web/src/tree.ts
--- a/web/src/tree.ts
+++ b/web/src/tree.ts
@@ -1,17 +1,40 @@
 // 04's Package Tree names, now over cut.ts and bundle.ts (feature 05).
-import type { View } from "./data";
-import { packagesIn } from "./cut";
+import type { View, ViewNode } from "./data";
+import { index, PKG } from "./cut";
 
 export { BOX_BUDGET, OUTSIDE, parentBox } from "./cut";
 export { EXTERNALS } from "./bundle";
 
+export type BoxStats = { packages: number; decls: number; unresolved: number };
+const NONE: BoxStats = Object.freeze({ packages: 0, decls: 0, unresolved: 0 });
+const stats = new WeakMap<View, Map<string, BoxStats>>();
+
 // boxStats sums the packages a box holds; a #pkg leaf holds only its package.
-export function boxStats(view: View, box: string): { packages: number; decls: number; unresolved: number } {
-  const s = { packages: 0, decls: 0, unresolved: 0 };
-  for (const p of packagesIn(view, box)) {
-    s.packages++;
-    s.decls += p.decls ?? 0;
-    s.unresolved += p.unresolved ?? 0;
+// Every box's sums come from one pass up the box tree, once per View (11):
+// the scene asks for each drawn box on every change of state.
+export function boxStats(view: View, box: string): BoxStats {
+  let all = stats.get(view);
+  if (!all) {
+    all = new Map();
+    const ix = index(view);
+    const add = (id: string, p: ViewNode) => {
+      const s = all!.get(id) ?? { ...NONE };
+      s.packages++;
+      s.decls += p.decls ?? 0;
+      s.unresolved += p.unresolved ?? 0;
+      all!.set(id, s);
+    };
+    for (const p of ix.pkgs) {
+      add(p.id + PKG, p);
+      for (let b = p.id; b !== ""; b = ix.parent.get(b) ?? "") add(b, p);
+    }
+    stats.set(view, all);
   }
-  return s;
+  return all.get(box) ?? NONE;
 }
+
+// statsLine is what a box shows under its label (11): how it connects, then
+// how many packages it holds when more than one. Decls and unresolved calls
+// are in the Panel; with lines hidden at rest, the box says what it uses.
+export const statsLine = (s: { uses: number; usedBy: number; packages: number }): string =>
+  `uses ${s.uses} · used by ${s.usedBy}${s.packages > 1 ? ` · ${s.packages} pkgs` : ""}`;
```

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -8,13 +8,13 @@ import { pageEngine } from "./engine";
 import { Header } from "./Header";
 import { redLegend, violationsNote } from "./headline";
 import { keyAction } from "./keys";
-import { elkGraph, inOrder, orderOf, positions, Superseded, type Placed } from "./layout";
+import { arrange, elkGraph, headers, levelsOf, orderOf, Superseded, type Placed } from "./layout";
 import { Panel } from "./Panel";
 import { pinFor } from "./policy";
 import { PROPOSAL_NOTICE, proposalView } from "./proposal";
 import { reveal } from "./search";
 import { SearchBox } from "./SearchBox";
-import { DRAW_LIMIT, fitDepth, openFull, scene, type SceneNode } from "./scene";
+import { DRAW_LIMIT, fitDepth, HUBS, openFull, scene, type SceneNode } from "./scene";
 import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
 import { Toolbar } from "./Toolbar";
 import { useViewState } from "./useViewState";
@@ -24,12 +24,15 @@ const PKG = "#pkg";
 type LegendProps = {
   change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null;
   onDemand: boolean; // 11: lines show for a selected or hovered box
+  hubs: boolean; // 11: some box is drawn as one of the most used
 };
 
-function Legend({ change, policy, ranks, crap, proposal, onDemand }: LegendProps) {
+function Legend({ change, policy, ranks, crap, proposal, onDemand, hubs }: LegendProps) {
   return (
     <div className="legend" aria-label="Legend">
-      {onDemand && <span className="dirs">a box's lines: solid, it depends on · dashed, depends on it</span>}
+      <span className="rows">rows are dependency order: a box mostly uses the rows below it</span>
+      {onDemand && <span className="dirs">hover or select a box for its lines: solid, it uses · dotted, used by</span>}
+      {hubs && <span className="swatch hub">thick border: the {HUBS} most used</span>}
       {change && (
         <>
           <span className="swatch st-added">added</span>
@@ -164,9 +167,14 @@ export function App({ view: whole }: { view: View }) {
   const engine = useMemo(pageEngine, []);
   useEffect(() => () => engine.dispose(), [engine]);
   const graph = useMemo(() => JSON.stringify(elkGraph(sc)), [sc]);
+  // 11: what packed widens containers to; a change lays out again.
+  const heads = useMemo(() => JSON.stringify([...headers(sc)]), [sc]);
+  const key = graph + "\n" + heads;
   // The Policy's order is a property of the nodes in graph, so a layout of
   // graph may read the order of any scene that produced it.
   const order = useMemo(() => orderOf(sc), [sc]);
+  // 11: likewise each node's level: graph holds the rows ranked made.
+  const levels = useMemo(() => levelsOf(sc), [sc]);
   const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
   const [failed, setFailed] = useState<string | null>(null);
   useEffect(() => {
@@ -176,13 +184,13 @@ export function App({ view: whole }: { view: View }) {
       (out) => {
         performance.mark("zu-layout-end");
         setFailed(null);
-        setPlaced({ graph, at: inOrder(positions(out), order) });
+        setPlaced({ graph: graph + "\n" + heads, at: arrange(out, order, new Map(JSON.parse(heads) as [string, number][]), levels) });
       },
       (e: Error) => {
         if (!(e instanceof Superseded)) setFailed(e.message);
       },
     );
-  }, [engine, graph, ask]);
+  }, [engine, graph, heads, ask]);
 
   const go = (box: string) => {
     update((s) => drill(s, box));
@@ -243,6 +251,7 @@ export function App({ view: whole }: { view: View }) {
         auto={state.depth === null}
         from={requested.depth}
         hidden={sc.hidden}
+        against={sc.noDetail ? undefined : sc.against}
         onFocus={go}
         full={change ? full : undefined}
         onToggle={flip}
@@ -263,7 +272,7 @@ export function App({ view: whole }: { view: View }) {
             {PROPOSAL_NOTICE}: {state.proposal}
           </div>
         )}
-        {(change || rules || ranks || crap || !sc.lines) && (
+        {!sc.noDetail && (
           <Legend
             change={change}
             policy={rules}
@@ -271,6 +280,7 @@ export function App({ view: whole }: { view: View }) {
             crap={crap}
             proposal={proposed === whole ? null : state.proposal}
             onDemand={!sc.lines}
+            hubs={sc.nodes.some((n) => n.hub)}
           />
         )}
         {sc !== requested && (
@@ -313,7 +323,7 @@ export function App({ view: whole }: { view: View }) {
           <div className="empty" id="zu-status">
             Layout failed: {failed}
           </div>
-        ) : placed && placed.graph === graph ? (
+        ) : placed && placed.graph === key ? (
           <ReactFlowProvider key={`${state.focus}\n${sc.depth}`}>
             <Canvas
               view={view}
```

```diff
diff --git a/web/src/rank.ts b/web/src/rank.ts
--- a/web/src/rank.ts
+++ b/web/src/rank.ts
@@ -20,7 +20,15 @@ export type Arc = { from: string; to: string; weight?: number };
 //     nothing among its siblings is 0, any other is one more than its highest
 //     dependency.
 // Arcs to ids outside the set, and self-loops, are ignored.
-export function tiers(ids: readonly string[], arcs: readonly Arc[]): Map<string, number> {
+export const tiers = (ids: readonly string[], arcs: readonly Arc[]): Map<string, number> => ranks(ids, arcs).tiers;
+
+// Ranks is a ranking and how many dependencies run against it: the sibling
+// pairs whose arcs step 2 set aside, so they point up the rows (0 without a
+// cycle). The header shows the count; nothing colours those arcs.
+export type Ranks = { tiers: Map<string, number>; against: number };
+
+// ranks is tiers with the count of pairs set aside.
+export function ranks(ids: readonly string[], arcs: readonly Arc[]): Ranks {
   const nodes = [...new Set(ids)].sort(cmp);
   const known = new Set(nodes);
   const weight = new Map<string, number>(); // "from\nto" → summed weight
@@ -65,7 +73,12 @@ export function tiers(ids: readonly string[], arcs: readonly Arc[]): Map<string,
     }
     return rank.get(v)!;
   };
-  return new Map(nodes.map((n) => [n, visit(n)]));
+  let against = 0;
+  for (const k of weight.keys()) {
+    const [f, t] = k.split("\n");
+    if (comp.get(f) === comp.get(t) && order.get(f)! > order.get(t)!) against++;
+  }
+  return { tiers: new Map(nodes.map((n) => [n, visit(n)])), against };
 }
 
 // components numbers the strongly connected components (Tarjan, iterative).
@@ -163,7 +176,16 @@ function greedy(members: readonly string[], out: ReadonlyMap<string, string[]>,
 // counts between the two siblings that hold its ends under their lowest
 // common container, and arcs lifted onto the same pair add their weights; an
 // arc between a container and something inside it counts nowhere.
-export function siblingTiers(parent: ReadonlyMap<string, string>, arcs: readonly Arc[]): Map<string, number> {
+export const siblingTiers = (parent: ReadonlyMap<string, string>, arcs: readonly Arc[]): Map<string, number> =>
+  siblingRanks(parent, arcs).tiers;
+
+// siblingRanks is siblingTiers with the pairs set aside, summed over every
+// sibling set these ranks place: a set the Policy's Levels place (placed(its
+// container) is true) is drawn by those, so its pairs are not counted. It is
+// the seam where a grouping (12) would rank its groups.
+export function siblingRanks(
+  parent: ReadonlyMap<string, string>, arcs: readonly Arc[], placed: (container: string) => boolean = () => false,
+): Ranks {
   const chain = (id: string) => {
     const c: string[] = [];
     for (let x: string | undefined = id; x !== undefined && x !== ""; x = parent.get(x)) c.unshift(x);
@@ -189,6 +211,11 @@ export function siblingTiers(parent: ReadonlyMap<string, string>, arcs: readonly
     else lifted.set(p, [arc]);
   }
   const out = new Map<string, number>();
-  for (const [p, ids] of kids) for (const [id, r] of tiers(ids, lifted.get(p) ?? [])) out.set(id, r);
-  return out;
+  let against = 0;
+  for (const [p, ids] of kids) {
+    const r = ranks(ids, lifted.get(p) ?? []);
+    for (const [id, t] of r.tiers) out.set(id, t);
+    if (!placed(p)) against += r.against;
+  }
+  return { tiers: out, against };
 }
```

```diff
diff --git a/web/src/headline.ts b/web/src/headline.ts
--- a/web/src/headline.ts
+++ b/web/src/headline.ts
@@ -63,6 +63,12 @@ export function depthNote(boxes: number, depth: number, auto = true, from = dept
 export const edgesNote = (hidden: number): string =>
   `${hidden} ${hidden === 1 ? "dependency" : "dependencies"} hidden; select or hover a box to see its own.`;
 
+// againstNote counts the dependencies that point up the rows (11): those the
+// ranking set aside to break a cycle between boxes, and nothing when there
+// are none. No colour marks them.
+export const againstNote = (n: number): string =>
+  n === 0 ? "" : `${n} ${n === 1 ? "dependency runs" : "dependencies run"} against the order.`;
+
 // violationsNote words the Change View's violations section as zu diff's
 // violationsBlock does (internal/diff/violations.go): new first, then the rest.
 export function violationsNote(d: NonNullable<View["violations"]>): { heading: string; tail: string } {
```

```diff
diff --git a/web/src/Header.tsx b/web/src/Header.tsx
--- a/web/src/Header.tsx
+++ b/web/src/Header.tsx
@@ -1,6 +1,6 @@
 import { useState } from "react";
 import type { View } from "./data";
-import { breadcrumb, depthNote, edgesNote, honestyLine, title } from "./headline";
+import { againstNote, breadcrumb, depthNote, edgesNote, honestyLine, title } from "./headline";
 
 type Props = {
   view: View;
@@ -12,11 +12,12 @@ type Props = {
   auto: boolean; // the depth is autoDepth's, not the reader's
   from?: number; // the requested depth, when the drawn one is shallower (Deviation 8)
   hidden?: number; // 11: lines auto leaves out at rest
+  against?: number; // 11: dependencies against the rows (rank.ts); undefined draws no count
   full?: boolean; // Change View only: showing the full project, not the changed subgraph
   onToggle?: () => void;
 };
 
-export function Header({ view, focus, home = "", boxes, depth, onFocus, auto, from, hidden = 0, full, onToggle }: Props) {
+export function Header({ view, focus, home = "", boxes, depth, onFocus, auto, from, hidden = 0, against, full, onToggle }: Props) {
   const compare = view.links?.compare?.startsWith("https://") ? view.links.compare : null;
   const [showErrors, setShowErrors] = useState(false);
   const errors = view.honesty.parseErrors;
@@ -59,6 +60,7 @@ export function Header({ view, focus, home = "", boxes, depth, onFocus, auto, fr
       <p className="note">
         {depthNote(boxes, depth, auto, from)}
         {hidden > 0 && <span id="zu-edges"> {edgesNote(hidden)}</span>}
+        {against !== undefined && against > 0 && <span id="zu-against"> {againstNote(against)}</span>}
         {full !== undefined && (
           <>
             {" "}
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

### Task 7: The browser suite

The amendments and the new checks are Deviation 11 (`selectLines`, `keyboard`, `narrowMap`, `policyRest` and `changeRest` are Deviation 17's). The suite runs against the built page, so it has no red step of its own: Tasks 1–6 are the red steps. Before these amendments, the page from Tasks 1–6 failed 9 of 39 checks in each engine (`hidden`, `fit`, `change`, `collapsed`, `header`, `ranks`, `redBox`, `panel`, `crap`).

**Files:**
- Modify: `web/e2e/accept.mjs`, `web/e2e/paint.mjs` (its usage only: Deviation 12)

**Steps:**

- [ ] **Amend the checks**

```diff
diff --git a/web/e2e/accept.mjs b/web/e2e/accept.mjs
--- a/web/e2e/accept.mjs
+++ b/web/e2e/accept.mjs
@@ -35,6 +35,22 @@ const ids = [];
 for (let g = 0; g < 24; g++) for (let i = 0; i < 5; i++) ids.push(`m/g${String(g).padStart(2, "0")}/p${i}`);
 const edges = ids.flatMap((id, n) => [1, 2, 3, 4, 5, 6].map((k) => imp(id, ids[(n + 5 * k) % ids.length])));
 write("big.html", page({ ...shop, modules: ["m"], nodes: [pkg("m", "m"), ...ids.map((id) => pkg(id, "m"))], edges, sources: {} }));
+// 11: big.html's 144 lines at depth 1 with one violation (m/g00 → m/g01), and
+// as a Change View with one added import (m/g02 → m/g03): auto draws those at rest.
+const bigNodes = [pkg("m", "m"), ...ids.map((id) => pkg(id, "m"))];
+const one = (from, to, extra) => edges.map((e) => (e.from === from && e.to === to ? { ...e, ...extra } : e));
+write("bigpolicy.html", page({ ...shop, modules: ["m"], nodes: bigNodes, edges: one("m/g00/p0", "m/g01/p0", { violation: "levels" }), sources: {}, policy: { hash: "sha256:e2e", levels: [] } }));
+write("bigchange.html", page({
+  ...change, modules: ["m"], sources: {}, hunks: {}, changed: ["m/g02/p0"],
+  nodes: bigNodes.map((n) => (n.id === "m/g02/p0" ? { ...n, status: "modified" } : n)),
+  edges: one("m/g02/p0", "m/g03/p0", { status: "added" }),
+}));
+// 11: 150 unconnected packages of rank 0 with long names, many decls and
+// unresolved calls, and one longer name still: rows must wrap to the screen,
+// no box may clip its text, and the rank is taller than the screen, so a
+// minimap shows. Over the 60-box budget, it is opened at d=2.
+const wide = [...Array.from({ length: 150 }, (_, i) => `m/pkg/controller_manager_${String(i).padStart(3, "0")}`), "m/pkg/a_package_name_longer_than_the_280_px_boxes_used_to_allow"];
+write("wide.html", page({ ...shop, modules: ["m"], sources: {}, edges: [], nodes: [pkg("m", "m"), ...wide.map((id) => ({ ...pkg(id, "m"), decls: 123456, unresolved: 99 }))] }));
 // 07: a Policy View, as export.Mark writes it. Ranks: cmd 2, cli 1, ir and
 // ir/bad 0, util unranked; one levels violation, ir/bad → cli, which no line
 // draws once m/internal is closed.
@@ -137,7 +153,7 @@ async function run(b) {
   await p.reload();
   await drawn(p);
   out.afterReload = await p.locator(".toolbar button[title^='Next declutter']").textContent();
-  await p.getByLabel("hide edges").check();
+  await p.getByLabel(/^edges/).selectOption("off");
   await settle(p);
   out.hideEdges = [(await hash(p)).includes("l=0"), await p.locator(".react-flow__edge").count(), await p.locator(".node .marks polygon").count()];
   out.notice = await p.locator("#zu-notice").count();
@@ -147,6 +163,10 @@ async function run(b) {
   await p.goto(base + "change.html");
   await drawn(p);
   await settle(p);
+  // 11: the first view keeps labels readable, so part of it may need a pan;
+  // React Flow draws only what is on screen. Zoom out to count all of it.
+  await p.locator(".react-flow__controls-fitview").click();
+  await settle(p);
   out.change = await p.locator(".react-flow__node").count();
   out.chips = await p.locator(".node.chip").allTextContents();
   const c0 = await vp(p);
@@ -161,17 +181,122 @@ async function run(b) {
   await p.close();
   // A view over the limit collapses and says so (Deviation 8).
   p = await b.newPage();
-  await p.goto(base + "big.html#d=4");
+  await p.goto(base + "big.html#d=4&l=1");
   await drawn(p);
   out.collapsed = await p.locator("#zu-notice").innerText().then((t) => t.split("Draw")[0].trim());
   out.header = await p.locator("header").innerText().then((t) => /depth \d+[^.]*/.exec(t)?.[0] ?? "");
   await p.getByRole("button", { name: "Hide edges" }).click();
   await settle(p);
   out.hidden = [await hash(p), await p.locator("#zu-notice").count()];
-  await p.goto(base + "big.html#d=4");
+  await p.goto(base + "big.html#d=4&l=1");
   await p.locator("#zu-notice").waitFor();
   await p.getByRole("button", { name: "Draw depth 4 anyway" }).click();
   out.anyway = await p.locator("#zu-notice").count();
+  // 11: 24 boxes and their dependencies, edges on auto. No line at rest, and
+  // a note says how many; hovering a box draws its own, out solid and in
+  // dashed; labels are at least 11px on screen, and the part a pan reaches is
+  // in a minimap. A reload shows the page as
+  // it opens.
+  await p.goto(base + "big.html#d=1");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  const edgeCount = () => p.locator(".react-flow__edge").count();
+  const note = await p.locator("#zu-edges").textContent().then((t) => t.trim()).catch(() => null);
+  const rest = await edgeCount();
+  const px = await p.evaluate(() => {
+    const z = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a;
+    const l = document.querySelector(".react-flow__node .label") ?? document.querySelector(".react-flow__node");
+    return parseFloat(getComputedStyle(l).fontSize) * z >= 11;
+  });
+  await p.locator(".react-flow__node[data-id='m/g00']").hover();
+  await settle(p);
+  const dirs = await p.evaluate(() => ["dep-out", "dep-in"].map((c) => document.querySelectorAll(`.react-flow__edge.${c}`).length > 0));
+  await p.mouse.move(1, 1);
+  await settle(p);
+  out.overview = [note, rest, px, ...dirs, await edgeCount(), await p.locator(".react-flow__minimap").count()];
+  // 11: the axis names the rows, and at rest 3 boxes are marked most used.
+  // 11: selecting a box draws as many lines out and in as its stats line
+  // says, in dotted (not a removed edge's 6 4 dash); Enter on a focused box
+  // selects it too.
+  const lines = async (id) => {
+    const stats = await p.locator(`.react-flow__node[data-id='${id}'] .stats`).textContent();
+    const [, uses, usedBy] = /uses (\d+) · used by (\d+)/.exec(stats);
+    const [outs, ins] = [await p.locator(".react-flow__edge.dep-out").count(), await p.locator(".react-flow__edge.dep-in").count()];
+    return [+uses === outs && +usedBy === ins, outs, ins];
+  };
+  await p.locator(".react-flow__node[data-id='m/g00']").click();
+  await settle(p);
+  const dash = await p.evaluate(() => getComputedStyle(document.querySelector(".react-flow__edge.dep-in path")).strokeDasharray.replace(/px/g, "").replace(/,\s*/g, " "));
+  out.selectLines = [...(await lines("m/g00")), dash];
+  await p.keyboard.press("Escape");
+  await settle(p);
+  await p.mouse.move(1, 1); // no hover: only the selection draws lines
+  await settle(p);
+  const none = await p.locator(".node.selected").count();
+  await p.locator(".react-flow__node[data-id='m/g00']").focus();
+  await p.keyboard.press("Enter");
+  await settle(p);
+  out.keyboard = [none, await p.locator(".react-flow__node[data-id='m/g00'] .node.selected").count(), ...(await lines("m/g00"))];
+  await p.keyboard.press("Escape");
+  await settle(p);
+  out.reading = [
+    await p.locator(".axis > span").allTextContents().then((t) => t.map((x) => x.replace(/\s+/g, " ").trim())),
+    await p.locator(".react-flow__node .node.hub").count(),
+    await p.locator(".legend .hub").textContent().catch(() => null),
+    await p.locator("#zu-against").textContent({ timeout: 5000 }).catch(() => null),
+  ];
+  await p.close();
+  // 11: the first view at 1600 × 1000: no label or stats line is clipped,
+  // every box (not container) of the top 3 rows is whole on the canvas and clear of the
+  // minimap, and the minimap's button hides it and shows it again.
+  p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
+  await p.goto(base + "wide.html#d=2");
+  await drawn(p);
+  await settle(p);
+  const firstView = () => p.evaluate(() => {
+    const clipped = [...document.querySelectorAll(".react-flow__node .label, .react-flow__node .stats")].filter((e) => e.scrollWidth > e.clientWidth).length;
+    const pane = document.querySelector(".react-flow").getBoundingClientRect();
+    const map = document.querySelector(".react-flow__minimap")?.getBoundingClientRect();
+    const boxes = [...document.querySelectorAll(".react-flow__node:not(.react-flow__node-container)")].map((e) => e.getBoundingClientRect());
+    const tops = [...new Set(boxes.map((r) => Math.round(r.top)))].sort((a, b) => a - b).slice(0, 3);
+    const top3 = boxes.filter((r) => tops.includes(Math.round(r.top)));
+    const whole = (r) => r.left >= pane.left && r.right <= pane.right && r.top >= pane.top && r.bottom <= pane.bottom;
+    const under = (r) => map && r.left < map.right && r.right > map.left && r.top < map.bottom && r.bottom > map.top;
+    return [clipped, tops.length, top3.filter((r) => !whole(r) || under(r)).length];
+  });
+  const shown = await firstView();
+  const maps = [];
+  for (let i = 0; i < 2; i++) {
+    await p.locator(".zu-map").click({ timeout: 5000 }).catch(() => {}); // no button: the counts say so
+    maps.push(await p.locator(".react-flow__minimap").count());
+  }
+  out.firstView = [...shown, ...maps];
+  await p.close();
+  // 11: in a window under 900 px the minimap starts hidden; its button shows it.
+  p = await b.newPage({ viewport: { width: 800, height: 900 } });
+  await p.goto(base + "wide.html#d=2");
+  await drawn(p);
+  await settle(p);
+  const narrow = [await p.locator(".react-flow__minimap").count()];
+  await p.locator(".zu-map").click({ timeout: 5000 }).catch(() => {});
+  narrow.push(await p.locator(".react-flow__minimap").count());
+  out.narrowMap = narrow;
+  // 11: in auto, over 40 lines, a violation and a changed import still draw at rest.
+  await p.goto(base + "bigpolicy.html#d=1");
+  await drawn(p);
+  await settle(p);
+  out.policyRest = [await p.locator(".react-flow__edge").count(), await p.locator(".react-flow__edge.pinned").count()];
+  // The full project: 25 boxes, 144 lines, one of them carrying the added import.
+  await p.goto(base + "bigchange.html");
+  await drawn(p);
+  await p.getByRole("button", { name: "Show full project" }).click({ timeout: 5000 }).catch(() => {});
+  await settle(p);
+  out.changeRest = [
+    await p.locator("header").innerText().then((t) => /\d+ boxes at depth \d+/.exec(t)?.[0] ?? ""),
+    await p.locator(".react-flow__edge").count(),
+    await p.locator(".react-flow__edge.edge-mixed, .react-flow__edge.edge-added").count(),
+  ];
   await p.close();
   // 07: the Policy View.
   p = await b.newPage();
@@ -186,15 +311,21 @@ async function run(b) {
     return { id: n.getAttribute("data-id"), x: r.x, y: r.y, rank: n.querySelector(".rank")?.textContent ?? null, red: !!n.querySelector(".hides-violation") };
   }));
   const reds = async () => (await nodes()).filter((n) => n.red).map((n) => n.id);
-  await at("#d=3");
-  out.ranks = (await nodes()).filter((n) => n.rank !== null).sort((a, b) => a.y - b.y || a.x - b.x).map((n) => `${n.id} ${n.rank}`);
+  // 11: policy.html opens at m (home), so depth N here is depth N + 1 below the root.
   await at("#d=2");
-  out.redBox = [`d=2: ${(await reds()).join(" ")}`];
+  out.ranks = (await nodes()).filter((n) => n.rank !== null).sort((a, b) => a.y - b.y || a.x - b.x).map((n) => `${n.id} ${n.rank}`);
+  await at("#d=1");
+  out.redBox = [`d=1: ${(await reds()).join(" ")}`];
+  // 11: below m the leaves sit in one container (m/internal), so 05's arrows
+  // equals full and classes only hides rows: the violation stays a red line
+  // or red triangles, not a red box. Each stage lists red boxes, then the
+  // number of red lines and of red triangles.
+  const redMarks = () => p.evaluate(() => [".react-flow__edge.pinned", "polygon.pinned"].map((q) => document.querySelectorAll(q).length).join(" "));
   for (const st of ["full", "arrows", "triangles", "elements", "classes"]) {
-    await at(`#d=3&x=${st}`);
-    out.redBox.push(`${st}: ${(await reds()).join(" ")}`);
+    await at(`#d=2&x=${st}`);
+    out.redBox.push(`${st}: ${(await reds()).join(" ")} / ${await redMarks()}`);
   }
-  await at("#d=2&s=m%2Finternal");
+  await at("#d=1&s=m%2Finternal");
   out.panel = await p.locator(".hidden-violations").innerText().then((t) => t.split("\n").slice(0, 2)).catch(() => null);
   await at("");
   await p.getByLabel(/^proposal/).selectOption("Hexagon");
@@ -232,7 +363,7 @@ async function run(b) {
     return band ? [`${n.getAttribute("data-id")} ${band} ${n.querySelector(".crap")?.textContent}`] : [];
   }).sort());
   out.crap = [];
-  for (const d of [2, 3]) {
+  for (const d of [1, 2]) {
     await p.goto(base + `crap.html#d=${d}`);
     await p.reload();
     await drawn(p);
@@ -252,7 +383,7 @@ async function run(b) {
       });
     }).then((xs) => [...(out.crapBadgeClear ?? []), ...xs]);
   }
-  // At depth 3: green, yellow, red and unmeasured are four different fills.
+  // At depth 2 below m: green, yellow, red and unmeasured are four different fills.
   out.crapFills = await p.evaluate(() => new Set(["m/cmd", "m/internal/cli", "m/internal/ir", "m/util"].map((id) =>
     getComputedStyle(document.querySelector(`.react-flow__node[data-id="${id}"] .node`)).backgroundColor)).size);
   out.crapLegend = await p.locator(".legend").innerText().then((t) => t.split("\n").filter((l) => /CRAP|≤|>/.test(l)));
@@ -319,15 +450,26 @@ const want = {
   pickCentred: true,
   picked: "store",
   far: [0, 2],
-  collapsed: "Collapsed to depth 2: depth 4 has 720 edges",
-  header: "depth 2 (collapsed from 4)",
+  // 11: the page opens at m (home); depth 1 below m is depth 2 below the root.
+  collapsed: "Collapsed to depth 1: depth 4 has 720 edges",
+  header: "depth 1 (collapsed from 4)",
   hidden: ["#d=4&l=0", 0],
   anyway: 0,
   blocked: "Layout failed: layout worker failed: blocked",
   errors: [],
   // 07
-  ranks: ["m 2", "m/cmd 2", "m/internal 1", "m/internal/cli 1", "m/internal/ir 0"],
-  redBox: ["d=2: m/internal", "full: ", "arrows: m/internal", "triangles: m/internal", "elements: m/internal", "classes: m/internal"],
+  ranks: ["m/cmd 2", "m/internal 1", "m/internal/cli 1", "m/internal/ir 0"],
+  overview: ["144 dependencies hidden; select or hover a box to see its own.", 0, true, true, true, 0, 1],
+  firstView: [0, 3, 0, 0, 1],
+  // big.html's 24 groups form a ring, each using the next 6: in any row order the
+  // arcs that wrap round run against it, 1 + 2 + … + 6 = 21 at the least.
+  reading: [["uses↓", "depends on nothing here"], 3, "thick border: the 3 most used", " 21 dependencies run against the order."],
+  selectLines: [true, 6, 6, "2 3"],
+  keyboard: [0, 1, true, 6, 6],
+  narrowMap: [0, 1],
+  policyRest: [1, 1],
+  changeRest: ["25 boxes at depth 2", 1, 1],
+  redBox: ["d=1: m/internal", "full:  / 1 0", "arrows:  / 1 0", "triangles:  / 0 2", "elements:  / 1 0", "classes:  / 1 0"],
   panel: ["Violations inside (1)", "levels m/internal/ir/bad → m/internal/cli"],
   proposal: ["#p=Hexagon", "PROPOSAL — not instantiated in code: Hexagon", "violates Proposal Hexagon's layers; a red box holds one"],
   proposalReload: "PROPOSAL — not instantiated in code: Hexagon",
@@ -338,8 +480,8 @@ const want = {
   changeNoProposal: [0, 0],
   // 08
   crap: [
-    ["m red ? high", "m/cmd green 2 low", "m/internal red ? high"],
-    ["m red ? high", "m/cmd green 2 low", "m/internal red ? high", "m/internal/cli yellow 10 mid", "m/internal/ir red ? high"],
+    ["m/cmd green 2 low", "m/internal red ? high"],
+    ["m/cmd green 2 low", "m/internal red ? high", "m/internal/cli yellow 10 mid", "m/internal/ir red ? high"],
   ],
   crapBadgeClear: [],
   crapFills: 4,
```

```diff
diff --git a/web/e2e/paint.mjs b/web/e2e/paint.mjs
--- a/web/e2e/paint.mjs
+++ b/web/e2e/paint.mjs
@@ -4,6 +4,8 @@
 // Opens each page (a hash picks the view) from file:// in Chromium, Firefox and
 // WebKit and prints the boxes drawn and the timings, in ms after navigation
 // start. Judge the budget on zu-drawn: first-contentful-paint is the header.
+// Since 11 a page with no l in its hash draws lines on demand (edges auto), so
+// 09's "default view, edges on" row is now 'k8s.html#l=1'; l=0 still means off.
 import { chromium, firefox, webkit } from "playwright-core";
 
 const pages = process.argv.slice(2);
```

- [ ] **Run:** `make build` Expected: PASS

- [ ] **Run:** `cd web/e2e && npm run accept` Expected: PASS, 47/47 in each engine

### Task 8: Gates and acceptance

**Steps:**

- [ ] **Run:** `test -z "$(gofmt -l cmd internal web/*.go)" && go vet ./... && go test ./... && golangci-lint run ./... && cd web && npm run typecheck && npx vitest run` Expected: PASS. golangci-lint exits non-zero on any issue. Run by hand through the RTK wrapper, it exits 0 whatever it finds, so read its output there.

- [ ] **Acceptance** (by hand; zu writes acceptance.md next to this file). After `make build`, export the two Test Corpus checkouts (read-only; never clone) and measure the default views in three engines with `measure.mjs`, next to this file:

  ```bash
  O=$(mktemp -d)
  bin/zu scan .zu/corpus/hugo@v0.166.0 -html "$O/hugo.html" -out "$O/hugo.json"
  bin/zu scan .zu/corpus/kubernetes@v1.37.0 -html "$O/k8s.html" -out "$O/k8s.json"
  node docx/features/11-readable-overview/measure.mjs "$O" hugo="$O/hugo.html@hugolib" k8s="$O/k8s.html@kubelet"
  ```

  Each engine must show what Prototype evidence shows: labels ≥ 11 px on screen, no label or stats line clipped, 0 lines at rest with the note, the top rows whole on screen and every other box reached by a pan (the MiniMap shows the rest), no CSP error, and a hover that draws the box's own lines.

- [ ] **The user's check:** open `hugo.html` and `k8s.html`. Can you tell what depends on what within 10 seconds?

---

## Prototype evidence

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0. `bin/zu` was built by `make build` from this plan's code, after the screenshot review, in a scratch copy. "Before" is main's page as the lead exported it; "after" is a fresh export of the same Test Corpus checkouts (hugo v0.166.0, kubernetes v1.37.0, read-only). Both were measured with `measure.mjs` at 1600 × 1000. The three engines gave the same numbers, except kubernetes' zoom (1.031 in firefox, 1.035 in chromium, 1.038 in webkit; labels 12.4–12.5 px) and hugo's boxes in view (30 in firefox, 31 in the others): header and legend text wrap differently, so the canvas height differs.

| | hugo before | hugo after | kubernetes before | kubernetes after |
|---|---|---|---|---|
| opens at | root, depth 2 | `github.com/gohugoio/hugo`, depth 1 | root, depth 1 | root, depth 1 |
| zoom | 0.22 | 0.917 (the floor) | 0.24 | 1.035 (whole) |
| smallest label on screen | 2.7 px | **11 px** | 2.8 px | **12.4 px** |
| lines at rest | 260 | **0**, "260 dependencies hidden; …" | 175 | **0**, "175 dependencies hidden; …" |
| boxes in view / total | 39 / 39, unreadable | 31 / 38 (30 in firefox), every one of them whole; the rest below, by pan; MiniMap | 39 / 39, unreadable | **39 / 39, all whole**; no MiniMap needed |
| at rest, on the box | package and decl counts | `uses 24 · used by 11 · 9 pkgs` (hugolib) | package and decl counts | `uses 2 · used by 26 · 98 pkgs` (apimachinery) |
| most used (thick border) | — | `common`, `config`, `hugofs` | — | `api`, `apimachinery`, `client-go` |
| header: against the order | — | "39 dependencies run against the order." | — | none (0, not shown) |
| rank rows | — | 17 ranks in 17 rows, the top 14 whole | — | 11 ranks in 13 rows (rank 6 wraps 6 + 2, rank 1 wraps 6 + 1, 6 px apart), all in view |
| clipped label or stats line | — | 0 | — | 0 |
| hover | — | `hugolib`: 24 lines out (solid), 11 in (dotted) | — | `kubelet`: 4 out, 2 in |
| CSP or page errors | 0 | 0 | 0 | 0 |

zu (at d120649) and cobra, after: zoom 1.2 (whole, no MiniMap), labels 14.4 px, 24 and 6 lines drawn at rest.

Before the review, kubernetes opened at the floor with its widest rows cut at both sides and a MiniMap. Its boxes were 204 px or more whatever their text, and its rows were not centred on the page (Deviation 14). Measured, its boxes are narrower (most 150–230 px with the uses/used-by line), so the whole scene fits at 1.035, under the axis and the legend strip, with wrapped rows 6 px apart.

hugo's ranks run from `hugo (package)`, `commands` and `tpl` down through `hugolib`, `markup`, `config` and `modules` to `common` and the leaves. In the 1600 × 1000 view the top 14 of its 17 rank rows show, and the MiniMap and a pan reach the last three. kubernetes runs `kubernetes` → `kube-controller-manager` → `cloud-provider`/`kube-scheduler` → … → `client-go` → `api` → `apimachinery` → the leaves, with `k8s.io/` dropped from every label.

Screenshots, in the lead's scratchpad (`/private/tmp/claude-502/-Users-xb-table-zu/a2c95fac-962e-4ff8-8288-a5c04e487b80/scratchpad/`): `hugo.png` and `k8s.png` (before, chromium), `hugo-after.png` and `k8s-after.png` (after the review, the grouping ruling and the scrutiny rulings, chromium, 1600 × 1000). `11/` holds all three engines' before, after and hover shots and the exported `hugo-after.html` and `k8s-after.html`.

## Replay record

ok   Task 1: Architecture ranks (`rank.ts`)           red   exit=1 cd web && npx vitest run src/rank.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
ok   Task 1: Architecture ranks (`rank.ts`)           green exit=0 cd web && npx vitest run src/rank.test.ts && npx tsc --noEmit  |    Duration  155ms (tests 61%, transform 30%, import 7%, worker 2%)
ok   Task 2: The layout places ranks, not edges       red   exit=1 cd web && npx vitest run src/layout.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯
ok   Task 2: The layout places ranks, not edges       green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  578ms (transform 41%, tests 35%, import 20%, worker 4%)
ok   Task 3: Siblings drop their shared prefix        red   exit=1 cd web && npx vitest run src/labels.test.ts src/scene.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯
ok   Task 3: Siblings drop their shared prefix        green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  711ms (transform 49%, tests 26%, import 21%, worker 4%)
ok   Task 4: Edges on demand: auto, on, off           red   exit=1 cd web && npx vitest run src/edges.test.ts src/state.test.ts src/scene.test.ts src/headline.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/8]⎯
ok   Task 4: Edges on demand: auto, on, off           green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  629ms (transform 46%, tests 27%, import 22%, worker 4%)
ok   Task 5: Open below single-child containers (`hom red   exit=1 cd web && npx vitest run src/cut.test.ts src/scene.test.ts src/headline.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/7]⎯
ok   Task 5: Open below single-child containers (`hom green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  629ms (transform 46%, tests 27%, import 23%, worker 4%)
ok   Task 6: A readable first view, and a minimap     red   exit=1 cd web && npx vitest run src/viewport.test.ts src/layout.test.ts src/scene.test.ts src/tree.test.ts src/rank.test.ts src/headline.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/15]⎯
ok   Task 6: A readable first view, and a minimap     green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  661ms (transform 42%, tests 29%, import 24%, worker 4%)
ok   Task 7: The browser suite                        green exit=0 make build  | [33m[MISSING_NAME_OPTION_FOR_IIFE_EXPORT] [0mIf you do not supply "output.name", you may not be able to acce
ok   Task 7: The browser suite                        green exit=0 cd web/e2e && npm run accept  | webkit: ok (47/47 checks)
ok   Task 8: Gates and acceptance                     green exit=0 test -z "$(gofmt -l cmd internal web/*.go)" && go vet ./... && go test ./... && golangci-lint run ./... && cd web && npm run typecheck && npx vitest run  |              at least ~256ms faster with isolate: false — reuses workers across files instead of one per file
exit=0

## Risks

- **A hovered line that spans ranks passes under the boxes in between.** Lines are React Flow's, routed box to box without avoiding the boxes between (see the hover screenshots). With 24 px between ranks they are easy to lose behind a column of boxes. Edge routing around boxes is out of scope.
- **Old links with `d=` open one level deeper** in a repository with one module (Deviation 3).
- **Auto no longer collapses a view for its edge count** (Deviation 7). A view of up to 2,000 nodes with thousands of hidden lines draws in full. ELK's time no longer depends on lines; the node limit still holds.
- **Tiers move when the cut changes** (Deviation 10). A box can change rank between depths.
- **The first view shows part of a large scene.** hugo shows 31 of 38 boxes (14 of 17 rank rows); kubernetes now fits whole. The MiniMap and panning reach the rest, and the Controls' fit button still shows everything at any zoom.
- **`ROW_MAX` assumes a canvas 1,221 px wide.** In a narrower window, or with the Panel open, the widest top rows lose their sides at the floor zoom; a pan reaches them. The layout does not follow the window, by design (Deviation 14).
- **The glyph table is macOS's system-ui.** On another system `system-ui` can be a wider face (Linux often gives DejaVu Sans), and a long label could then clip. It keeps its ellipsis and its full id in the `title`. The e2e `firstView` check runs wherever the suite runs, so a Linux run would show it.
- **`uses`/`used by` count drawn nodes, not packages.** At depth 1 `uses 2` can hide dozens of package imports; the Panel lists them. The counts change with the cut, like tiers (Deviation 10).
- **hugo's count looks high: 39 dependencies against the order among 38 boxes.** Its boxes are directories that hold several packages, so they form cycles that packages cannot. The count says so, without colour; the Panel lists each bundle's package pairs. Feature 12's grouping may lower it.
- **Feature 12 builds on the seams above.** If 12 needs one of them changed (for example `home` returning more than one box), that change is 12's.
- **kubernetes is not whole at 1280 × 720** (deferred). It opens at the floor zoom (0.917) with a minimap, the top rows whole and the lower rows a pan away. Measured after Deviation 17.
- **On a phone the header takes about half the screen** (deferred). At 390 × 844 the canvas starts 388 px down, below the header, toolbar and legend strip. Collapsing them below about 600 px is left for later; the minimap no longer covers the canvas there.
- **Numbering** (Status): 10's plan says "feature 11" for watch.
