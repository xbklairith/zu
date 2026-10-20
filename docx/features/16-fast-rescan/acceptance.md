# 16 · Fast rescan — acceptance

Measured 2026-10-21 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0, on branch `build-16-20`.
The machine was shared with other sessions, and Spotlight was indexing: the 1-minute load average ran from 3.5 to 19 during the gates and runs below, and each run gives its own.

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `eb36a0d` | a `ListTree` lists once, and reads a few files at a time; `hunksOf` takes a file deleted after the listing |
| 2 | `53a87f0` | the Cache keeps each package's part and assembles again only the packages whose inputs changed |
| 3 | `04faf34` | `Policy.Apply` with no lens shares a canonical IR's locations |
| 4 | `8dfb21a` | `diff.Compare` walks two sorted IRs side by side |
| 5 | `f5b1a14` | `zu serve` keeps the Base in order, so `Compare` merges |
| 6 | `b3b60bf` | `accept.mjs` reloads only after the layout worker answered |
| 7 | `84e8da1` | an added or removed package assembles only its importers |

Each task was done as the plan writes it, its code blocks applied in order. Each red step failed (a non-zero exit) before its code went in, for the reason the plan gives, and each green step passed after. 16's and 17's trees together are checked against the replay's, byte for byte, once 17 is built (17's acceptance).

## Gates

- **`make check`:** exit 0. `golangci-lint run ./...` printed no issues; vitest ran 270 tests.
- **`go test -race -count=1 …`** (the plan's seven packages): passed.
  - The first run failed one test in `internal/watch`, a package 16 does not change: `TestWatcherCoalescesABurst` saw the 200-file burst reported after 131 files, at a load average of about 12. Writing the burst outlasted the watcher's quiet period. The test passed in three runs right after, at a load of 10.5–11.5, and in the full rerun of the gates.
- **`node accept.mjs`:** 57/57 in chromium, firefox and webkit.
- **`node serve.mjs`:** 10/10 in each engine.
- **`node docx/features/16-fast-rescan/measure.mjs --selftest`:** passed.

## Corpus parity

`TestCorpusRescansMatchColdScans` on `cp -cRp` copies of the three corpus trees (`.zu/corpus/` was only read: `git status --porcelain` was empty before and after; each copy's was empty after its run). Every step's rescan IR was byte-identical to a cold scan's. Packages assembled:

| Edit | kubernetes (`…/apimachinery/pkg/util/sets`) | hugo (`common/hugio`) | cobra (`doc`) |
|---|---|---|---|
| first scan | 2,963 of 2,963 | 193 of 193 | 2 of 2 |
| new function | 347 | 26 | 1 |
| body-only edit | 1 | 1 | 1 |
| function removed | 347 | 26 | 1 |
| package renamed | 347 | 26 | 1 |
| package renamed back | 347 | 26 | 1 |
| new file | 347 | 26 | 1 |
| file deleted | 347 | 26 | 1 |
| a file importing a missing package | 347 | 26 | 1 |
| new package | 2 of 2,964 | 2 of 194 | 2 of 3 |
| package deleted | 1 | 1 | 1 |
| the importing file deleted | 347 | 26 | 1 |
| parse error | 0 (1 parse error) | 0 (1) | 0 (1) |
| parse error fixed | 0 | 0 | 0 |
| time | 71.6 s | 3.5 s | 0.2 s |

Fourteen steps each, as the plan says; "new package" assembled 2 packages and "package deleted" 1. The counts are the plan's, step for step.

## Measure (`measure.mjs`, kubernetes v1.37.0)

`bin/zu` was built by `make build` from Task 7's tree. Two `cp -cRp` copies of `.zu/corpus/kubernetes@v1.37.0`: copy 1 had `git status` run once, so its index was fresh; copy 2 was left untouched for run 3. Further copies were made for any rerun of run 3. `-base` is `HEAD~50`, 24a5b06. Each run is 11 rounds at the default 1 s poll. Rescans are as `zu serve` logs them, in ms (min / median / max). Write → drawn is in Chromium, as a median.

**Load rule**, as the plan sets it: before each attempt, the script waited up to 3 minutes for the 1-minute load to fall to 4 or less. An attempt that still started above 4 was run again, up to twice. Every attempt is kept below, and the gated one is marked.

| Run | What | Attempt | Load at start | Rescan min / median / max | Write → drawn | Gated |
|---|---|---|---|---|---|---|
| 1 | Project View, `pkg/util/env`, uncommitted | 1 | 5.76 | 272 / 397 / 505 | 1,211 | |
| 1 | the same | 2 | 3.53 | 272 / 331 / 846 | 1,129 | ✓ |
| 2 | `-base`, `pkg/kubelet`, uncommitted | 1 | 4.86 | 510 / 604 / 809 | 1,420 | |
| 2 | the same | 2 | 4.00 | 468 / 538 / 649 | 1,344 | ✓ |
| 3 | `-base`, `pkg/kubelet`, committed and pushed, copy 2 (first run over a freshly copied tree) | 1 | 3.89 | 645 / 774 / 1,007 | 2,018 | ✓ |
| 4 | Project View, `…/apimachinery/pkg/util/sets` (347 importers), `WAIT=scan` | 1 | 3.76 | 395 / 404 / 423 | – | ✓ |
| 5 | `-base`, `…/pkg/util/sets` | 1 | 3.80 | 618 / 711 / 817 | 1,538 | ✓ |
| 6 | Project View, `pkg/util/env`, a new package each round (`NEWPKG=1`) | 1 | 3.85 | 256 / **412** / 1,038 | – | ✓ |
| 7 | `-base`, `pkg/kubelet`, a new package each round | 1 | 4.62 | 582 / 716 / 914 | – | |
| 7 | the same | 2 | 3.46 | 478 / 584 / 748 | – | ✓ |

No run printed a `WARNING` line: each saw one watch rescan per round. Copy 1's `git status` was clean after the runs.

**Against the pass criteria:**

| Criterion | Measured | |
|---|---|---|
| every watch rescan, in every run, under 2 s, copy 2's first included | at most 1,038 ms (run 6); copy 2's first 774 ms | met |
| median at most 400 ms in runs 1 and 6 | run 1: 331 ms; run 6: **412 ms** | **run 6 missed, by 12 ms** |
| median at most 1 s in runs 2, 3 and 7 | 538, 774 and 584 ms | met |
| runs 4 and 5: under 2 s only, medians recorded | 404 and 711 ms; at most 817 ms | met |
| no `WARNING` line | none | met |

**Run 6's miss.** Run 6 started at a load of 3.85, under the rule's 4, so the rule ran it once, and that run is the one gated. Seven of its rescans took 256–451 ms and four took 561, 649, 675 and 1,038 ms. Every rescan did the same work: one file parsed, one package added, which nothing imports. To see whether the miss came from 16's code or from the machine, run 6 was run twice more, outside the rule, with each rescan's log line printed (a copy of `measure.mjs` that also prints `zu serve`'s "watch: scanned in" lines):

| Run 6 again | Load at start | Rescan min / median / max |
|---|---|---|
| 1 | 3.42 | 247 / 265 / 329 |
| 2 | 3.88 | 239 / 264 / 366 |

Every rescan of both logged `1 parsed, 0 parse errors`, with one more package than the last. Their medians match the plan's 260 ms for a new package. My reading is that the first run's four slow rescans were load spikes from other work on the machine, which the 1-minute average at the start did not show. The criterion is still recorded as missed on the gated run.

Rescans here ran slower than the plan's figures for a new function (331 ms against 278 and 282) and faster for the hub package (404 against 535); the load was higher here than in the plan's runs.

## Firefox

`node accept.mjs` five times in a row, at loads of 5.3 to 14.7: 57/57 in chromium, firefox and webkit each time. No "page crashed" line was printed, so `accept.mjs` reran nothing. The plan expected none from the twelve guarded reloads.

## Doc amendments

Applied as the plan's exact text:
- **decisions.md:** the Serve bullet's rescan sentence, and the **Firefox reload (16)** bullet after **UI v1**.
- **requirements-draft.md:** the `zu serve -base` (14) line, and the **Rescan in `zu serve` (16)** bullet after it. Its measured figures are the plan's; this run's are above.
- **10-serve/rescan-profile.md:** the **Taken by feature 16** paragraph.
- **glossary.md:** **Part**, after **IR**.
