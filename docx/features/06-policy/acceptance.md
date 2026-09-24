# 06 · Policy file — acceptance

Measured 2026-09-24 on an Apple M2 (16 GB), macOS, Go 1.24.5, Node 24.17.0, with
`bin/zu` built by `make build` at `3aff184` (Tasks 1–12).

## 1. Gates

`make check` exit 0: gofmt, `go vet`, `go test ./...`, golangci-lint (no issues
reported), `tsc`, and 96 vitest tests in 18 files.

## 2. zu on itself

Run in a scratch copy of the working tree with 06's code included.

| step | result |
|---|---|
| `zu policy init .` | writes `levels: [["zu/web"], ["zu/internal"], ["zu/cmd"]]`; `zu check .` exits 0 with `0 new, 0 known, 0 fixed`; a second init exits 3 and leaves the file alone |
| intended layering (`cycles: true`) | `zu check .` exits 0, `0 new, 0 known, 0 fixed` |
| add `internal/ir/bad/bad.go` → `zu/internal/cli` | exit 1, 18 new violations: 1 `levels` (`zu/internal/ir/bad → zu/internal/cli`) and 17 `cycle` |
| `zu check -update-baseline .` | exit 0; the Baseline has 18 sorted entries, and all 18 are listed on stderr; `zu check .` then gives `0 new, 18 known` and exits 0 |
| append `order: [zu/cmd]` | `check` and `-update-baseline` both exit 3 with "Baseline was written under Policy sha256:1dd6d2…"; the Baseline is unchanged |
| remove `order`, then `zu scan . -html self.html` | 16 `"violation":"cycle"` and 1 `"violation":"levels"` edges |

### Browser (Task 12), `self.html` in visible Chrome, served from localhost

| view | stage | red (pinned) edges | red triangles |
|---|---|---|---|
| `#f=zu/internal&d=2` | none, arrows, elements, classes | 17, including `ir/bad → cli` | 0 |
| `#f=zu/internal&d=2` | triangles (hide edges) | 0 | 14 |
| `#d=3` | none | 17 | 0 |
| auto depth | arrows, elements, classes | 2 (`zu/internal/ir → zu/internal`, lifted) | 0 |
| auto depth | triangles | 0 | 13 |
| `#f=zu/internal/ir` | every stage | 2 (`ir/bad → outside`); triangles: 4 red | — |

The legend reads "violates zu.policy.yaml (levels or cycle)". `shop.html` (no
Policy) shows no legend. No page errors.

At the root with depth 3 forced, the arrows, elements and classes stages show no red.
Those stages lift arrows to containers. Every violation sits inside `zu/internal`,
so each lifted arrow becomes a `zu/internal → zu/internal` self-loop, which is
dropped (05, Deviation 1). No edge is drawn there, so there is nothing to colour.
Wherever the violating edge is drawn, including lifted to `zu/internal/ir → zu/internal`
and to `outside`, it is red.

## 3. hugo v0.166.0 (`git archive` into scratch)

| step | result |
|---|---|
| `zu policy init .` | "4 levels, 36 boxes"; `zu check .` exits 0 with `0 new, 0 known, 0 fixed` |
| `cycles: true`, `zu check .` | exit 1, `189 new`, real 0.23 s |
| `zu check -update-baseline .` | exit 0; creates `zu.baseline.json` with 189 entries (190 stderr lines: a header and 189 entries); `zu check .` then gives `0 new, 189 known` and exits 0 |
| `zu scan . -html` | 2,198,532 B |

## 4. kubernetes v1.37.0 (`.zu/corpus/kubernetes.json`, 110,270 nodes, 118,110 edges)

The timings come from a throwaway Go test in the scratch copy (not committed).
It uses the suggested Levels (10), `cycles: true` and
`foreign: [github.com, golang.org/x]`, over three runs:

| call | measured | plan |
|---|---|---|
| `Suggest` | 36–45 ms | 39 ms |
| `Check` | 178–286 ms, 438 violations | 171 ms, 438 |
| `EdgeRules` (on `Apply`'s output) | 171–237 ms, 4,149 pairs | 178 ms |
| `Apply` | 147–152 ms | — |

The violation count matches the plan exactly. The timings match its order of
magnitude, and the slower runs vary from run to run on this machine.

## 5. `zu diff`

This is covered by `TestDiffScansBothSidesUnderHeadsPolicy`, `TestDiffNewViolationExitsOne`,
`TestDiffWarnsWhenALevelNamesNoPackage` and `TestDiffHTMLDrawsTheLensAndTheViolations`,
which run on real git repos and pass in `make check` above.
