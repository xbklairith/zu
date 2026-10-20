# 20 · Diff Code — Plan

**Status:** APPROVED 2026-10-20 (lead, after scrutiny-20, its fixes and the replay; advisor sign-off). Held: it queues behind 16, 17, 18 and 19, which are approved and held. zu builds them in order 16, 17, 18, 19, 20, and builds any only when the user says go.

**Base.** Every diff here is against `main` with 16's, 17's, 18's and 19's plans applied, in that order, 19's as revised twice on 2026-10-20. `main` then differs from a18ff85 only by plan documents. The diffs come from a scratch branch. Its first commit is a `git archive` of a18ff85 with 16's to 19's tasks applied (19's revised scratch head). After it come one commit per red step and one per green step. The plan was replayed on a fresh `git archive` of `main`, after 16's to 19's replays (**Replay record**). Once those four land, replay this plan again on `main` (**Overlap with 16 to 19**).

The diffs leave out the Change View's golden, `internal/export/testdata/shop.change.golden.json`. Task 2 adds each changed declaration's diff and each hunk's colour to it. Task 2 has a step that rewrites it with `-update`, and the replay checks the result byte for byte against the scratch branch.

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 19's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Until 16 to 19 land, replay all five plans in order, from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/16-fast-rescan/replay.py docx/features/16-fast-rescan/plan.md "$S" \
  && python3 -u docx/features/17-screen/replay.py docx/features/17-screen/plan.md "$S" \
  && python3 -u docx/features/18-change-screen/replay.py docx/features/18-change-screen/plan.md "$S" \
  && python3 -u docx/features/19-code-panel/replay.py docx/features/19-code-panel/plan.md "$S" \
  && python3 -u docx/features/20-diff-code/replay.py docx/features/20-diff-code/plan.md "$S"; rm -rf "$S"
```

Once they have landed, drop their lines.

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Task 5's `make check`, and the earlier plans');
- Playwright's three browsers (Tasks 3, 4 and 5).

`measure.mjs`, beside this plan, times `zu diff -html` and the Change View's panel on real changes (**Measurements**). It is not a replay step.

---

## Goal

In a Change View, show a changed declaration's own diff, its text at Base against its text at head, coloured as Go, before its file's hunks; show a removed declaration's text at Base; and light the Base lines behind a call or embed the change removed, as 19 lights head's.

The view-model round of 2026-10-19 decided the frame (**Diff Code**), and the user accepted every recommended answer. 19 built the half that reads head (Full Code); 20 builds the half that reads Base:
- "A modified declaration shows its own diff first, base span against head span, then the file's hunks as today."
- "A removed declaration shows its base text. Today it is only a link to the host."
- "Hover an added edge and the added lines that made it light up; hover a removed edge and its base lines do."
- "This needs the base text of each changed declaration inlined. It is small and grows with the change, not the repo, but it is new inlined content (ADR 0006)."

It also fixes two faults the round did not know of:
- found while planning 20: the IR records a line under a `//line` directive as the directive's, not the file's (**Architecture 1**). Every line zu shows depends on it, and 20 cuts text by line;
- found while measuring it: opening a declaration scrolls the whole panel down to its code at head, past its facts and hunks (04). The declaration diff, drawn first, would open out of view (**Architecture 6**).

A reviewer runs `zu diff main -html change.html` and opens the page. They select `store.Repo.Get`, which the change modified. Its panel shows, under its facts, "Declaration diff": the method whole, from its doc comment to its closing brace, numbered and coloured, with the line the change added marked `+`. Under it are its file's hunks, now coloured too, then its calls and callers, then its file at head (19). They select `store.ReadWriter`, which the change removed: its panel shows its text at Base, every line marked `−`. They point at its row `store.Reader`: line 20 of its Base text lights, and the note reads "Base line 20.".

## Architecture

**1. The IR's lines are the file's own (`internal/scan/extract.go`, `sites.go`).** Generated code names its source with `//line` directives (`//line gen.y:200`). `fset.Position` applies them, and the scan used it for five lines: a package clause's, a declaration's, an import's, a call's and an embed's. Under a directive the IR recorded the directive's line, not the file's, beside the file's own path. Every line zu shows is a line of that file: the panel's place, the host link (14), the Code panel's mark and lit lines (19), and the lines 20 cuts a declaration's text by. The five sites now use `fset.PositionFor(p, false)`, the file's own line.
- `Measures` (08) keep the directive's file and line: a coverprofile keys generated code by them, and 08 matches on them.
- One reader holds both: 14's host link ends its search for a head function's first changed line at the function's Measures span, the one that holds its line (`spanEnd`). Under a directive, in a file not marked generated, that span's lines are the directive's. Most often none holds the function's line, and the search ends at the next declaration, as it does for a type. By chance one may, and the search then ends short of, or past, the function's end. Before 20 its start was the directive's line too. No such file is in the shop or the Test Corpus, and a generated file's declaration links to its file alone (14).
- No file of the shop or of the Test Corpus has a directive, so no golden changes.
- The Cache (13, 16) is in memory only: no stored facts hold the old lines.

**2. A declaration's span (`internal/export/decldiff.go`).** `declSpans(src)` parses a file, comments included, and finds each function, method and type it declares: the line of its name, its first line and its last.
- The first line is its doc comment's, when it has one.
- A type in a parenthesised group spans its own spec and doc. A lone type spans its whole declaration, the `type` keyword and doc included.
- Lines are the file's own, as the IR's now are (1).
- A file that does not parse gives none.

The scan keeps no spans: it drops each file's AST once it has its facts (ADR 0002), and the Cache keeps facts for every file of every scan. A Change View needs spans only for the declarations a change touched. So the export parses again, once on each side, only the files those declarations are written in (Deviation 2).

**3. Each tree is read once (`side`).** A `side` is one tree of the change, Base's or head's.
- It lists the tree at its first read: the scan's listing (16).
- It reads each file once.
- It reads a file the scan did not list, or one a checkout deleted since (16), as empty.

`hunksOf` read both trees itself; it now reads them through the two sides. The head side starts with the files the View inlines, whose colour (19) it already has. The errors keep their words: "list base files: …", "read head p: …", "source path … is outside the repository".

**4. A declaration's own diff (`DeclDiff`, `declDiffs`).** `View.DeclDiffs[id]` holds a diff for each type or function the Change View draws that the change modified, removed or moved (a Move's destination). It diffs the declaration's text at Base against its text at head.
- **Whole texts.** Each text runs from the doc comment to the last line. The diff is one hunk holding every line of both, not three lines of context (Deviation 3).
- **Where each side is.** `BasePath` and `HeadPath` name each side's file, `BaseStart` and `HeadStart` its first line, and lines are numbered on from there as in any `Hunk`.
- **Removed and moved.** A removed declaration has no `HeadPath`, and every line is `-`. A Move's Base side is its source's text (`movedFrom`).
- **Several texts.** A declaration written in several places (build variants, a repeated `init`, ADR 0007) has a text in each. Base's texts pair with head's:
  - each with an equal text, in its own file before another's: a text the change kept, or moved to another file;
  - then with a text in its own file, in order;
  - then the rest in order.

  A text with no partner diffs against nothing (Deviation 5).
- **What gets none.**
  - A pair whose texts are equal gives no diff, and a declaration none of whose texts changed has no entry.
  - If any of a declaration's places is not where the IR says, the declaration gets no diff rather than a wrong one. That happens only when a file changes between the scan and the export, in `zu serve`'s working tree. A file that does not parse at head is another case: the scan drops its facts, so its declarations are removed in the View, and each shows its text at Base, every line `-`.
  - An added declaration has none: its whole text is head's, which its Code panel shows (19) (Deviation 4).
- **Colour.** Each line carries its runs (`Syntax`, 19), cut from its side's file: a `-` line Base's, the others head's.

**5. Coloured hunks.** Each file hunk carries its runs in the same way (`colour`). 19 coloured the file at head; 20 colours what the Change View shows of Base.

**6. The page draws them (`web/src/Panel.tsx`, `code.ts`, `data.ts`, `styles.css`).**
- **Order.** In a declaration's panel, `Change` draws "Declaration diff" first, then the file's hunks, as before.
- **The panel opens at its top.** The code scrolled its marked line into view with `scrollIntoView` (04's `Source`, 19's `Code`), and that scrolls the panel too. In a Change View it carried the facts, the hunks and now the declaration diff out of view. On kubernetes' last 400 commits, `TestAllocator`'s panel opened scrolled 38,140 px down, to its code at the foot, its "Declaration diff" heading 37,986 px above the panel's top. The code now scrolls only its own box to the marked line, as 19 scrolls it to a lit line, and the panel stays at its top (Deviation 14).
- **The header.** Each diff has a header, "base internal/store/store.go:42–49 → head internal/store/store.go:36–44". A removed declaration has one side, and a side of a single line names no range.
- **Each line** shows its line at Base and at head in two gutters (`numbered`; a `+` line has no Base number, a `-` line no head number), then its marker, then its text, painted as the Code panel paints (19, `paint`), as React text only.
- **File hunks** are painted too (`HunkLines`).
- **A long diff.** A declaration diff scrolls on its own, at most 60% of the window high, as `.source` does.
  - It opens scrolled to its first changed row, as the code box opens at its marked line. A diff whose change lies below its first rows would otherwise open on unchanged lines.
  - When `zu serve` draws the same diff again (13), it stays where the reader scrolled it. It scrolls again only when its first change moves.
  - Past `CODE_LINES` (5,000) rows it draws the rows around its first changed row, or its first lit row, and says which, as the Code panel does (19).
- **Contrast.** Each token colour reads at 4.5:1 or more on `--add-bg` and `--del-bg`, light and dark (`styles.test.ts`).

**7. Base lines lit (`code.ts`, `screen.ts`, `Panel.tsx`).**
- **`behind`** keeps a removed edge's places, marked `base`, after head's. In 19 it gave none.
- **`litRows`** lights a row of a declaration diff:
  - by its Base line, for a Base place in that diff's Base file;
  - by its head line, for a head place in its head file.
- **`Code`** lights head places only.
- **`litNote`** words a Base place as "base line 20" when a declaration diff the panel draws holds it, and as "at base: path:line" otherwise. For example: "Line 4; base line 9; in other files: b.go:2; at base: c.go:7.".
- **One note per panel.** When a declaration diff is drawn, the note sits over it, and the Code panel's note is not drawn. 19's "The change removed it: it has no line in head." is gone.
- **On the Screen,** pointing at a box or its line lights places the same way: `placesOf` returns them, Base ones marked.
- **A removed declaration's lost edges.** The tree draws only changed declarations and their Affected Set, so a removed declaration whose neighbours the change left alone has no row in its tree panel. The Screen draws its neighbours (18's `near`), and pointing at one lights the Base lines.

## Overlap with 16 to 19

20 is built on all four. They land first, in order 16, 17, 18, 19, 20, and each is replayed on `main` after its predecessor lands.
- **16:** `internal/export/change.go` (the kept listing, a deleted file read as empty), `hunksof_test.go`. 20 rewrites `hunksOf` over 16's version; its behaviour, and 16's tests, stand. `internal/scan/cache.go`: Task 1 rewords the Cache's doc comment (Deviation 13).
- **17:** `internal/export/view.go`; `web/src/data.ts`, `screen.ts`, `screen.test.ts`, `styles.css`; `web/e2e/package.json`.
- **18:** `internal/export/change.go` (`near`), `view.go` (`Near`), `shop.change.golden.json`; `web/src/data.ts`, `screen.ts`, `screen.test.ts`, `styles.css`.
- **19:** `internal/export/view.go` (`Syntax`), the Change View golden (`syntax`, by `-update`); `web/src/code.ts`, `code.test.ts`, `Panel.tsx`, `data.ts`, `screen.ts`, `screen.test.ts`, `styles.css`, `styles.test.ts`; `web/e2e/package.json`. 20 changes how 19's `Code` scrolls to its marked line (**Architecture 6**). As revised, 19's Panel puts out a pointed row's light when its declaration changes, Base lines included. Its `source` count makes `zu serve`'s page read head's files again; 20 reads none, as Base's text comes in the View.
- **Files none of them touches:** `internal/scan/extract.go` and `sites.go`; `internal/export/hunks.go`. New: `internal/scan/lines_test.go`, `internal/export/decldiff.go` and `decldiff_test.go`, `web/e2e/diffcode.mjs`.
- **19's text that 20 supersedes,** to be replaced when both have landed (**Doc amendments**):
  - decisions.md UI v1, 19's amendment: "A removed edge lights nothing: its lines are base's (20).";
  - 19's Architecture 4: "A removed declaration still shows no code: its text is base's (20).";
  - 19's Architecture 5: "An edge the change removed gives none either: its lines are base's, which head's code does not show (20)." and the note "The change removed it: it has no line in head.";
  - 19's Deviation 5, "Lit lines are head's."

## Out of scope

- **A declaration diff for an added declaration:** its Code panel shows its whole text (19).
- **Diffs within a line,** by word or character.
- **Base text of an unchanged declaration** on a Screen (18's `near`): its code is head's, which is its text at Base too, give or take its lines.
- **A before/after toggle** on one component's internals (U13, Could).
- **Base source in `zu serve -base`.** `/source` reads the working tree (19). The served Change View inlines what `zu diff` inlines, now with the declaration diffs.
- **Colouring identifiers** (19's follow-up).
- **The IR and the scan's stats.** Spans are the export's (Deviation 2): no IR field, `Stats` field or Cache entry changes.

## Deviations and decisions for review

1. **A shipped feature's fault is fixed here (01).** The IR's lines followed `//line` directives (**Architecture 1**). 20 cuts a declaration's text by its lines, so a wrong line would cut the wrong text. The fix is five calls in the scan, with its own test (Task 1). 08's Measures keep the directive's place, as 08 decided for coverprofile keys.
2. **Spans come from the export, not the scan.** The round said the declaration diff needs "base spans". 19's notes sketched it as type spans in the scan, with base spans from Measures. Instead the export parses the files of changed declarations again, on each side, in a Change View only. The scan, its Cache and its Stats pay nothing on every scan for a Change View's few. On the measured changes `zu diff -html` took at most 1.15 times as long, within the 1.25 times set for it (**Measurements**).
3. **The whole declaration, not three lines of context.** The round asked for "base span against head span". A declaration diff holds every line of both texts. A long one scrolls on its own, and past 5,000 rows draws those around its first change (19's `CODE_LINES`).
4. **No diff for an added declaration.** It would be every line `+`, which its Code panel already shows (19).
5. **Several texts pair by an equal text, then by file, then by order.** A text the change kept pairs with its equal, in its own file first, so an `init` added before others stands alone, all `+`, and one moved to another file pairs with itself there. Build variants of one function sit in different files. For a text the change edited, the same file is the likeliest partner, and a repeated `init` in one file pairs by order. A text left over is diffed against nothing. A pair whose text is equal gives no diff.
6. **The doc comment is part of the text.** It is code, shown as code, as the Code panel shows it: not prose lifted into the UI (decisions.md, Product focus). A comment-only edit is not a meaningful change (ADR 0006), so it never on its own makes a declaration modified, and such a declaration has no diff. When a declaration changed, each of its texts that differs shows, its doc's edits included: a build variant whose doc alone was reworded shows beside the variant whose code changed.
7. **A modified declaration's head text is carried twice:** in its file, inlined (ADR 0006), and in its declaration diff. Drawing the head side from the inlined file would save those bytes, but the page would then rebuild each diff from an edit script. The page stays a renderer of what `zu diff` computed. The bytes are measured (**Measurements**): on kubernetes' last 400 commits, 9.31 MB of the 13.42 MB of declaration diffs are lines of head's text, unchanged or added, which the inlined files carry too (every declaration diff's head file is inlined); Base's own lines are 1.37 MB, and the colour of both sides 1.47 MB.
8. **19's text is superseded.** A removed edge now lights its lines at Base; 19 lit nothing and said why (**Overlap with 16 to 19**).
9. **Two gutters,** Base's line and head's, so a lit line reads by the number the note gives.
10. **A removed declaration's lost edges light from the Screen.** Its tree panel lists only edges the tree draws (18).
11. **One note per panel.** With a declaration diff drawn, the note over it names lines in both, and the Code panel's note is not drawn.
12. **Task 2's red step fails to build.** Its tests name `declSpans`, `declSpan`, `View.DeclDiffs`, `Hunk.Syntax`, `newSide` and `colour`, none of which exists yet (as 19's Deviation 10).
13. **A comment of 16's is reworded here.** 16's Cache doc said a scan after another tree's assembles every package again; it assembles again, as a rescan would, the packages the two trees differ in and their importers (a review of 16 to 19; 16's Notes). Task 1 is the scan's task, so the comment changes with it, and 16's code blocks stay as approved.
14. **A second shipped fault is fixed here (04).** Opening a declaration scrolled the whole panel to its code (04's `Source`; 19's `Code` kept it). 20 draws the declaration diff first, and a long one opened out of view. Now the code box scrolls itself and the panel opens at its top, in both Views, and a declaration diff opens at its first change (**Architecture 6**). In a Project View, a declaration with many rows shows them first and its code below them. Like Deviation 1's fix, this one could land on its own, ahead of 20.

## Measurements

`measure.mjs` ran on five changes on 2026-10-20, with this plan's last commit and, for comparison, with its base (19 as revised), on the same commits, one change at a time, 19 then 20. Each change is a Test Corpus clone's last commits, read from copies made with `cp -cR` out of `.zu/corpus/` (the corpus was only read): hugo v0.166.0's last 10 and last 100, cobra v1.10.2's last 60, kubernetes v1.37.0's last 40 and last 400. The browser was 1,400 × 900, on an Apple M2 (8 cores). The load average was 1.96 when the run began. It rose to 7.6 while `zu diff` scanned kubernetes, on every core, and was 4.1 when the run ended. Each page time is the median of three loads.

**What `zu diff -html` writes.** The time is the median of seven runs, five on kubernetes, taken right after, with 19's and 20's builds alternating, so both met the same load. `measure.mjs`'s own three runs agree within 0.03 s, and within 0.14 s on kubernetes' last 400 commits.

| Change | Time, 19 → 20 | Page, 19 → 20 | Declaration diffs | Hunks, 19 → 20 |
|---|---|---|---|---|
| hugo, last 10 | 0.34 → 0.34 s | 2.34 → 2.36 MB | 0.01 MB | 0.01 → 0.01 MB |
| hugo, last 100 | 0.39 → 0.45 s | 5.26 → 5.85 MB | 0.54 MB | 0.24 → 0.28 MB |
| cobra, last 60 | 0.10 → 0.10 s | 2.36 → 2.52 MB | 0.14 MB | 0.07 → 0.08 MB |
| kubernetes, last 40 | 4.75 → 4.79 s | 8.73 → 8.80 MB | 0.06 MB | 0.03 → 0.03 MB |
| kubernetes, last 400 | 9.83 → 11.04 s | 78.46 → 93.59 MB | 13.42 MB | 11.38 → 12.98 MB |

- **The page grows with the change.** Base's text of each changed declaration is new (`declDiffs`), and so is the colour of every hunk line (the **Hunks** column). On kubernetes' last 400 commits the page grew 19%: 13.42 MB of declaration diffs, 1.60 MB of hunk colour. Of the 13.42 MB, 9.31 MB are lines of head's text, unchanged or added, which the inlined files carry too (Deviation 7).
- **`zu diff` takes longer where the change is large.** On hugo's last 100 commits, 0.06 s more (1.15 times); on kubernetes' last 400 commits, 1.2 s more (1.12 times). On both, every run of 20 took longer than every run of 19. It parses changed files again (Deviation 2), colours every hunk line, and writes the larger page; the run did not split the time among them. Smaller changes did not move outside the runs' spread.

**The panel.** Times are in-page, in ms, Chromium / Firefox / WebKit, from the hash change that opens a panel to its first hunk in the DOM, then two frames.
- **Declaration:** the declaration with the longest declaration diff. Before 20 there is none to open.
- **Lit:** from pointing at that declaration's first "Calls and embeds out" row to the note naming its lines, then two frames. On hugo's last 100 and kubernetes' last 400 commits that declaration has such a row; on the others it has none.
- **Package:** the package whose directory has the most hunk lines, now coloured, on a page of its own.

| Change | Declaration (its diff's rows) | Declaration, 20 | Lit, 20 | Package (hunk lines) | Package, 19 → 20 |
|---|---|---|---|---|---|
| hugo, last 10 | `Namespace.ReplaceRE` (53) | 26 / 53 / 52 | – | `common/hexec` (174) | 26 / 52 / 103 → 26 / 50 / 106 |
| hugo, last 100 | `allPagesAssembler.doCreatePages` (786) | 62 / 84 / 144 | 29 / 21 / 31 | `hugolib` (623) | 34 / 49 / 78 → 39 / 58 / 82 |
| cobra, last 60 | `genBashComp` (468) | 30 / 39 / 74 | – | `cobra` (1,318) | 23 / 38 / 76 → 29 / 50 / 96 |
| kubernetes, last 40 | `Controller.handleClaim` (152) | 61 / 85 / 118 | – | `test/e2e/apps` (179) | 32 / 52 / 87 → 34 / 54 / 91 |
| kubernetes, last 400 | `TestAllocator` (8,173) | 238 / 320 / 495 | 201 / 305 / 328 | `k8s.io/api/scheduling/v1alpha3` (10,996) | 133 / 169 / 288 → 186 / 243 / 391 |

- **`TestAllocator`'s diff** has 8,173 rows; the panel draws 5,000 of them, around its first change (Deviation 3).
- **Lighting, before and after 20.** The same pointing, at `TestAllocator`'s first "Calls and embeds out" row on kubernetes' last 400 commits, timed as `measure.mjs` times it, three times in each engine:
  - 19: 108 / 156 / 193 ms. The panel draws 2,027 hunk rows and a window of 5,000 code rows; the lit line lies outside the window, and the window moves to it.
  - 20: 209 / 274 / 329 ms. It draws a window of 5,000 declaration diff rows as well, and that window moves too, so the page replaces about 10,000 rows (**Risks**).
- **No page errors** in any engine.

**After scrutiny-20's fixes.** The runs above used this plan's code before scrutiny-20's fixes (**Notes**). The fixed build writes the same View on all five changes, but for the build's name, and a page 202 bytes larger, for its script. It was timed again on the two changes that have a Lit time, at a load of 3 to 7:
- `zu diff -html`: 0.45 s on hugo's last 100 commits, and 11.31 s on kubernetes' last 400 (the median of three runs, not alternated with 19's; 1.15 times 19's 9.83 s above);
- hugo's last 100 commits: Declaration 65 / 85 / 141, Lit 28 / 21 / 28, Package 38 / 54 / 93 ms;
- kubernetes' last 400 commits: Declaration 240 / 318 / 496, Lit 202 / 285 / 317, Package 185 / 247 / 408 ms;
- no page errors.

Each panel time is within 20 ms of the table's above, and within the criteria below.

Pass criteria, set before the runs:
- `zu diff -html` takes at most 1.25 times 19's: at most 1.15 times, on hugo's last 100 commits;
- the page is at most 25% larger than 19's: at most 19%, on kubernetes' last 400 commits;
- the panel of the declaration with the longest declaration diff draws within 1,000 ms, in every engine: at most 495 ms, `TestAllocator` in WebKit;
- the panel of the package with the most hunk lines draws within 1.5 times 19's, or 500 ms, whichever is more, in every engine: at most 1.44 times, and 391 ms, on kubernetes' last 400 commits;
- every engine reports no page errors: none.

## Doc amendments (exact text; not task steps)

These follow 19's amendments, which land first.

**`docx/decisions/0006-self-contained-html-export.md`, a new section after 19's amendment:**

> ## Amendment (20, 2026-10-20): a Change View inlines Base's text of each changed declaration
>
> A Change View now also carries, for each type or function the change modified, removed or moved, its whole text at Base beside its text at head (`View.declDiffs`), and the colour of every hunk line. Base's text is read from Base's tree, as the hunks are. It is the text of changed declarations only, so the file still grows with the change, not the repository: on kubernetes' last 400 commits, 13.42 MB of declaration diffs, both sides and their colour, in a page of 93.59 MB, 19% more than before; on hugo's last 10, 0.01 MB. Each declaration diff also holds the declaration's text at head, which its file carries too. Project Views are unchanged.

**`docx/core/decisions.md`, line 41 (UI v1).** In 19's **Code panel (19)** text, replace "A removed edge lights nothing: its lines are base's (20)." with:

> **Diff Code (20):** in a Change View, a declaration the change modified, removed or moved shows its own diff first: its whole text at Base, from its doc comment, against its text at head, numbered on both sides and coloured. Then come its file's hunks, coloured too. A removed declaration shows its text at Base. Pointing at a call or embed the change removed lights the lines it was written on at Base, in the declaration diff, and the note names them ("Base line 20.", or "at base: path:line" outside it).

**`docx/glossary.md`, a new entry after Code Panel (19's):**

> ## Declaration Diff
>
> In a Change View, a changed declaration's own diff (20): its whole text at Base, from its doc comment to its last line, against its whole text at head, numbered on both sides and coloured. A removed declaration shows its text at Base, and a Move its source's text against its own. An added declaration has none: its Code Panel shows its text.

**`docx/glossary.md`, IR.** Append to the end of the entry:

> Its lines are each file's own: a `//line` directive does not move them (20).

**`docx/glossary.md`, HTML Export.** Append to the end of the entry, after 19's sentence:

> A Change View also inlines the Base text of each changed declaration (20).

**`docx/core/requirements-draft.md`:** no new row. U12 ("Show the hunk for a changed node inline in the side panel", Should) is now met: the node's own diff, not only its file's. U13 stays open.

## Tasks

### Task 1: The IR's lines are the file's own (`scan`)

`TestLocationsAreTheFilesOwnLines` scans a module whose `p/p.go` has a `//line` directive before its package clause, its import, its type `T` (embedding `q.E`) and its function `F` (calling `G`). Every location in `p/p.go` must be the file's own line: the package 2, `T` 8, `F` 11, `G` 13, the import 5, the embed 8, the call 11.

The green step also rewords the Cache's doc comment (Deviation 13).

**Files:**
- Test: `internal/scan/lines_test.go` (new)
- Code: `internal/scan/extract.go`, `internal/scan/sites.go`, `internal/scan/cache.go` (its doc comment)

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/scan/lines_test.go b/internal/scan/lines_test.go
new file mode 100644
index 0000000..cff1f9f
--- /dev/null
+++ b/internal/scan/lines_test.go
@@ -0,0 +1,60 @@
+package scan
+
+import (
+	"context"
+	"maps"
+	"slices"
+	"testing"
+)
+
+// TestLocationsAreTheFilesOwnLines: a //line directive, which generated code
+// writes, names another file's lines. The IR's locations are the file's own,
+// the lines its panel marks and the host shows; only a coverprofile keys
+// code by the directive's (08, Measures).
+func TestLocationsAreTheFilesOwnLines(t *testing.T) {
+	root := tree(t, map[string]string{
+		"go.mod": "module x\n\ngo 1.24\n",
+		"q/q.go": "package q\n\ntype E struct{}\n",
+		"p/p.go": `//line gen.y:100
+package p
+
+//line gen.y:200
+import "x/q"
+
+//line gen.y:300
+type T struct{ q.E }
+
+//line gen.y:400
+func F() { G() }
+
+func G() {}
+`,
+	})
+	doc, _, err := Run(context.Background(), Options{Tree: dirOf(t, root)})
+	if err != nil {
+		t.Fatal(err)
+	}
+	got := map[string]int{}
+	for _, n := range doc.Nodes {
+		if len(n.Locations) == 1 && n.Locations[0].Path == "p/p.go" {
+			got[n.ID] = n.Locations[0].Line
+		}
+	}
+	for _, e := range doc.Edges {
+		if len(e.Locations) == 1 && e.Locations[0].Path == "p/p.go" {
+			got[string(e.Kind)+" "+e.From+" "+e.To] = e.Locations[0].Line
+		}
+	}
+	want := map[string]int{
+		"x/p": 2, "x/p.T": 8, "x/p.F": 11, "x/p.G": 13,
+		"imports x/p x/q": 5, "embeds x/p.T x/q.E": 8, "calls x/p.F x/p.G": 11,
+	}
+	for _, k := range slices.Sorted(maps.Keys(want)) {
+		if w := want[k]; got[k] != w {
+			t.Errorf("%s at line %d, want %d (the file's own)", k, got[k], w)
+		}
+	}
+	if len(got) != len(want) {
+		t.Errorf("locations in p/p.go: %v, want %v", got, want)
+	}
+}
```

- [x] **Run:** `go test ./internal/scan -run TestLocationsAreTheFilesOwnLines` Expected: FAIL (all seven locations are the directive's: `calls x/p.F x/p.G at line 400, want 11 (the file's own)`, and so on)

- [x] **Take each line as the file's**

```diff
diff --git a/internal/scan/cache.go b/internal/scan/cache.go
index e16ab4d..c283a56 100644
--- a/internal/scan/cache.go
+++ b/internal/scan/cache.go
@@ -19,7 +19,8 @@ import (
 // the last scan's, which is what a cold scan would build of it, byte for
 // byte. Keep one Cache per sequence of scans of one tree: scanning another
 // tree through it (serve's Base, say) replaces the kept assembly, and each
-// scan after that assembles every package again. Successive IRs share
+// scan after that assembles again, as a rescan would, every package the two
+// trees differ in and its importers. Successive IRs share
 // location lists with the kept parts: nothing may append to an IR's
 // Locations in place, or sort them but through ir.Sort, which leaves sorted
 // lists alone. Safe for concurrent use.
diff --git a/internal/scan/extract.go b/internal/scan/extract.go
index 2996816..c882ed4 100644
--- a/internal/scan/extract.go
+++ b/internal/scan/extract.go
@@ -76,7 +76,7 @@ func extractSource(rel string, src []byte) *fileFacts {
 		return f
 	}
 	f.PkgName = file.Name.Name
-	f.PkgLine = fset.Position(file.Package).Line
+	f.PkgLine = fset.PositionFor(file.Package, false).Line
 	f.Generated = ast.IsGenerated(file)
 	f.addImports(fset, file)
 	for _, decl := range file.Decls {
@@ -140,7 +140,7 @@ func (f *fileFacts) addDecl(fset *token.FileSet, name *ast.Ident, recv string, k
 		Kind:     kind,
 		Exported: ast.IsExported(name.Name),
 		TypeKind: tk,
-		Line:     fset.Position(name.Pos()).Line,
+		Line:     fset.PositionFor(name.Pos(), false).Line,
 		node:     node,
 	})
 }
diff --git a/internal/scan/sites.go b/internal/scan/sites.go
index 70badf8..d409f05 100644
--- a/internal/scan/sites.go
+++ b/internal/scan/sites.go
@@ -49,7 +49,7 @@ func (f *fileFacts) addImports(fset *token.FileSet, file *ast.File) {
 		if err != nil {
 			continue
 		}
-		imp := importFact{Path: p, Line: fset.Position(spec.Path.Pos()).Line}
+		imp := importFact{Path: p, Line: fset.PositionFor(spec.Path.Pos(), false).Line}
 		if spec.Name != nil {
 			imp.Name = spec.Name.Name
 		}
@@ -75,7 +75,7 @@ func (f *fileFacts) addCalls(fset *token.FileSet, d *ast.FuncDecl) {
 			return true // conversion to a receiver type parameter
 		}
 		s := from
-		s.Line = fset.Position(call.Lparen).Line
+		s.Line = fset.PositionFor(call.Lparen, false).Line
 		if classifyCall(&s, call.Fun, recv) {
 			f.Calls = append(f.Calls, s)
 		}
@@ -248,7 +248,7 @@ func (f *fileFacts) addEmbeds(fset *token.FileSet, ts *ast.TypeSpec) {
 			e = s.X
 		}
 		e = unwrapInstantiation(e)
-		site := embedSite{Owner: ts.Name.Name, Line: fset.Position(fld.Type.Pos()).Line}
+		site := embedSite{Owner: ts.Name.Name, Line: fset.PositionFor(fld.Type.Pos(), false).Line}
 		switch x := e.(type) {
 		case *ast.Ident:
 			site.Name = x.Name
```

- [x] **Run:** `go test ./... && cd web && npx vitest run && npm run typecheck` Expected: PASS (no golden changes)

- [x] **Commit:** `Record the IR's lines as the file's own, not a //line directive's`

---

### Task 2: A changed declaration's own diff, and coloured hunks (`export`)

- `TestDeclSpans`, on a file under a `//line` directive: `F` with a two-line doc spans 4–7; `A` in a group, with its doc, 10–11; `B`, a struct over three lines, 12–14; the lone generic type `T` with its doc 17–18; the method `M` 20. A `var` gets none, and a file that does not parse gives none.
- `TestChangeDeclDiffs`, on the Change View of the shop's change (`changeView`):
  - declaration diffs exist for exactly `main`, `checkout.Total`, `money.Plus`, `store.Order`, `store.ReadWriter`, `store.Repo.Get` and `store.Repo.check`; not for `store.Repo`, which the change left alone;
  - `store.Repo.Get`: Base `store.go` from 42 for 8 lines, head from 36 for 9, the second `r.hook()` added;
  - `store.ReadWriter`, removed: Base `store.go` 18–22, every line `-`, no head;
  - `money.Plus`, moved from `money.Add`: Base `money.go` 13–14, head 17–18;
  - each line's colour is `Syntax` of the line alone (the shop holds no token across lines).
- `TestChangeHunksAreColoured`: every line of every hunk has its colour.
- `TestDeclDiffPairs`, on two trees written for it:
  - `F` is in `f_linux.go`, `f_windows.go` and `f_darwin.go` at Base, and the change edits Linux's, keeps Windows' and deletes Darwin's: two diffs, Darwin's all `-`, then Linux's;
  - `G` is the same in `g_linux.go` and `g_windows.go`, and the change edits Linux's: one diff, Linux's against Linux's;
  - two `init`s in one file, of which the change edits the second: one diff;
  - an `init` added before two the change kept: one diff, all `+`;
  - two `init`s in one file, of which the change moves the first to another file and edits the second: one diff, the second's.
- `hunksof_test.go` (16's) passes `hunksOf` two sides, and wants each hunk coloured.

**Files:**
- Tests: `internal/export/decldiff_test.go` (new), `internal/export/hunksof_test.go`
- Code: `internal/export/decldiff.go` (new), `internal/export/change.go`, `internal/export/hunks.go`, `internal/export/view.go`
- Golden: `internal/export/testdata/shop.change.golden.json` (rewritten by `-update`)

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/export/decldiff_test.go b/internal/export/decldiff_test.go
new file mode 100644
index 0000000..78e3bb3
--- /dev/null
+++ b/internal/export/decldiff_test.go
@@ -0,0 +1,205 @@
+package export
+
+import (
+	"os"
+	"path/filepath"
+	"reflect"
+	"slices"
+	"strings"
+	"testing"
+
+	"zu/internal/diff"
+)
+
+func TestDeclSpans(t *testing.T) {
+	src := `//line gen.y:1
+package p
+
+// F does.
+// Two lines.
+func F() {
+}
+
+type (
+	// A is one.
+	A int
+	B struct {
+		x int
+	}
+)
+
+// T is lone.
+type T[E any] struct{ e E }
+
+func (t *T[E]) M() {}
+
+var v = 1
+`
+	want := []declSpan{
+		{name: "F", line: 6, first: 4, last: 7},
+		{name: "A", line: 11, first: 10, last: 11},
+		{name: "B", line: 12, first: 12, last: 14},
+		{name: "T", line: 18, first: 17, last: 18},
+		{name: "M", line: 20, first: 20, last: 20},
+	}
+	if got := declSpans([]byte(src)); !reflect.DeepEqual(got, want) {
+		t.Errorf("spans =\n%+v\nwant\n%+v", got, want)
+	}
+	if got := declSpans([]byte("package p\n\nfunc F( {\n")); got != nil {
+		t.Errorf("spans of a file that does not parse = %+v, want none", got)
+	}
+}
+
+// alone is each line's colour as Syntax gives it for the line by itself:
+// the shop's changed lines hold no token across lines.
+func alone(lines []string) [][]int {
+	out := make([][]int, len(lines))
+	for i, l := range lines {
+		out[i] = Syntax([]byte(l[1:]))[0]
+	}
+	return out
+}
+
+func TestChangeDeclDiffs(t *testing.T) {
+	v, _ := changeView(t)
+	const s = "example.com/shop/internal/"
+	var ids []string
+	for id := range v.DeclDiffs {
+		ids = append(ids, id)
+	}
+	slices.Sort(ids)
+	// Every declaration the change modified, removed or moved, and only
+	// those: not store.Repo, drawn as Get's type.
+	if want := []string{"example.com/shop.main", s + "checkout.Total", s + "money.Plus", s + "store.Order", s + "store.ReadWriter", s + "store.Repo.Get", s + "store.Repo.check"}; !slices.Equal(ids, want) {
+		t.Errorf("declaration diffs of %v, want %v", ids, want)
+	}
+	const store, money = "internal/store/store.go", "internal/money/money.go"
+	for _, c := range []struct {
+		id   string
+		want DeclDiff
+	}{
+		{s + "store.Repo.Get", DeclDiff{BasePath: store, HeadPath: store, Hunk: Hunk{BaseStart: 42, BaseLines: 8, HeadStart: 36, HeadLines: 9, Lines: []string{
+			" // Get returns one order.",
+			" func (r *Repo) Get(id int) (Order, error) {",
+			" \tr.Lock()",
+			" \tdefer r.Unlock()",
+			" \to := r.cache[id]",
+			" \tr.hook()",
+			"+\tr.hook()",
+			" \treturn o, r.check(o)",
+			" }",
+		}}}},
+		// A removed declaration is its text at Base.
+		{s + "store.ReadWriter", DeclDiff{BasePath: store, Hunk: Hunk{BaseStart: 18, BaseLines: 5, Lines: []string{
+			"-// ReadWriter reads and writes orders.",
+			"-type ReadWriter interface {",
+			"-\tReader",
+			"-\tPut(o Order) error",
+			"-}",
+		}}}},
+		// A Move's Base side is its source's.
+		{s + "money.Plus", DeclDiff{BasePath: money, HeadPath: money, Hunk: Hunk{BaseStart: 13, BaseLines: 2, HeadStart: 17, HeadLines: 2, Lines: []string{
+			" // Add returns the sum.",
+			"-func Add(a, b Cents) Cents { return a + b }",
+			"+func Plus(a, b Cents) Cents { return a + b }",
+		}}}},
+	} {
+		got := v.DeclDiffs[c.id]
+		if len(got) != 1 {
+			t.Errorf("%s has %d declaration diffs, want 1", c.id, len(got))
+			continue
+		}
+		c.want.Syntax = alone(c.want.Lines)
+		if !reflect.DeepEqual(got[0], c.want) {
+			t.Errorf("%s declaration diff =\n%+v\nwant\n%+v", c.id, got[0], c.want)
+		}
+	}
+}
+
+// Each line of a hunk is coloured as its side's file colours it: a "-" line
+// as Base's, the others as head's.
+func TestChangeHunksAreColoured(t *testing.T) {
+	v, _ := changeView(t)
+	if len(v.Hunks) == 0 {
+		t.Fatal("no hunks")
+	}
+	for p, hs := range v.Hunks {
+		for _, h := range hs {
+			if want := alone(h.Lines); !reflect.DeepEqual(h.Syntax, want) {
+				t.Errorf("%s hunk @%d colour =\n%v\nwant\n%v", p, h.HeadStart, h.Syntax, want)
+			}
+		}
+	}
+}
+
+// writeTree writes files under a new directory.
+func writeTree(t *testing.T, files map[string]string) string {
+	t.Helper()
+	root := t.TempDir()
+	for p, s := range files {
+		full := filepath.Join(root, filepath.FromSlash(p))
+		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
+			t.Fatal(err)
+		}
+		if err := os.WriteFile(full, []byte(s), 0o644); err != nil {
+			t.Fatal(err)
+		}
+	}
+	return root
+}
+
+// A declaration written more than once (build variants, repeated init) pairs
+// its texts: each with an equal text, in its own file before another; then
+// with a text in its file, in order; then the rest in order. A pair whose text
+// the change kept has no diff; a text with no partner stands alone, as an init
+// added before others does, and an init moved to another file pairs with its
+// equal there, not with its file's changed one.
+func TestDeclDiffPairs(t *testing.T) {
+	const mod = "module m\n\ngo 1.24\n"
+	f := func(n int) string {
+		return "package a\n\n// F is a variant.\nfunc F() int { return " + string(rune('0'+n)) + " }\n"
+	}
+	inits := func(y int) string {
+		return "package a\n\nvar x, y int\n\nfunc init() { x = 1 }\n\nfunc init() { y = " + string(rune('0'+y)) + " }\n"
+	}
+	g := func(n int) string { return "package a\n\nfunc G() int { return " + string(rune('0'+n)) + " }\n" }
+	more := "package a\n\nfunc init() { x = 5 }\n\nfunc init() { y = 6 }\n"
+	baseRoot := writeTree(t, map[string]string{"go.mod": mod, "a/f_linux.go": f(1), "a/f_windows.go": f(2), "a/f_darwin.go": f(3), "a/init.go": inits(2),
+		"a/g_linux.go": g(0), "a/g_windows.go": g(0), "a/more.go": more, "a/old.go": "package a\n\nfunc init() { x = 7 }\n\nfunc init() { y = 8 }\n"})
+	headRoot := writeTree(t, map[string]string{"go.mod": mod, "a/f_linux.go": f(4), "a/f_windows.go": f(2), "a/init.go": inits(3),
+		"a/g_linux.go": g(9), "a/g_windows.go": g(0),
+		"a/more.go": strings.Replace(more, "\n\n", "\n\nfunc init() { y = 0 }\n\n", 1),
+		"a/old.go":  "package a\n\nfunc init() { y = 9 }\n",
+		"a/new.go":  "package a\n\nfunc init() { x = 7 }\n"})
+	base, baseTree := scanTree(t, baseRoot, strings.Repeat("b", 40))
+	head, headTree := scanTree(t, headRoot, strings.Repeat("h", 40))
+	v, err := Change(base, head, diff.Compare(base, head), diff.Summarize(base, head), baseTree, headTree)
+	if err != nil {
+		t.Fatal(err)
+	}
+	where := func(ds []DeclDiff) []string {
+		var out []string
+		for _, d := range ds {
+			out = append(out, d.BasePath+" → "+d.HeadPath+": "+strings.Join(d.Lines, " | "))
+		}
+		return out
+	}
+	if got, want := where(v.DeclDiffs["m/a.F"]), []string{
+		"a/f_darwin.go → : -// F is a variant. | -func F() int { return 3 }",
+		"a/f_linux.go → a/f_linux.go:  // F is a variant. | -func F() int { return 1 } | +func F() int { return 4 }",
+	}; !slices.Equal(got, want) {
+		t.Errorf("F's declaration diffs =\n%q\nwant\n%q", got, want)
+	}
+	if got, want := where(v.DeclDiffs["m/a.G"]), []string{
+		"a/g_linux.go → a/g_linux.go: -func G() int { return 0 } | +func G() int { return 9 }",
+	}; !slices.Equal(got, want) {
+		t.Errorf("G's declaration diffs =\n%q\nwant\n%q", got, want)
+	}
+	if got, want := where(v.DeclDiffs["m/a.init"]), []string{
+		"a/init.go → a/init.go: -func init() { y = 2 } | +func init() { y = 3 }",
+		"a/old.go → a/old.go: -func init() { y = 8 } | +func init() { y = 9 }",
+		" → a/more.go: +func init() { y = 0 }",
+	}; !slices.Equal(got, want) {
+		t.Errorf("init's declaration diffs =\n%q\nwant\n%q", got, want)
+	}
+}
diff --git a/internal/export/hunksof_test.go b/internal/export/hunksof_test.go
index 5e18701..440a145 100644
--- a/internal/export/hunksof_test.go
+++ b/internal/export/hunksof_test.go
@@ -33,11 +33,15 @@ func TestHunksOfAFileDeletedAfterTheListing(t *testing.T) {
 	if err := os.Remove(filepath.Join(dir, "a.go")); err != nil {
 		t.Fatal(err)
 	}
-	got, err := hunksOf(map[string]bool{"a.go": true}, base, head)
+	got, err := hunksOf(map[string]bool{"a.go": true}, newSide("base", base), newSide("head", head))
 	if err != nil {
 		t.Fatalf("hunksOf: %v", err)
 	}
-	if want := Hunks(src, nil); !reflect.DeepEqual(got["a.go"], want) {
+	want := Hunks(src, nil)
+	for i := range want {
+		colour(&want[i], Syntax(src), Syntax(nil))
+	}
+	if !reflect.DeepEqual(got["a.go"], want) {
 		t.Errorf("hunks of a.go = %+v, want %+v", got["a.go"], want)
 	}
 }
```

- [x] **Run:** `go test ./internal/export` Expected: FAIL (the build fails: `undefined: declSpan`, `undefined: declSpans`, `v.DeclDiffs undefined (type *View has no field or method DeclDiffs)`, `undefined: DeclDiff`, `h.Syntax undefined (type Hunk has no field or method Syntax)`)

- [x] **Diff each changed declaration whole, and colour every hunk**

```diff
diff --git a/internal/export/change.go b/internal/export/change.go
index 1744ab6..69132f8 100644
--- a/internal/export/change.go
+++ b/internal/export/change.go
@@ -1,12 +1,6 @@
 package export
 
 import (
-	"errors"
-	"fmt"
-	"io/fs"
-	"path/filepath"
-	"slices"
-
 	"zu/internal/diff"
 	"zu/internal/ir"
 	"zu/internal/scan"
@@ -232,65 +226,52 @@ func Change(base, head *ir.IR, delta diff.Delta, sum *diff.Summary, baseTree, he
 	for _, p := range baseFiles {
 		files[p] = true
 	}
-	hunks, err := hunksOf(files, baseTree, headTree)
+	// 20: each tree's files are read once, for the hunks and the
+	// declaration diffs; head's inlined ones are read already.
+	bs, hs := newSide("base", baseTree), newSide("head", headTree)
+	for p, text := range v.Sources {
+		hs.keep(p, []byte(text), v.Syntax[p])
+	}
+	hunks, err := hunksOf(files, bs, hs)
 	if err != nil {
 		return nil, err
 	}
 	if len(hunks) > 0 {
 		v.Hunks = hunks
 	}
+	dd, err := declDiffs(v, baseByID, headByID, bs, hs)
+	if err != nil {
+		return nil, err
+	}
+	if len(dd) > 0 {
+		v.DeclDiffs = dd
+	}
 	sortView(v)
 	return v, nil
 }
 
-// hunksOf diffs each file between the two trees. A file absent on one side
-// is diffed against empty content; a file whose lines are equal is left out.
-func hunksOf(files map[string]bool, baseTree, headTree scan.Tree) (map[string][]Hunk, error) {
+// hunksOf diffs each file between the two sides, coloured (20). A file
+// absent on one side is diffed against empty content; a file whose lines are
+// equal is left out.
+func hunksOf(files map[string]bool, bs, hs *side) (map[string][]Hunk, error) {
 	out := map[string][]Hunk{}
-	if len(files) == 0 {
-		return out, nil
-	}
-	read := func(t scan.Tree) (func(string) ([]byte, error), error) {
-		list, _, err := t.Files()
+	for p := range files {
+		b, err := bs.file(p)
 		if err != nil {
 			return nil, err
 		}
-		return func(p string) ([]byte, error) {
-			if _, ok := slices.BinarySearch(list, p); !ok {
-				return nil, nil
-			}
-			// A listed file deleted since (a checkout mid-rescan) reads as
-			// empty too: the listing is the scan's, kept (16).
-			b, err := t.ReadFile(p)
-			if errors.Is(err, fs.ErrNotExist) {
-				return nil, nil
-			}
-			return b, err
-		}, nil
-	}
-	readBase, err := read(baseTree)
-	if err != nil {
-		return nil, fmt.Errorf("list base files: %w", err)
-	}
-	readHead, err := read(headTree)
-	if err != nil {
-		return nil, fmt.Errorf("list head files: %w", err)
-	}
-	for p := range files {
-		if !filepath.IsLocal(filepath.FromSlash(p)) {
-			return nil, fmt.Errorf("source path %q is outside the repository", p)
-		}
-		b, err := readBase(p)
+		h, err := hs.file(p)
 		if err != nil {
-			return nil, fmt.Errorf("read base %s: %w", p, err)
+			return nil, err
 		}
-		h, err := readHead(p)
-		if err != nil {
-			return nil, fmt.Errorf("read head %s: %w", p, err)
+		hunks := Hunks(b.text, h.text)
+		if len(hunks) == 0 {
+			continue
 		}
-		if hs := Hunks(b, h); len(hs) > 0 {
-			out[p] = hs
+		for i := range hunks {
+			colour(&hunks[i], b.colour(), h.colour())
 		}
+		out[p] = hunks
 	}
 	return out, nil
 }
diff --git a/internal/export/decldiff.go b/internal/export/decldiff.go
new file mode 100644
index 0000000..447b3ee
--- /dev/null
+++ b/internal/export/decldiff.go
@@ -0,0 +1,309 @@
+package export
+
+import (
+	"errors"
+	"fmt"
+	"go/ast"
+	"go/parser"
+	"go/token"
+	"io/fs"
+	"path/filepath"
+	"slices"
+	"strings"
+
+	"zu/internal/diff"
+	"zu/internal/ir"
+	"zu/internal/scan"
+)
+
+// DeclDiff is a changed declaration's own diff (20): its whole text at Base,
+// from its doc comment to its last line, against its whole text at head. A
+// removed declaration has no HeadPath and every line "-"; a Move's Base side
+// is its source's. It numbers its lines as Hunk does, from BaseStart in
+// BasePath and HeadStart in HeadPath.
+type DeclDiff struct {
+	BasePath string `json:"basePath,omitempty"`
+	HeadPath string `json:"headPath,omitempty"`
+	Hunk
+}
+
+// declSpan is where a declaration is written in a file: its name's line, and
+// its first and last lines, the first being its doc comment's when it has one.
+type declSpan struct {
+	name              string
+	line, first, last int
+}
+
+// declSpans finds each function, method and type src declares, by the
+// file's own lines, as the scan's are, whatever a //line directive says. A
+// type in a group spans its spec; a lone type, its whole declaration. A file
+// that does not parse gives none.
+func declSpans(src []byte) []declSpan {
+	fset := token.NewFileSet()
+	f, err := parser.ParseFile(fset, "", src, parser.ParseComments|parser.SkipObjectResolution)
+	if err != nil {
+		return nil
+	}
+	line := func(p token.Pos) int { return fset.PositionFor(p, false).Line }
+	var out []declSpan
+	add := func(name *ast.Ident, doc *ast.CommentGroup, from, to token.Pos) {
+		if doc != nil {
+			from = doc.Pos()
+		}
+		out = append(out, declSpan{name: name.Name, line: line(name.Pos()), first: line(from), last: line(to - 1)})
+	}
+	for _, d := range f.Decls {
+		switch d := d.(type) {
+		case *ast.FuncDecl:
+			add(d.Name, d.Doc, d.Pos(), d.End())
+		case *ast.GenDecl:
+			if d.Tok != token.TYPE {
+				continue
+			}
+			for _, s := range d.Specs {
+				ts := s.(*ast.TypeSpec)
+				if d.Lparen.IsValid() {
+					add(ts.Name, ts.Doc, ts.Pos(), ts.End())
+				} else {
+					add(ts.Name, d.Doc, d.Pos(), d.End())
+				}
+			}
+		}
+	}
+	return out
+}
+
+// side is one tree of a change with each file read once (20): what the scan
+// did not list, or a checkout has deleted since (16), reads as empty.
+type side struct {
+	name   string // "base" or "head", for errors
+	tree   scan.Tree
+	list   []string // the scan's listing, read at the first file
+	listed bool
+	files  map[string]*sideFile
+}
+
+// sideFile is one file of a side: its text, cut into lines as Syntax cuts them,
+// and, once asked for, its colour and its declarations' spans.
+type sideFile struct {
+	text   []byte
+	lines  []string
+	syntax [][]int
+	spans  []declSpan
+	parsed bool
+}
+
+func newSide(name string, t scan.Tree) *side {
+	return &side{name: name, tree: t, files: map[string]*sideFile{}}
+}
+
+// keep gives the side a file it has already read, with its colour: the head
+// files the View inlines.
+func (s *side) keep(p string, text []byte, syntax [][]int) {
+	s.files[p] = &sideFile{text: text, lines: strings.Split(string(text), "\n"), syntax: syntax}
+}
+
+func (s *side) file(p string) (*sideFile, error) {
+	if f, ok := s.files[p]; ok {
+		return f, nil
+	}
+	if !filepath.IsLocal(filepath.FromSlash(p)) {
+		return nil, fmt.Errorf("source path %q is outside the repository", p)
+	}
+	if !s.listed {
+		list, _, err := s.tree.Files()
+		if err != nil {
+			return nil, fmt.Errorf("list %s files: %w", s.name, err)
+		}
+		s.list, s.listed = list, true
+	}
+	var b []byte
+	if _, ok := slices.BinarySearch(s.list, p); ok {
+		var err error
+		if b, err = s.tree.ReadFile(p); errors.Is(err, fs.ErrNotExist) {
+			b = nil
+		} else if err != nil {
+			return nil, fmt.Errorf("read %s %s: %w", s.name, p, err)
+		}
+	}
+	s.keep(p, b, nil)
+	return s.files[p], nil
+}
+
+func (f *sideFile) colour() [][]int {
+	if f.syntax == nil {
+		f.syntax = Syntax(f.text)
+	}
+	return f.syntax
+}
+
+// at is the span of the declaration named name whose name is on line.
+func (f *sideFile) at(name string, line int) (declSpan, bool) {
+	if !f.parsed {
+		f.spans, f.parsed = declSpans(f.text), true
+	}
+	i := slices.IndexFunc(f.spans, func(s declSpan) bool { return s.line == line && s.name == name })
+	if i < 0 {
+		return declSpan{}, false
+	}
+	return f.spans[i], true
+}
+
+// written is one place a declaration is written: its file, path and span.
+type written struct {
+	path string
+	f    *sideFile
+	declSpan
+}
+
+func (t *written) lines() []string {
+	if t == nil {
+		return nil
+	}
+	return t.f.lines[t.first-1 : t.last]
+}
+
+// textsOf is each place n is written on s, or false when one is not where
+// the IR says (a file that no longer parses).
+func textsOf(s *side, n *ir.Node) ([]*written, bool, error) {
+	if n == nil {
+		return nil, true, nil
+	}
+	name := strings.TrimPrefix(n.ID, n.Parent+".")
+	var out []*written
+	for _, l := range n.Locations {
+		f, err := s.file(l.Path)
+		if err != nil {
+			return nil, false, err
+		}
+		sp, ok := f.at(name, l.Line)
+		if !ok {
+			return nil, false, nil
+		}
+		out = append(out, &written{l.Path, f, sp})
+	}
+	return out, true, nil
+}
+
+// pair matches a declaration's texts at Base with its texts at head: each
+// with an equal text, in its own file before another (a text the change kept,
+// or moved), then with a text in its file, in order, then the rest in order.
+// A text left over pairs with nil. Pairs follow Base's order, then head's
+// texts left over.
+func pair(base, head []*written) [][2]*written {
+	partner := make([]int, len(base))
+	for i := range partner {
+		partner[i] = -1
+	}
+	used := make([]bool, len(head))
+	// match pairs each Base text still alone with the first head text left
+	// that ok takes.
+	match := func(ok func(b, h *written) bool) {
+		for i, b := range base {
+			for k, h := range head {
+				if partner[i] < 0 && !used[k] && ok(b, h) {
+					partner[i], used[k] = k, true
+				}
+			}
+		}
+	}
+	equal := func(b, h *written) bool { return slices.Equal(b.lines(), h.lines()) }
+	match(func(b, h *written) bool { return b.path == h.path && equal(b, h) })
+	match(equal)
+	match(func(b, h *written) bool { return b.path == h.path })
+	match(func(_, _ *written) bool { return true })
+	var out [][2]*written
+	for i, b := range base {
+		p := [2]*written{b, nil}
+		if partner[i] >= 0 {
+			p[1] = head[partner[i]]
+		}
+		out = append(out, p)
+	}
+	for k, h := range head {
+		if !used[k] {
+			out = append(out, [2]*written{nil, h})
+		}
+	}
+	return out
+}
+
+// declDiffs gives each drawn declaration the change modified, removed or
+// moved the diff of each of its texts the change did not keep (20). An added
+// declaration has none: its text is head's, which the Code panel shows (19).
+func declDiffs(v *View, baseByID, headByID map[string]*ir.Node, bs, hs *side) (map[string][]DeclDiff, error) {
+	out := map[string][]DeclDiff{}
+	for _, n := range v.Nodes {
+		var b, h *ir.Node
+		switch {
+		case n.Kind != string(ir.KindType) && n.Kind != string(ir.KindFunction):
+			continue
+		case n.MovedFrom != "":
+			b, h = baseByID[n.MovedFrom], headByID[n.ID]
+		case n.Status == string(diff.Modified):
+			b, h = baseByID[n.ID], headByID[n.ID]
+		case n.Status == string(diff.Removed):
+			b = baseByID[n.ID]
+		default:
+			continue
+		}
+		bt, bok, err := textsOf(bs, b)
+		if err != nil {
+			return nil, err
+		}
+		ht, hok, err := textsOf(hs, h)
+		if err != nil {
+			return nil, err
+		}
+		if !bok || !hok {
+			continue
+		}
+		for _, p := range pair(bt, ht) {
+			if p[0] != nil && p[1] != nil && slices.Equal(p[0].lines(), p[1].lines()) {
+				continue
+			}
+			out[n.ID] = append(out[n.ID], declDiff(p[0], p[1]))
+		}
+	}
+	return out, nil
+}
+
+func declDiff(b, h *written) DeclDiff {
+	ops := edits(b.lines(), h.lines())
+	d := DeclDiff{Hunk: hunkOf(ops, 0, len(ops))}
+	var baseRuns, headRuns [][]int
+	if b != nil {
+		d.BasePath, d.BaseStart, baseRuns = b.path, b.first, b.f.colour()
+	}
+	if h != nil {
+		d.HeadPath, d.HeadStart, headRuns = h.path, h.first, h.f.colour()
+	}
+	colour(&d.Hunk, baseRuns, headRuns)
+	return d
+}
+
+// colour gives each line of h its runs (Syntax) in its side's file: a "-"
+// line Base's, the others head's.
+func colour(h *Hunk, base, head [][]int) {
+	runs := func(r [][]int, n int) []int {
+		if n >= 1 && n <= len(r) {
+			return r[n-1]
+		}
+		return []int{}
+	}
+	b, hd := h.BaseStart, h.HeadStart
+	h.Syntax = make([][]int, len(h.Lines))
+	for i, l := range h.Lines {
+		switch l[0] {
+		case '-':
+			h.Syntax[i] = runs(base, b)
+			b++
+		case '+':
+			h.Syntax[i] = runs(head, hd)
+			hd++
+		default:
+			h.Syntax[i] = runs(head, hd)
+			b, hd = b+1, hd+1
+		}
+	}
+}
diff --git a/internal/export/hunks.go b/internal/export/hunks.go
index ec7cecb..1018bac 100644
--- a/internal/export/hunks.go
+++ b/internal/export/hunks.go
@@ -8,12 +8,15 @@ const contextLines = 3
 // Hunk is one region of a unified line diff. Each line carries its marker:
 // " " unchanged, "-" only in base, "+" only in head. A side with no lines
 // starts at the line before the hunk, as in unified diff (0 for an empty file).
+// A Change View colours each line (20): Syntax holds the runs of the line's
+// text after its marker, as export.Syntax gives them in its side's file.
 type Hunk struct {
 	BaseStart int      `json:"baseStart"`
 	BaseLines int      `json:"baseLines"`
 	HeadStart int      `json:"headStart"`
 	HeadLines int      `json:"headLines"`
 	Lines     []string `json:"lines"`
+	Syntax    [][]int  `json:"syntax,omitempty"`
 }
 
 // Hunks diffs base against head line by line (Myers) and groups the changes
diff --git a/internal/export/view.go b/internal/export/view.go
index f1b8d8c..06108a6 100644
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -37,6 +37,9 @@ type View struct {
 	Metrics *Metrics `json:"metrics,omitempty"`
 	// Near is a Change View's unchanged neighbours, for the Screen (18).
 	Near *Near `json:"near,omitempty"`
+	// DeclDiffs is a Change View's diff of each declaration the change
+	// modified, removed or moved, by its id (20).
+	DeclDiffs map[string][]DeclDiff `json:"declDiffs,omitempty"`
 }
 
 // Near is what a Change View's Screen draws beside Nodes and Edges (18): the
```

- [x] **Run:** `go test ./internal/export -run TestChangeGolden -update` Expected: PASS (it rewrites the Change View golden, which gains `declDiffs` for the seven declarations and `syntax` on each hunk, 512 lines; review the diff, which adds no other key)

- [x] **Run:** `go test ./... && cd web && npx vitest run && npm run typecheck` Expected: PASS

- [x] **Commit:** `Diff each changed declaration whole, and colour every hunk`

---

### Task 3: The panel draws a declaration's own diff, coloured, and opens at its top (`Panel.tsx`, `code.ts`)

The unit tests check:
- `numbered` numbers a hunk's rows at Base and at head from its starts: a `+` row has no Base line, a `-` row no head line;
- each Go colour reads at 4.5:1 on `--add-bg` and `--del-bg`, light and dark;
- the CSS colours each class in `.hunk` as in `.source`, and `.hunk.decl` is at most 60vh high and scrolls.

`web/e2e/diffcode.mjs` (new, `npm run accept-diff-code`) runs in Chromium, Firefox and WebKit, on the shop's Change View as `zu diff -html` writes it, and in `zu serve -base main` on a git copy of the shop whose branch makes the golden's change:
- **modified:** `store.Repo.Get`'s panel shows "Declaration diff" first, then "Changes in internal/store/store.go", its calls, its callers. The diff's header reads "base internal/store/store.go:42–49 → head internal/store/store.go:36–44", and its rows, Base line, head line and marker, run `42|36` to `49|44` with `|42+`. Its first keyword is `func`, in `kw`, and the file's hunks are coloured too (`type`). The code at head is drawn under them;
- **top:** `Get`'s panel opens at its top, its declaration diff whole in view. Only the code has scrolled, to `Get`'s line, which sits in its box (the panel is taller than the window, and `store.go` than its box);
- **removed:** `store.ReadWriter`'s panel shows "base internal/store/store.go:18–22", rows `18|-` to `22|-`, and no code; it lists no row;
- **moved:** `money.Plus` shows "base internal/money/money.go:13–14 → head internal/money/money.go:17–18", rows `13|17 `, `14|-`, `|18+`;
- each again in `zu serve -base` (**served**);
- **far**, in `zu serve` only: its copy of the shop also has `Far`, in `internal/store/far.go`. `Far`'s diff is 77 rows long, and the branch changes its rows 74 and 75, below what its box shows from its top. Its diff opens scrolled to them, both in the box, and the panel at its top;
- no page errors.

**Files:**
- Tests: `web/src/code.test.ts`, `web/src/styles.test.ts`, `web/e2e/diffcode.mjs` (new), `web/e2e/package.json`
- Code: `web/src/code.ts`, `web/src/data.ts`, `web/src/Panel.tsx`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing tests and browser checks**

```diff
diff --git a/web/e2e/diffcode.mjs b/web/e2e/diffcode.mjs
new file mode 100644
index 0000000..6921e12
--- /dev/null
+++ b/web/e2e/diffcode.mjs
@@ -0,0 +1,203 @@
+// Browser acceptance for Diff Code (20): in a Change View, a changed
+// declaration's own diff first, numbered and coloured, in view when its
+// panel opens, at its first change, before its file's hunks, coloured too,
+// and a removed declaration's text at base, in zu diff -html's page and in zu
+// serve -base.
+// Not part of make check: it needs browsers and a bin/zu built with the UI.
+// Run from web/e2e after `make build`: npm run accept-diff-code.
+// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
+import { execFileSync, spawn } from "node:child_process";
+import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+import { chromium, firefox, webkit } from "playwright-core";
+
+const here = new URL(".", import.meta.url).pathname;
+const benign = (e) => e.message === "ResizeObserver loop completed with undelivered notifications."; // serve.mjs
+const dir = mkdtempSync(join(tmpdir(), "zu-diffcode-"));
+const servers = [];
+process.on("exit", () => {
+  for (const s of servers) s.kill();
+  rmSync(dir, { recursive: true, force: true });
+});
+
+// page writes the shop's Change View into the built page, as zu diff -html does.
+const page = (() => {
+  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
+  const marker = '<script id="zu-data" type="application/json">{}</script>';
+  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
+  const v = readFileSync(join(here, "../../internal/export/testdata/shop.change.golden.json"), "utf8");
+  const f = join(dir, "change.html");
+  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(JSON.parse(v)).replaceAll("<", "\\u003c"))));
+  return "file://" + f;
+})();
+
+// served: zu serve -base main on a git copy of the shop whose branch makes
+// the edits the Change View golden makes (internal/export change_test.go
+// changeView), so both pages show the same, and changes Far, which only it
+// has.
+const repo = join(dir, "shop");
+cpSync(join(here, "../../internal/scan/testdata/shop"), repo, { recursive: true });
+// farGo is a function longer than its declaration diff's box shows, whose
+// change is on its diff's rows 74 and 75.
+const farGo = (n) => `package store\n\n// Far is longer than its diff's box.\nfunc Far() int {\n\tn := 0\n${"\tn++\n".repeat(70)}\tn += ${n}\n\treturn n\n}\n`;
+writeFileSync(join(repo, "internal/store/far.go"), farGo(1));
+const git = (...a) => execFileSync("git", ["-c", "user.name=zu", "-c", "user.email=zu@example.com", ...a], { cwd: repo });
+git("init", "-q", "-b", "main");
+git("add", "-A");
+git("commit", "-q", "-m", "base");
+git("checkout", "-q", "-b", "feat");
+const edit = (rel, old, repl) => {
+  const f = join(repo, rel);
+  const s = readFileSync(f, "utf8");
+  if (!s.includes(old)) throw new Error(`${rel} has no ${JSON.stringify(old)}`);
+  writeFileSync(f, s.replace(old, repl));
+};
+edit("internal/money/money.go", "func Add(", "func Plus(");
+edit("internal/checkout/checkout.go", "sum = Add(sum", "sum = Plus(sum");
+edit("main.go", '"example.com/shop/internal/checkout"', '"example.com/shop/internal/checkout"\n\t"example.com/shop/internal/money"');
+edit("main.go", "fmt.Println(checkout.Total(nil))", "fmt.Println(checkout.Total(nil), money.Zero)");
+edit("internal/store/store.go", "\tr.hook()\n", "\tr.hook()\n\tr.hook()\n");
+edit("internal/store/store.go", "// ReadWriter reads and writes orders.\ntype ReadWriter interface {\n\tReader\n\tPut(o Order) error\n}\n", "");
+edit("internal/store/store.go", '\n\t"example.com/shop/internal/money"\n', "\n");
+edit("internal/store/store.go", "Total money.Cents", "Total int64");
+edit("internal/store/store.go", "\t_ = money.Add(o.Total, money.Zero)\n", "");
+edit("internal/money/money.go", "package money\n", 'package money\n\nimport "example.com/shop/internal/store"\n\nvar _ store.Order\n');
+edit("internal/store/register.go", "func register() { _ = dialect() }", "func register() {\n\t_ = dialect()\n}");
+writeFileSync(join(repo, "internal/store/far.go"), farGo(2));
+let log = "";
+const served = await new Promise((ok, fail) => {
+  const s = spawn(join(here, "../../bin/zu"), ["serve", repo, "-base", "main", "-addr", "127.0.0.1:0"], { stdio: ["ignore", "pipe", "pipe"] });
+  servers.push(s);
+  s.stderr.on("data", (d) => (log += d));
+  s.stdout.once("data", (d) => ok(String(d).trim()));
+  s.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
+});
+
+const S = "example.com/shop/internal/store";
+const M = "example.com/shop/internal/money";
+const enc = encodeURIComponent;
+
+async function open(b, url) {
+  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
+  const errors = [];
+  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
+  await p.goto(url);
+  return { p, errors };
+}
+// own is what the panel's declaration diffs show: each one's sides, its rows
+// as "base|head marker", whether Go is coloured in it and in the file's
+// hunks, the panel's section titles in order, and whether it draws the code
+// at head.
+const own = (p) => p.locator("aside.panel pre.hunk.decl").first().waitFor({ timeout: 10000 }).then(() => p.evaluate(() => {
+  const pres = [...document.querySelectorAll("aside.panel pre.hunk.decl")];
+  const row = (d) => {
+    const [b, h] = d.querySelectorAll(".ln");
+    return `${b.textContent}|${h.textContent}${d.textContent.slice(b.textContent.length + h.textContent.length)[0]}`;
+  };
+  return {
+    at: [...document.querySelectorAll("aside.panel .decl-at")].map((e) => e.textContent),
+    rows: pres.map((pre) => [...pre.children].map(row)),
+    kw: [document.querySelector("aside.panel pre.hunk.decl .kw")?.textContent, document.querySelector("aside.panel pre.hunk:not(.decl) .kw")?.textContent],
+    order: [...document.querySelectorAll("aside.panel section > h3")].map((h) => h.textContent.replace(/ \(\d+\)$/, "").replace(/ · on the host$/, "")),
+    code: document.querySelector("aside.panel pre.source") !== null,
+  };
+}));
+const settle = (p) => p.waitForTimeout(300);
+
+// modified: Get's own diff first, then its file's hunks, then its rows and
+// its code at head.
+async function modified(b, url) {
+  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
+  const first = await own(p);
+  await p.close();
+  return { got: [first.at, first.rows, first.kw, first.order, first.code], errors };
+}
+
+// top: Get's panel opens at its top, its own diff in view. Only the code
+// scrolls, to Get's line: drawn last, it is the panel's longest part.
+async function top(b, url) {
+  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
+  await own(p);
+  await p.locator("aside.panel pre.source .hit").waitFor({ timeout: 10000 });
+  await settle(p);
+  const got = await p.evaluate(() => {
+    const [panel, diff, code] = ["aside.panel", "aside.panel pre.hunk.decl", "aside.panel pre.source"].map((s) => document.querySelector(s));
+    const [a, d, c, h] = [panel, diff, code, code.querySelector(".hit")].map((e) => e.getBoundingClientRect());
+    return [panel.scrollTop, d.top >= a.top && d.bottom <= a.bottom, code.scrollTop > 0 && h.top >= c.top && h.bottom <= c.bottom];
+  });
+  await p.close();
+  return { got, errors };
+}
+
+// removed: ReadWriter's text at base, and no code. The tree draws no
+// unchanged neighbour, so its panel lists no row (18).
+async function removed(b, url) {
+  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.ReadWriter`)}`);
+  const first = await own(p);
+  const rows = await p.locator("aside.panel li").count();
+  await p.close();
+  return { got: [first.at, first.rows, first.code, rows], errors };
+}
+
+// moved: a Move's diff is its source's text at base against its own.
+async function moved(b, url) {
+  const { p, errors } = await open(b, `${url}#f=${enc(M)}&s=${enc(`${M}.Plus`)}`);
+  const first = await own(p);
+  await p.close();
+  return { got: [first.at, first.rows], errors };
+}
+
+// far (zu serve only): Far's diff opens scrolled to its change, which lies
+// below the rows its box shows from its top; the panel stays at its top.
+async function far(b, url) {
+  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.Far`)}`);
+  await own(p);
+  await settle(p);
+  const got = await p.evaluate(() => {
+    const [panel, diff] = ["aside.panel", "aside.panel pre.hunk.decl"].map((s) => document.querySelector(s));
+    const d = diff.getBoundingClientRect();
+    const seen = [...diff.querySelectorAll(".add, .del")].filter((e) => {
+      const r = e.getBoundingClientRect();
+      return r.top >= d.top && r.bottom <= d.bottom;
+    });
+    return [panel.scrollTop, diff.scrollTop > 0, seen.length];
+  });
+  await p.close();
+  return { got, errors };
+}
+
+const GET = ["base internal/store/store.go:42–49 → head internal/store/store.go:36–44"];
+const GET_ROWS = [["42|36 ", "43|37 ", "44|38 ", "45|39 ", "46|40 ", "47|41 ", "|42+", "48|43 ", "49|44 "]];
+const SECTIONS = ["Declaration diff", "Changes in internal/store/store.go", "Calls and embeds out", "Called or embedded by"];
+const want = {
+  modified: [GET, GET_ROWS, ["func", "type"], SECTIONS, true],
+  top: [0, true, true],
+  removed: [["base internal/store/store.go:18–22"], [["18|-", "19|-", "20|-", "21|-", "22|-"]], false, 0],
+  moved: [["base internal/money/money.go:13–14 → head internal/money/money.go:17–18"], [["13|17 ", "14|-", "|18+"]]],
+};
+for (const k of Object.keys(want)) want[`served ${k}`] = want[k]; // zu serve -base: the branch's change
+want["served far"] = [0, true, 2];
+want.errors = [];
+const parts = { modified, top, removed, moved };
+// Each part on its own, so one that fails hides no other: on both pages,
+// then far on zu serve's.
+const runs = [...Object.entries(parts).flatMap(([k, run]) => [[k, run, page], [`served ${k}`, run, served]]), ["served far", far, served]];
+const channel = process.env.ZU_E2E_CHANNEL;
+const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
+let failed = 0;
+for (const [name, type, opts] of engines) {
+  const b = await type.launch(opts);
+  const got = { errors: [] };
+  for (const [key, run, url] of runs) {
+    const x = await run(b, url).catch((e) => ({ errors: [`${key}: ${String(e.message ?? e).split("\n")[0]}`] }));
+    got[key] = x.got;
+    got.errors.push(...x.errors);
+  }
+  await b.close().catch(() => {});
+  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
+  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
+  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
+  failed += bad.length;
+}
+process.exit(failed ? 1 : 0);
diff --git a/web/e2e/package.json b/web/e2e/package.json
index 25ba7b1..44d7e91 100644
--- a/web/e2e/package.json
+++ b/web/e2e/package.json
@@ -8,7 +8,8 @@
     "accept-serve": "node serve.mjs",
     "accept-place": "node place.mjs",
     "accept-screen": "node screen.mjs",
-    "accept-code": "node code.mjs"
+    "accept-code": "node code.mjs",
+    "accept-diff-code": "node diffcode.mjs"
   },
   "devDependencies": {
     "playwright-core": "1.63.0"
diff --git a/web/src/code.test.ts b/web/src/code.test.ts
index 891f63d..f3d730f 100644
--- a/web/src/code.test.ts
+++ b/web/src/code.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
-import type { Loc, SourceFile, View, ViewEdge } from "./data";
-import { around, behind, centre, CODE_LINES, inline, litNote, paint, reader } from "./code";
+import type { DeclDiff, Loc, SourceFile, View, ViewEdge } from "./data";
+import { around, behind, centre, CODE_LINES, inline, litNote, numbered, paint, reader } from "./code";
 import { decl, pkgs, view } from "./testkit";
 
 const shop = golden as unknown as View;
@@ -133,3 +133,24 @@ describe("litNote (19)", () => {
     expect(litNote([], "a.go")).toBe("The change removed it: it has no line in head.");
   });
 });
+
+// 20: store.Repo.Get's own diff in the shop's Change View: one line added.
+const get: DeclDiff = {
+  basePath: "s.go", headPath: "s.go", baseStart: 42, baseLines: 3, headStart: 36, headLines: 3,
+  lines: [" func Get() {", "-\tr.check()", "+\tr.hook()", " }"],
+};
+
+describe("numbered (20)", () => {
+  it("numbers each line at base and at head, as the diff runs", () => {
+    expect(numbered(get)).toEqual([
+      { mark: " ", text: "func Get() {", base: 42, head: 36 },
+      { mark: "-", text: "\tr.check()", base: 43 },
+      { mark: "+", text: "\tr.hook()", head: 37 },
+      { mark: " ", text: "}", base: 44, head: 38 },
+    ]);
+  });
+  it("numbers a removed declaration at base only", () => {
+    const gone: DeclDiff = { basePath: "s.go", baseStart: 18, baseLines: 2, headStart: 0, headLines: 0, lines: ["-type R interface {", "-}"] };
+    expect(numbered(gone).map((r) => [r.base, r.head])).toEqual([[18, undefined], [19, undefined]]);
+  });
+});
diff --git a/web/src/styles.test.ts b/web/src/styles.test.ts
index 38903d8..8b1d1bd 100644
--- a/web/src/styles.test.ts
+++ b/web/src/styles.test.ts
@@ -84,6 +84,29 @@ describe.each([["light", light], ["dark", dark]])("Go colours, %s", (_, t) => {
   });
 });
 
+// 20: hunks and declaration diffs are coloured too, on their added and
+// removed lines.
+describe.each([["light", light], ["dark", dark]])("Go colours in diffs, %s", (_, t) => {
+  it("keep text at 4.5:1 on added and removed lines", () => {
+    const low: string[] = [];
+    for (const k of ["syn-kw", "syn-com", "syn-str", "syn-num", "fg"]) {
+      for (const bg of ["add-bg", "del-bg"]) {
+        if (contrast(t[k], t[bg]) < 4.5) low.push(`${k} on ${bg} ${contrast(t[k], t[bg]).toFixed(2)}`);
+      }
+    }
+    expect(low).toEqual([]);
+  });
+});
+
+describe("Go colours' rules in diffs (20)", () => {
+  it("colour each class code.ts paints in a hunk", () => {
+    for (const c of ["kw", "com", "str", "num"]) expect(css).toMatch(new RegExp(`\\.hunk \\.${c}[,\\s][^{]*\\{[^}]*color: var\\(--syn-${c}\\)`));
+  });
+  it("scroll a declaration diff alone", () => {
+    expect(css).toMatch(/\.hunk\.decl \{[^}]*max-height: 60vh[^}]*overflow: auto/);
+  });
+});
+
 describe("Go colours' rules (19)", () => {
   it("colour each class code.ts paints", () => {
     for (const c of ["kw", "com", "str", "num"]) expect(css).toMatch(new RegExp(`\\.source \\.${c} \\{[^}]*color: var\\(--syn-${c}\\)`));
```

- [ ] **Run:** `cd web && npx vitest run src/code.test.ts src/styles.test.ts` Expected: FAIL (`numbered` is not a function; no `.hunk .kw` or `.hunk.decl` rule. The contrast checks on `--add-bg` and `--del-bg` already pass: the colours are 19's)

- [ ] **Run:** `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node diffcode.mjs` Expected: FAIL (0/10 checks in each engine: no panel draws a declaration diff, so each part's wait for one times out after 10 s. `tsc` fails on the red unit tests, so this step builds with `vite build`, which skips it, as 19's Task 3 does)

- [ ] **Draw each declaration diff, numbered and coloured, scrolled to its first change; colour the hunks; and scroll only the code to its line**

```diff
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index 0b4a9fa..b7543f8 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -1,7 +1,7 @@
 import { useEffect, useMemo, useRef, useState } from "react";
 import type { Bundle } from "./bundle";
-import { around, behind, centre, inline, litNote, paint, type Read } from "./code";
-import type { Hunk, Loc, SourceFile, View, ViewEdge, ViewNode } from "./data";
+import { around, behind, centre, inline, litNote, numbered, paint, type Read } from "./code";
+import type { DeclDiff, Hunk, Loc, SourceFile, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, insideDecl, targets, type Row } from "./facts";
 import { isGroup, isStrip, rankNote } from "./group";
 import { diffLink, fileDiffLink, linkFor } from "./links";
@@ -83,7 +83,8 @@ function Where({ view, loc, removed = false }: { view: View; loc: Loc; removed?:
   );
 }
 
-// Hunks renders line diffs as React text children only, like Source.
+// Hunks renders line diffs as React text children only, like Source,
+// coloured (20).
 function Hunks({ view, path, hunks }: { view: View; path: string; hunks: Hunk[] }) {
   const href = fileDiffLink(view.links, path);
   return (
@@ -100,27 +101,109 @@ function Hunks({ view, path, hunks }: { view: View; path: string; hunks: Hunk[]
         )}
       </h3>
       {hunks.map((h) => (
-        <pre key={`${h.baseStart},${h.headStart}`} className="hunk">
-          <div className="hh">
-            @@ −{h.baseStart},{h.baseLines} +{h.headStart},{h.headLines} @@
-          </div>
-          {h.lines.map((l, i) => (
-            <div key={i} className={l[0] === "+" ? "add" : l[0] === "-" ? "del" : undefined}>
-              {l}
-            </div>
+        <HunkLines key={`${h.baseStart},${h.headStart}`} hunk={h} />
+      ))}
+    </section>
+  );
+}
+
+const lineClass = (mark: string) => (mark === "+" ? "add" : mark === "-" ? "del" : undefined);
+
+function HunkLines({ hunk: h }: { hunk: Hunk }) {
+  const segs = useMemo(() => paint(h.lines.map((l) => l.slice(1)), h.syntax ?? []), [h]);
+  return (
+    <pre className="hunk">
+      <div className="hh">
+        @@ −{h.baseStart},{h.baseLines} +{h.headStart},{h.headLines} @@
+      </div>
+      {h.lines.map((l, i) => (
+        <div key={i} className={lineClass(l[0])}>
+          {l[0]}
+          {segs[i].map((s, j) => (
+            <span key={j} className={s.cls}>
+              {s.text}
+            </span>
           ))}
-        </pre>
+        </div>
+      ))}
+    </pre>
+  );
+}
+
+// where is a declaration diff's side: path:first–last.
+const where = (path: string, start: number, n: number) => `${path}:${n > 1 ? `${start}–${start + n - 1}` : start}`;
+
+// DeclDiffs draws a declaration's own diffs (20), first in its Change.
+function DeclDiffs({ diffs }: { diffs: DeclDiff[] }) {
+  return (
+    <section>
+      <h3>Declaration diff</h3>
+      {diffs.map((d) => (
+        <OwnDiff key={`${d.basePath}\n${d.baseStart}\n${d.headPath}\n${d.headStart}`} diff={d} />
       ))}
     </section>
   );
 }
 
+// OwnDiff is one declaration diff, numbered at base and at head and
+// coloured as React text only, scrolled to its first change. Of one longer
+// than CODE_LINES it draws those around that change, as Code does.
+function OwnDiff({ diff: d }: { diff: DeclDiff }) {
+  const pre = useRef<HTMLPreElement>(null);
+  const rows = useMemo(() => numbered(d), [d]);
+  const changed = rows.findIndex((r) => r.mark !== " ") + 1; // counted from 1, as around counts
+  const [from, to] = around(rows.length, changed);
+  const segs = useMemo(
+    () => paint(rows.slice(from, to).map((r) => r.text), (d.syntax ?? []).slice(from, to)),
+    [rows, d.syntax, from, to],
+  );
+  // The diff alone scrolls, to its first change, as Code to its marked line.
+  // Each View brings its diffs as new objects (13), and another diff is
+  // another OwnDiff (DeclDiffs keys them by their sides): scrolled again only
+  // when its change moves, a diff stays where the reader scrolled it through
+  // a redraw.
+  useEffect(() => {
+    const el = pre.current?.children[changed - 1 - from] as HTMLElement | undefined;
+    if (pre.current && el) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 2;
+  }, [changed]);
+  const sides = [
+    d.basePath && `base ${where(d.basePath, d.baseStart, d.baseLines)}`,
+    d.headPath && `head ${where(d.headPath, d.headStart, d.headLines)}`,
+  ].filter(Boolean);
+  return (
+    <>
+      <p className="decl-at">
+        <code>{sides.join(" → ")}</code>
+      </p>
+      {to - from < rows.length && <p className="muted window-note">{`Lines ${from + 1}–${to} of ${rows.length}.`}</p>}
+      <pre ref={pre} className="hunk decl">
+        {segs.map((ss, k) => {
+          const r = rows[from + k];
+          return (
+            <div key={from + k} className={lineClass(r.mark)}>
+              <span className="ln">{r.base}</span>
+              <span className="ln">{r.head}</span>
+              {r.mark}
+              {ss.map((s, j) => (
+                <span key={j} className={s.cls}>
+                  {s.text}
+                </span>
+              ))}
+            </div>
+          );
+        })}
+      </pre>
+    </>
+  );
+}
+
 function dir(path: string): string {
   return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
 }
 
 // Change is what zu diff says about one node: status, Move, hop, and the
-// hunks of its file (a declaration) or of its directory (a package).
+// hunks of its file (a declaration) or of its directory (a package); before
+// them, a declaration's own diff (20).
 function Change({ view, node }: { view: View; node: ViewNode }) {
   if (view.kind !== "change") return null;
   const facts = [
@@ -129,6 +212,7 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
     node.hop !== undefined && (node.hop === 0 ? "changed (hop 0)" : `affected, ${node.hop} hop${node.hop > 1 ? "s" : ""} from a change`),
   ].filter(Boolean);
   const hunks = view.hunks ?? {};
+  const own = view.declDiffs?.[node.id] ?? [];
   const href = diffLink(view.links, node.id); // 14: its first changed line there
   const files =
     node.kind === "package"
@@ -152,6 +236,7 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
           </a>
         </p>
       )}
+      {own.length > 0 && <DeclDiffs diffs={own} />}
       {files.map((p) => (
         <Hunks key={p} view={view} path={p} hunks={hunks[p]} />
       ))}
@@ -182,11 +267,13 @@ function Code({ file, line, lit }: { file: SourceFile; line: number; lit: Loc[]
   if (held.marked !== marked || held.at !== at) setHeld({ marked, at });
   const [from, to] = around(all.length, at);
   const lines = useMemo(() => paint(all.slice(from, to), file.syntax.slice(from, to)), [all, from, to]);
+  // The code alone scrolls, to its marked line and to the first lit line:
+  // scrolling the panel would move the row the reader points at, and carry
+  // what the panel draws first (20: a declaration diff) out of view.
   useEffect(() => {
-    mark.current?.scrollIntoView({ block: "center" });
+    const el = mark.current;
+    if (pre.current && el) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 2;
   }, [file.path, file.text, line]);
-  // The code alone scrolls to the first lit line: scrolling the panel would
-  // move the row the reader points at.
   useEffect(() => {
     const el = pre.current?.children[first - 1 - from] as HTMLElement | undefined;
     if (pre.current && el) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 2;
diff --git a/web/src/code.ts b/web/src/code.ts
index 44c4fca..75479ba 100644
--- a/web/src/code.ts
+++ b/web/src/code.ts
@@ -2,7 +2,7 @@
 // the page only cuts each line into those runs and draws them as React text,
 // never as markup.
 import { cmp } from "./cut";
-import type { Loc, SourceFile, View } from "./data";
+import type { Hunk, Loc, SourceFile, View } from "./data";
 
 // Seg is a run of one line's text, coloured by cls when zu coloured it.
 export type Seg = { text: string; cls?: string };
@@ -92,6 +92,21 @@ export function litNote(places: Loc[] | null, path: string): string {
   return `${out.join("; ")}.`;
 }
 
+// Numbered is a diff line as a declaration diff draws it (20): its marker,
+// its text, and its line at base (not on a "+" line) and at head (not on a
+// "-" line).
+export type Numbered = { mark: string; text: string; base?: number; head?: number };
+
+export function numbered(h: Hunk): Numbered[] {
+  let [b, hd] = [h.baseStart, h.headStart];
+  return h.lines.map((l) => {
+    const n: Numbered = { mark: l[0], text: l.slice(1) };
+    if (n.mark !== "+") n.base = b++;
+    if (n.mark !== "-") n.head = hd++;
+    return n;
+  });
+}
+
 // Read gives a file zu serve sends on demand (19), or null.
 export type Read = (path: string) => Promise<SourceFile | null>;
 
diff --git a/web/src/data.ts b/web/src/data.ts
index 3198a26..e79d4d4 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -18,7 +18,14 @@ export type ViewEdge = {
   more?: Loc[]; // 19: a call's or an embed's locations after loc
 };
 export type Ref = { commit: string; dirty: boolean };
-export type Hunk = { baseStart: number; baseLines: number; headStart: number; headLines: number; lines: string[] };
+// 20: a Change View colours each line, syntax being the runs of its text
+// after the marker (code.ts paint).
+export type Hunk = {
+  baseStart: number; baseLines: number; headStart: number; headLines: number; lines: string[]; syntax?: number[][];
+};
+// DeclDiff is a changed declaration's own diff (20, export.DeclDiff): its text
+// at base against its text at head, whole. A removed one has no headPath.
+export type DeclDiff = Hunk & { basePath?: string; headPath?: string };
 export type Violation = { rule: "levels" | "cycle"; from: string; to: string };
 // Proposal is one of the Policy's Proposals as internal/export writes it (07):
 // layers inner first, the ids it omits, each ranked package's layer and the
@@ -50,6 +57,9 @@ export type View = {
   // drawn one, their types' methods, and the calls and embeds among them all
   // that edges does not hold. Only the Screen reads it (screen.ts screenView).
   near?: { nodes: ViewNode[]; edges: ViewEdge[] };
+  // 20: Change View only: the own diff of each declaration the change
+  // modified, removed or moved, by id.
+  declDiffs?: Record<string, DeclDiff[]>;
   // 07, never written by zu: the box tree a Proposal draws (proposal.ts). cut.ts
   // index reads parent instead of package ids, and scene.ts labels from label.
   regroup?: { parent: Record<string, string>; label: Record<string, string> };
diff --git a/web/src/styles.css b/web/src/styles.css
index 97668d7..2ae8b0e 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -391,17 +391,21 @@ pre {
   background: var(--mark);
 }
 
-/* 19: Go's colours, by the class code.ts paints */
+/* 19: Go's colours, by the class code.ts paints; 20: in diffs too */
+.hunk .kw,
 .source .kw {
   color: var(--syn-kw);
 }
+.hunk .com,
 .source .com {
   color: var(--syn-com);
   font-style: italic;
 }
+.hunk .str,
 .source .str {
   color: var(--syn-str);
 }
+.hunk .num,
 .source .num {
   color: var(--syn-num);
 }
@@ -622,6 +626,23 @@ button.st-removed {
 .hunk .del {
   background: var(--del-bg);
 }
+/* 20: a declaration diff, numbered, scrolls alone */
+.hunk.decl {
+  position: relative;
+  max-height: 60vh;
+  overflow: auto;
+}
+.hunk .ln {
+  display: inline-block;
+  width: 3em;
+  padding-right: 6px;
+  text-align: right;
+  color: var(--dim);
+  user-select: none;
+}
+.decl-at {
+  margin-bottom: 2px;
+}
 
 
 /* Feature 05: selection, dimming, toggles and uml-viewer's triangles. The
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node diffcode.mjs` Expected: PASS (10 checks in each engine)

- [ ] **Commit:** `Draw each changed declaration's own diff, numbered and coloured, in view when its panel opens`

---

### Task 4: Pointing at a call the change removed lights its Base lines (`code.ts`, `screen.ts`, `Panel.tsx`)

The unit tests check, on 19's View, where the change removed F's call of `m.H`, written at `a.go:5`:
- `behind` gives the removed call's place, marked `base`, after head's;
- `litNote`:
  - "Base line 20." for a Base place inside a span drawn;
  - "Line 4; base line 9; in other files: b.go:2; at base: c.go:7.";
  - "At base: a.go:30, a.go:31." for Base places outside every span;
  - "At base: a.go:9." with no span drawn;
  - nothing ("") for no places;
- `litRows` lights a row by its Base line for a Base place and by its head line for a head place, each in its own side's file, and nothing for null;
- `placesOf`, in a Change View, marks Base the places of a call the change removed;
- `.hunk .lit` uses `--lit`, after `.hunk .del` so it wins over it.

`diffcode.mjs` adds, in each engine:
- **pointed:** before any pointing, the note over `Get`'s declaration diff reads the hint. Pointing at its row `store.Repo.check` lights row `48|43` in the diff and line 43 in the code, and the note reads "Line 43.";
- **base:** on `store.ReadWriter`'s Screen, pointing at the row `store.Reader` lights row `20|-`, and the note reads "Base line 20.". Moving off lights nothing, and pointing at the box `store.Reader` lights row `20|-` again;
- each again in `zu serve -base`.

**Files:**
- Tests: `web/src/code.test.ts`, `web/src/screen.test.ts`, `web/src/styles.test.ts`, `web/e2e/diffcode.mjs`
- Code: `web/src/code.ts`, `web/src/screen.ts`, `web/src/Panel.tsx`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing tests and browser checks**

```diff
diff --git a/web/e2e/diffcode.mjs b/web/e2e/diffcode.mjs
index 6921e12..04f9ad9 100644
--- a/web/e2e/diffcode.mjs
+++ b/web/e2e/diffcode.mjs
@@ -1,8 +1,9 @@
 // Browser acceptance for Diff Code (20): in a Change View, a changed
 // declaration's own diff first, numbered and coloured, in view when its
-// panel opens, at its first change, before its file's hunks, coloured too,
-// and a removed declaration's text at base, in zu diff -html's page and in zu
-// serve -base.
+// panel opens, at its first change, before its file's hunks, coloured too;
+// a removed declaration's text at base; and the base lines behind a call or
+// embed the change removed lit, from the panel's rows and from the Screen, in
+// zu diff -html's page and in zu serve -base.
 // Not part of make check: it needs browsers and a bin/zu built with the UI.
 // Run from web/e2e after `make build`: npm run accept-diff-code.
 // ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
@@ -86,9 +87,9 @@ async function open(b, url) {
   return { p, errors };
 }
 // own is what the panel's declaration diffs show: each one's sides, its rows
-// as "base|head marker", whether Go is coloured in it and in the file's
-// hunks, the panel's section titles in order, and whether it draws the code
-// at head.
+// as "base|head marker", its lit rows, the notes over code, whether Go is
+// coloured in it and in the file's hunks, the panel's section titles in
+// order, and whether it draws the code at head.
 const own = (p) => p.locator("aside.panel pre.hunk.decl").first().waitFor({ timeout: 10000 }).then(() => p.evaluate(() => {
   const pres = [...document.querySelectorAll("aside.panel pre.hunk.decl")];
   const row = (d) => {
@@ -98,11 +99,15 @@ const own = (p) => p.locator("aside.panel pre.hunk.decl").first().waitFor({ time
   return {
     at: [...document.querySelectorAll("aside.panel .decl-at")].map((e) => e.textContent),
     rows: pres.map((pre) => [...pre.children].map(row)),
+    lit: pres.flatMap((pre) => [...pre.querySelectorAll(".lit")].map(row)),
+    notes: [...document.querySelectorAll("aside.panel .lit-note")].map((e) => e.textContent),
     kw: [document.querySelector("aside.panel pre.hunk.decl .kw")?.textContent, document.querySelector("aside.panel pre.hunk:not(.decl) .kw")?.textContent],
     order: [...document.querySelectorAll("aside.panel section > h3")].map((h) => h.textContent.replace(/ \(\d+\)$/, "").replace(/ · on the host$/, "")),
     code: document.querySelector("aside.panel pre.source") !== null,
+    codeLit: [...document.querySelectorAll("aside.panel pre.source .lit .ln")].map((e) => e.textContent),
   };
 }));
+const row = (p, title, id) => p.locator("aside.panel section", { has: p.locator(`h3:text-matches("^${title}")`) }).locator("li", { hasText: id });
 const settle = (p) => p.waitForTimeout(300);
 
 // modified: Get's own diff first, then its file's hunks, then its rows and
@@ -167,19 +172,52 @@ async function far(b, url) {
   return { got, errors };
 }
 
+// pointed: over Get's diff, the hint; pointing at its call to check lights
+// the line at head in the diff and in the code, and the note says which.
+async function pointed(b, url) {
+  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
+  const first = await own(p);
+  await row(p, "Calls and embeds out", "Repo.check").hover();
+  await settle(p);
+  const lit = await own(p);
+  await p.close();
+  return { got: [first.notes, lit.lit, lit.codeLit, lit.notes], errors };
+}
+
+// base: on ReadWriter's Screen, pointing at the embed of Reader it lost, by
+// its row or its box, lights the base line it was written on.
+async function base(b, url) {
+  const { p, errors } = await open(b, `${url}#s=${enc(`${S}.ReadWriter`)}&c=${enc(`${S}.ReadWriter`)}`);
+  await own(p);
+  await row(p, "Calls and embeds out", "store.Reader").hover();
+  await settle(p);
+  const lit = await own(p);
+  await p.mouse.move(5, 5);
+  await settle(p);
+  const left = await own(p);
+  await p.locator(`.screen .react-flow__node[data-id="${`down:${S}.Reader`}"]`).hover();
+  await settle(p);
+  const box = await own(p);
+  await p.close();
+  return { got: [lit.lit, lit.notes, left.lit, box.lit, box.notes], errors };
+}
+
 const GET = ["base internal/store/store.go:42–49 → head internal/store/store.go:36–44"];
 const GET_ROWS = [["42|36 ", "43|37 ", "44|38 ", "45|39 ", "46|40 ", "47|41 ", "|42+", "48|43 ", "49|44 "]];
 const SECTIONS = ["Declaration diff", "Changes in internal/store/store.go", "Calls and embeds out", "Called or embedded by"];
+const HINT = "Point at a call or embed to light the lines it is written on.";
 const want = {
   modified: [GET, GET_ROWS, ["func", "type"], SECTIONS, true],
   top: [0, true, true],
   removed: [["base internal/store/store.go:18–22"], [["18|-", "19|-", "20|-", "21|-", "22|-"]], false, 0],
   moved: [["base internal/money/money.go:13–14 → head internal/money/money.go:17–18"], [["13|17 ", "14|-", "|18+"]]],
+  pointed: [[HINT], ["48|43 "], ["43"], ["Line 43."]],
+  base: [["20|-"], ["Base line 20."], [], ["20|-"], ["Base line 20."]],
 };
 for (const k of Object.keys(want)) want[`served ${k}`] = want[k]; // zu serve -base: the branch's change
 want["served far"] = [0, true, 2];
 want.errors = [];
-const parts = { modified, top, removed, moved };
+const parts = { modified, top, removed, moved, pointed, base };
 // Each part on its own, so one that fails hides no other: on both pages,
 // then far on zu serve's.
 const runs = [...Object.entries(parts).flatMap(([k, run]) => [[k, run, page], [`served ${k}`, run, served]]), ["served far", far, served]];
diff --git a/web/src/code.test.ts b/web/src/code.test.ts
index f3d730f..1586451 100644
--- a/web/src/code.test.ts
+++ b/web/src/code.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import type { DeclDiff, Loc, SourceFile, View, ViewEdge } from "./data";
-import { around, behind, centre, CODE_LINES, inline, litNote, numbered, paint, reader } from "./code";
+import { around, behind, centre, CODE_LINES, inline, litNote, litRows, numbered, paint, reader, type Place } from "./code";
 import { decl, pkgs, view } from "./testkit";
 
 const shop = golden as unknown as View;
@@ -110,8 +110,9 @@ describe("behind (19)", () => {
     expect(behind(lines, is("m.F"), (x) => x === "m.G" || x.startsWith("m.T"))).toEqual([at("a.go", 4), at("a.go", 6), at("a.go", 9), at("b.go", 2)]);
     expect(behind(lines, is("m.T"), is("m.E"))).toEqual([at("t.go", 3)]);
   });
-  it("has none for a call the change removed: its lines are base's", () => {
-    expect(behind(lines, is("m.F"), is("m.H"))).toEqual([]);
+  it("marks base the places of a call the change removed, after head's (20)", () => {
+    expect(behind(lines, is("m.F"), is("m.H"))).toEqual([{ ...at("a.go", 5), base: true }]);
+    expect(behind(lines, is("m.F"), (x) => x === "m.G" || x === "m.H")).toEqual([at("a.go", 4), at("a.go", 9), at("b.go", 2), { ...at("a.go", 5), base: true }]);
   });
   it("reads no import", () => {
     expect(behind(lines, is("m"), is("m"))).toEqual([]);
@@ -128,9 +129,20 @@ describe("litNote (19)", () => {
     const many = Array.from({ length: 10 }, (_, i) => at("a.go", i + 1));
     expect(litNote(many, "a.go")).toBe("Lines 1, 2, 3, 4, 5, 6, 7, 8 and 2 more.");
   });
-  it("says how to light lines, and why a removed call has none", () => {
+  it("says how to light lines", () => {
     expect(litNote(null, "a.go")).toBe("Point at a call or embed to light the lines it is written on.");
-    expect(litNote([], "a.go")).toBe("The change removed it: it has no line in head.");
+  });
+  // 20: a declaration diff draws spans of base.
+  const base = (path: string, line: number): Place => ({ ...at(path, line), base: true });
+  it("says which lit lines are base's, in the spans drawn and elsewhere (20)", () => {
+    expect(litNote([base("s.go", 20)], undefined, [{ path: "s.go", first: 18, last: 22 }])).toBe("Base line 20.");
+    expect(litNote([at("a.go", 4), base("a.go", 9), at("b.go", 2), base("c.go", 7)], "a.go", [{ path: "a.go", first: 8, last: 12 }]))
+      .toBe("Line 4; base line 9; in other files: b.go:2; at base: c.go:7.");
+    expect(litNote([base("a.go", 30), base("a.go", 31)], "a.go", [{ path: "a.go", first: 8, last: 12 }])).toBe("At base: a.go:30, a.go:31.");
+    expect(litNote([base("a.go", 9)], "a.go")).toBe("At base: a.go:9.");
+  });
+  it("says nothing of no places", () => {
+    expect(litNote([], "a.go")).toBe("");
   });
 });
 
@@ -154,3 +166,18 @@ describe("numbered (20)", () => {
     expect(numbered(gone).map((r) => [r.base, r.head])).toEqual([[18, undefined], [19, undefined]]);
   });
 });
+
+describe("litRows (20)", () => {
+  const rows = numbered(get);
+  const base = (path: string, line: number): Place => ({ ...at(path, line), base: true });
+  it("lights a row by its base line at base and its head line at head", () => {
+    expect(litRows(rows, "s.go", "s.go", [base("s.go", 43)])).toEqual(new Set([1]));
+    expect(litRows(rows, "s.go", "s.go", [at("s.go", 37)])).toEqual(new Set([2]));
+    expect(litRows(rows, "s.go", "s.go", [at("s.go", 36), base("s.go", 44)])).toEqual(new Set([0, 3]));
+  });
+  it("lights nothing of another file, of the other side, or while nothing is pointed at", () => {
+    expect(litRows(rows, "s.go", "s.go", [base("t.go", 43), at("t.go", 37)])).toEqual(new Set());
+    expect(litRows(rows, "s.go", "s.go", [at("s.go", 43), base("s.go", 37)])).toEqual(new Set());
+    expect(litRows(rows, "s.go", "s.go", null)).toEqual(new Set());
+  });
+});
diff --git a/web/src/screen.test.ts b/web/src/screen.test.ts
index b633ef5..c02f8c1 100644
--- a/web/src/screen.test.ts
+++ b/web/src/screen.test.ts
@@ -343,6 +343,10 @@ describe("placesOf (19)", () => {
     expect(placesOf(v, "m.T", "down:m.G")).toEqual([loc("b.go", 5)]);
     expect(placesOf(v, "m.T", ">down:m.E")).toEqual([loc("t.go", 2)]);
   });
+  it("marks base the places of a call the change removed (20)", () => {
+    const c = { ...v, kind: "change" as const, edges: [...v.edges, { ...edge("m.F", "m.T.M", "calls"), loc: loc("a.go", 5), status: "removed" }] };
+    expect(placesOf(c, "m.T", "up:m.F")).toEqual([loc("a.go", 3), loc("a.go", 7), { ...loc("a.go", 5), base: true }]);
+  });
   it('is null for the Centre, a "+N more" chip, and a Screen of imports', () => {
     expect(placesOf(v, "m.T", "m.T")).toBeNull();
     expect(placesOf(v, "m.T", "up:#more")).toBeNull();
diff --git a/web/src/styles.test.ts b/web/src/styles.test.ts
index 8b1d1bd..859b386 100644
--- a/web/src/styles.test.ts
+++ b/web/src/styles.test.ts
@@ -85,7 +85,7 @@ describe.each([["light", light], ["dark", dark]])("Go colours, %s", (_, t) => {
 });
 
 // 20: hunks and declaration diffs are coloured too, on their added and
-// removed lines.
+// removed lines, and a declaration diff lights the lines behind a call.
 describe.each([["light", light], ["dark", dark]])("Go colours in diffs, %s", (_, t) => {
   it("keep text at 4.5:1 on added and removed lines", () => {
     const low: string[] = [];
@@ -105,6 +105,11 @@ describe("Go colours' rules in diffs (20)", () => {
   it("scroll a declaration diff alone", () => {
     expect(css).toMatch(/\.hunk\.decl \{[^}]*max-height: 60vh[^}]*overflow: auto/);
   });
+  it("light a diff line over its added or removed colour", () => {
+    const at = (re: RegExp) => css.search(re);
+    expect(css).toMatch(/\.hunk \.lit \{[^}]*background: var\(--lit\)/);
+    expect(at(/\.hunk \.lit \{/)).toBeGreaterThan(at(/\.hunk \.del \{/));
+  });
 });
 
 describe("Go colours' rules (19)", () => {
```

- [ ] **Run:** `cd web && npx vitest run src/code.test.ts src/screen.test.ts src/styles.test.ts` Expected: FAIL (`behind` gives no place for the removed call, `litNote` calls a Base place another file's and says "The change removed it…" for none, `litRows` is not a function, `placesOf` gives no Base place, and there is no `.hunk .lit` rule)

- [ ] **Run:** `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node diffcode.mjs` Expected: FAIL (10/14 checks in each engine; pointed and base fail, here and served. Pointing at `Repo.check` lights its line in the code but no row of the declaration diff, and on the Screen pointing at `store.Reader` lights nothing and shows no note. Built with `vite build`, as in Task 3)

- [ ] **Light the Base lines behind a removed call or embed**

```diff
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index b7543f8..f447ff9 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -1,6 +1,6 @@
 import { useEffect, useMemo, useRef, useState } from "react";
 import type { Bundle } from "./bundle";
-import { around, behind, centre, inline, litNote, numbered, paint, type Read } from "./code";
+import { around, behind, centre, inline, litNote, litRows, numbered, paint, type Place, type Read, type Span } from "./code";
 import type { DeclDiff, Hunk, Loc, SourceFile, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, insideDecl, targets, type Row } from "./facts";
 import { isGroup, isStrip, rankNote } from "./group";
@@ -22,7 +22,7 @@ type Props = {
   crap?: Risk; // 08: the selected box's CRAP as the scene rolled it up
   ownTier?: number; // 12: the selected box's rank before the row cap merged its row
   read?: Read; // 19: the source the View does not carry, from zu serve
-  lit?: Loc[] | null; // 19: where the Screen line the reader points at is written (screen.ts placesOf)
+  lit?: Place[] | null; // 19: where the Screen line the reader points at is written (screen.ts placesOf), at base too (20)
   onReveal: (id: string) => void;
   onClose: () => void;
 };
@@ -133,39 +133,62 @@ function HunkLines({ hunk: h }: { hunk: Hunk }) {
 // where is a declaration diff's side: path:first–last.
 const where = (path: string, start: number, n: number) => `${path}:${n > 1 ? `${start}–${start + n - 1}` : start}`;
 
-// DeclDiffs draws a declaration's own diffs (20), first in its Change.
-function DeclDiffs({ diffs }: { diffs: DeclDiff[] }) {
+// DeclDiffs draws a declaration's own diffs (20), first in its Change. Over
+// them, where the lit lines are, at head and at base, or how to light them:
+// the Code under them says it no more.
+function DeclDiffs({ diffs, path, lit, hint }: { diffs: DeclDiff[]; path?: string; lit: Place[] | null; hint: boolean }) {
+  const spans: Span[] = diffs.flatMap((d) =>
+    d.basePath ? [{ path: d.basePath, first: d.baseStart, last: d.baseStart + d.baseLines - 1 }] : [],
+  );
   return (
     <section>
       <h3>Declaration diff</h3>
+      {(hint || lit !== null) && (
+        <p className="muted lit-note" aria-live="polite">
+          {litNote(lit, path, spans)}
+        </p>
+      )}
       {diffs.map((d) => (
-        <OwnDiff key={`${d.basePath}\n${d.baseStart}\n${d.headPath}\n${d.headStart}`} diff={d} />
+        <OwnDiff key={`${d.basePath}\n${d.baseStart}\n${d.headPath}\n${d.headStart}`} diff={d} lit={lit} />
       ))}
     </section>
   );
 }
 
-// OwnDiff is one declaration diff, numbered at base and at head and
-// coloured as React text only, scrolled to its first change. Of one longer
-// than CODE_LINES it draws those around that change, as Code does.
-function OwnDiff({ diff: d }: { diff: DeclDiff }) {
+// OwnDiff is one declaration diff, numbered at base and at head and coloured
+// as React text only, scrolled to its first change, its rows lit where the
+// call or embed pointed at is written. Of one longer than CODE_LINES it draws
+// those around its first change, or its first lit row, as Code does.
+function OwnDiff({ diff: d, lit }: { diff: DeclDiff; lit: Place[] | null }) {
   const pre = useRef<HTMLPreElement>(null);
   const rows = useMemo(() => numbered(d), [d]);
-  const changed = rows.findIndex((r) => r.mark !== " ") + 1; // counted from 1, as around counts
-  const [from, to] = around(rows.length, changed);
+  const on = useMemo(() => litRows(rows, d.basePath, d.headPath, lit), [rows, d.basePath, d.headPath, lit]);
+  const first = on.size > 0 ? Math.min(...on) + 1 : 0; // counted from 1, as centre counts
+  const changed = rows.findIndex((r) => r.mark !== " ") + 1;
+  // As in Code: the rows drawn move to the first lit row when they do not
+  // hold it, and stay when the light goes out, until the change moves.
+  const [held, setHeld] = useState({ changed, at: changed });
+  const at = centre(rows.length, held.changed === changed ? held.at : changed, first);
+  if (held.changed !== changed || held.at !== at) setHeld({ changed, at });
+  const [from, to] = around(rows.length, at);
   const segs = useMemo(
     () => paint(rows.slice(from, to).map((r) => r.text), (d.syntax ?? []).slice(from, to)),
     [rows, d.syntax, from, to],
   );
-  // The diff alone scrolls, to its first change, as Code to its marked line.
-  // Each View brings its diffs as new objects (13), and another diff is
-  // another OwnDiff (DeclDiffs keys them by their sides): scrolled again only
-  // when its change moves, a diff stays where the reader scrolled it through
-  // a redraw.
+  // The diff alone scrolls, to its first change, as Code to its marked line,
+  // and to its first lit row. Each View brings its diffs as new objects (13),
+  // and another diff is another OwnDiff (DeclDiffs keys them by their sides):
+  // scrolled again only when its change moves, a diff stays where the reader
+  // scrolled it through a redraw. The lit row's scroll is second, so it is
+  // the one kept when both run.
   useEffect(() => {
     const el = pre.current?.children[changed - 1 - from] as HTMLElement | undefined;
     if (pre.current && el) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 2;
   }, [changed]);
+  useEffect(() => {
+    const el = pre.current?.children[first - 1 - from] as HTMLElement | undefined;
+    if (pre.current && el) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 2;
+  }, [first, from]);
   const sides = [
     d.basePath && `base ${where(d.basePath, d.baseStart, d.baseLines)}`,
     d.headPath && `head ${where(d.headPath, d.headStart, d.headLines)}`,
@@ -180,7 +203,7 @@ function OwnDiff({ diff: d }: { diff: DeclDiff }) {
         {segs.map((ss, k) => {
           const r = rows[from + k];
           return (
-            <div key={from + k} className={lineClass(r.mark)}>
+            <div key={from + k} className={[lineClass(r.mark), on.has(from + k) && "lit"].filter(Boolean).join(" ") || undefined}>
               <span className="ln">{r.base}</span>
               <span className="ln">{r.head}</span>
               {r.mark}
@@ -203,8 +226,8 @@ function dir(path: string): string {
 
 // Change is what zu diff says about one node: status, Move, hop, and the
 // hunks of its file (a declaration) or of its directory (a package); before
-// them, a declaration's own diff (20).
-function Change({ view, node }: { view: View; node: ViewNode }) {
+// them, a declaration's own diff (20), lit by lit.
+function Change({ view, node, lit = null, hint = false }: { view: View; node: ViewNode; lit?: Place[] | null; hint?: boolean }) {
   if (view.kind !== "change") return null;
   const facts = [
     node.status,
@@ -236,7 +259,9 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
           </a>
         </p>
       )}
-      {own.length > 0 && <DeclDiffs diffs={own} />}
+      {own.length > 0 && (
+        <DeclDiffs diffs={own} path={node.status === "removed" ? undefined : node.loc.path} lit={lit} hint={hint} />
+      )}
       {files.map((p) => (
         <Hunks key={p} view={view} path={p} hunks={hunks[p]} />
       ))}
@@ -246,9 +271,10 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
 
 // Code renders file text as React text children only, never parsed as
 // markup, coloured as zu coloured it (19, code.ts), the line marked and the
-// lines in lit that are this file's lit. Of a file longer than CODE_LINES it
-// draws those around the marked line, and says which.
-function Code({ file, line, lit }: { file: SourceFile; line: number; lit: Loc[] | null }) {
+// places in lit at head in this file lit (20: a declaration diff lights base's).
+// Of a file longer than CODE_LINES it draws those around the marked line, and
+// says which.
+function Code({ file, line, lit }: { file: SourceFile; line: number; lit: Place[] | null }) {
   const pre = useRef<HTMLPreElement>(null);
   const mark = useRef<HTMLDivElement>(null);
   // Each View brings its files as new objects (13): cut, paint and scroll
@@ -256,7 +282,7 @@ function Code({ file, line, lit }: { file: SourceFile; line: number; lit: Loc[]
   // code where the reader scrolled it. The colour is the text's
   // (export.Syntax), whose lines are cut as these are.
   const all = useMemo(() => file.text.split("\n"), [file.text]);
-  const on = useMemo(() => new Set(lit?.filter((l) => l.path === file.path).map((l) => l.line)), [lit, file.path]);
+  const on = useMemo(() => new Set(lit?.filter((l) => !l.base && l.path === file.path).map((l) => l.line)), [lit, file.path]);
   const first = on.size > 0 ? Math.min(...on) : 0;
   // The lines drawn move to the first lit line when they do not hold it,
   // and stay when the light goes out, as the scroll does, until the mark
@@ -307,8 +333,10 @@ function Code({ file, line, lit }: { file: SourceFile; line: number; lit: Loc[]
 // Source is the code of the file loc is in: the View's, or (19) read from zu
 // serve, the last file read kept while the next comes. It draws nothing while
 // neither has the file. Over it, where the lines lit are, or (hint) how to
-// light them.
-function Source({ view, loc, read, lit, hint }: { view: View; loc: Loc; read?: Read; lit: Loc[] | null; hint: boolean }) {
+// light them, unless a declaration diff over it says (noted, 20).
+function Source({ view, loc, read, lit, hint, noted }: {
+  view: View; loc: Loc; read?: Read; lit: Place[] | null; hint: boolean; noted: boolean;
+}) {
   const own = useMemo(() => inline(view, loc.path), [view, loc.path]);
   const [got, setGot] = useState<SourceFile | null>(null);
   useEffect(() => {
@@ -323,7 +351,7 @@ function Source({ view, loc, read, lit, hint }: { view: View; loc: Loc; read?: R
   if (!file) return null;
   return (
     <>
-      {(hint || lit !== null) && (
+      {!noted && (hint || lit !== null) && (
         <p className="muted lit-note" aria-live="polite">
           {litNote(lit, file.path)}
         </p>
@@ -414,7 +442,7 @@ function Crap({ view, id, box, onReveal }: { view: View; id: string; box?: Risk;
 
 export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, lit, onReveal, onClose }: Props) {
   // 19: the row the reader points at lights its lines, over the Screen's line.
-  const [over, setOver] = useState<{ id: string; places: Loc[] } | null>(null);
+  const [over, setOver] = useState<{ id: string; places: Place[] } | null>(null);
   const places = over !== null && over.id === id ? over.places : (lit ?? null);
   // A row followed to another declaration goes without a mouseleave or a
   // blur: its light goes with the declaration it was in.
@@ -443,17 +471,18 @@ export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, li
   } else if (node?.kind === "type" || node?.kind === "function") {
     const c = calls(view, node.id);
     const inside = insideDecl(view, node.id);
+    const hint = c.out.length + c.in.length > 0;
     const point = (out: boolean) => (r: Row | null) =>
       setOver(r && { id: id!, places: out ? behind(view, inside, (x) => x === r.id) : behind(view, (x) => x === r.id, inside) });
     body = (
       <>
         <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
         <Where view={view} loc={node.loc} removed={node.status === "removed"} />
-        <Change view={view} node={node} />
+        <Change view={view} node={node} lit={places} hint={hint} />
         <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} onPoint={point(true)} />
         <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} onPoint={point(false)} />
         {node.status !== "removed" && (
-          <Source view={view} loc={node.loc} read={read} lit={places} hint={c.out.length + c.in.length > 0} />
+          <Source view={view} loc={node.loc} read={read} lit={places} hint={hint} noted={!!view.declDiffs?.[node.id]} />
         )}
       </>
     );
diff --git a/web/src/code.ts b/web/src/code.ts
index 75479ba..5e3c084 100644
--- a/web/src/code.ts
+++ b/web/src/code.ts
@@ -61,35 +61,50 @@ export function inline(view: View, path: string): SourceFile | null {
   return text === undefined ? null : { path, text, syntax: view.syntax?.[path] ?? [] };
 }
 
+// Place is where a call or embed is written: at head, or (base) at base, for
+// one the change removed (20).
+export type Place = Loc & { base?: true };
+
 // behind is where the calls and embeds from an id from accepts to one to
-// accepts are written: each edge's loc and more, by path and line, each once.
-// A call or embed the change removed was written in base, whose lines the
-// code (head's) does not show: it gives none.
-export function behind(view: View, from: (id: string) => boolean, to: (id: string) => boolean): Loc[] {
-  const out = new Map<string, Loc>();
+// accepts are written: each edge's loc and more, by path and line, each once,
+// head's first. A call or embed the change removed was written at base: its
+// places are marked base (20).
+export function behind(view: View, from: (id: string) => boolean, to: (id: string) => boolean): Place[] {
+  const out = new Map<string, Place>();
   for (const e of view.edges) {
-    if (e.kind === "imports" || e.status === "removed" || !from(e.from) || !to(e.to)) continue;
-    for (const l of [e.loc, ...(e.more ?? [])]) out.set(`${l.path}\n${l.line}`, l);
+    if (e.kind === "imports" || !from(e.from) || !to(e.to)) continue;
+    const base = e.status === "removed";
+    for (const l of [e.loc, ...(e.more ?? [])]) out.set(`${base}\n${l.path}\n${l.line}`, base ? { ...l, base } : l);
   }
-  return [...out.values()].sort((a, b) => cmp(a.path, b.path) || a.line - b.line);
+  return [...out.values()].sort((a, b) => Number(!!a.base) - Number(!!b.base) || cmp(a.path, b.path) || a.line - b.line);
 }
 
+// Span is the lines of a file at base a declaration diff draws (20).
+export type Span = { path: string; first: number; last: number };
+
 const LIT_CAP = 8; // the places litNote lists of each, before "and N more"
 
-// litNote says where the lit lines are, in the shown file (path) and in
-// others; places is null while no call or embed is pointed at.
-export function litNote(places: Loc[] | null, path: string): string {
+// litNote says where the lit lines are: at head in the shown file (path) and
+// in others, at base in the spans drawn and elsewhere; places is null while
+// no call or embed is pointed at.
+export function litNote(places: Place[] | null, path?: string, spans: Span[] = []): string {
   if (places === null) return "Point at a call or embed to light the lines it is written on.";
-  if (places.length === 0) return "The change removed it: it has no line in head.";
   const list = (xs: string[]) =>
     xs.length > LIT_CAP ? `${xs.slice(0, LIT_CAP).join(", ")} and ${xs.length - LIT_CAP} more` : xs.join(", ");
-  const here = places.filter((p) => p.path === path).map((p) => String(p.line));
-  const there = places.filter((p) => p.path !== path).map((p) => `${p.path}:${p.line}`);
-  const out = [
-    here.length > 0 && `${here.length === 1 ? "Line" : "Lines"} ${list(here)}`,
-    there.length > 0 && `${here.length > 0 ? "in" : "In"} other files: ${list(there)}`,
-  ].filter(Boolean);
-  return `${out.join("; ")}.`;
+  const drawn = (p: Place) =>
+    p.base ? spans.some((s) => s.path === p.path && p.line >= s.first && p.line <= s.last) : p.path === path;
+  const of = (base: boolean, here: boolean) =>
+    places.filter((p) => !!p.base === base && drawn(p) === here).map((p) => (here ? String(p.line) : `${p.path}:${p.line}`));
+  const parts = [
+    [of(false, true), "Line", "Lines"],
+    [of(true, true), "base line", "base lines"],
+    [of(false, false), "in other files:", "in other files:"],
+    [of(true, false), "at base:", "at base:"],
+  ] as const;
+  const out = parts.filter(([xs]) => xs.length > 0).map(([xs, one, many]) => `${xs.length === 1 ? one : many} ${list(xs)}`);
+  if (out.length === 0) return "";
+  const s = out.join("; ");
+  return `${s[0].toUpperCase()}${s.slice(1)}.`;
 }
 
 // Numbered is a diff line as a declaration diff draws it (20): its marker,
@@ -107,6 +122,15 @@ export function numbered(h: Hunk): Numbered[] {
   });
 }
 
+// litRows is which rows of a declaration diff (basePath, headPath) places
+// lights: a line at base by its base line, at head by its head line.
+export function litRows(rows: Numbered[], basePath: string | undefined, headPath: string | undefined, places: Place[] | null): Set<number> {
+  const on = new Set(places?.map((p) => `${!!p.base}\n${p.path}\n${p.line}`));
+  const lit = (base: boolean, path: string | undefined, line: number | undefined) =>
+    path !== undefined && line !== undefined && on.has(`${base}\n${path}\n${line}`);
+  return new Set(rows.flatMap((r, i) => (lit(true, basePath, r.base) || lit(false, headPath, r.head) ? [i] : [])));
+}
+
 // Read gives a file zu serve sends on demand (19), or null.
 export type Read = (path: string) => Promise<SourceFile | null>;
 
diff --git a/web/src/screen.ts b/web/src/screen.ts
index d16d582..47dc81d 100644
--- a/web/src/screen.ts
+++ b/web/src/screen.ts
@@ -3,10 +3,10 @@
 // below, after codezoom's screens. A pure function of the View and the hash:
 // rows come only from the View's edges. 18: in a Change View, from its edges
 // and near's, each box and line marked by its Change Status.
-import type { Loc, NodeKind, View, ViewEdge } from "./data";
+import type { NodeKind, View, ViewEdge } from "./data";
 import { statusOf } from "./bundle";
 import { nodeMark } from "./change";
-import { behind } from "./code";
+import { behind, type Place } from "./code";
 import { cmp, index, packageOf, PKG } from "./cut";
 import { INSET, ROW_MAX, textWidth } from "./layout";
 import { LABEL_PX } from "./viewport";
@@ -222,10 +222,11 @@ export function screenOf(within: View, centre: string, all = false): Screen {
 }
 
 // placesOf is where the calls and embeds a Screen box's line stands for are
-// written (19, code.ts behind): drawn is the box's id or its line's ("up:X",
-// "up:X>", ">down:X"). It is null for the Centre, a "+N more" chip and a
-// Screen of imports, which light no line.
-export function placesOf(within: View, centre: string, drawn: string): Loc[] | null {
+// written (19, code.ts behind), at base for those the change removed (20):
+// drawn is the box's id or its line's ("up:X", "up:X>", ">down:X"). It is
+// null for the Centre, a "+N more" chip and a Screen of imports, which light
+// no line.
+export function placesOf(within: View, centre: string, drawn: string): Place[] | null {
   const view = screenView(within);
   const { node } = index(view);
   const kind = node.get(centre)?.kind;
diff --git a/web/src/styles.css b/web/src/styles.css
index 2ae8b0e..7419165 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -626,7 +626,11 @@ button.st-removed {
 .hunk .del {
   background: var(--del-bg);
 }
-/* 20: a declaration diff, numbered, scrolls alone */
+/* 20: a declaration diff, numbered, scrolls alone, and lights the lines
+   behind the call or embed pointed at over their added or removed colour */
+.hunk .lit {
+  background: var(--lit);
+}
 .hunk.decl {
   position: relative;
   max-height: 60vh;
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node diffcode.mjs` Expected: PASS (14 checks in each engine)

- [ ] **Commit:** `Light the Base lines behind a call or embed the change removed`

---

### Task 5: Acceptance

**Files:**
- Record: `docx/features/20-diff-code/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [ ] **Run:** `cd web/e2e && node place.mjs` Expected: PASS (9 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (11 checks in each engine)

- [ ] **Run:** `cd web/e2e && node screen.mjs` Expected: PASS (23 checks in each engine)

- [ ] **Run:** `cd web/e2e && node code.mjs` Expected: PASS (13 checks in each engine)

- [ ] **Run:** `cd web/e2e && node diffcode.mjs` Expected: PASS (14 checks in each engine)

- [ ] **Measure** (by hand; not a replay step).
  1. Copy the Test Corpus's hugo, cobra and kubernetes clones out of `.zu/corpus/` (`cp -cR`), with their history. The corpus is read-only: never clone, edit or check out in it.
  2. Build `bin/zu` at this plan's base, and at its last task, into two checkouts.
  3. In each, run `node docx/features/20-diff-code/measure.mjs <checkout> <out> <copy>:<base>…` on the same changes: hugo `HEAD~10` and `HEAD~100`, cobra `HEAD~60`, kubernetes `HEAD~40` and `HEAD~400`.
  4. Record the tables in `acceptance.md`.

  Pass criteria, set before the run:
  - `zu diff -html` takes at most 1.25 times as long as before 20, on each change;
  - the page is at most 25% larger;
  - the panel of the declaration with the longest declaration diff draws within 1,000 ms (median of three), in every engine;
  - the panel of the package with the most hunk lines, now coloured, draws within 1.5 times its time before 20, or 500 ms, whichever is more;
  - every engine reports no page errors.

- [ ] **The user's check** (by hand; `zu diff -html` on a real branch, and `zu serve -base`).
  1. Select a function the change modified. Its panel opens at its top and shows "Declaration diff": the function whole, numbered at Base and at head, coloured, the changed lines marked, and scrolled to the first of them. Under it are its file's hunks, coloured, and at the foot its code at head, scrolled to its line.
  2. Select a declaration the change removed. Its panel shows its text at Base.
  3. Press `s` on it. On the Screen, point at a box it called: the Base line of that call lights, and the note says "Base line …".
  4. Select a function that moved. Its diff is its old text against its new.
  5. In `zu serve` without `-base` (a Project View), select a declaration with many rows. Its panel opens at its top, its rows first, and its code box shows its line.

- [ ] **Commit:** `Record Diff Code's acceptance`

---

## Risks

- **Base text grows the Change View.** Every changed declaration's text at Base, and the colour of every hunk line, are new inlined bytes (Deviation 7). They grow with the change, not the repository: on kubernetes' last 400 commits the page grew 19%, from 78.46 MB to 93.59 MB, 13.42 MB of it declaration diffs; on hugo's last 10, 1%.
- **A second parse of changed files.** The export parses each changed declaration's file again, once on each side. A declaration whose places are not where the IR says gets no diff, rather than a wrong one: that happens only when a file changes between the scan and the export, in `zu serve`'s working tree. A file that does not parse at head needs no spans: the scan drops its facts, so its declarations are removed, and each shows its text at Base.
- **Each `zu serve -base` rescan diffs again.** A rescan builds the Change View again, and 20 adds to that: the changed files parsed again on each side, and every hunk line coloured (Deviation 2). It was measured with this plan's last commit's build, as 16 measured its budget, with 16's `measure.mjs`: a copy of kubernetes v1.37.0 served with `-base HEAD~50` (52 packages changed), eleven edits to `pkg/kubelet` left uncommitted, two runs of each build, 19's and 20's in turn, at a load of 3.2 to 6.0. The rescan's min / median / max went from 540 / 566 / 649 and 535 / 550 / 562 ms to 733 / 758 / 814 and 752 / 779 / 973 ms, about 200 ms more. That is within 16's budget (a median of at most 1 s, every rescan under 2 s), with less to spare. Write → drawn's median went from 1,453 and 1,438 ms to 1,623 and 1,744 ms.
- **Pairing can pair the wrong texts.** A declaration written in several files, whose texts a change edits and whose files it renames, pairs by order, not by content (Deviation 5).
- **A very long declaration.** A declaration diff of more than 5,000 rows draws 5,000; find-in-page reaches only those (19's Risk). The longest in the measured changes was `TestAllocator`, on kubernetes' last 400 commits: 8,173 rows, of which the panel draws 5,000.
- **Lighting can move two windows.** When a lit line lies outside the 5,000 rows that a long declaration diff, or a long file's code, draws, the rows drawn move to it (19). On kubernetes' last 400 commits, pointing at `TestAllocator`'s first "Calls and embeds out" row lights a line near its foot, and both windows move. The diff's goes from rows 1–5,000 to 3,174–8,173, and the code's from lines 1–5,000 to 4,278–9,277, so the page replaces about 10,000 rows. It lights in 209 / 274 / 329 ms (Chromium / Firefox / WebKit). Before 20 only the code's window moved, and the same pointing took 108 / 156 / 193 ms. No criterion was set for it. 19's 100 ms was set for a Project View's code, and it holds there. On hugo's last 100 commits, where `doCreatePages`' diff (786 rows) has no window, 20 lights in 29 / 21 / 31 ms (**Measurements**).
- **`diffcode.mjs` waits fixed times,** as 17's to 19's checks do: 300 ms after a pointer move.
- **The replay depends on 16 to 19.** Task 2's diff of `change.go` is against 16's and 18's version, and every web diff against 19's. If any of them changes before it lands, regenerate these diffs from a scratch branch on the new base.

## Notes

- **Task count: 5**, within Quick mode's limit.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given, in the replay.
  - Task 1 is red on assertions: the lines are the directive's.
  - Task 2 is red on a build error (Deviation 12).
  - Tasks 3 and 4 are red on missing functions and assertions, and in the browser in all three engines.
- **The model never authors the graph.** Nodes, edges and their lines come from the scan. A declaration diff is the files' own text, cut at the lines Go's parser gives, and diffed by the export's Myers diff (04). Colour comes from `go/scanner` (19). Nothing is inferred.
- **Output stays byte-identical.** `DeclDiffs` is a map, which `encoding/json` writes by sorted key. Each entry's diffs follow the IR's sorted locations. Spans and colour are functions of each file's bytes. Task 1 changes no golden; Task 2 changes the Change View golden only, by `declDiffs` and each hunk's `syntax`.
- **Follow-ups, not in 20:**
  - drawing the head side of a declaration diff from the inlined file, to save its bytes (Deviation 7);
  - word-level diffs within a line;
  - a Change View panel that lists a removed declaration's lost edges in the tree too (Deviation 10);
  - lighting that moves no window: scrolling within the rows drawn, or drawing fewer around the lit line, when it lies outside them. It would speed 19's Code panel too (**Risks**).
- **Scrutiny (scrutiny-20, 2026-10-20): fix-then-ship, now fixed.**
  - M1, a declaration diff opened on its first rows, its change out of view on many real diffs: it opens at its first change (Task 3, **Architecture 6**), and `diffcode.mjs`'s `far` checks it.
  - m1, lighting's cost misnamed: both windows move (**Risks**, **Measurements**).
  - m2, the host link's span in a directive's lines: named (**Architecture 1**).
  - m3, a head file that does not parse, and the size the amendment named: reworded (**Architecture 4**, **Risks**, the ADR 0006 amendment, Deviation 7).
  - Nits taken:
    - texts pair by an equal text first (Task 2, Deviation 5);
    - Deviation 6 reworded;
    - `OwnDiff` keeps its rows drawn only while its first change stays, as `Code` keeps them for its mark;
    - a Project View step in the user's check;
    - the rescan measured (**Risks**).
  - Nits left:
    - The note names a lit line in another variant's diff by file and line ("in other files: f_windows.go:12"), which reads as plainly as a bare number would.
    - The note is drawn empty for no places: it is a live region, kept in the page so a screen reader reads the next note.
    - A CRLF file's `\r` stays in its lines, as in 19's hunks and code.

## Replay record

Replayed with `replay.py` on a fresh `git archive` of `main` at db511a6, in a scratch directory, after 16's, 17's, 18's and 19's replays (16's text and 19's code as revised on 2026-10-20). `node_modules` was clone-copied from the repository (`cp -cR`), and Playwright's three browsers were already installed. This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `go test ./internal/scan -run TestLocationsAreTheFilesOwnLines` | 1 |
| 1 | green | `go test ./... && cd web && npx vitest run && npm run typecheck` | 0 |
| 2 | red | `go test ./internal/export` | 1 |
| 2 | green | `go test ./internal/export -run TestChangeGolden -update` | 0 |
| 2 | green | `go test ./... && cd web && npx vitest run && npm run typecheck` | 0 |
| 3 | red | `cd web && npx vitest run src/code.test.ts src/styles.test.ts` | 1 |
| 3 | red | `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node diffcode.mjs` | 1 |
| 3 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 3 | green | `make build >/dev/null && cd web/e2e && node diffcode.mjs` | 0 |
| 4 | red | `cd web && npx vitest run src/code.test.ts src/screen.test.ts src/styles.test.ts` | 1 |
| 4 | red | `cd web && npx vite build >/dev/null && cd .. && CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu && cd web/e2e && node diffcode.mjs` | 1 |
| 4 | green | `cd web && npx vitest run && npm run typecheck` | 0 |
| 4 | green | `make build >/dev/null && cd web/e2e && node diffcode.mjs` | 0 |
| 5 | green | `make check` | 0 |
| 5 | green | `cd web/e2e && node accept.mjs` | 0 |
| 5 | green | `cd web/e2e && node place.mjs` | 0 |
| 5 | green | `cd web/e2e && node serve.mjs` | 0 |
| 5 | green | `cd web/e2e && node screen.mjs` | 0 |
| 5 | green | `cd web/e2e && node code.mjs` | 0 |
| 5 | green | `cd web/e2e && node diffcode.mjs` | 0 |

- 16's to 19's replays, before this one, passed every step. After 17's, 18's and 19's, the tree was byte-identical to that plan's scratch branch in every source file (`diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output); after 19's, it was byte-identical to this plan's base commit too.
- After Task 5, the replayed tree was byte-identical to the scratch branch's last commit in the same way, the Change View golden that `-update` wrote included (git tree bc8c908; 21 files change against the base).
- `golangci-lint run ./...` in the replayed tree, after 18's, 19's and this replay: no issues. Task 5's `accept.mjs`, `place.mjs`, `serve.mjs`, `screen.mjs`, `code.mjs` and `diffcode.mjs` passed 57, 9, 11, 23, 13 and 14 checks in each engine. The replay shows WebKit's, each script's last line; Chromium's and Firefox's were read on the scratch branch's last commit, whose tree is the same.
- The red reasons were seen as stated:
  - Task 1: all seven locations are the directive's (`calls x/p.F x/p.G at line 400, want 11 (the file's own)`, and so on).
  - Task 2: the build fails: `declSpan`, `declSpans` and `DeclDiff` undefined, `View` has no field `DeclDiffs`, and `Hunk` none `Syntax`.
  - Task 3: 4 tests (`numbered` is not a function; no `.hunk .kw` or `.hunk.decl` rule); `diffcode.mjs` 0/10 in each engine, each part's wait for a declaration diff timing out after 10 s.
  - Task 4: 7 tests (`behind` gives no place for the removed call; `litNote` calls a Base place another file's, and says "The change removed it…" for none; `litRows` is not a function; `placesOf` gives no Base place; no `.hunk .lit` rule); `diffcode.mjs` 10/14 in each engine, pointed and base failing, here and served.
  - Task 3's and Task 4's browser reasons were read on the scratch branch's red commits, since `replay.py` prints only each step's last line.
- Each fix of scrutiny-20's that changed code fails without it, on the scratch branch:
  - without `OwnDiff`'s scroll to its first change, `diffcode.mjs`'s `far` reads `[0, false, 0]`, not `[0, true, 2]`, in each engine: the box has not scrolled, and no changed row is in it;
  - with the pairing scrutiny reviewed (by file, then by order), `TestDeclDiffPairs` gives `init` six diffs, not three;
  - without the first pass (an equal text in its own file), `G`'s diff pairs `a/g_windows.go` with `a/g_linux.go`;
  - without the second (an equal text in another file), `init` has four diffs, not three: the one moved to `a/new.go` stands alone, all `+`, and `a/old.go`'s pair with the wrong texts.
- The plan replayed differed from this one only in this record, written after the replay, its Status line, and a clause in **Risks** naming the build the rescan was timed with. No code block changed.
- Toolchain: Go 1.24.5, Node 24.17.0, Python 3.11.17, macOS on an Apple M2.
