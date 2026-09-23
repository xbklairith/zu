# Benchmarks: 02 · scan at a ref

Measured 2026-09-24 with `scripts/bench-corpus.sh` on an Apple M2 (8 cores, 16 GB),
macOS, Go 1.24.5, at commit `e0138e2` (after the working-tree file selection follow-up). Each repository is scanned twice: from disk
(`zu scan <dir>`) and from git objects (`zu scan -ref HEAD <dir>`). Wall time covers the
whole process, including `git` calls and writing the IR. Files and objects were already
in the OS page cache.

| repo | tag | mode | wall s | max RSS MB | packages | files | parse errors | unresolved calls |
|---|---|---|---|---|---|---|---|---|
| spf13/cobra | v1.10.2 | disk | 0.59 | 15 | 2 | 19 | 0 | 567 |
| spf13/cobra | v1.10.2 | ref | 0.30 | 13 | 2 | 19 | 0 | 567 |
| gohugoio/hugo | v0.166.0 | disk | 0.69 | 64 | 193 | 522 | 0 | 10,998 |
| gohugoio/hugo | v0.166.0 | ref | 0.40 | 62 | 193 | 522 | 0 | 10,998 |
| kubernetes/kubernetes | v1.37.0 | disk | 7.44 | 746 | 2,963 | 9,909 | 0 | 144,070 |
| kubernetes/kubernetes | v1.37.0 | ref | 4.11 | 982 | 2,963 | 9,909 | 0 | 144,070 |

- **Parity:** `cmp` finds the disk and ref IRs byte-identical for all three repositories.
- **Time:** a ref scan is within 2× the disk scan everywhere (the target). On
  kubernetes it is faster: one `ls-tree` replaces about 30,000 directory reads and a
  `git status`.
- **Disk scans now list files with `git ls-files`** (the follow-up in `plan.md`). The table's kubernetes disk 7.44 s was an outlier: three later runs of the same binary took 4.36, 3.73 and 4.08 s (963–1,006 MB). The two `ls-files` calls take 0.27 s of that. The first run, at `92527ba` before the change, gave kubernetes disk 5.16 s / 916 MB and ref 3.75 s / 924 MB.
- **Memory:** kubernetes peaks at about 1 GB, well inside REQ-041's 4 GB. Compared with
  feature 01's 818 MB, the extra is mostly the new `shape` string on every declaration
  node. Feature 03 holds two IRs at once, so expect about 1.9 GB for a kubernetes diff.
- Reads over the single `cat-file` pipe are serialised behind a mutex while parsing
  stays parallel; at these sizes the pipe is not the bottleneck.
