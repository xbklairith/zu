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
- [0006](../decisions/0006-self-contained-html-export.md) Self-contained HTML file is the primary deliverable, carrying only code worth reading
- [0007](../decisions/0007-scan-all-build-variants.md) Scan every build variant; merge duplicate declarations

## Settled choices (not decision records)
- **Stack:** Go 1.24, CGO off; UI React 19 + `@xyflow/react` + ELK.js in a Worker, Vite-built, `go:embed`ed. Revisit Cytoscape if collapsed views exceed ~1,500 nodes.
- **Storage:** generated IRs and caches in git-ignored `.zu/`; the Policy file is committed.
- **Policy file:** one `zu.policy.yaml` at repo root; tests excluded by default; generated and vendored code excluded by glob.
- **License:** Apache-2.0 (`LICENSE`). Public at v0.1 (scan + diff-to-CI working).
- **Audience:** the author first, then open-source users.
- **Mode B surface:** Structural Summary for CI leads; local UI diff view for depth. zu never calls a code-host API and ships no CI snippets — the JSON/Markdown output is documented.
- **Links (B6):** host detected from the `origin` remote (GitHub/GitLab), `-link-template` override.
- **Languages:** Go only; other files reported as unsupported, with counts.
- **Metrics overlay (A7):** out of v1.
- **Test corpus:** zu, spf13/cobra, gohugoio/hugo, kubernetes/kubernetes, pinned to tags, fetched by script.
- **5-minute criterion:** the author, timed, on a public repo they have not read (hugo).
- **Product focus:** zu explains a project and a code change through interactive diagrams — the diagram is the explanation. No prose or doc-comment text in the UI.
- **Change reading order:** new violations first, then changed components bottom-up by dependency (infra → interface).
- **Build order:** scan → diff to CI (no UI) → HTML Export (static) → interaction → Policy file. `serve` after v1 core.
- **UI v1:** U1, U3, U4, U5 full; U2 reduced (full re-layout allowed); U6 reduced (weak-edge slider).
- **Distribution:** `go install` + GitHub Releases via goreleaser with checksums.
- **Model features:** out of v1; revisit after v1 ships. Notes for then: Anthropic API + OpenAI-compatible endpoint; send structure only (IR names, edges, paths, Policy, diff), never source bodies.
