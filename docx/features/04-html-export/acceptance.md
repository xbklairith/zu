# 04 · HTML Export — acceptance (Part A, Project View)

Measured 2026-09-24 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Chrome, with
`bin/zu` built by `make build` at `1cb6ba5`, plus the externals-count fix and the
performance marks committed with this file.

## Build and self-export

- `make check` exit 0: Go tests with `-race`, golangci-lint, `tsc`, and 28 vitest tests.
- `bin/zu scan -out $T/zu-self.json -html $T/zu-self.html -include ./internal/...` exit 0.
  stderr: `html → …/zu-self.html (27 source files inlined; share it only where that code may go)`.
  Size 2,053,349 bytes.

## Determinism

| export | run 1 | run 2 |
|---|---|---|
| zu itself, `-include ./...` | `f0b5d8ad…c6a6` | `f0b5d8ad…c6a6` |
| kubernetes v1.37.0 | `4d39558a…79f1` | `4d39558a…79f1` |

## Corpus

| repo | flags | html bytes | scan + export | max RSS | opens at |
|---|---|---|---|---|---|
| gohugoio/hugo v0.166.0 | `-include ./hugolib` (39 files inlined) | 2,914,094 | 0.48 s | 76 MB | 37 boxes at depth 2 |
| kubernetes/kubernetes v1.37.0 | none | 8,065,460 (7.7 MiB) | 9.33 s | 777 MB | 38 module roots at depth 1, one "111 external modules" oval, 175 bundled edges |

`k8s.html` is under the 10 MB limit; the plan's estimate was about 8.1 MB.

## In the browser (Chrome, served from 127.0.0.1)

The automation extension cannot open `file://`, so the files were served by a local
`python3 -m http.server`. The CSP is a meta tag, so it applies either way.

- **Network:** `performance.getEntriesByType("resource")` is empty for `hugo.html`
  and `k8s.html`: nothing is loaded beyond the document.
- **Console:** no errors or CSP violations, for the shop fixture, hugo and kubernetes.
- **Shop fixture** (`-include ./internal/store`), checked by hand:
  - the page opens with two module roots, `shop (package)` and `internal`
    (`checkout`, `money`, `store`);
  - double-clicking `store` shows its declarations, with `Repo` holding
    `.Get`, `.Reset` and `.check`;
  - clicking `.Get` shows `store.go` scrolled to line 43, highlighted;
  - Esc goes up one level;
  - `checkout` shows "Declarations not included. Re-run with -include …".
  - The banner shows 0 parse errors, not the golden's 1: the golden's `bad/bad.go`
    is written into a copy by `internal/scan/scan_test.go` and is not on disk.
- **Links** (`zu scan -ref HEAD -html … -include ./internal/export`, a clean commit):
  selecting `ForRepo` shows "View at 0aaff9ccabdf" →
  `https://github.com/xbklairith/zu/blob/0aaff9c…/internal/export/links.go#L16`,
  which is the `func ForRepo` line at that commit, with `target="_blank"` and
  `rel="noopener noreferrer"`.
- **Timing, kubernetes** (`performance.mark`, ms after navigation start):

  | mark | ms |
  |---|---|
  | parse start → end | 158 → 177 |
  | layout start → end | 594 → 1071 |
  | React Flow initialized (`zu-drawn`) | 1129 |

  The automation tab reported `visibilityState: "hidden"`, so Chrome recorded no
  paint entries. The canvas is ready at 1.13 s. A first paint in a visible tab is
  expected just after that, but it has not been measured.

## Pending manual checks

These need a person at a browser. Steps are in
`docx/UserInstructions/04-html-export-browser-check.md`.

- Open each file from `file://` in Chrome, Firefox and Safari.
- Confirm there are no CSP console errors and that the Network panel lists only the document.
- Measure first paint of `k8s.html` in a visible tab. The target is under 3 s.

## Found and fixed during acceptance

- The externals oval read "0 external modules": the count looked at edge ends
  after aggregation. `touchedExternals` now counts from the drawn import edges.
  There is a test for it.
- React Flow's double-click zoom swallowed the double-click that opens a box.
  `zoomOnDoubleClick` is now off.
