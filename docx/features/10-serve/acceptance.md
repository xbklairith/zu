# 10 · zu serve — acceptance

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0,
with `bin/zu` built by `make build` after the review amendments (`ce28349`,
`61ebd87`).

## Gates

- Task 7's gate chain, exit 0: `gofmt -l` (none), `go vet ./...`,
  `go test -race ./...` (11 packages ok), `golangci-lint run ./...` (no output),
  `tsc --noEmit`, and 141 vitest tests in 21 files.
- The first run of that chain failed lint: revive's `empty-block` on the
  compare-and-swap loop in `TestServeRescansOneAtATime` (added by `ce28349`). The
  test now tracks the most rescans at once under a mutex. With `session.view`'s
  lock commented out it still fails ("8 rescans ran at once; want 1").
- `npm run accept-serve`: chromium, firefox and webkit `ok (5/5 checks)`, with no
  exception for Firefox's favicon loader: the served page carries
  `<link rel="icon" href="data:,">`, so no engine asks for `/favicon.ico`.
- `npm run accept`: 39/39 in all three engines in 5 of 6 runs. The first run
  exited 1 with an uncaught Node error whose message `tail` cut off; it did not
  recur in the next five, so its cause is not known.

## The rescan budget on kubernetes

A full worktree: `git clone --shared .zu/corpus/kubernetes@v1.37.0` into scratch
(1.1 GB, 31,300 tracked files), removed afterwards. The plan's `bench-serve.sh`
starts `zu serve`, loads `view.json` once with nothing changed, then five times
appends a function to `pkg/kubelet/kubelet.go` and times the next load with curl.
Two runs, source in the page cache:

| | run 1 | run 2 | parsed |
|---|---|---|---|
| start, cold scan to URL | 4.77 s | 3.59 s | 9,909 of 9,909 |
| load with nothing changed | 1.76 s | 1.76 s | 0 |
| load after one edit (5 each) | 1.75, 1.74, 1.76, 1.81, 1.84 s | 1.88, 1.77, 1.93, 1.86, 1.77 s | 1 |
| peak RSS | 731 MB | 704 MB | |

Budget: under 2 s from request to response. **Met: 1.74–1.93 s**, with 0.07 s
to spare at worst. Every rescan reported 2963 packages, 9909 files, 0 parse errors.

Correction, 2026-09-25: the 1.74–1.93 s runs were on a fresh clone whose racy index makes zu's `git status` cost 340–360 ms.
See rescan-profile.md: 1.51–1.61 s on a fresh clone, 1.33–1.41 s after an index refresh.

The plan's figure, 1.09–1.19 s, came from a copy of kubernetes' non-test Go files
and `go.mod`s. The same copy measured today gives 1.14–1.37 s (peak RSS 693 MB), so
the full worktree costs about 0.5 s more per rescan. The worktree's git calls,
timed alone, take 0.25 s (`status --porcelain --untracked-files=no` 0.12 s,
`ls-files -z --others --exclude-standard` 0.12 s, `ls-files -z` 0.01 s). The rest
of the difference was not broken down.

The margin is thin. Feature 13's watcher, which rescans on a change rather than per
request, keeps the same 2 s budget from the write to the event, so it should
start from this number.

## Review amendments (2026-09-25)

1. `ReadHeaderTimeout` 10 s and `IdleTimeout` 60 s (`ce28349`,
   `TestServeServerTimeouts`).
2. One rescan at a time, proved by `TestServeRescansOneAtATime` (`ce28349`).
3. An empty `data:` favicon; the harness's Firefox exception is gone (`61ebd87`).
4. The README and Deviation 6 now say that `Sec-Fetch-Site` stops other sites'
   fetches of `view.json` only, and that a top-level navigation to `/` from
   anywhere still rescans once. The README notes that macOS binds only 127.0.0.1
   unless another loopback address is aliased (`-addr 127.0.0.2:0` exits 3 with
   "can't assign requested address").

Deviation 14's doc text is applied to `decisions.md` and `requirements-draft.md`,
citing 1.74–1.93 s. Its `CLAUDE.md` line waits for the user.
