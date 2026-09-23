# Benchmarks: 03 · diff to CI

Measured 2026-09-24 with `scripts/bench-corpus.sh` on an Apple M2 (8 cores, 16 GB),
macOS, Go 1.24.5, at commit `fb12526`. Each diff runs `zu diff HEAD~50 -format json`
inside the corpus clone, deepened by 60 commits so HEAD~50 and the merge-base are
present. Wall time covers the whole process: resolving both refs, the merge-base,
scanning both commits from git objects one after the other, and rendering. One run
each, with files and objects already in the OS page cache.

| repo | range | wall s | max RSS MB | packages changed | affected |
|---|---|---|---|---|---|
| spf13/cobra | v1.10.2~50..v1.10.2 | 0.24 | 15 | 2 | 2 |
| gohugoio/hugo | v0.166.0~50..v0.166.0 | 0.68 | 51 | 35 | 144 |
| kubernetes/kubernetes | v1.37.0~50..v1.37.0 | 13.23 | 602 | 52 | 1,543 |

- **Memory:** kubernetes peaks at 602 MB, well inside REQ-041's 4 GB. That is less
  than one `zu scan` of it (about 0.7–1 GB in the same run) because the diff never
  encodes an IR to JSON, and the base IR is the only one held while head is scanned.
- **Time:** about two ref scans of kubernetes (7.6 s in the same run), as expected
  for scanning both sides in turn. No budget covers diff time yet.
- **Blast radius:** 52 changed kubernetes packages affect 1,543 through imports, which
  is why the Markdown table and lists have a size budget and the diagram a 30-package
  limit.
- Scan parity (disk vs ref) stayed identical for all three repositories in the same
  run.
