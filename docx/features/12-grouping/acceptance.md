# 12 · Grouping — acceptance

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0.
`bin/zu` was built by `make build` at `82e5e3b` (Tasks 1–9 and amendment A2).

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `c912981` | `main` in the IR |
| 2 | `1517ce8` | Policy `demote:` and `budget:`, left out of the hash |
| 3 | `c598ce1` | the View marks packages as demoted, and carries `main`, `genDecls` and the budget |
| 4 | `0e9d6b9` | the Strip |
| 5 | `804c9ed` | the Budget and the Fold chip |
| 6 | `64661e7` | at most 7 rows |
| 7 | `719fb8f` | the root module opened in place |
| 8 | `87d935f` | badges and "entry points", with amendment A1 |
| 9 | `b5b5b5e` | the browser suite |
| A2 | `82e5e3b` | the `#closed` round trip in three browsers |

Each task's failing step failed before its code went in, and its passing step passed
after. 12a (Tasks 1–3) can ship without 12b.

**Task 1's golden:** I read the `shop.golden.json` diff rather than regenerating it
blind. It adds `"main": true` to `example.com/shop` and `example.com/shop/tools/gen`
and changes nothing else. Those are shop's only `package main` packages:
`internal/store/ignored.go` also says `package main`, but its `//go:build ignore` tag
keeps it out of the scan. Task 3's View goldens add only `main` (twice each) and
`genDecls: 2` on the package holding `zz_generated.go`.

## Gates

- **Task 10's chain:** exit 0.
  - `gofmt -l`: none.
  - `go vet ./...`, and `go test -count=1 ./...` (11 packages ok).
  - `golangci-lint run ./...`: no issues.
  - `npm run typecheck`, and 231 vitest tests in 26 files.
- **`npm run accept`:** 55/55 in chromium, firefox and webkit. That is Task 9's 54 checks
  and A2's `rootClosed`.

## Amendments at approval

- **A1: `gen N%` shows from 50 %.**
  - `GEN_MIN = 0.5`.
  - The test now reads "… and gen from 50 %", and a new `m/part` box, 30 % generated,
    must carry no badge. It failed before the change (`expected [ 'gen 30%' ] to be
    undefined`) and passed after.
  - On kubernetes only `api` and `client-go` (`gen 83%`) and `apiextensions-apiserver`
    (`gen 61%`) keep the badge, in all three engines.
  - **A side effect:** fewer boxes carry a badge line, so kubernetes' whole first view
    now fits at the 1.2 zoom cap, where the prototype had 1.141.
  - The doc amendments say "from 50 %".
- **A2: a browser round trip for `#closed`.**
  - **Finding: `with.html` can't test it.** Shop has so few boxes that its automatic
    depth is above 1, and R5 applies only at depth ≤ 1. So on `with.html` the root
    module is open because of the depth, not because of R5, and its toggle is the
    ordinary one: the first version of the check read `#t=example.com%2Fshop`, not
    `#closed`. Task 9's `rootOpen` check passes on `with.html` for that reason, and
    Deviation 11's line "with `with.html` … the root module opens in place too" holds
    only in that sense.
  - **The new fixture:** `rooted.html`, shaped like kubernetes. A root module `k` has
    `cmd` and `pkg`, and three modules are nested under `staging/src`, 75 boxes at
    depth 2, which keeps the automatic depth at 1.
  - **The check `rootClosed`:**
    1. At first, `k` is open.
    2. Its toggle writes `#t=k%23closed`: `URLSearchParams` escapes the literal `#`.
    3. After a reload, `k` is a closed box and the hash is unchanged.
    4. An old link's `#t=k` opens it in place again (N10).
  - With `toggleId` disabled in `scene.ts`, the check failed in every engine
    (`[1,"#t=k",1,1,"#t=k",1]`). With the code restored, it passed.

## The first views, `measure.mjs` at 1600 × 1000

The Test Corpus checkouts `hugo@v0.166.0` and `kubernetes@v1.37.0` were exported by
`bin/zu scan`, read-only: `git status` was clean in both afterwards. hugo has 193
packages, and kubernetes 2,963. Neither scan had a parse error.

The three engines agreed on every number:

| | hugo | kubernetes |
|---|---|---|
| zoom | 1.2 (whole scene) | 1.2 (whole scene) |
| smallest text (labels, stats, badges) | 13.2 px | 13.2 px |
| boxes drawn | 15 | 15 |
| rows, top sibling set | 7 | 7 |
| chips | "3 tests & tools · used by 5", "+20 more" | in `kubernetes`: "258 tests & tools · used by 3", "+2 more"; below: "183 tests & tools · used by 1", "+18 more" |
| nodes in the whole scene | 18 | 21 |
| top row | `hugo (package)` | `kubernetes`, opened in place: `plugin`, `cmd`, then `pkg`, then its two chips |
| axis | "entry points / uses / depends on nothing here" | "entry points / uses / depends on nothing here" |
| page or CSP errors | 0 | 0 |

**Checked by hand**, scripted in three engines, with no page errors:
- "+2 more" in `kubernetes` names `build, cluster` in its tooltip. A click opens it in
  place: 15 boxes become 17, it reads "fold 2", and the hash is
  `#t=k8s.io/kubernetes#more&s=…`.
- A click on the page root's Strip opens it: 7 demoted boxes are drawn, with the hash
  `#t=#demoted&s=#demoted`.
- Esc from `#f=k8s.io/kubernetes/pkg` goes to the page root, which draws `kubernetes`
  opened (`#s=k8s.io/kubernetes/pkg`).

**Against the plan's Prototype evidence:** every number matches except kubernetes' zoom
and smallest text: 1.2 and 13.2 px here, 1.141 and 12.6 px there. That is A1, above.

**Screenshots** (`shots/`, 1600 × 1000): `hugo-{engine}.png` and `k8s-{engine}.png`,
where `{engine}` is chromium, firefox or webkit.

## Speed (B1)

`probe.mjs` times `scene` on the same exports: six runs each, in ms. **main** is
`145322e`'s `web/`, from `git archive`; **12** is this tree.

| view | main | 12 |
|---|---|---|
| kubernetes auto | 25–50 (39 nodes) | 45–86 (21 nodes) |
| kubernetes `d=2` | 26–53 (236) | 27–59 (202) |
| kubernetes `d=4` | 61–81 (1812) | 55–81 (1238) |
| hugo auto | 2–5 (38) | 4 (18) |
| hugo `d=2` | 5–7 | 4–7 |
| hugo `d=4` | 5–6 | 5–9 |

Every run is within 11's ~110 ms. The kubernetes auto view's first run, 86 ms, pays
for the rollup and the fold. It is higher than the plan's 43–81, and the later runs,
45–53 ms, are in that range.

## What else changes

- **11's first-view numbers are historical.** 11's acceptance.md measured hugo at 38
  boxes in 17 rows and kubernetes at 39 in 13. Both now open grouped, as above.
- **09's paint numbers are unaffected.** paint.mjs sets `d=` explicitly, and the fold
  applies only at automatic depth.

## Doc amendments

Applied as the plan's exact text, with A1's "from 50 %":
- **`decisions.md`:**
  - the Policy file bullet names `demote` and `budget`, which the hash leaves out;
  - UI v1 gains **Grouping (12)**.
- **ADR 0004:** amended 2026-09-25 (the hash leaves out `demote` and `budget`).
- **`requirements-draft.md` A6:** tests, tools and generated packages are set aside,
  and boxes past a budget fold.
- **`glossary.md`:** gains **Demoted**, **Strip**, **Budget** and **Fold Chip**, after
  **Architecture Rank**.

## Pending, by a person

The user's check, which supersedes 11's: open `hugo.html` and `k8s.html`. Can you say
what each system's main parts are, and where it starts, within 10 seconds? It has not
been run.
