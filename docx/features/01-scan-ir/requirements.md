# Requirements: 01 · scan → IR

**Created:** 2026-09-23
**Status:** Draft — awaiting approval

## Overview

`zu scan [dir]` parses a Go repository's working tree into the IR — the deterministic,
on-disk description of its packages, types, functions and the dependencies between
them — and writes it under `.zu/`. Every later feature reads this file: the Change View
diffs two of them, the HTML Export renders one. This feature is build-order step 1: no
UI, no Policy (the grouping is the Package Tree, derived from node ids by later features),
no git refs other than recording HEAD.

Sources: [requirements draft](../../core/requirements-draft.md) (IDs A1, A4…), decisions
[0002](../../decisions/0002-syntax-first-analysis.md),
[0003](../../decisions/0003-stable-node-ids-canonical-ir.md),
[0004](../../decisions/0004-policy-hash-and-head-policy.md),
[0007](../../decisions/0007-scan-all-build-variants.md),
[0008](../../decisions/0008-package-tree-default-policy-never-invents-boxes.md), and the [glossary](../../glossary.md).
Choices below come from feature-01 round 1 (T1–T14) and the uml-viewer and tool comparison (M1–M10, C1–C8).

### Requirement ID Format

`REQ-001`… sequential across all categories. The **Trace** column names the draft
requirement, decision record or round-1 answer each one comes from.

## Functional Requirements

### Event-Driven Requirements

| ID | Requirement | Trace |
|---|---|---|
| REQ-001 | WHEN the user runs `zu scan [dir]` THEN the system SHALL parse the Go source under `dir` (default `.`) and write one IR file. | A1 |
| REQ-002 | WHEN a scan completes THEN the system SHALL write the IR to `.zu/ir/<commit12>.json` (first 12 hex characters of the HEAD commit id), or `.zu/ir/<commit12>-dirty.json` when tracked files have uncommitted modifications, or `.zu/ir/worktree.json` when `dir` is not inside a git repository or the repository has no commits. Untracked files SHALL NOT make a scan dirty. | T13, T11 |
| REQ-003 | WHEN the system creates `.zu/` THEN it SHALL write `.zu/.gitignore` containing `*` and SHALL NOT modify any other file outside `.zu/`. | T13 |
| REQ-004 | WHEN `-out -` is given THEN the system SHALL write the IR to stdout and write nothing under `.zu/`. | T13, CI usage |
| REQ-005 | WHEN `-out <path>` is given THEN the system SHALL write the IR to that path instead of `.zu/ir/`. | CLI flags |
| REQ-006 | WHEN a scan completes THEN the system SHALL print one summary line to stderr stating counts of packages, files parsed, parse errors, unresolved calls, and unsupported files per extension. | Language support |
| REQ-007 | WHEN a `.go` file fails to parse THEN the system SHALL record its repo-relative path and the parser's message in `parseErrors`, continue scanning the remaining files, and still write the IR. | T12, IR contract |
| REQ-008 | WHEN the number of parse errors exceeds the tolerance (default 0, set by `-max-parse-errors N`) THEN the system SHALL exit with code 2 after writing the IR. | T12, exit codes |
| REQ-009 | WHEN `dir` does not exist, is not a directory, or is unreadable, or a flag is invalid THEN the system SHALL print the reason to stderr, write nothing, and exit with code 3. | exit codes |

### Ubiquitous Requirements — IR content

| ID | Requirement | Trace |
|---|---|---|
| REQ-010 | The IR SHALL contain, in this order: `schemaVersion`, `ref`, `grouping`, `policyHash`, `nodes`, `edges`, `unresolvedCalls`, `unresolvedImports`, `parseErrors`, `unsupported`. | IR contract, 0003 |
| REQ-011 | The IR SHALL record `ref` once at top level as `{commit, dirty}`, where `commit` is the full HEAD commit id, or `""` outside a git repository or in a repository with no commits; `dirty` is true only when tracked files have uncommitted modifications. | T11 |
| REQ-012 | The IR SHALL set `grouping` to `"tree"` and `policyHash` to the fixed hash of the built-in default (empty) Policy, and SHALL NOT contain nodes for import-path segments that are not packages. | M1, 0008, 0004 |
| REQ-013 | The IR SHALL contain nodes of exactly four kinds: `package`, `type`, `function` (including methods), and `external`. | T1, T9 |
| REQ-014 | The system SHALL identify a `package` node by its import path, a `type` node by `<import path>.<Type>`, a function by `<import path>.<Func>`, and a method by `<import path>.<Type>.<Method>` — for both value and pointer receivers, and ignoring type parameters. | 0003, T1 |
| REQ-015 | The system SHALL set each `type` and top-level `function` node's `parent` to its package id, and each method's `parent` to its receiver type id; `package` and `external` nodes SHALL have no `parent`. | A3 |
| REQ-016 | The system SHALL record on every `package` node the path of the Go module it belongs to, as `module`. | T1, T8 |
| REQ-017 | The system SHALL NOT create nodes for constants, variables, function literals, or declarations named `_`. | T1 |
| REQ-018 | The IR SHALL contain edges of exactly three kinds: `imports` (package → package or external), `calls` (function → function), and `embeds` (type → type or external). | T3, A4 |
| REQ-019 | The system SHALL store edges only at their finest level — no aggregated package-to-package `calls` or `embeds` edges. | T4 |
| REQ-020 | The system SHALL give every node and every edge at least one location `{path, line}`, where `path` is relative to the scanned root and uses forward slashes. | IR rules |
| REQ-021 | The system SHALL locate a `package` node at the `package` clause of its first file in path order, a `type` or `function` node at its declaring identifier, an `external` node at its `require` line in `go.mod`, and an edge at each import spec, call expression or embedded field that justifies it. | IR rules, T9 |
| REQ-045 | The system SHALL record on every `type` and `function` node `exported: true` when its name (for a method, the method name) starts with an upper-case letter, else `exported: false`. | M5 |
| REQ-046 | The system SHALL record on every `type` node `typeKind`: `"struct"` or `"interface"` when its type expression is a struct or interface type (including generic types), otherwise `"other"` (aliases, named basic, func, map, slice and similar types); a merged node whose declarations disagree SHALL get `"other"`. | M5, 0007 |
| REQ-022 | The system SHALL record on every `package`, `type` and `function` node a `hash`: SHA-256 of the declaration re-printed with `go/printer` against an empty `FileSet` after removing every comment, so line breaks and comments do not affect it; for a package, SHA-256 over the sorted `(id, hash)` pairs of its members plus one pair `("#decls", h)`, where `h` is the SHA-256 over the hashes of its `const`, `var` and `import` declarations (one per declaration, hashed as above) in sorted order. | T10, Meaningful Change, design |

### Ubiquitous Requirements — what is scanned

| ID | Requirement | Trace |
|---|---|---|
| REQ-023 | The system SHALL skip directories named `vendor` or `testdata`, directories whose name begins with `.` or `_`, and files ending in `_test.go`. | T6 |
| REQ-024 | The system SHALL NOT follow a symbolic link to a directory, and SHALL NOT read any file whose resolved path lies outside the scanned root. | T6, Privacy and security |
| REQ-025 | The system SHALL parse every remaining `.go` file regardless of GOOS, GOARCH or other build tags, except files constrained by `//go:build ignore`. | T5, 0007 |
| REQ-026 | The system SHALL merge declarations that share an id (e.g. the same function in `_linux.go` and `_windows.go` files, or several `init` functions) into one node holding every location, with `hash` = SHA-256 over the per-declaration hashes (each computed as in REQ-022) sorted by location `(path, line)`. | T5, 0007 |
| REQ-027 | The system SHALL discover every `go.mod` under the root (outside skipped directories) and assign each package to the module of its nearest enclosing `go.mod`; its import path SHALL be that module's path joined with the package directory's path relative to the module root. | T8 |
| REQ-028 | The system SHALL count non-Go source files by extension in `unsupported`, and SHALL NOT create nodes for them. | Language support, R2 Q8 |

### Conditional Requirements — resolution

| ID | Requirement | Trace |
|---|---|---|
| REQ-029 | IF an import path belongs to a discovered module THEN the system SHALL emit an `imports` edge to that package's node; IF no package with that path was scanned THEN it SHALL count the import in `unresolvedImports` instead. | T8 |
| REQ-030 | IF an import path matches a `require` of the importing package's module (longest prefix) THEN the system SHALL emit an `imports` edge to the `external` node for that module path. | T9 |
| REQ-031 | IF an import path's first element contains no `.` and it matches no discovered module THEN the system SHALL treat it as standard library and emit no node, edge or count for it. | T9 |
| REQ-032 | IF a file is generated by the Go convention (a line matching `^// Code generated .* DO NOT EDIT\.$` in any comment before the `package` clause, as `ast.IsGenerated` checks) THEN the system SHALL mark every node declared in that file `generated: true`, and a merged node SHALL be marked only if all of its declarations are. | T7 |
| REQ-033 | IF a call has the form `p.F()` where `p` is a non-shadowed import name of an internal package and `F` is a top-level function of that package THEN the system SHALL emit a `calls` edge. | T14, 0002 |
| REQ-034 | IF a call has the form `F()` where `F` is not shadowed locally and is a top-level function of the same package THEN the system SHALL emit a `calls` edge. A bare `F()` that resolves only through a dot import is not certain and falls under REQ-036. | T14, 0002 |
| REQ-035 | IF a call has the form `r.M()` inside a method whose receiver is named `r`, `r` is not reassigned or shadowed, and `M` is a method declared on the receiver's base type in the same package THEN the system SHALL emit a `calls` edge. | T14, 0002 |
| REQ-036 | IF a call expression matches none of REQ-033–REQ-035 and is not a builtin, conversion, or call into the standard library or an external module THEN the system SHALL add one to `unresolvedCalls` for the calling package. | 0002 |
| REQ-037 | IF a struct or interface embeds a type declared in a scanned package THEN the system SHALL emit an `embeds` edge to that type; IF it embeds a type from an external module THEN it SHALL emit the edge to that module's `external` node; embeddings of standard-library types SHALL be omitted. | T3, T9 |

## Non-Functional Requirements

### Determinism

| ID | Requirement | Trace |
|---|---|---|
| REQ-038 | The system SHALL produce byte-identical IR output for the same working-tree contents, regardless of machine, OS, GOMAXPROCS, file-system enumeration order, or scan duration. | 0003 |
| REQ-039 | The system SHALL sort nodes by `id`, edges by `(from, to, kind)`, every location list by `(path, line)`, and every map-valued field by key, and SHALL write JSON with two-space indentation and a trailing newline. | 0003 |

### Performance

| ID | Requirement | Trace |
|---|---|---|
| REQ-040 | The system SHALL complete a cold scan of `gohugoio/hugo` at its pinned Test Corpus tag in under 30 seconds on a 2023-or-newer laptop (target, validated in this feature). | Performance budgets |
| REQ-041 | The system SHALL complete a scan of `kubernetes/kubernetes` at its pinned tag without exceeding 4 GB resident memory (target, measured and reported in this feature). | Performance budgets |

### Security and privacy

| ID | Requirement | Trace |
|---|---|---|
| REQ-042 | The system SHALL NOT open any network connection or execute any process other than `git` during a scan. | A1, offline goal |
| REQ-043 | The system SHALL NOT write any absolute path, user name, or host name into the IR. | Storage, privacy |
| REQ-044 | The system SHALL write the IR file atomically (temporary file in the same directory, then rename), so an interrupted scan never leaves a partial IR. | IR contract |

## Constraints

- Go 1.24, `CGO_ENABLED=0`, standard library plus `golang.org/x/mod/modfile` only.
- Syntax only (`go/parser`, `go/ast`, `go/printer`); no `go/packages`, `go/types`, `go list`, or module cache ([0002](../../decisions/0002-syntax-first-analysis.md)).
- `git` is invoked only to read HEAD and dirty status (`git rev-parse --verify -q HEAD`, `git status --porcelain --untracked-files=no`), and its absence is not an error: it yields `commit: ""`.
- `schemaVersion` becomes `"1"` with this feature.

## Acceptance Criteria

- [ ] A fixture module under `internal/scan/testdata/` covering every node kind, edge kind, `exported` and `typeKind` value, merge case, generated file, nested module, external module, skipped directory and parse error produces an IR equal to its committed golden file (REQ-001–REQ-037, REQ-045, REQ-046).
- [ ] Scanning the same fixture twice, with GOMAXPROCS=1 and GOMAXPROCS=8, produces byte-identical output (REQ-038, REQ-039).
- [ ] Reformatting a fixture file with `gofmt` and editing only its comments leaves every `hash` unchanged; re-wrapping a parameter list leaves it unchanged; changing one statement changes exactly that function's hash and its package's hash; changing a constant changes only its package's hash (REQ-022).
- [ ] A symlink inside the fixture that points outside the root is not followed, and the scan still succeeds (REQ-024).
- [ ] A fixture with one unparseable file writes the IR with one `parseErrors` entry and exits 2; with `-max-parse-errors 1` it exits 0 (REQ-007, REQ-008).
- [ ] `zu scan /nonexistent` exits 3 and writes nothing (REQ-009).
- [ ] `zu scan` on zu's own repository succeeds with zero parse errors, and the IR contains no absolute paths (REQ-043).
- [ ] The hugo scan time and kubernetes peak memory are measured with a script and recorded in `docx/features/01-scan-ir/benchmarks.md` (REQ-040, REQ-041).

## Out of Scope

- Scanning a git ref other than the working tree (feature: diff).
- Policy files, Levels, Proposals, Baseline, and cycle checks (feature: Policy).
- Cyclomatic complexity and coverage (feature: CRAP overlay).
- Building the Package Tree from ids (done where views are drawn).
- Any rendering, HTML export, or `serve`.
- Type-checked analysis, `implements` edges, interface dispatch, calls through variables or fields.
- Test files, and languages other than Go (beyond counting them).
- Incremental re-scan and watch mode.

## Traceability

Tasks in `tasks.md` will name the REQ IDs they satisfy; each acceptance criterion names
the REQ IDs it proves. Every REQ traces back to the draft, a decision record, or a
round-1 answer (column **Trace**).
