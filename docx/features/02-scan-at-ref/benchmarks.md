# Benchmarks: 02 · scan at a ref

Measured 2026-09-24 with `scripts/bench-corpus.sh` on an Apple M2 (8 cores, 16 GB),
macOS, Go 1.24.5, at commit `92527ba`. Each repository is scanned twice: from disk
(`zu scan <dir>`) and from git objects (`zu scan -ref HEAD <dir>`). Wall time covers the
whole process, including `git` calls and writing the IR. Files and objects were already
in the OS page cache.

| repo | tag | mode | wall s | max RSS MB | packages | files | parse errors | unresolved calls |
|---|---|---|---|---|---|---|---|---|
| spf13/cobra | v1.10.2 | disk | 0.51 | 14 | 2 | 19 | 0 | 567 |
| spf13/cobra | v1.10.2 | ref | 0.28 | 14 | 2 | 19 | 0 | 567 |
| gohugoio/hugo | v0.166.0 | disk | 0.61 | 63 | 193 | 522 | 0 | 10,998 |
| gohugoio/hugo | v0.166.0 | ref | 0.68 | 67 | 193 | 522 | 0 | 10,998 |
| kubernetes/kubernetes | v1.37.0 | disk | 5.16 | 916 | 2,963 | 9,909 | 0 | 144,070 |
| kubernetes/kubernetes | v1.37.0 | ref | 3.75 | 924 | 2,963 | 9,909 | 0 | 144,070 |

- **Parity:** `cmp` finds the disk and ref IRs byte-identical for all three repositories.
- **Time:** a ref scan is within 2× the disk scan everywhere (the target). On
  kubernetes it is faster: one `ls-tree` replaces about 30,000 directory reads and a
  `git status`.
- **Memory:** kubernetes peaks at 924 MB, well inside REQ-041's 4 GB. Compared with
  feature 01's 818 MB, the extra is mostly the new `shape` string on every declaration
  node. Feature 03 holds two IRs at once, so expect about 1.9 GB for a kubernetes diff.
- Reads over the single `cat-file` pipe are serialised behind a mutex while parsing
  stays parallel; at these sizes the pipe is not the bottleneck.
