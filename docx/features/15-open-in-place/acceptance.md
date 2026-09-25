# 15 · Open in place — acceptance

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0.
`bin/zu` was built by `make check` from Task 5's tree.

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `e7ca2c8` | the scene keeps what the view drew as it opened (`ref`, `opened`, `opening`, `keep`) |
| 2 | `fbcc52f` | `place.ts`: regions, `grow`, the frame cache; A1's regrown test |
| 3 | `2e6b736` | the page places the scene and keeps the drawing while a toggle lays out |
| 4 | `b313b9a` | B1: `show()`'s guard, so a layout the page no longer wants never draws |
| 5 | `5d1bfbf` | M4: `reveal`, the camera pan to an opened box past the canvas |

Each task's failing step failed before its code went in, and its passing step passed
after. Task 4's plan patch to `place.test.ts` rejected its import hunk, because A1's test
had changed the imports. I applied that hunk by hand, then ran Task 4's two red steps
again with Task 4's code set aside.

## Gates

- **`make check`:** exit 0. Lint was clean: `golangci-lint run ./...` printed no
  issues. vitest ran 270 tests: the plan's 269 plus A1's.
- **`node accept.mjs`:** 57/57 in chromium, firefox and webkit.
  - 08's Firefox reload crash did not occur in this run.
  - There is no retry loop (Q1); `accept.mjs`'s own rerun is the only one.
- **`node serve.mjs`:** 10/10 in each engine.
- **`node place.mjs`:** 9/9 in each engine.
- **14's files:** `git diff b07be19..HEAD` shows no change to `Panel.tsx`, `Header.tsx`,
  `accept.mjs`, `serve.mjs`, `data.ts`, `links.ts`, `links.test.ts` or `internal/`.

## Red for the right reason

Each proof sets the fix aside, runs the tests, and puts the fix back. Each file was
checked byte-identical afterwards with `cmp`.

- **M2, the scene cache hit on a selection** (`keep.test`). With `baseOf` keeping
  `selected`, only the M2 test fails. It gets 5 distinct opening views where it wants 1
  (`expected 5 to be 1`).
- **A1, a regrown container** (`place.test`, "sets in place a container the view draws
  with other children than the opening view did"). The scene is a hand-built Change
  View: the changed root package `m`, closed at the declarations, folds its unchanged
  declaration into a chip.
  - With `regrown` removed from `keep()`, the test and the shop Change View test fail.
  - Each of A1's assertions fails on its own, with the precondition and the assertions
    before it removed in turn:
    - `m/tools`, above `m`, moves;
    - `inPlace` finds 2 faults;
    - the scene is laid out whole (`frameKey(scene)` is in the cache).
  - `faults()` can't go red on its own here, because the whole-layout fallback draws no
    faults.
  - The "above or left" set is not empty: `m/tools` sits above `m` and stays at
    (64, 12).
- **U3, the shared frame cache.** With `grow` writing into the frames it reads, as a
  cache-corrupting bug would, only U3's test fails. Warm layouts differ from cold ones
  for 6 prefixes (`m/k04,m/k00` first).
- **B1, a stale layout that lands last.**
  - With Task 4's `App.tsx` and `place.ts` set aside, the vitest test fails (1 of 10):
    the drawing is the open's layout, and `m/k00/s1` is drawn.
  - `place.mjs` fails `raced` in all three engines (6/7).
- **`reveal`.** With Task 5's `Canvas.tsx` and `viewport.ts` set aside,
  `viewport.test.ts` fails 4 of 10 (`reveal` missing).
  - To build without `reveal`, its unit test was set aside too. `place.mjs` then fails
    `revealed` in all three engines (8/9).
  - A first try with the unit test left in failed the build quietly. That left Task 5's
    binary in place, so `place.mjs` passed 9/9. The build's exit code is now checked.
- **Task 3** (the page refits and blanks). With Task 3's `App.tsx` and `place.ts` set
  aside, `place.mjs` fails `others`, `kept` and `blank` (3/6).

`reveal` fires only after a toggle (Canvas's `flipped` ref), never on 13's live redraw
(Q2). That sentence is now in the plan's Risks.

## hugo and kubernetes (`place.mjs`)

- **The pages:** `zu scan -out <scratch>/ir.json -html …` over `.zu/corpus/hugo@v0.166.0`
  and `.zu/corpus/kubernetes@v1.37.0`.
  - The corpus was only read: `git status --porcelain` was empty before and after.
  - "Before" is `bin/zu` built from a `git archive` of b753c3a. "After" is Task 5's.

**Before (b753c3a):**

| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank | panned |
|---|---|---|---|---|---|---|---|---|---|
| hugo.html | chromium | 12 | 46 / 63 | 46 / 59 | 16 / 17 | 12 | 12 | 12 | 0 |
| kubernetes.html | chromium | 16 | 79 / 94 | 79 / 95 | 20 / 20 | 12 | 16 | 16 | 0 |
| hugo.html | firefox | 12 | 61 / 111 | 56 / 63 | 16 / 17 | 12 | 12 | 12 | 0 |
| kubernetes.html | firefox | 16 | 109 / 127 | 109 / 144 | 20 / 20 | 12 | 16 | 16 | 0 |
| hugo.html | webkit | 12 | 58 / 73 | 46 / 60 | 16 / 17 | 12 | 12 | 12 | 0 |
| kubernetes.html | webkit | 16 | 79 / 111 | 78 / 95 | 20 / 20 | 12 | 16 | 16 | 0 |

**After (Task 5):**

| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank | panned |
|---|---|---|---|---|---|---|---|---|---|
| hugo.html | chromium | 12 | 45 / 69 | 28 / 31 | 5 / 10 | 0 | 12 | 0 | 5 |
| kubernetes.html | chromium | 16 | 79 / 96 | 29 / 30 | 1 / 20 | 0 | 16 | 0 | 10 |
| hugo.html | firefox | 12 | 58 / 107 | 36 / 43 | 5 / 10 | 0 | 12 | 0 | 5 |
| kubernetes.html | firefox | 16 | 93 / 119 | 34 / 51 | 1 / 20 | 0 | 16 | 0 | 10 |
| hugo.html | webkit | 12 | 46 / 83 | 45 / 57 | 8 / 13 | 0 | 12 | 0 | 5 |
| kubernetes.html | webkit | 16 | 82 / 94 | 45 / 58 | 6 / 20 | 0 | 16 | 0 | 10 |

**Against the pass criteria:**

| | criterion | measured | |
|---|---|---|---|
| toggles moving a box above or left | 0 | 0 everywhere | met |
| restored | equals toggles | 12/12 and 16/16 everywhere | met |
| blank | 0 | 0 everywhere | met |
| median open and close | within 110 ms | worst median 93 ms (kubernetes, Firefox, open) | met |
| worst case (reported) | — | 119 ms, one open on kubernetes in Firefox | — |

## Doc amendments

Applied as the plan's exact text, except for A1's wording in the Region entry:
- **decisions.md, UI v1:** "U1–U5 full (U2 from 15; …)". The **Open in place (15)**
  prose is appended after "…are not in the Policy hash.".
- **glossary.md, Budget:** gains the sentence "It is decided on the view as it opens…".
- **glossary.md:** gains **Region**, after Fold Chip.
  - The plan's clause "or a container that now holds other children than the view as it
    opened drew" says the same as A1's sentence.
  - So it was replaced by A1's text, "…or a container the view draws with other children
    than the opening view did (regrown)", to avoid saying it twice.
- **requirements-draft.md:** no change (A6 holds literally).

The plan's decisions.md text already calls U2 full. The user's check below is what
confirms it; until it passes, U2 is built but not accepted.

## Pending, by a person

The user's check, from the plan, on a real repository's page:
1. **Open and close.** Open a box in the middle of a row, then one inside it, and close
   both.
   - Nothing above or left moves, and the view does not jump.
   - Where an opened box runs past the edge, the view pans just enough to show it, and
     nothing moves.
2. **A pasted URL.** Open a box, copy the URL, close the box, and paste the URL into the
   address bar.
   - The hash changes (`hashchange`), and the page draws the layout it had when the URL
     was copied.
   - Reload it; the layout is the same.
3. **A double-click.** Double-click a box's toggle quickly. The page ends as the hash
   says.

It has not been run.
