# 08 · CRAP Metrics Overlay — acceptance

Measured 2026-09-24 on an Apple M2 (16 GB), macOS, Go 1.24.5, Node 24.17.0, with
`bin/zu` built by `make build` at `3eeffdb` (Tasks 1–11).

## Ruling (b): a crashed page

The plan's ruling says that when Firefox reports "Page crashed" on a reload,
accept.mjs retries once, logs it, and fails on a second crash. A retry of
`p.reload()` on the same page does not work: in one run the crashed page threw
"Target page, context or browser has been closed" on the retry. The harness
therefore reruns the engine once in a fresh browser (`attempt` in
`web/e2e/accept.mjs`). The rerun is logged as
`firefox: page crashed, rerunning once: …`, and a second crash fails the run.

Both paths were checked by a throwaway copy of the harness that throws "Page
crashed" in Firefox's first attempts:

- one crash: the rerun is logged and Firefox is `ok (39/39 checks)`, exit 0;
- two crashes: the rerun is logged, the second crash is thrown, exit 1.

After the change, 16 runs in a row gave 39/39 in all three engines, and none of
them crashed. One run before that exited 1 while reloading `policy.html#d=3`,
and its message was lost to `tail`, so it is not known whether that was a
crash on both attempts or a different error.

## 1. Gates

- `gofmt -l cmd internal web/*.go`: none; `go vet ./...`: clean.
- `make check` exit 0: `go vet`, `go test ./...`, golangci-lint, `tsc`, and 135
  vitest tests in 21 files.
- `npx vite build`, then `npm run accept`:

  ```
  chromium: ok (39/39 checks)
  firefox: ok (39/39 checks)
  webkit: ok (39/39 checks)
  ```

## 2. zu on itself

`go test -coverprofile=.zu/cover.out ./...` gives 2,075 lines (90,260 B).

- `bin/zu scan . -html … -coverprofile .zu/cover.out` exits 0 in 0.06–0.07 s
  warm (0.41 s on the first, cold run), against 0.07 s without the profile.
  stderr reads `zu scan: CRAP: coverage for 245 of 245 functions`, with no
  unmatched-block line: K = 0.
- The IR is byte-identical (`cmp`) with and without `-coverprofile`, and two runs
  write a byte-identical page.
- gocyclo v0.6.0 (built from the module cache) over the non-test, non-testdata
  files lists 247 functions. zu measures 245. A throwaway test dumped
  `scan.Measures`: every one of the 245 spans has gocyclo's complexity at the
  same file and line. The 2 that gocyclo alone lists are the package-level
  literals at `internal/cli/diff.go:20` and `internal/cli/scan.go:25` (loose
  code, Deviation 18).
- Per package, from the page's `metrics`, identical to the plan's table:

  | package | functions | μ | max | σ | μ+σ | band |
  |---|---|---|---|---|---|---|
  | zu/cmd/zu | 1 | 2 | 2 | 0 | 2 | green |
  | zu/internal/cli | 30 | 8.2 | 35.8 | 8.6 | 16.8 | red |
  | zu/internal/cover | 5 | 6.2 | 18 | 6.2 | 12.4 | red |
  | zu/internal/diff | 30 | 6.1 | 24.1 | 5.7 | 11.8 | yellow |
  | zu/internal/export | 37 | 7 | 47.7 | 8 | 15 | red |
  | zu/internal/gitref | 18 | 5 | 14.4 | 4.1 | 9.1 | yellow |
  | zu/internal/ir | 3 | 4.4 | 11.1 | 4.7 | 9.1 | yellow |
  | zu/internal/policy | 49 | 5.4 | 29.6 | 5.2 | 10.6 | yellow |
  | zu/internal/scan | 71 | 6 | 19 | 4.3 | 10.3 | yellow |
  | zu/web | 1 | 1 | 1 | 0 | 1 | green |

  `zu/internal/version` has no functions and is unmeasured (Deviation 3).

## 3. hugo v0.166.0 (`git archive` into scratch, 193 packages, 522 files)

The plan's `go test -run='^$' -coverprofile=… ./...` ran out of disk here: it
holds every test binary in one work directory, which passed 17 GB. The same
profile was built one package at a time (`go test -run='^$' -coverprofile` per
package in `go list ./...`, 192 packages, none failing) and concatenated under
one `mode: set` line. Without `-coverpkg` each package's profile covers only that
package, so this is the profile `./...` writes. It has 32,410 lines
(2,283,438 B), the plan's line count, above `ReadSmall`'s 1 MiB.

- `zu scan . -html … -coverprofile …` exits 0 in 0.25–0.32 s, against
  0.24–0.25 s without it (3 runs each). stderr reads
  `coverage for 5402 of 5457 functions`, with no unmatched-block line: K = 0.
- The IR is byte-identical with and without the profile, and two runs write a
  byte-identical page. The page grows from 2,192,403 to 2,210,314 bytes
  (+17,911, the plan's growth; the absolute sizes differ from the plan's by the
  scratch repo's commit id).
- Measured packages: 184 of 193. Bands: 153 red, 9 yellow, 21 green, and 1
  without data.
- The 55 functions without data:
  - `github.com/gohugoio/hugo/deploy`: 21 of 21, the one package without data;
  - the root package: 30 of 31;
  - `commands`: 1 of 185;
  - `resources/resource_transformers/tocss/scss`: 3 of 9.

  These are the plan's four build-tagged sets (Deviation 2).

## Observed, not changed

Each `npm run accept` leaves its `zu-e2e-*` directory (about 18 MB) in the system
temp directory, which `mkdtempSync` creates and nothing removes. 72 had built up
to 1.3 GB during this work and were deleted by hand. This behaviour predates 08.
