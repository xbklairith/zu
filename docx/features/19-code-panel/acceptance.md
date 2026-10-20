# 19 · The Code panel — acceptance

Measured 2026-10-21 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0, on branch `build-16-20`.
The machine was shared with other sessions and with two review agents: the 1-minute load average was 4.0 to 12.8 while Tasks 1–4 were built, and 2.8 to 3.9 during the Measure.

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `710962c` | the export keeps every line of a call or embed (`more`) and colours inlined Go (`View.syntax`) |
| 2 | `62fb2c5` | zu serve without `-include` draws every package (up to `detailBudget`) and sends a file's source on demand (`/source`) |
| 3 | `1cfff76` | the Code panel colours Go and reads its source from zu serve |
| 4 | `220b655` | pointing at a call or embed lights the lines it is written on |

Each task was done as the plan writes it, its code blocks applied in order. Each red step failed (a non-zero exit) before its code went in, and each green step passed after:
- Tasks 1 and 2 were red on build errors: `Edge` had no `More`, `View` no `Syntax`, and `tokKeyword` was undefined (1); `Hub.Keep`, `Views.Source`, `export.SourceFile` and `detailBudget` were undefined (2).
- Task 3's vitest red step failed 9 tests, among them `styles.test.ts`'s "Go colours' rules (19)". Its browser red step failed 0/6 in Firefox and WebKit, each check's value `undefined` after a 30 s wait. The build log keeps only the last lines, so Chromium's were not seen.
- Task 4's vitest red step failed 13 tests, among them the `.source .lit` rule. Its browser red step failed 5/13 in Firefox and WebKit. WebKit's `coloured` check lacked the note "Point at a call or embed to light the lines it is written on."

**16 to 19 against the replay.** After Task 4, zu's tree (a `git archive` of `220b655`) was byte-identical to the base of 20's scratch branch (`56a759f`: 16's to 19's tasks applied), the View goldens that `-update` wrote included. The comparison was `diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output.

## Gates

- **`make check`:** exit 0. `golangci-lint run ./...` printed no issues; vitest ran 354 tests.
- **`node accept.mjs`:** 57/57 in chromium, firefox and webkit.
- **`node place.mjs`:** 9/9 in each engine.
- **`node serve.mjs`:** 11/11 in each engine.
- **`node screen.mjs`:** 23/23 in each engine.
- **`node code.mjs`:** 13/13 in each engine.

## Measure (`measure.mjs`)

`bin/zu` was built by `make build` in Task 4's last green step. The repositories were `cp -cR` copies of the Test Corpus's clones, outside `.zu/corpus/`: hugo v0.166.0, cobra v1.10.2, and kubernetes v1.37.0, whole and its staging modules `k8s.io/api` and `client-go`.

As in 17 and 18, the plan's `measure.mjs .` stops at once, because `createRequire` takes only an absolute path. It was run with zu's absolute path in place of `.`, and nothing else changed. Before the run, the script waited for the 1-minute load to fall to 4; it started at 3.94 and ended at 2.84.

Each cell is the median of three runs, in ms. **Drawn** is from `goto` to the page drawn. **Code** is from the hash change to the panel open on its code's marked line, read from `/source`, for the function written furthest down its file that calls or embeds a declaration. **Longest** is the same, for the furthest declaration in the longest file the View declares in, on a page of its own. **Lit** is from pointing at the function's first "Calls and embeds out" row to its lines lit.

| Repository | View | Engine | Drawn | Code | Longest (worst) | Lit | Page errors |
|---|---|---|---|---|---|---|---|
| hugo | 2.87 MB, 6,826 declarations | chromium | 840 | 67 | 61 (70) | 15 | none |
| | | firefox | 873 | 84 | 85 (89) | 19 | none |
| | | webkit | 836 | 126 | 128 (132) | 23 | none |
| cobra | 0.11 MB, 286 | chromium | 233 | 41 | 40 (41) | 15 | none |
| | | firefox | 229 | 60 | 55 (56) | 11 | none |
| | | webkit | 224 | 89 | 87 (89) | 20 | none |
| k8s.io/api | 6.50 MB, 16,466 | chromium | 2,351 | 152 | 157 (160) | 14 | none |
| | | firefox | 2,380 | 172 | 177 (183) | 28 | none |
| | | webkit | 2,343 | 300 | 298 (377) | 25 | none |
| client-go | 9.10 MB, 19,341 | chromium | 2,370 | 81 | 110 (114) | 27 | none |
| | | firefox | 2,353 | 113 | 138 (157) | 32 | none |
| | | webkit | 2,368 | 139 | 185 (207) | 20 | none |
| kubernetes | 6.23 MB, packages only | chromium | 3,850 | – | – | – | none |
| | | firefox | 3,985 | – | – | – | none |
| | | webkit | 4,345 | – | – | – | none |

The longest files: hugo's `tpl/tplimpl/templatestore.go` (2,238 lines, 77 KB), cobra's `command.go` (2,073 lines), k8s.io/api's `core/v1/generated.pb.go` (73,169 lines, 2.6 MB, drawn in part) and client-go's `applyconfigurations/internal/internal.go` (17,705 lines, drawn in part). `/source` served each in at most 32 ms.

kubernetes whole holds 107,196 declarations, past the 20,000 of `detailBudget`, so zu serve said so once on stderr and the page drew packages only, as before 19. No criterion is set on it.

**Against the pass criteria:**

| Criterion | Measured | |
|---|---|---|
| the page draws within 3 s of `goto` on hugo, every engine | at most 1,046 ms (Firefox, first run) | met |
| the longest file's code shows within 500 ms, every engine | at most 377 ms (WebKit, `generated.pb.go`) | met |
| a pointed-at row lights its lines within 100 ms (median) | at most 32 ms (Firefox, client-go) | met |
| no page errors in any engine | none | met |

## The user's check, scripted

The lead ran the five steps as a Playwright script (`usercheck.mjs`, in the session's scratchpad), in chromium, firefox and webkit, at 1,400 × 900. It ran `zu serve` without `-include` on two repositories:
- a `cp -cR` copy of hugo v0.166.0, which step 4 writes to. Its page drew 6,826 declarations.
- kubernetes' staging module `k8s.io/api`, for a file past 5,000 lines. Its page drew 16,466 declarations.

All five steps passed in each engine, with no page errors:

1. **A function's file.** The script took hugo's first function, by id, that is not a method, calls a declaration and is called from another file: `cache/dynacache.CleanKey`, at `dynacache.go:645`. Its file showed with keywords, comments and strings coloured, line 645 marked and in view. In k8s.io/api, `core/v1.skipGenerated`, at line 73,085 of `generated.pb.go`'s 73,169, was marked and in view. The note over the code read "Lines 68170–73169 of 73169."
2. **A call, then a caller.**
   - Pointing at `common/paths.ToSlashPreserveLeading`'s row under "Calls and embeds out" lit line 646, and the note read "Line 646."
   - Pointing at the caller `internal/js/esbuild.batcher.Build` under "Called or embedded by" lit no line of this file. The note read "In other files: internal/js/esbuild/batch.go:338."
3. **The Screen.** `s`, then pointing at `ToSlashPreserveLeading`'s box below the Centre, lit line 646 and the note "Line 646.", as the row had.
4. **Saves.**
   - Appending `func ZuAccAdded<engine>() {}` to `dynacache.go`: the page fetched `view.json?latest` once, the View held the new function, and the code showed it.
   - Appending a comment: the code showed it, and the page fetched no View in the next 2.5 s.
   - The canvas renders only the boxes in view, so the script looked for the new function in the View, at `/view.json`, not for its box.
5. **`-include ./hugolib`.** On the clean copy, zu serve's `/view.json` was byte-identical to the View that `zu scan -html -include ./hugolib` inlines (1,154,650 bytes). Leaving the data aside, the served page equalled the scanned one, once two changes were applied to the scanned one: `export.LivePage` adds an empty icon and `connect-src 'self'`. Every served page has had those since 10.

The plan's check is a person's, by hand, and this script is not that. So the step's box stays unticked; it waits on the user's own check.

## Doc amendments

Applied as the plan's exact text, with one change:
- **ADR 0006:** a new section, **Amendment (19, 2026-10-20)**, after Consequences.
- **decisions.md, Serve (10):** the **Code (19)** prose, after "…A push or fetch shows at the next save or reload."
- **decisions.md, UI v1:** the **Code panel (19)** prose, after 18's text.
- **glossary.md:** **Code Panel**, after **Ghost**.
- **glossary.md, HTML Export:** "Inlined source carries its colour (19)."
- **requirements-draft.md:** no change, as the plan says.

**The change.** The plan said that with `-include`, zu serve sends the page `zu scan -html` writes "byte for byte". In both ADR 0006 and decisions.md that now reads "its View byte for byte". The View is byte-identical (step 5), but the page is not: since 10, a served page carries LivePage's two changes and fetches its View.
