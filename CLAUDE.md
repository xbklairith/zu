# zu

Local, offline tool that renders a Go repo's component topology as an interactive
diagram (Mode A) and any MR as a structural delta over it (Mode B).

- Requirements: `docx/core/requirements-draft.md` (IDs A*, B*, U*, N*)
- Decisions: `docx/core/decisions.md` (index) and `docx/decisions/NNNN-*.md` — read before changing analysis, IR or policy semantics
- Glossary: `docx/glossary.md` — use its terms
- Feature specs: `docx/features/NN-name/`

## Layout
- `cmd/zu` — entrypoint; `internal/cli` — subcommands and exit codes (0 ok, 1 violation, 2 parse failure, 3 bad invocation)
- `internal/ir` — IR schema and canonical `Encode`; `internal/version` — build identity via ldflags
- `internal/scan` — walk → extract (one parse per file, AST dropped) → index/resolve → build; golden fixture in `testdata/shop` (`go test ./internal/scan -update` rewrites `shop.golden.json` — review the diff)
- `internal/gitref` — HEAD commit + dirty via the git CLI (the only process zu runs)
- `scripts/bench-corpus.sh` — Test Corpus benchmarks (clones into `.zu/corpus/`)
- `web/` — Vite + React UI; `web/dist` is embedded by `web/embed.go`

## Commands
- `make test` · `make lint` · `make build` (builds UI, then `bin/zu`) · `make check`
- `go test ./...` works without building the UI (`web/dist/.gitkeep` keeps the embed valid)

## Rules
- The model never authors the graph: nodes, edges and paths come only from the parser.
- IR output must be byte-identical for the same commit + policy. Sort before writing.
- Strict TDD; module path is `zu` (local).
