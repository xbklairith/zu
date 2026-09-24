# 07 · Policy View — acceptance

Measured 2026-09-24 on an Apple M2 (16 GB), macOS, Go 1.24.5, Node 24.17.0, with
`bin/zu` built by `make build` at `997e136` (step 0 and Tasks 1–11).

## Step 0: Levels before cycle

`policy.Compare` sorts `levels` before `cycle`, then by from and to (`34ec9b4`). This
order reaches every violation list: `zu check`, the Baseline file, `zu diff` in all
three formats, and the Change View's section. The contract line is in
`docx/features/03-diff-ci/output.md`. The two new tests failed before the change. 06's
Baseline round-trip test pinned cycle first and was updated. None of 03's goldens hold
violations, so none changed.

## 1. Gates

- gofmt over the tracked Go files: none unformatted. (`gofmt -l .` as the plan writes
  it also walks the cloned corpus under `.zu/corpus/` and lists its files.)
- `make check` exit 0: `go vet`, `go test ./...`, golangci-lint, `tsc`, and 117 vitest
  tests in 19 files.
- `npx vite build`, then `npm run accept`:

  ```
  chromium: ok (30/30 checks)
  firefox: ok (30/30 checks)
  webkit: ok (30/30 checks)
  ```

  There are 30 checks, not the plan's 29, because steering asked for one more:
  `orderCentred`. On `order.html` it searches for `m/z`, which `inOrder` moves, and
  requires the node's centre to be within 2 px of the canvas centre. With `inOrder`
  removed from `App.tsx`, `order` fails in all three engines, but `orderCentred`
  still passes. The canvas and the centring read the same `placed` map, so
  centring cannot use positions from before `inOrder`. The check confirms the
  search lands on the moved node.

## 2. zu on itself

This used a scratch `git archive` of `997e136` with the plan's `zu.policy.yaml`
(`order`, the Levels, `cycles: true`, Hexagon) and 06's `internal/ir/bad/bad.go`.

| check | result |
|---|---|
| `zu scan . -html` | exit 0; `policy.order` is `["zu/cmd"]`; Hexagon ranks 10 packages, `zu/internal/version` is unranked (Unassigned), and it has one violation, `zu/internal/ir/bad → zu/internal/cli`; 16 `cycle` and 1 `levels` edge marks (17 red edges) |
| `zu check .` | exit 1, `18 new, 0 known, 0 fixed`: 1 levels, listed first, then 17 cycle |

Browser checks: visible Chrome, page served from localhost.

- **Badges at depth 3**, top to bottom: cli 5, export 4, diff 3, gitref 2 and policy 2
  (one row), scan 1, then version 0 and ir 0 (one row). No inversion.
- **Red border on `zu/internal`:**
  - It has the border at depth 2, and at depth 3 in the `arrows`, `triangles`,
    `elements` and `classes` stages. In all of those, no red edge is drawn.
  - At depth 1 the border is on `zu`.
  - At depth 3 `full`, and at the default depth, no box has the border and 17 red
    edges are drawn.
- **Panel of `zu/internal`:** "Violations inside (17)", then
  `levels zu/internal/ir/bad → zu/internal/cli`, then
  `cycle zu/internal/cli → zu/internal/diff`.
- **Hexagon:**
  - The hash becomes `#p=Hexagon`. The banner reads "PROPOSAL — not instantiated in
    code: Hexagon". The legend reads "violates Proposal Hexagon's layers; a red box
    holds one".
  - One red edge is drawn at depths 1–4 and in the `arrows`, `elements` and
    `classes` stages. With lines hidden it shows as 4 red triangles.
  - The banner survives a reload. Choosing "none" removes `p=` and the banner.
- **Layer placement:** Entry is at y 160, Adapters at 400, and Domain at 639.
  Unassigned is also at 639, in Domain's row, not below it as Task 12 says. This
  follows Deviation 5: an unranked box counts as level 0 and only has to be below
  every box ranked 1 or higher. The ranked layers themselves are in order.
- **`order: [zu/cmd]`** has no visible effect here, as the plan says. Task 11's
  `order.html` covers it.
- **`zu diff master -html`**, on a branch that adds `internal/ir/bad`: exit 1, and
  stdout begins "New violations (18):" with `levels zu/internal/ir/bad →
  zu/internal/cli` first.
  - The page's column opens "New violations (18)", then the same levels row, then
    `cycle zu/internal/cli → zu/internal/diff`, and ends "0 fixed, 0 pre-existing".
  - Task 12's text expects the cycle row first. That was written before step 0 put
    Levels first.
  - At `#p=Hexagon` neither the select nor the banner appears, and the hash is
    dropped.
- **Page errors:** none.

## 3. hugo v0.166.0 (`git archive` into scratch)

`zu policy init .` gives 4 levels over 36 boxes, and `zu check .` exits 0 with
`0 new, 0 known, 0 fixed`. Two pages were exported: one under those Levels, and one
with no Policy to compare against.

The plan timed elk.bundled in Node. These timings come instead from the page's own
worker layout (`zu-layout-start` to `zu-layout-end`) in visible Chrome, best of 3
after a warm-up, lines on:

| view | nodes / edges | with ranks | without ranks | higher rank at or below a lower sibling |
|---|---|---|---|---|
| `#d=2` | 39 / 260 | 443 ms | 288 ms | 0 of 310 pairs |
| `#d=2&x=classes` | 39 / 260 | 397 ms | 281 ms | 0 of 310 |
| `#d=3&x=classes` | 22 / 155 | 255 ms | 215 ms | 0 of 79 |
| `#d=3`, "Draw depth 3 anyway" (151 boxes) | — | 2,433 ms | 2,205 ms | not counted |

- **The steps' cost:** about 150 ms at depth 2, and about 10% at depth 3. The plan
  measured 96 ms and 6% in Node. Both follow the same pattern: a fixed cost that
  matters at small depths and is small against a large layout.
- **Plain `#d=3`:** the page collapses it to depth 2, because depth 3 has more edges
  than the draw limit. It therefore draws the depth-2 scene, in 394 ms against 276 ms.
- **Pair counts:** these count ranked siblings drawn on the canvas. The plan counted
  342, which probably included pairs this DOM count leaves out. The inversion count
  is 0 either way.
- **Depth 3 `full`:** not counted from the DOM. React Flow draws only the nodes in
  view (`onlyRenderVisibleElements`). The step-node layout at depth 3 is covered by
  Task 6's tests and by the plan's fuzz.
- **The unranked `github.com/gohugoio/hugo#pkg`** sits below every sibling ranked
  above 0 at depth 2 (Deviation 5).
