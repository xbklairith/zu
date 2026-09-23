# 05 · Interaction — acceptance

Measured 2026-09-24 on an Apple M2 (16 GB), macOS, Go 1.24.5, Node 24.17.0, with
`bin/zu` built by `make build` at `40832c5` (Tasks 1–12) and the harness committed
with this file.

## Build and checks

- `make check` exit 0: Go tests including `TestBuiltPageIsSelfContained` (the CSP has
  `worker-src blob:` and the page holds exactly one inline worker), golangci-lint,
  `tsc`, and 92 vitest tests in 17 files.
- `tree.snapshot` (04's tree API, 54 cases) and `scene.snapshot` (04's canvas, 108
  cases: Project View, Change View and changed subgraph) were written by 04's code
  in Tasks 3 and 5 and are reproduced byte for byte by 05's.
- Every "expect FAIL" step failed where it stands, before its implementation.
- `web/dist/index.html`: 1,888,259 B. The plan's notes put 04's page 12,492 B below
  its own 1,888,220 B build.

## Browsers (Task 13 harness, `file://`)

`make build && cd web/e2e && npm install && npm run browsers && npm run accept`:

```
chromium: ok (20/20 checks)
firefox: ok (20/20 checks)
webkit: ok (20/20 checks)
```

`ZU_E2E_CHANNEL=chrome npm run accept` (installed Chrome instead of Playwright's
Chromium) gave the same three lines.

## Kubernetes v1.37.0

| check | result |
|---|---|
| `zu scan -html` size | 8,086,562 B: 21,102 B over 04's 8,065,460 B (budget 50 KB) |
| opening view (Chrome, visible, served from localhost) | 39 nodes; `zu-layout-start` 204 ms → `zu-layout-end` 534 ms, `zu-drawn` 616 ms, first contentful paint 216 ms |
| `#f=k8s.io%2Fkubernetes%2Fpkg&d=2` | "Collapsed to depth 1: depth 2 has 1711 edges", buttons *Draw depth 2 anyway* and *Hide edges*; header "31 boxes at depth 1 (collapsed from 2)"; the hash keeps `d=2`; layout 413 ms |
| *Hide edges* from there | depth 2 drawn in 390 ms wall time (layout 60 ms); hash `…&d=2&l=0`; header "257 boxes at depth 2 (chosen)" |

The plan measured 1,712 edges for that view; the scene counts 1,711 (and 183 at
depth 1, against the plan's 184). Either way the view is over the 500-edge limit and
depth 1 is under it, so the behaviour is the same.

The card for "even depth 1 is too big" is covered by the unit test only: no measured
corpus view at depth 1 is over the limit.

## Found and fixed during 05

- **Centring when the same click opens the panel (Task 7).** `rf.setCenter`
  translates using React Flow's stored canvas width, which is still the width before
  the panel opened when the effect runs. A pick from the changed list landed at
  x = 888 (the old centre) instead of 593. This was latent in 04 as well. `Canvas.tsx`
  now sets the viewport from the measured wrapper
  (`setViewport({ x: w/2 − cx·zoom, y: h/2 − cy·zoom, zoom })`); the pick, the panel
  links and search all go through it. Measured afterwards: node centre = canvas centre
  (593, 462), both with the panel opening on the same click and with it already open.
  Steering accepted the change.
- **A hidden tab is not a timing measurement.** In the automation extension's tab
  (`visibilityState` hidden), the worker layout of the shop took 11.9 s: `elk-api`
  delivers each worker reply through `setTimeout(…, 0)`, which Chrome clamps in hidden
  tabs. The same page in a visible headless Chrome laid out in 190 ms. All timings
  above come from visible pages.

## Pending manual checks

- **Safari** (the harness drives WebKit, not Safari): steps in
  `docx/UserInstructions/05-interaction-safari-check.md`.
