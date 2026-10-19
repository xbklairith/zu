# 18 · The Screen in a Change View — Plan

**Status:** APPROVED 2026-10-20 (lead, after scrutiny-18, one revision and the replay; advisor sign-off). Held: it queues behind 16 and 17, which are approved and held; zu builds them in order 16, 17, 18, and builds any only when the user says go.

**Base.** Every diff here is against `main` at c6f85b7 with 16's and 17's plans applied, in that order. c6f85b7 differs from a18ff85 only by 17's plan documents. The diffs come from a scratch branch whose first commit is that tree: a `git archive` of a18ff85 with 16's and 17's tasks applied. After it come one commit per red step and one per green step. The plan was replayed on a fresh `git archive` of c6f85b7, after 16's and 17's replays (**Replay record**). Once 16 and 17 land, replay this plan again on `main` (**Overlap with 16 and 17**).

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 17's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Until 16 and 17 land, replay all three plans in order, from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/16-fast-rescan/replay.py docx/features/16-fast-rescan/plan.md "$S" \
  && python3 -u docx/features/17-screen/replay.py docx/features/17-screen/plan.md "$S" \
  && python3 -u docx/features/18-change-screen/replay.py docx/features/18-change-screen/plan.md "$S"; rm -rf "$S"
```

Once they have landed, drop the 16 and 17 lines.

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Task 5's `make check`, and 16's and 17's);
- Playwright's three browsers (Tasks 4 and 5).

`measure.mjs`, beside this plan, times the walk on real Change View pages (**Measurements**). It is not a replay step.

---

## Goal

Draw the Screen (17) in a Change View, and walk the change with it. The view-model round of 2026-10-19 decided the frame; the user accepted every recommended answer:
- **Q1:** a Change View still opens on the tree (B5). `n` starts a walk through the change, in the decided reading order (decisions.md, **Change reading order**). Each step is a Screen.
- **Diff stays a layer over every lens.** On the Screen:
  - each box is marked by its Change Status, and each line by its edges';
  - a line holding an import the Policy forbids is red, as on the tree;
  - a reversed import's old direction is drawn as a ghost;
  - the Centre lists its changed members, signed + ~ − →;
  - the header says where the Centre sits in the Affected Set (ADR 0009).
- **One hop of unchanged neighbours** (decisions.md, **Diff base**) is drawn on the Screen. The export gains a `near` section for it; the tree is unchanged.

A reader opens the page and presses `n`. store's Screen is drawn, with "1 of 10" in the walk toolbar. `n` goes on through store's changed declarations, then money's package and its declarations, and so on to the end; `p` and the browser's Back go back. A click on any box re-centres, as in 17. `n` then goes on from that box's package.

## Architecture

**1. The export keeps the Screen's unchanged neighbours (`internal/export/change.go`).** A Change View draws only what changed: every package and external, and the changed declarations of changed packages. A declaration's Screen there would show only changed callers and callees. `Change` now also writes `near`, which holds:
- each declaration of head one call or embed from a drawn declaration, and the type it belongs to;
- every method of a type on the page (drawn or near), so a type's Screen counts all its methods' calls;
- the calls and embeds between nodes on the page that `Edges` does not hold (a near type's embed of an external among them), with their Change Status: head's, plus base's removed ones.

Base's removed calls and embeds count as hops too, so a removed declaration's callees that head still has are near. A Move's source is in no tree the page draws, so an edge to it is left out.

`offIn` and `offOut` (17) are now set in a Change View too, counted against drawn and near declarations: a call or embed with one end off the page counts on the other end. A drawn declaration's neighbours are all near, so only near declarations carry counts.

`near` is sorted like `nodes` and `edges` (byte-identical output for the same change), and written only when it has nodes. `Nodes` and `Edges` are unchanged, so the tree, the Panel's tree lists, the Structural Summary and every `zu diff` output stay as they are. The IR is untouched. In the shop Change View golden, `near` holds Cart (it embeds the modified Order), Reader (the removed ReadWriter embedded it) and Repo.Reset (Repo has changed methods), with their two embeds.

**2. The Screen reads a Change View (`web/src/screen.ts`).**
- **`screenView(view)`** is the View a Screen reads: a Change View's nodes and edges with `near`'s, merged once per View (a WeakMap); any other View as it is. `centreOf`, `screenOf`, `leave` and the walk read it. The tree never does.
- **`centreOf`** now names a Centre in a Change View: a changed, removed or near declaration, a package, an external, and a method's type. A Move's source is no node of the View, so it names none.
- **Status rows.** Each box gets a `mark`:
  - its node's mark as the tree draws it (`change.ts` `nodeMark`: `st-added`, `st-removed`, `st-modified`, `st-moved`, `affected`);
  - or `has-change` for a type with a changed method, as the tree marks a box with changes inside;
  - or none: unchanged boxes are drawn plain (Deviation 1).

  Each box's line gets the `status` its edges share, or `mixed` (`bundle.ts` `statusOf`, as the tree's bundles). It is drawn with the tree's edge classes and sign: + added, − removed, ⇄ reversed, ± mixed.
- **Ghosts.** The diff reports a reversed import once, in head's direction (`a → b`). The View never holds base's `b → a`. So a reversed line's far end is also drawn as a **ghost** in the opposite row: where it was in base.
  - On money's Screen, store is below (money imports store now) and its ghost is above (store imported money in base).
  - A ghost is small and plain, after the row's boxes and never capped. Its facts read "⇄ in base", and its box and line are dotted. Its line has no sign; the real line carries ⇄.
  - A ghost is a box like any other: a click re-centres on its node.
- **Violations.** A box's line also carries `violation` when one of its edges is an import the Policy forbids. `export.Mark` sets an edge's `violation` in a Change View as in a Project View (06), and a Proposal's View sets it for its layers (07). The line is drawn red with the tree's `pinned` class. A ghost's line never is: it is base's import. This holds on every Screen, a Project View's too, so the walk's first step, a new violation's importer, shows the line that breaks the rule.
- **The Centre** (`CentreChange`, a Change View's only):
  - **its mark**, as a box's;
  - **its changed members**, by id: a package lists its changed declarations, a type its changed methods. Each is signed + added, ~ modified, − removed or → moved. The Centre lists 8 (`MEMBER_CAP`), then "+N more";
  - **its package's hop** in the Affected Set (absent when it is not in it), and for a changed package, its **reach**: how many packages import it, directly or not, over head's imports (removed imports are base's).
- **`screenNote`** adds the Affected Set, for every Centre but an external:
  - "Affected Set: changed; 4 packages import it, directly or not." (or "no package imports it");
  - "Affected Set: 1 import from a changed package.";
  - "Affected Set: not in it.";
  - "Affected Set: removed, so not in it (the Affected Set is head's).", for a Centre in a removed package (marked removed, with no hop);
  - a declaration Centre reads "Affected Set (its package): …".

  At declaration grain, what the Screen leaves out now reads "with unchanged declarations more than one call or embed from the change", since `-include` does not apply to a Change View.

**3. The walk (`web/src/walk.ts`).**
- **`walkOf(view)`** is the walk's Centres, in the decided reading order:
  1. each new violation's importer (`violations.new`, in the order the export writes it);
  2. then the changed packages bottom-up (`view.changed`, the Structural Summary's order).

  Each package is followed by its changed declarations' Centres, by id. A changed method's Centre is its type, so Repo.Get and Repo.check are one step, Repo. Each Centre is visited once. A Project View's walk is empty. On the shop Change View it is the ten steps store, store.Order, store.ReadWriter, store.Repo, money, money.Plus, checkout, checkout.Total, shop, shop.main.
- **`step(view, s, ±1)`** moves the Centre one step (`centreAt`, so the next Screen's rows are capped again).
  - From the tree, `n` starts the walk at its first step. `p` on the tree, and either key at the walk's ends, returns `s` unchanged.
  - A Centre off the walk (a near box, or a box the reader clicked) steps from its package's place: `n` goes to the package's next step, `p` to the package. A Centre whose package is not on the walk (an external, an unchanged package) steps as from the tree.
- **`walkAt(view, centre)`** is `{ at, of }`: the Centre's step from 1, or null off the walk, and the walk's length.

**4. Keys and the page.**
- **`keys.ts`:** `n` and `p` map to `next` and `previous` in a Change View, on the tree and on the Screen. They do nothing in a Project View, while typing, or with Meta, Ctrl or Alt.
- **`App.tsx`:**
  - The Lens toolbar (the Screen button, "every box") now shows in a Change View too.
  - A walk toolbar sits beside it, labelled "Walk the change": ◂, then "3 of 10" on a Screen ("– of 10" off the walk) or "10 steps" on the tree, then ▸. A button is disabled where its step does nothing.
  - The Legend on a Change View's Screen keeps the change swatches and adds the ghost's: "dotted: where a reversed import was in base". The signs line reads "lines: …", and the tree's rows line is left out.
  - When a Screen line is red, the Legend (on any Screen) adds the red swatch. It reads "violates zu.policy.yaml (levels or cycle)", or the Proposal's layers, without the tree's "a red box holds one": the Screen draws no box red (`headline.ts` `redLegend(proposal, screen)`).
  - The Screen's Panel reads `screenView`, so a near Centre gets a Panel.
- **`lens.ts`:** leaving a near Centre selects its package, since the tree does not draw near boxes. When that package is outside the changed subgraph the tree draws, the page first opens the full graph (U10), as a jump to such a node does.
- **`ScreenCanvas.tsx`** draws each box's mark class and `ghost`, the Centre's members, and each line's status class, sign, `ghost`, and `pinned` for a violation.
- **`styles.css`:** the changed subgraph dims its affected boxes to 0.6 (`.subgraph .node.affected`). The rule now leaves out `.screen-box`, so an affected Screen box keeps its outline and is not dimmed (Deviation 1).
- **History** is 17's: each step changes the Centre, so it adds an entry, and Back walks back.

## Overlap with 16 and 17

18 is built on both. They land first, in order 16, 17, 18, and each is replayed on `main` after its predecessor lands.
- **17:** 18 changes most of 17's new code:
  - `screen.ts`, `lens.ts`, `keys.ts`, `scene.ts` (a comment), `ScreenCanvas.tsx`, `App.tsx` and `styles.css`;
  - `internal/export/view.go` and `web/src/data.ts`, where 17 added `offIn` and `offOut`;
  - their tests, with `proposal.test.ts` and `state.test.ts`;
  - `web/e2e/screen.mjs`.

  17's "Change View: no Screen" check in `screen.mjs` is replaced by 18's checks, and 17's `centreOf` test that a Change View centres nothing is turned round.
- **16:** 16 changes `internal/export/change.go`: `hunksOf` reads a listed file deleted mid-rescan as empty. 18's Task 1 diff of `change.go` is against 16's version. 16 changes no golden; 18 changes `shop.change.golden.json`, which no plan before it touches.
- **Files neither 16 nor 17 touches:** `internal/export/change_test.go`, `web/src/headline.ts` and `headline.test.ts` (`redLegend`), and `web/src/walk.ts` and `walk.test.ts` (new).

## Out of scope

- **The Code panel (19):** edge-line highlighting, syntax colour, the declaration diff with base spans, and on-demand source in `zu serve`.
- **Golden walks** (a scripted tour of Screens), after 19.
- **Near neighbours on the tree.** The tree still draws only what changed, so B5's changed subgraph is unchanged.
- **Fixed violations in the walk**, a jump to step N, and a walk in a Project View.
- **Dimming unchanged boxes** (Deviation 1).

## Deviations and decisions for review

1. **Unchanged neighbours are drawn plain, not dimmed** (decisions.md, **Diff base**: "one hop of unchanged neighbours, dimmed"). Changed boxes carry their marks, so unchanged ones already read as background, as unchanged boxes do on the tree. Dimming them would also blur two things the Screen keeps apart:
   - a ghost is muted and dotted;
   - every Screen label stays at the readable floor (17's Deviation 4).

   The changed subgraph's rule that dims the tree's affected boxes no longer reaches a Screen box. The proposed amendment drops "dimmed" (**Doc amendments**).
2. **The Affected count is in the header's note, not beside the row above** (the view-model page put it "beside the dependents row"). 17 put the unresolved-call count (ADR 0002) in the same note: the header is where a Screen says what it leaves out and how far it reaches. On the canvas, a count beside a row would be one more box to place at every zoom.
3. **The members are a list, not counts.** The Centre names up to 8 changed members with their signs, then "+N more". A list says which ones changed; counts would say only how many, and a box with "~3 −1" still sends the reader to the Panel. The Structural Summary keeps its counts.
4. **The Screen's Panel reads `screenView`.** For a declaration, its calls lists can therefore be longer than the tree's Panel shows for the same id: they include near calls. A package's Panel is unchanged, since `near` holds no imports.
5. **A ghost's line is dotted and unsigned.** The real line carries ⇄; a second ⇄ would read as two reversals. A ghost is never capped, and it joins its row's width. A row it widens past the canvas opens at 17's floor zoom with the Centre in the middle, as any wide row does. On the shop Change View that happens on money's Screen with the Panel open.
6. **The walk goes on from where the reader is.** After a click off the walk, `n` goes on from the clicked box's package, not from the last step. The toolbar reads "– of 10" there, and ◂ ▸ stay usable.
7. **`n` on the tree starts the walk, and `p` on the tree does nothing.** Both keys work on the tree and on the Screen. `n` is new on the tree; `p` there would mean "the walk's last step", which no reader starting a review wants.
8. **The Lens toolbar now shows in a Change View.** 17 hid it there, since a Change View had no Screen.
9. **Each step adds a history entry** (17's Deviation 1): a step changes the Centre. Back walks back step by step; Esc or `s` returns to the tree in one.
10. **Leaving a near Centre selects its package**, and may open the full graph. The tree does not draw near boxes; their package is the nearest box it does draw.
11. **Two red steps fail before an assertion runs.** Task 1 fails to build (`v.Near` is undefined). Task 3 fails on the missing module `./walk`, besides its two assertions.
12. **A violating line is red on every Screen, a Project View's too.** 17 drew no line red. The walk starts at a new violation's importer, so 18 needs the line, and a Project View with a Policy has the same edges marked. The tree pins violations red in both views, so the Screen follows it. The Legend shows on a Project View's Screen only when a line is red.

## Measurements

`measure.mjs` ran on Change View pages written by the scratch branch's `bin/zu`, from `zu diff HEAD~N -max-parse-errors 1000000 -html <scratch>/<name>.html` run inside each Test Corpus clone. Those clones were deepened by `scripts/bench-corpus.sh`, so HEAD~50 is reachable. The corpus was only read: `git status --porcelain` was empty in all three clones before and after.

**Page size.** `near` against 17's page for the same change, written by 17's scratch `bin/zu`:

| Change | Changed packages | Drawn declarations | Near nodes | Near edges | `near` bytes | Page | Against 17 |
|---|---|---|---|---|---|---|---|
| cobra HEAD~10 | 2 | 3 | 153 | 174 | 57,201 | 2,075,267 | +3.1% |
| hugo HEAD~10 | 5 | 15 | 114 | 84 | 44,933 | 2,327,986 | +2.2% |
| kubernetes HEAD~10 | 2 | 1 | 10 | 16 | 5,935 | 8,253,050 | +0.1% |
| hugo HEAD~50 | 35 | 140 | 756 | 426 | 261,196 | 3,230,204 | +9.0% |
| kubernetes HEAD~50 | 52 | 186 | 653 | 884 | 422,385 | 17,588,179 | +2.5% |

cobra's 153 near nodes for 3 drawn declarations come from the method rule: `cobra.Command` is on the page, and all its methods with it (**Risks**). `zu diff HEAD~50 -html` on kubernetes took 5.07–5.39 s against 17's 5.27–5.65 s, over three runs each: no measurable cost.

**Times.** The browser was 1,400 × 900, on an Apple M2 (8 cores) shared with other sessions. Times are in-page, in ms: from the key until the walk reads the new step and the new Centre's box is in the DOM, then two frames. Each cell is the median / worst over the first 12 steps (3 on cobra, whose walk has 4).
- **Enter:** `n` on the tree, to step 1.
- **Step:** `n` from step 1 on, with the Panel open.
- **Back:** the browser's Back over those steps.
- **Panel closed:** the same steps, closing the Panel before each. The Panel opens again on each new Centre (17's Deviation 5), so this column measures mounting the Panel rather than updating it, not a Screen with no Panel.
- **Tree Panel:** on the tree, the Panel moving to those steps' Centres (a hash change), for comparison.

Pass criteria, set before the run as 17's were:
- enter under 200 ms;
- step and Back medians under 100 ms;
- no page errors in any engine.

| Page | Walk | Engine | Enter | Step | Back | Panel closed | Tree Panel |
|---|---|---|---|---|---|---|---|
| cobra HEAD~10 | 4 | chromium | 17 | 29 / 59 | 30 / 48 | 51 / 55 | 28 / 62 |
| | | firefox | 41 | 39 / 62 | 46 / 47 | 55 / 61 | 46 / 76 |
| | | webkit | 81 | 60 / 127 | 60 / 126 | 89 / 105 | 46 / 145 |
| hugo HEAD~50 | 126 | chromium | 36 | 20 / 37 | 28 / 30 | 21 / 24 | 31 / 38 |
| | | firefox | 49 | 34 / 41 | 45 / 64 | 33 / 54 | 43 / 171 |
| | | webkit | 88 | 59 / 78 | 58 / 74 | 56 / 73 | 78 / 129 |
| kubernetes HEAD~50 | 164 | chromium | 54 | 34 / 65 | 35 / 62 | 30 / 64 | 62 / 84 |
| | | firefox | 109 | 60 / 112 | 57 / 103 | 45 / 83 | 70 / 117 |
| | | webkit | 119 | 48 / **162** | 63 / **159** | 76 / **151** | 145 / 184 |

Every criterion holds: enter takes 17–119 ms, the step and Back medians 20–63 ms, and no engine reported a page error.

The criteria bound medians, not worst cases. Eight worst cases exceed 100 ms:
- Step: 112 (Firefox) and 162 ms (WebKit) on kubernetes, and 127 ms (WebKit) on cobra.
- Back: 103 (Firefox) and 159 ms (WebKit) on kubernetes, and 126 ms (WebKit) on cobra.
- Panel closed: 151 ms (WebKit) on kubernetes, and 105 ms (WebKit) on cobra.

17's 100 ms bar was for a re-centre with the Panel closed (22–78 ms there), so only the last two compare with it. They are the Panel's source pane, not the Screen:
- Step by step, the slow steps land on declaration Centres whose files are long. `resource/v1.DeviceCounterConsumption` is in `types.go` (2,655 lines), and `Validate_DeviceCounterConsumption` in `zz_generated.validations.go` (3,348 lines). Their Screens have 4 and 10 boxes. In a per-step run of the same walk with the Panel closed first, they took 115–130 ms in WebKit, while package Screens of 26–36 boxes took 57–84 ms.
- On the tree, the Panel moving to those same declarations took 145, 160 and 177 ms in WebKit, with no Screen at all.

These runs predate the scrutiny fixes (**Notes**). The fixes change no Go code, so the pages are the same; on the Screen they add one flag per line and a CSS selector, and were not re-measured.

The pages, scripts and raw output stay in the session's scratch directory; they are not committed.

## Doc amendments (exact text; not task steps)

These follow 17's amendments, which land first.

**`docx/glossary.md`, two new entries after Weight (17's):**

> ## Walk
>
> The way through a Change View one Screen at a time (18), in the decided reading order: each new violation's importer, then the changed packages bottom-up, each followed by the Centres of its changed declarations (a changed method's Centre is its type). `n` takes the next step and `p` the previous one, on the tree or a Screen; from the tree, `n` starts at the first. A Centre off the walk steps on from its package's place. Each step is a browser history entry.
>
> ## Ghost
>
> On a Screen in a Change View (18), where a reversed import's far end was in base: the box drawn dotted and plain in the row opposite its real one, its line dotted and unsigned, its facts "⇄ in base". The diff reports a reversed import once, in head's direction, so the ghost is how the Screen shows the old direction.

**`docx/glossary.md`, Change View.** Replace its third sentence, "New rule violations are called out, the Affected Set is outlined, Moves are dashed, and unchanged neighbours one hop away are dimmed.", with:

> New rule violations are called out, the Affected Set is outlined, and Moves are dashed. Its Screens (18) also draw the unchanged declarations one call or embed from the change.

**`docx/core/decisions.md`, Diff base.** Replace "the Change View shows one hop of unchanged neighbours, dimmed." with:

> the Change View's Screens show one hop of unchanged neighbours, plain (18: the export's `near`; the tree draws only what changed).

**`docx/core/decisions.md`, line 41 (UI v1).** Append to the end of the bullet, after 17's **Screen (17)** text:

> **Screen in a Change View (18):** a Change View opens on the tree, and `n` starts the Walk: each new violation's importer, then the changed packages bottom-up, each followed by the Centres of its changed declarations; `p` steps back, and a walk toolbar shows ◂ "3 of 10" ▸. A Screen there reads the View with `near`: the unchanged declarations of head one call or embed from a drawn one (removed calls count, from base), their types, and every method of a type on the page, with the calls and embeds among them all; the tree never reads it. Each box carries its Change Status mark (a type with a changed method: has-change), each line its edges' status and sign (+ − ⇄ ±), and unchanged boxes are plain. A reversed import's far end is drawn in its row and as a Ghost in the other, small, dotted, uncapped. The Centre lists its changed members by id, signed + ~ − →, eight and then "+N more". The header adds where the Centre's package sits in the Affected Set (ADR 0009): changed, with how many packages import it, directly or not; N imports from a changed package; not in it; or removed. A line holding an import the Policy forbids is red on every Screen, as on the tree, and the walk's first steps are the new violations' importers. Leaving a near Centre selects its package and opens the full graph when the changed subgraph leaves that package out.

**`docx/core/decisions.md`, 17's Screen (17) text.** 18 makes three of its phrases untrue:
- delete "; `n` is kept for 18" from "the tree's `d`, `+` and `-` do nothing on it; `n` is kept for 18." (`n` and `p` are the walk's keys now);
- delete the sentence "A Change View has no Screen until 18.";
- replace "with declarations in packages not included (the View's `offIn` and `offOut`, on types and functions only)" with:

> with declarations in packages not included, or in a Change View with unchanged declarations more than one call or embed from the change (the View's `offIn` and `offOut`, on types and functions only)

**`docx/core/requirements-draft.md`:** no new row. B3 ("call out a reversed dependency explicitly") and B4 (hop distance) gain the Screen as a second place they are met; U14 (17) covers the Screen.

## Tasks

### Task 1: The export keeps the Screen's unchanged neighbours (`export`)

`TestChangeNear` builds three Change Views of the shop fixture. In each, it checks near's nodes and edges in order, and every (offIn, offOut) count:
- **shop** (the golden's change):
  - nodes: `checkout.Cart`, which embeds the modified Order; `store.Reader`, which the removed ReadWriter embedded; `store.Repo.Reset`, a method of Repo, which has changed methods;
  - edges: Cart embeds Order (unchanged), and ReadWriter embeds Reader (removed);
  - offs: Reset (0, 1), because it calls `store.Open`, two calls from the change.
- **A changed function** (`store.Open` builds its Repo with a hook):
  - nodes: Open's caller `checkout.Place`, Reset (Open's other caller) with its type Repo, and Repo's other methods Get and check;
  - edges: Place → Open, Repo embeds `lib/pq`, Get → check, and Reset → Open;
  - offs: Place (0, 1) and check (0, 1).
- **A changed method** (`store.Repo.check` swaps `money.Add`'s arguments):
  - nodes: its callee `money.Add`, its caller `Repo.Get`, and Repo's other method Reset;
  - edges: Get → check, and check → Add;
  - offs: Add (1, 0) and Reset (0, 1).

In every case:
- no near node has a status;
- no near node is also in `Nodes`;
- every drawn node's counts are (0, 0).

`TestChangeNearIsSorted` builds one change five times and checks the JSON is byte-identical.

**Files:**
- Tests: `internal/export/change_test.go`
- Code: `internal/export/change.go`, `internal/export/view.go`, `web/src/data.ts`, `internal/export/testdata/shop.change.golden.json`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/internal/export/change_test.go b/internal/export/change_test.go
index 0b096fd..f294f15 100644
--- a/internal/export/change_test.go
+++ b/internal/export/change_test.go
@@ -229,3 +229,127 @@ func TestChangeHunksOfModifiedMethod(t *testing.T) {
 		t.Errorf("no hunk adds r.hook() in %s: %+v", get.Loc.Path, v.Hunks[get.Loc.Path])
 	}
 }
+
+// changeWith builds the Change View of the shop fixture against a copy with
+// each {file, old, new} edit made.
+func changeWith(t *testing.T, edits ...[3]string) *View {
+	t.Helper()
+	base, baseTree := scanTree(t, shopCopy(t), strings.Repeat("b", 40))
+	h := shopCopy(t)
+	for _, e := range edits {
+		edit(t, h, e[0], e[1], e[2])
+	}
+	head, headTree := scanTree(t, h, strings.Repeat("h", 40))
+	v, err := Change(base, head, diff.Compare(base, head), diff.Summarize(base, head), baseTree, headTree)
+	if err != nil {
+		t.Fatal(err)
+	}
+	return v
+}
+
+// TestChangeNear pins 18's unchanged neighbours: the declarations one call or
+// embed from a drawn one, and every method of a type on the page, with the
+// calls and embeds among them and the off-page counts. Nodes and Edges stay
+// as the tree draws them.
+func TestChangeNear(t *testing.T) {
+	const s = "example.com/shop/internal/"
+	type off struct{ in, out int }
+	for _, c := range []struct {
+		name  string
+		v     func(t *testing.T) *View
+		nodes []string
+		edges []string // kind from to status
+		offs  map[string]off
+	}{
+		{
+			// Cart embeds the modified Order; the removed ReadWriter embedded
+			// Reader; Reset is a method of Repo, drawn for its changed methods.
+			name: "shop", v: func(t *testing.T) *View { v, _ := changeView(t); return v },
+			nodes: []string{s + "checkout.Cart", s + "store.Reader", s + "store.Repo.Reset"},
+			edges: []string{
+				"embeds " + s + "checkout.Cart " + s + "store.Order ",
+				"embeds " + s + "store.ReadWriter " + s + "store.Reader removed",
+			},
+			offs: map[string]off{s + "store.Repo.Reset": {0, 1}},
+		},
+		{
+			// Open's callers, Reset's type and that type's other methods.
+			name: "a changed function", v: func(t *testing.T) *View {
+				return changeWith(t, [3]string{"internal/store/store.go", "return &Repo{cache: map[int]Order{}}", "return &Repo{cache: map[int]Order{}, hook: func() {}}"})
+			},
+			nodes: []string{s + "checkout.Place", s + "store.Repo", s + "store.Repo.Get", s + "store.Repo.Reset", s + "store.Repo.check"},
+			edges: []string{
+				"calls " + s + "checkout.Place " + s + "store.Open ",
+				"embeds " + s + "store.Repo github.com/lib/pq ",
+				"calls " + s + "store.Repo.Get " + s + "store.Repo.check ",
+				"calls " + s + "store.Repo.Reset " + s + "store.Open ",
+			},
+			offs: map[string]off{s + "checkout.Place": {0, 1}, s + "store.Repo.check": {0, 1}},
+		},
+		{
+			// check's caller and callee, and its type's other method.
+			name: "a changed method", v: func(t *testing.T) *View {
+				return changeWith(t, [3]string{"internal/store/store.go", "money.Add(o.Total, money.Zero)", "money.Add(money.Zero, o.Total)"})
+			},
+			nodes: []string{s + "money.Add", s + "store.Repo.Get", s + "store.Repo.Reset"},
+			edges: []string{
+				"calls " + s + "store.Repo.Get " + s + "store.Repo.check ",
+				"calls " + s + "store.Repo.check " + s + "money.Add ",
+			},
+			offs: map[string]off{s + "money.Add": {1, 0}, s + "store.Repo.Reset": {0, 1}},
+		},
+	} {
+		t.Run(c.name, func(t *testing.T) {
+			v := c.v(t)
+			if v.Near == nil {
+				t.Fatal("no near")
+			}
+			var nodes, edges []string
+			for _, n := range v.Near.Nodes {
+				nodes = append(nodes, n.ID)
+				if n.Status != "" || n.MovedFrom != "" {
+					t.Errorf("near %s has a status: %+v", n.ID, n)
+				}
+				if nodeByID(v, n.ID) != nil {
+					t.Errorf("near %s is also in Nodes", n.ID)
+				}
+				if got := (off{n.OffIn, n.OffOut}); got != c.offs[n.ID] {
+					t.Errorf("near %s: off in, out = %v, want %v", n.ID, got, c.offs[n.ID])
+				}
+			}
+			for _, e := range v.Near.Edges {
+				edges = append(edges, e.Kind+" "+e.From+" "+e.To+" "+e.Status)
+			}
+			if !slices.Equal(nodes, c.nodes) {
+				t.Errorf("near nodes = %q, want %q", nodes, c.nodes)
+			}
+			if !slices.Equal(edges, c.edges) {
+				t.Errorf("near edges = %q, want %q", edges, c.edges)
+			}
+			for _, n := range v.Nodes {
+				if n.OffIn != 0 || n.OffOut != 0 {
+					t.Errorf("drawn %s: off in, out = %d, %d; its neighbours are all near", n.ID, n.OffIn, n.OffOut)
+				}
+			}
+		})
+	}
+}
+
+// TestChangeNearIsSorted: near is built from maps, and the same change writes
+// the same bytes.
+func TestChangeNearIsSorted(t *testing.T) {
+	edit := [3]string{"internal/store/store.go", "return &Repo{cache: map[int]Order{}}", "return &Repo{cache: map[int]Order{}, hook: func() {}}"}
+	a, err := json.Marshal(changeWith(t, edit))
+	if err != nil {
+		t.Fatal(err)
+	}
+	for range 4 {
+		b, err := json.Marshal(changeWith(t, edit))
+		if err != nil {
+			t.Fatal(err)
+		}
+		if !bytes.Equal(a, b) {
+			t.Fatal("two builds of one change wrote different bytes")
+		}
+	}
+}
```

- [ ] **Run:** `go test ./internal/export -run 'TestChangeNear'` Expected: FAIL (`v.Near undefined (type *View has no field or method Near)`: the build fails)

- [ ] **Keep the unchanged declarations one call or embed from the change, and count the rest**

The golden's new `near` section is what `go test ./internal/export -run TestChangeGolden -update` writes. Review the diff.

```diff
diff --git a/internal/export/change.go b/internal/export/change.go
index 966fec1..1744ab6 100644
--- a/internal/export/change.go
+++ b/internal/export/change.go
@@ -136,23 +136,90 @@ func Change(base, head *ir.IR, delta diff.Delta, sum *diff.Summary, baseTree, he
 	for _, e := range delta.Edges {
 		edgeStatus[edgeKey{string(e.Kind), e.From, e.To}] = e.Status
 	}
-	// Imports join packages and externals, which are all drawn; calls and
-	// embeds are kept only between drawn declarations.
-	keep := func(e *ir.Edge) bool { return in[e.From] && in[e.To] }
+	statusOf := func(e *ir.Edge) diff.Status { return edgeStatus[edgeKey{string(e.Kind), e.From, e.To}] }
+	removed := func(e *ir.Edge) bool { return statusOf(e) == diff.Removed }
+
+	// 18: the Screen's unchanged neighbours (decisions.md: one hop of
+	// unchanged neighbours): each declaration of head one call or embed from
+	// a drawn one, with its type, and every method of a type on the page, so
+	// a type's Screen counts all its methods' calls. A Move's source is in no
+	// tree the page draws, so an edge to it is left out.
+	decl := map[string]bool{} // the declarations on the page
+	for _, n := range v.Nodes {
+		decl[n.ID] = n.Kind == string(ir.KindType) || n.Kind == string(ir.KindFunction)
+	}
+	near := map[string]*ir.Node{}
+	on := func(id string) bool { return in[id] || near[id] != nil }
+	pull := func(id string) {
+		for n := headByID[id]; n != nil && isDecl(n) && !on(n.ID); n = headByID[n.Parent] {
+			near[n.ID] = n
+		}
+	}
+	calls := func(e *ir.Edge) bool { return e.Kind != ir.EdgeImports }
 	for i := range head.Edges {
-		if e := &head.Edges[i]; keep(e) {
-			ve := toEdge(e)
-			ve.Status = string(edgeStatus[edgeKey{string(e.Kind), e.From, e.To}])
-			v.Edges = append(v.Edges, ve)
+		if e := &head.Edges[i]; calls(e) && decl[e.From] != decl[e.To] {
+			pull(e.From)
+			pull(e.To)
 		}
 	}
 	for i := range base.Edges {
-		e := &base.Edges[i]
-		if edgeStatus[edgeKey{string(e.Kind), e.From, e.To}] == diff.Removed && keep(e) {
-			ve := toEdge(e)
-			ve.Status = string(diff.Removed)
+		if e := &base.Edges[i]; calls(e) && removed(e) && decl[e.From] != decl[e.To] {
+			pull(e.From)
+			pull(e.To)
+		}
+	}
+	for i := range head.Nodes {
+		if n, p := &head.Nodes[i], headByID[head.Nodes[i].Parent]; isDecl(n) && p != nil && p.Kind == ir.KindType && on(p.ID) {
+			pull(n.ID)
+		}
+	}
+	for id := range near {
+		decl[id] = true
+	}
+
+	// Imports join packages and externals, which are all drawn; calls and
+	// embeds are kept only between drawn declarations, and (18) in Near
+	// between declarations on the page. A call or embed with one end off the
+	// page is counted on the other, as in a Project View (17).
+	var nearEdges []Edge
+	offIn, offOut := map[string]int{}, map[string]int{}
+	put := func(e *ir.Edge, status diff.Status) {
+		ve := toEdge(e)
+		ve.Status = string(status)
+		if in[e.From] && in[e.To] {
 			v.Edges = append(v.Edges, ve)
+		} else {
+			nearEdges = append(nearEdges, ve)
+		}
+	}
+	for i := range head.Edges {
+		e := &head.Edges[i]
+		switch {
+		case on(e.From) && on(e.To):
+			put(e, statusOf(e))
+		case decl[e.From]:
+			offOut[e.From] += len(e.Locations)
+		case decl[e.To]:
+			offIn[e.To] += len(e.Locations)
+		}
+	}
+	for i := range base.Edges {
+		if e := &base.Edges[i]; removed(e) && on(e.From) && on(e.To) {
+			put(e, diff.Removed)
+		}
+	}
+	if len(near) > 0 {
+		v.Near = &Near{Nodes: []Node{}, Edges: []Edge{}}
+		for _, n := range near {
+			vn := toNode(n)
+			vn.OffIn, vn.OffOut = offIn[n.ID], offOut[n.ID]
+			v.Near.Nodes = append(v.Near.Nodes, vn)
 		}
+		v.Near.Edges = append(v.Near.Edges, nearEdges...)
+	}
+	for i := range v.Nodes {
+		n := &v.Nodes[i]
+		n.OffIn, n.OffOut = offIn[n.ID], offOut[n.ID]
 	}
 
 	files := map[string]bool{}
diff --git a/internal/export/testdata/shop.change.golden.json b/internal/export/testdata/shop.change.golden.json
index ca06ac8..07e49e1 100644
--- a/internal/export/testdata/shop.change.golden.json
+++ b/internal/export/testdata/shop.change.golden.json
@@ -461,5 +461,65 @@
         ]
       }
     ]
+  },
+  "near": {
+    "nodes": [
+      {
+        "id": "example.com/shop/internal/checkout.Cart",
+        "kind": "type",
+        "parent": "example.com/shop/internal/checkout",
+        "exported": true,
+        "typeKind": "struct",
+        "loc": {
+          "path": "internal/checkout/checkout.go",
+          "line": 13
+        }
+      },
+      {
+        "id": "example.com/shop/internal/store.Reader",
+        "kind": "type",
+        "parent": "example.com/shop/internal/store",
+        "exported": true,
+        "typeKind": "interface",
+        "loc": {
+          "path": "internal/store/store.go",
+          "line": 13
+        }
+      },
+      {
+        "id": "example.com/shop/internal/store.Repo.Reset",
+        "kind": "function",
+        "parent": "example.com/shop/internal/store.Repo",
+        "exported": true,
+        "loc": {
+          "path": "internal/store/store.go",
+          "line": 51
+        },
+        "offOut": 1
+      }
+    ],
+    "edges": [
+      {
+        "from": "example.com/shop/internal/checkout.Cart",
+        "to": "example.com/shop/internal/store.Order",
+        "kind": "embeds",
+        "count": 1,
+        "loc": {
+          "path": "internal/checkout/checkout.go",
+          "line": 14
+        }
+      },
+      {
+        "from": "example.com/shop/internal/store.ReadWriter",
+        "to": "example.com/shop/internal/store.Reader",
+        "kind": "embeds",
+        "count": 1,
+        "loc": {
+          "path": "internal/store/store.go",
+          "line": 20
+        },
+        "status": "removed"
+      }
+    ]
   }
 }
diff --git a/internal/export/view.go b/internal/export/view.go
index b0fc9a9..74333be 100644
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -33,6 +33,18 @@ type View struct {
 	Violations *diff.ViolationDelta `json:"violations,omitempty"`
 	// Metrics is the CRAP overlay (08), only when zu was given a coverprofile.
 	Metrics *Metrics `json:"metrics,omitempty"`
+	// Near is a Change View's unchanged neighbours, for the Screen (18).
+	Near *Near `json:"near,omitempty"`
+}
+
+// Near is what a Change View's Screen draws beside Nodes and Edges (18): the
+// unchanged declarations one call or embed from a drawn one, their types and
+// every method of a type on the page, with the calls and embeds among them
+// all that Edges does not hold. The tree never reads it, so it draws only
+// what changed.
+type Near struct {
+	Nodes []Node `json:"nodes"`
+	Edges []Edge `json:"edges"`
 }
 
 // Node is an IR node reduced to what a view draws.
@@ -121,11 +133,17 @@ func toEdge(e *ir.Edge) Edge {
 // sortView puts every list in canonical order so the same input renders the
 // same bytes.
 func sortView(v *View) {
-	slices.Sort(v.Modules)
-	slices.SortFunc(v.Nodes, func(a, b Node) int { return cmp.Compare(a.ID, b.ID) })
-	slices.SortFunc(v.Edges, func(a, b Edge) int {
+	byID := func(a, b Node) int { return cmp.Compare(a.ID, b.ID) }
+	byEnds := func(a, b Edge) int {
 		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
-	})
+	}
+	slices.Sort(v.Modules)
+	slices.SortFunc(v.Nodes, byID)
+	slices.SortFunc(v.Edges, byEnds)
+	if v.Near != nil {
+		slices.SortFunc(v.Near.Nodes, byID)
+		slices.SortFunc(v.Near.Edges, byEnds)
+	}
 	slices.SortFunc(v.Honesty.ParseErrors, func(a, b ir.ParseError) int {
 		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Message, b.Message))
 	})
diff --git a/web/src/data.ts b/web/src/data.ts
index 83d65c8..f427c3b 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -42,6 +42,10 @@ export type View = {
   policy?: { hash: string; levels: string[][]; order?: string[]; proposals?: Proposal[]; budget?: number };
   violations?: { new: Violation[]; fixed: Violation[]; known: number }; // 07: Change View only
   metrics?: Metrics; // 08: only when zu was given -coverprofile
+  // 18: Change View only: the unchanged declarations one call or embed from a
+  // drawn one, their types' methods, and the calls and embeds among them all
+  // that edges does not hold. Only the Screen reads it (screen.ts screenView).
+  near?: { nodes: ViewNode[]; edges: ViewEdge[] };
   // 07, never written by zu: the box tree a Proposal draws (proposal.ts). cut.ts
   // index reads parent instead of package ids, and scene.ts labels from label.
   regroup?: { parent: Record<string, string>; label: Record<string, string> };
```

- [ ] **Run:** `go test ./... && cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Commit:** `Keep a Change View's unchanged neighbours for its Screens`

---

### Task 2: The Screen reads a Change View (`screen.ts`)

The tests use the shop Change View golden and testkit Views. They check:
- **`centreOf`** in a Change View:
  - a package, a removed declaration (ReadWriter) and a near one (Cart) centre themselves;
  - a near method (Repo.Reset) centres its type;
  - a Move's source (`money.Add`) centres nothing.
- **`screenView`** merges near once (the same object twice), and returns a Project View as it is.
- **Status rows:**
  - money's above row is shop (modified, its line `added`), checkout (modified), tools/gen (`affected`), then store's ghost;
  - money's below row is store, its line `reversed`;
  - store's rows hold money above (reversed) and money's ghost below, small;
  - a ghost comes after a capped row's 24 boxes;
  - ReadWriter's below row is Reader, its line `removed`; Order's above row is the near Cart, unmarked;
  - Repo's Screen counts Reset's call to Open as one call out of it (offOut 1), with 5 unresolved calls;
  - a line whose edges are added and unchanged is `mixed`;
  - with checkout's and money's imports of store marked as violations, checkout's line on store's Screen and on its own is `violation`, money's real line is, and money's ghost line is not; so is checkout's on a Project View's Screen, and no line is without a Policy.
- **The Centre's change:**
  - store: `st-modified`, hop 0, reach 4, and members ~ Order, − ReadWriter, ~ Repo.Get, ~ Repo.check;
  - money: reach 3, with → Plus;
  - Repo: `has-change`, with ~ Get and ~ check;
  - tools/gen: `affected`, hop 1;
  - `lib/pq`: no hop;
  - a Project View's Screen has none.
- **The cap:** 10 changed functions list 8 and count 2 more, drawn "+2 more".
- **`placeScreen`:**
  - the Centre's members are drawn as lines, and the Centre is taller for them;
  - each box carries its mark and ghost;
  - each line carries its status, and a ghost's line `ghost: true`.
- **`screenNote`:**
  - the four Affected Set wordings, the removed package's among them;
  - none for an external;
  - Repo's note with "unchanged declarations more than one call or embed from the change" and "Affected Set (its package)".

The hash now accepts a Change View's `c=`: 17's test that it refused one (`proposal.test.ts`) is turned round, and a comment in `state.test.ts` is corrected.

**Files:**
- Tests: `web/src/screen.test.ts`, `web/src/proposal.test.ts`, `web/src/state.test.ts`
- Code: `web/src/screen.ts`, `web/src/scene.ts`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/web/src/proposal.test.ts b/web/src/proposal.test.ts
index 2998cd9..47cd219 100644
--- a/web/src/proposal.test.ts
+++ b/web/src/proposal.test.ts
@@ -101,7 +101,8 @@ describe("a Proposal in the URL hash (07)", () => {
     expect(readHash("#c=m%2Fapp%2Fapi&m=1", v)).toEqual(s);
     expect(revalidate(s, v)).toBe(s);
     expect(revalidate(s, { ...v, nodes: v.nodes.filter((n) => n.id !== "m/app/api") })).toEqual(DEFAULT_STATE);
-    expect(readHash("#c=m%2Fapp%2Fapi", { ...v, kind: "change", changed: [] })).toEqual(DEFAULT_STATE); // 18
+    // 18: a Change View has Screens too
+    expect(readHash("#c=m%2Fapp%2Fapi", { ...v, kind: "change", changed: [] })).toEqual({ ...DEFAULT_STATE, centre: "m/app/api" });
   });
 
   it("is never read in a Change View, so a pasted link cannot draw one there", () => {
diff --git a/web/src/screen.test.ts b/web/src/screen.test.ts
index 3006283..13e7239 100644
--- a/web/src/screen.test.ts
+++ b/web/src/screen.test.ts
@@ -4,12 +4,14 @@ import css from "./styles.css?raw";
 import change from "../../internal/export/testdata/shop.change.golden.json";
 import type { View, ViewEdge } from "./data";
 import { ROW_MAX } from "./layout";
-import { centreOf, FONT, GAP_ROW, placeScreen, ROW_CAP, screenNote, screenOf, type Drawn } from "./screen";
+import { centreOf, FONT, GAP_ROW, MEMBER_CAP, placeScreen, ROW_CAP, screenNote, screenOf, screenView, type Drawn, type Row } from "./screen";
 import { LABEL_PX } from "./viewport";
 import { decl, edge, exts, pkgs, view } from "./testkit";
 
 const shop = golden as unknown as View;
 const S = "example.com/shop/internal/store";
+const C = "example.com/shop/internal/checkout";
+const M = "example.com/shop/internal/money";
 const weighed = (from: string, to: string, count: number, kind: ViewEdge["kind"] = "imports"): ViewEdge =>
   ({ ...edge(from, to, kind), count });
 const ids = (r: { boxes: { id: string }[] }) => r.boxes.map((b) => b.id);
@@ -29,8 +31,13 @@ describe("centreOf", () => {
       expect(centreOf(v, id), String(id)).toBeNull();
     }
   });
-  it("centres nothing in a Change View (18 draws the Screen there)", () => {
-    expect(centreOf(change as unknown as View, S)).toBeNull();
+  it("centres a Change View's nodes, removed and near ones too (18), never a Move's source", () => {
+    const v = change as unknown as View;
+    expect(centreOf(v, S)).toBe(S);
+    expect(centreOf(v, `${S}.ReadWriter`)).toBe(`${S}.ReadWriter`); // removed
+    expect(centreOf(v, `${C}.Cart`)).toBe(`${C}.Cart`); // near: unchanged, one embed from Order
+    expect(centreOf(v, `${S}.Repo.Reset`)).toBe(`${S}.Repo`); // a near method names its type
+    expect(centreOf(v, `${M}.Add`)).toBeNull(); // moved to money.Plus: in no tree the page draws
   });
 });
 
@@ -189,3 +196,121 @@ describe("screenNote (17)", () => {
       .toEqual([["up:m/b", "↻ 1 file"], ["up:m/c", "1 file"], ["down:m/b", "↻ 1 file"]]);
   });
 });
+
+describe("the Screen in a Change View (18)", () => {
+  const v = change as unknown as View;
+  const rows = (r: Row) => r.boxes.map((b) => [b.id, b.mark, b.status ?? "", b.ghost]);
+  const T = "example.com/shop/tools/gen";
+
+  it("reads the View with its near neighbours, merged once", () => {
+    const sv = screenView(v);
+    expect(sv).toBe(screenView(v));
+    expect(sv.nodes).toHaveLength(v.nodes.length + v.near!.nodes.length);
+    expect(sv.edges).toHaveLength(v.edges.length + v.near!.edges.length);
+    expect(screenView(shop)).toBe(shop);
+  });
+  it("marks each box by its Change Status and each line by its edges'", () => {
+    // money's importers: shop's import is added, checkout's unchanged; tools/gen is Affected (hop 1)
+    const s = screenOf(v, M);
+    expect(rows(s.above)).toEqual([
+      ["example.com/shop", "st-modified", "added", false],
+      [C, "st-modified", "", false],
+      [T, "affected", "", false],
+      [S, "", "reversed", true], // the ghost: store imported money in base
+    ]);
+    expect(rows(s.below)).toEqual([[S, "st-modified", "reversed", false]]);
+  });
+  it("draws a reversed import's far end in its new row and its ghost, small, in the old one", () => {
+    const s = screenOf(v, S);
+    expect(rows(s.above)).toEqual([[C, "st-modified", "", false], [M, "st-modified", "reversed", false]]);
+    expect(rows(s.below)).toEqual([["github.com/lib/pq", "", "", false], [M, "", "reversed", true]]);
+    expect(s.below.boxes[1]).toMatchObject({ size: "small", both: false });
+  });
+  it("draws a ghost past a capped row's boxes", () => {
+    const many = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
+    const m = { ...view(pkgs(["m/core", "m/x", ...many], "m"), [...many.map((p) => edge(p, "m/core")), { ...edge("m/core", "m/x"), status: "reversed" }]), kind: "change" as const };
+    const up = screenOf(m, "m/core").above;
+    expect(up.more).toBe(30 - ROW_CAP);
+    expect(up.boxes).toHaveLength(ROW_CAP + 1);
+    expect(up.boxes[ROW_CAP]).toMatchObject({ id: "m/x", ghost: true });
+  });
+  it("draws a removed declaration's Screen from base's edges, and near neighbours unmarked", () => {
+    expect(rows(screenOf(v, `${S}.ReadWriter`).below)).toEqual([[`${S}.Reader`, "", "removed", false]]);
+    expect(rows(screenOf(v, `${S}.Order`).above)).toEqual([[`${C}.Cart`, "", "", false]]);
+    // Repo.Reset, a near method, calls store.Open, which is two calls from the change
+    expect(screenOf(v, `${S}.Repo`)).toMatchObject({ offIn: 0, offOut: 1, unresolved: 5 });
+  });
+  it("draws a violating import's line red, as the tree does (06), never its ghost's", () => {
+    // checkout imports store against the Policy, and money's import of store, reversed, does too
+    const red = (e: ViewEdge): ViewEdge =>
+      e.kind === "imports" && e.to === S && (e.from === C || e.from === M) ? { ...e, violation: "levels" } : e;
+    const bad = { ...v, edges: v.edges.map(red) };
+    const reds = (r: Row) => r.boxes.filter((b) => b.violation).map((b) => b.id);
+    expect(reds(screenOf(bad, C).below)).toEqual([S]);
+    expect(reds(screenOf(bad, S).above)).toEqual([C, M]);
+    expect(reds(screenOf(bad, S).below)).toEqual([]); // money's ghost: base's import, the other way round
+    expect(placeScreen(screenOf(bad, C)).edges.filter((e) => e.violation).map((e) => e.id)).toEqual([`>down:${S}`]);
+    expect(reds(screenOf({ ...shop, edges: shop.edges.map(red) }, S).above)).toEqual([C]); // a Project View too
+    expect(reds(screenOf(v, S).above)).toEqual([]);
+  });
+  it("marks a line ± when its edges' statuses differ", () => {
+    const m = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.F", "m/a", "function"), decl("m/a.T", "m/a"),
+      decl("m/a.T.x", "m/a.T", "function"), decl("m/a.T.y", "m/a.T", "function")], [
+      { ...edge("m/a.T.x", "m/a.F", "calls"), status: "added" }, edge("m/a.T.y", "m/a.F", "calls"),
+    ]);
+    expect(screenOf({ ...m, kind: "change" }, "m/a.F").above.boxes.map((b) => b.status)).toEqual(["mixed"]);
+  });
+  it("gives the Centre its mark, its changed members and its place in the Affected Set (ADR 0009)", () => {
+    expect(screenOf(v, S).change).toEqual({
+      mark: "st-modified", hop: 0, reach: 4, more: 0,
+      members: [
+        { id: `${S}.Order`, label: "Order", sign: "~" }, { id: `${S}.ReadWriter`, label: "ReadWriter", sign: "−" },
+        { id: `${S}.Repo.Get`, label: "Repo.Get", sign: "~" }, { id: `${S}.Repo.check`, label: "Repo.check", sign: "~" },
+      ],
+    });
+    expect(screenOf(v, M).change).toMatchObject({ hop: 0, reach: 3, members: [{ label: "Plus", sign: "→" }] });
+    // a type is named in its package's list, so its own list drops its name
+    expect(screenOf(v, `${S}.Repo`).change).toMatchObject({
+      mark: "has-change", hop: 0, reach: 4, members: [{ label: "Get", sign: "~" }, { label: "check", sign: "~" }],
+    });
+    expect(screenOf(v, T).change).toMatchObject({ mark: "affected", hop: 1, members: [] });
+    expect(screenOf(v, "github.com/lib/pq").change).toEqual({ mark: "", members: [], more: 0, reach: 0 });
+    expect(screenOf(shop, S).change).toBeUndefined();
+  });
+  it("lists MEMBER_CAP members and counts the rest", () => {
+    const fs = Array.from({ length: MEMBER_CAP + 2 }, (_, i) => ({ ...decl(`m/a.F${i}`, "m/a", "function"), status: "added" }));
+    const m = { ...view([...pkgs(["m/a"], "m", { detail: true, hop: 0 }), ...fs]), kind: "change" as const };
+    expect(screenOf(m, "m/a").change).toMatchObject({ more: 2 });
+    expect(screenOf(m, "m/a").change!.members).toHaveLength(MEMBER_CAP);
+  });
+  it("draws the Centre's members, each box's mark, each line's status, and a ghost", () => {
+    const p = placeScreen(screenOf(v, S));
+    const c = p.nodes[0];
+    expect(c).toMatchObject({ row: "centre", mark: "st-modified", members: ["~ Order", "− ReadWriter", "~ Repo.Get", "~ Repo.check"] });
+    expect(c.h).toBeGreaterThan(placeScreen(screenOf(shop, S)).nodes[0].h);
+    expect(p.nodes.find((n) => n.id === `up:${M}`)).toMatchObject({ mark: "st-modified", ghost: false, members: [] });
+    expect(p.nodes.find((n) => n.id === `down:${M}`)).toMatchObject({ mark: "", ghost: true, facts: "⇄ in base" });
+    expect(p.edges).toEqual([
+      { id: `up:${C}>`, from: `up:${C}`, to: S },
+      { id: `up:${M}>`, from: `up:${M}`, to: S, status: "reversed" },
+      { id: ">down:github.com/lib/pq", from: S, to: "down:github.com/lib/pq" },
+      { id: `>down:${M}`, from: S, to: `down:${M}`, status: "reversed", ghost: true },
+    ]);
+    const fs = Array.from({ length: MEMBER_CAP + 2 }, (_, i) => ({ ...decl(`m/a.F${i}`, "m/a", "function"), status: "added" }));
+    const m = { ...view([...pkgs(["m/a"], "m", { detail: true, hop: 0 }), ...fs]), kind: "change" as const };
+    expect(placeScreen(screenOf(m, "m/a")).nodes[0].members.at(-1)).toBe("+2 more");
+  });
+  it("says where the Centre sits in the Affected Set, and what lies further from the change", () => {
+    const pkg = "Above: what imports it. Below: what it imports. Size: files that import.";
+    expect(screenNote(screenOf(v, S))).toBe(`${pkg} Affected Set: changed; 4 packages import it, directly or not.`);
+    expect(screenNote(screenOf(v, T))).toBe(`${pkg} Affected Set: 1 import from a changed package.`);
+    expect(screenNote(screenOf({ ...view(pkgs(["m/a"], "m")), kind: "change" }, "m/a"))).toBe(`${pkg} Affected Set: not in it.`);
+    const gone = { ...view([...pkgs(["m/a"], "m", { status: "removed" }), decl("m/a.F", "m/a", "function")]), kind: "change" as const };
+    expect(screenNote(screenOf(gone, "m/a"))).toBe(`${pkg} Affected Set: removed, so not in it (the Affected Set is head's).`);
+    expect(screenNote(screenOf(v, "github.com/lib/pq"))).toBe(pkg);
+    expect(screenNote(screenOf(v, `${S}.Repo`))).toBe(
+      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
+      "Not drawn: 1 call or embed out of it, with unchanged declarations more than one call or embed from the change; " +
+      "5 unresolved calls in its package. Affected Set (its package): changed; 4 packages import it, directly or not.");
+  });
+});
diff --git a/web/src/state.test.ts b/web/src/state.test.ts
index 21667a8..dad2f77 100644
--- a/web/src/state.test.ts
+++ b/web/src/state.test.ts
@@ -48,7 +48,7 @@ describe("URL hash", () => {
     expect(decodeHash("#c=m%2Fb", known)).toEqual({ ...DEFAULT_STATE, centre: "m/b" });
     expect(decodeHash("#m=1", known)).toEqual(DEFAULT_STATE);
     expect(decodeHash("#c=m%2Fa.T&m=1", known)).toEqual(DEFAULT_STATE); // not a Centre
-    const { centre: _, ...older } = known; // a Known without centre (a Change View) names none
+    const { centre: _, ...older } = known; // a Known without centre names none
     expect(decodeHash("#c=m%2Fb", older)).toEqual(DEFAULT_STATE);
   });
   it("adds a history entry only when the Centre changes, so Back walks the Screens (17)", () => {
```

- [ ] **Run:** `cd web && npx vitest run src/screen.test.ts src/proposal.test.ts src/state.test.ts` Expected: FAIL (13 tests: `centreOf` in a Change View is null; `screenView` is not a function; no box has a mark, status, ghost or violation; no Centre has a change; and the hash drops a Change View's `c=`)

- [ ] **Mark the Screen's boxes and lines, draw ghosts and violations, and give the Centre its members and Affected Set**

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
index 2ceb450..48f7bc7 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -637,7 +637,7 @@ export const knownIds = (view: View): Known => ({
     || (id.endsWith(ROOT_CLOSED) && id.slice(0, -ROOT_CLOSED.length) === rootModule(view)),
   node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS || knownGroup(view, id),
   proposal: (name) => view.kind !== "change" && (view.policy?.proposals?.some((p) => p.name === name) ?? false),
-  centre: (id) => centreOf(view, id) === id, // 17: never in a Change View, never a method
+  centre: (id) => centreOf(view, id) === id, // 17: never a method; 18: a Change View's near declarations too
 });
 
 // openFull says a Change View focus (from a link) lies outside the changed
diff --git a/web/src/screen.ts b/web/src/screen.ts
index 4d44d61..e4ba497 100644
--- a/web/src/screen.ts
+++ b/web/src/screen.ts
@@ -1,8 +1,11 @@
 // 17: the Screen (glossary: Screen, Centre, Weight). One node, the Centre,
 // with what depends on it in the row above and what it depends on in the row
 // below, after codezoom's screens. A pure function of the View and the hash:
-// rows come only from the View's edges.
+// rows come only from the View's edges. 18: in a Change View, from its edges
+// and near's, each box and line marked by its Change Status.
 import type { NodeKind, View, ViewEdge } from "./data";
+import { statusOf } from "./bundle";
+import { nodeMark } from "./change";
 import { cmp, index, packageOf, PKG } from "./cut";
 import { INSET, ROW_MAX, textWidth } from "./layout";
 import { LABEL_PX } from "./viewport";
@@ -11,6 +14,7 @@ export const ROW_CAP = 24; // the boxes a row draws before "+N more"
 export const LARGE_SHARE = 1 / 2; // of the row's heaviest Weight: drawn large
 export const MEDIUM_SHARE = 1 / 5; // drawn medium; less is small
 export const FLAT_ROW_MAX = 2; // a row whose heaviest weighs no more is drawn medium
+export const MEMBER_CAP = 8; // 18: the changed members a Centre lists before "+N more"
 
 export type Size = "small" | "medium" | "large";
 // The Screen's grain follows its Centre: imports between packages and
@@ -23,13 +27,41 @@ export type Box = {
   members: number; // declaration grain: declarations at this box's end of them
   weight: number; size: Size;
   both: boolean; // drawn in both rows: an import cycle or mutual calls with the Centre
+  mark: string; // 18: change.ts nodeMark, or "has-change" for a type with a changed method
+  status?: string; // 18: its line's: the Change Status its edges share, or "mixed" (bundle.ts statusOf)
+  ghost: boolean; // 18: where a reversed import's far end was in base
+  violation: boolean; // 18: its line holds an import the Policy forbids, drawn red as the tree's (06)
 };
-export type Row = { boxes: Box[]; more: number }; // more: boxes past ROW_CAP, not drawn
+// more: boxes past ROW_CAP, not drawn; a row's ghosts come after its boxes, uncapped
+export type Row = { boxes: Box[]; more: number };
 export type Screen = {
   centre: string; kind: NodeKind; grain: Grain; above: Row; below: Row;
   unresolved: number; // declaration grain: the Centre's package's Unresolved Calls (ADR 0002)
   offIn: number; offOut: number; // declaration grain: calls and embeds with declarations not on this page
+  change?: CentreChange; // 18: a Change View's only
 };
+// Member is a changed declaration in the Centre, signed + ~ − or → (a Move).
+export type Member = { id: string; label: string; sign: string };
+// CentreChange is the Centre's mark, its changed members (MEMBER_CAP of them,
+// then more), and its package's hop in the Affected Set, absent when it is not
+// in it; reach is, for a changed package, how many packages import it,
+// directly or not, over head's imports (ADR 0009).
+export type CentreChange = { mark: string; members: Member[]; more: number; hop?: number; reach: number };
+
+// screenView is the View a Screen reads: a Change View's nodes and edges with
+// near's (18), the unchanged declarations one call or embed from the change,
+// merged once; any other View as it is.
+const merged = new WeakMap<View, View>();
+export function screenView(view: View): View {
+  if (!view.near) return view;
+  let v = merged.get(view);
+  if (!v) {
+    const { near, ...rest } = view;
+    v = { ...rest, nodes: [...view.nodes, ...near.nodes], edges: [...view.edges, ...near.edges] };
+    merged.set(view, v);
+  }
+  return v;
+}
 
 // typeOf is the type a method belongs to, or undefined.
 function typeOf(view: View, id: string): string | undefined {
@@ -40,13 +72,30 @@ function typeOf(view: View, id: string): string | undefined {
 
 // centreOf is the Centre a selection names: a package (its box "X#pkg" too),
 // a type, a function or an external; a method names its type. Boxes that are
-// not nodes, aggregates and groups name none, and a Change View has no
-// Screen yet (18).
+// not nodes, aggregates and groups name none. In a Change View a near
+// declaration names itself too (18).
 export function centreOf(view: View, id: string | null): string | null {
-  if (id === null || view.kind === "change") return null;
-  const n = index(view).node.get(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
+  if (id === null) return null;
+  const v = screenView(view);
+  const n = index(v).node.get(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
   if (!n) return null;
-  return typeOf(view, n.id) ?? n.id;
+  return typeOf(v, n.id) ?? n.id;
+}
+
+// markOf is the class a Screen box is drawn with (18): its node's mark, or
+// "has-change" for a type with a changed method, as the tree marks a box with
+// changes inside.
+const changedTypes = new WeakMap<View, Set<string>>();
+function markOf(view: View, id: string): string {
+  const n = index(view).node.get(id)!;
+  const m = nodeMark(n);
+  if (m || n.kind !== "type") return m;
+  let types = changedTypes.get(view);
+  if (!types) {
+    types = new Set(view.nodes.filter((x) => (x.status || x.movedFrom) && typeOf(view, x.id)).map((x) => x.parent!));
+    changedTypes.set(view, types);
+  }
+  return types.has(id) ? "has-change" : "";
 }
 
 // labelOf names a node as a Screen box does: a package by its path in its
@@ -62,14 +111,15 @@ function labelOf(view: View, id: string): { label: string; sub: string } {
   return { label: id.slice(pkg.length + 1), sub: labelOf(view, pkg).label };
 }
 
-type Tally = { refs: number; ends: Set<string>; embeds: boolean };
+type Tally = { refs: number; ends: Set<string>; embeds: boolean; edges: ViewEdge[] };
 
-function rowOf(view: View, tallies: Map<string, Tally>, other: Map<string, Tally>, grain: Grain, below: boolean, all: boolean): Row {
+function rowOf(view: View, tallies: Map<string, Tally>, other: Map<string, Tally>, grain: Grain, below: boolean, all: boolean, ghosts: string[]): Row {
   const boxes: Box[] = [...tallies].map(([id, t]) => ({
     id, kind: index(view).node.get(id)!.kind, ...labelOf(view, id),
     refs: t.refs, members: t.ends.size,
     weight: grain === "package" ? t.refs : Math.sqrt(t.refs * t.ends.size),
     size: "medium" as Size, both: other.has(id),
+    mark: markOf(view, id), status: statusOf(t.edges), ghost: false, violation: t.edges.some((e) => e.violation !== undefined),
   }));
   boxes.sort((a, b) => b.weight - a.weight || cmp(a.id, b.id));
   const max = boxes[0]?.weight ?? 0;
@@ -79,29 +129,78 @@ function rowOf(view: View, tallies: Map<string, Tally>, other: Map<string, Tally
       : b.weight >= max * LARGE_SHARE ? "large" : b.weight >= max * MEDIUM_SHARE ? "medium" : "small";
     if (below && b.size === "small" && b.kind !== "external" && tallies.get(b.id)!.embeds) b.size = "medium"; // what the Centre embeds
   }
-  return all || boxes.length <= ROW_CAP ? { boxes, more: 0 } : { boxes: boxes.slice(0, ROW_CAP), more: boxes.length - ROW_CAP };
+  // A ghost is drawn small and plain, past the cap: a reversal is never hidden.
+  const ghost = (id: string): Box => ({
+    id, kind: index(view).node.get(id)!.kind, ...labelOf(view, id), refs: 0, members: 0, weight: 0,
+    size: "small", both: false, mark: "", status: "reversed", ghost: true, violation: false,
+  });
+  const drawn = all || boxes.length <= ROW_CAP ? boxes : boxes.slice(0, ROW_CAP);
+  return { boxes: [...drawn, ...ghosts.sort(cmp).map(ghost)], more: boxes.length - drawn.length };
+}
+
+const SIGNS: Record<string, string> = { added: "+", modified: "~", removed: "−" };
+
+// changeOf is a Change View Centre's CentreChange: a package lists its
+// changed declarations, a type its changed methods.
+function changeOf(view: View, centre: string, kind: NodeKind): CentreChange {
+  const inside = (id: string) => (kind === "package" ? packageOf(view, id) === centre : kind === "type" && typeOf(view, id) === centre);
+  const all = view.nodes
+    .filter((n) => (n.kind === "type" || n.kind === "function") && (n.status || n.movedFrom) && inside(n.id))
+    .map((n) => ({ id: n.id, label: n.id.slice(centre.length + 1), sign: n.status ? SIGNS[n.status] : "→" }))
+    .sort((a, b) => cmp(a.id, b.id));
+  const pkg = kind === "external" ? undefined : kind === "package" ? centre : packageOf(view, centre);
+  const hop = pkg === undefined ? undefined : index(view).node.get(pkg)?.hop;
+  return {
+    mark: markOf(view, centre), members: all.slice(0, MEMBER_CAP), more: Math.max(0, all.length - MEMBER_CAP),
+    hop, reach: hop === 0 ? reachOf(view, pkg!) : 0,
+  };
+}
+
+// reachOf counts the packages that import pkg, directly or not, over head's
+// imports: a removed import is base's.
+const importers = new WeakMap<View, Map<string, string[]>>();
+function reachOf(view: View, pkg: string): number {
+  let by = importers.get(view);
+  if (!by) {
+    by = new Map();
+    for (const e of view.edges) {
+      if (e.kind !== "imports" || e.status === "removed") continue;
+      const from = by.get(e.to);
+      if (from) from.push(e.from);
+      else by.set(e.to, [e.from]);
+    }
+    importers.set(view, by);
+  }
+  const seen = new Set([pkg]);
+  for (const id of seen) for (const from of by.get(id) ?? []) seen.add(from);
+  return seen.size - 1;
 }
 
 // screenOf is the Screen of centre (a centreOf id); all draws every box of
 // both rows.
-export function screenOf(view: View, centre: string, all = false): Screen {
+export function screenOf(within: View, centre: string, all = false): Screen {
+  const view = screenView(within);
   const c = index(view).node.get(centre)!;
   const grain: Grain = c.kind === "package" || c.kind === "external" ? "package" : "declaration";
   const kinds: ViewEdge["kind"][] = grain === "package" ? ["imports"] : ["calls", "embeds"];
   const boxOf = (id: string) => (grain === "package" ? id : (typeOf(view, id) ?? id));
   const above = new Map<string, Tally>();
   const below = new Map<string, Tally>();
+  const ghosts = { above: [] as string[], below: [] as string[] };
   for (const e of view.edges) {
     if (!kinds.includes(e.kind)) continue;
     const [from, to] = [boxOf(e.from) === centre, boxOf(e.to) === centre];
     if (from === to) continue; // inside the Centre, or away from it
     const [rows, end] = to ? [above, e.from] : [below, e.to];
     const id = boxOf(end);
-    const t = rows.get(id) ?? { refs: 0, ends: new Set<string>(), embeds: false };
+    const t = rows.get(id) ?? { refs: 0, ends: new Set<string>(), embeds: false, edges: [] };
     t.refs += e.count;
     t.ends.add(end);
     t.embeds ||= e.kind === "embeds";
+    t.edges.push(e);
     rows.set(id, t);
+    // A reversed import is head's; base had it the other way round.
+    if (e.status === "reversed") (to ? ghosts.below : ghosts.above).push(id);
   }
   let [unresolved, offIn, offOut] = [0, 0, 0];
   if (grain === "declaration") {
@@ -114,8 +213,10 @@ export function screenOf(view: View, centre: string, all = false): Screen {
   }
   return {
     centre, kind: c.kind, grain,
-    above: rowOf(view, above, below, grain, false, all), below: rowOf(view, below, above, grain, true, all),
+    above: rowOf(view, above, below, grain, false, all, ghosts.above),
+    below: rowOf(view, below, above, grain, true, all, ghosts.below),
     unresolved, offIn, offOut,
+    ...(view.kind === "change" ? { change: changeOf(view, centre, c.kind) } : {}),
   };
 }
 
@@ -135,13 +236,17 @@ const LINE = 14; // a .sub or .facts line
 
 // Drawn is one box of a Screen as React Flow draws it. A box in both rows is
 // drawn twice: id is its row's prefix and the node's id ("up:", "down:"); ref
-// is the node it draws, or null for a "+N more" chip.
+// is the node it draws, or null for a "+N more" chip. 18: mark, ghost and
+// status are its Box's; members are the Centre's lines, "~ Get". A line
+// carries its box's status, ghost and violation.
 export type Drawn = {
   id: string; ref: string | null; row: "above" | "centre" | "below"; kind: NodeKind | "more";
   label: string; sub: string; facts: string; size: Size | "centre"; both: boolean;
+  mark: string; ghost: boolean; status?: string; members: string[];
   x: number; y: number; w: number; h: number;
 };
-export type ScreenDrawing = { nodes: Drawn[]; edges: { id: string; from: string; to: string }[] };
+export type ScreenEdge = { id: string; from: string; to: string; status?: string; ghost?: true; violation?: true };
+export type ScreenDrawing = { nodes: Drawn[]; edges: ScreenEdge[] };
 
 const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
 
@@ -153,9 +258,9 @@ export const factsOf = (grain: Grain, b: Box): string =>
 function sized(d: Omit<Drawn, "w" | "h" | "x" | "y">): Drawn {
   const text = Math.max(
     textWidth(d.label) * (FONT[d.size] / LABEL_PX),
-    (Math.max(textWidth(d.sub), textWidth(d.facts)) * SMALL_PX) / LABEL_PX,
+    (Math.max(textWidth(d.sub), textWidth(d.facts), ...d.members.map(textWidth)) * SMALL_PX) / LABEL_PX,
   );
-  const lines = (d.sub ? 1 : 0) + (d.facts ? 1 : 0);
+  const lines = (d.sub ? 1 : 0) + (d.facts ? 1 : 0) + d.members.length;
   return { ...d, x: 0, y: 0, w: Math.max(MIN_W[d.size], Math.ceil(text + INSET)), h: Math.ceil(FONT[d.size] * 1.4) + 16 + LINE * lines };
 }
 
@@ -189,17 +294,23 @@ function outward(line: Drawn[]): Drawn[] {
 // above and below it, and a line from each box to the Centre or from the
 // Centre to it.
 export function placeScreen(s: Screen): ScreenDrawing {
+  const c = s.change;
   const centre = sized({
     id: s.centre, ref: s.centre, row: "centre", kind: s.kind, label: s.centre, sub: "",
     facts: s.grain === "package" ? "imports" : "calls and embeds", size: "centre", both: false,
+    mark: c?.mark ?? "", ghost: false,
+    members: c ? [...c.members.map((m) => `${m.sign} ${m.label}`), ...(c.more > 0 ? [`+${c.more} more`] : [])] : [],
   });
   centre.x = -centre.w / 2;
   const nodes: Drawn[] = [centre];
-  const edges: ScreenDrawing["edges"] = [];
+  const edges: ScreenEdge[] = [];
   for (const [row, r, prefix] of [["above", s.above, "up:"], ["below", s.below, "down:"]] as const) {
-    const drawn = r.boxes.map((b) =>
-      sized({ id: prefix + b.id, ref: b.id, row, kind: b.kind, label: b.label, sub: b.sub, facts: (b.both ? "↻ " : "") + factsOf(s.grain, b), size: b.size, both: b.both }));
-    if (r.more > 0) drawn.push(sized({ id: prefix + "#more", ref: null, row, kind: "more", label: `+${r.more} more`, sub: "", facts: "", size: "small", both: false }));
+    const drawn = r.boxes.map((b) => sized({
+      id: prefix + b.id, ref: b.id, row, kind: b.kind, label: b.label, sub: b.sub,
+      facts: b.ghost ? "⇄ in base" : (b.both ? "↻ " : "") + factsOf(s.grain, b), size: b.size, both: b.both,
+      mark: b.mark, ghost: b.ghost, status: b.status, members: [],
+    }));
+    if (r.more > 0) drawn.push(sized({ id: prefix + "#more", ref: null, row, kind: "more", label: `+${r.more} more`, sub: "", facts: "", size: "small", both: false, mark: "", ghost: false, members: [] }));
     let edge = row === "above" ? -GAP_ROW : centre.h + GAP_ROW; // the line's side nearest the Centre
     for (const line of lines(drawn).map(outward)) {
       let x = -(line.reduce((w, b) => w + b.w, 0) + GAP_BOX * (line.length - 1)) / 2;
@@ -211,9 +322,13 @@ export function placeScreen(s: Screen): ScreenDrawing {
       edge += row === "above" ? -(h + GAP_LINE) : h + GAP_LINE;
     }
     nodes.push(...drawn);
-    for (const b of drawn) {
-      if (b.ref === null) continue;
-      edges.push(row === "above" ? { id: `${b.id}>`, from: b.id, to: centre.id } : { id: `>${b.id}`, from: centre.id, to: b.id });
+    for (const b of r.boxes) {
+      const id = prefix + b.id;
+      const marks = {
+        ...(b.status ? { status: b.status } : {}), ...(b.ghost ? { ghost: true as const } : {}),
+        ...(b.violation ? { violation: true as const } : {}),
+      };
+      edges.push(row === "above" ? { id: `${id}>`, from: id, to: centre.id, ...marks } : { id: `>${id}`, from: centre.id, to: id, ...marks });
     }
   }
   return { nodes, edges };
@@ -222,15 +337,29 @@ export function placeScreen(s: Screen): ScreenDrawing {
 // screenNote says what a Screen's rows and sizes are, and what it leaves out
 // (silence is how a diagram lies): calls and embeds, into it and out of it,
 // with declarations the page does not hold, and its package's Unresolved
-// Calls (ADR 0002).
+// Calls (ADR 0002). 18: in a Change View, where the Centre's package sits in
+// the Affected Set (ADR 0009).
 export function screenNote(s: Screen): string {
-  if (s.grain === "package") return "Above: what imports it. Below: what it imports. Size: files that import.";
+  return (s.grain === "package" ? "Above: what imports it. Below: what it imports. Size: files that import." : declNote(s)) + affectedNote(s);
+}
+
+function declNote(s: Screen): string {
   const uses = (n: number, way: string) => n > 0 && `${plural(n, "call or embed", "calls and embeds")} ${way}`;
   const off = [uses(s.offIn, "into it"), uses(s.offOut, "out of it")].filter(Boolean);
   const out = [
-    off.length > 0 && `${off.join(" and ")}, with declarations in packages not included (re-run with -include)`,
+    off.length > 0 && `${off.join(" and ")}, with ${s.change ? "unchanged declarations more than one call or embed from the change" : "declarations in packages not included (re-run with -include)"}`,
     s.unresolved > 0 && `${plural(s.unresolved, "unresolved call", "unresolved calls")} in its package`,
   ].filter(Boolean);
   return "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations)."
     + (out.length ? ` Not drawn: ${out.join("; ")}.` : "");
 }
+
+function affectedNote(s: Screen): string {
+  const c = s.change;
+  if (!c || s.kind === "external") return "";
+  // A Centre marked removed with no hop is in a removed package: base's only.
+  const where = c.hop === undefined ? (c.mark === "st-removed" ? "removed, so not in it (the Affected Set is head's)" : "not in it")
+    : c.hop > 0 ? `${plural(c.hop, "import", "imports")} from a changed package`
+    : `changed; ${c.reach === 0 ? "no package imports it" : `${plural(c.reach, "package imports", "packages import")} it, directly or not`}`;
+  return ` Affected Set${s.grain === "declaration" ? " (its package)" : ""}: ${where}.`;
+}
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Commit:** `Draw a Change View's Screen: marks, ghosts, the Centre's members and its Affected Set`

---

### Task 3: The walk (`walk.ts`, `keys.ts`, `lens.ts`)

The tests check:
- **`walkOf`:**
  - the shop Change View's ten steps, a type once for its two changed methods, money.Plus for the Move;
  - with a new violation from checkout to store, checkout and its steps come first, and no step repeats;
  - a Project View's walk is empty.
- **`step`:**
  - `n` on the tree starts at store and keeps the tree's fields;
  - `n` and `p` step along the walk, and return the same state at either end and for `p` on the tree;
  - from the near Cart (in checkout), `n` goes to checkout.Total and `p` to checkout;
  - from `lib/pq` (in no package of the walk), `n` goes to store and `p` does nothing;
  - the next Centre's rows are capped again (`more` false);
  - a Project View does nothing.
- **`walkAt`:** store is 1 of 10, shop.main 10 of 10, and Cart and the tree are off the walk.
- **`keys.ts`:** `n` and `p` map to next and previous in a Change View, on the tree and on the Screen. They map to nothing in a Project View, while typing, or with a modifier.
- **`leave`:** leaving the near Cart reveals checkout; leaving Repo, which the tree draws, reveals Repo.

`App.tsx` passes `change` to the key map and runs `step` for next and previous: the type check needs it with `keys.ts`'s new field.

**Files:**
- Tests: `web/src/walk.test.ts` (new), `web/src/keys.test.ts`, `web/src/lens.test.ts`
- Code: `web/src/walk.ts` (new), `web/src/keys.ts`, `web/src/lens.ts`, `web/src/App.tsx`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/web/src/keys.test.ts b/web/src/keys.test.ts
index 540bf72..822ea43 100644
--- a/web/src/keys.test.ts
+++ b/web/src/keys.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import { keyAction } from "./keys";
 
-const ctx = { searchOpen: false, selected: false, atRoot: false, typing: false, mod: false, screen: false };
+const ctx = { searchOpen: false, selected: false, atRoot: false, typing: false, mod: false, screen: false, change: false };
 
 describe("keys", () => {
   it("Esc closes search, then clears the selection, then goes up, then does nothing", () => {
@@ -22,6 +22,16 @@ describe("keys", () => {
     expect(keyAction("/", { ...ctx, screen: true })).toBe("search");
     expect(keyAction("f", { ...ctx, screen: true })).toBe("fit");
   });
+  it("n and p walk a Change View, from the tree or the Screen (18)", () => {
+    for (const screen of [false, true]) {
+      expect(keyAction("n", { ...ctx, change: true, screen })).toBe("next");
+      expect(keyAction("p", { ...ctx, change: true, screen })).toBe("previous");
+    }
+    expect(keyAction("n", ctx)).toBeNull(); // a Project View has no walk
+    expect(keyAction("p", ctx)).toBeNull();
+    expect(keyAction("n", { ...ctx, change: true, typing: true })).toBeNull();
+    expect(keyAction("n", { ...ctx, change: true, mod: true })).toBeNull();
+  });
   it("letters do nothing while typing in the search box", () => {
     expect(keyAction("/", ctx)).toBe("search");
     expect(keyAction("d", { ...ctx, typing: true })).toBeNull();
diff --git a/web/src/lens.test.ts b/web/src/lens.test.ts
index afbd34b..28b905c 100644
--- a/web/src/lens.test.ts
+++ b/web/src/lens.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
+import change from "../../internal/export/testdata/shop.change.golden.json";
 import type { View } from "./data";
 import { drawnCentre, enter, leave } from "./lens";
 import { reveal } from "./search";
@@ -30,6 +31,12 @@ describe("the lens (17)", () => {
     expect(leave(shop, centreAt(enter(shop, tree), C))).toEqual(reveal(shop, C, tree));
     expect(reveal(shop, C, tree).selected).toBe(C);
   });
+  it("leaves a near Centre, which the tree does not draw, to its package (18)", () => {
+    const v = change as unknown as View;
+    const tree = { ...DEFAULT_STATE, selected: S };
+    expect(leave(v, centreAt(tree, `${C}.Cart`))).toEqual(reveal(v, C, tree));
+    expect(leave(v, centreAt(tree, `${S}.Repo`))).toEqual(reveal(v, `${S}.Repo`, tree)); // drawn: itself
+  });
   it("draws no Screen for a Centre a newer View lost, before revalidate drops it", () => {
     const s = centreAt(DEFAULT_STATE, `${S}.Open`);
     const newer = { ...shop, nodes: shop.nodes.filter((n) => n.id !== `${S}.Open`) };
diff --git a/web/src/walk.test.ts b/web/src/walk.test.ts
new file mode 100644
index 0000000..c2826d5
--- /dev/null
+++ b/web/src/walk.test.ts
@@ -0,0 +1,69 @@
+import { describe, expect, it } from "vitest";
+import golden from "../../internal/export/testdata/shop.view.golden.json";
+import change from "../../internal/export/testdata/shop.change.golden.json";
+import type { View } from "./data";
+import { DEFAULT_STATE } from "./state";
+import { step, walkAt, walkOf } from "./walk";
+
+const shop = golden as unknown as View;
+const v = change as unknown as View;
+const S = "example.com/shop/internal/store";
+const C = "example.com/shop/internal/checkout";
+const M = "example.com/shop/internal/money";
+const ROOT = "example.com/shop";
+
+describe("walkOf (18)", () => {
+  it("walks the changed packages bottom-up, each followed by the Centres of its changed declarations", () => {
+    // a method's Centre is its type: Repo for Repo.Get and Repo.check; Plus is money.Add moved
+    expect(walkOf(v)).toEqual([
+      S, `${S}.Order`, `${S}.ReadWriter`, `${S}.Repo`, M, `${M}.Plus`, C, `${C}.Total`, ROOT, `${ROOT}.main`,
+    ]);
+  });
+  it("starts at each new violation's importer, with its package's steps, each step once", () => {
+    const w = walkOf({ ...v, violations: { new: [{ rule: "levels", from: C, to: S }], fixed: [], known: 0 } });
+    expect(w).toEqual([
+      C, `${C}.Total`, S, `${S}.Order`, `${S}.ReadWriter`, `${S}.Repo`, M, `${M}.Plus`, ROOT, `${ROOT}.main`,
+    ]);
+  });
+  it("is empty in a Project View", () => {
+    expect(walkOf(shop)).toEqual([]);
+  });
+});
+
+describe("step (18)", () => {
+  const tree = { ...DEFAULT_STATE, focus: "example.com/shop/internal", selected: C };
+  it("n starts the walk from the tree, keeping the tree's fields; n and p step along it and stop at its ends", () => {
+    const first = step(v, tree, 1);
+    expect(first).toEqual({ ...tree, centre: S });
+    expect(step(v, first, 1).centre).toBe(`${S}.Order`);
+    expect(step(v, step(v, first, 1), -1).centre).toBe(S);
+    expect(step(v, first, -1)).toBe(first);
+    const last = { ...tree, centre: `${ROOT}.main` };
+    expect(step(v, last, 1)).toBe(last);
+    expect(step(v, last, -1).centre).toBe(ROOT);
+    expect(step(v, tree, -1)).toBe(tree);
+  });
+  it("goes on from a Centre off the walk at its package's place, or from the start", () => {
+    const cart = { ...tree, centre: `${C}.Cart` }; // near, in checkout
+    expect(step(v, cart, 1).centre).toBe(`${C}.Total`);
+    expect(step(v, cart, -1).centre).toBe(C);
+    const pq = { ...tree, centre: "github.com/lib/pq" }; // in no package of the walk
+    expect(step(v, pq, 1).centre).toBe(S);
+    expect(step(v, pq, -1)).toBe(pq);
+  });
+  it("draws the next Centre's rows capped again", () => {
+    expect(step(v, { ...tree, centre: S, more: true }, 1)).toMatchObject({ centre: `${S}.Order`, more: false });
+  });
+  it("does nothing in a Project View", () => {
+    expect(step(shop, tree, 1)).toBe(tree);
+  });
+});
+
+describe("walkAt (18)", () => {
+  it("says which step of the walk a Centre is, if any", () => {
+    expect(walkAt(v, S)).toEqual({ at: 1, of: 10 });
+    expect(walkAt(v, `${ROOT}.main`)).toEqual({ at: 10, of: 10 });
+    expect(walkAt(v, `${C}.Cart`)).toEqual({ at: null, of: 10 });
+    expect(walkAt(v, null)).toEqual({ at: null, of: 10 });
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/walk.test.ts src/keys.test.ts src/lens.test.ts` Expected: FAIL (`Cannot find module './walk'`; `n` maps to nothing; leaving Cart does not reveal checkout)

- [ ] **Walk the change: n and p, in reading order**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 5205117..9695a3d 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -23,6 +23,7 @@ import { ScreenCanvas } from "./ScreenCanvas";
 import { centreAt, deeper, drill, nextStage, select, shallower, toggle, up, type ViewState } from "./state";
 import { Toolbar } from "./Toolbar";
 import { useViewState } from "./useViewState";
+import { step } from "./walk";
 
 const PKG = "#pkg";
 const FRAMES = 64; // 15: the most layouts the page keeps (place.ts)
@@ -276,6 +277,7 @@ export function App({ view: whole }: { view: View }) {
         typing: e.target instanceof HTMLInputElement,
         mod: e.metaKey || e.ctrlKey || e.altKey,
         screen: onScreen,
+        change,
       });
       if (a === "search") {
         e.preventDefault();
@@ -288,6 +290,8 @@ export function App({ view: whole }: { view: View }) {
       else if (a === "deeper") update((s) => deeper(s, sc.depth));
       else if (a === "shallower") update((s) => shallower(s, sc.depth));
       else if (a === "lens") lens();
+      else if (a === "next") update((s) => step(proposed, s, 1)); // 18: the walk
+      else if (a === "previous") update((s) => step(proposed, s, -1));
     };
     window.addEventListener("keydown", onKey);
     return () => window.removeEventListener("keydown", onKey);
diff --git a/web/src/keys.ts b/web/src/keys.ts
index 5f8cac5..25d49f8 100644
--- a/web/src/keys.ts
+++ b/web/src/keys.ts
@@ -1,11 +1,15 @@
 // U8 keyboard map. Esc peels one layer: search, then (17) the Screen, then
-// selection, then focus. n is kept for 18's walk through a change.
+// selection, then focus. 18: n and p walk a change.
 export type Action =
-  | "search" | "closeSearch" | "clearSelection" | "up" | "declutter" | "fit" | "deeper" | "shallower" | "lens";
+  | "search" | "closeSearch" | "clearSelection" | "up" | "declutter" | "fit" | "deeper" | "shallower" | "lens"
+  | "next" | "previous";
 
 // mod: Meta, Ctrl or Alt is held, so the key belongs to the browser (⌘− zooms, ⌘D bookmarks).
 // screen: the Screen is drawn (17), so the tree's own keys do nothing.
-export type KeyContext = { searchOpen: boolean; selected: boolean; atRoot: boolean; typing: boolean; mod: boolean; screen: boolean };
+// change: a Change View, which has a walk (18).
+export type KeyContext = {
+  searchOpen: boolean; selected: boolean; atRoot: boolean; typing: boolean; mod: boolean; screen: boolean; change: boolean;
+};
 
 export function keyAction(key: string, ctx: KeyContext): Action | null {
   if (ctx.mod) return null;
@@ -20,6 +24,8 @@ export function keyAction(key: string, ctx: KeyContext): Action | null {
     case "/": return "search";
     case "f": return "fit";
     case "s": return "lens";
+    case "n": return ctx.change ? "next" : null;
+    case "p": return ctx.change ? "previous" : null;
   }
   if (ctx.screen) return null;
   switch (key) {
diff --git a/web/src/lens.ts b/web/src/lens.ts
index 6005ab1..90b4b6c 100644
--- a/web/src/lens.ts
+++ b/web/src/lens.ts
@@ -2,7 +2,8 @@
 // s key). The tree's fields of the hash stay as the reader left them while
 // the Screen is drawn.
 import type { View } from "./data";
-import { centreOf } from "./screen";
+import { index, packageOf } from "./cut";
+import { centreOf, screenView } from "./screen";
 import { reveal } from "./search";
 import { centreAt, type ViewState } from "./state";
 
@@ -15,10 +16,11 @@ export function enter(view: View, s: ViewState): ViewState {
 
 // leave draws the tree again: as the reader left it while the Centre is
 // still the selection's, else drawn at the Centre with it selected, as a
-// search pick is (reveal).
+// search pick is (reveal). 18: a near Centre is not in the tree; its package is.
 export function leave(view: View, s: ViewState): ViewState {
   const tree = { ...s, centre: null, more: false };
-  return s.centre === null || centreOf(view, s.selected) === s.centre ? tree : reveal(view, s.centre, tree);
+  if (s.centre === null || centreOf(view, s.selected) === s.centre) return tree;
+  return reveal(view, index(view).node.has(s.centre) ? s.centre : packageOf(screenView(view), s.centre)!, tree);
 }
 
 // drawnCentre is the Centre the page draws: s's while view has it. A newer
diff --git a/web/src/walk.ts b/web/src/walk.ts
new file mode 100644
index 0000000..712a580
--- /dev/null
+++ b/web/src/walk.ts
@@ -0,0 +1,61 @@
+// 18: the walk through a change, n and p, in the decided reading order
+// (decisions.md, Change reading order): each new violation's importer, then
+// the changed packages bottom-up (view.changed, the Structural Summary's
+// order), each followed by the Centres of its changed declarations, by id.
+// Each step re-centres the Screen; the hash keeps only the Centre.
+import type { View } from "./data";
+import { cmp, packageOf } from "./cut";
+import { centreOf, screenView } from "./screen";
+import { centreAt, type ViewState } from "./state";
+
+const walks = new WeakMap<View, string[]>();
+
+// walkOf is the walk's Centres, each once: empty in a Project View.
+export function walkOf(view: View): string[] {
+  const hit = walks.get(view);
+  if (hit) return hit;
+  const inside = new Map<string, Set<string>>(); // a package's changed declarations' Centres
+  for (const n of view.nodes) {
+    const pkg = (n.kind === "type" || n.kind === "function") && (n.status || n.movedFrom) ? packageOf(view, n.id) : undefined;
+    const c = centreOf(view, n.id);
+    if (pkg !== undefined && c !== null) inside.set(pkg, (inside.get(pkg) ?? new Set()).add(c));
+  }
+  const out: string[] = [];
+  const seen = new Set<string>();
+  const visit = (pkg: string) => {
+    if (seen.has(pkg) || centreOf(view, pkg) !== pkg) return;
+    for (const id of [pkg, ...[...(inside.get(pkg) ?? [])].sort(cmp)]) {
+      if (!seen.has(id)) out.push(id);
+      seen.add(id);
+    }
+  };
+  for (const x of view.violations?.new ?? []) visit(x.from);
+  for (const pkg of view.changed ?? []) visit(pkg);
+  walks.set(view, out);
+  return out;
+}
+
+// placeOf is a Centre's place on the walk: its index; for a Centre off the
+// walk, just after its package's, so n goes on into that package; or just
+// before the walk (the tree, or a package the walk does not visit).
+function placeOf(view: View, walk: string[], centre: string | null): number {
+  if (centre === null) return -0.5;
+  const i = walk.indexOf(centre);
+  return i >= 0 ? i : walk.indexOf(packageOf(screenView(view), centre) ?? centre) + 0.5;
+}
+
+// step is s one step along the walk, forward (n) or back (p): from the tree,
+// n starts it. Past either end s is returned as it is.
+export function step(view: View, s: ViewState, dir: 1 | -1): ViewState {
+  const walk = walkOf(view);
+  const at = placeOf(view, walk, s.centre);
+  const to = dir > 0 ? Math.floor(at) + 1 : Math.ceil(at) - 1;
+  return to >= 0 && to < walk.length ? centreAt(s, walk[to]) : s;
+}
+
+// walkAt says which step a Centre is, from 1, or null off the walk.
+export function walkAt(view: View, centre: string | null): { at: number | null; of: number } {
+  const walk = walkOf(view);
+  const i = centre === null ? -1 : walk.indexOf(centre);
+  return { at: i >= 0 ? i + 1 : null, of: walk.length };
+}
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Commit:** `Walk a Change View in reading order with n and p`

---

### Task 4: The page draws it (`App.tsx`, `ScreenCanvas.tsx`, `styles.css`, `headline.ts`)

The unit tests check:
- a ghost's box, its line and its Legend swatch are dotted; a ghost's line uses `stroke-dasharray: 2 4`, apart from a Move's dashes;
- the changed subgraph's dimming of affected boxes leaves out Screen boxes;
- `redLegend` on the Screen names only what a red line violates.

`screen.mjs` runs in Chromium, Firefox and WebKit. 17's **change** check, that a Change View draws no Screen, is replaced by eight checks on the shop Change View and on **far**. far is the shop Change View with:
- `internal/audit`, which money imports unchanged, so it is in no Affected Set and the changed subgraph leaves it out;
- its `Check`, a near declaration that `money.Plus` calls;
- a Policy (Levels checkout, then store) that checkout's import of store breaks, listed as a new violation.
- **walk:**
  - on the tree, the walk toolbar reads "10 steps";
  - `n` draws store's Screen (checkout and money above; money's ghost and `lib/pq` below), adds one history entry, and reads "1 of 10".
- **marks:**
  - store and money's box are `st-modified`, and money's line is `edge-reversed`, labelled ⇄;
  - money's ghost box and its line are `ghost`;
  - the Centre lists ~ Order, − ReadWriter, ~ Repo.Get and ~ Repo.check.
- **affected:** the note says "Affected Set: changed; 4 packages import it, directly or not.", and the Legend has the ghost swatch.
- **step:**
  - `n` draws store.Order's Screen, with the near Cart above, and reads "2 of 10";
  - `p` returns to store's Screen, and Back to store.Order's, with three history entries in all.
- **near:** a click on Cart draws its Screen, "– of 10", and the Panel shows Cart.
- **leave:** Esc returns to the tree with checkout selected, no `c`, and checkout centred.
- **full:** on far, from money.Plus's Screen, a click on audit.Check and then `s` select `internal/audit`. That draws the full graph (no `.app.subgraph`), with audit centred.
- **red:** on far, `n` from the tree draws checkout's Screen, the new violation's importer. Its line to store is `pinned`, it is the only red line, and the Legend reads "violates zu.policy.yaml (levels or cycle)".

A Project View's Screen with a red line (Deviation 12) is checked by the unit tests only: Task 2's flags the line, and `redLegend`'s test words the swatch. No browser check opens one.

`leave` already holds after Task 3, whose `lens.ts` change it checks in the browser.

**Files:**
- Tests: `web/src/screen.test.ts`, `web/src/headline.test.ts`, `web/e2e/screen.mjs`
- Code: `web/src/App.tsx`, `web/src/ScreenCanvas.tsx`, `web/src/styles.css`, `web/src/headline.ts`

**Steps:**

- [ ] **Write the failing tests and browser checks**

```diff
diff --git a/web/e2e/screen.mjs b/web/e2e/screen.mjs
index e644c5d..3686a4f 100644
--- a/web/e2e/screen.mjs
+++ b/web/e2e/screen.mjs
@@ -1,5 +1,6 @@
-// Browser acceptance for the Screen (17). Not part of make check: it needs
-// browsers. Run from web/e2e after `make build`: npm run accept-screen.
+// Browser acceptance for the Screen (17), and in a Change View (18). Not part
+// of make check: it needs browsers. Run from web/e2e after `make build`: npm
+// run accept-screen.
 // ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
 import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
 import { tmpdir } from "node:os";
@@ -33,7 +34,25 @@ const many = (() => {
 
 const S = "example.com/shop/internal/store";
 const C = "example.com/shop/internal/checkout";
+const M = "example.com/shop/internal/money";
+const A = "example.com/shop/internal/audit";
 const enc = encodeURIComponent;
+// far: shop.change with internal/audit, which money imports unchanged, so
+// it is in no Affected Set and the changed subgraph leaves it out; money.Plus
+// calls its Check, a near declaration. And a Policy that checkout's import of
+// store breaks, a new violation.
+const far = (() => {
+  const v = golden("shop.change");
+  const loc = { path: "internal/audit/audit.go", line: 1 };
+  v.nodes.push({ id: A, kind: "package", module: "example.com/shop", loc, decls: 1 });
+  v.edges.push({ from: M, to: A, kind: "imports", count: 1, loc: { path: "internal/money/money.go", line: 3 } });
+  v.near.nodes.push({ id: `${A}.Check`, kind: "function", parent: A, loc });
+  v.near.edges.push({ from: `${M}.Plus`, to: `${A}.Check`, kind: "calls", count: 1, loc });
+  v.policy = { hash: "sha256:far", levels: [[C], [S]] };
+  for (const e of v.edges) if (e.kind === "imports" && e.from === C && e.to === S) e.violation = "levels";
+  v.violations = { new: [{ rule: "levels", from: C, to: S }], fixed: [], known: 0 };
+  return page("far", v);
+})();
 
 async function open(b, file, hash) {
   const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
@@ -140,22 +159,80 @@ async function rows(b) {
   return { got, errors: [...bare.errors, ...errors] };
 }
 
+// changeView: the Screen in a Change View (18).
 async function changeView(b) {
-  const { p, errors } = await open(b, change, `#s=${enc(S)}`);
-  await p.keyboard.press("s");
-  await p.waitForTimeout(500);
-  const pressed = (await centre(p)) === null && !(await p.locator(".screen").count());
+  const { p, errors } = await open(b, change, "");
+  const got = {};
+  const start = await entries(p);
+  const at = () => p.locator('[aria-label="Walk the change"] .at').innerText({ timeout: 1000 }).catch(() => null);
+  const onTree = await at();
+  // n starts the walk from the tree at store, the first changed package bottom-up.
+  await p.keyboard.press("n");
+  const first = await drawn(p, S);
+  got.walk = [
+    JSON.stringify(first) === JSON.stringify([S, `down:${M}`, "down:github.com/lib/pq", `up:${C}`, `up:${M}`].sort()),
+    (await entries(p)) === start + 1, onTree, await at(),
+  ];
+  // Each box's mark and line's status; the reversed import's ghost; the Centre's members.
+  got.marks = await p.evaluate(({ S, M }) => {
+    const box = (id) => document.querySelector(`.screen .react-flow__node[data-id="${CSS.escape(id)}"] .screen-box`);
+    const line = (id) => document.querySelector(`.screen .react-flow__edge[data-id="${CSS.escape(id)}"]`);
+    const has = (e, c) => !!e && e.classList.contains(c);
+    return [
+      has(box(S), "st-modified"), has(box(`up:${M}`), "st-modified"), has(line(`up:${M}>`), "edge-reversed"),
+      line(`up:${M}>`)?.querySelector(".react-flow__edge-text")?.textContent ?? null,
+      has(box(`down:${M}`), "ghost"), has(line(`>down:${M}`), "ghost"),
+      [...(box(S)?.querySelectorAll(".member") ?? [])].map((e) => e.textContent),
+    ];
+  }, { S, M });
+  got.affected = (await p.locator("#zu-screen").innerText()).includes("Affected Set: changed; 4 packages import it, directly or not.")
+    && (await p.locator(".legend .swatch.ghost").count()) === 1;
+  // n and p step along the walk, each a history entry, and Back walks back.
+  await p.keyboard.press("n");
+  const order = await drawn(p, `${S}.Order`);
+  const second = await at();
+  await p.keyboard.press("p");
+  await drawn(p, S);
+  await p.goBack();
+  got.step = [order.includes(`up:${C}.Cart`), second, (await drawn(p, `${S}.Order`)).length > 0, (await entries(p)) === start + 3];
+  // A near box re-centres, off the walk; leaving there selects its package.
+  await p.click(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}.Cart`)}"]`);
+  await drawn(p, `${C}.Cart`);
+  got.near = [await at(), (await panel(p))?.startsWith(`${C}.Cart`)];
+  await p.keyboard.press("Escape");
+  await drawn(p, null);
+  const left = await hash(p);
+  got.leave = [left.c ?? null, left.s, await centred(p, C)];
   await p.close();
-  const linked = await open(b, change, `#c=${enc(S)}`);
-  const ignored = (await centre(linked.p)) === null && !(await linked.p.locator(".screen").count());
-  await linked.p.close();
-  return { got: { change: pressed && ignored }, errors: [...errors, ...linked.errors] };
+  // Leaving for a package the changed subgraph leaves out draws all of the View (U10).
+  const f = await open(b, far, `#c=${enc(`${M}.Plus`)}`);
+  await drawn(f.p, `${M}.Plus`);
+  await f.p.click(`.react-flow__node[data-id="${CSS_ESCAPE(`down:${A}.Check`)}"]`);
+  await drawn(f.p, `${A}.Check`);
+  await f.p.keyboard.press("s");
+  await drawn(f.p, null);
+  got.full = [(await hash(f.p)).s, await f.p.locator(".app.subgraph").count(), await centred(f.p, A)];
+  await f.p.close();
+  // A new violation's importer is the walk's first step, its line red as the tree draws it.
+  const r = await open(b, far, "");
+  await r.p.keyboard.press("n");
+  await drawn(r.p, C);
+  got.red = await r.p.evaluate((S) => [
+    document.querySelector(`.screen .react-flow__edge[data-id="${CSS.escape(`>down:${S}`)}"]`)?.classList.contains("pinned") ?? null,
+    document.querySelectorAll(".screen .react-flow__edge.pinned").length,
+    document.querySelector(".legend .swatch.violation")?.textContent ?? null,
+  ], S);
+  await r.p.close();
+  return { got, errors: [...errors, ...f.errors, ...r.errors] };
 }
 
 const CSS_ESCAPE = (s) => s.replace(/["\\]/g, "\\$&");
 const want = {
   enter: true, button: [true, "true"], panel: [true, null, true], recentre: true, back: true, forward: true, keyboard: [C, C],
-  wordStart: true, honest: true, esc: true, more: true, disabled: true, change: true, errors: [],
+  wordStart: true, honest: true, esc: true, more: true, disabled: true, errors: [],
+  walk: [true, true, "10 steps", "1 of 10"], marks: [true, true, true, "⇄", true, true, ["~ Order", "− ReadWriter", "~ Repo.Get", "~ Repo.check"]],
+  affected: true, step: [true, "2 of 10", true, true], near: ["– of 10", true], leave: [null, C, true], full: [A, 0, true],
+  red: [true, 1, "violates zu.policy.yaml (levels or cycle)"],
 };
 const channel = process.env.ZU_E2E_CHANNEL;
 const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
diff --git a/web/src/headline.test.ts b/web/src/headline.test.ts
index c60432f..0329da1 100644
--- a/web/src/headline.test.ts
+++ b/web/src/headline.test.ts
@@ -79,4 +79,7 @@ describe("redLegend (07)", () => {
     expect(redLegend(null)).toBe("violates zu.policy.yaml (levels or cycle); a red box holds one");
     expect(redLegend("Hexagon")).toBe("violates Proposal Hexagon's layers; a red box holds one");
   });
+  it("names only the red line on the Screen, which draws no box red (18)", () => {
+    expect(redLegend(null, true)).toBe("violates zu.policy.yaml (levels or cycle)");
+  });
 });
diff --git a/web/src/screen.test.ts b/web/src/screen.test.ts
index 13e7239..89145eb 100644
--- a/web/src/screen.test.ts
+++ b/web/src/screen.test.ts
@@ -174,6 +174,15 @@ describe("the Screen's styles (17)", () => {
     expect([px("medium"), px("large"), px("centre")].map(Number)).toEqual([FONT.medium, FONT.large, FONT.centre]);
     expect(FONT.small).toBe(LABEL_PX); // .node's own size, so the floor zoom keeps every label readable
   });
+  it("draws a ghost and its line dotted, apart from a Move's dashes (18)", () => {
+    expect(css).toMatch(/\.node\.screen-box\.ghost \{[^}]*border-style: dotted/);
+    expect(css).toMatch(/\.react-flow__edge\.ghost path \{[^}]*stroke-dasharray: 2 4/);
+    expect(css).toMatch(/\.legend \.swatch\.ghost \{[^}]*border-style: dotted/);
+  });
+  it("draws an affected box plain, as every Screen box is, though the changed subgraph dims the tree's (18)", () => {
+    expect(css).toMatch(/\.subgraph \.node\.affected:not\(\.screen-box\) \{[^}]*opacity: 0\.6/);
+    expect(css).not.toMatch(/\.subgraph \.node\.affected \{/);
+  });
 });
 
 describe("screenNote (17)", () => {
```

- [ ] **Run:** `cd web && npx vitest run src/screen.test.ts src/headline.test.ts` Expected: FAIL (3 tests: no ghost rule in the CSS, the subgraph dims every affected box, and `redLegend` takes no Screen)

- [ ] **Run:** `cd web && npx vite build >/dev/null && cd e2e && node screen.mjs` Expected: FAIL (14/21 checks pass in each engine: walk, marks, affected, step, near, full and red fail; there is no walk toolbar, no mark, no red line, and leaving audit.Check keeps the subgraph)

- [ ] **Draw the walk toolbar, the marks, the ghosts, the red lines and the members**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 9695a3d..fbf1cf8 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -2,7 +2,7 @@ import { useEffect, useMemo, useRef, useState } from "react";
 import { ReactFlowProvider } from "@xyflow/react";
 import { Canvas } from "./Canvas";
 import { changedSubgraph, nodeMark } from "./change";
-import { home, isBox, upTo } from "./cut";
+import { home, index, isBox, upTo } from "./cut";
 import type { View } from "./data";
 import { isGroup } from "./group";
 import { pageEngine } from "./engine";
@@ -18,12 +18,12 @@ import { PROPOSAL_NOTICE, proposalView } from "./proposal";
 import { reveal } from "./search";
 import { SearchBox } from "./SearchBox";
 import { DRAW_LIMIT, fitDepth, HUBS, opening, openFull, scene, type Scene, type SceneNode } from "./scene";
-import { centreOf, placeScreen, screenNote, screenOf } from "./screen";
+import { centreOf, placeScreen, screenNote, screenOf, screenView } from "./screen";
 import { ScreenCanvas } from "./ScreenCanvas";
 import { centreAt, deeper, drill, nextStage, select, shallower, toggle, up, type ViewState } from "./state";
 import { Toolbar } from "./Toolbar";
 import { useViewState } from "./useViewState";
-import { step } from "./walk";
+import { step, walkAt } from "./walk";
 
 const PKG = "#pkg";
 const FRAMES = 64; // 15: the most layouts the page keeps (place.ts)
@@ -33,12 +33,13 @@ type LegendProps = {
   change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null;
   onDemand: boolean; // 11: lines show for a selected or hovered box
   hubs: boolean; // 11: some box is drawn as one of the most used
+  screen?: boolean; // 18: the Screen: a Change View's marks and ghosts, red lines, no rows
 };
 
-function Legend({ change, policy, ranks, crap, proposal, onDemand, hubs }: LegendProps) {
+function Legend({ change, policy, ranks, crap, proposal, onDemand, hubs, screen }: LegendProps) {
   return (
     <div className="legend" aria-label="Legend">
-      <span className="rows">rows are dependency order: a box mostly uses the rows below it</span>
+      {!screen && <span className="rows">rows are dependency order: a box mostly uses the rows below it</span>}
       {onDemand && <span className="dirs">hover or select a box for its lines: solid, it uses · dotted, used by</span>}
       {hubs && <span className="swatch hub">thick border: the {HUBS} most used</span>}
       {change && (
@@ -48,10 +49,11 @@ function Legend({ change, policy, ranks, crap, proposal, onDemand, hubs }: Legen
           <span className="swatch st-modified">modified</span>
           <span className="swatch st-moved">moved</span>
           <span className="swatch affected">affected</span>
-          <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
+          {screen && <span className="swatch ghost">dotted: where a reversed import was in base</span>}
+          <span>{screen ? "lines" : "edges"}: + added · − removed · ⇄ reversed · ± mixed</span>
         </>
       )}
-      {policy && <span className="swatch violation">{redLegend(proposal)}</span>}
+      {policy && <span className="swatch violation">{redLegend(proposal, screen)}</span>}
       {ranks && <span>n: Level, 0 = innermost, drawn at the bottom</span>}
       {crap && (
         <>
@@ -130,8 +132,8 @@ export function App({ view: whole }: { view: View }) {
     () => (change || state.proposal === null ? whole : proposalView(whole, state.proposal)),
     [whole, change, state.proposal],
   );
-  // 17: the Screen of the Centre, drawn instead of the tree: never in a Change
-  // View (knownIds), and in a Proposal over the Proposal's View.
+  // 17: the Screen of the Centre, drawn instead of the tree, in a Proposal
+  // over the Proposal's View; 18: in a Change View over its near neighbours too.
   const centre = drawnCentre(proposed, state);
   const onScreen = centre !== null;
   const screen = useMemo(
@@ -139,8 +141,16 @@ export function App({ view: whole }: { view: View }) {
     [proposed, centre, state.more],
   );
   const drawing = useMemo(() => screen && placeScreen(screen), [screen]);
+  const red = drawing?.edges.some((e) => e.violation) ?? false; // 18: a Screen line the Policy forbids
   const canEnter = centreOf(proposed, state.selected) !== null;
-  const lens = () => update((s) => (s.centre === null ? enter(proposed, s) : leave(proposed, s)));
+  const lens = () => {
+    // 18: leaving for a box the changed subgraph leaves out draws all of the
+    // View (U10), as jump does.
+    const left = state.centre === null ? null : leave(proposed, state).selected;
+    if (change && !full && left !== null && index(whole).node.has(left) && !view.nodes.some((n) => n.id === left)) setFull(true);
+    update((s) => (s.centre === null ? enter(proposed, s) : leave(proposed, s)));
+  };
+  const walk = walkAt(proposed, centre); // 18: where the Screen is on the walk through the change
   const recentre = (id: string) => {
     const c = centreOf(proposed, id);
     if (c !== null) update((s) => centreAt(s, c));
@@ -336,22 +346,33 @@ export function App({ view: whole }: { view: View }) {
         screen={screen ? screenNote(screen) : undefined}
       />
       <div className="bar">
-        {!change && (
-          <div className="toolbar" role="toolbar" aria-label="Lens">
-            <button
-              type="button"
-              aria-pressed={onScreen}
-              disabled={!onScreen && !canEnter}
-              title={onScreen ? "Back to the tree (s)" : canEnter ? "Draw the selection's Screen (s)" : "Select a package or declaration to draw its Screen (s)"}
-              onClick={lens}
-            >
-              Screen
+        <div className="toolbar" role="toolbar" aria-label="Lens">
+          <button
+            type="button"
+            aria-pressed={onScreen}
+            disabled={!onScreen && !canEnter}
+            title={onScreen ? "Back to the tree (s)" : canEnter ? "Draw the selection's Screen (s)" : "Select a package or declaration to draw its Screen (s)"}
+            onClick={lens}
+          >
+            Screen
+          </button>
+          {screen && (state.more || screen.above.more > 0 || screen.below.more > 0) && (
+            <label>
+              <input type="checkbox" checked={state.more} onChange={(e) => update((s) => ({ ...s, more: e.target.checked }))} /> every box
+            </label>
+          )}
+        </div>
+        {change && walk.of > 0 && (
+          <div className="toolbar walk" role="toolbar" aria-label="Walk the change">
+            <button type="button" aria-label="Previous step" title="The previous step of the change (p)"
+              disabled={step(proposed, state, -1) === state} onClick={() => update((s) => step(proposed, s, -1))}>
+              ◂
+            </button>
+            <span className="at">{onScreen ? `${walk.at ?? "–"} of ${walk.of}` : `${walk.of} ${walk.of === 1 ? "step" : "steps"}`}</span>
+            <button type="button" aria-label="Next step" title={onScreen ? "The next step of the change (n)" : "Walk the change in reading order (n)"}
+              disabled={step(proposed, state, 1) === state} onClick={() => update((s) => step(proposed, s, 1))}>
+              ▸
             </button>
-            {screen && (state.more || screen.above.more > 0 || screen.below.more > 0) && (
-              <label>
-                <input type="checkbox" checked={state.more} onChange={(e) => update((s) => ({ ...s, more: e.target.checked }))} /> every box
-              </label>
-            )}
           </div>
         )}
         {!onScreen && (
@@ -382,6 +403,9 @@ export function App({ view: whole }: { view: View }) {
             hubs={sc.nodes.some((n) => n.hub)}
           />
         )}
+        {onScreen && (change || red) && (
+          <Legend change={change} screen policy={red} ranks={false} crap={false} proposal={proposed === whole ? null : state.proposal} onDemand={false} hubs={false} />
+        )}
         {sc !== requested && !onScreen && (
           <div className="notice" id="zu-notice" role="status">
             Collapsed to depth {sc.depth}: depth {requested.depth} has{" "}
@@ -452,7 +476,7 @@ export function App({ view: whole }: { view: View }) {
       </main>
       {centre !== null && closed !== centre && (
         <Panel
-          view={proposed}
+          view={screenView(proposed)}
           id={isBox(proposed, centre + PKG) ? centre + PKG : centre}
           edge={null}
           bundles={[]}
diff --git a/web/src/ScreenCanvas.tsx b/web/src/ScreenCanvas.tsx
index 546d9bd..8759786 100644
--- a/web/src/ScreenCanvas.tsx
+++ b/web/src/ScreenCanvas.tsx
@@ -19,13 +19,15 @@ import {
 } from "@xyflow/react";
 import { useEffect, useMemo, useRef, useState } from "react";
 import "@xyflow/react/dist/style.css";
+import { edgeMark } from "./change";
 import type { Drawn, ScreenDrawing } from "./screen";
 import { centredFit, mapByDefault } from "./viewport";
 
 type SNode = Node<{ d: Drawn }>;
 
 // ScreenBox: the label at its Weight's size, the package or module under it,
-// and what the Weight is made of.
+// and what the Weight is made of. 18: in a Change View, its mark (change.ts),
+// a ghost dotted, and the Centre's changed members.
 function ScreenBox({ data: { d } }: NodeProps<SNode>) {
   const at = useRef<HTMLDivElement>(null);
   // Focus, lost with the last Screen (the page keys it by Centre), goes to
@@ -36,12 +38,13 @@ function ScreenBox({ data: { d } }: NodeProps<SNode>) {
     }
   }, [d.row]);
   return (
-    <div ref={at} className={`node screen-box ${d.size} k-${d.kind}${d.both ? " both" : ""}`} title={d.ref ?? `${d.label}: click to draw every box`}>
+    <div ref={at} className={`node screen-box ${d.size} k-${d.kind}${d.both ? " both" : ""}${d.mark ? ` ${d.mark}` : ""}${d.ghost ? " ghost" : ""}`} title={d.ref ?? `${d.label}: click to draw every box`}>
       <Handle type="target" position={Position.Top} isConnectable={false} />
       <Handle type="source" position={Position.Bottom} isConnectable={false} />
       <div className="label">{d.label}</div>
       {d.sub && <div className="sub">{d.sub}</div>}
       {d.facts && <div className="facts">{d.facts}</div>}
+      {d.members.map((m) => <div key={m} className="member">{m}</div>)}
     </div>
   );
 }
@@ -88,9 +91,17 @@ export function ScreenCanvas({ drawing, onCentre, onMore, fit }: Props) {
     connectable: false,
     data: { d },
   })), [drawing]);
-  const edges: Edge[] = useMemo(() => drawing.edges.map((e) => ({
-    id: e.id, source: e.from, target: e.to, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed },
-  })), [drawing]);
+  // 18: a line's status as the tree draws a bundle's (Canvas), its sign the
+  // label, and red (pinned) when it holds a violation; a ghost's line is
+  // dotted and unsigned: its box says ⇄.
+  const edges: Edge[] = useMemo(() => drawing.edges.map((e) => {
+    const m = edgeMark(e.status);
+    const className = [m.cls, e.ghost && "ghost", e.violation && "pinned"].filter(Boolean).join(" ");
+    return {
+      id: e.id, source: e.from, target: e.to, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed },
+      ...(className ? { className } : {}), ...(m.sign && !e.ghost ? { label: m.sign } : {}),
+    };
+  }), [drawing]);
   return (
     <div className="flow-row">
       {/* Enter or Space on a focused box re-centres, as a click does. */}
diff --git a/web/src/headline.ts b/web/src/headline.ts
index f127223..6aaa2e3 100644
--- a/web/src/headline.ts
+++ b/web/src/headline.ts
@@ -81,6 +81,7 @@ export function violationsNote(d: NonNullable<View["violations"]>): { heading: s
 }
 
 // redLegend says what a red edge or box violates: the Policy's Levels and
-// cycles, or, while a Proposal is drawn, only that Proposal's layers.
-export const redLegend = (proposal: string | null): string =>
-  `violates ${proposal === null ? "zu.policy.yaml (levels or cycle)" : `Proposal ${proposal}'s layers`}; a red box holds one`;
+// cycles, or, while a Proposal is drawn, only that Proposal's layers. The
+// Screen (18) draws only lines red.
+export const redLegend = (proposal: string | null, screen = false): string =>
+  `violates ${proposal === null ? "zu.policy.yaml (levels or cycle)" : `Proposal ${proposal}'s layers`}${screen ? "" : "; a red box holds one"}`;
diff --git a/web/src/styles.css b/web/src/styles.css
index 4dc3201..58a51b7 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -277,6 +277,22 @@ pre {
   white-space: nowrap;
 }
 
+/* 18: the Screen in a Change View. A ghost is where a reversed import's far
+   end was in base: dotted, muted, its line dotted, apart from a Move's dashes.
+   The Centre lists its changed members, signed + ~ − →. */
+.node.screen-box.ghost {
+  background: var(--bg);
+  border-style: dotted;
+  color: var(--muted);
+}
+.react-flow__edge.ghost path {
+  stroke-dasharray: 2 4;
+}
+.node.screen-box .member {
+  font-size: 11px;
+  white-space: nowrap;
+}
+
 .node.selected {
   outline: 2px solid var(--accent);
 }
@@ -404,7 +420,8 @@ button.st-removed {
 .node.has-change {
   border-color: var(--modified);
 }
-.subgraph .node.affected {
+/* 18: not a Screen box: the Screen marks an affected box but dims none. */
+.subgraph .node.affected:not(.screen-box) {
   opacity: 0.6;
 }
 .node.chip {
@@ -482,6 +499,10 @@ button.st-removed {
   border-style: dashed;
   border-color: var(--accent);
 }
+.legend .swatch.ghost {
+  border-style: dotted;
+  color: var(--muted);
+}
 .legend .swatch.crap-green {
   background: var(--crap-green);
 }
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node screen.mjs` Expected: PASS (21 checks in each engine)

- [ ] **Commit:** `Draw the walk and the change on the Screen`

---

### Task 5: Acceptance

**Files:**
- Record: `docx/features/18-change-screen/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [ ] **Run:** `cd web/e2e && node place.mjs` Expected: PASS (9 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (11 checks in each engine)

- [ ] **Run:** `cd web/e2e && node screen.mjs` Expected: PASS (21 checks in each engine)

- [ ] **Measure** (by hand; not a replay step).
  1. In `.zu/corpus/kubernetes@v1.37.0` and `.zu/corpus/hugo@v0.166.0`, run `bin/zu diff HEAD~50 -max-parse-errors 1000000 -html <scratch>/<name>.html`. These clones are read-only: never clone, edit or check out in them. `scripts/bench-corpus.sh` deepens them so HEAD~50 is reachable. Check `git status --porcelain` is empty before and after.
  2. Run `node docx/features/18-change-screen/measure.mjs . <scratch>/kubernetes.html <scratch>/hugo.html`.
  3. Record the table in `acceptance.md`.

  Pass criteria:
  - enter is under 200 ms;
  - the step and Back medians are under 100 ms;
  - every engine reports no page errors.

  Report the worst case beside the tree Panel's time for the same Centres.

- [ ] **The user's check** (by hand; `zu serve -base <ref>` or `zu diff <ref> -html` on a real change).
  1. Press `n`. The first changed package's Screen is drawn, with its changed members on the Centre and "1 of N" in the toolbar.
  2. Walk on with `n` and ▸ through a few steps, then back with `p`, ◂ and the browser's Back.
  3. On a Screen whose package import was reversed, the far end is in one row and its dotted ghost in the other.
  4. Click an unchanged box, then press `n`. The walk goes on from that box's package.
  5. Press Esc. The tree is drawn with the Centre's package selected.
  6. On a change with a new violation, the walk's first step is its importer, with the violating line red.

- [ ] **Commit:** `Record the Screen in a Change View's acceptance`

---

## Risks

- **`near` grows with a type's methods.** Every method of a type on the page is near, so a change that touches one method of a large type brings the whole method set. cobra HEAD~10 has 3 drawn declarations and 153 near nodes, because `cobra.Command` is on the page. A modified function with many callers brings each caller and its type the same way. On the corpus, `near` added 0.1–9% to the page (hugo HEAD~50: 756 near nodes, 261 KB). Nothing caps it. A cap would leave a type's Screen counting only some of its methods' calls, with no way to say which.
- **The Panel's source pane is slow on long files in WebKit.** A step to a declaration in a 2,600–3,300-line file takes 120–162 ms there. The tree's Panel takes as long or longer for the same declarations (145–177 ms), so this is the Panel, as 17's WebKit swap was. 17's follow-up, a Panel keyed per id, would serve both.
- **Calls to a Move's old name are on no Screen.** A Move's source is in no tree the page draws, so every edge to it is left out. A removed declaration that called it shows no line to it. Neither does an unchanged caller of the old name that the change rewrote to call the new one: in base, `tools/gen.main` called `money.Add`, and that call is on no Screen. The moved declaration's own Screen shows its head callers, and the Panel's diff shows the rewritten call. Counting those base calls on the Move target's note is a follow-up.
- **A ghost relies on the diff's fold.** `diff.fold` reports a reversal once, in head's direction, and the View keeps no base edge for it. If the diff ever wrote both directions, the Screen would draw the base edge as a removed line and the ghost too. Task 2's ghost tests pin today's fold.
- **A long walk.** kubernetes HEAD~50 has 164 steps, and each adds a history entry. The changed-packages list (U11) and search jump anywhere, and `n` goes on from there (Deviation 6).
- **`screen.mjs` waits fixed times,** as 17's checks do: 300 ms after a page loads and 150 ms after a Screen draws.
- **The replay depends on 16 and 17.** Task 1's diff of `change.go` and `change_test.go` is against 16's version, and Tasks 2–4 against 17's code. If either changes before it lands, regenerate these diffs from a scratch branch on the new base.

## Notes

- **Task count: 5**, within Quick mode's limit.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given, in the replay.
  - Task 1 is red on a build error.
  - Task 2 is red on assertions and one missing function.
  - Task 3 is red on a missing module and on assertions.
  - Task 4 is red on assertions, and in the browser in all three engines.
- **The model never authors the graph.** `near` holds only head's and base's nodes and edges, as the parser wrote them: the export selects them, and nothing is inferred. A ghost is drawn from one of the View's edges, its far end a node of the View. The IR is untouched: `go test ./...` passes with the IR goldens unchanged, and only the shop Change View golden changes.
- **Follow-ups, not in 18:**
  - 19, the Code panel;
  - golden walks;
  - 17's Panel keyed per id, now for the source pane too (**Risks**);
  - a focus ring on both lenses (17's).
- **Visual checks.** Screenshots of the tree and the first five steps of the shop Change View's walk were taken in the scratch build, in light and dark. Store's ghost, money's ghost on a wide row (at the floor zoom with the Panel open, Deviation 5), the removed ReadWriter's Screen and Repo's members all read as intended. They turned up nothing to fix. After the scrutiny fixes, checkout's Screen on far was shot in light and dark: the line to store is red and the Legend names the Policy.
- **Scrutiny.** A fresh agent scrutinized the draft (verdict: fix-then-ship) and reproduced the draft's scratch head byte for byte from the plan; the **Replay record** covers the revised head. Every finding was fixed in the task that owns it, and the scratch branch was rebuilt red by red:
  - **Major:** the walk started at a new violation's importer, but the Screen drew no violation. Lines now carry `violation`, drawn red (Architecture 2 and 4, Deviation 12, Task 2's and Task 4's red check).
  - The changed subgraph's dimming reached affected Screen boxes, against Deviation 1. Fixed in `styles.css`, with a test.
  - 17's sentences "`n` is kept for 18" and "A Change View has no Screen until 18" are now deleted by the amendments, and the off-count wording gains its Change View case.
  - The Move-source risk was too narrow: unchanged callers of the old name are lost too. Reworded (**Risks**).
  - `view.go` and `data.ts` are 17's files too (**Overlap**).
  - A removed package's note read "not in it"; it now says it is removed and why.
  - far's audit was described as two hops from the change while calling into it; it is now a callee, which is what leaves a package outside the changed subgraph.
  - The cap test's title read "lists undefined members" at red; it is now literal.
  - The Measurements now name every worst case over 100 ms.
  - Not changed: a ghost is placed after its row's boxes, so it lands at a line's outer edge (Deviation 5 covers its width).

## Replay record

Replayed with `replay.py` on a fresh `git archive` of `main` at c6f85b7, in a scratch directory, after 16's and 17's replays. `node_modules` was clone-copied from the repository (`cp -cR`), and Playwright's three browsers were already installed. This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `go test ./internal/export -run 'TestChangeNear'` | 1 |
| 1 | green | `go test ./... && cd web && npx vitest run && npm run typecheck` | 0 |
| 2 | red | `cd web && npx vitest run src/screen.test.ts src/proposal.test.ts src/state.test.ts` | 1 |
| 2 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 3 | red | `cd web && npx vitest run src/walk.test.ts src/keys.test.ts src/lens.test.ts` | 1 |
| 3 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 4 | red | `cd web && npx vitest run src/screen.test.ts src/headline.test.ts` | 1 |
| 4 | red | `cd web && npx vite build >/dev/null && cd e2e && node screen.mjs` | 1 |
| 4 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 4 | green | `make build >/dev/null && cd web/e2e && node screen.mjs` | 0 |
| 5 | green | `make check` | 0 |
| 5 | green | `cd web/e2e && node accept.mjs` | 0 |
| 5 | green | `cd web/e2e && node place.mjs` | 0 |
| 5 | green | `cd web/e2e && node serve.mjs` | 0 |
| 5 | green | `cd web/e2e && node screen.mjs` | 0 |

- 16's and 17's replays, before this one, passed every step. Their tree was byte-identical to the scratch branch's base commit in every source file (`diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output).
- After Task 5, the replayed tree was byte-identical to the scratch branch's last commit in the same way (git tree 354b153; 22 files change against the base).
- `golangci-lint run ./...` on the scratch branch's last commit: no issues. Task 5's `accept.mjs`, `place.mjs`, `serve.mjs` and `screen.mjs` passed 57, 9, 11 and 21 checks in each engine.
- The red reasons were seen as stated:
  - Task 1: the build fails, `v.Near` undefined.
  - Task 2: 13 tests.
  - Task 3: the missing module, `n` mapping to nothing, and leaving Cart: 3 failures.
  - Task 4: 3 unit tests; `screen.mjs` 14/21 in each engine, with walk, marks, affected, step, near, full and red failing.
  - Task 4's browser reasons were read on the scratch branch's red commit, since `replay.py` prints only each step's last line.
- The draft before the scrutiny fixes also replayed clean, 16 and 17 included. Its tree matched its scratch branch (git tree 3db1e53).
- Toolchain: Go 1.24.5, Node 24.17.0, Python 3.11.17, macOS on an Apple M2.
