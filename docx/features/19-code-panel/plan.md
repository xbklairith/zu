# 19 · The Code panel — Plan

**Status:** Implemented 2026-10-21 (Tasks 1–5 on `build-16-20`; `acceptance.md`; the user's check is owed). APPROVED 2026-10-20 (lead, after scrutiny-19, its fixes and the replay; advisor sign-off); REVISED 2026-10-20 after a review of 16 to 19 together, and again after that revision's scrutiny (**Notes**), replayed again. Held: it queues behind 16, 17 and 18, which are approved and held. zu builds them in order 16, 17, 18, 19, and builds any only when the user says go.

**Base.** Every diff here is against `main` with 16's, 17's and 18's plans applied, in that order, 17's and 18's as revised on 2026-10-20. `main` then differs from a18ff85 only by plan documents. The diffs come from a scratch branch. Its first commit is a `git archive` of a18ff85 with 16's, 17's and 18's tasks applied (18's revised scratch head). After it come one commit per red step and one per green step. The plan was replayed on a fresh `git archive` of `main`, after 16's, 17's and 18's replays (**Replay record**). Once those three land, replay this plan again on `main` (**Overlap with 16, 17 and 18**).

The diffs leave out the two View goldens, `internal/export/testdata/shop.view.golden.json` and `shop.change.golden.json`. Task 1 colours every inlined source, which adds 852 lines of runs to them. Task 1 has a step that rewrites them with `-update`, and the replay checks the result byte for byte against the scratch branch.

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 18's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Until 16, 17 and 18 land, replay all four plans in order, from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/16-fast-rescan/replay.py docx/features/16-fast-rescan/plan.md "$S" \
  && python3 -u docx/features/17-screen/replay.py docx/features/17-screen/plan.md "$S" \
  && python3 -u docx/features/18-change-screen/replay.py docx/features/18-change-screen/plan.md "$S" \
  && python3 -u docx/features/19-code-panel/replay.py docx/features/19-code-panel/plan.md "$S"; rm -rf "$S"
```

Once they have landed, drop their lines.

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Task 5's `make check`, and the earlier plans');
- Playwright's three browsers (Tasks 3, 4 and 5).

`measure.mjs`, beside this plan, times `zu serve` without `-include` on real trees (**Measurements**). It is not a replay step.

---

## Goal

Show a declaration's code in its panel, coloured as Go, and light the lines behind any call or embed the reader points at. In `zu serve`, show it for every package, without `-include`.

The view-model round of 2026-10-19 decided the frame, and the user accepted every recommended answer:
- **Full Code:** the panel shows the declaration's file with the declaration marked. Pointing at a neighbour or its line lights the lines behind that edge, from the IR's `Edge.Locations`. Go is coloured: zu tokenises it with `go/scanner`, in Go, and the page draws the tokens as text, never as markup.
- **Q2 A:** `zu serve` serves source on demand without `-include`, from a read-only route that returns only files the IR lists. The HTML Export keeps its scope (an ADR 0006 amendment).
- **Diff Code:** a modified declaration's own diff first, then its file's hunks; a removed declaration's base text; added and removed edges light their lines; the base text of changed declarations inlined (a second ADR 0006 amendment).

**Scope: 19 is Full Code; 20 is Diff Code.** The round decided one frame. It is built in two features because Diff Code needs work in the scan that Full Code does not:
- the IR keeps a type's span only as its first line, and base's Measures are not kept;
- a removed declaration's text, and a removed edge's lines, are base's, read from the base tree.

So 19 builds everything that reads head, and 20 builds everything that reads base:
- **19:** every location of a call or embed (`Edge.more`); Go colour; `zu serve` drawing every package's declarations within a budget, with `/source`; the Code panel, which draws a long file's 5,000 lines around the declaration; the lines behind a pointed-at call or embed.
- **20:** the declaration diff; base spans (type spans in the scan, base Measures); a removed declaration's base text; the base lines of removed edges; colouring base snippets and hunks; the second ADR 0006 amendment.

A reader runs `zu serve` on their checkout, opens the page and selects `store.Repo.Get`. The panel lists its calls and callers, then its file, `store.go`, coloured, with line 43 marked and in view. The reader points at the row `store.Repo.check`: line 48, where `Get` calls it, lights up, and the note over the code reads "Line 48.". Pointing at the caller `store.init` on `register`'s panel lights nothing in `register.go`; the note reads "In other files: internal/store/db_linux.go:7.". On the Screen, pointing at a box does the same for the Centre's code.

## Architecture

**1. The export keeps every line of a call or embed (`internal/export/view.go`).** A View edge kept its count and its first location only. It now also keeps `more`: a call's or an embed's locations after `loc`, in IR order, each with its own path. The IR sorts an edge's locations, so `more` is sorted too, and output stays byte-identical. A declaration in several files (build variants, ADR 0007) calls from each, so `more` can name files `loc` does not. Imports keep their first location only: no Code panel shows a package's files, and an import's lines are the import block.

**2. Go colour (`internal/export/syntax.go`).** `Syntax(src)` gives, for each line of `src` as `strings.Split(src, "\n")` cuts it, the runs `[column, length, class]` of its tokens, flat. Columns and lengths count UTF-16 code units, as the page's JavaScript strings do, so the page slices lines with no conversion. The classes are 1 keyword, 2 comment, 3 string or character literal, 4 number; identifiers and operators stay plain.
- It reads `src` with `go/scanner` and `ScanComments`, ignoring errors, so a file that does not parse is still coloured as far as it scans.
- A token across lines (a block comment, a raw string) has a run on each.
- A run's column is counted on from the last run of its line, so a line costs its length once. Counted from the line's start, a 480 KB line of numbers took 54 s; a 384 KB one now takes 10 ms.
- A block comment's end is looked for past its `/*`, so `/*/ x */` is one comment.
- The scanner drops `\r` from a comment's or raw string's text, so their spans are found in `src` itself (`tokenEnd`).
- A byte that is not UTF-8 counts one unit, as `encoding/json` writes U+FFFD for it.

`View.Syntax` maps each inlined source's path to its runs; `addSources` fills it beside `Sources`. Every HTML Export that inlines source carries its colour: the shop Project View's five store files gain 347 lines of runs in the golden, and the Change View's 505.

**3. `zu serve` without `-include` (`internal/cli/serve.go`, `internal/serve/serve.go`).**
- **Every package's declarations.** Without `-include`, the Project View `zu serve` sends details every package (`export.Every`, a Pattern that matches all) and inlines no source (`Project` with a nil ReadFunc). The Panel of any declaration then has something to show, read on demand.
- **A budget.** A View with every declaration of a large tree is slow to send, parse and index: kubernetes, at 107,196 declarations, would weigh about 61 MB, by an estimate from its IR. So `zu serve` details every package only while the scan, as the Policy draws it (its Omit applied), holds at most `detailBudget` = 20,000 declarations. Past it the page draws packages only, as before, and `zu serve` says so once on stderr: "zu serve: 107196 declarations, more than 20000: the page draws packages only; -include picks the packages to draw". The page's own message for a package without detail is unchanged ("Declarations not included. Re-run with -include {pkg}").
- **`-include` is unchanged:** the page draws the matching packages' declarations with their source inlined, byte for byte what `zu scan -html` writes (10's invariant test still holds).
- **`-base`** (14) is unchanged: the Change View inlines what `zu diff` inlines.
- **`GET /source?path=`** answers the JSON of an `export.SourceFile` (`path`, `text`, `syntax`) for the file at `path` in the tree as it is now. It answers only for files the page's View declares a package, type or function in (externals excluded; the Policy's Omit does not narrow it, though the page never asks for an omitted package's file). The set is rebuilt by each page load's scan and each watch rescan the page draws, and read without a lock. A rescan the watch keeps from the page, while a file does not parse (13), leaves it, so the code of the drawing kept is still sent. A page load while the drawing is kept adds its own View's files to the set and drops none, so every page, the ones that draw the kept View and the one just loaded, can read the code it draws. The path must also be local (`filepath.IsLocal`), and it is read through `scan.DirTree`, which refuses links that leave the tree. A path outside the set is 404; a read error is 500 with its message. The route keeps the View's rules: the Host check (10), and no answer to another site's page (`crossSite`), before any read. It is `no-store`. With `-base` it answers too, from the working tree, for the head IR's files.
- **A save the View does not show.** A save can change a file's text and not the View: a literal, a comment, a condition. The watch's `Hub` (13) now counts each rescan that publishes no View: the View is the same, the rescan failed, or a file no longer parses. `Hub.Keep(notice)` replaces `Notify` and counts. `/events` sends the count as `source`, at once and whenever it changes, after `view` and `notice`. A published View does not count: the page reads its files again for each newer View it fetches, drawn or not, since a page load can draw a View before the watch publishes it. Outside git the watch's first poll rescans every file (13) and counts, so a page served outside git reads its files once more at that poll.

**4. The Code panel (`web/src/code.ts`, `Panel.tsx`, `data.ts`, `main.tsx`, `App.tsx`).**
- **`paint(lines, runs)`** cuts each line into segments, `{text, cls?}`, `cls` one of `kw`, `com`, `str`, `num`. A run behind an earlier one, of a class the page does not know, or empty is skipped; one past its line is cut to it. No text is lost: the segments join back to the line.
- **`Code`** replaces 05's `Source` component. It cuts the file into lines as `Syntax` does and draws each as React text in spans with those classes, the declaration's line marked (`hit`) and scrolled into view as before. It never sets markup. A View brings its files as new objects (13), so `Code` cuts, paints and scrolls only when the file's text or the marked line changes: a watch redraw leaves the code, and the panel, where the reader scrolled them.
- **A long file is drawn in part.** Past `CODE_LINES` = 5,000 lines, `Code` draws the 5,000 around the marked line (`around`, held inside the file), and a note over them says which: "Lines 1011–6010 of 6010.". A shorter file is drawn whole, as before. Drawn whole, k8s.io/api's 73,169-line `core/v1/generated.pb.go` took 1.1 s to 2.6 s to show (**Measurements**).
- **Where the text comes from.** `inline(view, path)` is the file the View carries, with its colour. Otherwise the page asks `zu serve`: `fetchSource(path)` (`data.ts`) GETs `source?path=` from the page's own origin (the CSP allows only that) and returns `null` on a 404, an error or no answer, so the panel draws no code, as for a file a page does not carry. `Live` (`main.tsx`) makes a `reader` per View it draws, which reads each file once; a newer View from the watch reads it again. So does a newer generation whose View is the one drawn, as when a page load drew it first and a save since changed a file alone; each `source` count after the first (`follow`, `live.ts`); and the first after the stream dropped or the page was hidden. After a drop the page can read its files twice, once for the count and once for the View it fetches. The page load's reads are as new as the first count, so a page that just loaded reads nothing twice. `App` passes the reader to both Panels. A static page has none.
- **While it comes,** the panel keeps the last file it read for the same path, so moving between declarations of one file, or a watch redraw, does not blank the code.
- A removed declaration still shows no code: its text is base's (20).

**5. The lines behind a call or embed (`code.ts`, `facts.ts`, `screen.ts`, `Panel.tsx`, `ScreenCanvas.tsx`, `App.tsx`).**
- **`behind(view, from, to)`** is where the calls and embeds from an id `from` accepts to an id `to` accepts are written: each edge's `loc` and `more`, by path and line, each once. Imports give none. An edge the change removed gives none either: its lines are base's, which head's code does not show (20).
- **In a Panel:** pointing at, or focusing, a row of "Calls and embeds out" lights `behind(declaration and its methods, that row's id)`; a row of "Called or embedded by", the other way. `facts.ts` `insideDecl` is the declaration-and-its-methods test that `calls` already used, now exported. A row followed to another declaration unmounts without a `mouseleave` or a `blur`, so the light goes out when the Panel's declaration changes.
- **In a Change View** the tree's Panel lists only the Change View's own edges, which join the declarations it draws; 18 adds the unchanged neighbours (`near`) to the Screen's View alone. A modified function's calls to unchanged declarations are listed, and lit, on its Screen.
- **On the Screen:** pointing at, or focusing, a box or its line lights `placesOf(view, centre, id)` in the Screen's Panel. A box is matched as the Screen groups it: a method as its type. The Centre, a "+N more" chip and a Screen of imports light nothing.
- **The code** lights the lines in its own file (`lit`) and scrolls itself, not the panel, to the first. `.source` now has a height of its own (60vh) and scrolls inside, so lighting a line never moves the row the reader points at. When the first lit line is past the lines a long file draws, they move to it (`centre`), and stay when the light goes out, as the scroll does, until the mark moves.
- **The note over the code** (`litNote`, `aria-live`) says where the lit lines are:
  - "Line 48." or "Lines 4, 9; in other files: b.go:2.";
  - "In other files: internal/store/db_linux.go:7.", when none is in the shown file;
  - at most eight of each, then "and N more";
  - "The change removed it: it has no line in head.", for a removed edge;
  - "Point at a call or embed to light the lines it is written on.", while nothing is pointed at and the declaration has calls or embeds to point at.
- **Colours** (`styles.css`): `--syn-kw`, `--syn-com` (italic), `--syn-str`, `--syn-num` and `--lit`, light and dark. Each token colour reads at 4.5:1 or more on `--code-bg`, `--mark` and `--lit` (`styles.test.ts`).

## Overlap with 16, 17 and 18

19 is built on all three. They land first, in order 16, 17, 18, 19, and each is replayed on `main` after its predecessor lands.
- **16:** `internal/cli/change.go` and `change_test.go`. 19's Task 2 passes `every` to `projectView` in `change.go`'s `viewOf`, and adds a test to `change_test.go`.
- **17:**
  - `internal/export/project.go` and `project_test.go`, `view.go` and `shop.view.golden.json`, where 17 added `offIn` and `offOut`;
  - `web/src/data.ts`, `App.tsx`, `screen.ts` and `screen.test.ts`, `ScreenCanvas.tsx` and `styles.css`;
  - `web/e2e/package.json`, where 17 added `accept-screen`.
- **18:** `view.go` (`Near`), `shop.change.golden.json` (`near`), `data.ts`, `App.tsx`, `screen.ts`, `screen.test.ts`, `ScreenCanvas.tsx` and `styles.css`.
- **Files none of them touches:** `internal/cli/html.go`, `serve.go`, `serve_test.go`, `watch.go` and `watch_test.go`; `internal/export/include.go`, `syntax.go` and `syntax_test.go` (new); `internal/serve/serve.go`, `serve_test.go`, `live.go` and `live_test.go`; `web/src/Panel.tsx`, `facts.ts`, `main.tsx`, `live.ts`, `live.test.ts`, `data.test.ts` and `styles.test.ts`; `web/src/code.ts` and `code.test.ts` (new); `web/e2e/code.mjs` (new).

## Out of scope

- **Diff Code (20):** the declaration diff and its base spans; a removed declaration's base text; the base lines of removed edges; colouring base snippets and hunks; the second ADR 0006 amendment.
- **Colouring identifiers,** types and function names: that needs the parser's view of the file, not the scanner's.
- **Opening another file's lit place.** The note lists places in other files; the row's own link opens the declaration that holds them.
- **A package's files** in its panel.
- **The HTML Export's scope.** `zu scan -html` and `zu diff -html` inline what they inlined before, now coloured (ADR 0006).

## Deviations and decisions for review

1. **`zu serve` details every package without `-include`, up to 20,000 declarations as the Policy draws them.** The round decided that `zu serve` sends source on demand without `-include`. Without detail a page has no declaration to show source for, so `zu serve` now details every package too. The budget keeps a kubernetes-sized View (61 MB) from the page: past it, the page draws packages only, as before 19, and `zu serve` says so once. 20,000 holds hugo (6,826 declarations, a 2.9 MB View) and kubernetes' api and client-go modules (16,466, 6.5 MB; 19,341, 9.1 MB), and stops well short of kubernetes itself. On each, the first box comes within the run-to-run spread of before 19 (**Measurements**). `-include` keeps its meaning and its byte-for-byte match with `zu scan -html`.
2. **The split: 19 reads head, 20 reads base** (**Goal**). The round's frame stands; it is built in two features.
3. **Four classes only.** Keywords, comments, literals and numbers are what `go/scanner` knows for certain. Colouring identifiers by role (a type, a call) would need the parser, and the scanner colours a file that does not parse.
4. **Imports keep one location.** `more` is for calls and embeds, the edges whose lines a Code panel shows. An import's lines are its file's import block; the panel of a package shows no code.
5. **Lit lines are head's.** A call the change removed lights nothing, and the note says why. Its base lines are 20's.
6. **The code scrolls on its own.** 05's source pane grew the panel, which scrolled as a whole. Scrolling the panel to a lit line would move the row under the pointer, which would light another row. `.source` is now at most 60% of the window high and scrolls inside.
7. **`/source` reads the file as it is now.** Between a save and the next scan the file can be newer than the View, so its lines can be off by what the save moved. The watch rescans within its poll (1 s by default), and the page reads the file again after every rescan: when it fetches the View the rescan published, whether or not it differs from the one drawn, or on the `source` count when the rescan published none. While a file does not parse, the watch keeps the drawing (13) and the code shows the file as saved. Without a watch (`-poll 0`), a reload reads it again.
8. **`/source` also answers with `-base`.** The Change View inlines only meaningfully changed files, so the code of an unchanged declaration on a Screen (18's `near`) now comes from the working tree. The static `zu diff -html` page still has none for it.
9. **Every inlined source carries its colour.** That adds about 28% of the source's bytes to an HTML Export that inlines source (642 KB of Go: 180 KB of runs, in 8 ms). A page that inlines nothing is unchanged.
10. **Two red steps fail to build.** Task 1's tests name `Syntax`, `Edge.More` and `View.Syntax`, and Task 2's name `export.Every`, `export.SourceFile`, `serve.Views.Source`, `Hub.Keep` and `detailBudget`, none of which exists yet.
11. **The note's hint is new UI text.** It shows only where pointing does something: on a declaration with calls or embeds.
12. **A long file is drawn in part.** The round's frame shows the declaration's file. Past 5,000 lines the panel draws the 5,000 around the declaration, or around the first lit line, and says which. The browser's find-in-page then reaches only those. Every file zu scans in cobra and hugo is drawn whole, and all but 35 of kubernetes' 9,962 non-test Go files outside vendor: 30 generated, and 5 hand-written, the longest `pkg/apis/core/validation/validation.go` (10,121 lines) and `k8s.io/api/core/v1/types.go` (8,967). Drawn whole, the longest file of a tree under the budget took up to 2.6 s to show (**Measurements**).

## Measurements

`measure.mjs` ran `zu serve <tree> -poll 0`, without `-include`, in one run on 2026-10-20: from the scratch branch's last commit (5e59d60), and from its base (5aec44c, before 19) for comparison. The trees were:
- copies of the Test Corpus's cobra, hugo and kubernetes clones, made with `cp -cR` out of `.zu/corpus/` (the corpus was only read);
- three kubernetes staging modules: apiserver (7,355 declarations, about hugo's), client-go (19,341, just under the budget) and api (16,466, with the longest file of any tree under the budget);
- the scratch branch itself.

The browser was 1,400 × 900, on an Apple M2 (8 cores) shared with other sessions: the load average was 2.8 when the run began and 7.0 when it ended. Each figure is the median of three page loads, or of three fetches.

**What `zu serve` sends.** Every load rescans the tree (13, 16), so `/view.json`'s time is mostly the rescan: 3.1–3.5 s in each kubernetes tree, parsing nothing, before 19 as after.

| Tree | Declarations | View before 19 | View | `/view.json`, before → after |
|---|---|---|---|---|
| zu (scratch) | 470 | 0.01 MB | 0.15 MB | 41 → 35 ms |
| cobra | 286 | < 0.01 MB | 0.11 MB | 32 → 33 ms |
| hugo | 6,826 | 0.29 MB | 2.87 MB | 176 → 195 ms |
| apiserver | 7,355 | 0.32 MB | 3.37 MB | 3,268 → 3,206 ms |
| client-go | 19,341 | 0.49 MB | 9.10 MB | 3,360 → 3,230 ms |
| api | 16,466 | 0.03 MB | 6.50 MB | 3,081 → 3,315 ms |
| kubernetes | 107,196 | 6.23 MB | 6.23 MB, packages only | 3,350 → 3,532 ms |

kubernetes is over the budget: the page draws packages only, as before 19, and `zu serve` said so once on stderr: "zu serve: 107196 declarations, more than 20000: the page draws packages only; -include picks the packages to draw".

**The page.** Times are in-page, in ms, Chromium / Firefox / WebKit.
- **First box:** from `/view.json`'s last byte to the first box drawn, so the rescan is left out.
- **Code:** from the hash change that opens the declaration's panel to its marked line in the DOM, read from `/source`, then two frames. The declaration is the function written furthest down its file that calls another declaration.
- **Lit:** from pointing at its first "Calls and embeds out" row to the note naming the lit lines, then two frames.

| Tree | First box, before 19 | First box | File (lines) | Code | Lit |
|---|---|---|---|---|---|
| zu (scratch) | 151 / 263 / 170 | 152 / 179 / 163 | `internal/cli/html.go` (418) | 25 / 37 / 50 | 21 / 11 / 9 |
| cobra | 152 / 165 / 153 | 151 / 158 / 153 | `command.go` (2,073) | 41 / 58 / 89 | 20 / 11 / 17 |
| hugo | 607 / 606 / 622 | 596 / 622 / 612 | `tpl/tplimpl/templatestore.go` (2,238) | 66 / 83 / 130 | 18 / 9 / 15 |
| apiserver | 482 / 548 / 639 | 593 / 464 / 601 | `pkg/storage/testing/store_tests.go` (4,937) | 114 / 134 / 221 | 18 / 26 / 30 |
| client-go | 459 / 501 / 395 | 358 / 315 / 642 | `applyconfigurations/utils.go` (2,151) | 77 / 113 / 135 | 29 / 36 / 30 |
| api | 534 / 249 / 589 | 574 / 411 / 198 | `core/v1/generated.pb.go` (73,169) | 153 / 171 / 254 | 15 / 25 / 26 |

**The longest file** each View declares in, its furthest declaration opened on a page of its own, timed as **Code** is. Past 5,000 lines the panel draws 5,000 (Deviation 12).

| Tree | File (lines) | Lines drawn | `/source` | Code |
|---|---|---|---|---|
| zu (scratch) | `internal/cli/html.go` (418) | all | 19 KB, 2 ms | 23 / 40 / 49 |
| cobra | `command.go` (2,073) | all | 80 KB, 3 ms | 40 / 55 / 87 |
| hugo | `tpl/tplimpl/templatestore.go` (2,238) | all | 77 KB, 2 ms | 65 / 84 / 131 |
| apiserver | `pkg/storage/testing/store_tests.go` (4,937) | all | 234 KB, 4 ms | 115 / 142 / 222 |
| client-go | `applyconfigurations/internal/internal.go` (17,705) | 5,000 | 609 KB, 7 ms | 103 / 140 / 185 |
| api | `core/v1/generated.pb.go` (73,169) | 5,000 | 2,607 KB, 26 ms | 150 / 167 / 251 |

Drawn whole, they failed the 500 ms criterion. The scratch branch's commit before the panel drew long files in part (e4804d6) was timed right after this run, on the same machine: client-go's `internal.go` showed in 231 / 337 / **513** ms, and api's `generated.pb.go` in 1,068 / 1,442 / **2,640** ms. Pointing at a row of api's function lit its lines in 163 / 229 / 138 ms, as the code rendered every line again; drawn in part, 15 / 25 / 26 ms.

- **A larger View does not slow the first box.** hugo's View is ten times the size and client-go's 19 times, yet the first box comes within the run-to-run spread of before 19: one load to the next differs by up to 450 ms on the kubernetes trees.
- **From `goto` to the first box** on hugo was 841–845 ms before 19 and 836–840 ms after, in every engine; on the kubernetes modules 3.3–4.0 s, most of it the rescan.
- **`/source`** answered in 2–7 ms for files up to 609 KB, and in 26 ms for api's 2.6 MB.
- **No page errors** in any engine.

The revision of 2026-10-20 (**Notes**) was not measured again. It changes `/events`, the watch's keep paths, when the page reads a file again, and when a lit row goes out, none of which these times cover.

Pass criteria, set before the runs:
- the page draws within 3 s of `goto` on hugo, in every engine: 836–840 ms;
- a declaration's code shows within 500 ms of its selection, on the longest file the View declares in, in every engine: at most 254 ms, WebKit on api's `generated.pb.go`, 5,000 of its lines drawn, in both tables;
- a pointed-at row lights its lines within 100 ms (median): at most 36 ms;
- every engine reports no page errors: none.

The code criterion was first timed on the declaration in the first table only. Scrutiny found the longest files untimed; drawn whole, they failed it, so the criterion now names the longest file, and the panel draws a long file in part.

## Doc amendments (exact text; not task steps)

These follow 17's and 18's amendments, which land first.

**`docx/decisions/0006-self-contained-html-export.md`, a new section after Consequences:**

> ## Amendment (19, 2026-10-20): zu serve reads source on demand
>
> `zu serve` runs on the reader's own checkout, so its page need not carry source ahead. Without `-include` it now draws every package's declarations (up to 20,000 as the Policy draws them; past that, packages only) and inlines no source. The Code panel reads the file it shows from `GET /source?path=`, which answers only for files the last scan declares a package, type or function in, read from the scanned tree with links that leave it refused, to this machine's own page only, as `/view.json` is. With `-include`, `zu serve` still sends the page `zu scan -html` writes, byte for byte. The HTML files are unchanged in scope: they inline only the source this ADR names, now with its colour (`View.syntax`), and make no network request.

**`docx/core/decisions.md`, Serve (10).** Append to the end of the bullet, after "…A push or fetch shows at the next save or reload.":

> **Code (19):** without `-include` zu serve details every package while the scan, as the Policy draws it, holds at most 20,000 declarations (past that, packages only, said once on stderr) and inlines no source; the page reads a file from `/source?path=` (an `export.SourceFile`: text and colour), which answers only for files the last scan declares a package, type or function in, read through the scanned tree, and is 404 for anything else. With `-include` the page is `zu scan -html`'s, byte for byte. With `-base`, `/source` answers too, from the working tree.

**`docx/core/decisions.md`, line 41 (UI v1).** Append to the end of the bullet, after 18's **Screen in a Change View (18)** text:

> **Code panel (19):** a declaration's panel shows its file, coloured by `export.Syntax` (go/scanner, in Go: keywords, comments, literals, numbers; runs per line in UTF-16 units), drawn as text, never as markup, its line marked; of a file past 5,000 lines it draws the 5,000 around that line, and says which. Pointing at, or focusing, a call or embed row, or a Screen box or line, lights the lines it is written on (the View edge's `loc` and `more`; imports keep one location), the code scrolling on its own and a long file's drawn lines moving to the first; a note says where they are, listing places in other files. A removed edge lights nothing: its lines are base's (20).

**`docx/glossary.md`, a new entry after Ghost (18's):**

> ## Code Panel
>
> The part of a declaration's panel that shows its file (19): Go coloured by zu, the declaration's line marked. Of a file past 5,000 lines it shows the 5,000 around that line. Pointing at a call or embed, in the panel's lists or on the Screen, lights the lines it is written on, and a note says where they are, including places in other files. In an HTML Export the file is inlined; in `zu serve` without `-include` it is read on demand.

**`docx/glossary.md`, HTML Export.** Append to the end of the entry:

> Inlined source carries its colour (19).

**`docx/core/requirements-draft.md`:** no new row. U5 ("Side panel showing the selected node's source, metrics and edges") is now met in `zu serve` without `-include` too.

## Tasks

### Task 1: The export keeps every line of a call and colours its sources (`export`)

`TestProjectKeepsEveryLocationOfACallOrEmbed` builds an IR in which `m.F` is declared in `a.go` and `b.go` and calls `m.G` three times: `a.go:4`, `a.go:5` and `b.go:4`. Package `m` imports `m/q` twice. In the View:
- the import has count 2, `loc` `a.go:2` and no `more`;
- the call has count 3, `loc` `a.go:4`, and `more` `a.go:5`, `b.go:4`.

`TestProjectColoursEachSource` includes the shop's `./internal/store` and checks that every inlined source has its `Syntax`.

`TestSyntax` checks the runs:
- keywords, a line comment, literals and a hex number, with empty lines;
- a raw string and a block comment across lines, each with a run per line;
- UTF-16 columns: in `x := "é😀" // ไทย`, the string is at 5 for 5 units and the comment at 11 for 6;
- a block comment that opens with a slash, `/*/ x */`, is one comment;
- a file that does not parse (`func (` then an open block comment) is coloured as far as it scans;
- an empty file is one empty line.

`TestSyntaxIsLinearInLineLength` colours a 384 KB line of numbers within 1 s, and checks its runs and its last run's column.

The green step adds one case it found: a comment where the scanner inserts a semicolon (`x++ // c`) is coloured from its own column.

**Files:**
- Tests: `internal/export/project_test.go`, `internal/export/syntax_test.go`
- Code: `internal/export/syntax.go`, `internal/export/project.go`, `internal/export/view.go`, `web/src/data.ts`
- Goldens: `internal/export/testdata/shop.view.golden.json`, `shop.change.golden.json` (rewritten by `-update`)

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/export/project_test.go b/internal/export/project_test.go
index 2f0eef8..8ecc01e 100644
--- a/internal/export/project_test.go
+++ b/internal/export/project_test.go
@@ -3,6 +3,7 @@ package export
 import (
 	"encoding/json"
 	"os"
+	"reflect"
 	"slices"
 	"strings"
 	"testing"
@@ -122,6 +123,60 @@ func TestProjectCountsCallsOffThePage(t *testing.T) {
 	}
 }
 
+// 19: the Code panel lights every line behind a call or an embed, so the
+// View keeps each one: loc is the first, more the rest, each with its path
+// (a declaration in several files, as build variants are, calls from each).
+// An import keeps its first only: no Code panel shows a package's files.
+func TestProjectKeepsEveryLocationOfACallOrEmbed(t *testing.T) {
+	at := func(path string, line int) ir.Location { return ir.Location{Path: path, Line: line} }
+	doc := &ir.IR{
+		Nodes: []ir.Node{
+			{ID: "m", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{at("a.go", 1)}},
+			{ID: "m/q", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{at("q/q.go", 1)}},
+			{ID: "m.F", Kind: ir.KindFunction, Parent: "m", Locations: []ir.Location{at("a.go", 3), at("b.go", 3)}},
+			{ID: "m.G", Kind: ir.KindFunction, Parent: "m", Locations: []ir.Location{at("a.go", 9)}},
+		},
+		Edges: []ir.Edge{
+			{From: "m", To: "m/q", Kind: ir.EdgeImports, Locations: []ir.Location{at("a.go", 2), at("b.go", 2)}},
+			{From: "m.F", To: "m.G", Kind: ir.EdgeCalls, Locations: []ir.Location{at("a.go", 4), at("a.go", 5), at("b.go", 4)}},
+		},
+	}
+	p, _ := ParsePattern("m", "m")
+	v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
+	if err != nil {
+		t.Fatal(err)
+	}
+	if len(v.Edges) != 2 {
+		t.Fatalf("edges = %+v", v.Edges)
+	}
+	imp, call := v.Edges[0], v.Edges[1]
+	if imp.Count != 2 || imp.Loc != at("a.go", 2) || imp.More != nil {
+		t.Errorf("import = %+v, want count 2 at a.go:2 and no more", imp)
+	}
+	if call.Count != 3 || call.Loc != at("a.go", 4) || !slices.Equal(call.More, []ir.Location{at("a.go", 5), at("b.go", 4)}) {
+		t.Errorf("call = %+v, want count 3 at a.go:4, more a.go:5 and b.go:4", call)
+	}
+}
+
+// 19: each source the View inlines carries its Syntax runs, so the page
+// colours it without a lexer of its own.
+func TestProjectColoursEachSource(t *testing.T) {
+	doc := shopIR(t)
+	p, _ := ParsePattern("./internal/store", RootModule(doc))
+	v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
+	if err != nil {
+		t.Fatal(err)
+	}
+	if len(v.Syntax) != len(v.Sources) {
+		t.Fatalf("%d sources, %d coloured", len(v.Sources), len(v.Syntax))
+	}
+	for path, text := range v.Sources {
+		if got, want := v.Syntax[path], Syntax([]byte(text)); !reflect.DeepEqual(got, want) {
+			t.Errorf("%s: syntax %v, want %v", path, got, want)
+		}
+	}
+}
+
 func TestProjectRejectsAnIncludeThatMatchesNothing(t *testing.T) {
 	doc := shopIR(t)
 	p, _ := ParsePattern("./nosuch/...", RootModule(doc))
diff --git a/internal/export/syntax_test.go b/internal/export/syntax_test.go
new file mode 100644
index 0000000..dd3a1d0
--- /dev/null
+++ b/internal/export/syntax_test.go
@@ -0,0 +1,64 @@
+package export
+
+import (
+	"reflect"
+	"strings"
+	"testing"
+	"time"
+)
+
+// The Code panel's colour (19): each line's runs [column, length, class],
+// columns and lengths in UTF-16 code units, as the page splits the text.
+func TestSyntax(t *testing.T) {
+	for _, c := range []struct {
+		name, src string
+		want      [][]int
+	}{
+		{"keywords, comments, literals", "package p\n\n// Add adds.\nfunc Add(a int) int { return a + 0x1F }\nvar s = \"x\" + 'y'\n", [][]int{
+			{0, 7, tokKeyword},
+			{},
+			{0, 12, tokComment},
+			{0, 4, tokKeyword, 22, 6, tokKeyword, 33, 4, tokNumber},
+			{0, 3, tokKeyword, 8, 3, tokString, 14, 3, tokString},
+			{},
+		}},
+		{"a token across lines gives a run on each", "var r = `a\nbc`\n/* x\n y */ func", [][]int{
+			{0, 3, tokKeyword, 8, 2, tokString},
+			{0, 3, tokString},
+			{0, 4, tokComment},
+			{0, 5, tokComment, 6, 4, tokKeyword},
+		}},
+		{"columns count UTF-16 units, as JavaScript does", "x := \"é😀\" // ไทย\nfunc", [][]int{
+			{5, 5, tokString, 11, 6, tokComment},
+			{0, 4, tokKeyword},
+		}},
+		{"a block comment that opens with a slash", "/*/ x */ func", [][]int{{0, 8, tokComment, 9, 4, tokKeyword}}},
+		{"what does not parse still colours", "func (\n/* open", [][]int{
+			{0, 4, tokKeyword},
+			{0, 7, tokComment},
+		}},
+		{"empty", "", [][]int{{}}},
+	} {
+		if got := Syntax([]byte(c.src)); !reflect.DeepEqual(got, c.want) {
+			t.Errorf("%s:\n got %v\nwant %v", c.name, got, c.want)
+		}
+	}
+}
+
+// A long line costs its length, not its length squared: counting each run's
+// column from its line's start took 54 s for a 480 KB line of numbers.
+func TestSyntaxIsLinearInLineLength(t *testing.T) {
+	const n = 1 << 16
+	src := []byte("var b = []byte{" + strings.Repeat("0x1f, ", n) + "}") // 384 KB on one line
+	start := time.Now()
+	runs := Syntax(src)[0]
+	if d := time.Since(start); d > time.Second {
+		t.Fatalf("a %d KB line took %v, want well under 1s", len(src)>>10, d)
+	}
+	if len(runs) != 3*(n+1) {
+		t.Fatalf("%d runs, want %d", len(runs)/3, n+1)
+	}
+	if last := runs[len(runs)-3]; last != 15+6*(n-1) {
+		t.Errorf("the last number at %d, want %d", last, 15+6*(n-1))
+	}
+}
```

- [x] **Run:** `go test ./internal/export -run 'TestProjectKeepsEveryLocation|TestProjectColoursEachSource|TestSyntax'` Expected: FAIL (the build fails: `imp.More undefined (type Edge has no field or method More)`, `v.Syntax undefined (type *View has no field or method Syntax)`)

- [x] **Keep `more`, and colour each inlined source**

```diff
diff --git a/internal/export/project.go b/internal/export/project.go
index 8473552..6fe1bf7 100644
--- a/internal/export/project.go
+++ b/internal/export/project.go
@@ -89,7 +89,8 @@ func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 	return v, nil
 }
 
-// addSources inlines each file, refusing any path that could leave the repository.
+// addSources inlines each file with its Syntax (19), refusing any path that
+// could leave the repository.
 func addSources(v *View, files map[string]bool, read ReadFunc) error {
 	paths := make([]string, 0, len(files))
 	for p := range files {
@@ -105,6 +106,10 @@ func addSources(v *View, files map[string]bool, read ReadFunc) error {
 			return fmt.Errorf("read source %s: %w", p, err)
 		}
 		v.Sources[p] = string(b)
+		if v.Syntax == nil {
+			v.Syntax = map[string][][]int{}
+		}
+		v.Syntax[p] = Syntax(b)
 	}
 	return nil
 }
diff --git a/internal/export/syntax.go b/internal/export/syntax.go
new file mode 100644
index 0000000..142f10e
--- /dev/null
+++ b/internal/export/syntax.go
@@ -0,0 +1,137 @@
+package export
+
+import (
+	"bytes"
+	"go/scanner"
+	"go/token"
+	"unicode/utf8"
+)
+
+// The classes of Syntax runs (19); web/src/code.ts names them.
+const (
+	tokKeyword = 1
+	tokComment = 2
+	tokString  = 3 // string and character literals
+	tokNumber  = 4
+)
+
+// Syntax colours Go source for the Code panel (19): for each line of src, as
+// strings.Split(src, "\n") cuts it, the runs [column, length, class] of its
+// keywords, comments, literals and numbers, flat, with columns and lengths in
+// UTF-16 code units, as the page's JavaScript counts them. A token across
+// lines (a block comment, a raw string) has a run on each. It reads src with
+// go/scanner, so src need not parse, nor be a whole file: what does not scan
+// stays plain.
+func Syntax(src []byte) [][]int {
+	starts := []int{0} // each line's first byte
+	for i, c := range src {
+		if c == '\n' {
+			starts = append(starts, i+1)
+		}
+	}
+	out := make([][]int, len(starts))
+	for i := range out {
+		out[i] = []int{}
+	}
+	fset := token.NewFileSet()
+	file := fset.AddFile("", fset.Base(), len(src))
+	var s scanner.Scanner
+	s.Init(file, src, func(token.Position, string) {}, scanner.ScanComments)
+	line := 0 // the line of the last token, so the search starts there
+	// column is byte b's column on line l, counted on from the last byte
+	// asked of l, so a long line is counted once, not once per run.
+	cur, at, col := -1, 0, 0
+	column := func(l, b int) int {
+		if l != cur {
+			cur, at, col = l, starts[l], 0
+		}
+		col += utf16Len(src[at:b])
+		at = b
+		return col
+	}
+	for {
+		pos, tok, lit := s.Scan()
+		if tok == token.EOF {
+			return out
+		}
+		class, n := classOf(tok, lit)
+		if class == 0 {
+			continue
+		}
+		start := file.Offset(pos)
+		end := start + n
+		if tok == token.COMMENT || tok == token.STRING && src[start] == '`' {
+			end = tokenEnd(src, start, tok)
+		}
+		for line+1 < len(starts) && starts[line+1] <= start {
+			line++
+		}
+		for l, from := line, start; from < end; l++ {
+			stop := len(src)
+			if l+1 < len(starts) {
+				stop = starts[l+1] - 1 // the line's '\n'
+			}
+			to := min(end, stop)
+			if to > from {
+				out[l] = append(out[l], column(l, from), utf16Len(src[from:to]), class)
+			}
+			if l+1 >= len(starts) {
+				break
+			}
+			from = starts[l+1]
+		}
+	}
+}
+
+// classOf is a token's class and its length in bytes when lit or the
+// keyword gives it (0, 0 for a token Syntax leaves plain).
+func classOf(tok token.Token, lit string) (int, int) {
+	switch {
+	case tok.IsKeyword():
+		return tokKeyword, len(tok.String())
+	case tok == token.COMMENT:
+		return tokComment, len(lit)
+	case tok == token.STRING, tok == token.CHAR:
+		return tokString, len(lit)
+	case tok == token.INT, tok == token.FLOAT, tok == token.IMAG:
+		return tokNumber, len(lit)
+	}
+	return 0, 0
+}
+
+// tokenEnd is where the comment or raw string at start ends in src. The
+// scanner drops a '\r' from either's text, so its length is not the span's.
+// An unterminated one runs to the end.
+func tokenEnd(src []byte, start int, tok token.Token) int {
+	closer, from := "`", start+1
+	switch {
+	case tok == token.STRING:
+	case src[start+1] == '/':
+		closer = "\n"
+	default:
+		closer, from = "*/", start+2 // past "/*", so "/*/" does not close it
+	}
+	i := bytes.Index(src[from:], []byte(closer))
+	if i < 0 {
+		return len(src)
+	}
+	if closer == "\n" {
+		return from + i
+	}
+	return from + i + len(closer)
+}
+
+// utf16Len counts b's UTF-16 code units: two for a rune past U+FFFF, and one
+// for each byte that is not UTF-8, as encoding/json writes U+FFFD for it.
+func utf16Len(b []byte) int {
+	n := 0
+	for len(b) > 0 {
+		r, size := utf8.DecodeRune(b)
+		n++
+		if r > 0xFFFF {
+			n++
+		}
+		b = b[size:]
+	}
+	return n
+}
diff --git a/internal/export/syntax_test.go b/internal/export/syntax_test.go
index dd3a1d0..ec74d02 100644
--- a/internal/export/syntax_test.go
+++ b/internal/export/syntax_test.go
@@ -37,6 +37,7 @@ func TestSyntax(t *testing.T) {
 			{0, 4, tokKeyword},
 			{0, 7, tokComment},
 		}},
+		{"a comment where a semicolon goes", "x++ // c\n", [][]int{{4, 4, tokComment}, {}}},
 		{"empty", "", [][]int{{}}},
 	} {
 		if got := Syntax([]byte(c.src)); !reflect.DeepEqual(got, c.want) {
diff --git a/internal/export/view.go b/internal/export/view.go
index 74333be..1385067 100644
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -23,11 +23,13 @@ type View struct {
 	Nodes   []Node            `json:"nodes"`
 	Edges   []Edge            `json:"edges"`
 	Sources map[string]string `json:"sources"`
-	Links   *Links            `json:"links,omitempty"`
-	Honesty Honesty           `json:"honesty"`
-	Changed []string          `json:"changed,omitempty"` // Change View: changed packages, bottom-up
-	Hunks   map[string][]Hunk `json:"hunks,omitempty"`   // Change View: line diffs of changed files
-	Policy  *PolicyInfo       `json:"policy,omitempty"`  // only when the Policy has rules, an order or Proposals
+	// Syntax is each source's colour for the Code panel (19): Syntax(text).
+	Syntax  map[string][][]int `json:"syntax,omitempty"`
+	Links   *Links             `json:"links,omitempty"`
+	Honesty Honesty            `json:"honesty"`
+	Changed []string           `json:"changed,omitempty"` // Change View: changed packages, bottom-up
+	Hunks   map[string][]Hunk  `json:"hunks,omitempty"`   // Change View: line diffs of changed files
+	Policy  *PolicyInfo        `json:"policy,omitempty"`  // only when the Policy has rules, an order or Proposals
 	// Violations is the Change View's new, fixed and known violations (07),
 	// from the whole Summary zu diff printed.
 	Violations *diff.ViolationDelta `json:"violations,omitempty"`
@@ -71,14 +73,18 @@ type Node struct {
 	OffOut     int         `json:"offOut,omitempty"`     // declarations (17): and out of it to them
 }
 
-// Edge is an IR edge with its location count instead of every location.
+// Edge is an IR edge with its location count and first location; a call
+// or embed keeps the rest too (19), for the Code panel to light.
 type Edge struct {
-	From   string      `json:"from"`
-	To     string      `json:"to"`
-	Kind   string      `json:"kind"`
-	Count  int         `json:"count"`
-	Loc    ir.Location `json:"loc"`
-	Status string      `json:"status,omitempty"`
+	From  string      `json:"from"`
+	To    string      `json:"to"`
+	Kind  string      `json:"kind"`
+	Count int         `json:"count"`
+	Loc   ir.Location `json:"loc"`
+	// More is a call's or an embed's locations after Loc, in the IR's order:
+	// each its own path, as a declaration in several files calls from each.
+	More   []ir.Location `json:"more,omitempty"`
+	Status string        `json:"status,omitempty"`
 	// Violation is the rule this import breaks ("levels" or "cycle").
 	Violation string `json:"violation,omitempty"`
 }
@@ -127,7 +133,11 @@ func toNode(n *ir.Node) Node {
 }
 
 func toEdge(e *ir.Edge) Edge {
-	return Edge{From: e.From, To: e.To, Kind: string(e.Kind), Count: len(e.Locations), Loc: first(e.Locations)}
+	ve := Edge{From: e.From, To: e.To, Kind: string(e.Kind), Count: len(e.Locations), Loc: first(e.Locations)}
+	if e.Kind != ir.EdgeImports && len(e.Locations) > 1 {
+		ve.More = slices.Clone(e.Locations[1:])
+	}
+	return ve
 }
 
 // sortView puts every list in canonical order so the same input renders the
diff --git a/web/src/data.ts b/web/src/data.ts
index f427c3b..846ec9b 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -15,6 +15,7 @@ export type ViewNode = {
 export type ViewEdge = {
   from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
   violation?: Violation["rule"]; // 06: the Policy rule this import breaks
+  more?: Loc[]; // 19: a call's or an embed's locations after loc
 };
 export type Ref = { commit: string; dirty: boolean };
 export type Hunk = { baseStart: number; baseLines: number; headStart: number; headLines: number; lines: string[] };
@@ -35,6 +36,9 @@ export type Metrics = {
 export type View = {
   schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref; changed?: string[];
   modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
+  // 19: each source's colour, export.Syntax: per line, runs [column, length, class]
+  // flat, in UTF-16 units (code.ts paint).
+  syntax?: Record<string, number[][]>;
   // 14: base, files and nodes only in a Change View (export.DiffLinks).
   links?: { blob: string; compare?: string; mr?: string; base?: string; files?: Record<string, string>; nodes?: Record<string, string> };
   hunks?: Record<string, Hunk[]>;
```

- [x] **Run:** `go test ./internal/export -update` Expected: PASS (it rewrites the two View goldens: each gains `syntax`, 347 and 505 lines; review the diff, which adds no other key)

- [x] **Run:** `go test ./... && cd web && npx vitest run && npm run typecheck` Expected: PASS

- [x] **Commit:** `Keep every line of a call or embed, and colour inlined Go`

---

### Task 2: zu serve draws every package and sends its source on demand (`serve`)

- `TestProjectEveryPackageWithoutSource`: `Project(doc, []Pattern{Every}, nil)` on the shop IR holds every node of the IR, every package has detail, and no source or syntax is inlined; on an empty IR it is no error, though `Every` matched nothing.
- `TestHandlerServesSourceOnDemand`, with a fake `Source`:
  - `/source?path=a/a.go` is 200, `application/json`, `no-store`, the bytes `Source` gave;
  - a path `Source` refuses (`fs.ErrNotExist`) is 404, and a read error is 500 with its message;
  - a cross-site or same-site request is 403, a POST 405, and a foreign Host 421, before any read: `Source` is called three times in all;
  - without `Source`, `/source` is 404.
- `TestServeDrawsEveryDeclarationAndSendsItsSourceOnDemand` serves a module with `a/a.go` (`func F`), `go.mod` and `web/app.ts`:
  - the View holds `example.com/m/a.F` with detail, and inlines no source or syntax;
  - `/source?path=a/a.go` sends the file with its `Syntax`;
  - it is 404 for `go.mod`, `web/app.ts`, `../a/a.go`, `/a/a.go`, `./a/a.go`, `a`, an empty path, and `b/b.go`;
  - after `b/b.go` is written, it is 404 until a page load rescans, then 200;
  - zu serve writes no `.zu`.
- `TestServeOverTheDetailBudgetDrawsPackagesOnly` sets `detailBudget` to 1: the View has no declaration and no detail, and stderr says once, over two loads, "zu serve: 2 declarations, more than 1: the page draws packages only; -include picks the packages to draw".
- `TestServeDetailBudgetCountsWhatThePolicyDraws` sets `detailBudget` to 1 on a module of two packages, one omitted by its Policy: the View details the other's declaration, and stderr says nothing.
- `TestServeBaseSendsSourceOnDemand`: with `-base main`, `/source` sends a file of the working tree, and after an edit, the new text.
- `TestServeWatchKeepsTheViewWhileAFileDoesNotParse` (13) now expects the package with detail and its declaration: zu serve without `-include` draws them.
- `TestServeWatchSaysWhenAFileChangesUnderTheView` serves the same module with `-poll 100ms`. Its stream starts with `view 1` and an empty notice, then `source 0` and `source 1`, or `source 1` alone: outside git the watch's first poll rescans every file, and the test waits for its count. A literal added to `F` gives `source 2` and no View, and `/source` sends the new text. `a/a.go` saved broken gives its notice and `source 3`, and `/source` still sends it. A new `c/c.go` then gives `source 4`; after a page load (`view.json`), whose View declares nothing in `a/a.go`, `/source` sends both files.
- `TestEventsStreamTheLatestGeneration` (13) now expects `source 0` on connect, and a `source` count after each `Keep`, none after `Publish`. 13's `await` skips counts as it skips an empty notice, and `TestServeWatchKeepsTheViewWhenARescanFails` skips them too.

**Files:**
- Tests: `internal/export/project_test.go`, `internal/serve/serve_test.go`, `internal/serve/live_test.go`, `internal/cli/serve_test.go`, `internal/cli/change_test.go`, `internal/cli/watch_test.go`
- Code: `internal/export/include.go`, `internal/export/project.go`, `internal/export/view.go`, `internal/serve/serve.go`, `internal/serve/live.go`, `internal/cli/serve.go`, `internal/cli/watch.go`, `internal/cli/html.go`, `internal/cli/change.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/cli/change_test.go b/internal/cli/change_test.go
index 2bb79a4..f8f8c14 100644
--- a/internal/cli/change_test.go
+++ b/internal/cli/change_test.go
@@ -61,6 +61,19 @@ func TestServeBaseSendsTheViewDiffHTMLWrites(t *testing.T) {
 	noZu(t, dir)
 }
 
+// 19: zu serve -base sends a file from the working tree, as with no -base:
+// the Change View inlines only meaningfully changed files.
+func TestServeBaseSendsSourceOnDemand(t *testing.T) {
+	dir := diffRepo(t)
+	url, _ := startServe(t, dir, "-base", "main", "-poll", "0")
+	fetch(t, url+"view.json")
+	edit := "package a\n\nfunc F() int { return 3 }\n\nfunc G() {}\n"
+	writeFile(t, dir, "a/a.go", edit)
+	if got := fetch(t, url+"source?path=a/a.go"); !strings.Contains(got, `"text":"package a\n\nfunc F() int { return 3 }`) {
+		t.Errorf("source = %s", got)
+	}
+}
+
 // The Base is scanned once and kept: again only when the merge-base or the
 // Policy's hash moves (ADR 0004), never on an edit in the worktree.
 func TestServeBaseScansTheBaseOnlyWhenItMoves(t *testing.T) {
diff --git a/internal/cli/serve_test.go b/internal/cli/serve_test.go
index 46858e8..2badcf7 100644
--- a/internal/cli/serve_test.go
+++ b/internal/cli/serve_test.go
@@ -4,15 +4,19 @@ import (
 	"bufio"
 	"bytes"
 	"context"
+	"encoding/json"
 	"io"
 	"net/http"
 	"os"
 	"path/filepath"
+	"reflect"
 	"strings"
 	"sync"
 	"testing"
 	"time"
 
+	"zu/internal/export"
+	"zu/internal/policy"
 	"zu/internal/scan"
 )
 
@@ -111,6 +115,93 @@ func TestServeSendsTheViewScanHTMLInlines(t *testing.T) {
 	}
 }
 
+// statusOf is the status of GET url.
+func statusOf(t *testing.T, url string) int {
+	t.Helper()
+	resp, err := http.Get(url)
+	if err != nil {
+		t.Fatal(err)
+	}
+	resp.Body.Close()
+	return resp.StatusCode
+}
+
+// 19: without -include zu serve draws every package's declarations, which
+// zu scan -html leaves out, and inlines no source. The page reads a file
+// from /source, which sends one only if the last scan declares something in
+// it, from the tree as it is now.
+func TestServeDrawsEveryDeclarationAndSendsItsSourceOnDemand(t *testing.T) {
+	dir := repo(t, small)
+	url, _ := startServe(t, dir, "-poll", "0")
+	v := fetch(t, url+"view.json")
+	for _, want := range []string{`"id":"example.com/m/a.F"`, `"detail":true`, `"sources":{}`} {
+		if !strings.Contains(v, want) {
+			t.Errorf("View lacks %s: %s", want, v)
+		}
+	}
+	if strings.Contains(v, `"syntax"`) {
+		t.Errorf("View inlines syntax: %s", v)
+	}
+	var f export.SourceFile
+	if err := json.Unmarshal([]byte(fetch(t, url+"source?path=a/a.go")), &f); err != nil {
+		t.Fatal(err)
+	}
+	if want := small["a/a.go"]; f.Path != "a/a.go" || f.Text != want || !reflect.DeepEqual(f.Syntax, export.Syntax([]byte(want))) {
+		t.Errorf("source = %+v", f)
+	}
+	for _, p := range []string{"go.mod", "web/app.ts", "../a/a.go", "/a/a.go", "./a/a.go", "a", "", "b/b.go"} {
+		if code := statusOf(t, url+"source?path="+p); code != http.StatusNotFound {
+			t.Errorf("%q: %d, want 404", p, code)
+		}
+	}
+	writeFile(t, dir, "b/b.go", "package b\n\nfunc H() {}\n")
+	if code := statusOf(t, url+"source?path=b/b.go"); code != http.StatusNotFound {
+		t.Errorf("b/b.go before a scan lists it: %d", code)
+	}
+	fetch(t, url+"view.json")
+	if code := statusOf(t, url+"source?path=b/b.go"); code != http.StatusOK {
+		t.Errorf("b/b.go after: %d", code)
+	}
+	noZu(t, dir)
+}
+
+// 19: past the budget the page draws packages only, as zu serve did before
+// without -include, and zu serve says so once.
+func TestServeOverTheDetailBudgetDrawsPackagesOnly(t *testing.T) {
+	old := detailBudget
+	detailBudget = 1
+	t.Cleanup(func() { detailBudget = old }) // after startServe's, which stops zu serve
+	url, stderr := startServe(t, repo(t, small), "-poll", "0")
+	v := fetch(t, url+"view.json")
+	if strings.Contains(v, "a.F") || strings.Contains(v, `"detail":true`) {
+		t.Errorf("declarations past the budget: %s", v)
+	}
+	const note = "zu serve: 2 declarations, more than 1: the page draws packages only; -include picks the packages to draw\n"
+	if n := strings.Count(stderr.String(), note); n != 1 {
+		t.Errorf("note %d times in:\n%s", n, stderr.String())
+	}
+}
+
+// 19: the budget counts the declarations the page would draw: a package the
+// Policy omits counts for nothing.
+func TestServeDetailBudgetCountsWhatThePolicyDraws(t *testing.T) {
+	old := detailBudget
+	detailBudget = 1
+	t.Cleanup(func() { detailBudget = old })
+	url, stderr := startServe(t, repo(t, map[string]string{
+		"go.mod":        "module example.com/m\n",
+		"a/a.go":        "package a\n\nfunc F() {}\n",
+		"gen/gen.go":    "package gen\n\nfunc G() {}\n",
+		policy.FileName: "omit: [example.com/m/gen]\n",
+	}), "-poll", "0")
+	if v := fetch(t, url+"view.json"); !strings.Contains(v, `"id":"example.com/m/a.F"`) {
+		t.Errorf("a.F not drawn, though the Policy draws one declaration: %s", v)
+	}
+	if strings.Contains(stderr.String(), "more than") {
+		t.Errorf("over the budget:\n%s", stderr.String())
+	}
+}
+
 // Every load of the page rescans, parsing only the files that changed.
 func TestServeRescansOnlyWhatChanged(t *testing.T) {
 	dir := repo(t, small)
diff --git a/internal/cli/watch_test.go b/internal/cli/watch_test.go
index c262cf7..2fec1c8 100644
--- a/internal/cli/watch_test.go
+++ b/internal/cli/watch_test.go
@@ -44,20 +44,28 @@ func stream(t *testing.T, url string) <-chan string {
 	return out
 }
 
-// await returns the next event that is not an empty notice.
+// next returns the next event.
+func next(t *testing.T, events <-chan string) string {
+	t.Helper()
+	select {
+	case e, ok := <-events:
+		if !ok {
+			t.Fatal("the stream ended")
+		}
+		return e
+	case <-time.After(10 * time.Second):
+		t.Fatal("no event")
+	}
+	return ""
+}
+
+// await returns the next event that is neither an empty notice nor (19) a
+// count of rescans that published no View.
 func await(t *testing.T, events <-chan string) string {
 	t.Helper()
 	for {
-		select {
-		case e, ok := <-events:
-			if !ok {
-				t.Fatal("the stream ended")
-			}
-			if e != "notice " {
-				return e
-			}
-		case <-time.After(10 * time.Second):
-			t.Fatal("no event")
+		if e := next(t, events); e != "notice " && !strings.HasPrefix(e, "source ") {
+			return e
 		}
 	}
 }
@@ -158,7 +166,9 @@ func TestServeWatchKeepsTheViewWhileAFileDoesNotParse(t *testing.T) {
 	if e := await(t, events); e != "view 2" {
 		t.Fatalf("fixed: %q", e)
 	}
-	if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/a","kind":"package","module":"example.com/m","loc":{"path":"a/a.go","line":1},"decls":1}`) {
+	// 19: without -include zu serve draws every package's declarations.
+	if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/a","kind":"package","module":"example.com/m","loc":{"path":"a/a.go","line":1},"decls":1,"detail":true}`) ||
+		!strings.Contains(v, `"id":"example.com/m/a.F"`) {
 		t.Errorf("the fixed View lacks a.F: %.300s", v)
 	}
 	if !strings.Contains(stderr.String(), "a/a.go:3:") || !strings.Contains(stderr.String(), "the page keeps its drawing") {
@@ -196,13 +206,62 @@ func TestServeWatchKeepsTheViewWhenARescanFails(t *testing.T) {
 		t.Fatalf("a bad Policy: %q; %s", e, stderr.String())
 	}
 	writeFile(t, dir, "zu.policy.yaml", "levels: []\n")
-	select { // the notice clears; the View may be unchanged
-	case e := <-events:
-		if e != "notice " && e != "view 2" {
-			t.Fatalf("a good Policy again: %q", e)
+	e := next(t, events)
+	for strings.HasPrefix(e, "source ") {
+		e = next(t, events)
+	}
+	if e != "notice " && e != "view 2" { // the notice clears; the View may be unchanged
+		t.Fatalf("a good Policy again: %q", e)
+	}
+}
+
+// 19: a save the View does not show, here a literal, publishes no View. The
+// stream counts the rescan instead, so the page reads its files again, and
+// /source sends the file as saved. While a file does not parse, /source
+// still sends it: the drawing the page keeps declares something in it. A
+// page load then adds the files its own View declares something in.
+func TestServeWatchSaysWhenAFileChangesUnderTheView(t *testing.T) {
+	dir := repo(t, small)
+	url, _ := startServe(t, dir, "-poll", "100ms")
+	events := stream(t, url)
+	for _, want := range []string{"view 1", "notice "} {
+		if e := next(t, events); e != want {
+			t.Fatalf("on connect: %q, want %q", e, want)
+		}
+	}
+	// Outside git the watch's first poll rescans every file and publishes no
+	// View: the counts below start from its count.
+	for e := next(t, events); e != "source 1"; e = next(t, events) {
+		if e != "source 0" {
+			t.Fatalf("before the first poll: %q, want source 0 or 1", e)
+		}
+	}
+	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() { G(); _ = 1 }\n\nfunc G() {}\n")
+	if e := next(t, events); e != "source 2" {
+		t.Fatalf("a literal: %q, want source 2", e)
+	}
+	if f := fetch(t, url+"source?path=a/a.go"); !strings.Contains(f, "_ = 1") {
+		t.Errorf("source after a literal: %s", f)
+	}
+	writeFile(t, dir, "a/a.go", "package a\n\nfunc F( {\n")
+	if e := next(t, events); !strings.HasPrefix(e, "notice a/a.go:") {
+		t.Fatalf("a broken file: %q", e)
+	}
+	if e := next(t, events); e != "source 3" {
+		t.Fatalf("a broken file: %q, want source 3", e)
+	}
+	if f := fetch(t, url+"source?path=a/a.go"); !strings.Contains(f, "func F( {") {
+		t.Errorf("source while a/a.go does not parse: %s", f)
+	}
+	writeFile(t, dir, "c/c.go", "package c\n\nfunc C() {}\n")
+	if e := next(t, events); e != "source 4" {
+		t.Fatalf("a new file while a/a.go does not parse: %q, want source 4", e)
+	}
+	fetch(t, url+"view.json") // a page load: its View declares C, and nothing in a/a.go
+	for _, p := range []string{"a/a.go", "c/c.go"} {
+		if code := statusOf(t, url+"source?path="+p); code != http.StatusOK {
+			t.Errorf("source of %s after a page load while a/a.go does not parse: %d", p, code)
 		}
-	case <-time.After(10 * time.Second):
-		t.Fatal("the notice stayed")
 	}
 }
 
diff --git a/internal/export/project_test.go b/internal/export/project_test.go
index 8ecc01e..eb6abeb 100644
--- a/internal/export/project_test.go
+++ b/internal/export/project_test.go
@@ -177,6 +177,31 @@ func TestProjectColoursEachSource(t *testing.T) {
 	}
 }
 
+// 19: zu serve draws every package's declarations by default. Every
+// selects them all, in an IR with none too, and with no ReadFunc the View
+// inlines no source: the page reads it from zu serve.
+func TestProjectEveryPackageWithoutSource(t *testing.T) {
+	doc := shopIR(t)
+	v, err := Project(doc, []Pattern{Every}, nil)
+	if err != nil {
+		t.Fatal(err)
+	}
+	if len(v.Nodes) != len(doc.Nodes) {
+		t.Errorf("%d nodes, want the IR's %d", len(v.Nodes), len(doc.Nodes))
+	}
+	for _, n := range v.Nodes {
+		if n.Kind == "package" && !n.Detail {
+			t.Errorf("package %s not detailed", n.ID)
+		}
+	}
+	if len(v.Sources) != 0 || v.Syntax != nil {
+		t.Errorf("inlined %d sources, %d coloured", len(v.Sources), len(v.Syntax))
+	}
+	if _, err := Project(&ir.IR{}, []Pattern{Every}, nil); err != nil {
+		t.Errorf("an IR with no package: %v", err)
+	}
+}
+
 func TestProjectRejectsAnIncludeThatMatchesNothing(t *testing.T) {
 	doc := shopIR(t)
 	p, _ := ParsePattern("./nosuch/...", RootModule(doc))
diff --git a/internal/serve/live_test.go b/internal/serve/live_test.go
index 1b35f22..f400c46 100644
--- a/internal/serve/live_test.go
+++ b/internal/serve/live_test.go
@@ -74,7 +74,8 @@ func expect(t *testing.T, got <-chan string, want string) {
 }
 
 // GET /events streams the latest View's generation, at once and on each
-// change, and the notice, one line; closing the Hub ends the stream.
+// change, the notice, one line, and (19) how many rescans published no View;
+// closing the Hub ends the stream.
 func TestEventsStreamTheLatestGeneration(t *testing.T) {
 	hub := NewHub([]byte(`{"v":1}`))
 	srv, builds := liveServer(t, hub)
@@ -86,11 +87,17 @@ func TestEventsStreamTheLatestGeneration(t *testing.T) {
 	got := events(t, resp.Body)
 	expect(t, got, "view 1")
 	expect(t, got, "notice ")
-	hub.Notify("a.go:3:1: expected '}'\nfound EOF")
+	expect(t, got, "source 0")
+	hub.Keep("a.go:3:1: expected '}'\nfound EOF")
 	expect(t, got, "notice a.go:3:1: expected '}' found EOF")
+	expect(t, got, "source 1")
+	hub.Keep("") // a View the same as the last
+	expect(t, got, "notice ")
+	expect(t, got, "source 2")
 	hub.Publish([]byte(`{"v":2}`))
 	expect(t, got, "view 2")
-	expect(t, got, "notice ")
+	hub.Keep("")
+	expect(t, got, "source 3") // Publish counts no rescan: the page reads its files again for a new View anyway
 	hub.Close()
 	if e, ok := <-got; ok {
 		t.Errorf("after Close: %q, want the stream to end", e)
diff --git a/internal/serve/serve_test.go b/internal/serve/serve_test.go
index 6c61bf3..b9cffe7 100644
--- a/internal/serve/serve_test.go
+++ b/internal/serve/serve_test.go
@@ -3,6 +3,7 @@ package serve
 import (
 	"context"
 	"errors"
+	"io/fs"
 	"net"
 	"net/http"
 	"net/http/httptest"
@@ -185,3 +186,64 @@ func TestHandlerReportsAFailedBuild(t *testing.T) {
 		t.Errorf("%d %q", w.Code, w.Body.String())
 	}
 }
+
+// 19: /source sends what Views.Source reads, under the View's rules: to this
+// machine's own page only, read-only. A path Source refuses is 404.
+func TestHandlerServesSourceOnDemand(t *testing.T) {
+	reads := 0
+	h := Handler([]byte("PAGE"), Views{
+		Scan: func(context.Context) ([]byte, uint64, error) { return nil, 0, errors.New("no scan") },
+		Source: func(path string) ([]byte, error) {
+			reads++
+			switch path {
+			case "a/a.go":
+				return []byte(`{"path":"a/a.go"}`), nil
+			case "boom.go":
+				return nil, errors.New("read boom.go: permission denied")
+			}
+			return nil, fs.ErrNotExist
+		},
+	})
+	do := func(method, target, host, site string) *httptest.ResponseRecorder {
+		r := httptest.NewRequest(method, target, nil)
+		r.Host = host
+		r.Header.Set("Sec-Fetch-Site", site)
+		w := httptest.NewRecorder()
+		h.ServeHTTP(w, r)
+		return w
+	}
+	const local = "127.0.0.1:7433"
+	if w := do("GET", "/source?path=a/a.go", local, "same-origin"); w.Code != 200 || w.Body.String() != `{"path":"a/a.go"}` ||
+		w.Header().Get("Content-Type") != "application/json" || w.Header().Get("Cache-Control") != "no-store" {
+		t.Errorf("a/a.go: %d %q %q", w.Code, w.Header().Get("Content-Type"), w.Body.String())
+	}
+	if w := do("GET", "/source?path=b.go", local, ""); w.Code != http.StatusNotFound {
+		t.Errorf("b.go: %d, want 404", w.Code)
+	}
+	if w := do("GET", "/source?path=boom.go", local, ""); w.Code != 500 || !strings.Contains(w.Body.String(), "permission denied") {
+		t.Errorf("boom.go: %d %q", w.Code, w.Body.String())
+	}
+	if reads != 3 {
+		t.Errorf("%d reads, want 3", reads)
+	}
+	for _, c := range []struct {
+		method, host, site string
+		want               int
+	}{
+		{"GET", local, "cross-site", http.StatusForbidden},
+		{"GET", local, "same-site", http.StatusForbidden},
+		{"POST", local, "", http.StatusMethodNotAllowed},
+		{"GET", "evil.example:7433", "", http.StatusMisdirectedRequest},
+	} {
+		if w := do(c.method, "/source?path=a/a.go", c.host, c.site); w.Code != c.want {
+			t.Errorf("%s from %s (%s): %d, want %d", c.method, c.host, c.site, w.Code, c.want)
+		}
+	}
+	if reads != 3 {
+		t.Errorf("a refused request read: %d reads", reads)
+	}
+	// Without Source, as in a test of the View alone, there is no /source.
+	if w, _ := get(t, "GET", "/source?path=a/a.go", local, nil, nil); w.Code != http.StatusNotFound {
+		t.Errorf("no Source: %d, want 404", w.Code)
+	}
+}
```

- [x] **Run:** `go test ./internal/export ./internal/serve ./internal/cli` Expected: FAIL (the builds fail: `undefined: Every`, `hub.Keep undefined (type *Hub has no field or method Keep)`, `unknown field Source in struct literal of type Views`, `undefined: export.SourceFile`, `undefined: detailBudget`)

- [x] **Detail every package within the budget, and serve `/source`**

```diff
diff --git a/internal/cli/change.go b/internal/cli/change.go
index 76d7a32..66bf165 100644
--- a/internal/cli/change.go
+++ b/internal/cli/change.go
@@ -19,7 +19,7 @@ import (
 // only when the merge-base or head's Policy hash moved (ADR 0004).
 func (s *session) viewOf(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures) (*export.View, error) {
 	if s.base == "" {
-		return projectView(ctx, "serve", src, doc, pol, ms, s.o, s.stderr)
+		return projectView(ctx, "serve", src, doc, pol, ms, s.o, s.every, s.stderr)
 	}
 	if doc.Ref.Commit == "" {
 		return nil, errors.New("-base: HEAD has no commit yet")
diff --git a/internal/cli/html.go b/internal/cli/html.go
index 26d173b..e4e581f 100644
--- a/internal/cli/html.go
+++ b/internal/cli/html.go
@@ -199,7 +199,7 @@ func builtTemplate() ([]byte, error) {
 // ir.Encode) as the Policy draws it, reading source through the tree the
 // scan read.
 func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, stderr io.Writer) error {
-	v, err := projectView(ctx, "scan", src, doc, pol, ms, o, stderr)
+	v, err := projectView(ctx, "scan", src, doc, pol, ms, o, nil, stderr)
 	if err != nil {
 		return err
 	}
@@ -207,8 +207,10 @@ func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy,
 }
 
 // projectView builds the Project View of doc, which must be sorted, for zu
-// scan -html and zu serve alike.
-func projectView(ctx context.Context, cmd string, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, stderr io.Writer) (*export.View, error) {
+// scan -html and zu serve alike. When every says yes of the IR as the
+// Policy draws it (zu serve without -include, 19), it draws every package's
+// declarations and inlines no source.
+func projectView(ctx context.Context, cmd string, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, every func(*ir.IR) bool, stderr io.Writer) (*export.View, error) {
 	root := export.RootModule(doc)
 	pats := make([]export.Pattern, 0, len(o.include))
 	for _, s := range o.include {
@@ -218,7 +220,12 @@ func projectView(ctx context.Context, cmd string, src *source, doc *ir.IR, pol *
 		}
 		pats = append(pats, p)
 	}
-	v, err := export.Project(pol.Apply(doc), pats, src.tree.ReadFile)
+	drawn := pol.Apply(doc)
+	read := src.tree.ReadFile
+	if every != nil && every(drawn) {
+		pats, read = []export.Pattern{export.Every}, nil
+	}
+	v, err := export.Project(drawn, pats, read)
 	if err != nil {
 		return nil, err
 	}
diff --git a/internal/cli/serve.go b/internal/cli/serve.go
index d5f117d..fcef406 100644
--- a/internal/cli/serve.go
+++ b/internal/cli/serve.go
@@ -2,13 +2,17 @@ package cli
 
 import (
 	"context"
+	"encoding/json"
 	"errors"
 	"flag"
 	"fmt"
 	"io"
+	"io/fs"
+	"maps"
 	"net/http"
 	"os"
 	"path/filepath"
+	"strconv"
 	"sync"
 	"sync/atomic"
 	"time"
@@ -26,14 +30,15 @@ import (
 // (10): the Project View of the working tree, on a loopback address, until
 // interrupted, or with -base (14) the Change View zu diff ref -worktree
 // -html writes. Every load of the page rescans the tree, parsing only the
-// files whose content changed. Flags may come before or after dir. It
-// writes nothing to disk.
+// files whose content changed. Without -include the Project View draws
+// every package's declarations, and the page reads their source on demand
+// (19). Flags may come before or after dir. It writes nothing to disk.
 func runServe(args []string, stdout, stderr io.Writer) int {
 	fs := flag.NewFlagSet("zu serve", flag.ContinueOnError)
 	fs.SetOutput(stderr)
 	addr := fs.String("addr", "", "listen on `host:port`, a loopback address (default "+serve.DefaultAddr+", or a free port when that is taken)")
 	var o htmlOptions
-	fs.Var(&o.include, "include", "inline declarations and source of packages matching `pattern` (repeatable; ./ = root module)")
+	fs.Var(&o.include, "include", "draw only the declarations of packages matching `pattern`, their source inlined, as zu scan -html does (repeatable; ./ = root module); without it, every package's, up to "+strconv.Itoa(detailBudget)+" declarations")
 	fs.StringVar(&o.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
 	fs.StringVar(&o.cover, "coverprofile", "", "colour packages by CRAP from `file`, written by go test -coverprofile over this tree; read once, at start")
 	poll := fs.Duration("poll", time.Second, "look for changes every `interval` and redraw the open page; 0: never")
@@ -96,7 +101,7 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 		hub = serve.NewHub(first)
 		s.hub = hub
 	}
-	srv := newServer(serve.Handler(page, serve.Views{Scan: s.view, Hub: hub}))
+	srv := newServer(serve.Handler(page, serve.Views{Scan: s.view, Hub: hub, Source: s.source}))
 	if hub != nil {
 		srv.RegisterOnShutdown(hub.Close) // open streams end, so Shutdown need not wait them out
 		wctx, stopWatch := context.WithCancel(ctx)
@@ -132,6 +137,11 @@ func newServer(h http.Handler) *http.Server {
 	return &http.Server{Handler: h, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
 }
 
+// detailBudget is the most declarations zu serve draws without -include
+// (19): past it the page draws packages only, as a big View is slow to
+// send, parse and lay out (kubernetes, at 107,196, would weigh 61 MB).
+var detailBudget = 20000
+
 // session is one zu serve: its options, and the Cache its rescans share.
 type session struct {
 	mu     sync.Mutex // one rescan at a time
@@ -160,6 +170,71 @@ type session struct {
 	// last began a poll. When they differ, a page load may have listed a
 	// file the watch's listing lacks.
 	scans, polledAt atomic.Int64
+
+	// files is what /source sends (19): the files the last page load's
+	// scan, or the watch's last rescan the page draws, declares a package,
+	// type or function in. A rescan the watch keeps from the page changes
+	// nothing: the page still draws what is declared there. overBudget,
+	// guarded by mu, is set once zu serve has said the tree is past
+	// detailBudget.
+	files      atomic.Pointer[map[string]bool]
+	overBudget bool
+}
+
+// every says whether the Project View draws every package's declarations
+// (19): without -include, while doc, as the Policy draws it, holds at most
+// detailBudget of them. The first time it is past, zu serve says so.
+func (s *session) every(doc *ir.IR) bool {
+	if len(s.o.include) > 0 {
+		return false
+	}
+	n := 0
+	for i := range doc.Nodes {
+		if k := doc.Nodes[i].Kind; k == ir.KindType || k == ir.KindFunction {
+			n++
+		}
+	}
+	if n <= detailBudget {
+		return true
+	}
+	if !s.overBudget {
+		s.overBudget = true
+		fmt.Fprintf(s.stderr, "zu serve: %d declarations, more than %d: the page draws packages only; -include picks the packages to draw\n", n, detailBudget)
+	}
+	return false
+}
+
+// source answers GET /source (19): the file at path in the tree as it is
+// now, with its Syntax, if the last scan declares something in it; else
+// fs.ErrNotExist. It takes no lock, so a rescan does not hold it up.
+func (s *session) source(path string) ([]byte, error) {
+	files := s.files.Load()
+	if files == nil || !(*files)[path] || !filepath.IsLocal(filepath.FromSlash(path)) {
+		return nil, fs.ErrNotExist
+	}
+	tree, err := scan.DirTree(s.dir)
+	if err != nil {
+		return nil, err
+	}
+	b, err := tree.ReadFile(path)
+	if err != nil {
+		return nil, err
+	}
+	return json.Marshal(export.SourceFile{Path: path, Text: string(b), Syntax: export.Syntax(b)})
+}
+
+// declared is the files doc declares a package, type or function in.
+func declared(doc *ir.IR) map[string]bool {
+	out := map[string]bool{}
+	for i := range doc.Nodes {
+		if doc.Nodes[i].Kind == ir.KindExternal {
+			continue
+		}
+		for _, l := range doc.Nodes[i].Locations {
+			out[l.Path] = true
+		}
+	}
+	return out
 }
 
 // view rescans the working tree under its Policy, as zu scan does, and
@@ -191,6 +266,13 @@ func (s *session) view(ctx context.Context) ([]byte, uint64, error) {
 		s.begun, s.git, s.seen, s.first = true, src.listing != nil, src.listing, src.tree
 		s.errs, s.commit = errPaths(doc), doc.Ref.Commit
 	}
+	files := declared(doc)
+	// While a file does not parse the watch keeps its drawing (changed),
+	// whose files pages still read: a page load adds its own to them.
+	if old := s.files.Load(); old != nil && newParseErrors(s.errs, doc) != "" && doc.Ref.Commit == s.commit {
+		maps.Copy(files, *old)
+	}
+	s.files.Store(&files)
 	var gen uint64
 	if s.hub != nil {
 		_, gen, _ = s.hub.Latest()
diff --git a/internal/cli/watch.go b/internal/cli/watch.go
index b7c06a2..70f615f 100644
--- a/internal/cli/watch.go
+++ b/internal/cli/watch.go
@@ -87,8 +87,10 @@ func (s *session) list(ctx context.Context) (*watch.Listing, error) {
 // changed rescans after the watch saw a change and pushes the View, unless
 // the rescan failed or, at the same commit, a file that parsed in the
 // pushed View no longer does: then the page keeps its drawing and shows
-// why. If a page load scanned since the watch began its poll, it lists the
-// tree again first: the page may already draw a file l lacks.
+// why. A rescan that pushes no View, kept or the same, tells the page to
+// read its files again (19). If a page load scanned since the watch began
+// its poll, it lists the tree again first: the page may already draw a file
+// l lacks.
 func (s *session) changed(ctx context.Context, l *watch.Listing) {
 	s.mu.Lock()
 	defer s.mu.Unlock()
@@ -122,17 +124,19 @@ func (s *session) changed(ctx context.Context, l *watch.Listing) {
 		return
 	case err != nil:
 		fmt.Fprintf(s.stderr, "zu serve: watch: rescan failed: %v; the page keeps its drawing\n", err)
-		s.hub.Notify("rescan failed: " + err.Error())
+		s.hub.Keep("rescan failed: " + err.Error())
 		return
 	}
 	if broken := newParseErrors(s.errs, doc); broken != "" && doc.Ref.Commit == s.commit {
 		fmt.Fprintf(s.stderr, "zu serve: watch: %s; the page keeps its drawing\n", broken)
-		s.hub.Notify(broken)
+		s.hub.Keep(broken)
 		return
 	}
 	s.errs, s.commit = errPaths(doc), doc.Ref.Commit
+	files := declared(doc)
+	s.files.Store(&files)
 	if last, _, _ := s.hub.Latest(); bytes.Equal(last, data) {
-		s.hub.Notify("")
+		s.hub.Keep("")
 		return
 	}
 	s.hub.Publish(data)
diff --git a/internal/export/include.go b/internal/export/include.go
index a6a5ceb..b2a657e 100644
--- a/internal/export/include.go
+++ b/internal/export/include.go
@@ -18,8 +18,12 @@ type Pattern struct {
 	path   string
 	tree   bool
 	module string // set for ./ patterns
+	every  bool   // Every
 }
 
+// Every selects every package: what zu serve draws without -include (19).
+var Every = Pattern{src: "every package", every: true}
+
 func (p Pattern) String() string { return p.src }
 
 // ParsePattern parses one -include value. rootModule is the module at the scan
@@ -46,6 +50,9 @@ func ParsePattern(s, rootModule string) (Pattern, error) {
 
 // Match reports whether the package with import path pkg, in module, is selected.
 func (p Pattern) Match(pkg, module string) bool {
+	if p.every {
+		return true
+	}
 	if p.module != "" && module != p.module {
 		return false
 	}
diff --git a/internal/export/project.go b/internal/export/project.go
index 6fe1bf7..3e7eb7a 100644
--- a/internal/export/project.go
+++ b/internal/export/project.go
@@ -13,6 +13,7 @@ type ReadFunc func(path string) ([]byte, error)
 
 // Project builds the Project View: every package and external with its import
 // edges, plus declarations, calls, embeds and source for included packages.
+// With read nil it inlines no source (19: zu serve sends it on demand).
 func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 	pkgOf := packageOf(nodesByID(doc))
 	detail, decls, gen := map[string]bool{}, map[string]int{}, map[string]int{}
@@ -34,7 +35,7 @@ func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 		}
 	}
 	for j, ok := range matched {
-		if !ok {
+		if !ok && !include[j].every {
 			return nil, fmt.Errorf("-include %s matches no package", include[j])
 		}
 	}
@@ -82,8 +83,10 @@ func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 		n := &v.Nodes[i]
 		n.OffIn, n.OffOut = offIn[n.ID], offOut[n.ID]
 	}
-	if err := addSources(v, files, read); err != nil {
-		return nil, err
+	if read != nil {
+		if err := addSources(v, files, read); err != nil {
+			return nil, err
+		}
 	}
 	sortView(v)
 	return v, nil
diff --git a/internal/export/view.go b/internal/export/view.go
index 1385067..f1b8d8c 100644
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -89,6 +89,14 @@ type Edge struct {
 	Violation string `json:"violation,omitempty"`
 }
 
+// SourceFile is one file as zu serve sends it to the page on demand (19),
+// at GET /source: what View.Sources and View.Syntax hold for an inlined one.
+type SourceFile struct {
+	Path   string  `json:"path"`
+	Text   string  `json:"text"`
+	Syntax [][]int `json:"syntax"`
+}
+
 // Honesty is what the view is not showing, always displayed in the header.
 type Honesty struct {
 	ParseErrors       []ir.ParseError `json:"parseErrors"`
diff --git a/internal/serve/live.go b/internal/serve/live.go
index 5776b3e..06e3a9c 100644
--- a/internal/serve/live.go
+++ b/internal/serve/live.go
@@ -8,13 +8,15 @@ import (
 )
 
 // Hub holds what zu serve's watch last built (13): the latest View, its
-// generation, and a notice for the page, and wakes every open stream when
-// one changes. Safe for concurrent use.
+// generation, a notice for the page, and (19) how many rescans published no
+// View, and wakes every open stream when one changes. Safe for concurrent
+// use.
 type Hub struct {
 	mu     sync.Mutex
 	view   []byte
 	gen    uint64
 	notice string
+	source uint64 // rescans that published no View
 	subs   map[chan struct{}]bool
 	closed bool
 }
@@ -30,9 +32,12 @@ func (h *Hub) Publish(view []byte) {
 	h.set(func() { h.view, h.gen, h.notice = view, h.gen+1, "" })
 }
 
-// Notify sets the notice the page shows over its drawing; "" clears it.
-func (h *Hub) Notify(text string) {
-	h.set(func() { h.notice = text })
+// Keep says the watch rescanned and publishes no View (19): the View is the
+// same, the rescan failed, or a file no longer parses. The page shows text
+// over its drawing ("" clears it) and reads the files it shows again: a save
+// can change a file's text and not the View.
+func (h *Hub) Keep(text string) {
+	h.set(func() { h.notice, h.source = text, h.source+1 })
 }
 
 // Latest returns the latest View, its generation and the notice.
@@ -89,8 +94,9 @@ func (h *Hub) subscribe() (<-chan struct{}, func()) {
 }
 
 // stream is GET /events: Server-Sent Events, "view" with the latest
-// generation and "notice" with the notice, each sent at once and again
-// whenever it changes.
+// generation, "notice" with the notice and (19) "source" with the count of
+// rescans that published no View, each sent at once and again whenever it
+// changes.
 func (h *Hub) stream(w http.ResponseWriter, r *http.Request) {
 	fl, ok := w.(http.Flusher)
 	if !ok {
@@ -105,9 +111,12 @@ func (h *Hub) stream(w http.ResponseWriter, r *http.Request) {
 	wake, stop := h.subscribe()
 	defer stop()
 	var sentGen uint64
-	sentNotice := "\x00" // never a notice, so the first is sent
+	sentNotice := "\x00"     // never a notice, so the first is sent
+	sentSource := ^uint64(0) // never a count, so the first is sent
 	for {
-		_, gen, notice := h.Latest()
+		h.mu.Lock()
+		gen, notice, source := h.gen, h.notice, h.source
+		h.mu.Unlock()
 		if gen != sentGen {
 			fmt.Fprintf(w, "event: view\ndata: %d\n\n", gen)
 			sentGen = gen
@@ -116,6 +125,10 @@ func (h *Hub) stream(w http.ResponseWriter, r *http.Request) {
 			fmt.Fprintf(w, "event: notice\ndata: %s\n\n", strings.Join(strings.Fields(notice), " "))
 			sentNotice = notice
 		}
+		if source != sentSource {
+			fmt.Fprintf(w, "event: source\ndata: %d\n\n", source)
+			sentSource = source
+		}
 		fl.Flush()
 		select {
 		case <-r.Context().Done():
diff --git a/internal/serve/serve.go b/internal/serve/serve.go
index 4704b8e..844f62e 100644
--- a/internal/serve/serve.go
+++ b/internal/serve/serve.go
@@ -1,13 +1,14 @@
 // Package serve is zu's local web server (10): the page the HTML Export
-// uses and the View it draws, to this machine only. It serves no file by
-// path and accepts no writes; source reaches the page only inside the View,
-// read through the scan's Tree.
+// uses and the View it draws, to this machine only. It accepts no writes.
+// Source reaches the page inside the View, or (19) at /source, one file the
+// scan declares something in at a time.
 package serve
 
 import (
 	"context"
 	"errors"
 	"fmt"
+	"io/fs"
 	"net"
 	"net/http"
 	"strconv"
@@ -83,13 +84,17 @@ type Views struct {
 	// Hub, when set, is the watch's latest View (13): GET /view.json?latest
 	// answers it without a rescan, and GET /events streams its changes.
 	Hub *Hub
+	// Source, when set, reads one file for the page (19): GET /source?path=
+	// answers the JSON of an export.SourceFile, and fs.ErrNotExist a 404.
+	Source func(path string) ([]byte, error)
 }
 
 // Handler serves page at /; at /view.json, the View JSON that v.Scan builds
-// for each request, or with ?latest v.Hub's; and at /events, v.Hub's
-// changes. It answers only requests whose Host names this machine, which
-// defeats DNS rebinding, and serves the View and its changes only to its own
-// page: a request another site's page makes is refused before any scan.
+// for each request, or with ?latest v.Hub's; at /events, v.Hub's changes;
+// and at /source, a file v.Source reads. It answers only requests whose Host
+// names this machine, which defeats DNS rebinding, and serves the rest only
+// to its own page: a request another site's page makes is refused before
+// any scan or read.
 func Handler(page []byte, v Views) http.Handler {
 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
 		h := w.Header()
@@ -106,12 +111,23 @@ func Handler(page []byte, v Views) http.Handler {
 		case r.URL.Path == "/":
 			h.Set("Content-Type", "text/html; charset=utf-8")
 			_, _ = w.Write(page)
-		case r.URL.Path != "/view.json" && (r.URL.Path != "/events" || v.Hub == nil):
+		case r.URL.Path != "/view.json" && (r.URL.Path != "/events" || v.Hub == nil) && (r.URL.Path != "/source" || v.Source == nil):
 			http.NotFound(w, r)
 		case crossSite(r):
 			http.Error(w, "zu serve sends the View only to its own page", http.StatusForbidden)
 		case r.URL.Path == "/events":
 			v.Hub.stream(w, r)
+		case r.URL.Path == "/source":
+			data, err := v.Source(r.URL.Query().Get("path"))
+			switch {
+			case errors.Is(err, fs.ErrNotExist):
+				http.NotFound(w, r)
+			case err != nil:
+				http.Error(w, err.Error(), http.StatusInternalServerError)
+			default:
+				h.Set("Content-Type", "application/json")
+				_, _ = w.Write(data)
+			}
 		default:
 			var data []byte
 			var gen uint64
```

- [x] **Run:** `go test ./... && cd web && npx vitest run && npm run typecheck` Expected: PASS

- [x] **Commit:** `Draw every package in zu serve and send its source on demand`

---

### Task 3: The Code panel colours Go and reads source from zu serve (`code.ts`, `Panel.tsx`)

The unit tests check:
- `paint` on the golden's `store.go`, cut into lines: the segments join back to the file; line 2 is `package` (kw) then ` store`; line 1 is one comment; line 5 is a tab then a string;
- `paint` counts UTF-16 columns as `TestSyntax` does, cuts runs to their line, skips a run behind another or of an unknown class, and draws a line with no runs plain;
- `around` is every line of a file of at most `size` lines, else `size` lines centred on the line and held inside the file, `CODE_LINES` by default;
- `inline` is the View's file with its syntax, or null;
- `reader` reads each file once (the same promise twice), and a new reader reads it again;
- `fetchSource` asks `source?path=internal%2Fstore%2Fstore.go` with `no-store`, returns the file, and is null on a 404, a 500, and a failed fetch;
- `follow` calls `reread` for each `source` count after the first, but not for a count it has seen, and once for the first count after the stream dropped and after the page was hidden; and once for a newer generation whose View is the one drawn;
- each Go colour reads at 4.5:1 on `--code-bg` and `--mark`, light and dark, and the CSS colours each class `paint` names.

`web/e2e/code.mjs` (new, `npm run accept-code`) runs in Chromium, Firefox and WebKit:
- **coloured:** on the shop's static page, `store.Repo.Get`'s panel marks line 43, `func (r *Repo) Get(`, whose first token is `func` in `kw`; the code has keywords, comments and strings coloured;
- **served:** `zu serve` on a copy of the shop, without `-include`, draws `store.Repo.Get`, and its panel shows the same coloured line. `checkout.Total`, a package `-include` would have left out, shows line 22, `func Total(`. The page asked `/source` for `store.go`, again after the redraw **kept** makes, and for `checkout.go`. The checks before it outlast the watch's first poll, so no count from that poll reads `store.go` a third time.
- **kept:** the code and the panel, scrolled to the top, stay there when a file saved elsewhere in the package redraws the page;
- **saved:** a comment saved at the end of line 46 of the served `store.go`, in `Repo.Get`, shows in its panel's code, and the page fetched no new View;
- **long:** a 6,010-line file written into the served copy: its last function's panel draws 5,000 lines, from line 1011, marks line 6009, and the note over them reads "Lines 1011–6010 of 6010.".

**Files:**
- Tests: `web/src/code.test.ts` (new), `web/src/data.test.ts`, `web/src/styles.test.ts`, `web/src/live.test.ts`, `web/e2e/code.mjs` (new), `web/e2e/package.json`
- Code: `web/src/code.ts` (new), `web/src/data.ts`, `web/src/Panel.tsx`, `web/src/live.ts`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`

**Steps:**

- [x] **Write the failing tests and browser checks**

```diff
diff --git a/web/e2e/code.mjs b/web/e2e/code.mjs
new file mode 100644
index 0000000..17dae7d
--- /dev/null
+++ b/web/e2e/code.mjs
@@ -0,0 +1,177 @@
+// Browser acceptance for the Code panel (19): Go coloured, and zu serve
+// without -include drawing every package, sending its source on demand,
+// keeping the code where the reader left it across a watch redraw, showing
+// a save the View does not show, and drawing a long file's lines around the
+// marked one.
+// Not part of make check: it needs browsers and a bin/zu built with the UI.
+// Run from web/e2e after `make build`: npm run accept-code.
+// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
+import { spawn } from "node:child_process";
+import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+import { chromium, firefox, webkit } from "playwright-core";
+
+const here = new URL(".", import.meta.url).pathname;
+const benign = (e) => e.message === "ResizeObserver loop completed with undelivered notifications."; // serve.mjs
+const dir = mkdtempSync(join(tmpdir(), "zu-code-"));
+const servers = [];
+process.on("exit", () => {
+  for (const s of servers) s.kill();
+  rmSync(dir, { recursive: true, force: true });
+});
+
+// page writes the shop's View into the built page, as zu scan -html does.
+const page = (() => {
+  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
+  const marker = '<script id="zu-data" type="application/json">{}</script>';
+  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
+  const v = readFileSync(join(here, "../../internal/export/testdata/shop.view.golden.json"), "utf8");
+  const f = join(dir, "shop.html");
+  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(JSON.parse(v)).replaceAll("<", "\\u003c"))));
+  return "file://" + f;
+})();
+
+// served: zu serve on a copy of the shop, without -include. Outside git its
+// watch rescans every file at its first poll, and a page drawn before then
+// reads its files once more: the parts before serve() outlast that poll, so
+// serve()'s page asks for store.go twice, not three times.
+const shop = join(dir, "shop");
+cpSync(join(here, "../../internal/scan/testdata/shop"), shop, { recursive: true });
+let log = "";
+const served = await new Promise((ok, fail) => {
+  const s = spawn(join(here, "../../bin/zu"), ["serve", shop, "-addr", "127.0.0.1:0"], { stdio: ["ignore", "pipe", "pipe"] });
+  servers.push(s);
+  s.stderr.on("data", (d) => (log += d));
+  s.stdout.once("data", (d) => ok(String(d).trim()));
+  s.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
+});
+
+const S = "example.com/shop/internal/store";
+const C = "example.com/shop/internal/checkout";
+const enc = encodeURIComponent;
+
+async function open(b, url) {
+  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
+  const errors = [];
+  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
+  const asked = [];
+  p.on("request", (r) => r.url().includes("/source?") && asked.push(new URL(r.url()).search));
+  await p.goto(url);
+  return { p, errors, asked };
+}
+// code is what the panel's code shows: its marked line, the first token of
+// that line and its class, and whether it colours keywords, comments and strings.
+const code = (p) => p.locator("aside.panel pre.source .hit").waitFor({ timeout: 30000 }).then(() => p.evaluate(() => {
+  const hit = document.querySelector("aside.panel pre.source .hit");
+  const first = hit.querySelector(".ln + span");
+  return {
+    hit: hit.textContent, first: [first?.textContent, first?.className],
+    kinds: ["kw", "com", "str"].map((c) => document.querySelectorAll(`aside.panel pre.source .${c}`).length > 0),
+  };
+}));
+
+// tree: the tree's panel for a method, coloured.
+async function tree(b) {
+  const { p, errors } = await open(b, `${page}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
+  const got = {};
+  const first = await code(p);
+  got.coloured = [first.hit.startsWith("43func (r *Repo) Get("), first.first, first.kinds];
+  await p.close();
+  return { got, errors };
+}
+
+// serve: zu serve without -include draws every package's declarations and
+// sends each file's source when its panel opens.
+async function serve(b) {
+  const { p, errors, asked } = await open(b, `${served}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
+  const got = {};
+  const first = await code(p);
+  // 13: a save elsewhere redraws in place. The page reads store.go again, and
+  // the code and the panel stay where the reader scrolled them: to the top.
+  const scrolls = () => p.evaluate(() => [document.querySelector("aside.panel pre.source").scrollTop, document.querySelector("aside.panel").scrollTop]);
+  const opened = await scrolls();
+  await p.evaluate(() => {
+    document.querySelector("aside.panel pre.source").scrollTop = 0;
+    document.querySelector("aside.panel").scrollTop = 0;
+  });
+  const name = b.browserType().name(); // the engines share the copy
+  writeFileSync(join(shop, "internal", "store", `kept${name}.go`), `package store\n\nfunc Kept${name}() {}\n`);
+  await p.locator(`.react-flow__node[data-id="${S}.Kept${name}"]`).waitFor({ timeout: 15000 });
+  await p.waitForTimeout(300);
+  got.kept = [opened[0] + opened[1] > 0, await scrolls()];
+  await p.goto(`${served}#f=${enc(C)}&s=${enc(`${C}.Total`)}`);
+  const total = await code(p);
+  got.served = [first.hit.startsWith("43func (r *Repo) Get("), first.first, total.hit.startsWith("22func Total("), asked];
+  await p.close();
+  return { got, errors };
+}
+
+// saved: a save the View does not show, here a comment, publishes no View;
+// the page reads the file again, and its code shows the save.
+async function saved(b) {
+  const { p, errors } = await open(b, `${served}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
+  await code(p);
+  const latest = [];
+  p.on("request", (r) => r.url().includes("view.json?latest") && latest.push(r.url()));
+  const name = b.browserType().name(); // the engines share the copy
+  const f = join(shop, "internal", "store", "store.go");
+  writeFileSync(f, readFileSync(f, "utf8").replace(/\to := r\.cache\[id\].*\n/, `\to := r.cache[id] // saved by ${name}\n`));
+  const shown = await p.locator("aside.panel pre.source", { hasText: `saved by ${name}` }).waitFor({ timeout: 15000 }).then(() => true, () => false);
+  await p.close();
+  return { got: { saved: [shown, latest.length] }, errors };
+}
+
+// longGo is a file longer than the panel draws (Code, CODE_LINES 5000), of
+// 6010 lines: Long's body runs from line 3 to 6006, longB is on line 6009.
+const longGo = (n) => `package store\n\nfunc Long${n}() {\n\tlongA${n}()\n${"\n".repeat(6000)}\tlongB${n}()\n}\n\nfunc longA${n}() {}\nfunc longB${n}() {}\n`;
+// drawn is what the panel's code draws: how many lines, the first one's
+// number, the marked line, and the note on which lines they are.
+const drawn = (p) => p.evaluate(() => {
+  const pre = document.querySelector("aside.panel pre.source");
+  return {
+    n: pre.children.length, first: pre.querySelector(".ln").textContent, hit: pre.querySelector(".hit")?.textContent ?? null,
+    note: document.querySelector("aside.panel .window-note")?.textContent ?? null,
+  };
+});
+
+// long: of a long file the panel draws the lines around the marked one, and
+// says which.
+async function long(b) {
+  const { p, errors } = await open(b, `${served}#f=${enc(S)}`);
+  const got = {};
+  await p.locator(".react-flow__node").first().waitFor({ timeout: 15000 });
+  const name = b.browserType().name(); // the engines share the copy
+  writeFileSync(join(shop, "internal", "store", `long${name}.go`), longGo(name));
+  await p.locator(`.react-flow__node[data-id="${S}.longB${name}"]`).waitFor({ timeout: 15000 });
+  await p.goto(`${served}#f=${enc(S)}&s=${enc(`${S}.longB${name}`)}`);
+  await p.locator("aside.panel pre.source .hit").waitFor({ timeout: 30000 });
+  const end = await drawn(p);
+  got.long = [end.n, end.first, end.hit.startsWith(`6009func longB${name}()`), end.note];
+  await p.close();
+  return { got, errors };
+}
+
+const want = {
+  coloured: [true, ["func", "kw"], [true, true, true]],
+  served: [true, ["func", "kw"], true, ["?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fcheckout%2Fcheckout.go"]],
+  kept: [true, [0, 0]],
+  saved: [true, 0],
+  long: [5000, "1011", true, "Lines 1011–6010 of 6010."],
+  errors: [],
+};
+const channel = process.env.ZU_E2E_CHANNEL;
+const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
+let failed = 0;
+for (const [name, type, opts] of engines) {
+  const b = await type.launch(opts);
+  const got = await (async () => {
+    const parts = [await tree(b), await serve(b), await saved(b), await long(b)];
+    return { ...Object.assign({}, ...parts.map((x) => x.got)), errors: parts.flatMap((x) => x.errors) };
+  })().catch((e) => ({ errors: [String(e.message ?? e).split("\n")[0]] })).finally(() => b.close().catch(() => {}));
+  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
+  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
+  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
+  failed += bad.length;
+}
+process.exit(failed ? 1 : 0);
diff --git a/web/e2e/package.json b/web/e2e/package.json
index b56b466..25ba7b1 100644
--- a/web/e2e/package.json
+++ b/web/e2e/package.json
@@ -7,7 +7,8 @@
     "accept": "node accept.mjs",
     "accept-serve": "node serve.mjs",
     "accept-place": "node place.mjs",
-    "accept-screen": "node screen.mjs"
+    "accept-screen": "node screen.mjs",
+    "accept-code": "node code.mjs"
   },
   "devDependencies": {
     "playwright-core": "1.63.0"
diff --git a/web/src/code.test.ts b/web/src/code.test.ts
new file mode 100644
index 0000000..e21b936
--- /dev/null
+++ b/web/src/code.test.ts
@@ -0,0 +1,72 @@
+import { describe, expect, it } from "vitest";
+import golden from "../../internal/export/testdata/shop.view.golden.json";
+import type { SourceFile, View } from "./data";
+import { around, CODE_LINES, inline, paint, reader } from "./code";
+
+const shop = golden as unknown as View;
+const P = "internal/store/store.go";
+
+describe("paint (19)", () => {
+  it("cuts each line into the runs zu coloured, losing no text", () => {
+    const lines = paint(shop.sources[P].split("\n"), shop.syntax![P]);
+    expect(lines.length).toBe(shop.sources[P].split("\n").length);
+    expect(lines.map((l) => l.map((s) => s.text).join("")).join("\n")).toBe(shop.sources[P]);
+    expect(lines[1]).toEqual([{ text: "package", cls: "kw" }, { text: " store" }]);
+    expect(lines[0]).toEqual([{ text: "// Package store keeps orders.", cls: "com" }]);
+    expect(lines[4]).toEqual([{ text: "\t" }, { text: '"database/sql"', cls: "str" }]);
+  });
+  it("counts columns in UTF-16 units, as export.Syntax does", () => {
+    expect(paint(['x := "é😀" // ไทย', "func"], [[5, 5, 3, 11, 6, 2], [0, 4, 1]])).toEqual([
+      [{ text: "x := " }, { text: '"é😀"', cls: "str" }, { text: " " }, { text: "// ไทย", cls: "com" }],
+      [{ text: "func", cls: "kw" }],
+    ]);
+    expect(paint(["n := 0x1F"], [[5, 4, 4]])).toEqual([[{ text: "n := " }, { text: "0x1F", cls: "num" }]]);
+  });
+  it("draws text plain where it has no runs, and cuts runs to their line", () => {
+    expect(paint(["a", "b"], [])).toEqual([[{ text: "a" }], [{ text: "b" }]]);
+    expect(paint(["a", "b"], [[0, 1, 1]])).toEqual([[{ text: "a", cls: "kw" }], [{ text: "b" }]]);
+    expect(paint(["ab"], [[1, 9, 2, 0, 1, 1, 5, 1, 1]])).toEqual([[{ text: "a" }, { text: "b", cls: "com" }]]);
+    expect(paint(["ab"], [[0, 1, 9]])).toEqual([[{ text: "ab" }]]); // a class this page does not know
+  });
+});
+
+describe("around (19)", () => {
+  it("is every line of a file that fits", () => {
+    expect(around(3, 2, 5)).toEqual([0, 3]);
+    expect(around(5, 5, 5)).toEqual([0, 5]);
+  });
+  it("centres size lines on the line, held inside the file", () => {
+    expect(around(100, 50, 10)).toEqual([44, 54]);
+    expect(around(100, 2, 10)).toEqual([0, 10]);
+    expect(around(100, 100, 10)).toEqual([90, 100]);
+  });
+  it("draws CODE_LINES of a longer file", () => {
+    expect(around(CODE_LINES + 1, CODE_LINES + 1)).toEqual([1, CODE_LINES + 1]);
+  });
+});
+
+describe("inline (19)", () => {
+  it("is a file the View carries, with its colour", () => {
+    expect(inline(shop, P)).toEqual({ path: P, text: shop.sources[P], syntax: shop.syntax![P] });
+  });
+  it("is null for a file the View does not carry", () => {
+    expect(inline(shop, "main.go")).toBeNull();
+  });
+});
+
+describe("reader (19)", () => {
+  it("reads each file once, and a new reader reads it again", async () => {
+    const asked: string[] = [];
+    const get = async (path: string): Promise<SourceFile | null> => {
+      asked.push(path);
+      return path === "gone.go" ? null : { path, text: "package a\n", syntax: [[0, 7, 1], []] };
+    };
+    const read = reader(get);
+    const [a, b] = [read("a.go"), read("a.go")];
+    expect(a).toBe(b);
+    expect((await a)?.text).toBe("package a\n");
+    expect(await read("gone.go")).toBeNull();
+    await reader(get)("a.go");
+    expect(asked).toEqual(["a.go", "gone.go", "a.go"]);
+  });
+});
diff --git a/web/src/data.test.ts b/web/src/data.test.ts
index 1021780..2edd665 100644
--- a/web/src/data.test.ts
+++ b/web/src/data.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
-import { fetchView, parseView, readEmbedded, type View } from "./data";
+import { fetchSource, fetchView, parseView, readEmbedded, type View } from "./data";
 
 describe("parseView", () => {
   it("refuses a schema it does not know", () => {
@@ -51,3 +51,20 @@ describe("fetchView", () => {
     await expect(fetchView(answer(200, '{"schema":"2"}'))).rejects.toThrow(/schema 2/);
   });
 });
+
+describe("fetchSource (19)", () => {
+  const P = "internal/store/store.go";
+  const file = { path: P, text: "package store\n", syntax: [[0, 7, 1], []] };
+  const answer = (status: number, body: string) => async (url: RequestInfo | URL, init?: RequestInit) => {
+    expect([url, init?.cache]).toEqual(["source?path=internal%2Fstore%2Fstore.go", "no-store"]);
+    return new Response(body, { status });
+  };
+  it("reads a file zu serve sends on demand, with its colour", async () => {
+    expect(await fetchSource(P, answer(200, JSON.stringify(file)))).toEqual(file);
+  });
+  it("is null for a file zu serve does not send or cannot read, and when zu serve is gone", async () => {
+    expect(await fetchSource(P, answer(404, "404 page not found\n"))).toBeNull();
+    expect(await fetchSource(P, answer(500, "zu serve: read failed\n"))).toBeNull();
+    expect(await fetchSource(P, async () => Promise.reject(new TypeError("Failed to fetch")))).toBeNull();
+  });
+});
diff --git a/web/src/live.test.ts b/web/src/live.test.ts
index e0250ae..6e7ec9d 100644
--- a/web/src/live.test.ts
+++ b/web/src/live.test.ts
@@ -58,9 +58,10 @@ function run(answers: [number, string][], first = { text: view("a"), gen: 0 }) {
   const l = latest(answers);
   const shown: string[] = [];
   const said: string[] = [];
+  const reads = { n: 0 };
   const doc = page();
-  const stop = follow(open, l.load, first, (v) => shown.push(v.tool), (t) => void said.push(t), doc);
-  return { s: streams[0], streams, doc, l, shown, said, stop };
+  const stop = follow(open, l.load, first, (v) => shown.push(v.tool), (t) => void said.push(t), doc, () => void reads.n++);
+  return { s: streams[0], streams, doc, l, shown, said, reads, stop };
 }
 
 describe("follow", () => {
@@ -153,6 +154,40 @@ describe("follow", () => {
     await tick();
     expect([r.l.asked, r.shown]).toEqual([[3], ["b"]]);
   });
+  // 19: a save can change a file the page shows and not the View.
+  it("reads the files again for each rescan that publishes no View", () => {
+    const r = run([]);
+    r.s.send("open");
+    r.s.send("source", "4"); // the page load read them: as new as this
+    r.s.send("source", "5");
+    r.s.send("source", "5");
+    r.s.send("source", "6");
+    expect(r.reads.n).toBe(2);
+  });
+  // A page load can draw a View the watch has not published yet. A save the
+  // View does not show, before the watch's next poll, then publishes that
+  // View, and no count moves.
+  it("reads the files again for a newer generation whose View is the one drawn", async () => {
+    const r = run([[2, view("a")]]);
+    r.s.send("view", "2");
+    await tick();
+    expect([r.l.asked, r.shown, r.reads.n]).toEqual([[2], [], 1]);
+  });
+  it("reads the files again once after the stream dropped, and once after the page was hidden", () => {
+    const r = run([]);
+    r.s.send("source", "2");
+    r.s.readyState = 0;
+    r.s.send("error");
+    r.s.readyState = 1;
+    r.s.send("open");
+    r.s.send("source", "2"); // the count it read at, or a restarted zu serve's
+    r.s.send("source", "2");
+    r.doc.set(true);
+    r.doc.set(false);
+    r.streams[1].send("open");
+    r.streams[1].send("source", "2");
+    expect(r.reads.n).toBe(2);
+  });
   it("opens no second stream for a page shown twice", () => {
     const r = run([]);
     r.doc.set(false);
diff --git a/web/src/styles.test.ts b/web/src/styles.test.ts
index 0ad650c..6a437e3 100644
--- a/web/src/styles.test.ts
+++ b/web/src/styles.test.ts
@@ -68,3 +68,23 @@ describe.each([["light", light], ["dark", dark]])("CRAP fills, %s", (_, t) => {
     expect(near).toEqual([]);
   });
 });
+
+// 19: the Code panel colours Go (code.ts CLASS); each colour reads as text on
+// the code's background and on the declaration's marked line.
+describe.each([["light", light], ["dark", dark]])("Go colours, %s", (_, t) => {
+  it("keep text at 4.5:1 on the code and its marked line", () => {
+    const low: string[] = [];
+    for (const k of ["syn-kw", "syn-com", "syn-str", "syn-num", "fg"]) {
+      for (const bg of ["code-bg", "mark"]) {
+        if (!t[k] || contrast(t[k], t[bg]) < 4.5) low.push(`${k} on ${bg} ${t[k] ? contrast(t[k], t[bg]).toFixed(2) : "missing"}`);
+      }
+    }
+    expect(low).toEqual([]);
+  });
+});
+
+describe("Go colours' rules (19)", () => {
+  it("colour each class code.ts paints", () => {
+    for (const c of ["kw", "com", "str", "num"]) expect(css).toMatch(new RegExp(`\\.source \\.${c} \\{[^}]*color: var\\(--syn-${c}\\)`));
+  });
+});
```

- [x] **Run:** `cd web && npx vitest run src/code.test.ts src/data.test.ts src/styles.test.ts src/live.test.ts` Expected: FAIL (`./code` does not exist; `fetchSource` is not a function; no `--syn-*` colour or rule; `follow` never calls `reread`)

- [x] **Run:** `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node code.mjs` Expected: FAIL (0/6 checks in each engine: in `zu serve` the panel reads no `/source`, so the wait for its code times out after 30 s and the run stops. `tsc` fails on the red unit tests, so this step builds with `vite build`, which skips it)

- [x] **Colour the code, and read it from zu serve**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 51c26bf..dadcd39 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -2,6 +2,7 @@ import { useEffect, useMemo, useRef, useState } from "react";
 import { ReactFlowProvider } from "@xyflow/react";
 import { Canvas } from "./Canvas";
 import { changedSubgraph, nodeMark } from "./change";
+import type { Read } from "./code";
 import { home, index, isBox, upTo } from "./cut";
 import type { View } from "./data";
 import { isGroup } from "./group";
@@ -123,7 +124,8 @@ function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => voi
 // Drawing is a finished layout and what it was made for.
 type Drawing = { whole: View; view: View; sc: Scene; graph: string; base: string; at: Map<string, Placed> };
 
-export function App({ view: whole }: { view: View }) {
+// read gives the source the View does not carry, from zu serve (19).
+export function App({ view: whole, read }: { view: View; read?: Read }) {
   const change = whole.kind === "change";
   const [state, update] = useViewState(whole);
   // 07: a chosen Proposal replaces the Package Tree everywhere a tree is read.
@@ -481,6 +483,7 @@ export function App({ view: whole }: { view: View }) {
           id={isBox(proposed, centre + PKG) ? centre + PKG : centre}
           edge={null}
           bundles={[]}
+          read={read}
           onReveal={recentre}
           onClose={() => setClosed(centre)}
         />
@@ -494,6 +497,7 @@ export function App({ view: whole }: { view: View }) {
           hidden={sc.nodes.find((n) => n.id === sc.selected)?.hidden}
           crap={sc.nodes.find((n) => n.id === sc.selected)?.crap?.risk}
           ownTier={sc.nodes.find((n) => n.id === sc.selected)?.ownTier}
+          read={read}
           onReveal={jump}
           onClose={() => choose(null)}
         />
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index 26d277e..f4b4824 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -1,6 +1,7 @@
-import { useEffect, useRef } from "react";
+import { useEffect, useMemo, useRef, useState } from "react";
 import type { Bundle } from "./bundle";
-import type { Hunk, Loc, View, ViewEdge, ViewNode } from "./data";
+import { around, inline, paint, type Read } from "./code";
+import type { Hunk, Loc, SourceFile, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, targets, type Row } from "./facts";
 import { isGroup, isStrip, rankNote } from "./group";
 import { diffLink, fileDiffLink, linkFor } from "./links";
@@ -20,6 +21,7 @@ type Props = {
   hidden?: ViewEdge[]; // 07: violating imports inside the selected box, drawn as no line
   crap?: Risk; // 08: the selected box's CRAP as the scene rolled it up
   ownTier?: number; // 12: the selected box's rank before the row cap merged its row
+  read?: Read; // 19: the source the View does not carry, from zu serve
   onReveal: (id: string) => void;
   onClose: () => void;
 };
@@ -147,24 +149,62 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
   );
 }
 
-// Source renders file text as React text children only: never parsed as markup.
-function Source({ text, line }: { text: string; line: number }) {
+// Code renders file text as React text children only, never parsed as
+// markup, coloured as zu coloured it (19, code.ts), the line marked. Of a
+// file longer than CODE_LINES it draws those around the marked line, and
+// says which.
+function Code({ file, line }: { file: SourceFile; line: number }) {
   const mark = useRef<HTMLDivElement>(null);
+  // Each View brings its files as new objects (13): cut, paint and scroll
+  // only when the text or the marked line changes, so a redraw leaves the
+  // code where the reader scrolled it. The colour is the text's
+  // (export.Syntax), whose lines are cut as these are.
+  const all = useMemo(() => file.text.split("\n"), [file.text]);
+  const [from, to] = around(all.length, line);
+  const lines = useMemo(() => paint(all.slice(from, to), file.syntax.slice(from, to)), [all, from, to]);
   useEffect(() => {
     mark.current?.scrollIntoView({ block: "center" });
-  }, [text, line]);
+  }, [file.path, file.text, line]);
   return (
-    <pre className="source">
-      {text.split("\n").map((l, i) => (
-        <div key={i} ref={i + 1 === line ? mark : undefined} className={i + 1 === line ? "hit" : undefined}>
-          <span className="ln">{i + 1}</span>
-          {l}
-        </div>
-      ))}
-    </pre>
+    <>
+      {to - from < all.length && <p className="muted window-note">{`Lines ${from + 1}–${to} of ${all.length}.`}</p>}
+      <pre className="source">
+        {lines.map((segs, k) => {
+          const i = from + k + 1; // its line
+          return (
+            <div key={i} ref={i === line ? mark : undefined} className={i === line ? "hit" : undefined}>
+              <span className="ln">{i}</span>
+              {segs.map((s, j) => (
+                <span key={j} className={s.cls}>
+                  {s.text}
+                </span>
+              ))}
+            </div>
+          );
+        })}
+      </pre>
+    </>
   );
 }
 
+// Source is the code of the file loc is in: the View's, or (19) read from zu
+// serve, the last file read kept while the next comes. It draws nothing while
+// neither has the file.
+function Source({ view, loc, read }: { view: View; loc: Loc; read?: Read }) {
+  const own = useMemo(() => inline(view, loc.path), [view, loc.path]);
+  const [got, setGot] = useState<SourceFile | null>(null);
+  useEffect(() => {
+    if (own || !read) return;
+    let on = true;
+    read(loc.path).then((f) => on && setGot(f));
+    return () => {
+      on = false;
+    };
+  }, [own, read, loc.path]);
+  const file = own ?? (got?.path === loc.path ? got : null);
+  return file && <Code file={file} line={loc.line} />;
+}
+
 // Members lists the IR edges a bundle carries, each with where it is written.
 function Members({ view, edge, onReveal }: { view: View; edge: SceneEdge; onReveal: (id: string) => void }) {
   return (
@@ -244,7 +284,7 @@ function Crap({ view, id, box, onReveal }: { view: View; id: string; box?: Risk;
   );
 }
 
-export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, onReveal, onClose }: Props) {
+export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, onReveal, onClose }: Props) {
   const title = edge ? `${edge.from} → ${edge.to}` : (id ?? "");
   const node = id === null ? undefined : view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
   let body: React.ReactNode;
@@ -268,7 +308,6 @@ export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, onReveal
     );
   } else if (node?.kind === "type" || node?.kind === "function") {
     const c = calls(view, node.id);
-    const text = view.sources[node.loc.path];
     body = (
       <>
         <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
@@ -276,7 +315,7 @@ export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, onReveal
         <Change view={view} node={node} />
         <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} />
         <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} />
-        {text !== undefined && node.status !== "removed" && <Source text={text} line={node.loc.line} />}
+        {node.status !== "removed" && <Source view={view} loc={node.loc} read={read} />}
       </>
     );
   } else if (node?.kind === "external") {
diff --git a/web/src/code.ts b/web/src/code.ts
new file mode 100644
index 0000000..2e1306e
--- /dev/null
+++ b/web/src/code.ts
@@ -0,0 +1,67 @@
+// 19: the Code panel's text. zu colours Go in Go (export.Syntax, go/scanner);
+// the page only cuts each line into those runs and draws them as React text,
+// never as markup.
+import type { SourceFile, View } from "./data";
+
+// Seg is a run of one line's text, coloured by cls when zu coloured it.
+export type Seg = { text: string; cls?: string };
+
+// CLASS names export.Syntax's classes by number (internal/export/syntax.go).
+const CLASS = ["", "kw", "com", "str", "num"];
+
+// paint cuts each of lines into segments by its runs, runs[i] being
+// lines[i]'s: [column, length, class] flat, in UTF-16 units as JavaScript
+// strings count. A run behind an earlier one or of a class this page does not
+// know draws nothing coloured; one past its line is cut to it.
+export function paint(lines: string[], runs: number[][]): Seg[][] {
+  return lines.map((line, i) => {
+    const r = runs[i] ?? [];
+    const out: Seg[] = [];
+    let at = 0;
+    for (let k = 0; k + 2 < r.length; k += 3) {
+      const [col, cls] = [r[k], CLASS[r[k + 2]]];
+      const end = Math.min(col + r[k + 1], line.length);
+      if (col < at || end <= col || !cls) continue;
+      if (col > at) out.push({ text: line.slice(at, col) });
+      out.push({ text: line.slice(col, end), cls });
+      at = end;
+    }
+    if (at < line.length || out.length === 0) out.push({ text: line.slice(at) });
+    return out;
+  });
+}
+
+// CODE_LINES is the most lines Code draws of a file. A longer one, most
+// often generated, would take seconds to draw whole: Code draws the lines
+// around the marked one, and says which.
+export const CODE_LINES = 5000;
+
+// around is the lines Code draws of a file of n, [from, to) counted from 0:
+// every one when n is at most size, else size of them centred on line at
+// (counted from 1) and held inside the file.
+export function around(n: number, at: number, size = CODE_LINES): [number, number] {
+  if (n <= size) return [0, n];
+  const from = Math.min(Math.max(at - 1 - Math.floor(size / 2), 0), n - size);
+  return [from, from + size];
+}
+
+// inline is a file the View carries (zu scan -html, zu serve -include), with
+// its colour, or null.
+export function inline(view: View, path: string): SourceFile | null {
+  const text = view.sources[path];
+  return text === undefined ? null : { path, text, syntax: view.syntax?.[path] ?? [] };
+}
+
+// Read gives a file zu serve sends on demand (19), or null.
+export type Read = (path: string) => Promise<SourceFile | null>;
+
+// reader reads each file once. The page makes one per View zu serve sends
+// (main.tsx), so a file is read again after a save.
+export function reader(get: Read): Read {
+  const got = new Map<string, Promise<SourceFile | null>>();
+  return (path) => {
+    let p = got.get(path);
+    if (!p) got.set(path, (p = get(path)));
+    return p;
+  };
+}
diff --git a/web/src/data.ts b/web/src/data.ts
index 846ec9b..3198a26 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -93,3 +93,19 @@ export async function fetchView(get: typeof fetch = fetch): Promise<Loaded> {
 
 // Loaded is a View zu serve sent, with its text and generation (0 without a watch).
 export type Loaded = { view: View; text: string; gen: number };
+
+// SourceFile is a file zu serve sends on demand (19), as export.SourceFile:
+// its text and colour.
+export type SourceFile = { path: string; text: string; syntax: number[][] };
+
+// fetchSource asks zu serve for a file the View declares something in (19).
+// It is null when zu serve sends no such file, cannot read it, or is gone:
+// the panel then draws no code, as for a file the page does not carry.
+export async function fetchSource(path: string, get: typeof fetch = fetch): Promise<SourceFile | null> {
+  try {
+    const r = await get(`source?path=${encodeURIComponent(path)}`, { cache: "no-store" });
+    return r.ok ? ((await r.json()) as SourceFile) : null;
+  } catch {
+    return null;
+  }
+}
diff --git a/web/src/live.ts b/web/src/live.ts
index fc42c7a..81b4981 100644
--- a/web/src/live.ts
+++ b/web/src/live.ts
@@ -1,12 +1,13 @@
 // The page's side of zu serve's watch (13): /events says a newer View exists,
-// or a notice for the reader; the page fetches view.json?latest and draws it
-// in place, keeping its view state. Every View it draws came from zu.
+// or a notice for the reader, or (19) that a rescan published no View; the
+// page fetches view.json?latest and draws it in place, keeping its view
+// state. Every View it draws came from zu.
 import { parseView, type View } from "./data";
 
 // Stream is what follow needs of an EventSource.
 export type Stream = {
   readonly readyState: number; // 0 reconnecting, 1 open, 2 closed for good
-  addEventListener(type: "open" | "error" | "view" | "notice", fn: (e: { data?: unknown }) => void): void;
+  addEventListener(type: "open" | "error" | "view" | "notice" | "source", fn: (e: { data?: unknown }) => void): void;
   close(): void;
 };
 
@@ -29,8 +30,12 @@ const CLOSED = 2;
 // cannot read keeps the drawing and is said instead. While doc is hidden
 // the stream is closed, so hidden tabs hold none of the browser's few
 // connections to zu serve; shown again, a new stream fetches the latest
-// View once, and its text decides whether to draw. It returns a function
-// that stops.
+// View once, and its text decides whether to draw. 19: each rescan that
+// publishes no View calls reread, as a save can change a file the page
+// shows and not the View; so does the first count after the stream dropped
+// or the page was hidden, and a newer View whose text is the one drawn: a
+// page load drew it before the watch published it, and a save since may
+// have changed a file alone. It returns a function that stops.
 export function follow(
   open: () => Stream,
   load: () => Promise<Response>,
@@ -38,6 +43,7 @@ export function follow(
   show: (v: View) => void,
   say: (text: string) => void,
   doc: Visibility,
+  reread: () => void,
 ): () => void {
   let text = first.text;
   // The page load rescans, so its View is at least as new as first.gen's: a
@@ -48,6 +54,11 @@ export function follow(
   let lost = false; // the stream dropped; it reconnects on its own
   let src: Stream | null = null; // null while the page is hidden
   let paused = false; // the page was hidden since the stream last opened
+  // The count of rescans that published no View the page's files are as new
+  // as: "" until the first, which the page load's reads are as new as; null
+  // after the stream dropped or the page was hidden, when what changed is
+  // unknown.
+  let readAt: string | null = "";
   const pull = async () => {
     busy = true;
     try {
@@ -59,6 +70,8 @@ export function follow(
         if (body !== text) {
           show(parseView(body));
           text = body;
+        } else {
+          reread();
         }
       }
     } catch (e) {
@@ -75,12 +88,20 @@ export function follow(
       if (!busy && wanted > drawn) void pull();
     });
     s.addEventListener("notice", (e) => say(String(e.data ?? "")));
+    s.addEventListener("source", (e) => {
+      const n = String(e.data ?? "");
+      if (readAt === null || (readAt !== "" && n !== readAt)) reread();
+      readAt = n;
+    });
     // zu serve sends its generation and notice on each connect. One that
     // restarted counts from 1 again, so after a drop the drawn generation
     // means nothing: the next one fetches, and its text decides whether to
     // draw.
     s.addEventListener("open", () => {
-      if (lost) drawn = 0;
+      if (lost) {
+        drawn = 0;
+        readAt = null;
+      }
       lost = false;
       say("");
     });
@@ -106,7 +127,10 @@ export function follow(
     if (src) return;
     // What changed while hidden is unknown, and zu serve may have restarted
     // and counted from 1 again: fetch the latest View once.
-    if (paused) drawn = 0;
+    if (paused) {
+      drawn = 0;
+      readAt = null;
+    }
     paused = false;
     src = connect();
   };
diff --git a/web/src/main.tsx b/web/src/main.tsx
index 5277896..8fb67aa 100644
--- a/web/src/main.tsx
+++ b/web/src/main.tsx
@@ -1,7 +1,8 @@
-import { StrictMode, useEffect, useState } from "react";
+import { StrictMode, useEffect, useMemo, useState } from "react";
 import { createRoot } from "react-dom/client";
 import { App } from "./App";
-import { fetchView, parseView, readEmbedded, type Loaded, type View } from "./data";
+import { reader } from "./code";
+import { fetchSource, fetchView, parseView, readEmbedded, type Loaded, type View } from "./data";
 import { follow } from "./live";
 import "./styles.css";
 
@@ -19,10 +20,14 @@ async function loadView(): Promise<Loaded | { view: View } | null> {
 // Live is a page zu serve sent (13): it draws each newer View zu serve's watch
 // builds, in place, and says what zu serve says over the drawing. Without a
 // watch (-poll 0) /events answers 404 and the page stays as it loaded. A
-// hidden page closes its stream and catches up when shown.
+// hidden page closes its stream and catches up when shown. 19: it reads the
+// source the View does not carry from zu serve, each file once per View and
+// again after each rescan that publishes no View.
 function Live({ first }: { first: Loaded }) {
   const [view, setView] = useState(first.view);
   const [notice, setNotice] = useState("");
+  const [reads, setReads] = useState(0);
+  const read = useMemo(() => reader((path) => fetchSource(path)), [view, reads]);
   useEffect(
     () =>
       follow(
@@ -32,6 +37,7 @@ function Live({ first }: { first: Loaded }) {
         setView,
         setNotice,
         document,
+        () => setReads((n) => n + 1),
       ),
     [first],
   );
@@ -42,7 +48,7 @@ function Live({ first }: { first: Loaded }) {
           {notice}
         </div>
       )}
-      <App view={view} />
+      <App view={view} read={read} />
     </>
   );
 }
diff --git a/web/src/styles.css b/web/src/styles.css
index 58a51b7..ff5e9b2 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -23,6 +23,12 @@
   --crap-green: #c8f8c4;
   --crap-yellow: #f0e49c;
   --crap-red: #ffdcdc;
+  /* Go's colours in the Code panel (19): text at 4.5:1 on --code-bg and
+     --mark (styles.test.ts) */
+  --syn-kw: #6f42c1;
+  --syn-com: #57606a;
+  --syn-str: #0a3069;
+  --syn-num: #0550ae;
   font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
   color: var(--fg);
   background: var(--bg);
@@ -54,6 +60,10 @@
     --crap-green: #173b2c;
     --crap-yellow: #3e3814;
     --crap-red: #3b1d11;
+    --syn-kw: #d2a8ff;
+    --syn-com: #a8b1bb;
+    --syn-str: #a5d6ff;
+    --syn-num: #79c0ff;
   }
 }
 
@@ -376,6 +386,21 @@ pre {
   background: var(--mark);
 }
 
+/* 19: Go's colours, by the class code.ts paints */
+.source .kw {
+  color: var(--syn-kw);
+}
+.source .com {
+  color: var(--syn-com);
+  font-style: italic;
+}
+.source .str {
+  color: var(--syn-str);
+}
+.source .num {
+  color: var(--syn-num);
+}
+
 /* Change View (U9): status in the border and label colour, never colour alone:
    removed is struck through, moved is dashed, affected is an outline. Every
    status colour is at least 4.5:1 as text on --box, --bg and --code-bg, in
```

- [x] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [x] **Run:** `make build >/dev/null && cd web/e2e && node code.mjs` Expected: PASS (6 checks in each engine)

- [x] **Commit:** `Colour the Code panel and read its source from zu serve`

---

### Task 4: Pointing at a call lights its lines (`code.ts`, `screen.ts`, `Panel.tsx`, `ScreenCanvas.tsx`)

The unit tests check, on a View where `m.F` calls `m.G` at `a.go:4`, `a.go:9` and `b.go:2` and `m.T.M` at `a.go:6`, `m.T` embeds `m.E` at `t.go:3`, and the change removed F's call of `m.H`:
- `behind` lists every place by path and line, across files and over a set of ends (a type and its method); none for the removed call; none for an import;
- `litNote` words the places: "Lines 4, 9; in other files: b.go:2.", "Line 4.", "In other files: b.go:2, c.go:7.", eight and "and 2 more", the hint, and the removed call's note;
- `placesOf` on a Screen of `m.T`, whose method `M` is called by `m.F` at `a.go:3` and `a.go:7`: `up:m.F` and its line `up:m.F>` give both; `down:m.G` gives M's call at `b.go:5`; `>down:m.E` the embed at `t.go:2`; the Centre, `up:#more` and a package Screen give null;
- `centre` is the line drawn around while the lines drawn hold the first lit line, or none is lit, and else the first lit line;
- each Go colour reads at 4.5:1 on `--lit` too; `.source .lit` uses `--lit`; `.source` is `position: relative` and scrolls (`overflow: auto`).

`code.mjs` adds, in each engine:
- **coloured** also reads the hint over the code;
- **pointed:** pointing at the row `store.Repo.check` lights line 48, the note reads "Line 48.", and the panel did not scroll;
- **left:** moving the pointer off the row lights nothing;
- **focused:** focusing the row's link lights line 48;
- **back:** Enter follows the focused row to `Repo.check`; back at `Repo.Get` by the hash, with nothing pointed at, no line is lit and the hint shows;
- **other:** on `store.register`'s panel, pointing at the caller `store.init` lights nothing, and the note reads "In other files: internal/store/db_linux.go:7.";
- **screen:** on `store.Repo`'s Screen, the panel marks line 31, `type Repo struct`; pointing at the box `store.Open` lights line 58 (Reset calls Open there) with the note "Line 58."; moving off lights nothing; focusing the box lights 58 again, and so does pointing at the box's line;
- **served** also checks that pointing at `Repo.check` in `zu serve` lights line 48;
- **moved:** on the long file's `Long`, whose body runs from line 3 to 6006, the note reads "Lines 1–5000 of 6010.". Pointing at its call of `longB`, on line 6005, lights that line and moves the lines drawn to 1011–6010. Moving off lights nothing and leaves them there.

**Files:**
- Tests: `web/src/code.test.ts`, `web/src/screen.test.ts`, `web/src/styles.test.ts`, `web/e2e/code.mjs`
- Code: `web/src/code.ts`, `web/src/facts.ts`, `web/src/screen.ts`, `web/src/Panel.tsx`, `web/src/ScreenCanvas.tsx`, `web/src/App.tsx`, `web/src/styles.css`

**Steps:**

- [x] **Write the failing tests and browser checks**

```diff
diff --git a/web/e2e/code.mjs b/web/e2e/code.mjs
index 17dae7d..9a7fe8c 100644
--- a/web/e2e/code.mjs
+++ b/web/e2e/code.mjs
@@ -1,8 +1,9 @@
-// Browser acceptance for the Code panel (19): Go coloured, and zu serve
-// without -include drawing every package, sending its source on demand,
-// keeping the code where the reader left it across a watch redraw, showing
-// a save the View does not show, and drawing a long file's lines around the
-// marked one.
+// Browser acceptance for the Code panel (19): Go coloured, the lines behind
+// a pointed-at call or embed lit, in the tree's panel and the Screen's, and
+// zu serve without -include drawing every package, sending its source on
+// demand, keeping the code where the reader left it across a watch redraw,
+// showing a save the View does not show, and drawing a long file's lines
+// around the marked one, or the lit one.
 // Not part of make check: it needs browsers and a bin/zu built with the UI.
 // Run from web/e2e after `make build`: npm run accept-code.
 // ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
@@ -61,22 +62,79 @@ async function open(b, url) {
   return { p, errors, asked };
 }
 // code is what the panel's code shows: its marked line, the first token of
-// that line and its class, and whether it colours keywords, comments and strings.
+// that line and its class, the numbers of its lit lines, and the note over it.
 const code = (p) => p.locator("aside.panel pre.source .hit").waitFor({ timeout: 30000 }).then(() => p.evaluate(() => {
   const hit = document.querySelector("aside.panel pre.source .hit");
   const first = hit.querySelector(".ln + span");
   return {
     hit: hit.textContent, first: [first?.textContent, first?.className],
+    lit: [...document.querySelectorAll("aside.panel pre.source .lit .ln")].map((e) => e.textContent),
+    note: document.querySelector("aside.panel .lit-note")?.textContent ?? null,
     kinds: ["kw", "com", "str"].map((c) => document.querySelectorAll(`aside.panel pre.source .${c}`).length > 0),
   };
 }));
+const row = (p, title, id) => p.locator("aside.panel section", { has: p.locator(`h3:text-matches("^${title}")`) }).locator("li", { hasText: id });
+const settle = (p) => p.waitForTimeout(300);
+const HINT = "Point at a call or embed to light the lines it is written on.";
 
-// tree: the tree's panel for a method, coloured.
+// tree: the tree's panel for a method, coloured, its call lit by pointing and by focus.
 async function tree(b) {
   const { p, errors } = await open(b, `${page}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
   const got = {};
   const first = await code(p);
-  got.coloured = [first.hit.startsWith("43func (r *Repo) Get("), first.first, first.kinds];
+  got.coloured = [first.hit.startsWith("43func (r *Repo) Get("), first.first, first.kinds, first.note];
+  const aside = () => p.evaluate(() => document.querySelector("aside.panel").scrollTop);
+  const before = await aside();
+  await row(p, "Calls and embeds out", "Repo.check").hover();
+  await settle(p);
+  const pointed = await code(p);
+  got.pointed = [pointed.lit, pointed.note, (await aside()) === before];
+  await p.mouse.move(5, 5);
+  await settle(p);
+  got.left = (await code(p)).lit;
+  await row(p, "Calls and embeds out", "Repo.check").locator("button").focus();
+  await settle(p);
+  got.focused = (await code(p)).lit;
+  // Enter follows the row, which goes without a blur; back at Get, nothing
+  // is pointed at, so nothing is lit.
+  await p.keyboard.press("Enter");
+  await p.locator("aside.panel pre.source .hit", { hasText: /^51func/ }).waitFor({ timeout: 30000 });
+  await p.evaluate((h) => (location.hash = h), `#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
+  await p.locator("aside.panel pre.source .hit", { hasText: /^43func/ }).waitFor({ timeout: 30000 });
+  await settle(p);
+  const back = await code(p);
+  got.back = [back.lit, back.note];
+  // A caller in another file: listed, nothing lit here.
+  await p.goto(`${page}#f=${enc(S)}&s=${enc(`${S}.register`)}`);
+  await code(p);
+  await row(p, "Called or embedded by", `${S}.init`).hover();
+  await settle(p);
+  const other = await code(p);
+  got.other = [other.lit, other.note];
+  await p.close();
+  return { got, errors };
+}
+
+// screen: the Screen's panel lights the lines behind the box pointed at, or
+// focused, and behind its line.
+async function screen(b) {
+  const { p, errors } = await open(b, `${page}#s=${enc(`${S}.Repo`)}&c=${enc(`${S}.Repo`)}`);
+  const got = {};
+  const first = await code(p);
+  const box = p.locator(`.screen .react-flow__node[data-id="${`down:${S}.Open`}"]`);
+  await box.hover();
+  await settle(p);
+  const pointed = await code(p);
+  await p.mouse.move(5, 5);
+  await settle(p);
+  const left = await code(p);
+  await box.focus();
+  await settle(p);
+  const focused = await code(p);
+  await p.evaluate(() => document.activeElement?.blur());
+  await p.locator(`.screen .react-flow__edge[data-id="${`>down:${S}.Open`}"]`).hover();
+  await settle(p);
+  got.screen = [first.hit.startsWith("31type Repo struct"), pointed.lit, pointed.note, left.lit, focused.lit, (await code(p)).lit];
   await p.close();
   return { got, errors };
 }
@@ -98,11 +156,14 @@ async function serve(b) {
   const name = b.browserType().name(); // the engines share the copy
   writeFileSync(join(shop, "internal", "store", `kept${name}.go`), `package store\n\nfunc Kept${name}() {}\n`);
   await p.locator(`.react-flow__node[data-id="${S}.Kept${name}"]`).waitFor({ timeout: 15000 });
-  await p.waitForTimeout(300);
+  await settle(p);
   got.kept = [opened[0] + opened[1] > 0, await scrolls()];
+  await row(p, "Calls and embeds out", "Repo.check").hover();
+  await settle(p);
+  const pointed = await code(p);
   await p.goto(`${served}#f=${enc(C)}&s=${enc(`${C}.Total`)}`);
   const total = await code(p);
-  got.served = [first.hit.startsWith("43func (r *Repo) Get("), first.first, total.hit.startsWith("22func Total("), asked];
+  got.served = [first.hit.startsWith("43func (r *Repo) Get("), first.first, pointed.lit, total.hit.startsWith("22func Total("), asked];
   await p.close();
   return { got, errors };
 }
@@ -123,20 +184,24 @@ async function saved(b) {
 }
 
 // longGo is a file longer than the panel draws (Code, CODE_LINES 5000), of
-// 6010 lines: Long's body runs from line 3 to 6006, longB is on line 6009.
+// 6010 lines: Long's body runs from line 3 to 6006, calling longB on line
+// 6005; longB is on line 6009.
 const longGo = (n) => `package store\n\nfunc Long${n}() {\n\tlongA${n}()\n${"\n".repeat(6000)}\tlongB${n}()\n}\n\nfunc longA${n}() {}\nfunc longB${n}() {}\n`;
 // drawn is what the panel's code draws: how many lines, the first one's
-// number, the marked line, and the note on which lines they are.
+// number, the marked line, the lit lines' numbers, and the note on which
+// lines they are.
 const drawn = (p) => p.evaluate(() => {
   const pre = document.querySelector("aside.panel pre.source");
   return {
     n: pre.children.length, first: pre.querySelector(".ln").textContent, hit: pre.querySelector(".hit")?.textContent ?? null,
+    lit: [...pre.querySelectorAll(".lit .ln")].map((e) => e.textContent),
     note: document.querySelector("aside.panel .window-note")?.textContent ?? null,
   };
 });
 
 // long: of a long file the panel draws the lines around the marked one, and
-// says which.
+// says which. Pointing at a call written past them moves them to it, and
+// they stay when the pointer leaves.
 async function long(b) {
   const { p, errors } = await open(b, `${served}#f=${enc(S)}`);
   const got = {};
@@ -148,16 +213,33 @@ async function long(b) {
   await p.locator("aside.panel pre.source .hit").waitFor({ timeout: 30000 });
   const end = await drawn(p);
   got.long = [end.n, end.first, end.hit.startsWith(`6009func longB${name}()`), end.note];
+  await p.goto(`${served}#f=${enc(S)}&s=${enc(`${S}.Long${name}`)}`);
+  await p.locator("aside.panel pre.source .hit", { hasText: new RegExp(`^3func Long${name}\\(`) }).waitFor({ timeout: 30000 });
+  const top = await drawn(p);
+  await row(p, "Calls and embeds out", `longB${name}`).hover();
+  await settle(p);
+  const pointed = await drawn(p);
+  await p.mouse.move(5, 5);
+  await settle(p);
+  const left = await drawn(p);
+  got.moved = [top.note, pointed.lit, pointed.note, left.lit, left.note];
   await p.close();
   return { got, errors };
 }
 
 const want = {
-  coloured: [true, ["func", "kw"], [true, true, true]],
-  served: [true, ["func", "kw"], true, ["?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fcheckout%2Fcheckout.go"]],
+  coloured: [true, ["func", "kw"], [true, true, true], HINT],
+  pointed: [["48"], "Line 48.", true],
+  left: [],
+  focused: ["48"],
+  back: [[], HINT],
+  other: [[], "In other files: internal/store/db_linux.go:7."],
+  screen: [true, ["58"], "Line 58.", [], ["58"], ["58"]],
+  served: [true, ["func", "kw"], ["48"], true, ["?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fcheckout%2Fcheckout.go"]],
   kept: [true, [0, 0]],
   saved: [true, 0],
   long: [5000, "1011", true, "Lines 1011–6010 of 6010."],
+  moved: ["Lines 1–5000 of 6010.", ["6005"], "Lines 1011–6010 of 6010.", [], "Lines 1011–6010 of 6010."],
   errors: [],
 };
 const channel = process.env.ZU_E2E_CHANNEL;
@@ -166,7 +248,7 @@ let failed = 0;
 for (const [name, type, opts] of engines) {
   const b = await type.launch(opts);
   const got = await (async () => {
-    const parts = [await tree(b), await serve(b), await saved(b), await long(b)];
+    const parts = [await tree(b), await screen(b), await serve(b), await saved(b), await long(b)];
     return { ...Object.assign({}, ...parts.map((x) => x.got)), errors: parts.flatMap((x) => x.errors) };
   })().catch((e) => ({ errors: [String(e.message ?? e).split("\n")[0]] })).finally(() => b.close().catch(() => {}));
   const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
diff --git a/web/src/code.test.ts b/web/src/code.test.ts
index e21b936..891f63d 100644
--- a/web/src/code.test.ts
+++ b/web/src/code.test.ts
@@ -1,7 +1,8 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
-import type { SourceFile, View } from "./data";
-import { around, CODE_LINES, inline, paint, reader } from "./code";
+import type { Loc, SourceFile, View, ViewEdge } from "./data";
+import { around, behind, centre, CODE_LINES, inline, litNote, paint, reader } from "./code";
+import { decl, pkgs, view } from "./testkit";
 
 const shop = golden as unknown as View;
 const P = "internal/store/store.go";
@@ -45,6 +46,19 @@ describe("around (19)", () => {
   });
 });
 
+describe("centre (19)", () => {
+  const n = CODE_LINES * 2;
+  it("is the line drawn around while the lines drawn hold the first lit line, or none is lit", () => {
+    expect(centre(n, 10, 0)).toBe(10);
+    expect(centre(n, 10, CODE_LINES)).toBe(10);
+    expect(centre(100, 1, 99)).toBe(1); // drawn whole
+  });
+  it("is the first lit line when they do not", () => {
+    expect(centre(n, 10, CODE_LINES + 1)).toBe(CODE_LINES + 1);
+    expect(centre(n, n, 1)).toBe(1);
+  });
+});
+
 describe("inline (19)", () => {
   it("is a file the View carries, with its colour", () => {
     expect(inline(shop, P)).toEqual({ path: P, text: shop.sources[P], syntax: shop.syntax![P] });
@@ -70,3 +84,52 @@ describe("reader (19)", () => {
     expect(asked).toEqual(["a.go", "gone.go", "a.go"]);
   });
 });
+
+// m.F calls m.G three times, in two files, and m.T's method M once; m.T
+// embeds m.E; a call the change removed from F to H was written in base.
+const at = (path: string, line: number): Loc => ({ path, line });
+const call = (from: string, to: string, locs: Loc[], kind: ViewEdge["kind"] = "calls", status?: string): ViewEdge => ({
+  from, to, kind, count: locs.length, loc: locs[0], ...(locs.length > 1 ? { more: locs.slice(1) } : {}), ...(status ? { status } : {}),
+});
+const lines = view(
+  [...pkgs(["m"], "m"), decl("m.F", "m", "function"), decl("m.G", "m", "function"), decl("m.H", "m", "function"),
+    decl("m.T", "m"), decl("m.T.M", "m.T", "function"), decl("m.E", "m")],
+  [
+    call("m.F", "m.G", [at("a.go", 4), at("a.go", 9), at("b.go", 2)]),
+    call("m.F", "m.T.M", [at("a.go", 6)]),
+    call("m.T", "m.E", [at("t.go", 3)], "embeds"),
+    call("m.F", "m.H", [at("a.go", 5)], "calls", "removed"),
+    { from: "m", to: "m", kind: "imports", count: 2, loc: at("a.go", 1) },
+  ],
+);
+const is = (id: string) => (x: string) => x === id;
+
+describe("behind (19)", () => {
+  it("is where the calls and embeds from one end to the other are written, every one, by path and line", () => {
+    expect(behind(lines, is("m.F"), is("m.G"))).toEqual([at("a.go", 4), at("a.go", 9), at("b.go", 2)]);
+    expect(behind(lines, is("m.F"), (x) => x === "m.G" || x.startsWith("m.T"))).toEqual([at("a.go", 4), at("a.go", 6), at("a.go", 9), at("b.go", 2)]);
+    expect(behind(lines, is("m.T"), is("m.E"))).toEqual([at("t.go", 3)]);
+  });
+  it("has none for a call the change removed: its lines are base's", () => {
+    expect(behind(lines, is("m.F"), is("m.H"))).toEqual([]);
+  });
+  it("reads no import", () => {
+    expect(behind(lines, is("m"), is("m"))).toEqual([]);
+  });
+});
+
+describe("litNote (19)", () => {
+  it("says where the lit lines are, in the shown file and in others", () => {
+    expect(litNote([at("a.go", 4), at("a.go", 9), at("b.go", 2)], "a.go")).toBe("Lines 4, 9; in other files: b.go:2.");
+    expect(litNote([at("a.go", 4)], "a.go")).toBe("Line 4.");
+    expect(litNote([at("b.go", 2), at("c.go", 7)], "a.go")).toBe("In other files: b.go:2, c.go:7.");
+  });
+  it("lists at most eight places of each", () => {
+    const many = Array.from({ length: 10 }, (_, i) => at("a.go", i + 1));
+    expect(litNote(many, "a.go")).toBe("Lines 1, 2, 3, 4, 5, 6, 7, 8 and 2 more.");
+  });
+  it("says how to light lines, and why a removed call has none", () => {
+    expect(litNote(null, "a.go")).toBe("Point at a call or embed to light the lines it is written on.");
+    expect(litNote([], "a.go")).toBe("The change removed it: it has no line in head.");
+  });
+});
diff --git a/web/src/screen.test.ts b/web/src/screen.test.ts
index 89145eb..b633ef5 100644
--- a/web/src/screen.test.ts
+++ b/web/src/screen.test.ts
@@ -4,7 +4,7 @@ import css from "./styles.css?raw";
 import change from "../../internal/export/testdata/shop.change.golden.json";
 import type { View, ViewEdge } from "./data";
 import { ROW_MAX } from "./layout";
-import { centreOf, FONT, GAP_ROW, MEMBER_CAP, placeScreen, ROW_CAP, screenNote, screenOf, screenView, type Drawn, type Row } from "./screen";
+import { centreOf, FONT, GAP_ROW, MEMBER_CAP, placeScreen, placesOf, ROW_CAP, screenNote, screenOf, screenView, type Drawn, type Row } from "./screen";
 import { LABEL_PX } from "./viewport";
 import { decl, edge, exts, pkgs, view } from "./testkit";
 
@@ -323,3 +323,29 @@ describe("the Screen in a Change View (18)", () => {
       "5 unresolved calls in its package. Affected Set (its package): changed; 4 packages import it, directly or not.");
   });
 });
+
+describe("placesOf (19)", () => {
+  // m.T, whose method M is in b.go, is called by m.F twice in a.go and
+  // calls m.G from M; m.T embeds m.E.
+  const loc = (path: string, line: number) => ({ path, line });
+  const v = view(
+    [...pkgs(["m"], "m"), decl("m.F", "m", "function"), decl("m.G", "m", "function"), decl("m.T", "m"),
+      decl("m.T.M", "m.T", "function"), decl("m.E", "m")],
+    [
+      { ...edge("m.F", "m.T.M", "calls"), count: 2, loc: loc("a.go", 3), more: [loc("a.go", 7)] },
+      { ...edge("m.T.M", "m.G", "calls"), loc: loc("b.go", 5) },
+      { ...edge("m.T", "m.E", "embeds"), loc: loc("t.go", 2) },
+    ],
+  );
+  it("is where the calls and embeds a Screen box's line stands for are written", () => {
+    expect(placesOf(v, "m.T", "up:m.F")).toEqual([loc("a.go", 3), loc("a.go", 7)]);
+    expect(placesOf(v, "m.T", "up:m.F>")).toEqual([loc("a.go", 3), loc("a.go", 7)]); // its line
+    expect(placesOf(v, "m.T", "down:m.G")).toEqual([loc("b.go", 5)]);
+    expect(placesOf(v, "m.T", ">down:m.E")).toEqual([loc("t.go", 2)]);
+  });
+  it('is null for the Centre, a "+N more" chip, and a Screen of imports', () => {
+    expect(placesOf(v, "m.T", "m.T")).toBeNull();
+    expect(placesOf(v, "m.T", "up:#more")).toBeNull();
+    expect(placesOf(shop, S, `up:${C}`)).toBeNull();
+  });
+});
diff --git a/web/src/styles.test.ts b/web/src/styles.test.ts
index 6a437e3..38903d8 100644
--- a/web/src/styles.test.ts
+++ b/web/src/styles.test.ts
@@ -70,12 +70,13 @@ describe.each([["light", light], ["dark", dark]])("CRAP fills, %s", (_, t) => {
 });
 
 // 19: the Code panel colours Go (code.ts CLASS); each colour reads as text on
-// the code's background and on the declaration's marked line.
+// the code's background, on the declaration's marked line and on the lines a
+// pointed-at call or embed lights.
 describe.each([["light", light], ["dark", dark]])("Go colours, %s", (_, t) => {
-  it("keep text at 4.5:1 on the code and its marked line", () => {
+  it("keep text at 4.5:1 on the code, its marked line and its lit lines", () => {
     const low: string[] = [];
     for (const k of ["syn-kw", "syn-com", "syn-str", "syn-num", "fg"]) {
-      for (const bg of ["code-bg", "mark"]) {
+      for (const bg of ["code-bg", "mark", "lit"]) {
         if (!t[k] || contrast(t[k], t[bg]) < 4.5) low.push(`${k} on ${bg} ${t[k] ? contrast(t[k], t[bg]).toFixed(2) : "missing"}`);
       }
     }
@@ -87,4 +88,8 @@ describe("Go colours' rules (19)", () => {
   it("colour each class code.ts paints", () => {
     for (const c of ["kw", "com", "str", "num"]) expect(css).toMatch(new RegExp(`\\.source \\.${c} \\{[^}]*color: var\\(--syn-${c}\\)`));
   });
+  it("light a line apart from the marked one, and scroll the code alone to it", () => {
+    expect(css).toMatch(/\.source \.lit \{[^}]*background: var\(--lit\)/);
+    expect(css).toMatch(/\.source \{[^}]*position: relative[^}]*overflow: auto/);
+  });
 });
```

- [x] **Run:** `cd web && npx vitest run src/code.test.ts src/screen.test.ts src/styles.test.ts` Expected: FAIL (`centre`, `behind`, `litNote` and `placesOf` are not functions; no `--lit` colour or rule)

- [x] **Run:** `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node code.mjs` Expected: FAIL (5/13 checks in each engine, left, kept, saved, long and errors: no line lights and no note shows, the long file's lines drawn do not move, and hovering the row scrolls the panel, whose code is still as long as its file. Built with `vite build`, as in Task 3)

- [x] **Light the lines behind what the reader points at**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index dadcd39..0d41efc 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -19,7 +19,7 @@ import { PROPOSAL_NOTICE, proposalView } from "./proposal";
 import { reveal } from "./search";
 import { SearchBox } from "./SearchBox";
 import { DRAW_LIMIT, fitDepth, HUBS, opening, openFull, scene, type Scene, type SceneNode } from "./scene";
-import { centreOf, placeScreen, screenNote, screenOf, screenView } from "./screen";
+import { centreOf, placeScreen, placesOf, screenNote, screenOf, screenView } from "./screen";
 import { ScreenCanvas } from "./ScreenCanvas";
 import { centreAt, deeper, drill, nextStage, select, shallower, toggle, up, type ViewState } from "./state";
 import { Toolbar } from "./Toolbar";
@@ -143,6 +143,9 @@ export function App({ view: whole, read }: { view: View; read?: Read }) {
     [proposed, centre, state.more],
   );
   const drawing = useMemo(() => screen && placeScreen(screen), [screen]);
+  // 19: the Screen box or line the reader points at, and where its calls and embeds are written.
+  const [point, setPoint] = useState<{ centre: string; id: string } | null>(null);
+  const lit = centre !== null && point?.centre === centre ? placesOf(proposed, centre, point.id) : null;
   const red = drawing?.edges.some((e) => e.violation) ?? false; // 18: a Screen line the Policy forbids
   const canEnter = centreOf(proposed, state.selected) !== null;
   const lens = () => {
@@ -425,7 +428,13 @@ export function App({ view: whole, read }: { view: View; read?: Read }) {
         )}
         {drawing ? (
           <ReactFlowProvider key={`${centre}\n${state.more}`}>
-            <ScreenCanvas drawing={drawing} onCentre={recentre} onMore={() => update((s) => ({ ...s, more: true }))} fit={fit} />
+            <ScreenCanvas
+              drawing={drawing}
+              onCentre={recentre}
+              onMore={() => update((s) => ({ ...s, more: true }))}
+              fit={fit}
+              onPoint={(id) => setPoint(id === null || centre === null ? null : { centre, id })}
+            />
           </ReactFlowProvider>
         ) : sc.noDetail ? (
           <div className="empty">
@@ -484,6 +493,7 @@ export function App({ view: whole, read }: { view: View; read?: Read }) {
           edge={null}
           bundles={[]}
           read={read}
+          lit={lit}
           onReveal={recentre}
           onClose={() => setClosed(centre)}
         />
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index f4b4824..0b4a9fa 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -1,8 +1,8 @@
 import { useEffect, useMemo, useRef, useState } from "react";
 import type { Bundle } from "./bundle";
-import { around, inline, paint, type Read } from "./code";
+import { around, behind, centre, inline, litNote, paint, type Read } from "./code";
 import type { Hunk, Loc, SourceFile, View, ViewEdge, ViewNode } from "./data";
-import { calls, imports, targets, type Row } from "./facts";
+import { calls, imports, insideDecl, targets, type Row } from "./facts";
 import { isGroup, isStrip, rankNote } from "./group";
 import { diffLink, fileDiffLink, linkFor } from "./links";
 import { crapFacts, type Risk } from "./metrics";
@@ -22,11 +22,15 @@ type Props = {
   crap?: Risk; // 08: the selected box's CRAP as the scene rolled it up
   ownTier?: number; // 12: the selected box's rank before the row cap merged its row
   read?: Read; // 19: the source the View does not carry, from zu serve
+  lit?: Loc[] | null; // 19: where the Screen line the reader points at is written (screen.ts placesOf)
   onReveal: (id: string) => void;
   onClose: () => void;
 };
 
-function Rows({ title, rows, onReveal }: { title: string; rows: Row[]; onReveal: (id: string) => void }) {
+// 19: onPoint hears the row the reader points at or focuses, and null when they leave it.
+function Rows({ title, rows, onReveal, onPoint }: {
+  title: string; rows: Row[]; onReveal: (id: string) => void; onPoint?: (r: Row | null) => void;
+}) {
   return (
     <section>
       <h3>
@@ -37,8 +41,14 @@ function Rows({ title, rows, onReveal }: { title: string; rows: Row[]; onReveal:
       ) : (
         <ul className="rows">
           {rows.map((r) => (
-            <li key={r.id}>
-              <button type="button" className="link" onClick={() => onReveal(r.id)}>
+            <li key={r.id} onMouseEnter={onPoint && (() => onPoint(r))} onMouseLeave={onPoint && (() => onPoint(null))}>
+              <button
+                type="button"
+                className="link"
+                onClick={() => onReveal(r.id)}
+                onFocus={onPoint && (() => onPoint(r))}
+                onBlur={onPoint && (() => onPoint(null))}
+              >
                 <code>{r.id}</code>
               </button>
               {r.count > 1 && <span className="muted"> ×{r.count}</span>}
@@ -150,29 +160,49 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
 }
 
 // Code renders file text as React text children only, never parsed as
-// markup, coloured as zu coloured it (19, code.ts), the line marked. Of a
-// file longer than CODE_LINES it draws those around the marked line, and
-// says which.
-function Code({ file, line }: { file: SourceFile; line: number }) {
+// markup, coloured as zu coloured it (19, code.ts), the line marked and the
+// lines in lit that are this file's lit. Of a file longer than CODE_LINES it
+// draws those around the marked line, and says which.
+function Code({ file, line, lit }: { file: SourceFile; line: number; lit: Loc[] | null }) {
+  const pre = useRef<HTMLPreElement>(null);
   const mark = useRef<HTMLDivElement>(null);
   // Each View brings its files as new objects (13): cut, paint and scroll
   // only when the text or the marked line changes, so a redraw leaves the
   // code where the reader scrolled it. The colour is the text's
   // (export.Syntax), whose lines are cut as these are.
   const all = useMemo(() => file.text.split("\n"), [file.text]);
-  const [from, to] = around(all.length, line);
+  const on = useMemo(() => new Set(lit?.filter((l) => l.path === file.path).map((l) => l.line)), [lit, file.path]);
+  const first = on.size > 0 ? Math.min(...on) : 0;
+  // The lines drawn move to the first lit line when they do not hold it,
+  // and stay when the light goes out, as the scroll does, until the mark
+  // moves.
+  const marked = `${file.path}\n${line}`;
+  const [held, setHeld] = useState({ marked, at: line });
+  const at = centre(all.length, held.marked === marked ? held.at : line, first);
+  if (held.marked !== marked || held.at !== at) setHeld({ marked, at });
+  const [from, to] = around(all.length, at);
   const lines = useMemo(() => paint(all.slice(from, to), file.syntax.slice(from, to)), [all, from, to]);
   useEffect(() => {
     mark.current?.scrollIntoView({ block: "center" });
   }, [file.path, file.text, line]);
+  // The code alone scrolls to the first lit line: scrolling the panel would
+  // move the row the reader points at.
+  useEffect(() => {
+    const el = pre.current?.children[first - 1 - from] as HTMLElement | undefined;
+    if (pre.current && el) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 2;
+  }, [first]);
   return (
     <>
       {to - from < all.length && <p className="muted window-note">{`Lines ${from + 1}–${to} of ${all.length}.`}</p>}
-      <pre className="source">
+      <pre ref={pre} className="source">
         {lines.map((segs, k) => {
           const i = from + k + 1; // its line
           return (
-            <div key={i} ref={i === line ? mark : undefined} className={i === line ? "hit" : undefined}>
+            <div
+              key={i}
+              ref={i === line ? mark : undefined}
+              className={[i === line && "hit", on.has(i) && "lit"].filter(Boolean).join(" ") || undefined}
+            >
               <span className="ln">{i}</span>
               {segs.map((s, j) => (
                 <span key={j} className={s.cls}>
@@ -189,8 +219,9 @@ function Code({ file, line }: { file: SourceFile; line: number }) {
 
 // Source is the code of the file loc is in: the View's, or (19) read from zu
 // serve, the last file read kept while the next comes. It draws nothing while
-// neither has the file.
-function Source({ view, loc, read }: { view: View; loc: Loc; read?: Read }) {
+// neither has the file. Over it, where the lines lit are, or (hint) how to
+// light them.
+function Source({ view, loc, read, lit, hint }: { view: View; loc: Loc; read?: Read; lit: Loc[] | null; hint: boolean }) {
   const own = useMemo(() => inline(view, loc.path), [view, loc.path]);
   const [got, setGot] = useState<SourceFile | null>(null);
   useEffect(() => {
@@ -202,7 +233,17 @@ function Source({ view, loc, read }: { view: View; loc: Loc; read?: Read }) {
     };
   }, [own, read, loc.path]);
   const file = own ?? (got?.path === loc.path ? got : null);
-  return file && <Code file={file} line={loc.line} />;
+  if (!file) return null;
+  return (
+    <>
+      {(hint || lit !== null) && (
+        <p className="muted lit-note" aria-live="polite">
+          {litNote(lit, file.path)}
+        </p>
+      )}
+      <Code file={file} line={loc.line} lit={lit} />
+    </>
+  );
 }
 
 // Members lists the IR edges a bundle carries, each with where it is written.
@@ -284,7 +325,13 @@ function Crap({ view, id, box, onReveal }: { view: View; id: string; box?: Risk;
   );
 }
 
-export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, onReveal, onClose }: Props) {
+export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, lit, onReveal, onClose }: Props) {
+  // 19: the row the reader points at lights its lines, over the Screen's line.
+  const [over, setOver] = useState<{ id: string; places: Loc[] } | null>(null);
+  const places = over !== null && over.id === id ? over.places : (lit ?? null);
+  // A row followed to another declaration goes without a mouseleave or a
+  // blur: its light goes with the declaration it was in.
+  useEffect(() => setOver(null), [id]);
   const title = edge ? `${edge.from} → ${edge.to}` : (id ?? "");
   const node = id === null ? undefined : view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
   let body: React.ReactNode;
@@ -308,14 +355,19 @@ export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, on
     );
   } else if (node?.kind === "type" || node?.kind === "function") {
     const c = calls(view, node.id);
+    const inside = insideDecl(view, node.id);
+    const point = (out: boolean) => (r: Row | null) =>
+      setOver(r && { id: id!, places: out ? behind(view, inside, (x) => x === r.id) : behind(view, (x) => x === r.id, inside) });
     body = (
       <>
         <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
         <Where view={view} loc={node.loc} removed={node.status === "removed"} />
         <Change view={view} node={node} />
-        <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} />
-        <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} />
-        {node.status !== "removed" && <Source view={view} loc={node.loc} read={read} />}
+        <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} onPoint={point(true)} />
+        <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} onPoint={point(false)} />
+        {node.status !== "removed" && (
+          <Source view={view} loc={node.loc} read={read} lit={places} hint={c.out.length + c.in.length > 0} />
+        )}
       </>
     );
   } else if (node?.kind === "external") {
diff --git a/web/src/ScreenCanvas.tsx b/web/src/ScreenCanvas.tsx
index 8759786..b329ad1 100644
--- a/web/src/ScreenCanvas.tsx
+++ b/web/src/ScreenCanvas.tsx
@@ -2,7 +2,8 @@
 // before React Flow sees them, so nothing waits for a layout. A click on a box
 // re-centres the Screen on it; a click on a row's "+N more" chip draws the
 // rows whole. The page keys this by the Centre and that flag, so each Screen
-// opens at its own first view (centredFit).
+// opens at its own first view (centredFit). 19: pointing at or focusing a
+// box or its line tells the page, which lights the lines behind it.
 import {
   Background,
   ControlButton,
@@ -56,9 +57,10 @@ type Props = {
   onCentre: (id: string) => void;
   onMore: () => void;
   fit?: number; // the first view again each time it changes (the f key)
+  onPoint?: (id: string | null) => void; // 19: the box or line pointed at or focused, by its id
 };
 
-export function ScreenCanvas({ drawing, onCentre, onMore, fit }: Props) {
+export function ScreenCanvas({ drawing, onCentre, onMore, fit, onPoint }: Props) {
   const rf = useReactFlow();
   const box = useRef<HTMLDivElement>(null);
   const [whole, setWhole] = useState(true);
@@ -110,7 +112,9 @@ export function ScreenCanvas({ drawing, onCentre, onMore, fit }: Props) {
         if (!n.classList?.contains("react-flow__node") || (e.key !== "Enter" && e.key !== " ")) return;
         e.preventDefault();
         pick(n.getAttribute("data-id"));
-      }}>
+      }}
+      onFocus={(e) => onPoint?.((e.target as Element).closest?.(".react-flow__node, .react-flow__edge")?.getAttribute("data-id") ?? null)}
+      onBlur={() => onPoint?.(null)}>
         <ReactFlow
           nodes={nodes}
           edges={edges}
@@ -122,6 +126,10 @@ export function ScreenCanvas({ drawing, onCentre, onMore, fit }: Props) {
           nodesConnectable={false}
           nodesFocusable
           onNodeClick={(_, n) => pick(n.id)}
+          onNodeMouseEnter={(_, n) => onPoint?.(n.id)}
+          onNodeMouseLeave={() => onPoint?.(null)}
+          onEdgeMouseEnter={(_, e) => onPoint?.(e.id)}
+          onEdgeMouseLeave={() => onPoint?.(null)}
         >
           <Background />
           <Controls showInteractive={false}>
diff --git a/web/src/code.ts b/web/src/code.ts
index 2e1306e..44c4fca 100644
--- a/web/src/code.ts
+++ b/web/src/code.ts
@@ -1,7 +1,8 @@
 // 19: the Code panel's text. zu colours Go in Go (export.Syntax, go/scanner);
 // the page only cuts each line into those runs and draws them as React text,
 // never as markup.
-import type { SourceFile, View } from "./data";
+import { cmp } from "./cut";
+import type { Loc, SourceFile, View } from "./data";
 
 // Seg is a run of one line's text, coloured by cls when zu coloured it.
 export type Seg = { text: string; cls?: string };
@@ -45,6 +46,14 @@ export function around(n: number, at: number, size = CODE_LINES): [number, numbe
   return [from, from + size];
 }
 
+// centre is the line Code draws a file of n lines around (around): at, or
+// the first lit line when the lines drawn around at do not hold it (0 is
+// none lit).
+export function centre(n: number, at: number, first: number): number {
+  const [from, to] = around(n, at);
+  return first === 0 || (first > from && first <= to) ? at : first;
+}
+
 // inline is a file the View carries (zu scan -html, zu serve -include), with
 // its colour, or null.
 export function inline(view: View, path: string): SourceFile | null {
@@ -52,6 +61,37 @@ export function inline(view: View, path: string): SourceFile | null {
   return text === undefined ? null : { path, text, syntax: view.syntax?.[path] ?? [] };
 }
 
+// behind is where the calls and embeds from an id from accepts to one to
+// accepts are written: each edge's loc and more, by path and line, each once.
+// A call or embed the change removed was written in base, whose lines the
+// code (head's) does not show: it gives none.
+export function behind(view: View, from: (id: string) => boolean, to: (id: string) => boolean): Loc[] {
+  const out = new Map<string, Loc>();
+  for (const e of view.edges) {
+    if (e.kind === "imports" || e.status === "removed" || !from(e.from) || !to(e.to)) continue;
+    for (const l of [e.loc, ...(e.more ?? [])]) out.set(`${l.path}\n${l.line}`, l);
+  }
+  return [...out.values()].sort((a, b) => cmp(a.path, b.path) || a.line - b.line);
+}
+
+const LIT_CAP = 8; // the places litNote lists of each, before "and N more"
+
+// litNote says where the lit lines are, in the shown file (path) and in
+// others; places is null while no call or embed is pointed at.
+export function litNote(places: Loc[] | null, path: string): string {
+  if (places === null) return "Point at a call or embed to light the lines it is written on.";
+  if (places.length === 0) return "The change removed it: it has no line in head.";
+  const list = (xs: string[]) =>
+    xs.length > LIT_CAP ? `${xs.slice(0, LIT_CAP).join(", ")} and ${xs.length - LIT_CAP} more` : xs.join(", ");
+  const here = places.filter((p) => p.path === path).map((p) => String(p.line));
+  const there = places.filter((p) => p.path !== path).map((p) => `${p.path}:${p.line}`);
+  const out = [
+    here.length > 0 && `${here.length === 1 ? "Line" : "Lines"} ${list(here)}`,
+    there.length > 0 && `${here.length > 0 ? "in" : "In"} other files: ${list(there)}`,
+  ].filter(Boolean);
+  return `${out.join("; ")}.`;
+}
+
 // Read gives a file zu serve sends on demand (19), or null.
 export type Read = (path: string) => Promise<SourceFile | null>;
 
diff --git a/web/src/facts.ts b/web/src/facts.ts
index ba6ac43..5d743f2 100644
--- a/web/src/facts.ts
+++ b/web/src/facts.ts
@@ -32,11 +32,15 @@ export function imports(view: View, box: string): { out: Row[]; in: Row[] } {
   return across(view, ["imports"], (id) => pkgs.has(id));
 }
 
+// insideDecl is a declaration and, for a type, its methods.
+export function insideDecl(view: View, decl: string): (id: string) => boolean {
+  const byId = index(view).node;
+  return (id) => id === decl || byId.get(id)?.parent === decl;
+}
+
 // calls lists a declaration's calls and embeds; a type's methods count as the type.
 export function calls(view: View, decl: string): { out: Row[]; in: Row[] } {
-  const byId = index(view).node;
-  const inside = (id: string) => id === decl || byId.get(id)?.parent === decl;
-  return across(view, ["calls", "embeds"], inside);
+  return across(view, ["calls", "embeds"], insideDecl(view, decl));
 }
 
 // targets lists the real nodes behind an aggregate ("outside", "externals"):
diff --git a/web/src/screen.ts b/web/src/screen.ts
index e4ba497..d16d582 100644
--- a/web/src/screen.ts
+++ b/web/src/screen.ts
@@ -3,9 +3,10 @@
 // below, after codezoom's screens. A pure function of the View and the hash:
 // rows come only from the View's edges. 18: in a Change View, from its edges
 // and near's, each box and line marked by its Change Status.
-import type { NodeKind, View, ViewEdge } from "./data";
+import type { Loc, NodeKind, View, ViewEdge } from "./data";
 import { statusOf } from "./bundle";
 import { nodeMark } from "./change";
+import { behind } from "./code";
 import { cmp, index, packageOf, PKG } from "./cut";
 import { INSET, ROW_MAX, textWidth } from "./layout";
 import { LABEL_PX } from "./viewport";
@@ -220,6 +221,22 @@ export function screenOf(within: View, centre: string, all = false): Screen {
   };
 }
 
+// placesOf is where the calls and embeds a Screen box's line stands for are
+// written (19, code.ts behind): drawn is the box's id or its line's ("up:X",
+// "up:X>", ">down:X"). It is null for the Centre, a "+N more" chip and a
+// Screen of imports, which light no line.
+export function placesOf(within: View, centre: string, drawn: string): Loc[] | null {
+  const view = screenView(within);
+  const { node } = index(view);
+  const kind = node.get(centre)?.kind;
+  const box = drawn.replace(/^>|>$/g, "");
+  const [up, id] = box.startsWith("up:") ? [true, box.slice(3)] : box.startsWith("down:") ? [false, box.slice(5)] : [false, ""];
+  if ((kind !== "type" && kind !== "function") || !node.has(id)) return null;
+  const boxOf = (x: string) => typeOf(view, x) ?? x;
+  const [c, far] = [(x: string) => boxOf(x) === centre, (x: string) => boxOf(x) === id];
+  return up ? behind(view, far, c) : behind(view, c, far);
+}
+
 // Drawing a Screen: no ELK. Each row is lines of boxes, heaviest first, each
 // line centred under or over the Centre and at most ROW_MAX wide; the first
 // line of a row is the one nearest the Centre, and each line is laid out
diff --git a/web/src/styles.css b/web/src/styles.css
index ff5e9b2..97668d7 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -29,6 +29,7 @@
   --syn-com: #57606a;
   --syn-str: #0a3069;
   --syn-num: #0550ae;
+  --lit: #ddf4ff; /* the lines a pointed-at call or embed is written on (19) */
   font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
   color: var(--fg);
   background: var(--bg);
@@ -64,6 +65,7 @@
     --syn-com: #a8b1bb;
     --syn-str: #a5d6ff;
     --syn-num: #79c0ff;
+    --lit: #1f3a5f;
   }
 }
 
@@ -365,12 +367,15 @@ pre {
   padding-left: 16px;
 }
 
+/* 19: the code scrolls on its own, so lighting a line moves no row of the panel */
 .source {
+  position: relative;
+  max-height: 60vh;
   background: var(--code-bg);
   font-size: 12px;
   line-height: 18px;
   padding: 6px 0;
-  overflow-x: auto;
+  overflow: auto;
 }
 
 .source .ln {
@@ -400,6 +405,9 @@ pre {
 .source .num {
   color: var(--syn-num);
 }
+.source .lit {
+  background: var(--lit);
+}
 
 /* Change View (U9): status in the border and label colour, never colour alone:
    removed is struck through, moved is dashed, affected is an outline. Every
```

- [x] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [x] **Run:** `make build >/dev/null && cd web/e2e && node code.mjs` Expected: PASS (13 checks in each engine)

- [x] **Commit:** `Light the lines behind a call or embed`

---

### Task 5: Acceptance

**Files:**
- Record: `docx/features/19-code-panel/acceptance.md` (written by hand)

**Steps:**

- [x] **Run:** `make check` Expected: PASS (read the lint output)

- [x] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [x] **Run:** `cd web/e2e && node place.mjs` Expected: PASS (9 checks in each engine)

- [x] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (11 checks in each engine)

- [x] **Run:** `cd web/e2e && node screen.mjs` Expected: PASS (23 checks in each engine)

- [x] **Run:** `cd web/e2e && node code.mjs` Expected: PASS (13 checks in each engine)

- [x] **Measure** (by hand; not a replay step).
  1. Copy the Test Corpus's hugo, cobra and kubernetes clones out of `.zu/corpus/` (`cp -cR`). Of kubernetes, time its staging modules `k8s.io/api` and `client-go` too: they are under the budget and hold its longest files. The corpus is read-only: never clone, edit or check out in it.
  2. Run `node docx/features/19-code-panel/measure.mjs . <copies>…`.
  3. Record the table in `acceptance.md`.

  Pass criteria, set before the run:
  - the page draws within 3 s of `goto` on hugo, in every engine;
  - a declaration's code shows within 500 ms of its selection, read from `/source`, on the longest file the View declares in, in every engine;
  - a pointed-at row lights its lines within 100 ms (median);
  - every engine reports no page errors.

- [ ] **The user's check** (by hand; `zu serve` on a real checkout, without `-include`).
  1. Select a function. Its file shows, coloured, the function's line marked and in view. In a file past 5,000 lines, the note over the code says which lines are drawn.
  2. Point at a row of its calls: the lines light, and the note says where. Point at a caller in another file: the note lists it.
  3. Press `s`. On the Screen, point at a box below the Centre: the Centre's lines that call it light.
  4. Save a change to the file. The page redraws, and the code shows the change. Save a change to a comment or a literal only: the page does not redraw, and the code shows it.
  5. Run `zu serve -include ./some/pkg`: the page is the one `zu scan -html -include ./some/pkg` writes.

- [x] **Commit:** `Record the Code panel's acceptance`

---

## Risks

- **The View grows with every package's declarations.** Without `-include`, `zu serve` now sends every declaration while the scan, as the Policy draws it, holds at most 20,000, and the page parses and indexes all of them on each load and each watch redraw. hugo's View grows from 0.29 MB to 2.87 MB, k8s.io/api's from 0.03 MB to 6.50 MB, and client-go's, just under the budget, from 0.49 MB to 9.10 MB (**Measurements**). None slowed the first box, but each watch redraw parses the whole View again. The budget is one number, `detailBudget`, set from the corpus. Past it, the page draws packages only, as before 19, and `-include` picks what to draw.
- **A long file is drawn in part** (Deviation 12). Find-in-page reaches only the 5,000 lines drawn. They move to the first lit line when it is past them; another lit line far from it can stay undrawn, and the note names every place. Up to 5,000 lines the code is still a `div` per line with a `span` per coloured token; 18's Risks found the source pane slow on long files in WebKit. Drawn whole, a 4,937-line file shows in WebKit in 222 ms, and drawn in part, a 73,169-line file in 251 ms (**Measurements**), within the 500 ms set for them.
- **A timed unit test.** `TestSyntaxIsLinearInLineLength` fails past 1 s. It takes 10 ms here, and counting columns from each line's start took 54 s on a line a quarter longer, so a loaded machine has a wide margin. `TestMatchIsPolynomialInStars` (`internal/policy`) is the precedent.
- **The file and the View can disagree for one poll** (Deviation 7). Lit lines and the marked line come from the View, the text from the file now. After a save that moves lines, they can be off until the watch rescans (1 s by default) and the page reads the file again, which it does after every rescan. While a file does not parse, they stay off until it parses again.
- **Each `source` count renders the page again.** A count sets `Live`'s state, and `App` renders whole, as for a new View (13). Only the file shown is read again. It was not measured: counts come at most once per poll, after a save.
- **`/source` reads files from the reader's disk.** It answers only for files the last scan declares a package, type or function in, local paths only, read through `scan.DirTree`, which refuses links that leave the tree. The Host check and the cross-site check come first, as for `/view.json`. A file the scan lists that a save then replaces by a link out of the tree is refused by `DirTree` when read.
- **`code.mjs` waits fixed times,** as 17's and 18's checks do: 300 ms after a pointer move or a focus.
- **The replay depends on 16, 17 and 18.** Task 2's diff of `change.go` and `change_test.go` is against 16's version, and every web diff against 17's and 18's. If any of them changes before it lands, regenerate these diffs from a scratch branch on the new base.

## Notes

- **Task count: 5**, within Quick mode's limit.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given, in the replay.
  - Tasks 1 and 2 are red on build errors (Deviation 10).
  - Task 3 is red on a missing module and on assertions, and in the browser in all three engines.
  - Task 4 is red on missing functions and on assertions, and in the browser in all three engines.
- **The model never authors the graph.** `more` holds only the IR's own locations for an edge. Colour comes from `go/scanner`'s tokens, the lit lines from the View's edges. Nothing is inferred. The IR is untouched: `go test ./...` passes with the IR goldens unchanged, and only the two View goldens change, by `syntax` alone: the shop writes no call or embed twice, so no edge there gains `more` (Task 1's own test covers it).
- **Output stays byte-identical.** `more` is in the IR's order, which is sorted; `syntax` is a function of each file's bytes; `View.Syntax` is a map, which `encoding/json` writes by sorted key.
- **Revision, 2026-10-20.** A review of 16 to 19 together (check-16-19) replayed the four plans in order and probed the result in a browser. Every finding 19 owns was fixed in the task that owns it, and each new browser check was seen failing on a build without its fix, in all three engines:
  - **Major:** a save the View does not show (a literal, a comment, a condition) left the panel's old text until a reload: the page read a file again only for a new View, and the watch publishes none when the View is the same. The Hub now counts such rescans and `/events` sends the count, so the page reads its files again (Architecture 3 and 4, Deviation 7, the Risk; Task 2's watch test, Task 3's `saved` check). A key on the IR hash was rejected: it covers a declaration's code only, as `hashDecl` drops its comments.
  - **Minor:** while a file did not parse, `/source` answered 404 for it, though the drawing kept shows its declarations: the set was rebuilt before the watch decided to keep. It is now left alone by a rescan the watch keeps (Architecture 3; Task 2's watch test).
  - **Minor:** a row followed to another declaration, by Enter or a click, kept its light, which came back with the declaration ("Line 48." with nothing pointed at). The Panel now clears it when its declaration changes (Architecture 5; Task 4's `back` check). Keying the Panel per id was not taken: it would drop the code `Source` keeps while the next file comes.
  - **Minor:** in a Change View, the tree's Panel of a modified function lists no calls to unchanged declarations, which its Screen lists and lights. That is 18's split (`near` for Screens), now stated (Architecture 5); 20's Deviation 10 is the same for a removed declaration.
- **Revision 2, 2026-10-20.** A fresh-agent scrutiny of the revision (scrutiny-19r) confirmed every red step and every fix, and found three faults, fixed in the tasks that own them; each fix's new test was seen failing without it:
  - **Major:** a page load can draw a View the watch has not published. A save the View does not show, before the watch's next poll, then published that View: no count moved, and the page, finding the View it drew, read nothing again, so the code showed the old text. The page now reads its files again for every newer View it fetches (Architecture 3 and 4, Deviation 7; Task 3's `follow` test). Counting every rescan, a published one too, would also do; it changes the Hub's count for every page, for one case.
  - **Minor:** a page load while a file did not parse replaced `/source`'s set with its own View's, which declares nothing in that file: another tab drawing the kept View then got a 404 for it. A page load while the drawing is kept now adds to the set (Architecture 3; Task 2's watch test, which also checks a file added meanwhile).
  - **Minor:** the watch test's counts leaned on timing: outside git the watch's first poll counts on its own. The test now waits for that count (Task 2), and `code.mjs` says why its page reads `store.go` twice, not three times (Task 3).
- **Follow-ups, not in 19:**
  - 20, Diff Code (**Goal**);
  - colouring identifiers by role;
  - 17's Panel keyed per id, now for the Code panel too;
  - drawing more of a long file as the reader scrolls to an edge of the lines drawn (Deviation 12);
  - a row's light that leaving another row clears: pointing at one row and leaving it clears the light a focused row holds. The Screen does the same since 17 (scrutiny, nit 8);
  - a focus ring on both lenses (17's);
  - a page loaded while a file does not parse keeps that drawing after the file parses again (13, before 19): the watch's kept View is the same as the fixed one, so it publishes nothing. The page load does not tell the Hub what it drew.

## Replay record

Replayed with `replay.py` on a fresh `git archive` of `main` at 792229f, in a scratch directory, after 16's, 17's and 18's replays (16's text and 17's and 18's code as revised on 2026-10-20). `node_modules` was clone-copied from the repository (`cp -cR`), and Playwright's three browsers were already installed. This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `go test ./internal/export -run 'TestProjectKeepsEveryLocation\|TestProjectColoursEachSource\|TestSyntax'` | 1 |
| 1 | green | `go test ./internal/export -update` | 0 |
| 1 | green | `go test ./... && cd web && npx vitest run && npm run typecheck` | 0 |
| 2 | red | `go test ./internal/export ./internal/serve ./internal/cli` | 1 |
| 2 | green | `go test ./... && cd web && npx vitest run && npm run typecheck` | 0 |
| 3 | red | `cd web && npx vitest run src/code.test.ts src/data.test.ts src/styles.test.ts src/live.test.ts` | 1 |
| 3 | red | `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node code.mjs` | 1 |
| 3 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 3 | green | `make build >/dev/null && cd web/e2e && node code.mjs` | 0 |
| 4 | red | `cd web && npx vitest run src/code.test.ts src/screen.test.ts src/styles.test.ts` | 1 |
| 4 | red | `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node code.mjs` | 1 |
| 4 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 4 | green | `make build >/dev/null && cd web/e2e && node code.mjs` | 0 |
| 5 | green | `make check` | 0 |
| 5 | green | `cd web/e2e && node accept.mjs` | 0 |
| 5 | green | `cd web/e2e && node place.mjs` | 0 |
| 5 | green | `cd web/e2e && node serve.mjs` | 0 |
| 5 | green | `cd web/e2e && node screen.mjs` | 0 |
| 5 | green | `cd web/e2e && node code.mjs` | 0 |

- 16's, 17's and 18's replays, before this one, passed every step. Their tree was byte-identical to the scratch branch's base commit in every source file (`diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output).
- After Task 5, the replayed tree was byte-identical to the scratch branch's last commit in the same way, the two View goldens that `-update` wrote included (git tree d29568b; 36 files change against the base).
- `golangci-lint run ./...` in the replayed tree: no issues. Task 5's `accept.mjs`, `place.mjs`, `serve.mjs`, `screen.mjs` and `code.mjs` passed 57, 9, 11, 23 and 13 checks in each engine.
- The red reasons were seen as stated:
  - Task 1: the build fails, `Edge.More`, `View.Syntax`, `Syntax` and its token classes undefined (the new syntax tests, `/*/` and the long line among them, cannot run before it builds).
  - Task 2: the builds fail, `Every`, `Hub.Keep`, `export.SourceFile` and `detailBudget` undefined, and `Views` has no field `Source`.
  - Task 3: the missing module `./code`, then 8 tests (`fetchSource` is not a function; no `--syn-*` colour or rule; `follow` calls no `reread`); `code.mjs` 0/6 in each engine, because in `zu serve` the wait for the panel's code times out after 30 s.
  - Task 4: 13 tests (`centre`, `behind`, `litNote` and `placesOf` are not functions; no `--lit` colour or rule); `code.mjs` 5/13 in each engine, with left, kept, saved, long and errors passing.
  - Task 3's and Task 4's browser reasons were read on the scratch branch's red commits, since `replay.py` prints only each step's last line.
- Each fix of the revision fails without it: built from the scratch branch with the fix left out, `TestServeWatchSaysWhenAFileChangesUnderTheView` gets a 404 for a file that fails to parse (F2), `code.mjs`'s `saved` is `[false, 0]` (F1) and its `back` is `[["48"],"Line 48."]` (F3), in each engine.
- Each fix of revision 2 fails without it, on the scratch branch: without `pull`'s `reread`, `follow`'s test of a newer generation whose View is the one drawn reads 0 times, not 1; without `view()`'s change, the watch test gets a 404 for `a/a.go` after the page load, and with the set left alone instead of added to, a 404 for `c/c.go`.
- The plan replayed differed from this one only in this record, written after the replay. No code block changed.
- Toolchain: Go 1.24.5, Node 24.17.0, Python 3.11.17, macOS on an Apple M2.
