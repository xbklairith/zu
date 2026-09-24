# Decisions

Source requirements: [requirements-draft.md](requirements-draft.md) (IDs A1, B4, U9, N2…).
Terms: [glossary](../glossary.md).

## Decision records
Hard-to-reverse, surprising, real trade-offs — one file each in [`docx/decisions/`](../decisions/):
- [0001](../decisions/0001-ungrouped-view-over-auto-clustering.md) Ungrouped View plus `policy init`, not auto-clustering — *superseded by 0008*
- [0002](../decisions/0002-syntax-first-analysis.md) Syntax-first analysis: go/parser only, certain edges only
- [0003](../decisions/0003-stable-node-ids-canonical-ir.md) Node ids from source identity; canonically ordered IR
- [0004](../decisions/0004-policy-hash-and-head-policy.md) Policy hash over parsed rules; diff uses head's policy
- [0005](../decisions/0005-git-cli-for-refs.md) git CLI for reading refs
- [0006](../decisions/0006-self-contained-html-export.md) Self-contained HTML file is the primary deliverable, carrying only code worth reading
- [0007](../decisions/0007-scan-all-build-variants.md) Scan every build variant; merge duplicate declarations
- [0008](../decisions/0008-package-tree-default-policy-never-invents-boxes.md) Package Tree by default; the Policy ranks and proposes, never invents boxes
- [0009](../decisions/0009-affected-set-over-package-imports.md) Affected Set over package imports, not calls

## Settled choices (not decision records)
- **Stack:** Go 1.24, CGO off; UI React 19 + `@xyflow/react` + ELK.js in a Worker, Vite-built, `go:embed`ed. Revisit Cytoscape if collapsed views exceed ~1,500 nodes.
- **Storage:** generated IRs and caches in git-ignored `.zu/`; the Policy file is committed.
- **Policy file:** one `zu.policy.yaml` at repo root, uml-viewer model (order, levels, foreign, edge-kind overrides, omit, omit-edges, proposals); tests excluded by default; generated and vendored code excluded by glob. Importing `.go-arch-lint.yml` after v1.
- **Levels rule:** uml-viewer `:levels` on any Package Tree box or package (the longest ranked prefix wins; amended 2026-09-24, feature 06): listed inner first, higher-ranked → lower-ranked is a violation, same rank allowed, foreign/unranked not compared, a bundled edge is red if any pair inside it is, level 0 drawn at the bottom.
- **Baseline:** `zu.baseline.json` (sorted, committed) records known violations; `check` exits 1 only on new ones; `-update-baseline` only removes fixed ones (with no Baseline it creates one and lists what it accepts; a Baseline written under another Policy stops `check` with exit 3).
- **Cycles:** opt-in (`cycles: true`), between sibling Package Tree boxes; every arc in a cycle's strongly connected component is a violation. Noisy on repos with one big cycle, which is why it is opt-in.
- **Diff and the Policy:** both refs are scanned under head's Policy (ADR 0004 as amended); `diff` exits 1 on new violations when head's Policy has rules.
- **Diff base:** `git merge-base base head` by default; the Change View shows one hop of unchanged neighbours, dimmed. No merge-base (shallow clone) → exit 3 with the fix, never a fallback to the base tip.
- **Diff head:** `zu diff <base> [head]`, head defaults to the `HEAD` commit; `-worktree` opts in to uncommitted edits: the files the next commit would contain (tracked plus untracked, not ignored, read from disk); `-include-ignored` adds git-ignored files too. `zu scan` selects files the same way. Both refs are scanned fresh (no IR cache). A successful diff exits 0 whatever it finds; 1 stays reserved for new violations.
- **Diff scope:** both refs are scanned from the repository top level (`git rev-parse --show-toplevel`), whatever the current directory. In-tree file symlinks are resolved at a ref exactly as on disk, so a disk scan of a clean checkout and a ref scan of the same commit are byte-identical (submodule contents aside, since a commit holds only the gitlink; and files a smudge filter such as git-lfs or git-crypt rewrites on checkout, since a ref scan reads the raw blob). Not compared: `go.mod` changes (dependency versions, `go`/`toolchain` lines) and other languages' toolchain and dependency files; the docs and the summary footer say so.
- **Structural Summary (v1):** one row per changed package (+added ~modified −removed declarations), imports listed, call/embed changes as counts, Mermaid of changed packages + one hop (omitted above 30 nodes). Links (B6) deferred to the HTML Export.
- **License:** Apache-2.0 (`LICENSE`). Public at v0.1 (scan + diff-to-CI working).
- **Audience:** the author first, then open-source users.
- **Mode B surface:** Structural Summary for CI leads; local UI diff view for depth. zu never calls a code-host API and ships no CI snippets — the JSON/Markdown output is documented.
- **Links (B6):** host detected from the `origin` remote (GitHub/GitLab), `-link-template` override.
- **Languages:** Go only; other files reported as unsupported, with counts.
- **Metrics overlay (A7):** CRAP colour in v1 as its own feature after interaction: cyclomatic complexity computed by zu, coverage from `go test -coverprofile`; missing data counts as red (uml-viewer). Mutation score after v1. Settled by feature 08: complexity is measured in the scan's one parse and carried beside the IR (`scan.Stats`), never in it, so the IR and its goldens do not change; the IR's `metrics?` stays unwritten and CRAP lives in the View. Input is an explicit `-coverprofile FILE`, only with `-html`. No profile draws nothing (A7's "degrade silently"); with a profile, a package none of whose function files it covers is red with "?". A Change View shows head's coverage only.
- **Test corpus:** zu, spf13/cobra, gohugoio/hugo, kubernetes/kubernetes, pinned to tags, fetched by script.
- **5-minute criterion:** the author, timed, on a public repo they have not read (hugo).
- **Product focus:** zu explains a project and a code change through interactive diagrams — the diagram is the explanation. No prose or doc-comment text in the UI.
- **Change reading order:** new violations first, then changed components bottom-up by dependency (infra → interface).
- **Build order:** scan → scan at a ref (feature 02) → diff to CI, no UI (feature 03) → HTML Export (static) → interaction → Policy file. `serve` after v1 core.
- **UI v1:** U1, U3, U4, U5 full; U2 reduced (full re-layout allowed); U6 = uml-viewer's declutter cycle (full → arrows → triangles → elements → classes → back to full, as in uml-viewer's `hierarchy.clj`; stage definitions in feature 05's Deviation 1; violations stay red). Externals drawn as ovals. Focus (N hops), collapse to depth N, external toggle (no stdlib toggle: the IR has no stdlib edges); view state in the URL hash. Views over 2,000 nodes or 500 laid-out edges collapse depth automatically and say so.
- **Change View marks:** changed nodes solid, the Affected Set outlined; edges +/−, pair counts on bundles, cycle edges red; Moves dashed.
- **Output formats:** `diff`/`check` take `-format text|markdown|json`; markdown can be pasted as a PR comment; HTML via export. The summary includes the blast-radius count and says "no structural change" when only cosmetic edits were made.
- **Distribution:** GitHub Releases via goreleaser with checksums; `go install` after v0.1, once it can carry the UI (needs the module rename).
- **Watch + session restore:** with `serve`, after the v1 core.
- **Not matched from uml-viewer:** agent companion, EDN, desktop window, JVM.
- **Positioning:** no other tool draws a deterministic, non-LLM structural delta for a Go PR (checked 2026-09-23 against ~35 tools). Go rule linters draw nothing; Go graph viewers show no change.
- **Model features:** out of v1; revisit after v1 ships. Notes for then: Anthropic API + OpenAI-compatible endpoint; send structure only (IR names, edges, paths, Policy, diff), never source bodies.
