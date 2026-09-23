# Tasks: 01 · scan → IR

**Status:** In Progress
**Requirements:** [requirements.md](requirements.md) · **Design:** [design.md](design.md)

## Approach

The work runs bottom-up along the design's pipeline: first the IR types and encoding, then
git, walk, extract, hash, resolve, build, and finally `scan.Run` and the CLI. Each task is
RED → GREEN → REFACTOR, with one commit per task. Unit tests use small inline sources
under `t.TempDir()`. The golden fixture (Task 12) then proves the pieces work together.

## Progress Summary
- Total Tasks: 15
- Completed: 4/15
- In Progress: Task 5 — Declaration facts

## Tasks

- [x] **Task 1: IR types and canonical encoding** (`internal/ir`)
  - [x] RED: `Encode` of an unsorted IR gives sorted nodes, edges and locations; the field order follows REQ-010; empty collections are `[]`/`{}`; two-space indent and a trailing newline; `exported:false` is kept; `SchemaVersion == "1"`
  - [x] GREEN: types, `Sort`, `Encode`
  - [x] REFACTOR
  - Linked: REQ-010, REQ-011, REQ-013, REQ-018, REQ-039, REQ-045, REQ-046

- [x] **Task 2: gitref.Head** (`internal/gitref`)
  - [x] RED: non-repo → `("", false)`; repo with no commits → `("", false)`; clean commit → full id, false; edit a tracked file → dirty; an untracked file only → not dirty. Tests skip if `git` is missing
  - [x] GREEN: `exec.Command("git","-C",dir,…)` with fixed arguments
  - [x] REFACTOR
  - Linked: REQ-002, REQ-011, REQ-042

- [x] **Task 3: Walk** (`internal/scan/walk.go`)
  - [x] RED: skips `vendor`, `testdata`, `.x`, `_x` and `_test.go`; does not follow a directory symlink; skips a file symlink that leaves the root; lexical order; counts non-Go extensions (files without an extension are ignored); discovers `go.mod` files and maps each directory to its nearest module and import path
  - [x] GREEN
  - [x] REFACTOR
  - Linked: REQ-023, REQ-024, REQ-027, REQ-028

- [x] **Task 4: File header facts** (`extract.go`)
  - [x] RED: `//go:build ignore` and `ignore && x` are skipped, while `linux` and `!windows` are parsed; generated after a licence header → true; a comment after the package clause → false; parse error → message with the path relative to the root
  - [x] GREEN
  - [x] REFACTOR
  - Linked: REQ-007, REQ-025, REQ-032, REQ-043

- [ ] **Task 5: Declaration facts**
  - [ ] RED: func, method (value, pointer, generic receiver), type (struct, interface, generic, alias, named basic) → id, parent, exported, typeKind, location at the identifier; no const/var/`_`/func-literal nodes
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-013, REQ-014, REQ-015, REQ-017, REQ-020, REQ-021, REQ-045, REQ-046

- [ ] **Task 6: Declaration hash** (`hash.go`)
  - [ ] RED: comments (doc, field, trailing) and re-wrapping don't change the hash; a statement change does; const/var/import produce `#decls` hashes, and a changed const changes them
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-022

- [ ] **Task 7: Call and embed site extraction** (shadowing via `localKind`)
  - [ ] RED: bare / qualified / recv sites recorded; shadowed `F`, a local var `p` hiding an import, a reassigned receiver → `other`; builtins dropped; `F[T]()` → bare; embeds of Ident, Selector, Star and Index forms; unions and `~T` skipped
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-033, REQ-034, REQ-035, REQ-036, REQ-037

- [ ] **Task 8: Index and import resolution** (`resolve.go`)
  - [ ] RED: internal import → edge; path under a module but not scanned → `unresolvedImports`; longest-prefix require → external node; stdlib ignored; no module → unresolved; effective name from the package clause and the explicit alias
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-018, REQ-029, REQ-030, REQ-031

- [ ] **Task 9: Call resolution**
  - [ ] RED: `p.F` → edge; `p.T(x)` conversion dropped; external `x.F` dropped; package-var `v.M()` → unresolved; bare `F` → edge; bare type conversion dropped; dot import → unresolved; recv `r.M` in the method set → edge, a func field → unresolved
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-019, REQ-033, REQ-034, REQ-035, REQ-036

- [ ] **Task 10: Embed resolution**
  - [ ] RED: same-package and internal → type edge; external → external node edge; stdlib omitted
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-037

- [ ] **Task 11: Build and merge** (`build.go`)
  - [ ] RED: same id in two files → one node with both locations and hash = SHA over sorted per-declaration hashes; `generated` only if every declaration is generated; `typeKind` disagreement → other; package node at its first file's package clause with module; package hash over members plus `#decls`; edges merged, with locations appended
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-015, REQ-016, REQ-021, REQ-022, REQ-026, REQ-032

- [ ] **Task 12: scan.Run, golden fixture, determinism**
  - [ ] RED: `testdata/shop` golden (all cases in design §Testing); GOMAXPROCS 1 vs 8 byte-equal; gofmt / re-wrap / comment copy gives equal hashes; a one-statement edit changes exactly one function hash plus its package hash
  - [ ] GREEN: worker pool, fixed slots, `grouping:"tree"`, default `policyHash`
  - [ ] REFACTOR
  - Linked: REQ-001, REQ-007, REQ-012, REQ-038, REQ-039, and the end-to-end check of REQ-013–REQ-037

- [ ] **Task 13: CLI `zu scan`** (`internal/cli/scan.go`)
  - [ ] RED: default output names (commit12, `-dirty`, `worktree`); `.zu/.gitignore` = `*`; `-out -` writes stdout and nothing under `.zu`; `-out path`; summary line; parse error → exit 2, `-max-parse-errors 1` → 0; missing dir or bad flag → exit 3 and nothing written; no temp file left behind
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-001–REQ-009, REQ-044

- [ ] **Task 14: Security and privacy checks**
  - [ ] RED: no absolute temp-dir prefix anywhere in the IR; `internal/scan` and `internal/ir` import no `net`; a symlink escape inside the fixture is not read
  - [ ] GREEN
  - [ ] REFACTOR
  - Linked: REQ-024, REQ-042, REQ-043

- [ ] **Task 15: Self-scan, benchmarks, final verification**
  - [ ] Self-scan of zu: 0 parse errors (a test that skips when not in the repo)
  - [ ] `scripts/bench-corpus.sh` (pinned hugo and kubernetes tags) → `benchmarks.md`
  - [ ] `make check` (fmt, lint, race tests); review; update CLAUDE.md layout
  - Linked: REQ-040, REQ-041, REQ-043, and the acceptance criteria

## Notes
- `golang.org/x/mod v0.33.0` is the newest version that still declares Go ≤ 1.24.
