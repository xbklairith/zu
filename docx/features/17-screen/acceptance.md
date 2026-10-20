# 17 · The Screen — acceptance

Measured 2026-10-21 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0, on branch `build-16-20`.
The machine was shared with other sessions: the 1-minute load average was 9 to 14 while Tasks 1–6 were built, and 3.5 to 3.6 during the Measure.

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `b76662a` | the export counts the calls and embeds a Project View leaves off the page (`offIn`, `offOut`) |
| 2 | `da3d28a` | search matches a name's word starts |
| 3 | `73cb1ca` | a Screen's rows, built from the View: the Centre, what depends on it, what it depends on |
| 4 | `5997bb0` | a Screen is placed without ELK, each line from its middle, and opens at the Centre |
| 5 | `50a9e75` | the hash keeps the Centre (`c`), and a history entry is added only when it changes |
| 6 | `0be3732` | the page draws the Screen: `s` centres the selection, a click re-centres, Back returns |

Each task was done as the plan writes it, its code blocks applied in order. Each red step failed (a non-zero exit) before its code went in, and each green step passed after. Task 6's browser red steps both exited 1:
- `screen.mjs`: the build log keeps only its last lines, WebKit's 0/14, its lens button never enabled;
- `serve.mjs`: 10/11 in each engine, failing its `lost` check.

**16 and 17 against the replay.** After Task 6, zu's tree (a `git archive` of `0be3732`) was byte-identical to the base of 18's scratch branch (`a9448e3`, 16's and 17's tasks applied), by `diff -rq` leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output.

## Gates

- **`make check`:** exit 0. `golangci-lint run ./...` printed no issues; vitest ran 302 tests.
- **`node accept.mjs`:** 57/57 in chromium, firefox and webkit.
- **`node place.mjs`:** 9/9 in each engine.
- **`node serve.mjs`:** 11/11 in each engine.
- **`node screen.mjs`:** 14/14 in each engine.

## Measure (`measure.mjs`)

`bin/zu` was built by `make build` in Task 6. The pages were written from `.zu/corpus/`, which was only read (`git status --porcelain` was empty before and after in both clones):
- kubernetes v1.37.0, `-include ./pkg/kubelet`: 3,462 nodes, 26,109 edges, 8.8 MB, scanned in 3.8 s;
- hugo v0.166.0, `-include ./hugolib`: 1,065 nodes, 1,771 edges, 3.0 MB, scanned in 0.25 s.

The plan's command, `node docx/features/17-screen/measure.mjs . …`, stops at once: `createRequire` takes only an absolute path, and `.` gives `./web/e2e/package.json`. It was run with zu's absolute path in place of `.`, and nothing else changed.

`measure.mjs` does not listen for page errors. So it was run twice: as written (run 1), then as a copy that adds a `pageerror` listener and prints what it hears, and nothing else (run 2). The load average was 3.49 at the start of run 1 and 3.48 at the start of run 2.

Times are in ms, from the key or click to the new Centre's box in the DOM, then to two frames after (drawn/+2 frames). The Centre is the package the most packages import: `k8s.io/apimachinery/pkg/apis/meta/v1` (1,201 importers) and `github.com/spf13/cast` (50).

**kubernetes**

| Engine | Run | Enter | Re-centre ×3 | Re-centre ×3, Panel closed | Every box | Tree Panel ×3 | Page errors |
|---|---|---|---|---|---|---|---|
| chromium | 1 | 67/82 | 24/29 13/16 22/27 | 22/26 15/20 27/31 | 90/182 (1,217 boxes) | 71 66 45 | – |
| chromium | 2 | 60/73 | 23/28 29/34 28/34 | 18/23 22/28 17/22 | 73/170 | 65 72 77 | none |
| firefox | 1 | 100/107 | 23/28 24/29 48/54 | 41/48 42/49 48/55 | 192/355 | 84 64 88 | – |
| firefox | 2 | 93/101 | 54/63 23/27 17/22 | 30/36 15/20 24/30 | 227/370 | 103 100 77 | none |
| webkit | 1 | 77/113 | 374/394 42/78 382/406 | 20/37 44/78 25/60 | 147/275 | 440 87 433 | – |
| webkit | 2 | 120/176 | 373/407 47/73 390/418 | 43/59 17/45 24/49 | 127/265 | 411 88 438 | none |

**hugo**

| Engine | Run | Enter | Re-centre ×3 | Re-centre ×3, Panel closed | Every box | Tree Panel ×3 | Page errors |
|---|---|---|---|---|---|---|---|
| chromium | 1 | 24/30 | 9/34 17/25 16/21 | 10/15 19/25 12/19 | 9/16 (51 boxes) | 11 20 16 | – |
| chromium | 2 | 35/41 | 22/29 17/23 15/17 | 19/25 19/26 16/20 | 12/18 | 10 23 11 | none |
| firefox | 1 | 50/58 | 16/24 16/30 12/17 | 11/17 16/22 31/35 | 11/21 | 34 17 26 | – |
| firefox | 2 | 55/62 | 20/32 38/46 33/39 | 47/54 18/24 29/34 | 27/38 | 35 15 34 | none |
| webkit | 1 | 55/106 | 21/56 32/63 14/38 | 15/43 25/62 25/49 | 11/46 | 41 18 24 | – |
| webkit | 2 | 41/83 | 16/42 30/68 13/45 | 33/51 21/63 28/60 | 18/46 | 28 26 30 | none |

**Against the pass criteria** (the worst of both runs, at two frames after):

| Criterion | Measured | |
|---|---|---|
| enter under 200 ms | 176 ms (WebKit, kubernetes, run 2) | met |
| re-centre with the Panel closed under 100 ms | 78 ms (WebKit, kubernetes, run 1) | met |
| every box on `meta/v1` under 1 s | 370 ms (Firefox, run 2) | met |
| no page errors in any engine | none (run 2) | met |

**The Panel's WebKit swap.** With the Panel open, WebKit took 394–418 ms to re-centre from `meta/v1` onto two of its three heaviest importers, and 411–440 ms to move the tree's Panel to the same two. The third took 73–88 ms in both lenses. With the Panel closed, the same re-centres took 37–78 ms. That is the Panel's list reconciliation, as **Risks** says, not the Screen. Chromium and Firefox took 16–63 ms to re-centre with the Panel open.

## The user's check, scripted

The lead ran the four steps as a Playwright script (`usercheck.mjs`, in the session's scratchpad), in chromium, firefox and webkit. It ran against `zu serve -include ./hugolib` on a `cp -cRp` copy of hugo v0.166.0, at 1,400 × 900, one browser context per engine. All four steps passed in each engine, with no page errors:

1. **Back and Forward.** It clicked hugolib's box on the tree, pressed `s`, and re-centred three times by clicking boxes: hugolib → `common/herrors` → `common/paths` → `common/hmaps`.
   - Back drew `common/paths`, `common/herrors` and hugolib's Screens, then the tree, with `s` = hugolib and no `c`, and hugolib's box centred on the canvas (within 4 px).
   - Forward drew hugolib, `common/herrors`, `common/paths` and `common/hmaps` again.
2. **A new tab.** The Screen's URL, opened in a new tab, drew the same boxes.
3. **A method.** It selected `HugoSites.Build`, the hugolib method with the most calls out, and pressed `s`. `HugoSites`'s Screen was drawn, with 8 boxes and 7 lines. The header read:

   > Above: what calls or embeds it. Below: what it calls or embeds. Size: √(uses × declarations). Not drawn: 52 calls and embeds out of it, with declarations in packages not included (re-run with -include); 2301 unresolved calls in its package.
4. **Word starts.** On that Screen it typed `BC` in search. The first result was `BuildCfg`; Enter re-centred the Screen on it.

The plan's check is a person's, by hand, and this script is not that. So the step's box stays unticked, and U14 is not yet recorded as met in `decisions.md`; that waits on the user's own check.

## Doc amendments

Applied as the plan's exact text:
- **glossary.md:** **Screen**, **Centre** and **Weight**, after **Region**.
- **decisions.md, UI v1:** the **Screen (17)** prose, after "…Nothing is animated.".
- **requirements-draft.md:** the U14 row, after U8.

## After scrutiny

**Round 1** (2026-10-21, fix-then-ship):
- **The × hid a Centre's Panel for the rest of the session.** A Panel closed on a Screen stayed closed after a re-centre and Back. `88dd92d` clears the closed flag when the Centre changes. `screen.mjs`'s `panel` check now walks back to the closed Centre, and fails without the fix.
- **The Panel's WebKit swap.** `376a4c8` keys the Screen's Panel by its Centre, so React mounts it anew instead of reconciling its lists. The lead ran an A/B on kubernetes `meta/v1`, alternating twice, timing re-centres with the Panel open in WebKit (ms at +2 frames):
  - unkeyed: 421 / 90 / 436 and 411 / 52 / 417;
  - keyed: 75 / 93 / 69 and 84 / 65 / 69.

  This is a rerun after the commit; `376a4c8`'s message quotes an earlier one (375–402 ms unkeyed, 34–59 ms keyed). So the Screen's 394–418 ms in **The Panel's WebKit swap** above no longer holds. The tree's Panel is not keyed. It still takes 411–440 ms in WebKit on the two heaviest moves, and stays the follow-up (plan **Risks**).
- **`measure.mjs`.** `d504b88` lets it take `.` and makes it listen for page errors. So "the plan's command … stops at once" and "`measure.mjs` does not listen for page errors" above no longer hold.
- **A search pick of the Centre already drawn capped its rows again.** `49ff51c` makes `centreAt` return the same state; `state.test.ts` pins it.
- **The Centre's `selected` flag drew nothing.** `e5e9569` drops it. 18's `measure.mjs` found the Centre by it and hung; `3de9da6` fixed that.
- **Not changed: a Proposal's Screen drops calls into omitted packages without counting them.** The Screen draws over the Proposal's View, and the tree drops those calls the same way. A follow-up.

**Round 2** (2026-10-21, at `cb05693`, fix-then-ship, on docs only):
- **The fixes, checked.** The reviewer checked each fix by removing it: without `88dd92d` the `panel` check fails in every engine, and without `49ff51c` `state.test.ts` fails. Their own WebKit A/B gave 387–433 ms unkeyed and 52–90 ms keyed on the heavy moves. Keying lost no state, scroll, lit line (19), declaration-diff scroll (20) or history entry.
- **The measure at the tip, as the plan writes it.** Every criterion holds:
  - enter: worst 141 ms;
  - re-centre with the Panel closed: worst 62 ms;
  - every box: worst 423 ms;
  - no page errors.

  WebKit re-centres with the Panel open in 61–80 ms.
- **The fix.** It asked for this section, and for the plan's **Risks**, **Out of scope** and **Notes** to say the Screen's Panel is keyed. Both are done.
- **Gates since.** `screen.mjs` is 24/24 at the tip, with 18's ten checks. vitest runs 372.
- **Nits, not changed.**
  - `down:#more` is untested; `up:#more` takes the same path.
  - 20's scroll-to-top effect does nothing on the Screen's Panel, which a remount already opens at its top. The tree's Panel still needs it.
