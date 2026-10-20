# 17 · The Screen — Plan

**Status:** APPROVED 2026-10-19 (lead, after scrutiny-17, one revision and the replay; advisor sign-off); REVISED 2026-10-20 after a review of 17 and 18 (**Notes**), replayed again. Held: it queues behind 16, which is approved and held; zu builds 16 first, and builds either only when the user says go.

**Base.** Every diff here is against `main` at a18ff85. The diffs come from a scratch branch built on a `git archive` of a18ff85, one commit per red step and one per green step. The plan was replayed on a fresh `git archive` of a18ff85 (**Replay record**). 16 lands first, so this plan must be replayed again on `main` after 16, as 15 was after 14 (**Overlap with 16**).

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 16's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/17-screen/replay.py docx/features/17-screen/plan.md "$S"; rm -rf "$S"
```

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Task 7's `make check`);
- Playwright's three browsers (Tasks 6 and 7).

`measure.mjs`, beside this plan, times the Screen on real pages (**Measurements**). It is not a replay step.

---

## Goal

Add a second lens beside the Package Tree: the **Screen** (new requirement U14, Should). Select a package, type, function or external and press `s`. The page draws that node, the **Centre**, in the middle:
- the row above holds what depends on it;
- the row below holds what it depends on;
- each box is sized by its **Weight**, how much it uses or is used by the Centre.

A click on a box re-centres the Screen on it. The browser's Back returns to the last Screen. `s` or Esc returns to the tree as the reader left it, centred on its selection (Deviation 6). Search also matches the starts of a name's words: `RW` finds ReadWriter.

The idea is codezoom's (github.com/JacobCohenIsrael/grill-and-drill, MIT). 17 takes its patterns only, no code.

The view-model round of 2026-10-19 decided the frame; the user accepted every recommended answer:
- **Diff stays a layer over every lens.** The Screen in a Change View is 18; the Code panel is 19.
- **Q3:** the Screen and the tree's hop filter coexist. Hops stay on the tree.
- **The lenses toggle (`s`); they are not split side by side.**
- **The Screen's grain follows its Centre.** A package's Screen draws imports; a declaration's draws calls and embeds.
- **Weight sizes Screen boxes only.** The tree is unchanged.
- **Nothing is animated.**
- **The Centre is not called the focus.** The hash's `f` already means the container the tree is drilled into.

## Architecture

**1. A pure Screen (`web/src/screen.ts`).** Three functions of the View and the hash; nothing in them reads the DOM.

- **`centreOf(view, id)`** is the Centre a selection names, or null:

  | Selection | Centre |
  |---|---|
  | a package `X`, or its own box `X#pkg` | `X` |
  | a type, a function, an external | itself |
  | a method | its type |
  | a directory box with no package, the outside and externals ovals, a Strip, a Fold chip, an unknown id, nothing | none |
  | anything in a Change View | none (18) |

  When the selection names no Centre, `s` does nothing and the Screen button is disabled; its tooltip says to select a package or declaration.

- **`screenOf(view, centre, all)`** builds the rows from the View's edges, and only from them:

  | Centre | Edges | Above | Below | Weight | Box facts |
  |---|---|---|---|---|---|
  | package, external | imports | the packages that import it | the packages and externals it imports | files that import (the edge's count) | "31 files" |
  | type, function | calls, embeds | the declarations that call or embed it or its methods | what it and its methods call or embed | √(call sites and embeds × the declarations at the box's end) | "3 uses · 2 declarations" |

  - At declaration grain, a method at either end is drawn as its type. An edge inside the Centre (a method calling its own type's method) is not drawn.
  - The square root lets breadth count as well as volume. A type that two of its methods call from 6 sites outweighs one function calling from 6 sites (√12 against √6).
  - **Sizes** are relative to the heaviest box in the row: large from ½ of it, medium from ⅕, small below.
    - A row whose heaviest weighs 2 or less is all medium.
    - An external is always small.
    - A type the Centre embeds is never small.
  - **Labels** are 12, 13 and 15 px for small, medium and large, and 15 px for the Centre. Small is the tree's own label size, so the floor zoom (11/12) never draws a Screen label under 11 px. A box's package line and facts line are 11 px, as the tree's stats lines and rows are.
  - **A row draws its 24 heaviest boxes** (ties by id), then a "+N more" chip. The chip, or the toolbar's "every box", draws every box of both rows (`m=1`).
  - **A box in both rows** (an import cycle, or mutual calls) is drawn in each, its facts marked ↻.
  - **What the Screen leaves out.** At declaration grain the Screen also carries three counts:
    - `offIn` and `offOut`: call sites and embeds into it and out of it, with declarations not on the page (Task 1);
    - `unresolved`: its package's Unresolved Calls (ADR 0002).

- **`placeScreen(screen)`** places the boxes with no ELK, so nothing waits for a layout.
  - The Centre's top-left is at (−w/2, 0).
  - Each row wraps into lines at most ROW_MAX (1,280 px) wide, 12 px apart, with boxes 16 px apart. The heaviest line sits 72 px from the Centre.
  - Each line is centred on the Centre and laid out from its middle: the heaviest box in the centre, the next to its right, the next to its left, and so on. A "+N more" chip ends its line.
  - Each box above gets a line to the Centre, and the Centre gets a line to each box below.
  - A Screen's first view is `centredFit`: all of it when its labels stay readable (as the tree's `readableFit` decides), else the floor zoom with the Centre in the middle of the canvas. Laying lines out from their middle puts the heaviest boxes in that view.

- **`screenNote(screen)`** is the header's note. It says what the rows and sizes are. At declaration grain it also says what the Screen leaves out, for example: "Not drawn: 1 call or embed out of it, with declarations in packages not included (re-run with -include); 4 unresolved calls in its package."

**2. The export counts what the page leaves out (`internal/export/project.go`).** A Project View keeps a call or embed only when both ends are on the page, so a declaration's Screen could not say what it misses. `Project` now counts each dropped call or embed on the end that is on the page:
- `offOut` on its caller (or embedder);
- `offIn` on its callee.

Both are View fields with `omitempty`, on declarations only. An external is on every page, so one that a type off the page embeds counts nothing; its Screen draws imports. The IR is untouched. In the shop golden, three nodes gain a count (Task 1). `export.Change` is untouched; 18 owns the Change View.

**3. The hash.**
- `c=<id>` is the Centre: the Screen is drawn instead of the tree. `m=1` draws its rows whole.
- The tree's fields stay in the hash, as the reader left them, while the Screen is drawn.
- `decodeHash` accepts `c` only where `knownIds(view).centre(id)` holds, that is `centreOf(view, id) === id`. A method, a box that is no node, and anything in a Change View are refused. `m` counts only with a Centre.
- `revalidate` re-decodes against a newer View from `zu serve`, so a lost Centre drops back to the tree.

**4. History.** `storeHash(page, history, s, was)` uses `pushState` only when `was.centre !== s.centre`; every other write still uses `replaceState`. `was` is the address bar decoded against the View. A hash the reader pasted, or Back, therefore never pushes: the state already equals the address bar.
- Pushing writes: entering the Screen, leaving it, re-centring it.
- Replacing writes: "every box", revalidation, and every change on the tree.

`useViewState` reads the hash again on `hashchange`, as it did before 17. Back and Forward between two entries that differ only in the hash fire it in all three engines (`screen.mjs`'s back and forward checks).

**5. The lens (`web/src/lens.ts`).**
- `enter` sets the Centre to the selection's.
- `leave` restores the tree as it was while the Centre is still the selection's. After a re-centre, it draws the tree at the new Centre, selected, as a search pick does (`reveal`).
- `drawnCentre` is the Centre the page draws: the hash's while the View has it. A View from `zu serve`'s watch that lost the Centre renders once before `revalidate` drops it, and the page draws the tree meanwhile.

**6. The page.**
- **`ScreenCanvas.tsx`** draws a `placeScreen` drawing in React Flow, with no ELK and no worker. A click, or Enter or Space on a focused box, re-centres; the chip draws every box. The page keys it by Centre and `m`, so each Screen opens at its own first view. Focus, lost with the old Screen, goes to the new Centre's box, so a reader walking by keyboard (Tab, Enter) goes on from it.
- **`App.tsx`** adds the Lens toolbar:
  - a Screen button (`aria-pressed`), disabled with a title saying why when the selection names no Centre, as the Toolbar's own buttons are;
  - an "every box" checkbox, shown when a row is capped.

  It hides the tree's toolbar, Legend and collapse notice while the Screen is drawn, and skips the tree's layout effect (the tree's scene stays cached). Search picks re-centre on the Screen. The Panel shows the Centre (`X#pkg` when the package has child boxes); its × hides it until the Centre changes. However the Screen is left (`s`, Esc, Back), the tree comes back centred on its selection.
- **`Header.tsx`** shows `screenNote` in place of the breadcrumb and depth note.
- **`keys.ts`:**
  - `s` toggles the lens.
  - Esc on the Screen closes search first, then leaves the Screen.
  - The tree's `d`, `+`, `=` and `-` do nothing on the Screen; `/` and `f` work on both.
  - `n` is kept for 18's walk.
  - A checkbox ("every box", and the Toolbar's externals on the tree) keeps the focus after a click but takes no keys: `App.tsx` no longer counts it as typing, so `s` still leaves the Screen after "every box".
- **A Proposal (07):** the Screen is drawn over the Proposal's View, as the tree is.

**7. Search (`web/src/search.ts`).** A new rank sits between name prefix and id substring: the query is the starts of consecutive words of the name, from any word.
- Words split at case changes, at a run of capitals before a word (`HTTPServer` is HTTP, Server), and at digits.
- The split is cached per View, because search runs on every key.
- Only a query of letters and digits is matched this way.

## Overlap with 16

16 is approved and held, and it lands first. The two plans share no file.
- **16 changes:**
  - `internal/scan/*` and `internal/policy/apply.go`;
  - `internal/ir/encode.go` and `internal/diff/diff.go`;
  - `internal/export/change.go`, `internal/cli/change.go` and their tests;
  - `web/e2e/accept.mjs`.
- **17 changes:**
  - `internal/export/project.go`, `view.go` and `project_test.go`;
  - the shop View golden;
  - `web/src/*`;
  - `web/e2e/screen.mjs` (new), `web/e2e/serve.mjs` and `web/e2e/package.json`.

16 changes no golden. The one shared value is `ir.Edge.Locations`:
- after 16, `Policy.Apply` with no lens shares a canonical IR's location slices;
- Task 1 only reads `len(e.Locations)`.

After 16 lands, replay this plan on `main` and record the result.

## Out of scope

- **The Screen in a Change View (18):** status rows, reversed ghosts, member counts, the `n` walk.
- **The Code panel and on-demand source in `zu serve` (19).** Highlighting an edge's lines needs every location of an edge; the View keeps only the count and the first location, so 19 changes the export.
- **Golden walks** (a scripted tour of Screens), after 19, as 18 says.
- **Agent queries over Screens**, unless decisions.md's line on model features is reopened.
- **A cap per row in the hash** (`m` draws both rows whole), animation, and dragging boxes.
- **The Panel's slow swap in WebKit** (**Risks**): it is the tree's Panel too, and a follow-up.

## Deviations and decisions for review

1. **The Screen adds browser history entries (amends 05's Deviation 5).** Entering, leaving and re-centring push an entry. Every other change still replaces, as 05 decided. Without the entries, Back would leave the page in the middle of a walk, and walking back is how codezoom reads. The page listens only for `hashchange`, as before: Back and Forward fire it in all three engines (`screen.mjs`), so no `popstate` listener is added.
2. **The Screen is placed without ELK.** Lines from the middle are a pure function of the View and the hash, so the same hash draws the same Screen (U3), with no worker round trip.
3. **Each line is laid out from its middle, not in weight order from the left.** At the floor zoom the canvas shows the middle of a wide line. On hugo, weight order from the left put the heaviest importers off the canvas; a box could not be clicked without panning. The cost: a line no longer reads heaviest-first from left to right. Box size and the facts line ("31 files") still show the order.
4. **Labels are 12/13/15 px, not codezoom's spread.** Small is the tree's 12 px. A smaller small label would fall under the 11 px the readable floor promises.
5. **The Screen's Panel shows the Centre** (`X#pkg` for a package with child boxes, as the tree's Panel names a container's own package), and its × closes it until the Centre changes. The tree's Panel is hidden on the Screen.
6. **The tree's pan and zoom are not kept while a Screen is drawn.** The Screen replaces the tree's React Flow, so leaving it, by `s`, Esc or Back, mounts the tree again. The tree comes back centred on its selection, as after a search pick, not where the reader had panned. Keeping the tree mounted and hidden would keep its pan and zoom, at the cost of a second React Flow on the page for the whole walk.
7. **"every box" replaces the history entry.** Only a change of Centre pushes. A new Centre draws its rows capped again (`centreAt`).
8. **Some red steps fail before an assertion runs.**
   - Task 1 fails to build: the Node fields are missing.
   - Task 3 fails on the missing module.
   - Task 4 fails on the missing functions.
   - Task 6's browser checks run on a `vite build` with no type check (and, for `serve.mjs`, a `go build`), because the red tests do not type-check until the code exists. They fail on their checks: the page draws no Screen.
9. **No Screen in a Change View yet.** `centreOf` returns null there: the button is not drawn, `s` does nothing, and a `c=` link is ignored. A `c=` link that a Change View ignores keeps working once 18 adds the Screen there.
10. **Off-page counts are View fields, not IR.** The IR stays byte-identical. Only types and functions carry them: a Project View keeps every import, and every package and external is on every page. The header says which way they go (into it, out of it), so each row's omissions are named.

## Measurements

`measure.mjs` ran on pages built by the scratch branch's `bin/zu`, after the scrutiny revision. The commands were `zu scan -out <scratch>/ir.json -html <scratch>/<name>.html -include <pkg> <corpus dir>`, over:
- `.zu/corpus/kubernetes@v1.37.0` with `-include ./pkg/kubelet`;
- `.zu/corpus/hugo@v0.166.0` with `-include ./hugolib`.

The corpus was only read: `git status --porcelain` was empty before and after.

Each page's Centre is the package the most packages import:
- kubernetes (3,462 nodes, 26,109 edges): `k8s.io/apimachinery/pkg/apis/meta/v1`, 1,201 importers;
- hugo (1,065 nodes, 1,771 edges): `github.com/spf13/cast`, 50 importers.

The browser was 1,400 × 900, on an Apple M2 (8 cores) shared with other sessions. Times are in-page, in ms: from the key or click until the new Centre's box is in the DOM, then two frames.

| Page | Engine | Enter (`s`) | Re-centre ×3 | Re-centre, Panel closed | Every box | Tree Panel swap ×3 |
|---|---|---|---|---|---|---|
| kubernetes | chromium | 73 | 38, 19, 18 | 21, 20, 22 | 185 (1,217 boxes) | 68, 64, 82 |
| kubernetes | firefox | 102 | 60, 32, 52 | 41, 37, 40 | 335 | 102, 76, 116 |
| kubernetes | webkit | 159 | **405**, 64, **417** | 22, 63, 78 | 276 | **459**, 98, **432** |
| hugo | chromium | 30 | 29, 18, 21 | 24, 24, 20 | 18 (51 boxes) | 18, 21, 13 |
| hugo | firefox | 35 | 53, 49, 34 | 18, 24, 34 | 43 | 25, 38, 14 |
| hugo | webkit | 81 | 71, 46, 33 | 34, 52, 45 | 62 | 38, 17, 11 |

- **Enter** takes 30–159 ms, including the Panel's list of 1,201 importers on kubernetes.
- **Re-centring** takes 18–71 ms, except WebKit's two bold cases on kubernetes. Those are the Panel, not the Screen:
  - with the Panel closed, the same re-centres take 22 and 78 ms;
  - the tree's own Panel, moving off `meta/v1` to the same two packages, takes 459 and 432 ms in WebKit.

  WebKit is slow to reconcile the 1,201-item "Imported by" list into a short one (**Risks**).
- **Every box** on `meta/v1` draws 1,217 boxes in 185–335 ms.
- The first draft's build, before the scrutiny revision, measured within the same ranges (enter 35–141 ms, every box 168–367 ms, WebKit's Panel swaps 407–452 ms).

The pages, scripts and raw output stay in the session's scratch directory; they are not committed.

## Doc amendments (exact text; not task steps)

**`docx/glossary.md`, three new entries after Region:**

> ## Screen
>
> A lens beside the Package Tree (17, after codezoom's screens): one node, its Centre, in the middle, what depends on it in the row above and what it depends on in the row below, each box sized by its Weight. Its grain follows the Centre: imports for a package or external, calls and embeds for a type or function, a method drawn as its type. A row draws its 24 heaviest boxes and a "+N more" chip; a box in both rows (a cycle) is drawn in each, marked ↻. While a Screen is drawn, the tree's state stays as the reader left it; the tree comes back centred on its selection.
>
> ## Centre
>
> The node a Screen is drawn around: the selected package, type, function or external, or a selected method's type. A click on another box makes that box the Centre. Not called the focus, which is the container the Package Tree is drilled into (`f` in the URL hash).
>
> ## Weight
>
> How much a box on a Screen is used by or uses its Centre, which sizes the box against the heaviest in its row: the files that import, for packages; √(call sites and embeds × the declarations at the box's end), for declarations, so breadth counts as well as volume. Only Screen boxes are sized by it.

**`docx/core/decisions.md`, line 41 (UI v1).** Append to the end of the bullet, after "…Nothing is animated.", as inline prose like **Open in place (15)**:

> **Screen (17):** a second lens beside the tree, toggled by `s` or the Screen button: the selection's Centre in the middle, what depends on it in the row above and what it depends on in the row below, placed without ELK. Each row wraps at 1,280 px into lines, the heaviest line nearest the Centre and each line laid out from its middle, so the first view, at the readable floor, shows the heaviest boxes. Its grain follows the Centre: imports for a package or external (Weight: files that import), calls and embeds for a type or function, a method drawn as its type (Weight: √(sites × declarations)). Boxes are sized against their row's heaviest: large from ½, medium from ⅕, small below; a row whose heaviest weighs 2 or less is medium, an external is always small, a type the Centre embeds is never small; labels are 12, 13 and 15 px. A row draws 24 boxes and a "+N more" chip; the chip or "every box" draws all (`m=1`). A box in both rows is drawn in each, marked ↻. A click re-centres. The hash keeps the Centre as `c` beside the tree's fields; entering, leaving or re-centring the Screen adds a browser history entry, so Back returns to the last Screen, and every other change still replaces the entry (05's Deviation 5). However the Screen is left, the tree comes back centred on its selection; its pan and zoom are not kept. Esc leaves the Screen after closing search; the tree's `d`, `+` and `-` do nothing on it; `n` is kept for 18. The header says what the rows and sizes are and, for a declaration, what the Screen leaves out: calls and embeds into it and out of it with declarations in packages not included (the View's `offIn` and `offOut`, on types and functions only) and its package's Unresolved Calls. A Change View has no Screen until 18. Search ranks a name's word starts (`RW`: ReadWriter) between name prefixes and id substrings.

**`docx/core/requirements-draft.md`, Diagram canvas table: a new row after U8:**

> | U14 | Screen: centre any package, type, function or external, with what depends on it above and what it depends on below, boxes sized by use; clicking a box re-centres, and the browser's Back returns to the last Screen | Should |

U14 is recorded as met in `decisions.md` once the user's check in Task 7 passes.

## Tasks

### Task 1: The export counts calls and embeds off the page (`export`)

A Project View drops a call or embed with one end off the page. Task 1 counts each one on the end that stays.

`TestProjectCountsCallsOffThePage` scans the shop fixture with `-include ./internal/store`. It checks each declaration's (offIn, offOut):
- `store.Open`: (1, 0), because `checkout.Place` calls it;
- `store.Order`: (1, 0), because `checkout.Cart` embeds it;
- `store.Repo.check`: (0, 1), because it calls `money.Add`;
- `store.Repo`: (0, 0); its embed of `lib/pq` stays on the page, since an external is a node of every Project View;
- `store.Repo.Reset`: (0, 0); its call to `store.Open` stays on the page.

It also checks that only types and functions carry a count, on store's page and on checkout's. On checkout's, `store.Repo` is off the page and embeds `lib/pq`, which an external's count would wrongly hold.

**Files:**
- Tests: `internal/export/project_test.go`
- Code: `internal/export/project.go`, `internal/export/view.go`, `web/src/data.ts`, `internal/export/testdata/shop.view.golden.json`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/export/project_test.go b/internal/export/project_test.go
index cf66df7..2f0eef8 100644
--- a/internal/export/project_test.go
+++ b/internal/export/project_test.go
@@ -85,6 +85,43 @@ func TestProjectIncludeAddsDeclarationsAndTheirFiles(t *testing.T) {
 	}
 }
 
+// 17: a Screen centred on a declaration draws only the calls and embeds the
+// page holds; the rest, to or from a package without -include, are counted
+// on the declaration so the Screen can say what it leaves out.
+func TestProjectCountsCallsOffThePage(t *testing.T) {
+	doc := shopIR(t)
+	p, _ := ParsePattern("./internal/store", RootModule(doc))
+	v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
+	if err != nil {
+		t.Fatal(err)
+	}
+	for id, want := range map[string][2]int{
+		"example.com/shop/internal/store.Open":       {1, 0}, // checkout.Place calls it
+		"example.com/shop/internal/store.Order":      {1, 0}, // checkout.Cart embeds it
+		"example.com/shop/internal/store.Repo.check": {0, 1}, // it calls money.Add
+		"example.com/shop/internal/store.Repo":       {0, 0}, // it embeds lib/pq, which is drawn
+		"example.com/shop/internal/store.Repo.Reset": {0, 0}, // it calls store.Open, on the page
+	} {
+		if n := find(t, v, id); n.OffIn != want[0] || n.OffOut != want[1] {
+			t.Errorf("%s: off in, out = %d, %d; want %d, %d", id, n.OffIn, n.OffOut, want[0], want[1])
+		}
+	}
+	// Only declarations count: every package and external is on every page.
+	// With checkout's declarations, store.Repo, off the page, embeds lib/pq.
+	for _, include := range []string{"./internal/store", "./internal/checkout"} {
+		p, _ := ParsePattern(include, RootModule(doc))
+		v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
+		if err != nil {
+			t.Fatal(err)
+		}
+		for _, n := range v.Nodes {
+			if n.Kind != "type" && n.Kind != "function" && (n.OffIn != 0 || n.OffOut != 0) {
+				t.Errorf("%s: %s %s counts calls off the page", include, n.Kind, n.ID)
+			}
+		}
+	}
+}
+
 func TestProjectRejectsAnIncludeThatMatchesNothing(t *testing.T) {
 	doc := shopIR(t)
 	p, _ := ParsePattern("./nosuch/...", RootModule(doc))
```

- [x] **Run:** `go test ./internal/export -run TestProjectCountsCallsOffThePage` Expected: FAIL (`n.OffIn` and `n.OffOut` are undefined: the build fails)

- [x] **Count calls and embeds off the page; carry the counts to the page's types**

The golden's three new lines are what `go test ./internal/export -run TestProjectGolden -update` writes. Review the diff.

```diff
diff --git a/internal/export/project.go b/internal/export/project.go
index d17555a..8473552 100644
--- a/internal/export/project.go
+++ b/internal/export/project.go
@@ -40,7 +40,7 @@ func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 	}
 
 	v := newView("project", doc)
-	modules, files, in := map[string]bool{}, map[string]bool{}, map[string]bool{}
+	modules, files, in, decl := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
 	for i := range doc.Nodes {
 		n := &doc.Nodes[i]
 		vn := toNode(n)
@@ -55,6 +55,7 @@ func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 			for _, l := range n.Locations {
 				files[l.Path] = true
 			}
+			decl[n.ID] = true
 		}
 		v.Nodes = append(v.Nodes, vn)
 		in[n.ID] = true
@@ -62,12 +63,25 @@ func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 	for m := range modules {
 		v.Modules = append(v.Modules, m)
 	}
+	// 17: a call or embed with one end off the page is counted on the other,
+	// when that end is a declaration: an external that a type off the page
+	// embeds counts nothing, as its Screen draws imports.
+	offIn, offOut := map[string]int{}, map[string]int{}
 	for i := range doc.Edges {
 		e := &doc.Edges[i]
-		if e.Kind == ir.EdgeImports || in[e.From] && in[e.To] {
+		switch {
+		case e.Kind == ir.EdgeImports || in[e.From] && in[e.To]:
 			v.Edges = append(v.Edges, toEdge(e))
+		case decl[e.From]:
+			offOut[e.From] += len(e.Locations)
+		case decl[e.To]:
+			offIn[e.To] += len(e.Locations)
 		}
 	}
+	for i := range v.Nodes {
+		n := &v.Nodes[i]
+		n.OffIn, n.OffOut = offIn[n.ID], offOut[n.ID]
+	}
 	if err := addSources(v, files, read); err != nil {
 		return nil, err
 	}
diff --git a/internal/export/testdata/shop.view.golden.json b/internal/export/testdata/shop.view.golden.json
index 888aa0c..2eb9261 100644
--- a/internal/export/testdata/shop.view.golden.json
+++ b/internal/export/testdata/shop.view.golden.json
@@ -64,7 +64,8 @@
       "loc": {
         "path": "internal/store/store.go",
         "line": 40
-      }
+      },
+      "offIn": 1
     },
     {
       "id": "example.com/shop/internal/store.Order",
@@ -75,7 +76,8 @@
       "loc": {
         "path": "internal/store/store.go",
         "line": 25
-      }
+      },
+      "offIn": 1
     },
     {
       "id": "example.com/shop/internal/store.Page",
@@ -159,7 +161,8 @@
       "loc": {
         "path": "internal/store/store.go",
         "line": 51
-      }
+      },
+      "offOut": 1
     },
     {
       "id": "example.com/shop/internal/store.Status",
diff --git a/internal/export/view.go b/internal/export/view.go
index ebeebd8..b0fc9a9 100644
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -55,6 +55,8 @@ type Node struct {
 	Hop        *int        `json:"hop,omitempty"`        // Change View: distance in the Affected Set
 	Rank       *int        `json:"rank,omitempty"`       // packages: the Policy Level, 0 = innermost
 	Demoted    string      `json:"demoted,omitempty"`    // packages (12): why the first view sets it aside, "name" or "generated"
+	OffIn      int         `json:"offIn,omitempty"`      // declarations (17): call sites and embeds into it from declarations not on this page
+	OffOut     int         `json:"offOut,omitempty"`     // declarations (17): and out of it to them
 }
 
 // Edge is an IR edge with its location count instead of every location.
diff --git a/web/src/data.ts b/web/src/data.ts
index 5a39529..83d65c8 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -9,6 +9,8 @@ export type ViewNode = {
   main?: boolean; // 12: package main, a program's entry
   genDecls?: number; // 12: packages: declarations in generated files
   demoted?: "name" | "generated"; // 12: set aside in the first view (policy.Demoted)
+  offIn?: number; // 17: declarations: call sites and embeds into it from declarations not on this page
+  offOut?: number; // 17: and out of it to them
 };
 export type ViewEdge = {
   from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
```

- [x] **Run:** `go test ./... && cd web && npm run typecheck` Expected: PASS

- [x] **Commit:** `Count the calls and embeds a Project View leaves off the page`

---

### Task 2: Search matches a name's word starts (`search.ts`)

The test checks the new rank on four declarations:
- `RW` finds `rwLock` first, because a prefix outranks a word start, then `ReadWriter`;
- `wsp` finds `newWaveSpawner`: words may start anywhere in the name, and case does not matter;
- `HSe` finds `HTTPServer`: a run of capitals before a word is one word;
- `ns` finds nothing: the words must be consecutive, and New, Spawner skips Wave.

The code tries each query position at each word once. Without that, 2,000 contrived names of 14 two-letter words took 3.6 s for one failing 27-letter query; with it, under 0.5 s.

**Files:**
- Tests: `web/src/search.test.ts`
- Code: `web/src/search.ts`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/web/src/search.test.ts b/web/src/search.test.ts
index 4d5aa01..15291e2 100644
--- a/web/src/search.test.ts
+++ b/web/src/search.test.ts
@@ -16,6 +16,17 @@ describe("search", () => {
     expect(search(v, "Get").map((h) => [h.id, h.name])).toEqual([["m/store.Repo.Get", "Repo.Get"]]);
     expect(search(v, "  ")).toEqual([]);
   });
+  it("ranks word starts between prefixes and substrings (17)", () => {
+    const w = view([
+      ...pkgs(["m/a"], "m", { detail: true }),
+      decl("m/a.ReadWriter", "m/a"), decl("m/a.HTTPServer", "m/a"), decl("m/a.rwLock", "m/a"),
+      decl("m/a.newWaveSpawner", "m/a", "function"),
+    ]);
+    expect(search(w, "RW").map((h) => h.name)).toEqual(["rwLock", "ReadWriter"]); // a prefix first
+    expect(search(w, "wsp").map((h) => h.name)).toEqual(["newWaveSpawner"]); // from any word, in any case
+    expect(search(w, "HSe").map((h) => h.name)).toEqual(["HTTPServer"]); // capitals before a word are one word
+    expect(search(w, "ns")).toEqual([]); // the words are consecutive: New, Spawner skips Wave
+  });
   it("reveal draws and selects the target, a method as a row of its type", () => {
     for (const id of ["m/store/sql", "m/store.Repo", "m/store.Repo.Get", "x.io/e3"]) {
       expect(scene(v, reveal(v, id)).selected, id).not.toBeNull();
```

- [x] **Run:** `cd web && npx vitest run src/search.test.ts` Expected: FAIL (1 test: `RW` finds only `rwLock`)

- [x] **Rank word starts between name prefixes and id substrings**

```diff
diff --git a/web/src/search.ts b/web/src/search.ts
index fb5a2d5..3193e76 100644
--- a/web/src/search.ts
+++ b/web/src/search.ts
@@ -15,16 +15,48 @@ function name(view: View, id: string): string {
   return id.slice((packageOf(view, id) ?? "").length + 1);
 }
 
-// search ranks exact names, then name prefixes, then any id substring
-// (case-insensitive), shorter ids first, then by id.
+// words splits a name where a reader sees words start (17): at a separator,
+// at a capital after a small letter, before the capital that starts a word
+// ("HTTPServer" is HTTP, Server), and at digits. Kept per View: search runs
+// on every key.
+const wordsOf = new WeakMap<View, Map<string, string[]>>();
+function words(view: View, id: string, nm: string): string[] {
+  if (!wordsOf.has(view)) wordsOf.set(view, new Map());
+  const at = wordsOf.get(view)!;
+  let ws = at.get(id);
+  if (!ws) at.set(id, (ws = (nm.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map((w) => w.toLowerCase())));
+  return ws;
+}
+
+// wordStart says q is made of the starts of consecutive words of a name,
+// from any word: "wsp" finds newWaveSpawner, "HSe" HTTPServer. Each query
+// position is tried at each word once, so no name takes more than q × words.
+function wordStart(q: string, ws: string[]): boolean {
+  const failed = new Set<number>();
+  const from = (i: number, j: number): boolean => {
+    if (i === q.length) return true;
+    if (j === ws.length || failed.has(i * ws.length + j)) return false;
+    for (let k = Math.min(q.length - i, ws[j].length); k > 0; k--) {
+      if (ws[j].startsWith(q.slice(i, i + k)) && from(i + k, j + 1)) return true;
+    }
+    failed.add(i * ws.length + j);
+    return false;
+  };
+  return ws.some((_, j) => from(0, j));
+}
+
+// search ranks exact names, then name prefixes, then word starts (17), then
+// any id substring (case-insensitive), shorter ids first, then by id.
 export function search(view: View, query: string, limit = 20): Hit[] {
   const q = query.trim().toLowerCase();
   if (!q) return [];
+  const plain = /^[a-z0-9]+$/.test(q); // word starts are letters and digits
   const scored: [number, Hit][] = [];
   for (const n of view.nodes) {
     const nm = name(view, n.id);
     const low = nm.toLowerCase();
-    const rank = low === q || low.endsWith("." + q) ? 0 : low.startsWith(q) ? 1 : n.id.toLowerCase().includes(q) ? 2 : -1;
+    const rank = low === q || low.endsWith("." + q) ? 0 : low.startsWith(q) ? 1
+      : plain && wordStart(q, words(view, n.id, nm)) ? 2 : n.id.toLowerCase().includes(q) ? 3 : -1;
     if (rank >= 0) scored.push([rank, { id: n.id, kind: n.kind, name: nm }]);
   }
   scored.sort(([ra, a], [rb, b]) => ra - rb || a.id.length - b.id.length || cmp(a.id, b.id));
```

- [x] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [x] **Commit:** `Match a name's word starts in search`

---

### Task 3: A Screen's rows, from the View (`screen.ts`)

The tests (`screen.test.ts`) use the shop View golden, the shop Change View golden and testkit Views. They check:
- **`centreOf`:**
  - a package, a declaration and an external centre themselves; a method centres its type;
  - `X#pkg` centres `X`; a directory, the outside and externals ovals, a Strip, a Fold chip, an unknown id and null centre nothing;
  - a Change View centres nothing.
- **`screenOf`:**
  - **store's Screen:** checkout above; money (medium) and `lib/pq` (small) below; `lib/pq`'s own Screen has nothing below.
  - **A cycle:** the importing-and-imported package is in both rows, marked `both`.
  - **Sizes:** counts 10, 4, 2 and 1 draw large, medium, medium and small. A row whose heaviest weighs 2 is flat, and an external is small.
  - **Repo's Screen at declaration grain:**
    - nothing above, since Repo.Get calling Repo.check stays inside the Centre;
    - Open and `lib/pq` below, Open labelled "Open" under "internal/store";
    - Open's Screen has Repo above.
  - **What a Screen leaves out:**
    - Repo: offOut 1 and 4 unresolved calls;
    - Open: offIn 1;
    - a package's Screen: all 0.
  - **The √ Weight:** a type whose two methods call from 3 sites each outranks a function calling from 6.
  - **Embeds:** a type the Centre embeds is medium where its Weight alone would draw it small.
  - **The cap:** 30 importers draw 24 and count 6 more; `all` draws 30.

**Files:**
- Tests: `web/src/screen.test.ts` (new)
- Code: `web/src/screen.ts` (new)

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/web/src/screen.test.ts b/web/src/screen.test.ts
new file mode 100644
index 0000000..a5c90c0
--- /dev/null
+++ b/web/src/screen.test.ts
@@ -0,0 +1,96 @@
+import { describe, expect, it } from "vitest";
+import golden from "../../internal/export/testdata/shop.view.golden.json";
+import change from "../../internal/export/testdata/shop.change.golden.json";
+import type { View, ViewEdge } from "./data";
+import { centreOf, ROW_CAP, screenOf } from "./screen";
+import { decl, edge, exts, pkgs, view } from "./testkit";
+
+const shop = golden as unknown as View;
+const S = "example.com/shop/internal/store";
+const weighed = (from: string, to: string, count: number, kind: ViewEdge["kind"] = "imports"): ViewEdge =>
+  ({ ...edge(from, to, kind), count });
+const ids = (r: { boxes: { id: string }[] }) => r.boxes.map((b) => b.id);
+
+describe("centreOf", () => {
+  it("centres a package, a declaration or an external, and a method's type", () => {
+    expect(centreOf(shop, S)).toBe(S);
+    expect(centreOf(shop, `${S}.Open`)).toBe(`${S}.Open`);
+    expect(centreOf(shop, `${S}.Repo`)).toBe(`${S}.Repo`);
+    expect(centreOf(shop, `${S}.Repo.Get`)).toBe(`${S}.Repo`);
+    expect(centreOf(shop, "github.com/lib/pq")).toBe("github.com/lib/pq");
+  });
+  it("centres the package of an X#pkg box, and nothing else that is not a node", () => {
+    const v = view(pkgs(["m/a", "m/a/b"], "m"));
+    expect(centreOf(v, "m/a#pkg")).toBe("m/a");
+    for (const id of ["m", "outside", "externals", "m/a#demoted", "m#more", "m/nosuch", null]) {
+      expect(centreOf(v, id), String(id)).toBeNull();
+    }
+  });
+  it("centres nothing in a Change View (18 draws the Screen there)", () => {
+    expect(centreOf(change as unknown as View, S)).toBeNull();
+  });
+});
+
+describe("screenOf", () => {
+  it("at a package: its importers above, what it imports below", () => {
+    const s = screenOf(shop, S);
+    expect(s.grain).toBe("package");
+    expect(ids(s.above)).toEqual(["example.com/shop/internal/checkout"]);
+    expect(ids(s.below)).toEqual(["example.com/shop/internal/money", "github.com/lib/pq"]);
+    expect(s.below.boxes.map((b) => [b.label, b.size])).toEqual([["internal/money", "medium"], ["github.com/lib/pq", "small"]]);
+    expect(screenOf(shop, "github.com/lib/pq")).toMatchObject({ grain: "package", below: { boxes: [], more: 0 } });
+  });
+  it("draws a package that imports the centre and is imported by it in both rows", () => {
+    const s = screenOf(view(pkgs(["m/a", "m/b", "m/c"], "m"), [edge("m/a", "m/b"), edge("m/b", "m/a"), edge("m/c", "m/a")]), "m/a");
+    expect(s.above.boxes.map((b) => [b.id, b.both])).toEqual([["m/b", true], ["m/c", false]]);
+    expect(s.below.boxes.map((b) => [b.id, b.both])).toEqual([["m/b", true]]);
+  });
+  it("sizes a box by its Weight against the heaviest in its row", () => {
+    const v = view([...pkgs(["m/core", "m/a", "m/b", "m/c", "m/d"], "m"), ...exts(["x.io/lib"])], [
+      weighed("m/a", "m/core", 10), weighed("m/b", "m/core", 4), weighed("m/c", "m/core", 2), weighed("m/d", "m/core", 1),
+      weighed("m/core", "m/a", 2), weighed("m/core", "x.io/lib", 1),
+    ]);
+    const s = screenOf(v, "m/core");
+    // largest from half the heaviest, medium from a fifth, small below
+    expect(s.above.boxes.map((b) => [b.id, b.weight, b.size])).toEqual([
+      ["m/a", 10, "large"], ["m/b", 4, "medium"], ["m/c", 2, "medium"], ["m/d", 1, "small"],
+    ]);
+    // a row weighing at most 2 is flat; an external is always small
+    expect(s.below.boxes.map((b) => [b.id, b.size])).toEqual([["m/a", "medium"], ["x.io/lib", "small"]]);
+  });
+  it("at a declaration: calls and embeds, a method drawn as its type", () => {
+    const s = screenOf(shop, `${S}.Repo`);
+    expect(s.grain).toBe("declaration");
+    expect(ids(s.above)).toEqual([]); // Repo.Get calls Repo.check: inside the centre
+    expect(ids(s.below)).toEqual([`${S}.Open`, "github.com/lib/pq"]); // Repo.Reset calls Open; Repo embeds pq
+    expect(s.below.boxes[0]).toMatchObject({ label: "Open", sub: "internal/store" });
+    expect(ids(screenOf(shop, `${S}.Open`).above)).toEqual([`${S}.Repo`]);
+  });
+  it("says what a declaration's Screen leaves out", () => {
+    // Repo.check calls money.Add, which has no declarations on this page;
+    // the store package has 4 Unresolved Calls (ADR 0002).
+    expect(screenOf(shop, `${S}.Repo`)).toMatchObject({ offIn: 0, offOut: 1, unresolved: 4 });
+    expect(screenOf(shop, `${S}.Open`)).toMatchObject({ offIn: 1, offOut: 0 }); // checkout.Place calls it
+    expect(screenOf(shop, S)).toMatchObject({ offIn: 0, offOut: 0, unresolved: 0 }); // imports are all on the page
+  });
+  it("weighs a declaration by √(sites × declarations), so breadth counts", () => {
+    const v = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.F", "m/a", "function"), decl("m/a.T", "m/a"),
+      decl("m/a.T.x", "m/a.T", "function"), decl("m/a.T.y", "m/a.T", "function"), decl("m/a.G", "m/a", "function")], [
+      weighed("m/a.T.x", "m/a.F", 3, "calls"), weighed("m/a.T.y", "m/a.F", 3, "calls"), weighed("m/a.G", "m/a.F", 6, "calls"),
+    ]);
+    expect(screenOf(v, "m/a.F").above.boxes.map((b) => [b.id, b.refs, b.members])).toEqual([["m/a.T", 6, 2], ["m/a.G", 6, 1]]);
+  });
+  it("never draws a type the centre embeds small", () => {
+    const v = view([...pkgs(["m/a"], "m", { detail: true }), decl("m/a.T", "m/a"), decl("m/a.T.x", "m/a.T", "function"),
+      decl("m/a.F", "m/a", "function"), decl("m/a.E", "m/a")], [weighed("m/a.T.x", "m/a.F", 30, "calls"), weighed("m/a.T", "m/a.E", 1, "embeds")]);
+    expect(screenOf(v, "m/a.T").below.boxes.map((b) => [b.id, b.size])).toEqual([["m/a.F", "large"], ["m/a.E", "medium"]]);
+  });
+  it(`draws ${ROW_CAP} boxes a row and counts the rest, or every box`, () => {
+    const many = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
+    const v = view(pkgs(["m/core", ...many], "m"), many.map((p) => edge(p, "m/core")));
+    expect(screenOf(v, "m/core").above).toMatchObject({ more: 30 - ROW_CAP });
+    expect(ids(screenOf(v, "m/core").above)).toEqual(many.slice(0, ROW_CAP));
+    expect(screenOf(v, "m/core", true).above.boxes).toHaveLength(30);
+    expect(screenOf(v, "m/core", true).above.more).toBe(0);
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/screen.test.ts` Expected: FAIL (`Failed to resolve import "./screen"`)

- [ ] **Add `centreOf` and `screenOf`**

```diff
diff --git a/web/src/screen.ts b/web/src/screen.ts
new file mode 100644
index 0000000..e14d0e4
--- /dev/null
+++ b/web/src/screen.ts
@@ -0,0 +1,118 @@
+// 17: the Screen (glossary: Screen, Centre, Weight). One node, the Centre,
+// with what depends on it in the row above and what it depends on in the row
+// below, after codezoom's screens. A pure function of the View and the hash:
+// rows come only from the View's edges.
+import type { NodeKind, View, ViewEdge } from "./data";
+import { cmp, index, packageOf, PKG } from "./cut";
+
+export const ROW_CAP = 24; // the boxes a row draws before "+N more"
+export const LARGE_SHARE = 1 / 2; // of the row's heaviest Weight: drawn large
+export const MEDIUM_SHARE = 1 / 5; // drawn medium; less is small
+export const FLAT_ROW_MAX = 2; // a row whose heaviest weighs no more is drawn medium
+
+export type Size = "small" | "medium" | "large";
+// The Screen's grain follows its Centre: imports between packages and
+// externals, or calls and embeds between declarations.
+export type Grain = "package" | "declaration";
+export type Box = {
+  id: string; kind: NodeKind; label: string;
+  sub: string; // a declaration's package, or a package's module when the View has several
+  refs: number; // package grain: files that import; declaration grain: call sites and embeds
+  members: number; // declaration grain: declarations at this box's end of them
+  weight: number; size: Size;
+  both: boolean; // drawn in both rows: an import cycle or mutual calls with the Centre
+};
+export type Row = { boxes: Box[]; more: number }; // more: boxes past ROW_CAP, not drawn
+export type Screen = {
+  centre: string; kind: NodeKind; grain: Grain; above: Row; below: Row;
+  unresolved: number; // declaration grain: the Centre's package's Unresolved Calls (ADR 0002)
+  offIn: number; offOut: number; // declaration grain: calls and embeds with declarations not on this page
+};
+
+// typeOf is the type a method belongs to, or undefined.
+function typeOf(view: View, id: string): string | undefined {
+  const { node } = index(view);
+  const n = node.get(id);
+  return n?.kind === "function" && n.parent !== undefined && node.get(n.parent)?.kind === "type" ? n.parent : undefined;
+}
+
+// centreOf is the Centre a selection names: a package (its box "X#pkg" too),
+// a type, a function or an external; a method names its type. Boxes that are
+// not nodes, aggregates and groups name none, and a Change View has no
+// Screen yet (18).
+export function centreOf(view: View, id: string | null): string | null {
+  if (id === null || view.kind === "change") return null;
+  const n = index(view).node.get(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
+  if (!n) return null;
+  return typeOf(view, n.id) ?? n.id;
+}
+
+// labelOf names a node as a Screen box does: a package by its path in its
+// module, an external by its path, a declaration by its name in its package.
+function labelOf(view: View, id: string): { label: string; sub: string } {
+  const n = index(view).node.get(id)!;
+  if (n.kind === "external") return { label: id, sub: "" };
+  if (n.kind === "package") {
+    const m = n.module ?? "";
+    return { label: id.startsWith(m + "/") ? id.slice(m.length + 1) : id, sub: view.modules.length > 1 ? m : "" };
+  }
+  const pkg = packageOf(view, id) ?? "";
+  return { label: id.slice(pkg.length + 1), sub: labelOf(view, pkg).label };
+}
+
+type Tally = { refs: number; ends: Set<string>; embeds: boolean };
+
+function rowOf(view: View, tallies: Map<string, Tally>, other: Map<string, Tally>, grain: Grain, below: boolean, all: boolean): Row {
+  const boxes: Box[] = [...tallies].map(([id, t]) => ({
+    id, kind: index(view).node.get(id)!.kind, ...labelOf(view, id),
+    refs: t.refs, members: t.ends.size,
+    weight: grain === "package" ? t.refs : Math.sqrt(t.refs * t.ends.size),
+    size: "medium" as Size, both: other.has(id),
+  }));
+  boxes.sort((a, b) => b.weight - a.weight || cmp(a.id, b.id));
+  const max = boxes[0]?.weight ?? 0;
+  for (const b of boxes) {
+    b.size = b.kind === "external" ? "small" // a library is always small
+      : max <= FLAT_ROW_MAX ? "medium"
+      : b.weight >= max * LARGE_SHARE ? "large" : b.weight >= max * MEDIUM_SHARE ? "medium" : "small";
+    if (below && b.size === "small" && b.kind !== "external" && tallies.get(b.id)!.embeds) b.size = "medium"; // what the Centre embeds
+  }
+  return all || boxes.length <= ROW_CAP ? { boxes, more: 0 } : { boxes: boxes.slice(0, ROW_CAP), more: boxes.length - ROW_CAP };
+}
+
+// screenOf is the Screen of centre (a centreOf id); all draws every box of
+// both rows.
+export function screenOf(view: View, centre: string, all = false): Screen {
+  const c = index(view).node.get(centre)!;
+  const grain: Grain = c.kind === "package" || c.kind === "external" ? "package" : "declaration";
+  const kinds: ViewEdge["kind"][] = grain === "package" ? ["imports"] : ["calls", "embeds"];
+  const boxOf = (id: string) => (grain === "package" ? id : (typeOf(view, id) ?? id));
+  const above = new Map<string, Tally>();
+  const below = new Map<string, Tally>();
+  for (const e of view.edges) {
+    if (!kinds.includes(e.kind)) continue;
+    const [from, to] = [boxOf(e.from) === centre, boxOf(e.to) === centre];
+    if (from === to) continue; // inside the Centre, or away from it
+    const [rows, end] = to ? [above, e.from] : [below, e.to];
+    const id = boxOf(end);
+    const t = rows.get(id) ?? { refs: 0, ends: new Set<string>(), embeds: false };
+    t.refs += e.count;
+    t.ends.add(end);
+    t.embeds ||= e.kind === "embeds";
+    rows.set(id, t);
+  }
+  let [unresolved, offIn, offOut] = [0, 0, 0];
+  if (grain === "declaration") {
+    unresolved = index(view).node.get(packageOf(view, centre) ?? "")?.unresolved ?? 0;
+    for (const n of view.nodes) {
+      if (n.id !== centre && typeOf(view, n.id) !== centre) continue;
+      offIn += n.offIn ?? 0;
+      offOut += n.offOut ?? 0;
+    }
+  }
+  return {
+    centre, kind: c.kind, grain,
+    above: rowOf(view, above, below, grain, false, all), below: rowOf(view, below, above, grain, true, all),
+    unresolved, offIn, offOut,
+  };
+}
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Commit:** `Build a Screen's rows from the View: the Centre, what depends on it, what it depends on`

---

### Task 4: Place a Screen and fit it (`screen.ts`, `viewport.ts`)

The tests check:
- **`placeScreen` on store's Screen:**
  - the Centre at (−w/2, 0), labelled with its full id, no line under it, "imports" as its facts;
  - Repo's Centre: "calls and embeds", no package line under it, because its full id names the package;
  - each row 72 px from the Centre;
  - money first in its row, then `lib/pq` right of it;
  - one edge per box, into the Centre from above and out of it below.
- **`placeScreen` on 60 importers drawn whole:**
  - lines at most ROW_MAX wide and centred on the Centre;
  - the heaviest line nearest the Centre, with the heaviest box in its middle, the next right of it and the next left;
  - nothing overlaps;
  - a large box taller than a small one;
  - a box in both rows drawn twice.
- **The capped row** ends with its "+N more" chip, which gets no edge.
- **`centredFit`:** what `readableFit` shows whole, it shows whole. Otherwise it holds the floor zoom with the Centre in the middle of the canvas.

**Files:**
- Tests: `web/src/screen.test.ts`, `web/src/viewport.test.ts`
- Code: `web/src/screen.ts`, `web/src/viewport.ts`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/web/src/screen.test.ts b/web/src/screen.test.ts
index a5c90c0..a4ebd79 100644
--- a/web/src/screen.test.ts
+++ b/web/src/screen.test.ts
@@ -2,7 +2,8 @@ import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import change from "../../internal/export/testdata/shop.change.golden.json";
 import type { View, ViewEdge } from "./data";
-import { centreOf, ROW_CAP, screenOf } from "./screen";
+import { ROW_MAX } from "./layout";
+import { centreOf, GAP_ROW, placeScreen, ROW_CAP, screenOf, type Drawn } from "./screen";
 import { decl, edge, exts, pkgs, view } from "./testkit";
 
 const shop = golden as unknown as View;
@@ -94,3 +95,66 @@ describe("screenOf", () => {
     expect(screenOf(v, "m/core", true).above.more).toBe(0);
   });
 });
+
+// overlap says two placed boxes share any area.
+const overlap = (a: Drawn, b: Drawn) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
+
+describe("placeScreen", () => {
+  const many = Array.from({ length: 60 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
+  const wide = view(pkgs(["m/core", ...many], "m"), [...many.map((p, i) => weighed(p, "m/core", 60 - i)), edge("m/core", "m/p00")]);
+
+  it("draws the Centre in the middle, its importers above and what it imports below", () => {
+    const p = placeScreen(screenOf(shop, S));
+    const c = p.nodes.find((n) => n.row === "centre")!;
+    expect(c).toMatchObject({ id: S, ref: S, label: S, sub: "", facts: "imports", x: -c.w / 2, y: 0 });
+    const d = placeScreen(screenOf(shop, `${S}.Repo`)).nodes[0];
+    expect(d).toMatchObject({ label: `${S}.Repo`, sub: "", facts: "calls and embeds" }); // its full id names its package
+    const up = p.nodes.filter((n) => n.row === "above");
+    const down = p.nodes.filter((n) => n.row === "below");
+    expect(up.map((n) => n.id)).toEqual(["up:example.com/shop/internal/checkout"]);
+    expect(down.map((n) => n.ref)).toEqual(["example.com/shop/internal/money", "github.com/lib/pq"]);
+    for (const n of up) expect(n.y + n.h).toBe(-GAP_ROW);
+    for (const n of down) expect(n.y).toBe(c.h + GAP_ROW);
+    expect(down[0].x + down[0].w).toBeLessThan(down[1].x); // the first in row order, then the next right of it
+    expect(p.edges).toEqual([
+      { id: "up:example.com/shop/internal/checkout>", from: "up:example.com/shop/internal/checkout", to: S },
+      { id: ">down:example.com/shop/internal/money", from: S, to: "down:example.com/shop/internal/money" },
+      { id: ">down:github.com/lib/pq", from: S, to: "down:github.com/lib/pq" },
+    ]);
+  });
+  it("wraps a row at ROW_MAX, its heaviest line nearest the Centre, each line outward from its middle", () => {
+    const p = placeScreen(screenOf(wide, "m/core", true));
+    const up = p.nodes.filter((n) => n.row === "above");
+    expect(up).toHaveLength(60);
+    const lines = [...new Set(up.map((n) => n.y + n.h))].sort((a, b) => b - a);
+    expect(lines.length).toBeGreaterThan(1);
+    expect(lines[0]).toBe(-GAP_ROW);
+    for (const y of lines) {
+      const line = up.filter((n) => n.y + n.h === y);
+      const [l, r] = [Math.min(...line.map((n) => n.x)), Math.max(...line.map((n) => n.x + n.w))];
+      expect(r - l).toBeLessThanOrEqual(ROW_MAX);
+      expect(l + r).toBeCloseTo(0); // centred on the Centre
+    }
+    expect(up.find((n) => n.ref === "m/p00")!.y + up.find((n) => n.ref === "m/p00")!.h).toBe(-GAP_ROW);
+    // The heaviest box in the middle of its line, the next right of it, the
+    // next left: the floor zoom, centred on the Centre, shows the heaviest.
+    const first = up.filter((n) => n.y + n.h === -GAP_ROW).sort((a, b) => a.x - b.x).map((n) => n.ref);
+    const k = first.indexOf("m/p00");
+    expect([first[k - 1], first[k], first[k + 1]]).toEqual(["m/p02", "m/p00", "m/p01"]);
+    for (const a of p.nodes) for (const b of p.nodes) if (a !== b) expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false);
+  });
+  it("draws a larger box for a heavier Weight, and a box in both rows twice", () => {
+    const p = placeScreen(screenOf(wide, "m/core", true));
+    const [big, small] = [p.nodes.find((n) => n.ref === "m/p00" && n.row === "above")!, p.nodes.find((n) => n.ref === "m/p59")!];
+    expect([big.size, small.size]).toEqual(["large", "small"]);
+    expect(big.h).toBeGreaterThan(small.h);
+    expect(p.nodes.filter((n) => n.ref === "m/p00").map((n) => [n.id, n.both])).toEqual([["up:m/p00", true], ["down:m/p00", true]]);
+  });
+  it("ends a capped row with its +N more chip", () => {
+    const p = placeScreen(screenOf(wide, "m/core"));
+    const up = p.nodes.filter((n) => n.row === "above");
+    expect(up).toHaveLength(ROW_CAP + 1);
+    expect(up[ROW_CAP]).toMatchObject({ id: "up:#more", ref: null, label: `+${60 - ROW_CAP} more` });
+    expect(p.edges.some((e) => e.from === "up:#more")).toBe(false);
+  });
+});
diff --git a/web/src/viewport.test.ts b/web/src/viewport.test.ts
index d632809..ca586e5 100644
--- a/web/src/viewport.test.ts
+++ b/web/src/viewport.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from "vitest";
 import css from "./styles.css?raw";
-import { FLOOR, LABEL_PX, mapByDefault, PAD, readableFit, READABLE_PX, reveal } from "./viewport";
+import { centredFit, FLOOR, LABEL_PX, mapByDefault, PAD, readableFit, READABLE_PX, reveal } from "./viewport";
 
 const canvas = { w: 1000, h: 600 };
 
@@ -61,3 +61,15 @@ describe("reveal (15)", () => {
     expect(reveal(v, { x: 20, y: 10, w: 50, h: 20 }, canvas)).toEqual({ x: -100 + (60 + PAD), y: -50 + (30 + PAD), zoom: 2 });
   });
 });
+
+describe("centredFit (17)", () => {
+  it("shows a Screen whole when it fits, as readableFit does", () => {
+    const rects = [{ x: -50, y: 0, w: 100, h: 40 }, { x: -200, y: 100, w: 400, h: 40 }];
+    expect(centredFit(rects, rects[0], canvas)).toEqual(readableFit(rects, canvas));
+  });
+  it("else holds the floor with the Centre in the middle of the canvas", () => {
+    const centre = { x: -80, y: 0, w: 160, h: 60 };
+    const rects = [centre, ...Array.from({ length: 40 }, (_, i) => ({ x: -640, y: 100 + i * 60, w: 1280, h: 48 }))];
+    expect(centredFit(rects, centre, canvas)).toEqual({ x: 500, y: 300 - 30 * FLOOR, zoom: FLOOR, whole: false });
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/screen.test.ts src/viewport.test.ts` Expected: FAIL (6 tests: `placeScreen` and `centredFit` are not functions)

- [ ] **Add `placeScreen` and `centredFit`**

```diff
diff --git a/web/src/screen.ts b/web/src/screen.ts
index e14d0e4..f990255 100644
--- a/web/src/screen.ts
+++ b/web/src/screen.ts
@@ -4,6 +4,8 @@
 // rows come only from the View's edges.
 import type { NodeKind, View, ViewEdge } from "./data";
 import { cmp, index, packageOf, PKG } from "./cut";
+import { INSET, ROW_MAX, textWidth } from "./layout";
+import { LABEL_PX } from "./viewport";
 
 export const ROW_CAP = 24; // the boxes a row draws before "+N more"
 export const LARGE_SHARE = 1 / 2; // of the row's heaviest Weight: drawn large
@@ -116,3 +118,103 @@ export function screenOf(view: View, centre: string, all = false): Screen {
     unresolved, offIn, offOut,
   };
 }
+
+// Drawing a Screen: no ELK. Each row is lines of boxes, heaviest first, each
+// line centred under or over the Centre and at most ROW_MAX wide; the first
+// line of a row is the one nearest the Centre, and each line is laid out
+// from its middle (outward).
+export const GAP_ROW = 72; // between the Centre and a row's first line
+const GAP_LINE = 12; // between the lines of a row
+const GAP_BOX = 16; // between the boxes of a line
+// The label px, as in styles.css: small is .node's own size, so the floor zoom
+// (viewport.ts FLOOR) draws no Screen label under READABLE_PX.
+const FONT: Record<Size | "centre", number> = { small: 12, medium: 13, large: 15, centre: 15 };
+const MIN_W: Record<Size | "centre", number> = { small: 72, medium: 90, large: 120, centre: 160 };
+const SMALL_PX = 11; // .screen-box .sub and .facts
+const LINE = 14; // a .sub or .facts line
+
+// Drawn is one box of a Screen as React Flow draws it. A box in both rows is
+// drawn twice: id is its row's prefix and the node's id ("up:", "down:"); ref
+// is the node it draws, or null for a "+N more" chip.
+export type Drawn = {
+  id: string; ref: string | null; row: "above" | "centre" | "below"; kind: NodeKind | "more";
+  label: string; sub: string; facts: string; size: Size | "centre"; both: boolean;
+  x: number; y: number; w: number; h: number;
+};
+export type ScreenDrawing = { nodes: Drawn[]; edges: { id: string; from: string; to: string }[] };
+
+const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
+
+// factsOf says what a box's Weight is made of.
+export const factsOf = (grain: Grain, b: Box): string =>
+  grain === "package" ? plural(b.refs, "file", "files")
+    : `${plural(b.refs, "use", "uses")} · ${plural(b.members, "declaration", "declarations")}`;
+
+function sized(d: Omit<Drawn, "w" | "h" | "x" | "y">): Drawn {
+  const text = Math.max(
+    textWidth(d.label) * (FONT[d.size] / LABEL_PX),
+    (Math.max(textWidth(d.sub), textWidth(d.facts)) * SMALL_PX) / LABEL_PX,
+  );
+  const lines = (d.sub ? 1 : 0) + (d.facts ? 1 : 0);
+  return { ...d, x: 0, y: 0, w: Math.max(MIN_W[d.size], Math.ceil(text + INSET)), h: Math.ceil(FONT[d.size] * 1.4) + 16 + LINE * lines };
+}
+
+// lines wraps a row's boxes, in order, into lines at most ROW_MAX wide.
+function lines(boxes: Drawn[]): Drawn[][] {
+  const out: Drawn[][] = [];
+  let width = 0;
+  for (const b of boxes) {
+    const last = out[out.length - 1];
+    if (last && width + GAP_BOX + b.w <= ROW_MAX) {
+      last.push(b);
+      width += GAP_BOX + b.w;
+    } else {
+      out.push([b]);
+      width = b.w;
+    }
+  }
+  return out;
+}
+
+// outward orders a line from its middle: its heaviest box there, the next
+// right of it, the next left, and so on, so the floor zoom, centred on the
+// Centre, shows the heaviest boxes. A "+N more" chip ends the line.
+function outward(line: Drawn[]): Drawn[] {
+  const out: Drawn[] = [];
+  line.filter((b) => b.ref !== null).forEach((b, i) => (i % 2 === 0 ? out.unshift(b) : out.push(b)));
+  return [...out, ...line.filter((b) => b.ref === null)];
+}
+
+// placeScreen places a Screen: the Centre's top-left at (-w/2, 0), the rows
+// above and below it, and a line from each box to the Centre or from the
+// Centre to it.
+export function placeScreen(s: Screen): ScreenDrawing {
+  const centre = sized({
+    id: s.centre, ref: s.centre, row: "centre", kind: s.kind, label: s.centre, sub: "",
+    facts: s.grain === "package" ? "imports" : "calls and embeds", size: "centre", both: false,
+  });
+  centre.x = -centre.w / 2;
+  const nodes: Drawn[] = [centre];
+  const edges: ScreenDrawing["edges"] = [];
+  for (const [row, r, prefix] of [["above", s.above, "up:"], ["below", s.below, "down:"]] as const) {
+    const drawn = r.boxes.map((b) =>
+      sized({ id: prefix + b.id, ref: b.id, row, kind: b.kind, label: b.label, sub: b.sub, facts: factsOf(s.grain, b), size: b.size, both: b.both }));
+    if (r.more > 0) drawn.push(sized({ id: prefix + "#more", ref: null, row, kind: "more", label: `+${r.more} more`, sub: "", facts: "", size: "small", both: false }));
+    let edge = row === "above" ? -GAP_ROW : centre.h + GAP_ROW; // the line's side nearest the Centre
+    for (const line of lines(drawn).map(outward)) {
+      let x = -(line.reduce((w, b) => w + b.w, 0) + GAP_BOX * (line.length - 1)) / 2;
+      const h = Math.max(...line.map((b) => b.h));
+      for (const b of line) {
+        [b.x, b.y] = [x, row === "above" ? edge - b.h : edge];
+        x += b.w + GAP_BOX;
+      }
+      edge += row === "above" ? -(h + GAP_LINE) : h + GAP_LINE;
+    }
+    nodes.push(...drawn);
+    for (const b of drawn) {
+      if (b.ref === null) continue;
+      edges.push(row === "above" ? { id: `${b.id}>`, from: b.id, to: centre.id } : { id: `>${b.id}`, from: centre.id, to: b.id });
+    }
+  }
+  return { nodes, edges };
+}
diff --git a/web/src/viewport.ts b/web/src/viewport.ts
index 2115c31..21e49b2 100644
--- a/web/src/viewport.ts
+++ b/web/src/viewport.ts
@@ -46,6 +46,15 @@ export function readableFit(rects: readonly Rect[], canvas: { w: number; h: numb
   return { x: canvas.w / 2 - cx * zoom, y: PAD - top * zoom, zoom, whole: false };
 }
 
+// centredFit is a Screen's first view (17): all of it when its labels stay
+// readable, else the floor zoom with the Centre in the middle of the canvas,
+// since a Screen is read outward from it.
+export function centredFit(rects: readonly Rect[], centre: Rect, canvas: { w: number; h: number }): Viewport & { whole: boolean } {
+  const v = readableFit(rects, canvas);
+  if (v.whole) return v;
+  return { x: canvas.w / 2 - (centre.x + centre.w / 2) * FLOOR, y: canvas.h / 2 - (centre.y + centre.h / 2) * FLOOR, zoom: FLOOR, whole: false };
+}
+
 // reveal is the viewport that brings r (absolute, in layout units) into view
 // on a canvas of w × h px, moved as little as it can and never zoomed (15): a
 // box the reader opened that grew past the canvas's edge. Its top-left comes
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Commit:** `Place a Screen without ELK, each line from its middle, and open it at the Centre`

---

### Task 5: The hash, history and the lens (`state.ts`, `lens.ts`)

The tests check:
- **The hash:**
  - `c` and `m` round-trip after the tree's fields;
  - `m` counts only with a Centre;
  - a non-Centre `c` is dropped, and a Known without `centre` (a Change View) accepts none.
- **History:** `storeHash` pushes on entering, re-centring and leaving, and replaces on "every box". A refused `pushState` returns false.
- **`centreAt`** caps the rows again and keeps the tree's fields.
- **`revalidate`** keeps a Centre the newer View has and drops one it lost; a Change View reads `c=` as nothing.
- **`enter` and `leave`:**
  - `enter` keeps the tree's fields, and a method enters at its type;
  - `enter` does nothing for null, the outside and externals ovals, or a directory box;
  - `leave` restores the exact tree while the Centre is the selection's;
  - after a re-centre, `leave` equals `reveal` of the new Centre;
  - `drawnCentre` is null for a Centre a newer View lost, and for no Centre.

**Files:**
- Tests: `web/src/state.test.ts`, `web/src/proposal.test.ts`, `web/src/lens.test.ts` (new)
- Code: `web/src/state.ts`, `web/src/scene.ts`, `web/src/lens.ts` (new)

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/web/src/lens.test.ts b/web/src/lens.test.ts
new file mode 100644
index 0000000..afbd34b
--- /dev/null
+++ b/web/src/lens.test.ts
@@ -0,0 +1,40 @@
+import { describe, expect, it } from "vitest";
+import golden from "../../internal/export/testdata/shop.view.golden.json";
+import type { View } from "./data";
+import { drawnCentre, enter, leave } from "./lens";
+import { reveal } from "./search";
+import { centreAt, DEFAULT_STATE } from "./state";
+
+const shop = golden as unknown as View;
+const S = "example.com/shop/internal/store";
+const C = "example.com/shop/internal/checkout";
+
+describe("the lens (17)", () => {
+  it("enters the Screen at the selection's Centre, keeping the tree as it was", () => {
+    const tree = { ...DEFAULT_STATE, focus: "example.com/shop/internal", selected: S, hops: 1 };
+    expect(enter(shop, tree)).toEqual({ ...tree, centre: S });
+    expect(enter(shop, { ...tree, selected: `${S}.Repo.Get` }).centre).toBe(`${S}.Repo`); // a method: its type
+  });
+  it("does nothing when the selection names no Centre", () => {
+    for (const selected of [null, "outside", "externals", "example.com/shop/internal"]) {
+      const s = { ...DEFAULT_STATE, selected };
+      expect(enter(shop, s), String(selected)).toBe(s);
+    }
+  });
+  it("leaves to the tree as it was while the Centre is the selection's", () => {
+    const tree = { ...DEFAULT_STATE, focus: "example.com/shop/internal", selected: `${S}.Repo.Get`, hops: 1 };
+    expect(leave(shop, { ...enter(shop, tree), more: true })).toEqual(tree);
+  });
+  it("leaves to the tree drawn at a new Centre, selected, after a re-centre", () => {
+    const tree = { ...DEFAULT_STATE, selected: S, hops: 1 };
+    expect(leave(shop, centreAt(enter(shop, tree), C))).toEqual(reveal(shop, C, tree));
+    expect(reveal(shop, C, tree).selected).toBe(C);
+  });
+  it("draws no Screen for a Centre a newer View lost, before revalidate drops it", () => {
+    const s = centreAt(DEFAULT_STATE, `${S}.Open`);
+    const newer = { ...shop, nodes: shop.nodes.filter((n) => n.id !== `${S}.Open`) };
+    expect(drawnCentre(shop, s)).toBe(`${S}.Open`);
+    expect(drawnCentre(newer, s)).toBeNull();
+    expect(drawnCentre(shop, DEFAULT_STATE)).toBeNull();
+  });
+});
diff --git a/web/src/proposal.test.ts b/web/src/proposal.test.ts
index 02368c0..2998cd9 100644
--- a/web/src/proposal.test.ts
+++ b/web/src/proposal.test.ts
@@ -96,6 +96,14 @@ describe("a Proposal in the URL hash (07)", () => {
     expect(revalidate(s, lost)).toEqual({ ...DEFAULT_STATE, focus: "m/app" });
   });
 
+  it("keeps a Centre the newer View has and drops one it lost (17)", () => {
+    const s = { ...DEFAULT_STATE, centre: "m/app/api", more: true };
+    expect(readHash("#c=m%2Fapp%2Fapi&m=1", v)).toEqual(s);
+    expect(revalidate(s, v)).toBe(s);
+    expect(revalidate(s, { ...v, nodes: v.nodes.filter((n) => n.id !== "m/app/api") })).toEqual(DEFAULT_STATE);
+    expect(readHash("#c=m%2Fapp%2Fapi", { ...v, kind: "change", changed: [] })).toEqual(DEFAULT_STATE); // 18
+  });
+
   it("is never read in a Change View, so a pasted link cannot draw one there", () => {
     const change: View = { ...v, kind: "change", changed: ["m/app/api"] };
     expect(knownIds(change).proposal?.("Flip")).toBe(false);
diff --git a/web/src/state.test.ts b/web/src/state.test.ts
index 77ac244..21667a8 100644
--- a/web/src/state.test.ts
+++ b/web/src/state.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from "vitest";
 import {
-  decodeHash, deeper, DEFAULT_STATE, drill, encodeHash, nextStage, select, shallower, storeHash, toggle, up,
+  centreAt, decodeHash, deeper, DEFAULT_STATE, drill, encodeHash, nextStage, select, shallower, storeHash, toggle, up,
   type ViewState,
 } from "./state";
 
@@ -8,6 +8,7 @@ const known = {
   box: (id: string) => ["", "m/a", "m/b", "m/a#pkg"].includes(id),
   folder: (id: string) => ["m/a", "m/b"].includes(id),
   node: (id: string) => id.startsWith("m/"),
+  centre: (id: string) => ["m/a", "m/b"].includes(id),
 };
 
 describe("URL hash", () => {
@@ -17,9 +18,9 @@ describe("URL hash", () => {
   });
   it("round-trips every field, with toggles sorted", () => {
     const s: ViewState = { focus: "m/a#pkg", depth: 3, toggled: ["m/b", "m/a"], selected: "m/a.T",
-      hops: 2, stage: "triangles", edges: "off", minPairs: 4, externals: false, proposal: null };
+      hops: 2, stage: "triangles", edges: "off", minPairs: 4, externals: false, proposal: null, centre: "m/b", more: true };
     const h = encodeHash(s);
-    expect(h).toBe("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0");
+    expect(h).toBe("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0&c=m%2Fb&m=1");
     expect(decodeHash(h, known)).toEqual({ ...s, toggled: ["m/a", "m/b"] });
   });
   it("keeps the edge mode as l: absent for auto, 1 for on, 0 for off, as 05's links wrote it (11)", () => {
@@ -33,7 +34,7 @@ describe("URL hash", () => {
     expect(decodeHash("#d=2&l=0", known)).toEqual({ ...DEFAULT_STATE, depth: 2, edges: "off" });
     expect(decodeHash("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0", known)).toEqual({
       focus: "m/a#pkg", depth: 3, toggled: ["m/a", "m/b"], selected: "m/a.T", hops: 2, stage: "triangles",
-      edges: "off", minPairs: 4, externals: false, proposal: null,
+      edges: "off", minPairs: 4, externals: false, proposal: null, centre: null, more: false,
     });
     // Each writes back unchanged.
     for (const h of ["#d=3&l=0", "#f=m%2Fa&d=6&l=0", "#d=2&l=0"]) expect(encodeHash(decodeHash(h, known))).toBe(h);
@@ -42,6 +43,30 @@ describe("URL hash", () => {
     expect(decodeHash("#f=evil&d=0&d=abc&t=nope&t=m%2Fa%23pkg&s=%3Cb%3E&h=-1&x=none&w=99999", known))
       .toEqual(DEFAULT_STATE);
   });
+  it("keeps the Screen's Centre as c, and its rows drawn whole as m, only with a Centre (17)", () => {
+    expect(decodeHash("#c=m%2Fb&m=1", known)).toEqual({ ...DEFAULT_STATE, centre: "m/b", more: true });
+    expect(decodeHash("#c=m%2Fb", known)).toEqual({ ...DEFAULT_STATE, centre: "m/b" });
+    expect(decodeHash("#m=1", known)).toEqual(DEFAULT_STATE);
+    expect(decodeHash("#c=m%2Fa.T&m=1", known)).toEqual(DEFAULT_STATE); // not a Centre
+    const { centre: _, ...older } = known; // a Known without centre (a Change View) names none
+    expect(decodeHash("#c=m%2Fb", older)).toEqual(DEFAULT_STATE);
+  });
+  it("adds a history entry only when the Centre changes, so Back walks the Screens (17)", () => {
+    const calls: string[] = [];
+    const history = {
+      replaceState: (_: null, __: string, url: string) => void calls.push("replace " + url),
+      pushState: (_: null, __: string, url: string) => void calls.push("push " + url),
+    };
+    const page = { pathname: "/z", search: "", hash: "#s=m%2Fa" };
+    const tree = { ...DEFAULT_STATE, selected: "m/a" };
+    storeHash(page, history, centreAt(tree, "m/a"), tree); // into the Screen
+    storeHash({ ...page, hash: "#s=m%2Fa&c=m%2Fa" }, history, centreAt(tree, "m/b"), centreAt(tree, "m/a")); // re-centred
+    storeHash({ ...page, hash: "#s=m%2Fa&c=m%2Fb" }, history, { ...centreAt(tree, "m/b"), more: true }, centreAt(tree, "m/b"));
+    storeHash({ ...page, hash: "#s=m%2Fa&c=m%2Fb&m=1" }, history, tree, centreAt(tree, "m/b")); // back to the tree
+    expect(calls).toEqual(["push /z#s=m%2Fa&c=m%2Fa", "push /z#s=m%2Fa&c=m%2Fb", "replace /z#s=m%2Fa&c=m%2Fb&m=1", "push /z#s=m%2Fa"]);
+    const refuses = { replaceState: () => {}, pushState: () => { throw new Error("SecurityError"); } };
+    expect(storeHash(page, refuses, centreAt(tree, "m/a"), tree)).toBe(false);
+  });
   it("stores the hash with replaceState, clears it for the default, survives a refusal", () => {
     const writes: string[] = [];
     const history = { replaceState: (_: null, __: string, url: string) => void writes.push(url) };
@@ -65,6 +90,10 @@ describe("transitions", () => {
     expect(toggle(toggle(DEFAULT_STATE, "m/b"), "m/a").toggled).toEqual(["m/a", "m/b"]);
     expect(toggle({ ...DEFAULT_STATE, toggled: ["m/a"] }, "m/a").toggled).toEqual([]);
   });
+  it("a new Centre draws its rows capped again, and keeps the tree as it was (17)", () => {
+    const s = { ...DEFAULT_STATE, focus: "m/a", selected: "m/a", centre: "m/a", more: true };
+    expect(centreAt(s, "m/b")).toEqual({ ...s, centre: "m/b", more: false });
+  });
   it("clearing the selection clears hops; depth steps stay within 1..32; the cycle wraps to full", () => {
     expect(select({ ...DEFAULT_STATE, selected: "x", hops: 2 }, null)).toMatchObject({ selected: null, hops: null });
     expect(shallower(DEFAULT_STATE, 1).depth).toBe(1);
```

- [ ] **Run:** `cd web && npx vitest run src/state.test.ts src/proposal.test.ts src/lens.test.ts` Expected: FAIL (`Failed to resolve import "./lens"`; `centreAt` is not a function; `c` is dropped)

- [ ] **Keep the Centre in the hash, push only when it changes, and enter and leave the lens**

```diff
diff --git a/web/src/lens.ts b/web/src/lens.ts
new file mode 100644
index 0000000..6005ab1
--- /dev/null
+++ b/web/src/lens.ts
@@ -0,0 +1,28 @@
+// 17: the two lenses, the tree and the Screen, and the way between them (the
+// s key). The tree's fields of the hash stay as the reader left them while
+// the Screen is drawn.
+import type { View } from "./data";
+import { centreOf } from "./screen";
+import { reveal } from "./search";
+import { centreAt, type ViewState } from "./state";
+
+// enter draws the Screen of the selection's Centre: a method's type, a
+// package's own box's package. A selection that names none leaves s as it is.
+export function enter(view: View, s: ViewState): ViewState {
+  const c = centreOf(view, s.selected);
+  return c === null ? s : centreAt(s, c);
+}
+
+// leave draws the tree again: as the reader left it while the Centre is
+// still the selection's, else drawn at the Centre with it selected, as a
+// search pick is (reveal).
+export function leave(view: View, s: ViewState): ViewState {
+  const tree = { ...s, centre: null, more: false };
+  return s.centre === null || centreOf(view, s.selected) === s.centre ? tree : reveal(view, s.centre, tree);
+}
+
+// drawnCentre is the Centre the page draws: s's while view has it. A newer
+// View from zu serve's watch can lose it, and the page renders with that View
+// before revalidate drops the Centre from s: it draws the tree meanwhile.
+export const drawnCentre = (view: View, s: ViewState): string | null =>
+  s.centre !== null && centreOf(view, s.centre) === s.centre ? s.centre : null;
diff --git a/web/src/scene.ts b/web/src/scene.ts
index 1971fed..2ceb450 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -12,6 +12,7 @@ import { boxStats, statsLine } from "./tree";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
 import { badgesOf, BUDGET, capRows, factsOf, fold, foldInto, holdsProgram, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
+import { centreOf } from "./screen";
 import { toggle, type Known, type Stage, type ViewState } from "./state";
 
 export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
@@ -627,15 +628,16 @@ export function fitDepth(requested: Sized & { depth: number }, at: (depth: numbe
 }
 
 // knownIds says which ids a URL hash may name: boxes as a focus, boxes with
-// children as toggles, anything scene() can anchor as a selection, and a
+// children as toggles, anything scene() can anchor as a selection, a
 // Proposal outside a Change View: the Change View's violations are zu diff's,
-// under zu.policy.yaml, so it never draws a Proposal's.
+// under zu.policy.yaml, so it never draws a Proposal's; and (17) a Centre.
 export const knownIds = (view: View): Known => ({
   box: (id) => id === "" || isBox(view, id),
   folder: (id) => knownGroup(view, id) || (!id.endsWith(PKG) && childrenOf(view, id).length > 0)
     || (id.endsWith(ROOT_CLOSED) && id.slice(0, -ROOT_CLOSED.length) === rootModule(view)),
   node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS || knownGroup(view, id),
   proposal: (name) => view.kind !== "change" && (view.policy?.proposals?.some((p) => p.name === name) ?? false),
+  centre: (id) => centreOf(view, id) === id, // 17: never in a Change View, never a method
 });
 
 // openFull says a Change View focus (from a link) lies outside the changed
diff --git a/web/src/state.ts b/web/src/state.ts
index aada779..268d15f 100644
--- a/web/src/state.ts
+++ b/web/src/state.ts
@@ -28,11 +28,15 @@ export type ViewState = {
   minPairs: number; // hide bundles with fewer package pairs (A6)
   externals: boolean; // draw external modules
   proposal: string | null; // 07: the Proposal drawn instead of the Package Tree, by name
+  // 17: the Screen's Centre, drawn instead of the tree; the fields above stay
+  // as the tree was left, so leaving the Screen returns to it.
+  centre: string | null;
+  more: boolean; // 17: the Screen draws every box of its rows, none past ROW_CAP folded
 };
 
 export const DEFAULT_STATE: ViewState = {
   focus: "", depth: null, toggled: [], selected: null, hops: null,
-  stage: "full", edges: "auto", minPairs: 1, externals: true, proposal: null,
+  stage: "full", edges: "auto", minPairs: 1, externals: true, proposal: null, centre: null, more: false,
 };
 
 export const LIMITS = { depth: 32, hops: 9, minPairs: 999 };
@@ -51,14 +55,17 @@ export function encodeHash(s: ViewState): string {
   if (s.minPairs !== 1) p.set("w", String(s.minPairs));
   if (!s.externals) p.set("e", "0");
   if (s.proposal !== null) p.set("p", s.proposal);
+  if (s.centre !== null) p.set("c", s.centre);
+  if (s.more) p.set("m", "1");
   const q = p.toString();
   return q ? "#" + q : "";
 }
 
 // Known says which ids a hash may name: a focus, a toggle (a box with child
-// boxes), a selection and (07) a Proposal.
+// boxes), a selection, (07) a Proposal and (17) a Centre.
 export type Known = {
   box(id: string): boolean; folder(id: string): boolean; node(id: string): boolean; proposal?(name: string): boolean;
+  centre?(id: string): boolean;
 };
 
 // decodeHash reads a hash from anywhere (a shared link is untrusted input):
@@ -75,6 +82,8 @@ export function decodeHash(hash: string, known: Known): ViewState {
   const selected = p.get("s");
   const stage = p.get("x");
   const proposal = p.get("p");
+  const centre = p.get("c");
+  const screen = centre !== null && (known.centre?.(centre) ?? false);
   return {
     focus: known.box(focus) ? focus : "",
     depth: int("d", LIMITS.depth),
@@ -86,21 +95,30 @@ export function decodeHash(hash: string, known: Known): ViewState {
     minPairs: int("w", LIMITS.minPairs) ?? 1,
     externals: p.get("e") !== "0",
     proposal: proposal !== null && known.proposal?.(proposal) ? proposal : null,
+    centre: screen ? centre : null,
+    more: screen && p.get("m") === "1",
   };
 }
 
 // The address bar: the parts of location and history the hash needs.
 export type Address = { pathname: string; search: string; hash: string };
-export type Replacer = { replaceState(data: null, unused: string, url: string): void };
+export type Replacer = {
+  replaceState(data: null, unused: string, url: string): void;
+  pushState?(data: null, unused: string, url: string): void;
+};
 
 // storeHash writes s into the address bar without adding a history entry
-// (Deviation 5). It skips a write that changes nothing, and returns false when
-// the browser refuses replaceState (some do on file://): the view still works.
-export function storeHash(page: Address, history: Replacer, s: ViewState): boolean {
+// (Deviation 5), except (17) when s has another Centre than was, the state
+// the address bar holds: entering or leaving the Screen, or re-centring it,
+// adds one, so the browser's Back returns to the last Screen. It skips a
+// write that changes nothing, and returns false when the browser refuses the
+// write (some do on file://): the view still works.
+export function storeHash(page: Address, history: Replacer, s: ViewState, was?: ViewState): boolean {
   const hash = encodeHash(s);
   if (hash === (page.hash === "#" ? "" : page.hash)) return true;
+  const write = was !== undefined && was.centre !== s.centre && history.pushState ? history.pushState : history.replaceState;
   try {
-    history.replaceState(null, "", page.pathname + page.search + hash);
+    write.call(history, null, "", page.pathname + page.search + hash);
     return true;
   } catch {
     return false;
@@ -126,6 +144,9 @@ export const toggle = (s: ViewState, box: string): ViewState => ({
   toggled: s.toggled.includes(box) ? s.toggled.filter((t) => t !== box) : [...s.toggled, box].sort(),
 });
 
+// centreAt draws the Screen of a Centre (17), its rows capped again.
+export const centreAt = (s: ViewState, centre: string): ViewState => ({ ...s, centre, more: false });
+
 export const select = (s: ViewState, id: string | null): ViewState =>
   ({ ...s, selected: id, hops: id === null ? null : s.hops });
 
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Commit:** `Keep the Screen's Centre in the hash, and add a history entry only when it changes`

---

### Task 6: The page draws the Screen (`App.tsx`, `ScreenCanvas.tsx`)

The unit tests check:
- **`keys.ts`:**
  - `s` maps to the lens on either lens, and to nothing while typing;
  - Esc on the Screen closes search first, then leaves;
  - `d`, `+`, `=` and `-` do nothing on the Screen; `/` and `f` still work.
- **The CSS** draws each size's label at the px `placeScreen` sized it for, and small is `.node`'s own size.
- **`screenNote`** reads right for store, for Repo (out of it, and unresolved), for both ways at once, and for Status (unresolved only).
- **↻:** a box drawn in both rows says so in its facts, in each row.

The browser check, `screen.mjs`, runs in Chromium, Firefox and WebKit, on three pages: the shop View, the shop Change View, and a View where 30 packages import `m/core`. It makes 14 checks:
- **enter:** with store selected, `s` draws its Screen (checkout above; money and `lib/pq` below), `c` is set, and one history entry is added.
- **button:** the Screen button was enabled with store selected, and is pressed on the Screen.
- **panel:** the Panel shows store; its × closes it; after a re-centre it shows checkout.
- **recentre:** a click on checkout re-centres; one more entry.
- **back:** Back returns to store's Screen, and Back again to the tree, with `s` = store, no `c`, and store's box centred in the canvas.
- **forward:** Forward returns to store's Screen.
- **keyboard:** Enter on checkout's focused box re-centres on it, and focus is on checkout's box on the new Screen.
- **wordStart:** `/RW` and Enter re-centre on ReadWriter, with Reader below.
- **honest:** `/Repo` re-centres on Repo, with Open below. The note says "1 call or embed out of it, with declarations in packages not included" and "4 unresolved calls".
- **esc:** Esc returns to the tree with Repo selected and centred in the canvas.
- **more:** `m/core` draws 24 importers and the chip. The chip draws all 30, sets `m=1`, adds no entry, and ticks "every box"; unticking it draws the 24 again. Ticked again from the keyboard (focus, Space), the checkbox keeps the focus, and `s` still leaves the Screen.
- **disabled:** with nothing selected, the Screen button is disabled.
- **change:** in the Change View, `s` draws nothing, and a `c=` link is ignored.
- **errors:** no page errors.

`serve.mjs` gains one check, **lost**: in `zu serve`, a Screen centred on a function draws; deleting the function's file draws the tree again, with no `c` and no page error.

**Files:**
- Tests: `web/src/keys.test.ts`, `web/src/screen.test.ts`, `web/e2e/screen.mjs` (new), `web/e2e/serve.mjs`, `web/e2e/package.json`
- Code: `web/src/keys.ts`, `web/src/screen.ts`, `web/src/useViewState.ts`, `web/src/ScreenCanvas.tsx` (new), `web/src/App.tsx`, `web/src/Header.tsx`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing tests and browser check**

```diff
diff --git a/web/e2e/package.json b/web/e2e/package.json
index 9ab346a..b56b466 100644
--- a/web/e2e/package.json
+++ b/web/e2e/package.json
@@ -6,7 +6,8 @@
     "browsers": "playwright-core install chromium firefox webkit",
     "accept": "node accept.mjs",
     "accept-serve": "node serve.mjs",
-    "accept-place": "node place.mjs"
+    "accept-place": "node place.mjs",
+    "accept-screen": "node screen.mjs"
   },
   "devDependencies": {
     "playwright-core": "1.63.0"
diff --git a/web/e2e/screen.mjs b/web/e2e/screen.mjs
new file mode 100644
index 0000000..0c95760
--- /dev/null
+++ b/web/e2e/screen.mjs
@@ -0,0 +1,183 @@
+// Browser acceptance for the Screen (17). Not part of make check: it needs
+// browsers. Run from web/e2e after `make build`: npm run accept-screen.
+// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
+import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+import { chromium, firefox, webkit } from "playwright-core";
+
+const here = new URL(".", import.meta.url).pathname;
+const dir = mkdtempSync(join(tmpdir(), "zu-screen-"));
+process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
+
+// page writes a View into the built page, as zu does.
+function page(name, v) {
+  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
+  const marker = '<script id="zu-data" type="application/json">{}</script>';
+  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
+  const f = join(dir, name + ".html");
+  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c"))));
+  return f;
+}
+const golden = (name) => JSON.parse(readFileSync(join(here, `../../internal/export/testdata/${name}.golden.json`), "utf8"));
+const shop = page("shop", golden("shop.view"));
+const change = page("change", golden("shop.change"));
+// many: m/core, imported by 30 packages, more than a row draws (ROW_CAP 24).
+const many = (() => {
+  const loc = { path: "x.go", line: 1 };
+  const ids = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
+  const nodes = ["m/core", ...ids].map((id) => ({ id, kind: "package", module: "m", loc }));
+  const edges = ids.map((from) => ({ from, to: "m/core", kind: "imports", count: 1, loc }));
+  return page("many", { ...golden("shop.view"), modules: ["m"], sources: {}, nodes, edges });
+})();
+
+const S = "example.com/shop/internal/store";
+const C = "example.com/shop/internal/checkout";
+const enc = encodeURIComponent;
+
+async function open(b, file, hash) {
+  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
+  const errors = [];
+  // WebKit's one benign notice, dropped by equality as 14's serve.mjs does (A1).
+  p.on("pageerror", (e) => e.message === "ResizeObserver loop completed with undelivered notifications." || errors.push(e.message));
+  await p.goto("file://" + file + hash);
+  await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
+  await p.waitForTimeout(300);
+  return { p, errors };
+}
+const hash = (p) => p.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
+const centre = (p) => p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("c"));
+// drawn is the Screen's boxes by id, once the Screen of c is drawn (null: no Screen).
+const drawn = async (p, c) => {
+  await p.waitForFunction((c) => c === null
+    ? !document.querySelector(".screen") && document.querySelector(".react-flow__node")
+    : document.querySelector(`.screen .react-flow__node[data-id="${CSS.escape(c)}"]`), c, { timeout: 10000 });
+  await p.waitForTimeout(150);
+  return p.evaluate(() => [...document.querySelectorAll(".screen .react-flow__node")].map((e) => e.dataset.id).sort());
+};
+const entries = (p) => p.evaluate(() => history.length);
+// centred says id's box is in the middle of the tree's canvas, as a search pick leaves it.
+const centred = (p, id) => p.waitForFunction((id) => {
+  const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
+  const n = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
+  return pane && n && Math.abs(n.x + n.width / 2 - pane.x - pane.width / 2) < 4 && Math.abs(n.y + n.height / 2 - pane.y - pane.height / 2) < 4;
+}, id, { timeout: 5000 }).then(() => true, () => false);
+const panel = (p) => p.locator("aside.panel code.id").textContent({ timeout: 1000 }).catch(() => null);
+const lens = (p) => p.locator('[aria-label="Lens"] button');
+
+async function walk(b) {
+  const { p, errors } = await open(b, shop, `#s=${enc(S)}`);
+  const got = {};
+  const start = await entries(p);
+  const enabled = await lens(p).isEnabled();
+  await p.keyboard.press("s");
+  got.enter = JSON.stringify(await drawn(p, S)) === JSON.stringify([S, "down:example.com/shop/internal/money", "down:github.com/lib/pq", `up:${C}`].sort())
+    && (await centre(p)) === S && (await entries(p)) === start + 1;
+  got.button = [enabled, await lens(p).getAttribute("aria-pressed")];
+  // The Screen's Panel shows the Centre; closed, it stays closed until the Centre changes.
+  const shown = await panel(p);
+  await p.locator('aside.panel button[aria-label="Close panel"]').click();
+  const closed = await panel(p);
+  await p.click(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}`)}"]`);
+  const at = await drawn(p, C);
+  got.recentre = (await centre(p)) === C && at.includes("up:example.com/shop") && at.includes(`down:${S}`) && (await entries(p)) === start + 2;
+  got.panel = [shown?.startsWith(S), closed, (await panel(p))?.startsWith(C)];
+  await p.goBack();
+  const back = await drawn(p, S);
+  await p.goBack();
+  await drawn(p, null);
+  const tree = await hash(p);
+  got.back = back.includes(`up:${C}`) && tree.c === undefined && tree.s === S && (await centred(p, S));
+  await p.goForward();
+  got.forward = (await drawn(p, S)).includes(`up:${C}`) && (await centre(p)) === S;
+  // Enter on a focused box re-centres, and the keyboard goes on from the new Centre.
+  await p.focus(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}`)}"]`);
+  await p.keyboard.press("Enter");
+  await drawn(p, C);
+  got.keyboard = [await centre(p), await p.evaluate(() => document.activeElement?.getAttribute("data-id"))];
+  // Word-start Jump: "RW" is ReadWriter's Read, Writer.
+  await p.keyboard.press("/");
+  await p.keyboard.type("RW");
+  await p.keyboard.press("Enter");
+  got.wordStart = (await drawn(p, `${S}.ReadWriter`)).includes(`down:${S}.Reader`);
+  await p.keyboard.press("/");
+  await p.keyboard.type("Repo");
+  await p.keyboard.press("Enter");
+  const repo = await drawn(p, `${S}.Repo`);
+  const note = await p.locator("#zu-screen").innerText();
+  got.honest = repo.includes(`down:${S}.Open`) && note.includes("1 call or embed out of it, with declarations in packages not included")
+    && note.includes("4 unresolved calls");
+  await p.keyboard.press("Escape");
+  await drawn(p, null);
+  const left = await hash(p);
+  got.esc = left.c === undefined && left.s === `${S}.Repo` && (await centred(p, `${S}.Repo`));
+  await p.close();
+  return { got, errors };
+}
+
+async function rows(b) {
+  const bare = await open(b, shop, "");
+  const disabled = await lens(bare.p).isDisabled(); // nothing selected: no Centre
+  await bare.p.close();
+  const { p, errors } = await open(b, many, `#c=${enc("m/core")}`);
+  const capped = await drawn(p, "m/core");
+  const start = await entries(p);
+  await p.click('.react-flow__node[data-id="up:#more"]');
+  await p.waitForFunction(() => location.hash.includes("m=1"));
+  const all = await drawn(p, "m/core");
+  const every = p.locator('[aria-label="Lens"] input[type=checkbox]');
+  const checked = await every.isChecked();
+  await every.uncheck();
+  await p.waitForFunction(() => !location.hash.includes("m=1"));
+  const again = await drawn(p, "m/core");
+  const same = (await entries(p)) === start;
+  // Ticked from the keyboard, the checkbox keeps the focus; s still leaves the Screen.
+  await every.focus();
+  await p.keyboard.press("Space");
+  await p.waitForFunction(() => location.hash.includes("m=1"));
+  await drawn(p, "m/core");
+  const focused = await p.evaluate(() => document.activeElement?.getAttribute("type"));
+  await p.keyboard.press("s");
+  const left = await drawn(p, null).then(() => centre(p), () => "still on the Screen");
+  const got = {
+    more: capped.filter((id) => id.startsWith("up:m/")).length === 24 && capped.includes("up:#more")
+      && all.filter((id) => id.startsWith("up:m/")).length === 30 && !all.includes("up:#more") && same
+      && checked && JSON.stringify(again) === JSON.stringify(capped) && focused === "checkbox" && left === null,
+    disabled,
+  };
+  await p.close();
+  return { got, errors: [...bare.errors, ...errors] };
+}
+
+async function changeView(b) {
+  const { p, errors } = await open(b, change, `#s=${enc(S)}`);
+  await p.keyboard.press("s");
+  await p.waitForTimeout(500);
+  const pressed = (await centre(p)) === null && !(await p.locator(".screen").count());
+  await p.close();
+  const linked = await open(b, change, `#c=${enc(S)}`);
+  const ignored = (await centre(linked.p)) === null && !(await linked.p.locator(".screen").count());
+  await linked.p.close();
+  return { got: { change: pressed && ignored }, errors: [...errors, ...linked.errors] };
+}
+
+const CSS_ESCAPE = (s) => s.replace(/["\\]/g, "\\$&");
+const want = {
+  enter: true, button: [true, "true"], panel: [true, null, true], recentre: true, back: true, forward: true, keyboard: [C, C],
+  wordStart: true, honest: true, esc: true, more: true, disabled: true, change: true, errors: [],
+};
+const channel = process.env.ZU_E2E_CHANNEL;
+const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
+let failed = 0;
+for (const [name, type, opts] of engines) {
+  const b = await type.launch(opts);
+  const got = await (async () => {
+    const parts = [await walk(b), await rows(b), await changeView(b)];
+    return { ...Object.assign({}, ...parts.map((x) => x.got)), errors: parts.flatMap((x) => x.errors) };
+  })().catch((e) => ({ errors: [String(e.message ?? e).split("\n")[0]] })).finally(() => b.close().catch(() => {}));
+  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
+  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
+  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
+  failed += bad.length;
+}
+process.exit(failed ? 1 : 0);
diff --git a/web/e2e/serve.mjs b/web/e2e/serve.mjs
index e401bfd..07d6a02 100644
--- a/web/e2e/serve.mjs
+++ b/web/e2e/serve.mjs
@@ -1,4 +1,5 @@
-// Browser acceptance for zu serve (10 Task 6), its watch (13) and -base (14). Not part
+// Browser acceptance for zu serve (10 Task 6), its watch (13), -base (14) and
+// a Screen whose Centre the watch deletes (17). Not part
 // of make check: it needs browsers and a bin/zu built with the UI. Run from
 // web/e2e after `make build`: npm run accept-serve
 import { execFileSync, spawn } from "node:child_process";
@@ -112,6 +113,17 @@ async function run(name, b) {
   out.broken = [said.includes(`live${name}.go`), await has(p, live), (await frame()) === frame0];
   writeFileSync(file, `package store\n\nfunc Live${name}() {}\n\nfunc Again${name}() {}\n`);
   out.fixed = [await node(`example.com/shop/internal/store.Again${name}`), await notice.count()];
+  // 17: a Screen whose Centre a save deletes draws the tree again, with no page error.
+  const gone = `example.com/shop/internal/store.Gone${name}`;
+  const goneFile = join(dir, "internal", "store", `gone${name}.go`);
+  writeFileSync(goneFile, `package store\n\nfunc Gone${name}() {}\n`);
+  const appeared = await node(gone);
+  await p.evaluate((h) => (location.hash = h), `#s=${encodeURIComponent(gone)}&c=${encodeURIComponent(gone)}`);
+  const screen = await p.locator(`.screen .react-flow__node[data-id="${gone}"]`).waitFor({ timeout: 15000 }).then(() => true, () => false);
+  rmSync(goneFile);
+  const tree = await p.locator(".screen").waitFor({ state: "detached", timeout: 15000 })
+    .then(() => p.locator(".react-flow__node").first().waitFor({ timeout: 15000 })).then(() => true, () => false);
+  out.lost = [appeared && screen, tree, !(await hash()).includes("c=")];
   await p.close();
   // 13: a hidden page holds no stream, so a seventh page still loads,
   // though a browser opens at most six connections to one host.
@@ -163,6 +175,7 @@ const want = {
   live: [true, true, true],
   broken: [true, 1, true],
   fixed: [true, 0],
+  lost: [true, true, true],
   tabs: true,
   change: [true, true, true, true],
   errors: [],
diff --git a/web/src/keys.test.ts b/web/src/keys.test.ts
index 8b4bc2c..540bf72 100644
--- a/web/src/keys.test.ts
+++ b/web/src/keys.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import { keyAction } from "./keys";
 
-const ctx = { searchOpen: false, selected: false, atRoot: false, typing: false, mod: false };
+const ctx = { searchOpen: false, selected: false, atRoot: false, typing: false, mod: false, screen: false };
 
 describe("keys", () => {
   it("Esc closes search, then clears the selection, then goes up, then does nothing", () => {
@@ -10,6 +10,18 @@ describe("keys", () => {
     expect(keyAction("Escape", ctx)).toBe("up");
     expect(keyAction("Escape", { ...ctx, atRoot: true })).toBeNull();
   });
+  it("s enters and leaves the Screen; Esc on it leaves it after closing search (17)", () => {
+    expect(keyAction("s", ctx)).toBe("lens");
+    expect(keyAction("s", { ...ctx, screen: true })).toBe("lens");
+    expect(keyAction("s", { ...ctx, typing: true })).toBeNull();
+    expect(keyAction("Escape", { ...ctx, screen: true, searchOpen: true })).toBe("closeSearch");
+    expect(keyAction("Escape", { ...ctx, screen: true, selected: true, atRoot: true })).toBe("lens");
+  });
+  it("the tree's keys do nothing on the Screen, but / and f do (17)", () => {
+    for (const k of ["d", "+", "=", "-"]) expect(keyAction(k, { ...ctx, screen: true }), k).toBeNull();
+    expect(keyAction("/", { ...ctx, screen: true })).toBe("search");
+    expect(keyAction("f", { ...ctx, screen: true })).toBe("fit");
+  });
   it("letters do nothing while typing in the search box", () => {
     expect(keyAction("/", ctx)).toBe("search");
     expect(keyAction("d", { ...ctx, typing: true })).toBeNull();
diff --git a/web/src/screen.test.ts b/web/src/screen.test.ts
index a4ebd79..3006283 100644
--- a/web/src/screen.test.ts
+++ b/web/src/screen.test.ts
@@ -1,9 +1,11 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
+import css from "./styles.css?raw";
 import change from "../../internal/export/testdata/shop.change.golden.json";
 import type { View, ViewEdge } from "./data";
 import { ROW_MAX } from "./layout";
-import { centreOf, GAP_ROW, placeScreen, ROW_CAP, screenOf, type Drawn } from "./screen";
+import { centreOf, FONT, GAP_ROW, placeScreen, ROW_CAP, screenNote, screenOf, type Drawn } from "./screen";
+import { LABEL_PX } from "./viewport";
 import { decl, edge, exts, pkgs, view } from "./testkit";
 
 const shop = golden as unknown as View;
@@ -158,3 +160,32 @@ describe("placeScreen", () => {
     expect(p.edges.some((e) => e.from === "up:#more")).toBe(false);
   });
 });
+
+describe("the Screen's styles (17)", () => {
+  it("draws each size's label at the px placeScreen sized it for", () => {
+    const px = (size: string) => new RegExp(`\\.node\\.screen-box\\.${size} \\.label[^{]*\\{[^}]*font-size: (\\d+)px`).exec(css)?.[1];
+    expect([px("medium"), px("large"), px("centre")].map(Number)).toEqual([FONT.medium, FONT.large, FONT.centre]);
+    expect(FONT.small).toBe(LABEL_PX); // .node's own size, so the floor zoom keeps every label readable
+  });
+});
+
+describe("screenNote (17)", () => {
+  it("says what the rows and sizes are, and what the Screen leaves out", () => {
+    expect(screenNote(screenOf(shop, S))).toBe("Above: what imports it. Below: what it imports. Size: files that import.");
+    expect(screenNote(screenOf(shop, `${S}.Repo`))).toBe(
+      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
+      "Not drawn: 1 call or embed out of it, with declarations in packages not included (re-run with -include); " +
+      "4 unresolved calls in its package.");
+    expect(screenNote({ ...screenOf(shop, `${S}.Repo`), offIn: 2, unresolved: 0 })).toBe(
+      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
+      "Not drawn: 2 calls and embeds into it and 1 call or embed out of it, with declarations in packages not included (re-run with -include).");
+    expect(screenNote(screenOf(shop, `${S}.Status`))).toBe(
+      "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). " +
+      "Not drawn: 4 unresolved calls in its package.");
+  });
+  it("marks a box drawn in both rows ↻", () => {
+    const p = placeScreen(screenOf(view(pkgs(["m/a", "m/b", "m/c"], "m"), [edge("m/a", "m/b"), edge("m/b", "m/a"), edge("m/c", "m/a")]), "m/a"));
+    expect(p.nodes.filter((n) => n.row !== "centre").map((n) => [n.id, n.facts]))
+      .toEqual([["up:m/b", "↻ 1 file"], ["up:m/c", "1 file"], ["down:m/b", "↻ 1 file"]]);
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/keys.test.ts src/screen.test.ts` Expected: FAIL (5 tests: `s` maps to nothing and `d` still declutters on the Screen; `FONT` is undefined; `screenNote` is not a function; no box is marked ↻)

- [ ] **Run:** `cd web && npx vite build >/dev/null && cd e2e && node screen.mjs` Expected: FAIL (the page has no Lens toolbar: the first wait, for the Screen button, times out, so 0/14 checks pass in each engine)

- [ ] **Run:** `cd web && npx vite build >/dev/null && cd .. && go build -o bin/zu ./cmd/zu && cd web/e2e && node serve.mjs` Expected: FAIL (lost: no Screen is drawn; 10/11 checks pass in each engine)

- [ ] **Draw the Screen**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 7d652a0..5a7aa4f 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -2,13 +2,14 @@ import { useEffect, useMemo, useRef, useState } from "react";
 import { ReactFlowProvider } from "@xyflow/react";
 import { Canvas } from "./Canvas";
 import { changedSubgraph, nodeMark } from "./change";
-import { home, upTo } from "./cut";
+import { home, isBox, upTo } from "./cut";
 import type { View } from "./data";
 import { isGroup } from "./group";
 import { pageEngine } from "./engine";
 import { Header } from "./Header";
 import { redLegend, violationsNote } from "./headline";
 import { keyAction } from "./keys";
+import { drawnCentre, enter, leave } from "./lens";
 import { elkGraph, headers, Superseded, type Placed } from "./layout";
 import { show } from "./place";
 import { Panel } from "./Panel";
@@ -17,7 +18,9 @@ import { PROPOSAL_NOTICE, proposalView } from "./proposal";
 import { reveal } from "./search";
 import { SearchBox } from "./SearchBox";
 import { DRAW_LIMIT, fitDepth, HUBS, opening, openFull, scene, type Scene, type SceneNode } from "./scene";
-import { deeper, drill, nextStage, select, shallower, toggle, up, type ViewState } from "./state";
+import { centreOf, placeScreen, screenNote, screenOf } from "./screen";
+import { ScreenCanvas } from "./ScreenCanvas";
+import { centreAt, deeper, drill, nextStage, select, shallower, toggle, up, type ViewState } from "./state";
 import { Toolbar } from "./Toolbar";
 import { useViewState } from "./useViewState";
 
@@ -126,6 +129,23 @@ export function App({ view: whole }: { view: View }) {
     () => (change || state.proposal === null ? whole : proposalView(whole, state.proposal)),
     [whole, change, state.proposal],
   );
+  // 17: the Screen of the Centre, drawn instead of the tree: never in a Change
+  // View (knownIds), and in a Proposal over the Proposal's View.
+  const centre = drawnCentre(proposed, state);
+  const onScreen = centre !== null;
+  const screen = useMemo(
+    () => (centre === null ? null : screenOf(proposed, centre, state.more)),
+    [proposed, centre, state.more],
+  );
+  const drawing = useMemo(() => screen && placeScreen(screen), [screen]);
+  const canEnter = centreOf(proposed, state.selected) !== null;
+  const lens = () => update((s) => (s.centre === null ? enter(proposed, s) : leave(proposed, s)));
+  const recentre = (id: string) => {
+    const c = centreOf(proposed, id);
+    if (c !== null) update((s) => centreAt(s, c));
+  };
+  // The Panel shows the Centre until the reader closes it, then the next one.
+  const [closed, setClosed] = useState<string | null>(null);
   // The Change View opens on the changed subgraph (Q4); U10 toggles to all of
   // it. A link whose focus lies outside the subgraph opens all of it, at that
   // focus: from the start, and on a later hashchange.
@@ -146,7 +166,7 @@ export function App({ view: whole }: { view: View }) {
   const sceneOf = useMemo(() => {
     const at = new Map<string, Scene>();
     const made = (s: ViewState, base: Scene | null): Scene => {
-      const k = JSON.stringify(s);
+      const k = JSON.stringify({ ...s, centre: null, more: false }); // 17: the Screen draws no tree
       const hit = at.get(k);
       if (hit) return hit;
       if (at.size >= SCENES) at.clear();
@@ -206,7 +226,7 @@ export function App({ view: whole }: { view: View }) {
   const [placed, setPlaced] = useState<Drawing | null>(null);
   const [failed, setFailed] = useState<string | null>(null);
   useEffect(() => {
-    if (ask) return;
+    if (ask || onScreen) return; // 17: the Screen needs no layout
     const made = { whole, view, sc };
     performance.mark("zu-layout-start");
     if (frames.current.size > FRAMES) frames.current.clear();
@@ -222,7 +242,7 @@ export function App({ view: whole }: { view: View }) {
         if (!(e instanceof Superseded)) setFailed(e.message);
       },
     );
-  }, [engine, graph, heads, ask]);
+  }, [engine, graph, heads, ask, onScreen]);
 
   const go = (box: string) => {
     update((s) => drill(s, box));
@@ -237,14 +257,26 @@ export function App({ view: whole }: { view: View }) {
     update((s) => ({ ...drill(s, ""), selected: id }));
     setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
   };
+  // 17: the tree comes back centred on its selection, however the Screen was
+  // left (s, Esc, Back): its pan and zoom are not kept while a Screen is drawn.
+  const wasScreen = useRef(onScreen);
+  useEffect(() => {
+    if (wasScreen.current && !onScreen && state.selected !== null) {
+      const id = state.selected;
+      setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
+    }
+    wasScreen.current = onScreen;
+  }, [onScreen, state.selected]);
   useEffect(() => {
     const onKey = (e: KeyboardEvent) => {
       const a = keyAction(e.key, {
         searchOpen,
         selected: state.selected !== null,
         atRoot: upTo(view, state.focus) === null,
-        typing: e.target instanceof HTMLInputElement,
+        // A checkbox (every box, externals) keeps the focus after a click but takes no keys.
+        typing: e.target instanceof HTMLInputElement && e.target.type !== "checkbox",
         mod: e.metaKey || e.ctrlKey || e.altKey,
+        screen: onScreen,
       });
       if (a === "search") {
         e.preventDefault();
@@ -256,10 +288,11 @@ export function App({ view: whole }: { view: View }) {
       else if (a === "declutter") update((s) => ({ ...s, stage: nextStage(s.stage) }));
       else if (a === "deeper") update((s) => deeper(s, sc.depth));
       else if (a === "shallower") update((s) => shallower(s, sc.depth));
+      else if (a === "lens") lens();
     };
     window.addEventListener("keydown", onKey);
     return () => window.removeEventListener("keydown", onKey);
-  }, [view, state, sc.depth, update, searchOpen]);
+  }, [view, proposed, state, sc.depth, update, searchOpen]);
 
   const open = (n: SceneNode) => {
     if (n.shape === "box" || n.shape === "container") go(n.id);
@@ -297,15 +330,36 @@ export function App({ view: whole }: { view: View }) {
         onFocus={go}
         full={change ? full : undefined}
         onToggle={flip}
+        screen={screen ? screenNote(screen) : undefined}
       />
       <div className="bar">
-        <Toolbar
-          state={state}
-          depth={sc.depth}
-          update={update}
-          proposals={change ? [] : (whole.policy?.proposals ?? []).map((p) => p.name)}
-        />
-        <SearchBox view={proposed} input={searchBox} onOpen={setSearchOpen} onPick={jump} />
+        {!change && (
+          <div className="toolbar" role="toolbar" aria-label="Lens">
+            <button
+              type="button"
+              aria-pressed={onScreen}
+              disabled={!onScreen && !canEnter}
+              title={onScreen ? "Back to the tree (s)" : canEnter ? "Draw the selection's Screen (s)" : "Select a package or declaration to draw its Screen (s)"}
+              onClick={lens}
+            >
+              Screen
+            </button>
+            {screen && (state.more || screen.above.more > 0 || screen.below.more > 0) && (
+              <label>
+                <input type="checkbox" checked={state.more} onChange={(e) => update((s) => ({ ...s, more: e.target.checked }))} /> every box
+              </label>
+            )}
+          </div>
+        )}
+        {!onScreen && (
+          <Toolbar
+            state={state}
+            depth={sc.depth}
+            update={update}
+            proposals={change ? [] : (whole.policy?.proposals ?? []).map((p) => p.name)}
+          />
+        )}
+        <SearchBox view={proposed} input={searchBox} onOpen={setSearchOpen} onPick={onScreen ? recentre : jump} />
       </div>
       {change && <ChangedList view={whole} onPick={pick} />}
       <main className="canvas">
@@ -314,7 +368,7 @@ export function App({ view: whole }: { view: View }) {
             {PROPOSAL_NOTICE}: {state.proposal}
           </div>
         )}
-        {!sc.noDetail && (
+        {!sc.noDetail && !onScreen && (
           <Legend
             change={change}
             policy={rules}
@@ -325,7 +379,7 @@ export function App({ view: whole }: { view: View }) {
             hubs={sc.nodes.some((n) => n.hub)}
           />
         )}
-        {sc !== requested && (
+        {sc !== requested && !onScreen && (
           <div className="notice" id="zu-notice" role="status">
             Collapsed to depth {sc.depth}: depth {requested.depth} has{" "}
             {requested.lines && requested.edges.length > DRAW_LIMIT.edges
@@ -339,7 +393,11 @@ export function App({ view: whole }: { view: View }) {
             </button>
           </div>
         )}
-        {sc.noDetail ? (
+        {drawing ? (
+          <ReactFlowProvider key={`${centre}\n${state.more}`}>
+            <ScreenCanvas drawing={drawing} onCentre={recentre} onMore={() => update((s) => ({ ...s, more: true }))} fit={fit} />
+          </ReactFlowProvider>
+        ) : sc.noDetail ? (
           <div className="empty">
             Declarations not included. Re-run with <code>-include {pkg}</code>
           </div>
@@ -389,7 +447,17 @@ export function App({ view: whole }: { view: View }) {
           </div>
         )}
       </main>
-      {(state.selected !== null || edge !== null) && (
+      {centre !== null && closed !== centre && (
+        <Panel
+          view={proposed}
+          id={isBox(proposed, centre + PKG) ? centre + PKG : centre}
+          edge={null}
+          bundles={[]}
+          onReveal={recentre}
+          onClose={() => setClosed(centre)}
+        />
+      )}
+      {!onScreen && (state.selected !== null || edge !== null) && (
         <Panel
           view={proposed}
           id={state.selected}
diff --git a/web/src/Header.tsx b/web/src/Header.tsx
index 006184b..2375415 100644
--- a/web/src/Header.tsx
+++ b/web/src/Header.tsx
@@ -17,9 +17,10 @@ type Props = {
   against?: number; // 11: dependencies against the rows (rank.ts); undefined draws no count
   full?: boolean; // Change View only: showing the full project, not the changed subgraph
   onToggle?: () => void;
+  screen?: string; // 17: the Screen is drawn: its note replaces the tree's crumbs and counts
 };
 
-export function Header({ view, focus, home = "", boxes, folded = 0, depth, onFocus, auto, from, hidden = 0, against, full, onToggle }: Props) {
+export function Header({ view, focus, home = "", boxes, folded = 0, depth, onFocus, auto, from, hidden = 0, against, full, onToggle, screen }: Props) {
   const compare = view.links?.compare?.startsWith("https://") ? view.links.compare : null;
   const [showErrors, setShowErrors] = useState(false);
   const errors = view.honesty.parseErrors;
@@ -45,42 +46,50 @@ export function Header({ view, focus, home = "", boxes, folded = 0, depth, onFoc
           ))}
         </ul>
       )}
-      <nav className="crumbs" aria-label="Focus">
-        {breadcrumb(view, focus, home).map((c, i, all) => (
-          <span key={c.id}>
-            {i > 0 && <span className="sep"> / </span>}
-            {i === all.length - 1 ? (
-              <strong>{c.label}</strong>
-            ) : (
-              <button type="button" className="link" onClick={() => onFocus(c.id)}>
-                {c.label}
-              </button>
+      {screen !== undefined ? (
+        <p className="note" id="zu-screen">
+          {screen}
+        </p>
+      ) : (
+        <>
+          <nav className="crumbs" aria-label="Focus">
+            {breadcrumb(view, focus, home).map((c, i, all) => (
+              <span key={c.id}>
+                {i > 0 && <span className="sep"> / </span>}
+                {i === all.length - 1 ? (
+                  <strong>{c.label}</strong>
+                ) : (
+                  <button type="button" className="link" onClick={() => onFocus(c.id)}>
+                    {c.label}
+                  </button>
+                )}
+              </span>
+            ))}
+          </nav>
+          <p className="note">
+            {depthNote(boxes, depth, auto, from, folded)}
+            {hidden > 0 && <span id="zu-edges"> {edgesNote(hidden)}</span>}
+            {against !== undefined && against > 0 && <span id="zu-against"> {againstNote(against)}</span>}
+            {full !== undefined && (
+              <>
+                {" "}
+                {full ? "Showing every package." : "Showing the changed packages and their direct importers."}{" "}
+                <button type="button" className="link" onClick={onToggle}>
+                  {full ? "Show changed subgraph" : "Show full project"}
+                </button>
+              </>
             )}
-          </span>
-        ))}
-      </nav>
-      <p className="note">
-        {depthNote(boxes, depth, auto, from, folded)}
-        {hidden > 0 && <span id="zu-edges"> {edgesNote(hidden)}</span>}
-        {against !== undefined && against > 0 && <span id="zu-against"> {againstNote(against)}</span>}
-        {full !== undefined && (
-          <>
-            {" "}
-            {full ? "Showing every package." : "Showing the changed packages and their direct importers."}{" "}
-            <button type="button" className="link" onClick={onToggle}>
-              {full ? "Show changed subgraph" : "Show full project"}
-            </button>
-          </>
-        )}
-        {compare && (
-          <>
-            {" · "}
-            <a href={compare} target="_blank" rel="noopener noreferrer">
-              {compareLabel(view.links, view.base?.commit, view.head.commit)}
-            </a>
-          </>
-        )}
-      </p>
+            {compare && (
+              <>
+                {" · "}
+                <a href={compare} target="_blank" rel="noopener noreferrer">
+                  {compareLabel(view.links, view.base?.commit, view.head.commit)}
+                </a>
+              </>
+            )}
+          </p>
+        </>
+      )}
     </header>
   );
 }
diff --git a/web/src/ScreenCanvas.tsx b/web/src/ScreenCanvas.tsx
new file mode 100644
index 0000000..546d9bd
--- /dev/null
+++ b/web/src/ScreenCanvas.tsx
@@ -0,0 +1,128 @@
+// 17: the Screen drawn (screen.ts placeScreen). No ELK: the boxes are placed
+// before React Flow sees them, so nothing waits for a layout. A click on a box
+// re-centres the Screen on it; a click on a row's "+N more" chip draws the
+// rows whole. The page keys this by the Centre and that flag, so each Screen
+// opens at its own first view (centredFit).
+import {
+  Background,
+  ControlButton,
+  Controls,
+  Handle,
+  MarkerType,
+  MiniMap,
+  Position,
+  ReactFlow,
+  type Edge,
+  type Node,
+  type NodeProps,
+  useReactFlow,
+} from "@xyflow/react";
+import { useEffect, useMemo, useRef, useState } from "react";
+import "@xyflow/react/dist/style.css";
+import type { Drawn, ScreenDrawing } from "./screen";
+import { centredFit, mapByDefault } from "./viewport";
+
+type SNode = Node<{ d: Drawn }>;
+
+// ScreenBox: the label at its Weight's size, the package or module under it,
+// and what the Weight is made of.
+function ScreenBox({ data: { d } }: NodeProps<SNode>) {
+  const at = useRef<HTMLDivElement>(null);
+  // Focus, lost with the last Screen (the page keys it by Centre), goes to
+  // the Centre's box, so a reader walking by keyboard goes on from it.
+  useEffect(() => {
+    if (d.row === "centre" && document.activeElement === document.body) {
+      at.current?.closest<HTMLElement>(".react-flow__node")?.focus({ preventScroll: true });
+    }
+  }, [d.row]);
+  return (
+    <div ref={at} className={`node screen-box ${d.size} k-${d.kind}${d.both ? " both" : ""}`} title={d.ref ?? `${d.label}: click to draw every box`}>
+      <Handle type="target" position={Position.Top} isConnectable={false} />
+      <Handle type="source" position={Position.Bottom} isConnectable={false} />
+      <div className="label">{d.label}</div>
+      {d.sub && <div className="sub">{d.sub}</div>}
+      {d.facts && <div className="facts">{d.facts}</div>}
+    </div>
+  );
+}
+
+const nodeTypes = { screen: ScreenBox };
+
+type Props = {
+  drawing: ScreenDrawing;
+  onCentre: (id: string) => void;
+  onMore: () => void;
+  fit?: number; // the first view again each time it changes (the f key)
+};
+
+export function ScreenCanvas({ drawing, onCentre, onMore, fit }: Props) {
+  const rf = useReactFlow();
+  const box = useRef<HTMLDivElement>(null);
+  const [whole, setWhole] = useState(true);
+  const [map, setMap] = useState(() => mapByDefault(window.innerWidth));
+  const fitted = useRef<number | null>(null);
+  useEffect(() => {
+    const r = box.current?.getBoundingClientRect();
+    if (fitted.current === (fit ?? 0) || !r || r.width === 0 || r.height === 0) return;
+    fitted.current = fit ?? 0;
+    const centre = drawing.nodes.find((n) => n.row === "centre")!;
+    const { whole: all, ...v } = centredFit(drawing.nodes, centre, { w: r.width, h: r.height });
+    setWhole(all);
+    void rf.setViewport(v);
+  }, [rf, fit, drawing]);
+  const byId = useMemo(() => new Map(drawing.nodes.map((d) => [d.id, d])), [drawing]);
+  const pick = (id: string | null) => {
+    const d = id === null ? undefined : byId.get(id);
+    if (d?.ref === null) onMore();
+    else if (d && d.row !== "centre") onCentre(d.ref);
+  };
+  const nodes: SNode[] = useMemo(() => drawing.nodes.map((d) => ({
+    id: d.id,
+    type: "screen",
+    position: { x: d.x, y: d.y },
+    width: d.w,
+    height: d.h,
+    style: { width: d.w, height: d.h },
+    selected: d.row === "centre",
+    draggable: false,
+    connectable: false,
+    data: { d },
+  })), [drawing]);
+  const edges: Edge[] = useMemo(() => drawing.edges.map((e) => ({
+    id: e.id, source: e.from, target: e.to, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed },
+  })), [drawing]);
+  return (
+    <div className="flow-row">
+      {/* Enter or Space on a focused box re-centres, as a click does. */}
+      <div ref={box} className="flow screen" onKeyDown={(e) => {
+        const n = e.target as HTMLElement;
+        if (!n.classList?.contains("react-flow__node") || (e.key !== "Enter" && e.key !== " ")) return;
+        e.preventDefault();
+        pick(n.getAttribute("data-id"));
+      }}>
+        <ReactFlow
+          nodes={nodes}
+          edges={edges}
+          nodeTypes={nodeTypes}
+          minZoom={0.05}
+          zoomOnDoubleClick={false}
+          onInit={() => performance.mark("zu-drawn")}
+          nodesDraggable={false}
+          nodesConnectable={false}
+          nodesFocusable
+          onNodeClick={(_, n) => pick(n.id)}
+        >
+          <Background />
+          <Controls showInteractive={false}>
+            {!whole && (
+              <ControlButton className="zu-map" onClick={() => setMap((m) => !m)} title={map ? "Hide the minimap" : "Show the minimap"} aria-label={map ? "Hide the minimap" : "Show the minimap"} aria-pressed={map}>
+                ▦
+              </ControlButton>
+            )}
+          </Controls>
+          {!whole && map && <MiniMap pannable zoomable ariaLabel="Minimap" />}
+        </ReactFlow>
+      </div>
+    </div>
+  );
+}
diff --git a/web/src/keys.ts b/web/src/keys.ts
index 6f099a0..5f8cac5 100644
--- a/web/src/keys.ts
+++ b/web/src/keys.ts
@@ -1,22 +1,29 @@
-// U8 keyboard map. Esc peels one layer: search, then selection, then focus.
+// U8 keyboard map. Esc peels one layer: search, then (17) the Screen, then
+// selection, then focus. n is kept for 18's walk through a change.
 export type Action =
-  | "search" | "closeSearch" | "clearSelection" | "up" | "declutter" | "fit" | "deeper" | "shallower";
+  | "search" | "closeSearch" | "clearSelection" | "up" | "declutter" | "fit" | "deeper" | "shallower" | "lens";
 
 // mod: Meta, Ctrl or Alt is held, so the key belongs to the browser (⌘− zooms, ⌘D bookmarks).
-export type KeyContext = { searchOpen: boolean; selected: boolean; atRoot: boolean; typing: boolean; mod: boolean };
+// screen: the Screen is drawn (17), so the tree's own keys do nothing.
+export type KeyContext = { searchOpen: boolean; selected: boolean; atRoot: boolean; typing: boolean; mod: boolean; screen: boolean };
 
 export function keyAction(key: string, ctx: KeyContext): Action | null {
   if (ctx.mod) return null;
   if (key === "Escape") {
     if (ctx.searchOpen) return "closeSearch";
+    if (ctx.screen) return "lens";
     if (ctx.selected) return "clearSelection";
     return ctx.atRoot ? null : "up";
   }
   if (ctx.typing) return null;
   switch (key) {
     case "/": return "search";
-    case "d": return "declutter";
     case "f": return "fit";
+    case "s": return "lens";
+  }
+  if (ctx.screen) return null;
+  switch (key) {
+    case "d": return "declutter";
     case "+": case "=": return "deeper";
     case "-": return "shallower";
   }
diff --git a/web/src/screen.ts b/web/src/screen.ts
index f990255..4d44d61 100644
--- a/web/src/screen.ts
+++ b/web/src/screen.ts
@@ -128,7 +128,7 @@ const GAP_LINE = 12; // between the lines of a row
 const GAP_BOX = 16; // between the boxes of a line
 // The label px, as in styles.css: small is .node's own size, so the floor zoom
 // (viewport.ts FLOOR) draws no Screen label under READABLE_PX.
-const FONT: Record<Size | "centre", number> = { small: 12, medium: 13, large: 15, centre: 15 };
+export const FONT: Record<Size | "centre", number> = { small: 12, medium: 13, large: 15, centre: 15 };
 const MIN_W: Record<Size | "centre", number> = { small: 72, medium: 90, large: 120, centre: 160 };
 const SMALL_PX = 11; // .screen-box .sub and .facts
 const LINE = 14; // a .sub or .facts line
@@ -198,7 +198,7 @@ export function placeScreen(s: Screen): ScreenDrawing {
   const edges: ScreenDrawing["edges"] = [];
   for (const [row, r, prefix] of [["above", s.above, "up:"], ["below", s.below, "down:"]] as const) {
     const drawn = r.boxes.map((b) =>
-      sized({ id: prefix + b.id, ref: b.id, row, kind: b.kind, label: b.label, sub: b.sub, facts: factsOf(s.grain, b), size: b.size, both: b.both }));
+      sized({ id: prefix + b.id, ref: b.id, row, kind: b.kind, label: b.label, sub: b.sub, facts: (b.both ? "↻ " : "") + factsOf(s.grain, b), size: b.size, both: b.both }));
     if (r.more > 0) drawn.push(sized({ id: prefix + "#more", ref: null, row, kind: "more", label: `+${r.more} more`, sub: "", facts: "", size: "small", both: false }));
     let edge = row === "above" ? -GAP_ROW : centre.h + GAP_ROW; // the line's side nearest the Centre
     for (const line of lines(drawn).map(outward)) {
@@ -218,3 +218,19 @@ export function placeScreen(s: Screen): ScreenDrawing {
   }
   return { nodes, edges };
 }
+
+// screenNote says what a Screen's rows and sizes are, and what it leaves out
+// (silence is how a diagram lies): calls and embeds, into it and out of it,
+// with declarations the page does not hold, and its package's Unresolved
+// Calls (ADR 0002).
+export function screenNote(s: Screen): string {
+  if (s.grain === "package") return "Above: what imports it. Below: what it imports. Size: files that import.";
+  const uses = (n: number, way: string) => n > 0 && `${plural(n, "call or embed", "calls and embeds")} ${way}`;
+  const off = [uses(s.offIn, "into it"), uses(s.offOut, "out of it")].filter(Boolean);
+  const out = [
+    off.length > 0 && `${off.join(" and ")}, with declarations in packages not included (re-run with -include)`,
+    s.unresolved > 0 && `${plural(s.unresolved, "unresolved call", "unresolved calls")} in its package`,
+  ].filter(Boolean);
+  return "Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations)."
+    + (out.length ? ` Not drawn: ${out.join("; ")}.` : "");
+}
diff --git a/web/src/styles.css b/web/src/styles.css
index 548f1a8..4dc3201 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -236,6 +236,47 @@ pre {
   color: var(--dim);
 }
 
+/* 17: the Screen. A box's label is drawn at its Weight's size (screen.ts
+   FONT), its package or module and what its Weight is made of under it; an
+   external is an oval, as in the tree; "+N more" is dashed. */
+.node.screen-box {
+  background: var(--box);
+  border: 1px solid var(--box-border);
+  border-radius: 6px;
+  cursor: pointer;
+}
+
+.node.screen-box.medium .label {
+  font-size: 13px;
+}
+
+.node.screen-box.large .label,
+.node.screen-box.centre .label {
+  font-size: 15px;
+}
+
+.node.screen-box.centre {
+  cursor: default;
+}
+
+.node.screen-box.k-external {
+  background: var(--bg);
+  border-radius: 999px;
+  text-align: center;
+}
+
+.node.screen-box.k-more {
+  background: var(--bg);
+  border-style: dashed;
+}
+
+.node.screen-box .sub,
+.node.screen-box .facts {
+  color: var(--muted);
+  font-size: 11px;
+  white-space: nowrap;
+}
+
 .node.selected {
   outline: 2px solid var(--accent);
 }
diff --git a/web/src/useViewState.ts b/web/src/useViewState.ts
index 5786df4..4fe36b4 100644
--- a/web/src/useViewState.ts
+++ b/web/src/useViewState.ts
@@ -2,6 +2,8 @@
 // start, written after every change, and read again when the reader edits or
 // pastes a link (hashchange), or when zu serve's watch sends a new View (13),
 // which drops what the View no longer has, such as a deleted selection.
+// 17: a change of the Screen's Centre adds a history entry (storeHash); the
+// browser's Back and Forward to it fire hashchange.
 import { useEffect, useRef, useState } from "react";
 import type { View } from "./data";
 import { readHash, revalidate } from "./proposal";
@@ -10,8 +12,8 @@ import { storeHash, type ViewState } from "./state";
 export function useViewState(view: View): [ViewState, (next: (s: ViewState) => ViewState) => void] {
   const [state, setState] = useState(() => readHash(window.location.hash, view));
   useEffect(() => {
-    storeHash(window.location, window.history, state);
-  }, [state]);
+    storeHash(window.location, window.history, state, readHash(window.location.hash, view));
+  }, [state, view]);
   const read = useRef(view);
   useEffect(() => {
     if (read.current === view) return;
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node screen.mjs` Expected: PASS (14 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (11 checks in each engine)

- [ ] **Commit:** `Draw the Screen: s centres the selection, a click re-centres, Back returns`

---

### Task 7: Acceptance

**Files:**
- Record: `docx/features/17-screen/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [ ] **Run:** `cd web/e2e && node place.mjs` Expected: PASS (9 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (11 checks in each engine)

- [ ] **Run:** `cd web/e2e && node screen.mjs` Expected: PASS (14 checks in each engine)

- [ ] **Measure** (by hand; not a replay step).
  1. For kubernetes and hugo in `.zu/corpus/` (read-only; never clone), run `bin/zu scan -out <scratch>/ir.json -html <scratch>/<name>.html -include <pkg> <corpus dir>`, with `./pkg/kubelet` and `./hugolib`. `-out` keeps the IR out of the corpus.
  2. Run `node docx/features/17-screen/measure.mjs . <scratch>/kubernetes.html <scratch>/hugo.html`.
  3. Record the table in `acceptance.md`.

  Pass criteria:
  - enter is under 200 ms;
  - with the Panel closed, re-centre is under 100 ms;
  - every box on `meta/v1` is under 1 s;
  - every engine reports no page errors.

  Report the worst case, and the Panel's WebKit swap.

- [ ] **The user's check** (by hand; `zu serve` on a real repository).
  1. Select a package and press `s`. Re-centre three times by clicking boxes. Back walks back through the three Screens, then to the tree as you left it, centred on your selection; Forward walks forward again.
  2. On a Screen, copy the URL and open it in a new tab. The same Screen is drawn.
  3. Select a method and press `s`. Its type's Screen is drawn, with calls and embeds, and the header says what it leaves out.
  4. Type a name's word starts in search (`RW`-style), and pick a result on the Screen. It re-centres.

  U14 is recorded as met in `decisions.md` once this passes.

- [ ] **Commit:** `Record the Screen's acceptance`

---

## Risks

- **The Panel swaps slowly in WebKit.** Moving the Panel off a package with 1,201 importers to one with a short list takes about 400 ms in WebKit. That holds on the Screen (405 and 417 ms on kubernetes) and on the tree (459 and 432 ms). Chromium and Firefox take 13–116 ms. It is the Panel's list reconciliation, not the Screen: with the Panel closed, the same re-centres take 22 and 78 ms. A follow-up could give the Panel a key per id, so React replaces the list instead of reconciling it, for both lenses.
- **Wide rows at the floor zoom.** A Screen wider than the canvas opens at the floor zoom, centred on the Centre, and the reader pans, with a minimap. Lines are laid out from their middle so the heaviest boxes are in view (Deviation 3). A row's "+N more" chip ends its farthest line and can be off the canvas; the toolbar's "every box" does the same, and it is always in view while a row is capped.
- **"every box" on a hub draws a tall Screen.** `meta/v1` has 1,217 boxes, drawn in 185–335 ms. Nothing caps it; the reader asked for every box.
- **Each re-centre adds a history entry.** A long walk lengthens the history the browser's Back has to step through. That is how codezoom reads, and how a browser treats links. Esc or `s` returns to the tree in one step.
- **A Centre the newer View lost** (`zu serve`'s watch) drops the page back to the tree, by `revalidate`, as a lost selection does today. The page renders once with the newer View before `revalidate` runs, so it draws only a Centre the View has (`drawnCentre`); `serve.mjs`'s lost check covers it.
- **Focus moves on a re-centre, and is not drawn.** When the old Screen unmounts, focus falls to the page and goes to the new Centre's box. React Flow's stylesheet removes the outline of a focused node, on the tree as on the Screen, so a reader walking by keyboard cannot see which box has focus. That predates 17; a focus ring for both lenses is a follow-up.
- **Firefox's reload flake (08) can still fail `accept.mjs`** until 16 lands, since 16 removes its cause from the harness. A rerun passes.
- **`screen.mjs` waits fixed times:** 300 ms after a page loads and 150 ms after a Screen draws. A much slower machine could read a Screen that is not finished. It did not happen in the replay.

## Notes

- **Task count: 7**, within Quick mode's limit.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given, in the replay.
  - Task 1 is red on a build error.
  - Task 2 is red on an assertion.
  - Tasks 3 and 4 are red on missing code.
  - Task 5 is red on a missing module and on assertions.
  - Task 6 is red on assertions, and in the browser in all three engines (`screen.mjs` and `serve.mjs`).
- **The model never authors the graph.** A Screen's rows come only from the View's edges, which come from the parser. Task 1 counts edges the export already drops, and the IR is untouched (`go test ./...` passes with the IR goldens unchanged).
- **Follow-ups, not in 17:**
  - give the Panel a key per id (**Risks**);
  - draw a focus ring on focused boxes, on both lenses (**Risks**);
  - 18, the Screen in a Change View;
  - 19, the Code panel, which needs every location of an edge in the View;
  - golden walks.
- **Scrutiny (scrutiny-17), and the revision.** A cold review traced the plan through the scratch build. Every finding was fixed in the task that owns it, and each new browser check was seen failing on a build without its fix, in all three engines.
  - **Blocker:** a Centre that `zu serve`'s watch deleted crashed the page. The page rendered with the newer View before `revalidate` dropped the Centre, and `screenOf` read the missing node ("Cannot read properties of undefined (reading 'kind')", then a blank page). Fixed by `drawnCentre` (Task 5), its use in `App.tsx` (Task 6) and `serve.mjs`'s lost check.
  - **Major:** an external that a type off the page embeds counted `offIn`. Now only declarations count (Task 1, with checkout's page in the test).
  - **Major:** leaving the Screen did not bring back the tree's view. The tree now comes back centred on its selection (Deviation 6), checked by `back` and `esc`.
  - **Minor:** some of Task 6's code had no test. It now has the ↻ test and the button, panel, keyboard, "every box" and disabled checks; the `popstate` listener, which no engine needed, is gone (Deviation 1).
  - **Nits:** the header now says which way the off-page uses go, and with what; `wordStart` tries each position once (Task 2); focus goes to the new Centre after a re-centre; the red reasons, the Risks' ranges and the 11 px secondary lines are stated exactly.
- **Visual checks.** Screenshots of the shop, hugo and kubernetes Screens, in light and dark, were taken in the scratch build. They turned up three issues, each fixed in the task that owns it:
  - a declaration Centre repeated its package under its full id (Task 4);
  - lines in weight order hid the heaviest boxes at the floor zoom (Task 4);
  - an 11 px small label broke the readable floor (Tasks 4 and 6).
- **Revision, 2026-10-20.** A review of 17 and 18 together (check-17-18) replayed 16, 17 and 18 in order and probed the result in a browser. It found one problem that 17 owns, fixed in Task 6, and one nit:
  - **Minor:** after a click on "every box", `s` did nothing until the focus moved, and after 18 neither would `n` or `p`. The key handler counted any focused `<input>` as typing, a checkbox too; main's externals checkbox on the tree has the same hole. `App.tsx` now leaves checkboxes out (Architecture 6). `more` now ticks the box from the keyboard, so the focus is on it in every engine, and presses `s`. On a build without the fix, `more` fails in all three engines: the Screen is still drawn.
  - **Nit:** golden walks are after 19, as 18 says (**Out of scope**).
  - Every other diff is unchanged. The fix changes one line of Task 6's `App.tsx`, with a comment, and extends its `more` check.

## Replay record

Replayed with `replay.py` on a fresh `git archive` of `main` at a18ff85, in a scratch directory, as revised on 2026-10-20. `node_modules` was clone-copied from the repository (`cp -cR`), and Playwright's three browsers were already installed. This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `go test ./internal/export -run TestProjectCountsCallsOffThePage` | 1 |
| 1 | green | `go test ./... && cd web && npm run typecheck` | 0 |
| 2 | red | `cd web && npx vitest run src/search.test.ts` | 1 |
| 2 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 3 | red | `cd web && npx vitest run src/screen.test.ts` | 1 |
| 3 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 4 | red | `cd web && npx vitest run src/screen.test.ts src/viewport.test.ts` | 1 |
| 4 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 5 | red | `cd web && npx vitest run src/state.test.ts src/proposal.test.ts src/lens.test.ts` | 1 |
| 5 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 6 | red | `cd web && npx vitest run src/keys.test.ts src/screen.test.ts` | 1 |
| 6 | red | `cd web && npx vite build >/dev/null && cd e2e && node screen.mjs` | 1 |
| 6 | red | `cd web && npx vite build >/dev/null && cd .. && go build -o bin/zu ./cmd/zu && cd web/e2e && node serve.mjs` | 1 |
| 6 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 6 | green | `make build >/dev/null && cd web/e2e && node screen.mjs` | 0 |
| 6 | green | `cd web/e2e && node serve.mjs` | 0 |
| 7 | green | `make check` | 0 |
| 7 | green | `cd web/e2e && node accept.mjs` | 0 |
| 7 | green | `cd web/e2e && node place.mjs` | 0 |
| 7 | green | `cd web/e2e && node serve.mjs` | 0 |
| 7 | green | `cd web/e2e && node screen.mjs` | 0 |

- After Task 7, the replayed tree was byte-identical to the scratch branch's last commit (git tree 6c74e01; 27 files change against a18ff85).
- `golangci-lint run ./...` in the replayed tree: no issues.
- The red reasons were seen as stated:
  - Task 1: the build fails, `n.OffIn` and `n.OffOut` undefined.
  - Task 2: 1 test.
  - Tasks 3 and 4: the missing module, then 6 tests.
  - Task 5: 7 failures.
  - Task 6: 5 unit tests; `screen.mjs` 0/14 in each engine, because its first wait, for the Screen button, times out; `serve.mjs` 10/11, with lost `[false, true, false]`.
  - Task 6's browser reasons were read on a copy of the scratch branch's red commit, since `replay.py` prints only each step's last line.
- The approved version of 2026-10-19 also replayed clean. Its tree matched its scratch branch (git tree d5ed2fc).
- The first draft also replayed clean. Its tree matched its scratch branch, before the scrutiny revision.
- This revision was also replayed after 16, on a fresh `git archive` of `main` at 7f56652, before 18 and 19 (19's **Replay record**).
