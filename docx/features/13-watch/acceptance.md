# 13 · Watch — acceptance

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0.
`bin/zu` was built by `make build` from Task 7's tree.

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `243dc7c` | the stamp with ctime and inode; `TrustStamps` (rescan-profile fix 3) |
| 2 | `5480477` | the poller, `internal/watch` |
| 3 | `b868945` | the Hub, `/events` and `/view.json?latest` |
| 4 | `678b669` | `zu serve -poll`, the session's hold, publish and clear, and fix 2 |
| 5 | `6b9e8c9` | `live.ts` |
| 6 | `878f823` | the page redraws; the notice; hidden pages free their stream |
| 7 | `2720220` | pan, zoom and the hash kept across a redraw |

Each task's failing step failed before its code went in, and its passing step passed
after. 13a (Tasks 1–4) can ship without 13b.

## Gates

- **`make check`:** exit 0, lint clean (`golangci-lint run ./...`: no issues). vitest:
  246 tests.
- **`node accept.mjs`:** 55/55 in chromium, firefox and webkit. Nothing in 12's
  acceptance moved.
- **`node serve.mjs`:** 9/9 in each engine.
- **08's Firefox reload flake** did not occur in any run.
- **A WebKit flake, found later:** `serve.mjs` on main failed 2 of 5 webkit runs on the
  page error `ResizeObserver loop completed with undelivered notifications.`, which is
  harmless. Since 14 (A1), `serve.mjs` ignores that exact message.

## Red for the right reason

Steering asked for proof of these three failures. Each proof removes the fix, runs the
test, and puts the fix back; each file was checked byte-identical afterwards with
`git diff`.

- **B1: an empty directory, then a save in it.** `TestServeWatchPushesAChange` makes
  `d/e`, waits 500 ms, then saves `d/e/e.go` under `-poll 100ms`.
  - With `discover` adding no new subdirectories (the old poller's scope), it fails at
    `watch_test.go:111` with "no event": no "view 3" arrives.
  - So it fails because the save was never seen, not because the package is missing
    from a View.
- **M1(b): a page load between the watch's listing and its rescan.**
  `TestServeWatchListsAgainAfterAPageLoad` drives a real session over a committed tree,
  not mocks. It uses `list`, `view` and `changed` on real files.
  - With the relist in `changed` disabled (`scans != polledAt`), it fails: "the watch
    published a View without c".
- **M2: a seventh tab.** With `follow` keeping the stream open while hidden, `serve.mjs`
  fails in all three engines: `tabs = false, want true` (8/9).
  - With the fix restored, all three pass 9/9.

## `-poll 0` is 10's behaviour

- `TestServeRescansOnlyWhatChanged` runs with `-poll 0` and passes.
- On the real binary with `-poll 0`, `/events` is a 404, and `/view.json` is a 200 with
  no `Zu-Generation`.
- **With the default poll:** `/view.json` carries `Zu-Generation: 1`, and `/events`
  sends `event: view`/`data: 1`, then `event: notice`.

## kubernetes at the default 1 s poll (`measure.mjs`)

- **The tree:** a `cp -cRp` clonefile copy of `.zu/corpus/kubernetes@v1.37.0` in the
  scratchpad. The corpus was only read; the copy's `git status` was clean, and the copy
  was deleted afterwards.
- **The run:** `node docx/features/13-watch/measure.mjs "$K" pkg/util/env 1s 11`, twice.

| | run 1 | run 2 |
|---|---|---|
| idle zu serve | 6.8 % of one core | 6.5 % |
| save → drawn, ms | 1748 1768 1612 1643 1385 1222 2206 2770 2590 2005 1626 | 2030 1753 1667 1571 1399 1216 2244 2009 1927 1790 1589 |
| save → drawn, min / **median** / max | 1.22 / **1.75** / 2.77 s | 1.22 / **1.75** / 2.24 s |
| watch rescans (11 each) | 889–1672 ms | 900–1020 ms |

**Against the budget:**

| | budget | measured | |
|---|---|---|---|
| every watch rescan | under 2 s | at most 1.67 s | met |
| median save → drawn | at most 2 s | 1.75 s in both runs | met |
| worst save → drawn (reported, not gated) | — | 2.77 s | — |

## A fix to `measure.mjs`

The plan's script read the rescans with `/watch: scanned in (\d+)ms/`. zu prints a
rescan of 1 s or more in seconds (`1.023s`), and that pattern skipped it.

- **Effect:** the first two runs counted only 3 and 7 of their 11 rescans each, and
  gave a maximum of 986 ms.
- **The fix:** the committed script reads both forms. The runs above count all 11, and
  one rescan took 1.67 s.
- **What it means for the plan's figures:** the Measurements table's "855–957 ms (22
  rescans)" came from the same pattern. Any rescan of 1 s or more would have been left
  out, so those figures may understate the slowest rescan.
- **The doc amendments** (decisions.md, rescan-profile.md, requirements-draft.md) quote
  the plan's figures as exact text, and I applied them unchanged. The fuller figure
  from this run is 0.89–1.67 s, still under the 2 s budget. Whether to restate them is
  steering's call.

## Doc amendments

Applied as the plan's exact text:
- **decisions.md:** Serve (10) gains `[-poll interval]` and the Watch (13) text.
- **rescan-profile.md:** features 12 → 13 at l.3, l.142 and l.151, plus the "Taken by
  feature 13" note.
- **10's plan:** l.46, and the note under "Feature 11 (next)".
- **10's acceptance:** l.51.
- **requirements-draft.md:** the "Change to redraw" budget bullet.
- **glossary.md:** gains **Generation**.

**Not applied: the plan's CLAUDE.md layout text.** It came in a peer session's message,
and this session edits CLAUDE.md only on the user's own word. It is left for the user
to apply or approve.

## Pending, by a person

The user's check, from the plan:
1. Run `zu serve` on this repository and open a package.
2. Pan and zoom somewhere.
3. Add a function in an editor and save. It appears in about 2 s, with pan and zoom
   unchanged.
4. Delete a brace and save. The banner names the file, and the drawing stays.
5. Undo and save. The banner goes.
6. Switch to another tab for a while, save a change, and switch back. The change is
   drawn.

It has not been run.
