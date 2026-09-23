# Architecture Decisions

Source requirements: [requirements-draft.md](requirements-draft.md). IDs (A1, B4, U9, N2…) refer to it.

## ADR-001 — Go, analysing Go (2026-09-23)
v1 targets Go repositories, so zu is written in Go. `go/parser` and friends are
pure stdlib: no cgo, trivial cross-compilation (N1, N2). Adding tree-sitter for
other languages later reintroduces cgo; revisit then (zig cc is the likely route).

## ADR-002 — Syntax-first analysis (2026-09-23)
Edges come from `go/parser` only — no `go/packages`, no `go/types`, no `go` toolchain
or module cache at runtime (A1). Imports are exact. A `calls` edge is emitted only
when statically certain:
- qualified calls through an import (`pkg.F()`),
- calls to top-level functions of the same package,
- method calls on receivers declared in the same package.

Everything else is omitted and counted in the IR, so the diagram never hides what
it is missing. Type-checked edges may come later behind the same parser interface;
an IR records its analysis level and `diff` refuses mismatched levels.

## ADR-003 — Deterministic, canonical IR (2026-09-23)
JSON, `schemaVersion` first. Nodes and edges are sorted explicitly before writing
(`encoding/json` sorts map keys, not slices). Node ids derive from import path +
declared name (`example.com/svc/store.Repo.Get`), never file path or line — lines
move in every MR, and Mode B depends on stable ids. Every node and edge carries
path, line and the ref it was read at.

## ADR-004 — Policy file (2026-09-23)
One committed `zu.policy.yaml` at the repo root: components (globs → name), layer
order, exclude globs. Test files excluded by default; generated and vendored code
excluded by glob rather than modelled as node classes. With no policy file, each
package is its own component, and the built-in default still has a hash.
`policyHash` is computed over the normalised parsed rules, not raw bytes.
`diff` groups both refs with head's policy; if the MR changes the policy, it
reports the hash mismatch and stops.

## ADR-005 — git CLI for reading refs (2026-09-23)
Mode B reads files at a ref via `git merge-base`, `ls-tree -r`, `cat-file --batch`,
parsed in memory — no second checkout. Behind a small `RefReader` interface faked
in tests. Chosen over go-git for speed and repo-shape coverage (worktrees, partial
clones, SHA-256). Mode A (working tree) needs no git.

## ADR-006 — React Flow + ELK UI (2026-09-23)
React 19 + `@xyflow/react` with custom node components; ELK.js layout in a Web
Worker for deterministic nested layout (A3, U2, U3). Built with Vite into
`web/dist`, embedded via `go:embed` (N3). Revisit Cytoscape.js if collapsed views
routinely exceed ~1,500 visible nodes.

## ADR-007 — Storage (2026-09-23)
Generated IRs and caches live in `.zu/`, git-ignored; `scan` adds the ignore entry
if missing. The policy file is the exception and is committed.

## Open
- **License** — undecided; must be settled before first distribution.
- **Release tooling** — goreleaser (not yet installed) for N2/N4 artefacts and digests.

## Product scope — grilling round 1 (2026-09-23)
- First user: the author; the project will be published as open source.
- Mode B surface: CI comment leads (Structural Summary with Mermaid), local UI diff view for depth.
- zu never calls a code-host API; it writes Markdown + JSON and CI posts it.
- Unconfigured repos: see [ADR 0001](../decisions/0001-ungrouped-view-over-auto-clustering.md).
- Model Provider: all three features in v1 (A10 narrative, B10 change prose, `policy suggest`).
- Metrics overlay (A7): dropped from v1 — no per-package metrics exist today.
- v1 order: scan → diff to CI (no UI) → serve → interaction; Policy file after.
- UI v1: U1, U3, U4, U5 full; U2 reduced (full re-layout allowed); U6 reduced (weak-edge slider only).
