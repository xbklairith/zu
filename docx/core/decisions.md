# Decisions

Source requirements: [requirements-draft.md](requirements-draft.md) (IDs A1, B4, U9, N2…).
Terms: [glossary](../glossary.md).

## Decision records
Hard-to-reverse, surprising, real trade-offs — one file each in [`docx/decisions/`](../decisions/):
- [0001](../decisions/0001-ungrouped-view-over-auto-clustering.md) Ungrouped View plus `policy init`, not auto-clustering
- [0002](../decisions/0002-syntax-first-analysis.md) Syntax-first analysis: go/parser only, certain edges only
- [0003](../decisions/0003-stable-node-ids-canonical-ir.md) Node ids from source identity; canonically ordered IR
- [0004](../decisions/0004-policy-hash-and-head-policy.md) Policy hash over parsed rules; diff uses head's policy
- [0005](../decisions/0005-git-cli-for-refs.md) git CLI for reading refs

## Settled choices (not decision records)
- **Stack:** Go 1.24, CGO off; UI React 19 + `@xyflow/react` + ELK.js in a Worker, Vite-built, `go:embed`ed. Revisit Cytoscape if collapsed views exceed ~1,500 nodes.
- **Storage:** generated IRs and caches in git-ignored `.zu/`; the Policy file is committed.
- **Policy file:** one `zu.policy.yaml` at repo root; tests excluded by default; generated and vendored code excluded by glob.
- **License:** Apache-2.0. Public at v0.1 (scan + diff-to-CI working).
- **Audience:** the author first, then open-source users.
- **Mode B surface:** Structural Summary for CI leads; local UI diff view for depth. zu never calls a code-host API and ships no CI snippets — the JSON/Markdown output is documented.
- **Links (B6):** host detected from the `origin` remote (GitHub/GitLab), `-link-template` override.
- **Languages:** Go only; other files reported as unsupported, with counts.
- **Metrics overlay (A7):** out of v1.
- **Test corpus:** zu, spf13/cobra, gohugoio/hugo, kubernetes/kubernetes, pinned to tags, fetched by script.
- **5-minute criterion:** the author, timed, on a public repo they have not read (hugo).
- **Build order:** scan → diff to CI (no UI) → serve → interaction → Policy file → model features.
- **UI v1:** U1, U3, U4, U5 full; U2 reduced (full re-layout allowed); U6 reduced (weak-edge slider).
- **Distribution:** `go install` + GitHub Releases via goreleaser with checksums.
- **Model Provider (when built):** Anthropic API + OpenAI-compatible endpoint; sends structure only (IR names, edges, paths, Policy, diff), never source bodies.
