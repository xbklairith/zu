# 18 · The Screen in a Change View — acceptance

Measured 2026-10-21 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0, on branch `build-16-20`.
The machine was shared with other sessions and with two review agents: the 1-minute load average was 3.3 to 3.6 while Tasks 1–4 were built, and 3.9 to 5.2 during the Measure.

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `9ef228b` | the export keeps a Change View's unchanged neighbours for its Screens (`near`) |
| 2 | `c58830d` | the Screen reads a Change View: Change Status marks, ghosts, the Centre's members and its Affected Set |
| 3 | `7b9ce4c` | the walk, in reading order, with `n` and `p` |
| 4 | `17ab2ad` | the page draws the walk and the change on the Screen |

Each task was done as the plan writes it, its code blocks applied in order. Each red step failed (a non-zero exit) before its code went in, and each green step passed after. Task 4's browser red step failed 14/23 in Firefox and WebKit, with WebKit's lines showing the nine checks the plan names (walk, marks, affected, step, near, full, red, list, host); the build log keeps only the last lines, so Chromium's were not seen.

**16 to 18 against the replay.** After Task 4, zu's tree (a `git archive` of `17ab2ad`) was byte-identical to the base of 19's scratch branch (`5aec44c`: 16's, 17's and 18's tasks applied). The comparison was `diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output.

## Gates

- **`make check`:** exit 0. `golangci-lint run ./...` printed no issues; vitest ran 326 tests.
- **`node accept.mjs`:** 57/57 in chromium, firefox and webkit.
- **`node place.mjs`:** 9/9 in each engine.
- **`node serve.mjs`:** 11/11 in each engine.
- **`node screen.mjs`:** 23/23 in each engine.

## Measure (`measure.mjs`)

`bin/zu` was built by `make build` in Task 4's last green step. The pages came from `zu diff HEAD~50 -max-parse-errors 1000000 -html`, run in `cp -cR` copies of the corpus clones, not in `.zu/corpus/` itself. That way not even git's index refresh touched the corpus. Each copy's `git status --porcelain` was empty before and after.

| Change | Base (`HEAD~50`) | `zu diff` | Page | Walk |
|---|---|---|---|---|
| kubernetes v1.37.0 | `24a5b06` | 8.3 s | 17.6 MB | 164 steps |
| hugo v0.166.0 | `85ad5e4` | 0.42 s | 3.2 MB | 126 steps |

As in 17, the plan's `measure.mjs .` stops at once, because `createRequire` takes only an absolute path. It was run with zu's absolute path in place of `.`, and nothing else changed. Before the run, the script waited for the 1-minute load to fall to 4; it started at 3.94 and ended at 5.19.

Times are in ms, from the key to the walk's "N of M" with a new Centre's box in the DOM, then two frames. Each cell is the median/worst over the first 12 steps:

| Page | Engine | Enter | Step | Back | Panel closed | Tree Panel | Page errors |
|---|---|---|---|---|---|---|---|
| kubernetes | chromium | 51 | 29/75 | 31/61 | 27/63 | 61/85 | 0 |
| kubernetes | firefox | 60 | 46/100 | 45/94 | 38/59 | 55/82 | 0 |
| kubernetes | webkit | 93 | 54/131 | 47/114 | 58/110 | 114/157 | 0 |
| hugo | chromium | 30 | 19/27 | 30/32 | 20/26 | 33/39 | 0 |
| hugo | firefox | 31 | 30/46 | 48/120 | 25/34 | 39/85 | 0 |
| hugo | webkit | 70 | 30/55 | 30/46 | 27/43 | 48/108 | 0 |

**Against the pass criteria:**

| Criterion | Measured | |
|---|---|---|
| enter under 200 ms | at most 93 ms (WebKit, kubernetes) | met |
| step and Back medians under 100 ms | at most 54 ms (step, WebKit, kubernetes) and 48 ms (Back, Firefox, hugo) | met |
| no page errors in any engine | none | met |

**The worst case:** a step took 131 ms (WebKit, kubernetes). The tree's Panel took 157 ms to move to the same Centres in WebKit.

## The user's check, scripted

The lead ran the six steps as a Playwright script (`usercheck.mjs`, in the session's scratchpad), in chromium, firefox and webkit, at 1,400 × 900. It used two `zu serve` servers, each on its own `cp -cR` copy of hugo v0.166.0:

- **real:** `-base HEAD~50`, for steps 1, 2, 4 and 5. Its walk had 126 steps over 35 changed packages, with no new violations.
- **made:** `-base HEAD~1`, for steps 3 and 6. The copy has two commits on top of v0.166.0.
  - The first adds a `zu.policy.yaml` whose `levels` put `github.com/gohugoio/hugo/common` below `…/hugolib`.
  - The second reverses an import. It removes `hugolib/page__meta.go`'s import of `common/hiter`, the only file in hugolib that imports it, and adds a blank import of hugolib to `common/hiter/iter.go`.
  - So the change is both a reversed import and a new violation of the Levels rule.

All six steps passed in each engine, with no page errors:

1. **`n`.** It drew `common/hstrings`'s Screen, the first changed package, which is `changed[0]` of the View. "1 of 126" was in the toolbar, and `+ Matcher` was on the Centre.
2. **The walk.** `n`, `n`, ▸, `n`, `p`, ◂, then Back twice read 1, 2, 3, 4, 3, 2, 3 and 4 of 126. Each step's Centre was the walk's step of that number, as recorded by stepping through all 126 with `n`.
3. **A reversed import.** On `common/hiter`'s Screen, hugolib was drawn in the row below and as a ghost in the row above. On hugolib's Screen, reached by clicking its box, `common/hiter` was in the row above and its ghost in the row below.
4. **An unchanged box, then `n`.** On `common/hreflect.convertToUintIfPossible`'s Screen, a click on the unchanged `common/hreflect.ConvertIfPossible` re-centred there. The toolbar then read "– of 126". `n` went on to `common/hreflect.convertToIntIfPossible`, 14 of 126: the walk's step after its package.
5. **Esc.** Back to `ConvertIfPossible`'s Screen, then Esc, drew the tree with `common/hreflect` selected and no `c`.
6. **A new violation.** On the made change, `n` drew the importer `common/hiter` first, "1 of 2". Its line to hugolib was red (`pinned`), the only red line, and the legend read "violates zu.policy.yaml (levels or cycle)".

**Step 5's wording.** The step says "the tree is drawn with the Centre's package selected". That holds for a Centre the tree does not draw: a near declaration, as above, or a package. Leaving a changed declaration selects the declaration itself. Esc on `common/hstrings.Matcher`'s Screen selected `common/hstrings.Matcher`, as the plan's `lens.ts` change and its test ("drawn: itself") say. The script checked both.

The plan's check is a person's, by hand, and this script is not that. So the step's box stays unticked; it waits on the user's own check.

## Doc amendments

Applied as the plan's exact text:
- **glossary.md:** **Walk** and **Ghost**, after **Weight**.
- **glossary.md, Change View:** the third sentence replaced, and the paragraph rewrapped as the file wraps.
- **decisions.md, Diff base:** "the Change View's Screens show one hop of unchanged neighbours, plain (18: …)".
- **decisions.md, UI v1:** the **Screen in a Change View (18)** prose, after 17's text.
- **decisions.md, 17's Screen text:** "; `n` is kept for 18" and "A Change View has no Screen until 18." deleted; the `offIn`/`offOut` clause replaced.
- **requirements-draft.md:** no change, as the plan says.
