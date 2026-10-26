# 21 · Externals Rail — Plan

**Status:** APPROVED 2026-10-21 (lead, after scrutiny-21, its fixes and the replay; scrutiny's re-check said ship; advisor sign-off); text REVISED 2026-10-27, when the banner fix of v0.1.1 reached `main`: `accept.mjs` has one check more, so its counts below go up by one (**Replay record**). No code block changed. Not built: Tasks 1–3 wait.

**Base.** Every diff here is against `main` at c7f9896 (v0.1.0). The diffs come from a scratch branch whose first commit is a `git archive` of c7f9896. After it come one commit per red step and one per green step. The plan was replayed on a fresh `git archive` of `main` (**Replay record**).

The diffs leave out the scene snapshot, `web/src/__snapshots__/scene04.json`. Task 1 rewrites it with `vitest -u`, which accepts whatever it writes. The replay itself compares nothing: the result was compared with the scratch branch's by hand, after the replay (`diff -rq`, **Replay record**). Of its 108 views, 36 lose their external ovals: 72 nodes in all (526 → 454), and the 72 lines to them drawn at rest (260 → 188). The same 36 gain a rail, with 72 chips in all. No other field changes.

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 20's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. From the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/21-externals-rail/replay.py docx/features/21-externals-rail/plan.md "$S"; rm -rf "$S"
```

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Task 3's `make check`);
- Playwright's three browsers (Tasks 2 and 3).

`measure.mjs`, beside this plan, measures what external modules take of a Project View's canvas (**Measurements**). It is not a replay step.

---

## Goal

A view's external modules stop taking its canvas. Each one becomes a chip on a rail, a band under the boxes, named short and counted by the files drawn here that import it. Its lines wait for a hover or a selection. This is the user's answer to the Type Map round's first question (2026-10-21): "A strip along the bottom".

**Scenario:** hugo v0.166.0's `hugolib`, at 1,400 × 900.
- **Before 21:** its 19 external modules are ovals in four rows under the boxes, each named by its whole path (`github.com/hairyhenderson/go-codeowners`). Fitted whole, the canvas is 1,182 × 498 layout px. The ovals take 23% of it and reach 202 px below the lowest box. With their lines, the view has more than `auto`'s 40, so it draws none at rest: "55 dependencies hidden".
- **After 21:** the boxes are as they were. Under them is one band, "external modules · files that import each":
  - go-radix 10, logg 9, afero 9, mapstructure 6, helpers 5, cast 5, fsnotify 4, text 2;
  - then the eleven that one file imports each, by name.

  The canvas is 710 × 454, 45% less area, and the first view zooms from 1.124 to 1.2. The boxes' 29 lines are drawn at rest, since lines to the rail no longer count toward the 40.
- **Pointing:** point at go-radix and its lines to the boxes that import it draw. Click it: the panel says "external module" and lists the packages that import it.

## Architecture

1. **The fold** (`bundle.ts`, `bundlesOver`). Before 21, a cut that touched more than 20 external modules folded all of them into one oval, "N external modules". Now each touched module is ranked by the files here that import it: the sum of its edges' `count`, ties by id. The first 20 keep their own bundles, and the rest fold into `externals`, unless only one would: 21 touched modules draw 21.
2. **The scene's rail** (`scene.ts`, `rail.ts`). External modules and `externals` leave `sc.nodes`, and the shape "oval" goes. The scene gives them as `sc.rail: RailChip[]`. Each chip carries:
   - `label`: the last element of its path, or the one before a major version (`k8s.io/klog/v2`: klog), from `chipLabels`. Two that would read the same keep their paths.
   - `files`: the files drawn here that import it, summed over every bundle the cut makes, whatever the weight filter hides (15).
   - `dim`, `selected`, and the Change View mark.
   - `holds`, on "+N more" only: the modules it holds, read from every bundle as `files` is. Its label counts them and its panel lists them, so the two agree whatever the weight filter hides.

   They are ordered most files first, then by id, with "+N more" last. The externals toggle empties the rail, and a hop limit keeps the chips within its hops, as each did with the ovals.
3. **Lines** (`scene.ts`). A line to a chip is in `sc.all`, so a hover or a selection draws it. At rest it is drawn only when edges are `on`, or when `auto` always draws it (edges.ts `always`: a violation, a changed import, an Affected import). It is never counted in `hidden`, nor in the count `quiet` compares with 40: the boxes' lines alone decide whether theirs wait. While the rail is drawn and edges are not `on`, the legend says "hover or select a box or an external module for its lines" (`App.tsx`), as it says "hover or select a box" while the boxes' lines wait.
4. **Ranks.** A chip is not a node, so it takes no rank among siblings. It took no part in the uses and used-by counts before (`connect` set ovals aside), and takes none now. An oval did take a rank, so boxes move where ovals were ranked among them (Deviation 3).
5. **Placement** (`rail.ts`, `placeRail`). It runs after ELK, from the top-level boxes as placed:
   - the band sits `RAIL_GAP` (36 px) under the lowest box, centred on the boxes' span;
   - its chips are laid in rows in the scene's order, wrapping at the span's width, or at 600 px under a narrower span, less the band's padding;
   - a chip is 24 px tall, sized by `textWidth` as a box is;
   - the band fits its caption and its widest row.

   ELK never sees the rail, so a chip that comes or goes moves no box.
6. **The canvas** (`Canvas.tsx`, `styles.css`). The canvas places nodes from the layout and the rail together, so the first view's fit, `f`, centring and the minimap include the rail.
   - The band is a node that takes no pointer (`.zu-rail`) and cannot be selected.
   - A chip is a node of type `ext`. A click or Enter selects it (`s=` in the hash), and the panel is the module's, as an oval's was. The panel of "+N more" lists the modules the chip holds (`holds`, `Panel.tsx`), not the bundles the weight filter keeps. A double-click opens nothing: `onNodeDoubleClick` reads only the scene's nodes.
   - A hovered chip draws its lines. A hovered box draws its lines to the rail even while the boxes' lines are drawn: `hovered` no longer stops at `sc.lines`.
7. **A shipped fault** (`styles.css`). 19's `.source` rule, for the Code panel's `<pre>`, also matched React Flow's source handle (`.react-flow__handle.source`). It gave the handle `position: relative`, which put it in the flow, and every node's text moved down by its height: 20 px on the tree, 24 on the Screen. A 40 px box showed its label at its foot, and its stats line, badges and facts were cut off. The rule is now `pre.source`. `accept.mjs` and `screen.mjs` gain a `spill` check: no node's text reaches past its bottom edge. `rail.mjs` has a `clipped` check: no chip's label is cut.

## Out of scope

- **The IR, its schema and the scan.** No Go code changes, so `zu scan` writes the same bytes.
- **The Screen.** An external there stays a small oval (17).
- **A setting for the rail or for its 20.** The externals checkbox (`e=0`) hides the rail as it hid the ovals.
- **The Policy's `foreign:`.** It still collapses module paths under a prefix before the View is written; the rail draws what is left.
- **Grouping chips,** by owner (`github.com/spf13/*`) or by the Policy.
- **The Type Map (22) and declared `model:` terms (23).** They are backlog lines.

## Deviations and decisions for review

1. **The 20 most imported and "+N more", not one chip past 20.** Before 21, a view that touched more than 20 external modules drew one oval for them all. The hugo and kubernetes roots did. Now they draw 20 chips and "+N more". This is kept because one oval said nothing about which modules a repository leans on: the kubernetes root now names klog (1,209 files), utils (644), ginkgo (374), gomega (309) and 16 more, then "+91 more". Both roots zoom out, for different reasons. Two variants of this plan's last commit were measured with `measure.mjs` on the same pages, in three engines:
   - **hugo's root** zooms from 1.2 to 1.11 (1.110 / 1.105 / 1.113). Its 20 chips wrap at the boxes' 610 px into four rows. One chip past 20 keeps it at 1.2, and so do 20 chips wrapping at 1,100 px.
   - **kubernetes' root** zooms from 1.07 to 0.917, the floor, and its first view pins its top and shows the minimap. It shows the rail's caption and its first two rows; the other two are below the fold. This root is bound by height: the pane leaves it about 699 px, its boxes span 668, and any band under them adds at least 94 (the gap, the caption and one row), so 699 / 762 = 0.917 whatever the rail holds. One chip past 20 gives 0.917 / 0.917 / 0.920, and the 1,100 px wrap 0.917. Even the boxes alone would fit at 1.046, not the 1.07 of before, because Deviation 3 adds 16 px to their span.
   - **The wider wrap is rejected.** It keeps hugo's root at 1.2 with all 20 names, but it stretches the rail far past narrow bodies: `cmd/kubelet/app`'s goes from 570 to 1,088 px under boxes 124 px wide, and `hugolib`'s canvas from 710 to 1,099 px wide. And 1,100 is tuned to the 1,400 px window, about (pane width − 48) / 1.2: in a narrower window, a narrow view's wider rail would pull its zoom below 1.2, which 600 does not.

   So the trade is hugo's root at 1.11 for the names of the 20 modules it leans on most. kubernetes' root is at the floor with any rail at all.
2. **The fit includes the rail,** as it included the ovals. Fitting the boxes alone would bring hugo's root back to 1.2, but not kubernetes': its boxes alone fit at 1.046, not 1.07 (Deviation 1). And on every view bound by height, the rail would start below the fold.
3. **Boxes move where ovals were ranked among them.** Before 21, an oval was one of its view's siblings, and `siblingRanks` ranked it, so it took a place in the rows. Without the ovals:
   - on `resources/images`, `cmd/kubelet/app` and `cmd/kubelet` the boxes close up (their spans are under **Measurements**);
   - on kubernetes' root, 12's seven-row cap merges different ranks. api and code-generator join apimachinery's row, and client-go keeps its row alone. The rows below move 16 px down, and the boxes' span grows from 652 to 668 px tall.
4. **Lines at rest rise where the externals had pushed the count past 40.** On `hugolib` they go from 0 to 29. Before, the ovals' lines counted toward `auto`'s 40, so none drew at rest. Now only the boxes' 29 count, and all of them draw. This fails the criterion "no more lines at rest" as written, but it is `auto`'s own rule (11), applied to the boxes' lines alone. On four other views lines at rest fell, because lines to the rail now wait: cobra's root 6 → 1, `resources/images` 21 → 6, `cmd/kubelet/app` 22 → 5, `cmd/kubelet` 24 → 7.
5. **A chip draws no triangle marks.** With edges off, a box marks where its lines would be (11). A chip does not, and the box that imports it marks its end.
6. **"+N more" counts per module.** Its number sums its modules' files, as each chip counts its own module's, so a file that imports two of them counts twice.
7. **A narrow body gets a wider rail.** Under boxes narrower than 600 px, the chips wrap at 600. `cmd/kubelet/app`'s boxes span 124 px and its rail 570. Wrapping at the boxes' width would stack its chips in a column. At its zoom of 1.2 the rail reads as a footer. A wider wrap, 1,100 px, was measured and rejected (Deviation 1).
8. **A shipped fault is fixed here (19, in v0.1.0)** (**Architecture 7**). The chips showed it: a chip's label sat under the handle, cut short. The fix is one selector, and it could land on its own, ahead of 21, as a v0.1.1.
9. **Two acceptance scripts change.**
   - `accept.mjs` counts the boxes (8), not every node: the rail is below the fold at its size.
   - Its Change View draws 20 nodes, not 19: the externals' two chips and the band, where two ovals were.
   - It and `screen.mjs` gain `spill`.

## Measurements

Pass criteria, set before the runs (2026-10-21), on seven views of three Test Corpus clones: cobra v1.10.2's root; hugo v0.166.0's root, `hugolib` and `resources/images`; kubernetes v1.37.0's root, `cmd/kubelet/app` and `cmd/kubelet`. Each view is measured at 1,400 × 900 with this plan's last commit and with its base:
- on the five views whose externals took 10% or more of the canvas before 21 (cobra's root, `hugolib`, `resources/images`, `cmd/kubelet/app`, `cmd/kubelet`), the canvas, fitted whole, is smaller in area, and the externals take a smaller share of it (`ext`: before, the ovals' own area; after, the rail's whole band);
- on every view, in every engine, the first view's zoom is not lower than before: the rail never shrinks the boxes;
- on every view, in every engine, the first view draws no more lines at rest than before;
- on every view, in every engine, the layout takes at most 30 ms more than before;
- every engine reports no page errors.

**The runs.** `measure.mjs` ran twice on 2026-10-21, and twice more that day after scrutiny's fixes (the legend's cue, and "+N more" listing what it counts), on after-pages rebuilt from a tree identical to this plan's last commit. Pages were written by `zu scan -html`, built from this plan's base and from that tree, in copies of the clones made with `cp -cR` out of `.zu/corpus/` (the corpus was only read). The machine was an Apple M2 (8 cores), at a load average of 3.3 to 6.0. All four runs gave the same geometry, zoom and lines; the layout times below are the fourth run's.

| View | Canvas, fitted whole (layout px) | Boxes' span | Externals' share (`ext`) | First view's zoom | Lines at rest | Layout, ms (Chromium / Firefox / WebKit) |
|---|---|---|---|---|---|---|
| cobra, root | 863 × 168 → 359 × 198 | 124 × 104, both | 21.8% → 29.3% | 1.2 → 1.2 | 6 → 1 | 83 / 132 / 131 → 68 / 123 / 106 |
| hugo, root | 606 × 440 → 610 × 630 | 606 × 440 → 610 × 440 | 2.1% → 24.3% | 1.2 → 1.110 / 1.105 / 1.113 | 0 → 0 | 83 / 150 / 122 → 83 / 152 / 127 |
| hugo, `hugolib` | 1,182 × 498 → 710 × 454 | 710 × 296, both | 23.1% → 26.3% | 1.124 → 1.2 | 0 → 29 | 98 / 176 / 130 → 77 / 163 / 113 |
| hugo, `resources/images` | 1,231 × 278 → 587 × 358 | 712 × 278 → 193 × 232 | 23.8% → 25.1% | 1.080 → 1.2 | 21 → 6 | 87 / 155 / 120 → 138 / 137 / 108 |
| kubernetes, root | 631 × 652 → 631 × 858 | 631 × 652 → 631 × 668 | 1.4% → 16.9% | 1.072 / 1.067 / 1.075 → 0.917 | 0 → 0 | 91 / 154 / 126 → 87 / 138 / 124 |
| kubernetes, `cmd/kubelet/app` | 1,213 × 260 → 570 × 326 | 367 × 260 → 124 × 168 | 34.5% → 37.4% | 1.096 → 1.2 | 22 → 5 | 82 / 143 / 119 → 76 / 118 / 100 |
| kubernetes, `cmd/kubelet` | 1,213 × 392 → 570 × 458 | 379 × 392 → 148 × 300 | 22.9% → 26.6% | 1.096 → 1.2 | 24 → 7 | 91 / 153 / 125 → 80 / 126 / 115 |

A zoom given once is the same in every engine. The geometry is Chromium's.

**Each criterion:**
- **The canvas is smaller on the five views: passes.** Its area falls by 51% on cobra's root, 45% on `hugolib`, 39% on `resources/images`, 41% on `cmd/kubelet/app` and 45% on `cmd/kubelet`. On three of them the boxes' own span shrinks too: ovals ranked among them had spread their rows.
- **The externals' share is smaller on the five views: fails on all five.** The canvas shrank more than the externals did. Their own area fell by 34% to 38%, but the share went up. The criterion compared unlike measures: a band is measured whole, caption and padding included, where an oval was measured alone, so it could fail however small the rail became. It is reported as it was set; the area and the zoom are what the five views gained.
- **The first view's zoom is not lower: fails on hugo's and kubernetes' roots** (Deviation 1). Before 21 each drew one oval; now each draws 20 chips and "+N more". hugo's root loses its zoom to the 20 chips: one chip past 20 would keep it at 1.2. kubernetes' root would lose it to any rail: it is bound by height, and one row of chips takes it to the floor. On four of the five views the criterion was set for, the zoom rose to 1.2, the maximum. On cobra's root it stayed at 1.2.
- **No more lines at rest: fails on `hugolib`, 0 → 29** (Deviation 4). Lines at rest fell on four views and stayed at 0 on the two roots.
- **Layout within 30 ms of before: passes, but for one reading that reruns put down to noise.** In the fourth run, `resources/images` took 51 ms more in Chromium (87 → 138). In the third it took the same time, and in three reruns of that view alone, 16, 8 and 3 ms less; the fixes add no layout work, and the load average was near 6. Leaving that reading aside, the worst was 5 ms more (hugo's root, WebKit) in the fourth run and 11 ms more (kubernetes' root, Chromium) in the third. Before the fixes, the worst was 24 ms more (kubernetes' root, Firefox, first run).
- **No page errors: passes,** in every engine.

**The chips drawn** after the fit, in Chromium. No label was cut on any of the seven views.
- cobra's root: pflag 7, go-md2man 1, mousetrap 1, yaml 1.
- `hugolib`: the 19 in the scenario (**Goal**).
- hugo's root: cast 70, goldmark 69, afero 65, mapstructure 47, logg 31, … go-toml 6, then "+59 more" (117 files).
- kubernetes' root: klog 1,209, utils 644, ginkgo 374, gomega 309, … client_golang 25, then "+91 more" (518 files).

## Doc amendments (exact text; not task steps)

**`docx/core/decisions.md`, line 41 (UI v1).**
- Replace "Externals drawn as ovals." with "Externals drawn as chips on the Rail, under the boxes (21)."
- Replace "ranks, ovals and counts read every bundle" with "ranks, the Rail and counts read every bundle".
- Append to the end of the line, after 20's **Diff Code (20)** text:

> **Externals Rail (21):** a view's external modules are chips on the Rail, a band 36 px under its lowest box, centred on the boxes and captioned "external modules · files that import each". A chip names its module by the last element of its path, or the one before a major version (`k8s.io/klog/v2`: klog), and by the whole path when two would read the same. Beside the name is the number of files drawn here that import it. The 20 imported by the most files have chips of their own, most first, ties by id; the rest share one "+N more" chip, last, unless only one would. The chips wrap at the boxes' width, or at 600 px under narrower boxes. ELK never sees the Rail, so no chip takes a rank or moves a box, and the uses and used-by counts leave external modules out as before. The first view and `f` fit the Rail with the boxes. A line to the Rail waits for a hover or a selection unless edges are `on`, or it is a violation, a changed import or an Affected import, which `auto` always draws. It never counts toward `auto`'s 40, and while it waits the legend says to hover or select a box or an external module. A click or Enter selects a chip, and its panel is the module's; for "+N more", every module it holds, whatever the weight filter hides. A double-click opens nothing. On a Screen an external is still a small oval (17).

**`docx/glossary.md`, Foreign.** Replace the entry's text with:

> An external module, drawn outside the Package Tree as a chip on the Rail (21), and on a Screen as an oval (17). The Policy can collapse several module paths under one prefix, or omit them.

**`docx/glossary.md`, a new entry after Foreign:**

> ## Rail
>
> The band under a view's boxes that holds its Foreign modules as Rail chips, each with the number of files drawn here that import it (21): the 20 imported by the most files, then one "+N more" Rail chip for the rest. ELK never places it, so it moves no box. It is not the Strip, which holds Demoted boxes in the bottom row.

**`docx/core/requirements-draft.md`:** no new row. The Rail changes how a view draws external modules, which no row specifies beyond U14's Screen, and the Screen is unchanged.

## Tasks

### Task 1: The scene puts external modules on a rail (`bundle.ts`, `scene.ts`, `rail.ts`, `search.ts`)

The tests:
- `rail.test.ts` (new) labels, sizes and places chips: the band under the boxes at the top of the layout, centred, its chips in rows inside it, wrapping at the body's width or at 600 px.
- `bundle.test.ts` folds the externals past the 20 imported by the most files, ties by id, and never folds one alone.
- `scene.test.ts` draws externals on the rail, not among the nodes, with the files that import each. It also checks:
  - "+N more" for those past 20, selected as `externals`;
  - "+N more" holds the modules it counts, for its panel, when min pairs 2 hides one of its bundles;
  - no rail line at rest unless edges are `on`, and a selection's own;
  - a selected chip lights the boxes that import it;
  - a Change View marks a changed chip and draws its changed import at rest;
  - a hop limit keeps the chips within its hops, and the externals toggle empties the rail.
- `keep.test.ts`, `search.test.ts` and `tree.test.ts` read the rail where they read ovals. `search` reveals a folded external as "+N more".
- `scene.snapshot.test.ts` adds each view's rail to what it compares.

**Files:**
- Test: `web/src/rail.test.ts` (new), `web/src/bundle.test.ts`, `web/src/scene.test.ts`, `web/src/keep.test.ts`, `web/src/search.test.ts`, `web/src/tree.test.ts`, `web/src/scene.snapshot.test.ts`, `web/src/cut.test.ts` (a test's title, in the green step)
- Code: `web/src/rail.ts` (new), `web/src/bundle.ts`, `web/src/scene.ts`, `web/src/search.ts`, `web/src/group.ts` (a comment)
- Snapshot: `web/src/__snapshots__/scene04.json` (rewritten by `-u`)

**Steps:**

- [ ] **Write the failing tests**

`web/src/bundle.test.ts`:

```diff
diff --git a/web/src/bundle.test.ts b/web/src/bundle.test.ts
index 3c0c2fe..969f92f 100644
--- a/web/src/bundle.test.ts
+++ b/web/src/bundle.test.ts
@@ -13,6 +13,20 @@ describe("bundlesOver", () => {
     expect(short(bundlesOver(v, c))).toEqual([["m/a", "m/b", 1, 1], ["m/a", "x.io/e", 1, 1]]);
     expect(bundlesOver(v, c, { externals: false }).map((b) => b.to)).toEqual(["m/b"]);
   });
+  it("folds the externals past the 20 imported by the most files into one, ties by id; never one alone (21)", () => {
+    const xs = Array.from({ length: 23 }, (_, i) => `x.io/e${String(i).padStart(2, "0")}`);
+    // e22 is imported by three files, the others by one each.
+    const v = view([...pkgs(["m/a", "m/b"], "m"), ...exts(xs)],
+      [...xs.map((x) => edge("m/a", x)), { ...edge("m/b", "x.io/e22"), count: 2 }]);
+    const bs = bundlesOver(v, cut(v, "", 2));
+    expect(short(bs.filter((b) => b.to === "externals"))).toEqual([["m/a", "externals", 3, 3]]);
+    expect(bs.filter((b) => b.to.startsWith("x.io/")).map((b) => b.to))
+      .toEqual([...xs.slice(0, 19), "x.io/e22", "x.io/e22"]);
+    expect(externalsOf(v, bs)).toEqual(xs);
+    // 21 externals: folding one would save nothing.
+    const w = view([...pkgs(["m/a"], "m"), ...exts(xs.slice(0, 21))], xs.slice(0, 21).map((x) => edge("m/a", x)));
+    expect(bundlesOver(w, cut(w, "", 2)).map((b) => b.to)).toEqual(xs.slice(0, 21));
+  });
   it("never draws an edge with no end inside the focus (outside→external)", () => {
     const v = view([...pkgs(["m/a"], "m"), ...pkgs(["n/b"], "n"), ...exts(["x.io/e"])],
       [edge("n/b", "x.io/e"), edge("n/b", "m/a")]);
```

`web/src/keep.test.ts`:

```diff
diff --git a/web/src/keep.test.ts b/web/src/keep.test.ts
index 079fafa..e8bc815 100644
--- a/web/src/keep.test.ts
+++ b/web/src/keep.test.ts
@@ -57,7 +57,7 @@ describe("a view keeps what it drew as it opened (15)", () => {
     // m/k02 uses github.com/x/y over two packages, one pair each once it opens.
     const v = town();
     const sc = at(v, { depth: 1, minPairs: 2, toggled: ["m/k02"] });
-    expect(node(sc, "github.com/x/y")).toBeDefined();
+    expect(sc.rail.map((c) => c.id)).toEqual(["github.com/x/y"]); // 21: on the rail
     expect(sc.edges.some((e) => e.to === "github.com/x/y")).toBe(false);
   });
   it("counts what an opened box holds as if every other opened box were closed", () => {
```

`web/src/rail.test.ts` (new):

```diff
diff --git a/web/src/rail.test.ts b/web/src/rail.test.ts
new file mode 100644
index 0000000..1a4699a
--- /dev/null
+++ b/web/src/rail.test.ts
@@ -0,0 +1,49 @@
+import { describe, expect, it } from "vitest";
+import { chipLabels, chipSize, placeRail, RAIL, RAIL_GAP, type RailChip } from "./rail";
+
+const chip = (id: string, label = id): RailChip => ({ id, label, files: 1, dim: false, selected: false });
+
+describe("rail", () => {
+  it("labels a chip by its module's last element, past a major version, unless two would read the same (21)", () => {
+    expect(chipLabels(["github.com/spf13/pflag", "k8s.io/klog/v2", "gopkg.in/yaml.v3", "x.io"]))
+      .toEqual(["pflag", "klog", "yaml.v3", "x.io"]);
+    expect(chipLabels(["github.com/a/errors", "github.com/b/errors", "k8s.io/utils"]))
+      .toEqual(["github.com/a/errors", "github.com/b/errors", "utils"]);
+    expect(chipLabels(["k8s.io/klog", "k8s.io/klog/v2"])).toEqual(["k8s.io/klog", "k8s.io/klog/v2"]);
+  });
+  it("sizes a chip to its label and its count of files", () => {
+    const [a, b] = [3, 300].map((files) => chipSize({ ...chip("x.io/pflag", "pflag"), files }));
+    expect(a.h).toBe(24);
+    expect(b.w).toBeGreaterThan(a.w);
+  });
+  it("places the band under the project's boxes, centred, its chips in a row inside it (21)", () => {
+    const body = new Map([
+      ["m/a", { x: 0, y: 0, w: 100, h: 40 }],
+      ["m/b", { x: 300, y: 100, w: 200, h: 40 }],
+      ["m/b/c", { x: 10, y: 400, w: 50, h: 40, parent: "m/b" }], // placed inside m/b: not the body's bottom
+    ]);
+    const at = placeRail([chip("x.io/a"), chip("x.io/b"), chip("externals", "+2 more")], body);
+    expect([...at.keys()]).toEqual([RAIL, "x.io/a", "x.io/b", "externals"]);
+    const band = at.get(RAIL)!;
+    expect([band.y, band.x + band.w / 2]).toEqual([140 + RAIL_GAP, 250]);
+    const chips = ["x.io/a", "x.io/b", "externals"].map((id) => at.get(id)!);
+    expect(new Set(chips.map((c) => c.y)).size).toBe(1);
+    expect(chips[0].x < chips[1].x && chips[1].x < chips[2].x).toBe(true);
+    for (const c of chips) {
+      expect(c.x >= band.x && c.x + c.w <= band.x + band.w && c.y > band.y && c.y + c.h <= band.y + band.h).toBe(true);
+    }
+  });
+  it("wraps the chips at the body's width, or at 600 px under a narrower body (21)", () => {
+    const many = Array.from({ length: 30 }, (_, i) => chip(`x.io/module-number-${i}`, `module-number-${i}`));
+    const narrow = placeRail(many, new Map([["m/a", { x: 0, y: 0, w: 100, h: 40 }]])).get(RAIL)!;
+    const wide = placeRail(many, new Map([["m/a", { x: 0, y: 0, w: 1200, h: 40 }]])).get(RAIL)!;
+    expect(narrow.w).toBeLessThanOrEqual(600);
+    expect(wide.w > 600 && wide.w <= 1200).toBe(true);
+    expect(narrow.h).toBeGreaterThan(wide.h);
+  });
+  it("places nothing without chips, and the band at the origin without boxes (21)", () => {
+    expect(placeRail([], new Map([["m/a", { x: 0, y: 0, w: 100, h: 40 }]])).size).toBe(0);
+    const band = placeRail([chip("x.io/a")], new Map()).get(RAIL)!;
+    expect([band.x, band.y]).toEqual([0, 0]);
+  });
+});
```

`web/src/scene.snapshot.test.ts`:

```diff
diff --git a/web/src/scene.snapshot.test.ts b/web/src/scene.snapshot.test.ts
index 4f45a3e..def74d4 100644
--- a/web/src/scene.snapshot.test.ts
+++ b/web/src/scene.snapshot.test.ts
@@ -2,6 +2,8 @@
 // View whole and as its changed subgraph) at the auto depth and depths 1–3.
 // The snapshot was written by 04's own layout.ts scene before feature 05
 // replaced it; the new scene() at default settings must reproduce it exactly.
+// 21 rewrote it once: external modules left the nodes for the rail, and
+// their lines are no longer drawn at rest.
 import { expect, it } from "vitest";
 import project from "../../internal/export/testdata/shop.view.golden.json";
 import change from "../../internal/export/testdata/shop.change.golden.json";
@@ -30,6 +32,7 @@ const drawn = (v: View, focus: string, depth: number | null) => {
       rows: n.methods, mark: n.change ?? "", rowMarks: n.rowMarks ?? [],
     })),
     edges: s.edges.map((e) => ({ from: e.from, to: e.to, pairs: e.pairs, status: e.status ?? "" })),
+    rail: s.rail.map((c) => ({ id: c.id, label: c.label, files: c.files, mark: c.change ?? "" })),
   };
 };
 
```

`web/src/scene.test.ts`:

```diff
diff --git a/web/src/scene.test.ts b/web/src/scene.test.ts
index 86258c9..8469951 100644
--- a/web/src/scene.test.ts
+++ b/web/src/scene.test.ts
@@ -88,19 +88,19 @@ describe("scene", () => {
       ["m/api", "api", "box", ""],
       ["m/core", "core", "box", "expand"],
       ["m/lone", "lone", "box", ""],
-      ["x.io/e", "x.io/e", "oval", ""],
     ]);
-    expect(sc.edges.map((e) => [e.id, e.pairs]))
+    expect(sc.all.map((e) => [e.id, e.pairs]))
       .toEqual([["m#pkg→m/api", 1], ["m/api→m/core", 2], ["m/api→x.io/e", 1]]);
   });
-  it("drops the path prefix drawn siblings share, never from externals, the outside or a lone box (11)", () => {
+  it("drops the path prefix drawn siblings share, never from the outside or a lone box (11)", () => {
     const k = view([...pkgs(["k8s.io/api"], "k8s.io/api"), ...pkgs(["k8s.io/kubelet/cm"], "k8s.io/kubelet"),
       ...pkgs(["k8s.io/kubernetes/pkg/a", "k8s.io/kubernetes/pkg/b"], "k8s.io/kubernetes"), ...exts(["k8s.io/klog"])],
       [edge("k8s.io/api", "k8s.io/klog")]);
     const top = scene(k, DEFAULT_STATE);
     expect(top.nodes.filter((n) => n.parent === "").map((n) => [n.id, n.label])).toEqual([
-      ["k8s.io/api", "api"], ["k8s.io/klog", "k8s.io/klog"], ["k8s.io/kubelet", "kubelet"], ["k8s.io/kubernetes", "kubernetes"],
+      ["k8s.io/api", "api"], ["k8s.io/kubelet", "kubelet"], ["k8s.io/kubernetes", "kubernetes"],
     ]);
+    expect(top.rail.map((c) => [c.id, c.label])).toEqual([["k8s.io/klog", "klog"]]); // 21
     const one = scene(view(pkgs(["x.io/m/a", "x.io/m/b"], "x.io/m")), DEFAULT_STATE);
     expect(one.nodes.map((n) => n.label)).toEqual(["x.io/m", "a", "b"]);
   });
@@ -114,10 +114,11 @@ describe("scene", () => {
   it("draws the externals at home, and a deep link or a search pick as before (11)", () => {
     const h = view([...pkgs(["h", "h/a", "h/a/x", "h/b"], "h"), ...exts(["x.io/e"])], [edge("h/a/x", "x.io/e"), edge("h/b", "h/a/x")]);
     const root = scene(h, DEFAULT_STATE, { home: true });
-    expect([root.focus, root.nodes.filter((n) => n.shape === "oval").map((n) => n.id)]).toEqual(["h", ["x.io/e"]]);
+    expect([root.focus, root.rail.map((c) => c.id)]).toEqual(["h", ["x.io/e"]]);
     for (const s of [{ focus: "h/a" }, { focus: "h/a", depth: 2 }, { selected: "h/a/x" }, { focus: "h/a", selected: "h/a/x" }]) {
       const deep = { ...DEFAULT_STATE, ...s };
-      expect(scene(h, deep, { home: true }).nodes).toEqual(scene(h, { ...deep, focus: deep.focus || "h" }).nodes);
+      const [a, b] = [scene(h, deep, { home: true }), scene(h, { ...deep, focus: deep.focus || "h" })];
+      expect([a.nodes, a.rail]).toEqual([b.nodes, b.rail]);
     }
     expect(scene(h, { ...DEFAULT_STATE, selected: "h/a/x" }, { home: true }).nodes.find((n) => n.selected)?.id).toBe("h/a/x");
   });
@@ -147,21 +148,25 @@ describe("scene", () => {
   });
   it("focus N hops keeps only nearby nodes", () => {
     expect(ids(at({ depth: 2, selected: "m/core", hops: 1 }).nodes)).toEqual(["m", "m/api", "m/core"]);
+    // 21: so does the rail. x.io/e is two hops from m/core, one from m/api.
+    expect(at({ depth: 2, selected: "m/core", hops: 1 }).rail).toEqual([]);
+    expect(ids(at({ depth: 2, selected: "m/api", hops: 1 }).rail)).toEqual(["x.io/e"]);
   });
   it("declutter: arrows join containers, triangles mark boxes, classes fold leaves (uml-viewer)", () => {
-    expect(ids(at({ depth: 3, stage: "arrows" }).edges)).toEqual(["m→m/core", "m→x.io/e"]);
+    expect(ids(at({ depth: 3, stage: "arrows" }).all)).toEqual(["m→m/core", "m→x.io/e"]);
     const tri = at({ depth: 3, stage: "triangles" });
     expect([tri.lines, tri.edges.length]).toEqual([false, 0]);
     expect(tri.nodes.find((n) => n.id === "m/core")?.mark).toMatchObject({ in: true, out: false });
     expect(at({ depth: 3, stage: "classes" }).nodes.map((n) => [n.id, n.shape]))
-      .toEqual([["m", "container"], ["m/core", "box"], ["x.io/e", "oval"]]);
+      .toEqual([["m", "container"], ["m/core", "box"]]);
     const sel = at({ depth: 3, stage: "triangles", selected: "m/api" });
     expect(sel.edges.map((e) => [e.id, e.hot])).toEqual([["m→m/core", true], ["m→x.io/e", true]]);
   });
   it("hide edges keeps the stage and draws marks; pinned bundles mark red", () => {
     const sc = scene(v, { ...DEFAULT_STATE, depth: 2, edges: "off" }, { pin: (b) => b.to === "x.io/e" });
     expect([sc.stage, sc.lines, sc.edges.length]).toEqual(["full", false, 0]);
-    expect(sc.nodes.find((n) => n.id === "x.io/e")?.mark).toEqual({ in: true, out: false, inPinned: true, outPinned: false });
+    // 21: a chip draws no marks; the box that imports it does.
+    expect(sc.nodes.find((n) => n.id === "m/api")?.mark).toEqual({ in: true, out: true, inPinned: false, outPinned: true });
   });
   it("auto draws every line up to the limit, then only what must show, and a selection's own (11)", () => {
     // 12 packages, each importing every later one: 66 lines.
@@ -205,8 +210,59 @@ describe("scene", () => {
   it("a package without detail draws nothing, and says so", () => {
     expect(scene(g, { ...DEFAULT_STATE, focus: "example.com/shop#pkg" })).toMatchObject({ noDetail: true, nodes: [], edges: [] });
   });
-  it("externals toggle removes ovals and their edges", () => {
-    expect(ids(at({ depth: 2, externals: false }).nodes)).not.toContain("x.io/e");
+  it("externals toggle removes the rail and its lines", () => {
+    const sc = at({ depth: 2, externals: false });
+    expect([sc.rail, ids(sc.all).filter((e) => e.includes("x.io"))]).toEqual([[], []]);
+  });
+  it("draws the externals on the rail, not among the boxes, with the files that import each (21)", () => {
+    const sc = at({ depth: 2 });
+    expect(ids(sc.nodes)).not.toContain("x.io/e");
+    expect(sc.rail).toEqual([{ id: "x.io/e", label: "e", files: 1, dim: false, selected: false }]);
+    // Most files first, then by id.
+    const w = view([...pkgs(["m/a", "m/b"], "m"), ...exts(["x.io/e", "x.io/f"])],
+      [{ ...edge("m/a", "x.io/e"), count: 3 }, edge("m/b", "x.io/e"), { ...edge("m/b", "x.io/f"), count: 5 }]);
+    expect(scene(w, DEFAULT_STATE).rail.map((c) => [c.id, c.files])).toEqual([["x.io/f", 5], ["x.io/e", 4]]);
+  });
+  it("folds the externals past the 20 most used into a +N more chip, selected as the externals (21)", () => {
+    const xs = Array.from({ length: 23 }, (_, i) => `x.io/e${String(i).padStart(2, "0")}`);
+    const w = view([...pkgs(["m/a"], "m"), ...exts(xs)], xs.map((x) => edge("m/a", x)));
+    const sc = scene(w, DEFAULT_STATE);
+    expect(sc.rail.map((c) => c.label)).toEqual([...xs.slice(0, 20).map((x) => x.slice(5)), "+3 more"]);
+    expect(sc.rail.at(-1)).toMatchObject({ id: "externals", files: 3 });
+    expect(scene(w, { ...DEFAULT_STATE, selected: "externals" }).rail.at(-1)?.selected).toBe(true);
+  });
+  it("+N more holds the modules it counts, for its panel, whatever the weight filter hides (21, A6)", () => {
+    // m/a's one import past the 20 is a single pair, which min pairs 2 hides.
+    const xs = Array.from({ length: 23 }, (_, i) => `x.io/e${String(i).padStart(2, "0")}`);
+    const w = view([...pkgs(["m/a", "m/b"], "m"), ...exts(xs)],
+      [...xs.slice(0, 20).map((x) => ({ ...edge("m/a", x), count: 5 })), edge("m/a", xs[20]), edge("m/b", xs[21]), edge("m/b", xs[22])]);
+    const more = scene(w, { ...DEFAULT_STATE, minPairs: 2 }).rail.at(-1)!;
+    expect([more.label, more.holds?.map((r) => r.id)]).toEqual(["+3 more", xs.slice(20)]);
+  });
+  it("draws no rail line at rest unless every line is on; a selection draws its own (21)", () => {
+    const rest = at({ depth: 2 });
+    expect(ids(rest.edges)).toEqual(["m#pkg→m/api", "m/api→m/core"]);
+    expect([rest.lines, rest.hidden]).toEqual([true, 0]); // the boxes' lines are all drawn
+    expect(ids(at({ depth: 2, edges: "on" }).edges)).toContain("m/api→x.io/e");
+    const sel = at({ depth: 2, selected: "m/api" });
+    expect(sel.edges.find((e) => e.id === "m/api→x.io/e")).toMatchObject({ hot: true, dir: "out" });
+    expect([sel.rail[0].dim, at({ depth: 2, selected: "m/lone" }).rail[0].dim]).toEqual([false, true]);
+  });
+  it("selects a chip: its lines, and the boxes that import it, light (21)", () => {
+    const sc = at({ depth: 2, selected: "x.io/e" });
+    expect([sc.selected, sc.rail[0].selected, sc.rail[0].dim]).toEqual(["x.io/e", true, false]);
+    expect(sc.edges.filter((e) => e.hot).map((e) => [e.id, e.dir])).toEqual([["m/api→x.io/e", "in"]]);
+    expect(sc.nodes.filter((n) => !n.dim && n.shape !== "container").map((n) => n.id)).toEqual(["m/api"]);
+  });
+  it("Change View: an import of an external the change added draws at rest, and its chip is marked (21)", () => {
+    const ch = {
+      ...v, kind: "change" as const,
+      nodes: v.nodes.map((n) => (n.id === "x.io/e" ? { ...n, status: "added" } : n)),
+      edges: v.edges.map((e) => (e.to === "x.io/e" ? { ...e, status: "added" } : e)),
+    };
+    const sc = scene(ch, { ...DEFAULT_STATE, depth: 2 });
+    expect(sc.edges.find((e) => e.to === "x.io/e")?.status).toBe("added");
+    expect(sc.rail[0].change).toBe("st-added");
   });
   it("knows which ids a hash may name", () => {
     const k = knownIds(v);
@@ -235,8 +291,8 @@ describe("scene", () => {
     expect(fitDepth({ ...k8s(4), lines: false }, k8s)).toBe(4);
     const huge = sized([600, 900]);
     expect(fitDepth(huge(2), huge)).toBeNull();
-    const tight = { nodes: 2000, edges: 2 };
-    expect([1, 2].map((d) => at({ depth: d }).edges.length)).toEqual([1, 3]);
+    const tight = { nodes: 2000, edges: 1 };
+    expect([1, 2].map((d) => at({ depth: d }).edges.length)).toEqual([0, 2]); // 21: no line to the rail at rest
     expect(fitDepth(at({ depth: 2 }), (d) => at({ depth: d }), tight)).toBe(1);
   });
   it("is independent of input order", () => {
@@ -250,9 +306,9 @@ describe("scene", () => {
       ["shop", "container"], ["shop (package)", "box"], ["internal", "container"],
       ["checkout", "box"], ["money", "box"], ["store", "box"],
       ["shop/tools", "container"], ["gen", "box"],
-      ["github.com/lib/pq", "oval"], ["golang.org/x/sync", "oval"],
     ]);
-    expect(top.edges).toHaveLength(7);
+    expect(top.rail.map((c) => [c.label, c.files])).toEqual([["pq", 1], ["sync", 1]]);
+    expect([top.all.length, top.edges.length]).toEqual([7, 5]); // 21: no line to the rail at rest
     const sc = scene(g, { ...DEFAULT_STATE, focus: store });
     expect(sc.nodes.find((n) => n.label === "Repo")?.methods).toEqual(["Get", "Reset", "check"]);
   });
```

`web/src/search.test.ts`:

```diff
diff --git a/web/src/search.test.ts b/web/src/search.test.ts
index 15291e2..98fdd80 100644
--- a/web/src/search.test.ts
+++ b/web/src/search.test.ts
@@ -7,8 +7,8 @@ import { decl, edge, exts, pkgs, view } from "./testkit";
 const v = view([
   ...pkgs(["m/store", "m/store/sql"], "m", { detail: true }), ...pkgs(["m/restore"], "m"),
   decl("m/store.Repo", "m/store"), decl("m/store.Repo.Get", "m/store.Repo", "function"),
-  ...exts(Array.from({ length: 21 }, (_, i) => `x.io/e${i}`)),
-], Array.from({ length: 21 }, (_, i) => edge("m/restore", `x.io/e${i}`)));
+  ...exts(Array.from({ length: 22 }, (_, i) => `x.io/e${i}`)),
+], Array.from({ length: 22 }, (_, i) => edge("m/restore", `x.io/e${i}`)));
 
 describe("search", () => {
   it("ranks exact names, then prefixes, then substrings", () => {
@@ -28,12 +28,14 @@ describe("search", () => {
     expect(search(w, "ns")).toEqual([]); // the words are consecutive: New, Spawner skips Wave
   });
   it("reveal draws and selects the target, a method as a row of its type", () => {
-    for (const id of ["m/store/sql", "m/store.Repo", "m/store.Repo.Get", "x.io/e3"]) {
+    for (const id of ["m/store/sql", "m/store.Repo", "m/store.Repo.Get", "x.io/e3", "x.io/e9"]) {
       expect(scene(v, reveal(v, id)).selected, id).not.toBeNull();
     }
     expect(reveal(v, "m/store.Repo.Get")).toMatchObject({ focus: "m/store#pkg", selected: "m/store.Repo.Get" });
     expect(scene(v, reveal(v, "m/store.Repo.Get")).selectedRow).toBe("m/store.Repo.Get");
-    expect(reveal(v, "x.io/e3").selected).toBe("externals");
+    // 21: an external on the rail is selected as itself; one folded past the
+    // 20 (ties by id: x.io/e8 and x.io/e9) as the "+2 more" chip.
+    expect([reveal(v, "x.io/e3").selected, reveal(v, "x.io/e9").selected]).toEqual(["x.io/e3", "externals"]);
   });
   it("reveal keeps the stage and hide-edges, and resets what could hide the target", () => {
     const from = { ...DEFAULT_STATE, stage: "arrows" as const, edges: "off" as const, minPairs: 3, externals: false, hops: 2, toggled: ["m"] };
```

`web/src/tree.test.ts`:

```diff
diff --git a/web/src/tree.test.ts b/web/src/tree.test.ts
index 05ab417..3c8286e 100644
--- a/web/src/tree.test.ts
+++ b/web/src/tree.test.ts
@@ -49,16 +49,18 @@ describe("Package Tree", () => {
   });
   it("bundles imports to leaves, counts package pairs, maps outside and externals", () => {
     const nodes: View["nodes"] = [...pkgs(["m/a/x", "m/a/y", "m/b/z"], "m"), ...pkgs(["n/q"], "n"),
-      ...Array.from({ length: 21 }, (_, i) => ({ id: `ext${i}`, kind: "external" as const, loc: { path: "go.mod", line: 1 } }))];
+      ...Array.from({ length: 22 }, (_, i) => ({ id: `x.io/e${i}`, kind: "external" as const, loc: { path: "go.mod", line: 1 } }))];
     const imp = (from: string, to: string) => ({ from, to, kind: "imports" as const, count: 1, loc: { path: "x.go", line: 1 } });
     const v = view(nodes, [imp("m/a/x", "m/b/z"), imp("m/a/y", "m/b/z"), imp("m/a/x", "m/a/y"), imp("m/b/z", "n/q"),
-      ...Array.from({ length: 21 }, (_, i) => imp("m/a/x", `ext${i}`))]);
-    expect(bundles(v, "m", 1)).toEqual([
-      { from: "m/a", to: "externals", pairs: 21 },
+      ...Array.from({ length: 22 }, (_, i) => imp("m/a/x", `x.io/e${i}`))]);
+    // 21: the 20 externals imported by the most files are drawn, the rest fold.
+    expect(bundles(v, "m", 1).filter((b) => !b.to.startsWith("x.io/"))).toEqual([
+      { from: "m/a", to: "externals", pairs: 2 },
       { from: "m/a", to: "m/b", pairs: 2 },
       { from: "m/b", to: "outside", pairs: 1 },
     ]);
-    expect(touchedExternals(v, "m", 1)).toHaveLength(21);
+    expect(bundles(v, "m", 1).filter((b) => b.to.startsWith("x.io/"))).toHaveLength(20);
+    expect(touchedExternals(v, "m", 1)).toHaveLength(22);
   });
   it("containers are the boxes between the focus and its leaves", () => {
     const v = view(pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b"], "ex/shop"));
```

- [ ] **Run:** `cd web && npx vitest run` Expected: FAIL (19 tests in 7 files: `rail.test.ts` cannot load (`Cannot find module './rail'`); the scene has no `rail` (`Cannot read properties of undefined (reading 'map')`, and `'at'`); the ovals are still nodes (`expected [ 'm', 'm#pkg', 'm/api', …(3) ] to not include 'x.io/e'`) and their lines are drawn at rest; and past 20 every external folds (`expected [ 'externals', 'externals' ] to deeply equal [ 'x.io/e3', 'externals' ]`))

- [ ] **Put external modules on the rail**

`web/src/__snapshots__/scene04.json`:

```diff
diff --git a/web/src/__snapshots__/scene04.json b/web/src/__snapshots__/scene04.json
index 82da33a..bd4de8e 100644
--- a/web/src/__snapshots__/scene04.json
+++ b/web/src/__snapshots__/scene04.json
@@ -72,24 +72,6 @@
     "rows": [],
     "mark": "",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -111,30 +93,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/tools/gen",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project (root) d=1": {
@@ -156,44 +140,28 @@
     "rows": [],
     "mark": "",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
    {
-    "from": "example.com/shop",
-    "to": "github.com/lib/pq",
+    "from": "example.com/shop/tools",
+    "to": "example.com/shop",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "example.com/shop/tools",
-    "to": "example.com/shop",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -243,24 +211,6 @@
     "rows": [],
     "mark": "",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -271,22 +221,24 @@
     "status": ""
    },
    {
-    "from": "example.com/shop/internal",
-    "to": "github.com/lib/pq",
+    "from": "example.com/shop/tools/gen",
+    "to": "example.com/shop/internal",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop/internal",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "example.com/shop/tools/gen",
-    "to": "example.com/shop/internal",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -363,24 +315,6 @@
     "rows": [],
     "mark": "",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -402,30 +336,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/tools/gen",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop d=auto": {
@@ -475,24 +411,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -522,30 +440,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop d=1": {
@@ -568,24 +488,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -604,22 +506,24 @@
     "status": ""
    },
    {
-    "from": "example.com/shop/internal",
-    "to": "github.com/lib/pq",
+    "from": "outside",
+    "to": "example.com/shop/internal",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop/internal",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "outside",
-    "to": "example.com/shop/internal",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -670,24 +574,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -717,30 +603,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop d=3": {
@@ -790,24 +678,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -837,47 +707,53 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop#pkg d=auto": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop#pkg d=1": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop#pkg d=2": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop#pkg d=3": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal d=auto": {
   "nodes": [
@@ -908,24 +784,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -949,24 +807,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -979,6 +825,20 @@
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop/internal d=1": {
@@ -1010,24 +870,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -1051,24 +893,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -1081,6 +911,20 @@
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop/internal d=2": {
@@ -1112,24 +956,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -1153,24 +979,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/store",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -1183,6 +997,20 @@
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop/internal d=3": {
@@ -1214,24 +1042,6 @@
     "mark": "",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -1242,22 +1052,16 @@
     "rowMarks": []
    }
   ],
-  "edges": [
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "example.com/shop/internal/money",
-    "pairs": 1,
-    "status": ""
-   },
+  "edges": [
    {
     "from": "example.com/shop/internal/checkout",
-    "to": "example.com/shop/internal/store",
+    "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    },
    {
     "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
+    "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": ""
    },
@@ -1267,12 +1071,6 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -1285,39 +1083,61 @@
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "project example.com/shop/internal/checkout d=auto": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/checkout d=1": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/checkout d=2": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/checkout d=3": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/money d=auto": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/money d=1": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/money d=2": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/money d=3": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/internal/store d=auto": {
   "nodes": [
@@ -1445,7 +1265,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/internal/store d=1": {
   "nodes": [
@@ -1573,7 +1394,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/internal/store d=2": {
   "nodes": [
@@ -1701,7 +1523,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/internal/store d=3": {
   "nodes": [
@@ -1829,7 +1652,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/tools d=auto": {
   "nodes": [
@@ -1859,7 +1683,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/tools d=1": {
   "nodes": [
@@ -1889,7 +1714,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/tools d=2": {
   "nodes": [
@@ -1919,7 +1745,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/tools d=3": {
   "nodes": [
@@ -1949,23 +1776,28 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "project example.com/shop/tools/gen d=auto": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/tools/gen d=1": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/tools/gen d=2": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "project example.com/shop/tools/gen d=3": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change (root) d=auto": {
   "nodes": [
@@ -2127,24 +1959,6 @@
     "rows": [],
     "mark": "affected",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -2172,30 +1986,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/tools/gen",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change (root) d=1": {
@@ -2235,44 +2051,28 @@
     "rows": [],
     "mark": "",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
    {
-    "from": "example.com/shop",
-    "to": "github.com/lib/pq",
+    "from": "example.com/shop/tools",
+    "to": "example.com/shop",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "example.com/shop/tools",
-    "to": "example.com/shop",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -2331,24 +2131,6 @@
     "rows": [],
     "mark": "affected",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -2359,22 +2141,24 @@
     "status": "mixed"
    },
    {
-    "from": "example.com/shop/internal",
-    "to": "github.com/lib/pq",
+    "from": "example.com/shop/tools/gen",
+    "to": "example.com/shop/internal",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop/internal",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "example.com/shop/tools/gen",
-    "to": "example.com/shop/internal",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -2538,24 +2322,6 @@
     "rows": [],
     "mark": "affected",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -2583,30 +2349,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/tools/gen",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop d=auto": {
@@ -2743,24 +2511,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -2796,30 +2546,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop d=1": {
@@ -2851,24 +2603,6 @@
     "mark": "has-change",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -2887,22 +2621,24 @@
     "status": "mixed"
    },
    {
-    "from": "example.com/shop/internal",
-    "to": "github.com/lib/pq",
+    "from": "outside",
+    "to": "example.com/shop/internal",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop/internal",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "outside",
-    "to": "example.com/shop/internal",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -3040,24 +2776,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -3093,30 +2811,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop d=3": {
@@ -3253,24 +2973,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -3306,30 +3008,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop#pkg d=auto": {
@@ -3344,7 +3048,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop#pkg d=1": {
   "nodes": [
@@ -3358,7 +3063,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop#pkg d=2": {
   "nodes": [
@@ -3372,7 +3078,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop#pkg d=3": {
   "nodes": [
@@ -3386,7 +3093,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal d=auto": {
   "nodes": [
@@ -3495,24 +3203,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -3536,24 +3226,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -3566,6 +3244,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop/internal d=1": {
@@ -3675,24 +3367,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -3716,24 +3390,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -3746,6 +3408,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop/internal d=2": {
@@ -3855,24 +3531,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -3896,24 +3554,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -3926,6 +3572,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop/internal d=3": {
@@ -4035,24 +3695,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -4076,24 +3718,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -4106,6 +3736,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "change example.com/shop/internal/checkout d=auto": {
@@ -4120,7 +3764,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/checkout d=1": {
   "nodes": [
@@ -4134,7 +3779,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/checkout d=2": {
   "nodes": [
@@ -4148,7 +3794,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/checkout d=3": {
   "nodes": [
@@ -4162,7 +3809,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/money d=auto": {
   "nodes": [
@@ -4176,7 +3824,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/money d=1": {
   "nodes": [
@@ -4190,7 +3839,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/money d=2": {
   "nodes": [
@@ -4204,7 +3854,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/money d=3": {
   "nodes": [
@@ -4218,7 +3869,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/store d=auto": {
   "nodes": [
@@ -4256,7 +3908,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/store d=1": {
   "nodes": [
@@ -4294,7 +3947,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/store d=2": {
   "nodes": [
@@ -4332,7 +3986,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/internal/store d=3": {
   "nodes": [
@@ -4370,7 +4025,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/tools d=auto": {
   "nodes": [
@@ -4400,7 +4056,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "change example.com/shop/tools d=1": {
   "nodes": [
@@ -4430,7 +4087,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "change example.com/shop/tools d=2": {
   "nodes": [
@@ -4460,7 +4118,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "change example.com/shop/tools d=3": {
   "nodes": [
@@ -4490,23 +4149,28 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "change example.com/shop/tools/gen d=auto": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/tools/gen d=1": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/tools/gen d=2": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "change example.com/shop/tools/gen d=3": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph (root) d=auto": {
   "nodes": [
@@ -4668,24 +4332,6 @@
     "rows": [],
     "mark": "affected",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -4713,30 +4359,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/tools/gen",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph (root) d=1": {
@@ -4776,44 +4424,28 @@
     "rows": [],
     "mark": "",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
    {
-    "from": "example.com/shop",
-    "to": "github.com/lib/pq",
+    "from": "example.com/shop/tools",
+    "to": "example.com/shop",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "example.com/shop/tools",
-    "to": "example.com/shop",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -4872,24 +4504,6 @@
     "rows": [],
     "mark": "affected",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -4900,22 +4514,24 @@
     "status": "mixed"
    },
    {
-    "from": "example.com/shop/internal",
-    "to": "github.com/lib/pq",
+    "from": "example.com/shop/tools/gen",
+    "to": "example.com/shop/internal",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop/internal",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "example.com/shop/tools/gen",
-    "to": "example.com/shop/internal",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -5079,24 +4695,6 @@
     "rows": [],
     "mark": "affected",
     "rowMarks": []
-   },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
    }
   ],
   "edges": [
@@ -5124,30 +4722,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/tools/gen",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop d=auto": {
@@ -5284,24 +4884,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -5337,30 +4919,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop d=1": {
@@ -5392,24 +4976,6 @@
     "mark": "has-change",
     "rowMarks": []
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -5428,22 +4994,24 @@
     "status": "mixed"
    },
    {
-    "from": "example.com/shop/internal",
-    "to": "github.com/lib/pq",
+    "from": "outside",
+    "to": "example.com/shop/internal",
     "pairs": 1,
     "status": ""
-   },
+   }
+  ],
+  "rail": [
    {
-    "from": "example.com/shop/internal",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
    },
    {
-    "from": "outside",
-    "to": "example.com/shop/internal",
-    "pairs": 1,
-    "status": ""
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
    }
   ]
  },
@@ -5581,24 +5149,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -5634,30 +5184,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop d=3": {
@@ -5794,24 +5346,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -5847,30 +5381,32 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/money",
     "pairs": 1,
     "status": ""
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop#pkg d=auto": {
@@ -5885,7 +5421,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop#pkg d=1": {
   "nodes": [
@@ -5899,7 +5436,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop#pkg d=2": {
   "nodes": [
@@ -5913,7 +5451,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop#pkg d=3": {
   "nodes": [
@@ -5927,7 +5466,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal d=auto": {
   "nodes": [
@@ -6036,24 +5576,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -6077,24 +5599,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -6107,6 +5617,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop/internal d=1": {
@@ -6216,24 +5740,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -6257,24 +5763,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -6287,6 +5781,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop/internal d=2": {
@@ -6396,24 +5904,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -6437,24 +5927,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -6467,6 +5945,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop/internal d=3": {
@@ -6576,24 +6068,6 @@
      "st-modified"
     ]
    },
-   {
-    "id": "github.com/lib/pq",
-    "label": "github.com/lib/pq",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
-   {
-    "id": "golang.org/x/sync",
-    "label": "golang.org/x/sync",
-    "parent": "",
-    "shape": "oval",
-    "rows": [],
-    "mark": "",
-    "rowMarks": []
-   },
    {
     "id": "outside",
     "label": "outside",
@@ -6617,24 +6091,12 @@
     "pairs": 1,
     "status": ""
    },
-   {
-    "from": "example.com/shop/internal/checkout",
-    "to": "golang.org/x/sync",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "example.com/shop/internal/money",
     "to": "example.com/shop/internal/store",
     "pairs": 1,
     "status": "reversed"
    },
-   {
-    "from": "example.com/shop/internal/store",
-    "to": "github.com/lib/pq",
-    "pairs": 1,
-    "status": ""
-   },
    {
     "from": "outside",
     "to": "example.com/shop/internal/checkout",
@@ -6647,6 +6109,20 @@
     "pairs": 2,
     "status": "mixed"
    }
+  ],
+  "rail": [
+   {
+    "id": "github.com/lib/pq",
+    "label": "pq",
+    "files": 1,
+    "mark": ""
+   },
+   {
+    "id": "golang.org/x/sync",
+    "label": "sync",
+    "files": 1,
+    "mark": ""
+   }
   ]
  },
  "subgraph example.com/shop/internal/checkout d=auto": {
@@ -6661,7 +6137,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/checkout d=1": {
   "nodes": [
@@ -6675,7 +6152,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/checkout d=2": {
   "nodes": [
@@ -6689,7 +6167,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/checkout d=3": {
   "nodes": [
@@ -6703,7 +6182,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/money d=auto": {
   "nodes": [
@@ -6717,7 +6197,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/money d=1": {
   "nodes": [
@@ -6731,7 +6212,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/money d=2": {
   "nodes": [
@@ -6745,7 +6227,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/money d=3": {
   "nodes": [
@@ -6759,7 +6242,8 @@
     "rowMarks": []
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/store d=auto": {
   "nodes": [
@@ -6797,7 +6281,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/store d=1": {
   "nodes": [
@@ -6835,7 +6320,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/store d=2": {
   "nodes": [
@@ -6873,7 +6359,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/internal/store d=3": {
   "nodes": [
@@ -6911,7 +6398,8 @@
     ]
    }
   ],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/tools d=auto": {
   "nodes": [
@@ -6941,7 +6429,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "subgraph example.com/shop/tools d=1": {
   "nodes": [
@@ -6971,7 +6460,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "subgraph example.com/shop/tools d=2": {
   "nodes": [
@@ -7001,7 +6491,8 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "subgraph example.com/shop/tools d=3": {
   "nodes": [
@@ -7031,22 +6522,27 @@
     "pairs": 1,
     "status": ""
    }
-  ]
+  ],
+  "rail": []
  },
  "subgraph example.com/shop/tools/gen d=auto": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/tools/gen d=1": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/tools/gen d=2": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  },
  "subgraph example.com/shop/tools/gen d=3": {
   "nodes": [],
-  "edges": []
+  "edges": [],
+  "rail": []
  }
 }
\ No newline at end of file
```

`web/src/bundle.ts`:

```diff
diff --git a/web/src/bundle.ts b/web/src/bundle.ts
index c641949..998eb16 100644
--- a/web/src/bundle.ts
+++ b/web/src/bundle.ts
@@ -3,8 +3,8 @@
 import type { View, ViewEdge } from "./data";
 import { cmp, index, leafOf, type Cut } from "./cut";
 
-export const EXTERNALS = "externals"; // the aggregate when a cut touches too many externals
-export const EXTERNAL_BUDGET = 20;
+export const EXTERNALS = "externals"; // the aggregate of the externals past the budget
+export const EXTERNAL_BUDGET = 20; // 21: the externals drawn on the rail, at most
 
 // Bundle is every IR edge between two drawn nodes; pairs counts distinct
 // from/to node pairs among its members. status is the Change Status its
@@ -21,7 +21,8 @@ export function statusOf(members: readonly ViewEdge[]): string | undefined {
 
 // bundlesOver maps each edge's ends to drawn nodes and groups them.
 // - Package cut: imports; packages go to their leaf or "outside", externals to
-//   themselves, or all to "externals" when more than 20 are touched.
+//   themselves. 21: past the 20 imported by the most files (ties by id), the
+//   rest go to "externals", unless only one would.
 // - Declaration cut: calls and embeds between the package's declarations; a
 //   method goes to its type.
 // An edge is kept only when one end is a drawn leaf, so outside→outside and
@@ -49,9 +50,13 @@ export function bundlesOver(view: View, c: Cut, opts: { externals: boolean } = {
     if (from === null || to === null || from === to || !(leaves.has(from) || leaves.has(to))) continue;
     mapped.push([from, to, e]);
   }
-  const touched = new Set<string>();
-  for (const [, , e] of mapped) for (const id of [e.from, e.to]) if (node.get(id)?.kind === "external") touched.add(id);
-  const ext = (id: string) => (touched.size > EXTERNAL_BUDGET && touched.has(id) ? EXTERNALS : id);
+  const files = new Map<string, number>(); // each external touched, and the files that import it
+  for (const [, , e] of mapped) {
+    for (const id of [e.from, e.to]) if (node.get(id)?.kind === "external") files.set(id, (files.get(id) ?? 0) + e.count);
+  }
+  const ranked = [...files].sort(([a, x], [b, y]) => y - x || cmp(a, b)).map(([id]) => id);
+  const folded = new Set(ranked.length > EXTERNAL_BUDGET + 1 ? ranked.slice(EXTERNAL_BUDGET) : []);
+  const ext = (id: string) => (folded.has(id) ? EXTERNALS : id);
   const groups = new Map<string, Bundle>();
   for (const [f, t, e] of mapped) {
     const from = ext(f);
@@ -72,7 +77,7 @@ export function bundlesOver(view: View, c: Cut, opts: { externals: boolean } = {
 }
 
 // externalsOf are the external modules a set of bundles touches, whether drawn
-// as ovals or folded into "externals".
+// on the rail or folded into "externals".
 export function externalsOf(view: View, bundles: readonly Bundle[]): string[] {
   const { node } = index(view);
   const out = new Set<string>();
```

`web/src/cut.test.ts`:

```diff
diff --git a/web/src/cut.test.ts b/web/src/cut.test.ts
index eb17cf4..e82581f 100644
--- a/web/src/cut.test.ts
+++ b/web/src/cut.test.ts
@@ -25,7 +25,7 @@ describe("home (11)", () => {
     expect(home({ ...one, kind: "change" })).toBe("");
     expect(upTo({ ...one, kind: "change" }, "h")).toBe("");
   });
-  it("does not count external modules: hugo's root holds its module and an externals oval", () => {
+  it("does not count external modules: hugo's root holds its module, and its externals are on the rail", () => {
     const h = view([...pkgs(["h", "h/a", "h/b"], "h"), ...exts(["x.io/e"])], [edge("h/a", "x.io/e")]);
     expect(home(h)).toBe("h");
   });
```

`web/src/group.ts`:

```diff
diff --git a/web/src/group.ts b/web/src/group.ts
index d7c31a9..4832bb2 100644
--- a/web/src/group.ts
+++ b/web/src/group.ts
@@ -197,8 +197,8 @@ export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
   const uses = new Set<string>();
   const drawnIds = new Set([...c.leaves, ...c.containers]);
   for (const a of k.arcs) {
-    // Only project boxes are siblings (M2): the outside, the externals oval
-    // and an external module are drawn beside the rows, not in them.
+    // Only project boxes are siblings (M2): the outside is drawn beside the
+    // rows, and external modules on the rail under them (21).
     if (!drawnIds.has(a.from) || !drawnIds.has(a.to)) continue;
     for (let f = a.from; f !== ""; f = up(f)) {
       if (up(f) === up(a.to)) {
```

`web/src/rail.ts` (new):

```diff
diff --git a/web/src/rail.ts b/web/src/rail.ts
new file mode 100644
index 0000000..1315066
--- /dev/null
+++ b/web/src/rail.ts
@@ -0,0 +1,76 @@
+// The rail (21): the external modules a view imports, drawn as chips in a
+// band under the project's boxes, each with the files drawn here that import
+// it, not as boxes in the rows. ELK never sees them: placeRail places the
+// band once the boxes are laid out, so a chip comes or goes and no box moves.
+import type { Row } from "./facts";
+import { INSET, textWidth, type Placed } from "./layout";
+
+// RailChip is an external module on the rail, or "externals" (bundle.ts), the
+// chip holding those past the 20 imported by the most files.
+export type RailChip = {
+  id: string; label: string;
+  files: number; // the files drawn here that import it: its imports' counts, summed
+  dim: boolean; selected: boolean;
+  change?: string; // the Change View class (change.ts nodeMark)
+  holds?: Row[]; // "+N more": the modules it holds, for its label and its panel
+};
+
+export const RAIL = "__rail"; // the band's id on the canvas
+export const RAIL_CAPTION = "external modules · files that import each";
+export const RAIL_GAP = 36; // from the lowest box to the band
+const PAD = 8; // inside the band, around its caption and chips
+const CAPTION = 18; // the caption's line
+const GAP = 8; // between chips, across and down
+const MIN_WRAP = 600; // the chips wrap at the body's width, or this under a narrower body
+const CHIP_H = 24; // .node.ext: 3 px padding, a 16 px line, its border
+
+// chipLabels names each module by its path's last element, or the one before
+// a major version (k8s.io/klog/v2: klog). Two that would read the same keep
+// their paths; the tooltip always has it.
+export function chipLabels(ids: readonly string[]): string[] {
+  const short = ids.map((id) => {
+    const parts = id.split("/");
+    return parts.length > 1 && /^v\d+$/.test(parts.at(-1)!) ? parts.at(-2)! : parts.at(-1)!;
+  });
+  return short.map((s, i) => (short.indexOf(s) !== short.lastIndexOf(s) ? ids[i] : s));
+}
+
+// chipSize sizes a chip to its label and count, as sizeOf sizes a box.
+export const chipSize = (c: RailChip): { w: number; h: number } =>
+  ({ w: Math.ceil(textWidth(c.label) + 6 + textWidth(String(c.files)) + INSET), h: CHIP_H });
+
+// placeRail places the band, centred under the boxes at the top of placed
+// (the layout), and its chips in rows inside it, in the scene's order. The
+// band fits its caption and its widest row. Positions are absolute.
+export function placeRail(chips: readonly RailChip[], placed: ReadonlyMap<string, Placed>): Map<string, Placed> {
+  const out = new Map<string, Placed>();
+  if (chips.length === 0) return out;
+  const tops = [...placed.values()].filter((p) => p.parent === undefined);
+  const left = Math.min(...tops.map((p) => p.x));
+  const right = Math.max(...tops.map((p) => p.x + p.w));
+  const top = tops.length ? Math.max(...tops.map((p) => p.y + p.h)) + RAIL_GAP : 0;
+  const wrap = Math.max(tops.length ? right - left : 0, MIN_WRAP) - 2 * PAD;
+  const rows: { id: string; w: number }[][] = [[]];
+  let used = 0;
+  for (const c of chips) {
+    const { w } = chipSize(c);
+    if (rows.at(-1)!.length > 0 && used + GAP + w > wrap) {
+      rows.push([]);
+      used = 0;
+    }
+    used += (rows.at(-1)!.length > 0 ? GAP : 0) + w;
+    rows.at(-1)!.push({ id: c.id, w });
+  }
+  const widest = Math.max(...rows.map((r) => r.reduce((s, c) => s + c.w, 0) + GAP * (r.length - 1)));
+  const w = Math.max(widest, Math.ceil(textWidth(RAIL_CAPTION))) + 2 * PAD;
+  const x0 = tops.length ? (left + right) / 2 - w / 2 : 0;
+  out.set(RAIL, { x: x0, y: top, w, h: PAD + CAPTION + rows.length * CHIP_H + (rows.length - 1) * GAP + PAD });
+  rows.forEach((r, i) => {
+    let x = x0 + PAD;
+    for (const c of r) {
+      out.set(c.id, { x, y: top + PAD + CAPTION + i * (CHIP_H + GAP), w: c.w, h: CHIP_H });
+      x += c.w + GAP;
+    }
+  });
+  return out;
+}
```

`web/src/scene.ts`:

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
index 48f7bc7..13c79de 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -2,7 +2,8 @@
 import { nodeMark, unchangedCount } from "./change";
 import type { View, ViewEdge } from "./data";
 import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packageOf, packagesIn, PKG, ROOT_CLOSED, rootModule, within, type Cut } from "./cut";
-import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
+import { bundlesOver, EXTERNALS, type Bundle } from "./bundle";
+import { targets } from "./facts";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
 import { rolledRanks } from "./policy";
@@ -13,9 +14,10 @@ import { shorten } from "./labels";
 import { withinHops } from "./select";
 import { badgesOf, BUDGET, capRows, factsOf, fold, foldInto, holdsProgram, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
 import { centreOf } from "./screen";
+import { chipLabels, type RailChip } from "./rail";
 import { toggle, type Known, type Stage, type ViewState } from "./state";
 
-export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
+export type Shape = "container" | "box" | "decl" | "outside" | "chip";
 
 export type SceneNode = {
   id: string; label: string; parent: string; shape: Shape;
@@ -49,7 +51,8 @@ export type Scene = {
   lines: boolean; // every edge is drawn at rest; false = the selection's edges, over marks (off) or none (auto)
   nodes: SceneNode[]; edges: SceneEdge[];
   all: SceneEdge[]; // 11: every edge the cut could draw, drawn or not; the canvas draws a hovered box's from here
-  hidden: number; // 11: the lines auto leaves out at rest (edges.ts); 0 when every line is drawn
+  hidden: number; // 11: the boxes' lines auto leaves out at rest (edges.ts); 0 when every one is drawn. 21: never the rail's
+  rail: RailChip[]; // 21: the external modules, on the rail under the boxes (rail.ts): the most files first, then by id; "+N more" last
   against: number; // 11: dependencies that run against the rows (rank.ts siblingRanks); the header counts them
   entry: boolean; // 12: every box of the top row holds a program, so the axis names it entry points
   bundles: Bundle[]; // the leaf bundles behind the edges, for the panel
@@ -209,7 +212,10 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   leaves = new Set([...leaves].filter((l) => !d.folded(l)));
   if (selected !== null) selected = shown(selected);
 
-  const ids = new Set([...leaves, ...folds]);
+  // 21: external modules go on the rail, not among the boxes.
+  const onRail = (id: string) => id === EXTERNALS || node.get(id)?.kind === "external";
+  const railed = new Set([...leaves].filter(onRail));
+  const ids = new Set([...leaves, ...folds].filter((id) => !railed.has(id)));
   const inner = new Set<string>(); // containers that still hold a drawn node
   for (const id of ids) for (let p = up(id); p !== ""; p = up(p)) inner.add(p);
   for (const p of inner) ids.add(p);
@@ -229,7 +235,6 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const bright = (id: string) => selected === null || inSel(id) || lit.has(id);
 
   const base = focus.endsWith(PKG) ? focus.slice(0, -PKG.length) : focus;
-  const externals = externalsOf(view, kept).length;
   // path: the label is the box's path below its container, which 11 shortens.
   const paths = new Set<string>();
   const label = (id: string, parent: string): string => {
@@ -238,9 +243,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     if (isStrip(id)) return stripText(view, members(id), 0).label;
     if (isFold(id)) return grouped.groups.has(id) ? `+${grouped.folded.get(id)!.length} more` : `fold ${grouped.folded.get(id)!.length}`;
     if (id === OUTSIDE) return "outside";
-    if (id === EXTERNALS) return `${externals} external modules`;
     if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
-    if (node.get(id)?.kind === "external") return id;
     if (c.decls) return id.slice(base.length + 1);
     paths.add(id);
     const top = parent || base;
@@ -250,7 +253,6 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     if (isGroup(id)) return "chip";
     if (inner.has(id)) return "container";
     if (id === OUTSIDE) return "outside";
-    if (id === EXTERNALS || node.get(id)?.kind === "external") return "oval";
     return c.decls ? "decl" : "box";
   };
 
@@ -342,8 +344,11 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   // 11: auto draws at rest only what must show when there are too many lines
   // to follow: violations, changed imports, and the imports behind the
   // Affected Set (edges.ts always). Everything else waits for a selection.
-  const drawable = d.arrows.filter((a) => ids.has(a.from) && ids.has(a.to));
-  const hush = quiet(s.edges, d.lines, drawable.length);
+  // 21: a line to the rail waits for a selection or a hover unless every line
+  // is on, and the boxes' lines alone decide whether theirs wait.
+  const toRail = (a: { from: string; to: string }) => railed.has(a.from) || railed.has(a.to);
+  const drawable = d.arrows.filter((a) => [a.from, a.to].every((x) => ids.has(x) || railed.has(x)));
+  const hush = quiet(s.edges, d.lines, drawable.filter((a) => !toRail(a)).length);
   const marked = (id: string) => (node.get(id) ? nodeMark(node.get(id)!) : "");
   const affected = (e: ViewEdge) => view.kind === "change" && marked(e.from) === "affected" && marked(e.to) !== "";
   const all: SceneEdge[] = [];
@@ -358,8 +363,8 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     if (a.status) e.status = a.status;
     if (h) e.dir = a.carries.some((b) => inSel(b.from)) ? "out" : "in";
     all.push(e);
-    const rest = !hush || always(a, affected); // drawn with nothing selected
-    if (!rest) hidden++;
+    const rest = (toRail(a) ? s.edges === "on" : !hush) || always(a, affected); // drawn with nothing selected
+    if (!rest && !toRail(a)) hidden++;
     if (d.lines ? rest || h : h) edges.push(e);
   }
   const byEnds = (x: SceneEdge, y: SceneEdge) => cmp(x.from, y.from) || cmp(x.to, y.to);
@@ -388,8 +393,21 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const high = Math.max(...tops.map((n) => n.tier!));
   const topRow = tops.filter((n) => n.tier === high);
   const entry = !c.decls && topRow.length > 0 && topRow.every((n) => (n.shape === "box" || n.shape === "container") && holdsProgram(view, n.id));
+  // 21: each chip counts the files that import it, and "+N more" lists the
+  // modules it holds, over every bundle (15): the weight filter hides lines only.
+  const files = new Map<string, number>();
+  for (const b of every) if (railed.has(b.to)) files.set(b.to, b.members.reduce((n, e) => n + e.count, files.get(b.to) ?? 0));
+  const mods = [...railed].filter((id) => id !== EXTERNALS).sort((a, b) => files.get(b)! - files.get(a)! || cmp(a, b));
+  const names = chipLabels(mods);
+  const held = targets(every, EXTERNALS);
+  const rail = [...mods, ...(railed.has(EXTERNALS) ? [EXTERNALS] : [])].map((id, i): RailChip => {
+    const r: RailChip = { id, label: id === EXTERNALS ? `+${held.length} more` : names[i], files: files.get(id)!, dim: !bright(id), selected: id === selected };
+    if (id === EXTERNALS) r.holds = held;
+    if (marked(id)) r.change = marked(id);
+    return r;
+  });
   return {
-    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, entry, bundles: kept,
+    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, rail, against, entry, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
     folded: [...grouped.folds].reduce((n, f) => n + (grouped.groups.get(f)?.length ?? 0), 0),
     grouping: ref?.grouping ?? { folded: grouped.folded, multi: d.multi, cut: c },
@@ -502,13 +520,14 @@ export const HUBS = 3;
 // drawn where it shows (links), the same source as the ranks. Not from the
 // lines: a declutter stage merges them into its containers' arrows. So the
 // text and the box's size are the same whatever the stage, edge mode, hover
-// or selection. Only project nodes count (A2): the externals oval and the
-// outside box stand beside the rows, not in them, so a box in the bottom row
-// ("depends on nothing here") reads uses 0; the Panel lists its externals.
+// or selection. Only project nodes count (A2): the outside box stands beside
+// the rows, and external modules on the rail under them (21), so a box in the
+// bottom row ("depends on nothing here") reads uses 0; the Panel lists its
+// externals.
 // At rest the HUBS boxes used by the most (at least one; ties by id) are
 // marked hub: where to start reading.
 function connect(view: View, nodes: SceneNode[], links: readonly (readonly [string, string])[], rest: boolean): Map<string, Set<string>> {
-  const aside = new Set(nodes.filter((n) => n.shape === "oval" || n.shape === "outside").map((n) => n.id));
+  const aside = new Set(nodes.filter((n) => n.shape === "outside").map((n) => n.id));
   const uses = new Map<string, Set<string>>();
   const usedBy = new Map<string, Set<string>>();
   const add = (m: Map<string, Set<string>>, k: string, v: string) => {
```

`web/src/search.ts`:

```diff
diff --git a/web/src/search.ts b/web/src/search.ts
index 3193e76..e2a0971 100644
--- a/web/src/search.ts
+++ b/web/src/search.ts
@@ -78,7 +78,7 @@ export function reveal(view: View, id: string, from: ViewState = DEFAULT_STATE):
   }
   if (n.kind === "external") {
     const s = { ...reset, focus: "", depth: null, selected: id };
-    return scene(view, s).nodes.some((x) => x.id === id) ? s : { ...s, selected: EXTERNALS };
+    return scene(view, s).rail.some((x) => x.id === id) ? s : { ...s, selected: EXTERNALS }; // 21: past the 20, "+N more"
   }
   const pkg = packageOf(view, id)!;
   return { ...reset, focus: childrenOf(view, pkg).length > 0 ? pkg + PKG : pkg, depth: null, selected: id };
```

- [ ] **Run:** `cd web && npx vitest run -u src/scene.snapshot.test.ts` Expected: PASS (it rewrites the snapshot: 72 nodes and 72 resting lines leave 36 views, which gain 72 chips)

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Commit:** `Put external modules on a rail under the boxes, the 20 most imported first`

---

### Task 2: The canvas draws the rail, and React Flow's handles leave the code panel's style (`Canvas.tsx`, `styles.css`, `App.tsx`, `Panel.tsx`)

`rail.mjs` (new) opens the shop's View and a page whose package imports 23 external modules, in three engines. It checks:
- the chips and the caption, and that no chip's label is cut;
- the band under the lowest box, every chip inside it and in the first view;
- no line to the rail at rest; a hovered chip draws its line, and a hovered box its line to the rail;
- the legend's cue: it names external modules while the rail's lines wait, and only boxes once the rail is gone;
- a click or Enter selects a chip; "+N more" lists the 3 it holds, and still lists them at min pairs 4 (`w=4`), which hides its line;
- a double-click opens nothing;
- hiding the externals moves no box.

`accept.mjs` counts the boxes, expects the Change View's 20 nodes, and checks `spill`; `screen.mjs` checks `spill` (**Architecture 7**).

**Files:**
- Test: `web/e2e/rail.mjs` (new), `web/e2e/accept.mjs`, `web/e2e/screen.mjs`, `web/e2e/package.json`
- Code: `web/src/Canvas.tsx`, `web/src/styles.css`, `web/src/App.tsx`, `web/src/Panel.tsx`

**Steps:**

- [ ] **Write the failing browser checks**

`web/e2e/accept.mjs`:

```diff
diff --git a/web/e2e/accept.mjs b/web/e2e/accept.mjs
index 4698eee..4d6eb14 100644
--- a/web/e2e/accept.mjs
+++ b/web/e2e/accept.mjs
@@ -162,6 +162,12 @@ const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 3
 const loaded = (p) => p.waitForFunction(() => document.querySelector(".react-flow__node, main .empty:not(#zu-status)") ||
   /^(?!Laying out)./.test(document.getElementById("zu-status")?.textContent ?? ""), null, { timeout: 30000 });
 const hash = (p) => p.evaluate(() => decodeURIComponent(location.hash));
+// spill: the nodes whose text reaches past their bottom edge: a label, a
+// stats, sub or facts line, role badges, a row. 21: React Flow's source
+// handle took the code panel's .source style, which put it in the flow and
+// pushed every node's text down by its height.
+const spill = () => [...document.querySelectorAll(".react-flow__node")].filter((n) => [...n.querySelectorAll(".label, .stats, .sub, .facts, .badges, .member")]
+  .some((t) => t.getBoundingClientRect().bottom > n.getBoundingClientRect().bottom + 0.5)).length;
 async function run(b) {
   const out = {};
   // Project View
@@ -172,7 +178,9 @@ async function run(b) {
   await p.goto(base + "with.html");
   await drawn(p);
   await settle(p);
-  out.nodes = await p.locator(".react-flow__node").count();
+  // 21: the boxes; the rail is under them, below the fold at this size.
+  out.nodes = await p.evaluate(() => [...document.querySelectorAll(".react-flow__node")].filter((e) => !e.querySelector(".ext, .rail")).length);
+  out.spill = await p.evaluate(spill);
   const v0 = await vp(p);
   await p.keyboard.press("/");
   await p.keyboard.type("Repo.Get");
@@ -594,7 +602,8 @@ async function run(b) {
 }
 
 const want = {
-  nodes: 10,
+  nodes: 8,
+  spill: 0,
   search: "#f=example.com/shop/internal/store&s=example.com/shop/internal/store.Repo.Get",
   row: ".Get",
   centred: true,
@@ -603,7 +612,7 @@ const want = {
   afterReload: "Declutter arrows",
   hideEdges: [true, 1, 8],
   notice: 0,
-  change: 19,
+  change: 20, // 21: the externals' two chips and the rail's band
   chips: ["+4 unchanged", "+2 unchanged", "+10 unchanged"],
   pickCentred: true,
   picked: "store",
```

`web/e2e/package.json`:

```diff
diff --git a/web/e2e/package.json b/web/e2e/package.json
index 44d7e91..98362c3 100644
--- a/web/e2e/package.json
+++ b/web/e2e/package.json
@@ -9,7 +9,8 @@
     "accept-place": "node place.mjs",
     "accept-screen": "node screen.mjs",
     "accept-code": "node code.mjs",
-    "accept-diff-code": "node diffcode.mjs"
+    "accept-diff-code": "node diffcode.mjs",
+    "accept-rail": "node rail.mjs"
   },
   "devDependencies": {
     "playwright-core": "1.63.0"
```

`web/e2e/rail.mjs` (new):

```diff
diff --git a/web/e2e/rail.mjs b/web/e2e/rail.mjs
new file mode 100644
index 0000000..2f474b3
--- /dev/null
+++ b/web/e2e/rail.mjs
@@ -0,0 +1,175 @@
+// Browser acceptance for the externals rail (21): external modules drawn as
+// chips in a band under the boxes, each with the files that import it; no
+// line to the rail at rest, and the legend says how to draw them; a hovered
+// chip, or box, draws its lines; a click or Enter selects a chip, and "+N
+// more" lists the modules it holds, whatever the weight filter hides; no
+// chip's label is cut; a double-click opens nothing; hiding the externals
+// moves no box.
+// Not part of make check: it needs browsers and the built page (make build).
+// Run from web/e2e: npm run accept-rail.
+// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
+import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+import { chromium, firefox, webkit } from "playwright-core";
+
+const here = new URL(".", import.meta.url).pathname;
+const benign = (e) => e.message === "ResizeObserver loop completed with undelivered notifications."; // serve.mjs
+const dir = mkdtempSync(join(tmpdir(), "zu-rail-"));
+process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
+
+// pages: the shop's View, and many, whose m/a imports 23 externals (x.io/e22
+// by m/b's two files too), as zu scan -html writes a page.
+const pages = (() => {
+  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
+  const marker = '<script id="zu-data" type="application/json">{}</script>';
+  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
+  const shop = JSON.parse(readFileSync(join(here, "../../internal/export/testdata/shop.view.golden.json"), "utf8"));
+  const loc = { path: "x.go", line: 1 };
+  const xs = Array.from({ length: 23 }, (_, i) => `x.io/e${String(i).padStart(2, "0")}`);
+  const many = {
+    ...shop, modules: ["m"], sources: {},
+    nodes: [...["m/a", "m/b"].map((id) => ({ id, kind: "package", module: "m", loc })), ...xs.map((id) => ({ id, kind: "external", loc }))],
+    edges: [...xs.map((to) => ({ from: "m/a", to, kind: "imports", count: 1, loc })), { from: "m/b", to: "x.io/e22", kind: "imports", count: 2, loc }],
+  };
+  const write = (name, v) => {
+    const f = join(dir, `${name}.html`);
+    writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c"))));
+    return "file://" + f;
+  };
+  return { shop: write("shop", shop), many: write("many", many) };
+})();
+
+const PQ = "github.com/lib/pq";
+const STORE = "example.com/shop/internal/store";
+const at = (id) => `.react-flow__node[data-id="${id}"]`;
+const settle = (p) => p.waitForTimeout(300);
+
+async function open(b, url) {
+  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
+  p.setDefaultTimeout(10000);
+  const errors = [];
+  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
+  await p.goto(url);
+  await p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
+  await p.waitForTimeout(500);
+  return { p, errors };
+}
+// chips: each chip's id, label and count of files, in the order drawn.
+const chips = (p) => p.evaluate(() => [...document.querySelectorAll(".react-flow__node .node.ext")]
+  .map((e) => [e.closest(".react-flow__node").dataset.id, e.querySelector(".label").textContent, e.querySelector(".files").textContent]));
+// lines: the lines drawn to id.
+const lines = (p, id) => p.evaluate((id) => [...document.querySelectorAll(".react-flow__edge")].filter((e) => e.dataset.id.endsWith("→" + id)).length, id);
+// boxes: every node not on the rail, by id: its place on the canvas.
+const boxes = (p) => p.evaluate(() => JSON.stringify([...document.querySelectorAll(".react-flow__node")]
+  .filter((e) => !e.querySelector(".ext, .rail")).map((e) => [e.dataset.id, e.style.transform])));
+const hash = (p) => p.evaluate(() => decodeURIComponent(location.hash.slice(1)));
+// clipped: the chips whose label is cut short.
+const clipped = (p) => p.evaluate(() => [...document.querySelectorAll(".node.ext .label")].filter((l) => l.scrollWidth > l.clientWidth).length);
+
+async function shop(b) {
+  const { p, errors } = await open(b, pages.shop);
+  const got = {};
+  got.chips = await chips(p);
+  got.clipped = [await clipped(p)];
+  got.caption = await p.locator(".react-flow__node .rail .caption").textContent();
+  // The band starts under the lowest box, and the first view shows every chip.
+  got.placed = await p.evaluate(() => {
+    const pane = document.querySelector(".react-flow").getBoundingClientRect();
+    const all = [...document.querySelectorAll(".react-flow__node")];
+    const band = all.find((e) => e.querySelector(".rail")).getBoundingClientRect();
+    const box = all.filter((e) => !e.querySelector(".ext, .rail")).map((e) => e.getBoundingClientRect());
+    const chip = all.filter((e) => e.querySelector(".ext")).map((e) => e.getBoundingClientRect());
+    return [band.top > Math.max(...box.map((r) => r.bottom)),
+      chip.every((r) => r.top >= band.top && r.bottom <= band.bottom && r.left >= pane.left && r.right <= pane.right && r.bottom <= pane.bottom)];
+  });
+  got.rest = await lines(p, PQ);
+  const cue = () => p.locator(".legend .dirs").allTextContents();
+  got.cue = [await cue()];
+  await p.locator(at(PQ)).hover();
+  await settle(p);
+  got.hover = [await lines(p, PQ)];
+  await p.locator(".react-flow__pane").hover({ position: { x: 5, y: 5 } });
+  await settle(p);
+  got.hover.push(await lines(p, PQ));
+  await p.locator(at(STORE)).hover(); // the boxes' lines are drawn: a hovered box draws its lines to the rail
+  await settle(p);
+  got.box = await lines(p, PQ);
+  await p.locator(at(PQ)).click();
+  await settle(p);
+  got.select = [await hash(p), await p.locator(`${at(PQ)} .node.ext`).evaluate((e) => e.classList.contains("selected")), await lines(p, PQ),
+    await p.locator("aside.panel p.muted").first().textContent(),
+    await p.locator("aside.panel section", { has: p.locator('h3:text-matches("^Imported by")') }).locator("li code").allTextContents()];
+  const before = await boxes(p);
+  await p.getByLabel("externals").uncheck();
+  await settle(p);
+  got.hidden = [await p.locator(".react-flow__node .rail").count(), await p.locator(".react-flow__node .node.ext").count(), (await boxes(p)) === before];
+  got.cue.push(await cue()); // every line is drawn: nothing waits for a hover
+  await p.getByLabel(/^edges/).selectOption("off");
+  await settle(p);
+  got.cue.push(await cue()); // no rail: no module to hover
+  await p.close();
+  return { got, errors };
+}
+
+async function many(b) {
+  const { p, errors } = await open(b, pages.many);
+  const got = {};
+  const c = await chips(p);
+  got.many = [c.length, c[0], c.at(-1), await clipped(p)];
+  await p.locator(at("externals")).click();
+  await settle(p);
+  got.more = [await hash(p), await p.locator("aside.panel h3").first().textContent(), await p.locator("aside.panel li code").allTextContents()];
+  await p.locator(at("x.io/e00")).focus();
+  await p.keyboard.press("Enter");
+  await settle(p);
+  got.key = await hash(p);
+  // A double-click selects a chip and opens nothing: a chip is no box.
+  await p.locator(at("x.io/e01")).dblclick();
+  await settle(p);
+  got.dbl = await hash(p);
+  await p.close();
+  // Min pairs 4 hides the line to "+3 more" (3 pairs); it still lists the 3 it counts.
+  const w = await open(b, pages.many + "#w=4");
+  await w.p.locator(at("externals")).click();
+  await settle(w.p);
+  got.weighed = [await w.p.locator(`${at("externals")} .label`).textContent(), await w.p.locator("aside.panel h3").first().textContent(),
+    await w.p.locator("aside.panel li code").allTextContents()];
+  await w.p.close();
+  return { got, errors: [...errors, ...w.errors] };
+}
+
+const want = {
+  chips: [[PQ, "pq", "1"], ["golang.org/x/sync", "sync", "1"]],
+  caption: "external modules · files that import each",
+  clipped: [0],
+  placed: [true, true],
+  rest: 0,
+  cue: [["hover or select a box or an external module for its lines: solid, it uses · dotted, used by"], [],
+    ["hover or select a box for its lines: solid, it uses · dotted, used by"]],
+  hover: [1, 0],
+  box: 1,
+  select: [`s=${PQ}`, true, 1, "external module", [STORE]],
+  hidden: [0, 0, true],
+  many: [21, ["x.io/e22", "e22", "3"], ["externals", "+3 more", "3"], 0],
+  more: ["s=externals", "External modules (3)", ["x.io/e19", "x.io/e20", "x.io/e21"]],
+  key: "s=x.io/e00",
+  dbl: "s=x.io/e01",
+  weighed: ["+3 more", "External modules (3)", ["x.io/e19", "x.io/e20", "x.io/e21"]],
+  errors: [],
+};
+const channel = process.env.ZU_E2E_CHANNEL;
+const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
+let failed = 0;
+for (const [name, type, opts] of engines) {
+  const b = await type.launch(opts);
+  const got = await (async () => {
+    const parts = [await shop(b), await many(b)];
+    return { ...Object.assign({}, ...parts.map((x) => x.got)), errors: parts.flatMap((x) => x.errors) };
+  })().catch((e) => ({ errors: [String(e.message ?? e).split("\n")[0]] })).finally(() => b.close().catch(() => {}));
+  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
+  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
+  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
+  failed += bad.length;
+}
+process.exit(failed ? 1 : 0);
```

`web/e2e/screen.mjs`:

```diff
diff --git a/web/e2e/screen.mjs b/web/e2e/screen.mjs
index 41f1022..509345a 100644
--- a/web/e2e/screen.mjs
+++ b/web/e2e/screen.mjs
@@ -102,6 +102,12 @@ const centred = (p, id) => p.waitForFunction((id) => {
 const panel = (p) => p.locator("aside.panel code.id").textContent({ timeout: 1000 }).catch(() => null);
 const lens = (p) => p.locator('[aria-label="Lens"] button');
 
+// spill: the nodes whose text reaches past their bottom edge: a label, a
+// stats, sub or facts line, role badges, a row. 21: React Flow's source
+// handle took the code panel's .source style, which put it in the flow and
+// pushed every node's text down by its height.
+const spill = () => [...document.querySelectorAll(".react-flow__node")].filter((n) => [...n.querySelectorAll(".label, .stats, .sub, .facts, .badges, .member")]
+  .some((t) => t.getBoundingClientRect().bottom > n.getBoundingClientRect().bottom + 0.5)).length;
 async function walk(b) {
   const { p, errors } = await open(b, shop, `#s=${enc(S)}`);
   const got = {};
@@ -111,6 +117,7 @@ async function walk(b) {
   got.enter = JSON.stringify(await drawn(p, S)) === JSON.stringify([S, "down:example.com/shop/internal/money", "down:github.com/lib/pq", `up:${C}`].sort())
     && (await centre(p)) === S && (await entries(p)) === start + 1;
   got.button = [enabled, await lens(p).getAttribute("aria-pressed")];
+  got.spill = await p.evaluate(spill);
   // The Screen's Panel shows the Centre; closed, it stays closed until the Centre changes.
   const shown = await panel(p);
   await p.locator('aside.panel button[aria-label="Close panel"]').click();
@@ -281,7 +288,7 @@ async function changeView(b) {
 const CSS_ESCAPE = (s) => s.replace(/["\\]/g, "\\$&");
 const want = {
   enter: true, button: [true, "true"], panel: [true, null, true, true], recentre: true, back: true, forward: true, keyboard: [C, C],
-  wordStart: true, honest: true, esc: true, more: true, disabled: true, errors: [],
+  wordStart: true, honest: true, spill: 0, esc: true, more: true, disabled: true, errors: [],
   walk: [true, true, "10 steps", "1 of 10"], marks: [true, true, true, "⇄", true, true, ["~ Order", "− ReadWriter", "~ Repo.Get", "~ Repo.check"]],
   affected: true, step: [true, "2 of 10", true, true], near: ["– of 10", true], leave: [null, C, true], full: [A, 0, true],
   red: [true, 1, "violates zu.policy.yaml (levels or cycle)"], list: [C, "7 of 10"], host: "https://github.com/o/r/compare/b...h",
```

- [ ] **Run:** `cd web && npx vite build >/dev/null && cd e2e && node rail.mjs` Expected: FAIL (0/16 checks in each engine: no band is drawn, so the wait for its caption times out after 10 s)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: FAIL (57/59 checks in each engine: `spill = 5`, the fault of **Architecture 7**; `change = 17`, the two ovals gone from the canvas and no chip in their place)

- [ ] **Run:** `cd web/e2e && node screen.mjs` Expected: FAIL (24/25 checks in each engine: `spill = 4`)

- [ ] **Draw the rail, cue its lines in the legend, list "+N more" from its chip; give `pre.source`, not `.source`, the code panel's style**

`web/src/App.tsx`:

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index b5ccf3d..53569f0 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -33,15 +33,16 @@ const SCENES = 32; // 15: and scenes
 type LegendProps = {
   change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null;
   onDemand: boolean; // 11: lines show for a selected or hovered box
+  rail?: boolean; // 21: and for a chip on the rail
   hubs: boolean; // 11: some box is drawn as one of the most used
   screen?: boolean; // 18: the Screen: a Change View's marks and ghosts, red lines, no rows
 };
 
-function Legend({ change, policy, ranks, crap, proposal, onDemand, hubs, screen }: LegendProps) {
+function Legend({ change, policy, ranks, crap, proposal, onDemand, rail, hubs, screen }: LegendProps) {
   return (
     <div className="legend" aria-label="Legend">
       {!screen && <span className="rows">rows are dependency order: a box mostly uses the rows below it</span>}
-      {onDemand && <span className="dirs">hover or select a box for its lines: solid, it uses · dotted, used by</span>}
+      {onDemand && <span className="dirs">hover or select a box{rail && " or an external module"} for its lines: solid, it uses · dotted, used by</span>}
       {hubs && <span className="swatch hub">thick border: the {HUBS} most used</span>}
       {change && (
         <>
@@ -412,7 +413,8 @@ export function App({ view: whole, read }: { view: View; read?: Read }) {
             ranks={ranks}
             crap={crap}
             proposal={proposed === whole ? null : state.proposal}
-            onDemand={!sc.lines}
+            onDemand={!sc.lines || (sc.rail.length > 0 && state.edges !== "on")} // 21: the rail's lines wait for a hover
+            rail={sc.rail.length > 0}
             hubs={sc.nodes.some((n) => n.hub)}
           />
         )}
@@ -512,6 +514,7 @@ export function App({ view: whole, read }: { view: View; read?: Read }) {
           id={state.selected}
           edge={edge}
           bundles={sc.bundles}
+          holds={sc.rail.find((c) => c.id === sc.selected)?.holds}
           hidden={sc.nodes.find((n) => n.id === sc.selected)?.hidden}
           crap={sc.nodes.find((n) => n.id === sc.selected)?.crap?.risk}
           ownTier={sc.nodes.find((n) => n.id === sc.selected)?.ownTier}
```

`web/src/Canvas.tsx`:

```diff
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
index 82c0dc2..834d367 100644
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -14,6 +14,7 @@ import {
 } from "@xyflow/react";
 import { useEffect, useMemo, useRef, useState } from "react";
 import "@xyflow/react/dist/style.css";
+import { EXTERNALS } from "./bundle";
 import { edgeMark } from "./change";
 import { parentBox } from "./cut";
 import type { View } from "./data";
@@ -21,6 +22,7 @@ import { isGroup } from "./group";
 import { around } from "./edges";
 import { absolute, triangles, type Placed } from "./layout";
 import { crapGrade, crapLabel } from "./metrics";
+import { placeRail, RAIL, RAIL_CAPTION, type RailChip } from "./rail";
 import type { Scene, SceneEdge, SceneNode } from "./scene";
 import { mapByDefault, readableFit, reveal } from "./viewport";
 
@@ -144,12 +146,29 @@ function ContainerNode({ data, selected }: NodeProps<ZNode>) {
   );
 }
 
-function OvalNode({ data, selected }: NodeProps<ZNode>) {
+// RailBand frames the rail (21): its caption, under the boxes. It takes no
+// pointer (.zu-rail), so a click on it reaches the pane.
+function RailBand() {
   return (
-    <div className={cls("oval", data.node, selected)} title={data.node.id}>
+    <div className="rail">
+      <div className="caption">{RAIL_CAPTION}</div>
+    </div>
+  );
+}
+
+// ExtChip is an external module on the rail (21), with the files here that
+// import it, or "+N more", whose selection lists the modules it holds.
+function ExtChip({ data, selected }: NodeProps<Node<{ chip: RailChip }>>) {
+  const c = data.chip;
+  const more = c.id === EXTERNALS;
+  return (
+    <div
+      className={`node ext${more ? " more" : ""}${c.change ? ` ${c.change}` : ""}${selected ? " selected" : ""}${c.dim ? " dim" : ""}`}
+      title={more ? "More external modules: select to list them" : `${c.id}: imported by ${c.files} ${c.files === 1 ? "file" : "files"} here`}
+    >
       <Ends />
-      <div className="label">{data.node.label}</div>
-      <Marks data={data} />
+      <span className="label">{c.label}</span>
+      <span className="files">{c.files}</span>
     </div>
   );
 }
@@ -206,10 +225,11 @@ function ChipNode({ data, selected }: NodeProps<ZNode>) {
 const nodeTypes = {
   container: ContainerNode,
   box: BoxNode,
-  oval: OvalNode,
   outside: OutsideNode,
   decl: DeclNode,
   chip: ChipNode,
+  rail: RailBand,
+  ext: ExtChip,
 };
 
 type Props = {
@@ -242,8 +262,11 @@ function depth(nodes: Map<string, SceneNode>, id: string): number {
   return d;
 }
 
-export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onEdge, center, fit }: Props) {
+export function Canvas({ view, sc, placed: laid, edge, onSelect, onOpen, onToggle, onEdge, center, fit }: Props) {
   const byId = new Map(sc.nodes.map((n) => [n.id, n]));
+  // 21: the rail goes under the boxes as laid out; it is drawn, centred on
+  // and fitted as they are.
+  const placed = useMemo(() => new Map([...laid, ...placeRail(sc.rail, laid)]), [sc.rail, laid]);
   const rf = useReactFlow();
   const box = useRef<HTMLDivElement>(null);
   const target = center ? (sc.selected ?? drawnFor(view, byId, center.id)) : null;
@@ -307,8 +330,10 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
     if (v) void rf.setViewport(v);
   }, [rf, sc, placed]); // byId comes from sc
   // 11: while lines are on demand, a hovered box draws its own over the rest.
+  // 21: so does a hovered chip, and a box its lines to the rail, which wait
+  // for a hover or a selection even while the boxes' lines are drawn.
   const [hover, setHover] = useState<string | null>(null);
-  const nodes: ZNode[] = useMemo(() => [...sc.nodes]
+  const boxes: ZNode[] = useMemo(() => [...sc.nodes]
     .sort((a, b) => depth(byId, a.id) - depth(byId, b.id) || (a.id < b.id ? -1 : 1))
     .map((node) => {
       const p = placed.get(node.id) ?? { x: 0, y: 0, w: 90, h: 40 };
@@ -326,8 +351,16 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
         data: { node, w: p.w, h: p.h, row: sc.selectedRow, pick: onSelect, toggle: flip },
       };
     }), [sc, placed, onSelect, flip]); // byId comes from sc
+  const nodes: Node[] = useMemo(() => {
+    const at = (id: string) => {
+      const p = placed.get(id)!;
+      return { position: { x: p.x, y: p.y }, width: p.w, height: p.h, style: { width: p.w, height: p.h }, draggable: false, connectable: false };
+    };
+    const band = sc.rail.length > 0 ? [{ id: RAIL, type: "rail", ...at(RAIL), selectable: false, focusable: false, className: "zu-rail", data: {} }] : [];
+    return [...boxes, ...band, ...sc.rail.map((chip) => ({ id: chip.id, type: "ext", ...at(chip.id), selected: chip.selected, data: { chip } }))];
+  }, [boxes, sc.rail, placed]);
   const drawn = new Set(sc.edges.map((e) => e.id));
-  const hovered: SceneEdge[] = sc.lines || hover === null || hover === sc.selected ? []
+  const hovered: SceneEdge[] = hover === null || hover === sc.selected ? []
     : around(sc.all, hover, (id) => byId.get(id)?.parent ?? "").filter((e) => !drawn.has(e.id)).map((e) => ({ ...e, hot: true, dim: false }));
   const rfEdges: Edge[] = [...sc.edges, ...hovered].map((e) => {
     const m = edgeMark(e.status);
```

`web/src/Panel.tsx`:

```diff
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index 4196d43..12c38fe 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -18,6 +18,7 @@ type Props = {
   id: string | null;
   edge: SceneEdge | null;
   bundles: Bundle[]; // the scene's bundles: an aggregate's real targets come from them
+  holds?: Row[]; // 21: the modules "+N more" holds, from its chip: the weight filter hides none
   hidden?: ViewEdge[]; // 07: violating imports inside the selected box, drawn as no line
   crap?: Risk; // 08: the selected box's CRAP as the scene rolled it up
   ownTier?: number; // 12: the selected box's rank before the row cap merged its row
@@ -442,7 +443,7 @@ function Crap({ view, id, box, onReveal }: { view: View; id: string; box?: Risk;
   );
 }
 
-export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, lit, onReveal, onClose }: Props) {
+export function Panel({ view, id, edge, bundles, holds, hidden, crap, ownTier, read, lit, onReveal, onClose }: Props) {
   // 19: the row the reader points at lights its lines, over the Screen's line.
   const [over, setOver] = useState<{ id: string; places: Place[] } | null>(null);
   const places = over !== null && over.id === id ? over.places : (lit ?? null);
@@ -473,7 +474,7 @@ export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, li
     body = (
       <Rows
         title={id === OUTSIDE ? "Packages outside this box" : "External modules"}
-        rows={targets(bundles, id)}
+        rows={holds ?? targets(bundles, id)}
         onReveal={onReveal}
       />
     );
```

`web/src/styles.css`:

```diff
diff --git a/web/src/styles.css b/web/src/styles.css
index 7419165..08b5ae0 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -235,11 +235,54 @@ pre {
   color: var(--muted);
 }
 
-.node.oval {
+/* 21: the rail, a band under the boxes (rail.ts), and its chips, one per
+   external module, with the files that import it. The band takes no pointer:
+   a click on it reaches the pane. */
+.react-flow__node.zu-rail {
+  pointer-events: none;
+}
+.rail {
+  box-sizing: border-box;
+  width: 100%;
+  height: 100%;
+  border: 1px dashed var(--line);
+  border-radius: 8px;
+  background: var(--container);
+}
+.rail .caption {
+  font-size: 11px;
+  line-height: 18px;
+  padding: 0 8px;
+  color: var(--muted);
+  white-space: nowrap;
+}
+.node.ext {
+  display: flex;
+  gap: 6px;
+  align-items: center;
   background: var(--bg);
   border: 1px solid var(--box-border);
   border-radius: 999px;
-  text-align: center;
+  padding: 3px 8px;
+  line-height: 16px;
+  white-space: nowrap;
+  cursor: pointer;
+}
+.node.ext .files {
+  font-size: 11px;
+  font-weight: 400;
+  color: var(--muted);
+}
+.node.ext.more {
+  border-style: dashed;
+}
+/* A changed chip's border is 2 px (Change View): the padding gives the 1 px
+   back, so the chip keeps its height. */
+.node.ext.st-added,
+.node.ext.st-removed,
+.node.ext.st-modified,
+.node.ext.st-moved {
+  padding: 2px 7px;
 }
 
 .node.outside {
@@ -250,7 +293,7 @@ pre {
 
 /* 17: the Screen. A box's label is drawn at its Weight's size (screen.ts
    FONT), its package or module and what its Weight is made of under it; an
-   external is an oval, as in the tree; "+N more" is dashed. */
+   external is an oval; "+N more" is dashed. */
 .node.screen-box {
   background: var(--box);
   border: 1px solid var(--box-border);
@@ -367,8 +410,10 @@ pre {
   padding-left: 16px;
 }
 
-/* 19: the code scrolls on its own, so lighting a line moves no row of the panel */
-.source {
+/* 19: the code scrolls on its own, so lighting a line moves no row of the panel.
+   21: pre.source, not .source: React Flow's source handle has that class too,
+   and took this style, which put it in the flow above each node's text. */
+pre.source {
   position: relative;
   max-height: 60vh;
   background: var(--code-bg);
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `cd web && npx vite build >/dev/null && cd e2e && node rail.mjs` Expected: PASS (16 checks in each engine)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (59 checks in each engine)

- [ ] **Run:** `cd web/e2e && node screen.mjs` Expected: PASS (25 checks in each engine)

- [ ] **Commit:** `Draw the rail under the boxes, and keep React Flow's handles out of the code panel's style`

---

### Task 3: Acceptance

**Files:**
- Record: `docx/features/21-externals-rail/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `make build >/dev/null` Expected: PASS

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (59 checks in each engine)

- [ ] **Run:** `cd web/e2e && node place.mjs` Expected: PASS (9 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (11 checks in each engine)

- [ ] **Run:** `cd web/e2e && node screen.mjs` Expected: PASS (25 checks in each engine)

- [ ] **Run:** `cd web/e2e && node code.mjs` Expected: PASS (13 checks in each engine)

- [ ] **Run:** `cd web/e2e && node diffcode.mjs` Expected: PASS (17 checks in each engine)

- [ ] **Run:** `cd web/e2e && node rail.mjs` Expected: PASS (16 checks in each engine)

- [ ] **Measure** (by hand; not a replay step).
  1. Copy the Test Corpus's cobra, hugo and kubernetes clones out of `.zu/corpus/` (`cp -cR`). The corpus is read-only: never clone, edit or check out in it.
  2. Build `bin/zu` at this plan's base and at its last task, in two checkouts, and run `npm ci` in each one's `web/e2e`.
  3. In each copy, write a page with each build: `zu scan -out <copy>.ir.json -html <copy>.<build>.html .`
  4. For each build, run `node docx/features/21-externals-rail/measure.mjs <checkout> <page>@<focus>…` on the seven views: cobra's root; hugo's root, `github.com/gohugoio/hugo/hugolib` and `github.com/gohugoio/hugo/resources/images`; kubernetes' root, `k8s.io/kubernetes/cmd/kubelet/app` and `k8s.io/kubernetes/cmd/kubelet`.
  5. Record the table in `acceptance.md`, against the criteria under **Measurements**, set before the first run. The step passes when the table reproduces this plan's (geometry, zoom and lines exactly; layout within the 30 ms criterion, or an over-30 reading that three reruns of that view put under it) and its only failures are the three this plan names and its sign-off accepted: the share on five views, the zoom on hugo's and kubernetes' roots, and the lines at rest on `hugolib`.

- [ ] **The user's check** (by hand, in Chrome and in Safari; `zu serve` on hugo and on a repository of the user's own).
  1. Open hugo's root. Under the boxes is a band of 20 chips and "+59 more", each with a number. No chip's name is cut, and each box's name is at its top, its stats line under it.
  2. Point at a chip: its lines draw to the boxes that import it. Click it: the panel says "external module" and lists them. Click "+59 more": the panel lists the 59.
  3. Open `hugolib`: the rail is under its boxes and the boxes' lines are drawn. Press `f`: the boxes and the rail fit.
  4. Uncheck "externals": the rail goes and no box moves.
  5. Open the kubernetes root: the first view shows the boxes at the readable floor with the minimap, and at its foot the rail's caption and first two rows. Say whether the rail reads well there. (One chip past 20 would leave this view at the same zoom; on hugo's root it would trade the 20 names for a zoom of 1.2 rather than 1.11: Deviation 1.)

- [ ] **Commit:** `Record the Externals Rail's acceptance`

---

## Risks

- **Chip widths are estimated.** `chipSize` measures the label with `textWidth` (layout.ts), as a box's width is measured. A font that draws wider would cut a label. `rail.mjs`'s `clipped` checks its 23 chips in three engines, and the seven measured views cut none in Chromium. Safari is the user's check.
- **The roots zoom out** (Deviation 1). On kubernetes' root, the first view's boxes are at the readable floor, with the minimap. The first view shows the rail's caption and its first two rows, eleven of its 21 chips; the rest is a scroll or an `f` away.
- **The legend's cue can take a second line.** It adds about 117 px of text. With nothing selected, the legend wraps in windows narrower than about 1,000 px; without the cue it fit at 900. With the panel open (589 px at 1,400), it wraps on every view with a rail, at 1,400, 1,280 and 1,024. A second line takes 21 px from the pane. A view at 1.2 or at the floor keeps its zoom. hugo's root, between the two, opens about 3% smaller: 1.119 → 1.086 on a deep link that selects a chip (Chromium, 1,400). A click re-fits nothing, so selecting changes no zoom. This plan's figures, at 1,400 × 900 with nothing selected, do not move. Measured in scrutiny's re-check, on builds with and without the cue.
- **A rail line hides at rest** unless edges are `on`. A reader who wants a box's external modules points at it or selects it. Its panel lists them, as before.
- **Off-screen chips are not in the page.** `onlyRenderVisibleElements` leaves out nodes outside the viewport, as it leaves out boxes. A check that counts nodes must count what is in view: `accept.mjs` counts the boxes.
- **The checks wait fixed times,** as 17's to 20's do: 300 ms after a pointer move.
- **The snapshot is rewritten.** Task 1's `-u` step writes it and accepts whatever it writes, so no replay step can fail on it. Its changes are named under **Base**, and the replayed snapshot was compared with the scratch branch's by hand (**Replay record**).

## Notes

- **Task count: 3**, within Quick mode's limit.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given.
  - Task 1 is red on a missing module (`./rail`) and on assertions.
  - Task 2 is red in the browser, in all three engines.
- **The model never authors the graph.** A chip is an external node of the IR, and its number the sum of the IR's `count` on the imports drawn to it. Its label is cut from the module's path, and its place is computed from the boxes' layout. Nothing is inferred.
- **Output stays byte-identical.** No Go code changes, so the IR and the View `zu scan` writes are the same bytes. The rail's order is a total order (files, then id), and `placeRail` is a function of the chips and the layout.
- **Follow-ups, not in 21:**
  - grouping chips by owner, or by a Policy prefix;
  - a chip's triangle marks with edges off (Deviation 5);
  - the Type Map (22) and declared `model:` terms (23).

## Replay record

Replayed with `replay.py`, after scrutiny's fixes, on a fresh `git archive` of `main` at c7f9896, in a scratch directory. `node_modules` was clone-copied from the repository (`cp -cR`), and Playwright's three browsers were already installed. This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. The plan replayed differs from this one only in prose outside its code blocks and **Run** lines. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `cd web && npx vitest run` | 1 |
| 1 | green | `cd web && npx vitest run -u src/scene.snapshot.test.ts` | 0 |
| 1 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 2 | red | `cd web && npx vite build >/dev/null && cd e2e && node rail.mjs` | 1 |
| 2 | red | `cd web/e2e && node accept.mjs` | 1 |
| 2 | red | `cd web/e2e && node screen.mjs` | 1 |
| 2 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 2 | green | `cd web && npx vite build >/dev/null && cd e2e && node rail.mjs` | 0 |
| 2 | green | `cd web/e2e && node accept.mjs` | 0 |
| 2 | green | `cd web/e2e && node screen.mjs` | 0 |
| 3 | green | `make check` | 0 |
| 3 | green | `make build >/dev/null` | 0 |
| 3 | green | `cd web/e2e && node accept.mjs` | 0 |
| 3 | green | `cd web/e2e && node place.mjs` | 0 |
| 3 | green | `cd web/e2e && node serve.mjs` | 0 |
| 3 | green | `cd web/e2e && node screen.mjs` | 0 |
| 3 | green | `cd web/e2e && node code.mjs` | 0 |
| 3 | green | `cd web/e2e && node diffcode.mjs` | 0 |
| 3 | green | `cd web/e2e && node rail.mjs` | 0 |

- After Task 3, the replayed tree was byte-identical to the scratch branch's last commit in every source file (`diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output), the snapshot that `-u` wrote included (git tree 50ac176; 22 files change against the base).
- `golangci-lint run ./...` in the replayed tree: no issues. Task 3's `accept.mjs`, `place.mjs`, `serve.mjs`, `screen.mjs`, `code.mjs`, `diffcode.mjs` and `rail.mjs` passed 58, 9, 11, 25, 13, 17 and 16 checks in each engine. The replay shows WebKit's, each script's last line, except where a build's or a server's log came last; all seven were run again in the replayed tree after it, and passed in all three engines.
- The red reasons were seen as stated, on the scratch branch's red commits, since `replay.py` prints only each step's last line:
  - Task 1: 19 tests in 7 files (the replay counts 20 errors: the 19, and `rail.test.ts`, which cannot load).
  - Task 2: `rail.mjs` 0/16, `accept.mjs` 56/58 (`spill = 5`, `change = 17`) and `screen.mjs` 24/25 (`spill = 4`), in each engine.
- **Again on 2026-10-27,** on a fresh `git archive` of `main` at 56b10c4 with the banner fix of v0.1.1 applied (`release/0.1`, 71b17e0: a check in `accept.mjs` and the `.proposal-banner` rule in `styles.css`), which `main` now carries: all 19 steps exited as in the table. `accept.mjs` counted one check more: its last line, WebKit's, read 57/59 at Task 2's red step and 59/59 at each green one. The counts above are the first replay's.
- Toolchain: Go 1.24.5, Node 24.17.0, Python 3.11.17, macOS on an Apple M2.
