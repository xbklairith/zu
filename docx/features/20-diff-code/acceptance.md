# 20 · Diff Code — acceptance

Measured 2026-10-21 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0, on branch `build-16-20`.
The machine was shared with other sessions and with two review agents: the 1-minute load average was 2.1 to 8.5 while Tasks 1–4 were built, and 3.6 to 6.1 during the Measure.

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `c82853d` | the IR's lines are each file's own, not a `//line` directive's |
| 2 | `f031fba` | the export diffs each changed declaration whole (`View.declDiffs`) and colours every hunk line |
| 3 | `e0ddfce` | the panel draws a declaration's own diff, numbered and coloured, and opens at its top |
| 4 | `06f0e93` | pointing at a call or embed the change removed lights its Base lines |

Each task was done as the plan writes it, its code blocks applied in order. Each red step failed (a non-zero exit) before its code went in, and each green step passed after:
- Task 1 was red on `TestLocationsAreTheFilesOwnLines`: every location in the test's file was a directive's line (`x/p at line 100, want 2 (the file's own)`, and six more).
- Task 2 was red on build errors: `declSpan`, `declSpans` and `DeclDiff` were undefined, and `View` had no `DeclDiffs` and `Hunk` no `Syntax`.
- Task 3's vitest red step failed 4 tests, among them `styles.test.ts`'s "scroll a declaration diff alone". Its browser red step failed every check of `diffcode.mjs`: WebKit's was 0/10, each value `undefined` after a 10 s wait. The build log keeps only the last lines, so Chromium's and Firefox's were not seen.
- Task 4's vitest red step failed 7 tests, among them the `.hunk .lit` rule. Its browser red step failed 10/14 in each engine: `pointed` lit no diff row, and `base` lit nothing and said nothing.

**16 to 20 against the replay.** After Task 4, zu's tree (a `git archive` of `06f0e93`) was byte-identical to the tip of 20's replay branch (`2c42c20`, tree `bc8c908`: 16's to 20's tasks applied), the View goldens that `-update` wrote included. The comparison was `diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output. `golangci-lint run ./...` on that tree printed no issues, and `gofmt -l` listed nothing.

## Gates

- **`make check`:** exit 0; vitest ran 366 tests.
- **`node accept.mjs`:** 57/57 in chromium, firefox and webkit.
- **`node place.mjs`:** 9/9 in each engine.
- **`node serve.mjs`:** 11/11 in each engine.
- **`node screen.mjs`:** 23/23 in each engine.
- **`node code.mjs`:** 13/13 in each engine.
- **`node diffcode.mjs`:** 14/14 in each engine.

## Measure (`measure.mjs`)

Two checkouts were built with `make build`: 19's (`bdbba13`) and Task 4's (`06f0e93`). The changes were the plan's, on `cp -cR` copies of the Test Corpus's clones, outside `.zu/corpus/`: hugo v0.166.0's last 10 and last 100 commits, cobra v1.10.2's last 60, kubernetes v1.37.0's last 40 and last 400. The script waited for the 1-minute load to fall to 4, then ran 19's checkout and 20's one after the other on the same changes, without alternating. The load was 3.63 when 19's run began, 5.22 when 20's began and 6.10 when it ended.

**What `zu diff -html` writes.** The time is the median of `measure.mjs`'s three runs.

| Change | Time, 19 → 20 | Page, 19 → 20 | Declaration diffs | Hunks, 19 → 20 |
|---|---|---|---|---|
| hugo, last 10 | 0.39 → 0.35 s (0.90×) | 2.34 → 2.36 MB (+0.9%) | 0.01 MB | 0.01 → 0.01 MB |
| hugo, last 100 | 0.41 → 0.45 s (1.10×) | 5.26 → 5.85 MB (+11.2%) | 0.54 MB | 0.24 → 0.28 MB |
| cobra, last 60 | 0.10 → 0.11 s (1.10×) | 2.36 → 2.52 MB (+6.8%) | 0.14 MB | 0.07 → 0.08 MB |
| kubernetes, last 40 | 5.51 → 4.93 s (0.89×) | 8.73 → 8.80 MB (+0.8%) | 0.06 MB | 0.03 → 0.03 MB |
| kubernetes, last 400 | 10.48 → 11.77 s (1.12×) | 78.46 → 93.59 MB (+19.3%) | 13.42 MB | 11.38 → 12.98 MB |

The pages are the plan's to the hundredth of a MB. The times are within the plan's, given the load. kubernetes' last 40 commits ran faster with 20's build, which is load, not 20.

**The panel.** Times are in-page, in ms, Chromium / Firefox / WebKit, the median of three loads, as the plan defines them: **Declaration**, the declaration with the longest declaration diff; **Lit**, pointing at its first "Calls and embeds out" row (on hugo's last 100 and kubernetes' last 400 commits it has one); **Package**, the package whose directory has the most hunk lines, on a page of its own.

| Change | Declaration (its diff's rows) | Declaration, 20 | Lit, 20 | Package (hunk lines) | Package, 19 → 20 |
|---|---|---|---|---|---|
| hugo, last 10 | `Namespace.ReplaceRE` (53) | 26 / 52 / 52 | – | `common/hexec` (174) | 25 / 46 / 93 → 26 / 53 / 89 |
| hugo, last 100 | `allPagesAssembler.doCreatePages` (786) | 63 / 87 / 148 | 27 / 21 / 28 | `hugolib` (623) | 35 / 48 / 82 → 39 / 51 / 88 |
| cobra, last 60 | `genBashComp` (468) | 32 / 39 / 69 | – | `cobra` (1,318) | 23 / 33 / 79 → 30 / 43 / 94 |
| kubernetes, last 40 | `Controller.handleClaim` (152) | 64 / 88 / 125 | – | `test/e2e/apps` (179) | 33 / 48 / 90 → 35 / 54 / 100 |
| kubernetes, last 400 | `TestAllocator` (8,173) | 239 / 351 / 528 | 205 / 290 / 341 | `k8s.io/api/scheduling/v1alpha3` (10,996) | 137 / 170 / 299 → 187 / 276 / 461 |

- The page drew (from `goto`) in 264–453 ms with 20's build on the four smaller changes, within 10% of 19's or faster. On kubernetes' last 400 commits it drew in 921 / 802 / 1,687 → 1,030 / 958 / 2,038 ms: its page is 19% larger.
- No engine reported a page error, with either build.

**Pass criteria, set before the run:**
- `zu diff -html` takes at most 1.25 times as long as before 20, on each change: at most 1.12 times, on kubernetes' last 400 commits. **Met.**
- The page is at most 25% larger: at most 19.3%, on kubernetes' last 400 commits. **Met.**
- The panel of the declaration with the longest declaration diff draws within 1,000 ms (median of three), in every engine: at most 528 ms, `TestAllocator` in WebKit. **Met.**
- The panel of the package with the most hunk lines draws within 1.5 times its time before 20, or 500 ms, whichever is more: on kubernetes' last 400 commits Firefox took 1.62 times as long (276 ms) and WebKit 1.54 times (461 ms), both within 500 ms; everywhere else at most 1.30 times. **Met**, WebKit with 39 ms to spare. The plan's run, at a lower load, took 288 → 391 ms there.
- Every engine reports no page errors: none. **Met.**

## The user's check

The plan makes this the user's check, by hand. The lead scripted it with Playwright, in chromium, firefox and webkit, on the `zu diff -html` page and on `zu serve -base` for each change. The script's checks pass in every engine, with no page errors. **The box stays unticked: the user's own check is still owed.**

1. **A modified function.** On hugo's last 100 commits, `hugolib.allPagesAssembler.doCreatePages` (786 rows): its panel opens at its top. In order, it shows "Declaration diff", "Changes in hugolib/content_map_page_assembler.go", "Calls and embeds out" and "Called or embedded by". The diff says `base hugolib/content_map_page_assembler.go:146–929 → head hugolib/content_map_page_assembler.go:146–929`, numbered on both sides, its rows marked " ", "+" and "-", and keywords are coloured in the diff and in the hunks. The diff is in view, scrolled to its first change. At the foot, the code at head is scrolled to its line, 146, which is marked.
2. **A removed declaration.** `common/hashing.toHashable`: its panel shows `base common/hashing/hashing.go:179–190`, 12 rows, each marked "-", and no code at head.
3. **Base lines on the Screen.** hugo's last 100 commits remove no package-level function that calls another, so this step used kubernetes' last 100 commits, which have 10 such calls. On the Screen of the removed `k8s.io/dynamic-resource-allocation/api/v1beta1.Convert_v1_NodeAllocatableResourceMapping_To_v1beta1_NodeAllocatableResourceMapping`, the note first says "Point at a call or embed to light the lines it is written on." Pointing at the box of `autoConvert_v1_NodeAllocatableResourceMapping_To_v1beta1_NodeAllocatableResourceMapping`, which it called, lights the diff row `1097|-`, and the note says "Base line 1097." The script points only at a box that `elementFromPoint` reaches: the Screen opens at its Centre, so a wide row runs under the "Changed packages" list (17's design).
4. **A Move.** `commands.chromaCSSOverrides` moved to `markup/highlight.chromaCSSOverrides`. Its diff is `base commands/gen.go:333–354 → head markup/highlight/chromastyles.go:140–162`, its rows marked " ", "+" and "-".
5. **A Project View.** In `zu serve` on hugo without `-base`, `tpl/internal.AddTemplateFuncsNamespace` (31 calls and embeds) opens at its top. Its rows come first ("Calls and embeds out", then "Called or embedded by"), its first row in view, and its code last, its line 43 marked and in view.

## Doc amendments

Applied as the plan's **Doc amendments** quote them:
- ADR 0006: a new section, "Amendment (20, 2026-10-20): a Change View inlines Base's text of each changed declaration", after 19's. Its figures are this Measure's: 13.42 MB of declaration diffs in a page of 93.59 MB, 19% more; 0.01 MB on hugo's last 10.
- `decisions.md`, UI v1: 19's "A removed edge lights nothing: its lines are base's (20)." is replaced by the **Diff Code (20)** text.
- The glossary: a new entry, Declaration Diff, after Code Panel; a sentence at the end of IR, and one at the end of HTML Export, after 19's.
- `requirements-draft.md`: no change. U12 is met, by the node's own diff as well as its file's; U13 stays open.

## After Task 4

The scrutiny of 16 to 19 found faults, and their fixes landed on `build-16-20` after Task 4 and before this record. One touches a file 20 also changed: `Panel.tsx`'s Code scrolls to its lit line when its window moves (`e7ec73d`). `code.mjs` (13/13) and `diffcode.mjs` (14/14) pass after it in every engine. The Measure and the user's check above ran on Task 4's build.

## After scrutiny

Scrutiny round 1 (2026-10-21) returned fix-then-ship. Its findings and what changed:
- **The panel kept its scroll across selections.** The tree's panel opened at its top only when it first mounted. Following a row from a panel scrolled to its foot kept that scroll, so the next declaration's diff sat above the fold. `4a62135` sets the panel to its top for each new node or edge, and keeps the reader's place through a redraw of the same one (13). In the same commit, a declaration diff is keyed by its files and its place among the declaration's diffs rather than by its start lines, so a line added above it in `zu serve` keeps the reader's scroll, as Architecture 6 says. `diffcode.mjs` gains `again` on both pages and `served shifted`, and is now 17/17 in each engine. Before the fix they failed in every engine: `again` gave `[true, 930, false]` (934 in Firefox, 945 in WebKit) and `served shifted` scrolled to 846.
- **The docs said every Move shows its diff.** A Move that kept its text whole shows none: 1 of 246 changed declarations on hugo's last 100 commits, and 19 of 4,224 on kubernetes' last 400. `decisions.md`, the glossary and the plan's quotes of them now say so. Step 4 of the user's check selects a Move that changed. Step 1 now also follows a row from a panel scrolled to its foot.
- **Two of the plan's paths had no test.** `51cc268` adds one test for a declaration not where the IR says, which gets no diff, and one for a file that does not parse at head, whose declarations show their Base text. Each test fails when the line it pins is removed.
- **The Risks overstated the work.** "Replaces about 10,000 rows" now reads "re-renders 10,000 rows, about 7,450 of them new".
- **Not changed:** each pointer move re-renders every row the panel draws: 37–54 ms on `TestAllocator`'s 12,000 rows, by the reviewer's run. The reviewer judged it needs no change.

The Measure above ran on Task 4's build. These fixes add one scroll per selection and draw no other row.

Scrutiny round 2 (2026-10-21, at `be124f3`) returned **ship**. It verified each fix above by mutation: without the panel reset, `again` reads 930 / 934 / 945, and with the old key, `served shifted` scrolls to 846. A frame probe shows the new panel at the top in its first painted frame, in every engine. Two nits are left as follow-ups, unchanged:
- **The `OwnDiff` key trades one rare case for two.** Two changed texts of one declaration in one file share both paths. When the first goes back to its Base text in `zu serve`, the second takes the first's index and its scroll. And when an earlier build variant's diff goes, a later variant's diff remounts at its first change. Keying by the files and the diff's ordinal among diffs with the same files would fix the second case. The first needs the export to number each text.
- **`litNote` and `litRows` disagree for build variants.** `litNote` counts only the node's own file as drawn. So a call lit in another variant's drawn diff is described as "in other files".
