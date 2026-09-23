# Benchmarks: 01 · scan → IR

Measured 2026-09-24 with `scripts/bench-corpus.sh` on an Apple M2 (8 cores, 16 GB),
macOS, Go 1.24.5, at commit `6ec087c`. Wall time is the whole `zu scan` process,
including `git` calls and writing the IR. Source files were already in the OS page cache.

| repo | tag | wall s | max RSS MB | packages | files | parse errors | unresolved calls | IR size |
|---|---|---|---|---|---|---|---|---|
| spf13/cobra | v1.10.2 | 0.50 | 13 | 2 | 19 | 0 | 567 | — |
| gohugoio/hugo | v0.166.0 | 0.37 | 54 | 193 | 522 | 0 | 10,998 | — |
| kubernetes/kubernetes | v1.37.0 | 5.26 | 818 | 2,963 | 9,909 | 0 | 144,066 | 99 MB |

- **REQ-040** (hugo cold scan < 30 s): **met.** It took 0.37 s here; the first run,
  straight after cloning, took 1.72 s.
- **REQ-041** (kubernetes < 4 GB resident): **met**, at 818 MB peak.
- The file counts match an independent `find` over the same skip rules (19 / 522 / 9,909).

## Observations for later features
- The kubernetes IR is 99 MB of indented JSON. The HTML Export must not embed a full
  IR of that size; per decision 0006 it carries a Change View's subset.
- Unresolved calls outnumber certain edges on every repo (kubernetes: 144k counted).
  This is the expected cost of syntax-only analysis (decision 0002), and views
  should show the count, as the glossary's *Unresolved Call* says.
- hugo has an empty `internal/warpc/genwebp/go.mod` that fences off C sources. It led to
  the boundary rule added to REQ-027.
