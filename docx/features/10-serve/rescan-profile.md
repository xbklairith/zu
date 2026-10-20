# 10 · zu serve — where a kubernetes rescan spends its time

Measured 2026-09-25 for feature 13 (watch), which keeps the 2 s budget from a write to
the redraw. This is measurement only: no production code changed. Apple M2 (8 cores,
16 GB), macOS, Go 1.24.5, `bin/zu` at `5a3b7ef`.

**Setup:** `git clone --shared .zu/corpus/kubernetes@v1.37.0` into scratch, removed
afterwards. It has 31,301 listed files, 9,909 non-test Go files and 38 `go.mod`s.

**Two throwaway harnesses**, behind a build tag and not committed:
- one in `internal/cli` repeats `session.view` with a timer around each stage and
  wraps the package's git hooks;
- one in `internal/scan` splits `scan.Run` into walk, extract and assemble.

**The edit:** each round appends a function to `pkg/kubelet/kubelet.go`, then
rescans. Seven rounds with no change and seven with an edit.

## Correction to acceptance.md: git's racy index

acceptance.md records 1.74–1.93 s for a one-file-edit rescan on a fresh clone. Most of
the gap to the numbers below is one git effect.

**The cause:**
- Straight after a checkout, most files have the same mtime as `.git/index`.
- git treats those entries as "racily clean", so `git status` re-reads their
  content.
- zu runs git with `--no-optional-locks` (`internal/gitref/gitref.go`), so it never
  rewrites the index. The cost therefore repeats on every rescan until something
  else refreshes the index.

| fresh clone | zu's `git status --porcelain --untracked-files=no` | served rescan (one edit) |
|---|---|---|
| before any plain `git status` | 339–359 ms | 1.51–1.61 s |
| after one plain `git status` (which rewrites the index) | 131–133 ms | 1.33–1.41 s (the first request after the refresh: 1.65 s) |

The acceptance runs used a clone that had never been refreshed. Today, on the same kind
of clone, the served rescan measures 1.51–1.61 s. Neither this report nor that record
explains the remaining 0.15–0.3 s. It did not reproduce, and it may have been load from
other processes at that time.

## Breakdown of a one-file-edit rescan

In-process, with the profiler off and the index refreshed. Figures are medians of 7 in
ms, with the range where it matters. The same tree served over HTTP took 1.37–1.47 s,
so HTTP adds little.

| stage | ms | what it is |
|---|---|---|
| **git: `WorktreeFiles`** | **223** (205–280) | `rev-parse --is-inside-work-tree` 6, `ls-files --cached` 13, `ls-files --others --exclude-standard` 120, Lstat pass 1 over all 31,301 listed files 57, sort and compact |
| **git: `Head`** | **131** (128–154) | `rev-parse HEAD` 5 and `status` 126. **340–360 with a racy index** |
| git: `Prefix`, `Origin` | 8 + 5 | `rev-parse --show-prefix` and `remote get-url origin` |
| loadPolicy | 0 | |
| `scan.Run` | **683** (592–726) | the parts are below; the rest is GC and variance |
| · `walkTree` | 46 | Lstat pass 2 (`listTree.Files`) 34, plus reading and parsing 38 `go.mod`s |
| · `extractAll` | 106 | read and SHA-256 of all 9,909 files: 104, over 8 workers. Inside it, Lstat pass 3 (`readMax`, one per file read) is 18 serial. Cache lookups and the single parse: about 2 |
| · `Cache.keep` | 0.5 | |
| · `assemble` | **456** (443–628) | `buildIndex` 19; resolution and build over every file |
| `ir.Sort` | **129** | |
| `projectView` | **203** (193–252) | `Policy.Apply` about 135 (from CPU samples); the rest is `Project`, `Mark` and `addMetrics`, plus the two git calls above |
| `export.Marshal` | 11.5 | 6.2 MB of JSON |
| **total** | **1,387** (1,332–1,468) | a no-change rescan: 1,368 (1,291–1,555) |

**Seven git processes per rescan:**
- they take about 283 ms, or 510 ms with a racy index;
- `ls-files --others` and `status` each cost about 120–130 ms, because zu turns off
  `core.untrackedCache` and `core.fsmonitor`.

**Three Lstat passes, about 72,500 calls per rescan:**
- pass 1: `gitref.WorktreeFiles`, 31,301 calls, 57 ms serial;
- pass 2: `listTree.Files`, over the same list less pruned directories, 34 ms;
- pass 3: `readMax`, one per file read (9,909 + 38), 18 ms serial but spread over the
  extract workers.

**Allocation:** 1.23 GB and 4.45 M mallocs per rescan, with about 8 GCs.
`GOGC` 200 or 400 did not change the rescan time: 1.25–1.53 s at 100, 200 and 400,
two rounds each. It raised peak RSS from 700 MB to 1.05 GB and 1.6 GB. It is not a
fix.

## pprof, 7 one-edit rescans (CPU and `allocs`)

These CPU samples count only zu's own process, so git's time is absent. The profiler's
signals made each git call slower (`Head` 375 ms against 131 ms without it), which is
why the timings above were taken without it.

**CPU, flat:**

| | flat | |
|---|---|---|
| `syscall.syscall` | 33.7% | open, read and lstat |
| `runtime.memclrNoHeapPointers` | 12.9% | mostly `io.ReadAll`'s growing buffers |
| `runtime.scanobject` | 7.4% (22.2% cum) | GC marking |
| `runtime.madvise` | 5.8% | |
| `runtime.greyobject` | 4.8% | |
| `runtime.memmove` | 3.1% | |

**CPU, cumulative:**

| | cum |
|---|---|
| `scan.(*Cache).extract` | 32.5% |
| · `dirTree.ReadFile` | 31.9% |
| · `os.Open` | 19.1% |
| `scan.assemble` | 15.0% |
| `cli.projectView` | 7.8% |
| `os.Lstat` | 7.8% |
| `io.ReadAll` | 7.2% |
| `policy.(*Policy).Apply` | 6.3% |
| `ir.Sort` | 5.2% |
| `scan.(*builder).imports` | 5.0% |

**`alloc_space`, over the process's life** (1 cold scan plus 14 rescans):

| | share |
|---|---|
| `scan.assemble` | 43.2% cum, 17.9% flat |
| `io.ReadAll` | 29.6% (the hash pass reads every file whole, every time) |
| `policy.(*Policy).Apply` | 15.9% |
| `scan.mergeDecls` | 4.7% |
| `scan.(*builder).packageHash` | 4.6% |
| `scan.declID` | 4.3% |
| `scan.(*builder).edge` | 3.6% |
| `scan.hasPathPrefix` | 3.3% |

## Fix candidates, ranked by estimated saving

Each estimate is the measured stage time the fix would remove, per one-edit rescan on a
refreshed index. None of the fixes was implemented, so no estimate is measured.

1. **Keep the assembled IR and patch it: about 0.5–0.6 s.**
   - It would remove most of `assemble` (456 ms) and of `ir.Sort` (129 ms, if the
     patch keeps the IR sorted), and about 0.5 GB of allocation.
   - It is the hardest fix, because resolution crosses packages: one edit can change
     edges out of other packages.
   - The patched IR has to stay byte-identical to a cold scan's (ADR 0003). That
     needs the same kind of proof `cache_test.go` gives today.
   - A smaller step would cache per-package results and redo only the packages whose
     files, or whose imports' declarations, changed.
2. **Rethink git per rescan: about 0.13–0.25 s, or up to 0.46 s with a racy index.**
   - `Head`'s `status` only sets `Dirty`. It can run concurrently with `scan.Run`,
     which hides 131 ms (340 ms racy).
   - `ls-files --others` (120 ms) can also run concurrently with `ls-files --cached`.
   - Under feature 13, the watcher already knows what changed, so re-listing and
     `status` can move to its slower timer. That takes both off the path from write
     to redraw.
3. **A size and mtime key, with the hash as a fallback: about 0.1 s.**
   - `extractAll` would drop from 106 ms to a few ms by reusing pass 1's Lstat
     results. It also removes 30% of allocation, and with it some GC.
   - This is the only fix that trades away correctness. Deviation 3 rejected it
     because an edit that keeps both size and mtime (the same tick) goes unseen, and a
     hash fallback on a changed stat does not help that case.
   - Feature 13 could accept the trade for the watch path only, and keep a full-hash
     rescan on page load.
4. **Reuse the View when nothing changed: about 0.34 s, but only on a no-change
   rescan.**
   - If no file was parsed, the listing is the same and the Policy hash is the same,
     the IR is the same, so `assemble`, `ir.Sort`, `projectView` and `Marshal` can
     all be skipped.
   - That makes a no-change rescan about 0.4 s (git and stat only).
   - It does not help an edit. Building the View incrementally for an edit would save
     at most about 0.15 s, mostly `Policy.Apply`, and is not worth its complexity
     before fix 1.
5. **Skip the second Lstat: about 35–50 ms.**
   - Have `gitref.WorktreeFiles` hand its `FileInfo`s to `ListTree`. That removes pass
     2 (34 ms) and, with fix 3, most of pass 3.
   - It is low risk, since the symlink check stays for links only.
6. **`GOGC`: no gain** (measured above).

**What the fixes add up to:**
- Fixes 2, 3 and 5, all local and low to moderate risk, would take a one-edit rescan
  from about 1.39 s to about 1.0 s, and to about 1.1 s with a racy index.
- Adding fix 1 would bring it to about 0.5 s.
- For watch, fixes 2 and 3 matter most on the path from write to redraw, and fix 1 is
  the only one that removes the part that grows with the size of the tree.

**Taken by feature 13 (2026-09-25):** fix 2, and fix 3 on the watch path only, with ctime and inode in the stamp. Fix 5 was considered and dropped, because `ListTree`'s own `Lstat` gives the stamps. A watch rescan after one edit on kubernetes takes 0.86–0.96 s; see `docx/features/13-watch/plan.md`, Measurements.

**Taken by feature 16 (planned 2026-09-25, built 2026-10-21):** fix 1 as its smaller step: the Cache keeps each package's part of the assembly and rebuilds only the parts whose files or imported surfaces changed, a new package's, and those of the packages importing a new or removed package's path (all of them when the modules change), joined in order so `ir.Sort` only checks. Fix 5 in another form: a `ListTree` lists once, so the Change View's hunks no longer re-run the `Lstat` pass. `Policy.Apply` with no lens and `diff.Compare` of two sorted IRs no longer copy or map the whole IR. A one-edit rescan on kubernetes now takes 260–300 ms in process (470–540 ms with `-base`); see `docx/features/16-fast-rescan/plan.md`, Measurements. Fix 4 was not taken: a no-change rescan now costs little more than its walk.
