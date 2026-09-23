# Design: 01 · scan → IR

**Created:** 2026-09-23
**Status:** Draft — awaiting approval
**Requirements:** [requirements.md](requirements.md) (REQ-001–REQ-046)

## Architecture Overview

`zu scan` walks the tree once, parses every file once, and pulls each file's facts out of
its AST straight away. The AST is then dropped. Facts are declarations with hashes,
imports, and syntactic call and embed sites whose local shadowing has already been
checked. A second, AST-free pass resolves those sites against a repository-wide index
and builds the IR. Output is sorted and written atomically.

```
 cli.scan ──► gitref.Head(dir) ─────────────────────────────┐
    │                                                        │
    ▼                                                        ▼
 scan.Run(opts)                                        ir.IR{ref,...}
    │ 1 walk      files[], modules[], unsupported{}          ▲
    │ 2 extract   per file, parallel → fileFacts (AST freed) │
    │ 3 index     packages, decls, method sets, import names │
    │ 4 resolve   imports / calls / embeds → edges, counts   │
    │ 5 build     nodes (merge), edges (merge), hashes ──────┘
    ▼
 ir.Encode (canonical sort, 2-space JSON)  ──►  atomic write to .zu/ir/<name>.json
```

## System Context

- **Depends on:** Go standard library (`go/parser`, `go/ast`, `go/printer`, `go/token`,
  `go/build/constraint`, `crypto/sha256`, `encoding/json`), `golang.org/x/mod/modfile`,
  the `git` binary (optional).
- **Used by:** later features. `diff` compares two IRs, the HTML Export draws one, and
  the viewer builds the Package Tree from node ids (0008).

## Key decision: how the call index is built

To resolve `p.F()` we need every package's top-level functions, types, method sets
and package clause name. Those are only known after every file is parsed.

| Option | Memory (kubernetes) | Time | Complexity |
|---|---|---|---|
| **A. Extract, then resolve** *(chosen)* | only facts: ids, hashes, call sites | 1 parse per file | medium: shadowing is checked while the AST is alive |
| B. Keep every AST, resolve after | every AST held at once: several GB, puts REQ-041's 4 GB at risk | 1 parse | low |
| C. Parse twice (index pass, then resolve pass) | 1 AST per worker at a time | ~2× parse time | low |

A wins because shadowing is the only thing that needs the AST, and that can be judged
inside one file. The parser's own identifier resolution handles it: `ast.Ident.Obj` is
set for local declarations and nil for imports and other files' top-level names, which
the spike confirmed (`F := 1; F()` gives `Obj.Kind == var`). `ast.Object` is marked
deprecated but is still supported under the Go 1 compatibility promise. It sits behind
one function (`localKind(ident)`), so a hand-written scope walker can replace it without
touching anything else.

## Component Structure

| Package | Files | Responsibility |
|---|---|---|
| `internal/ir` | `ir.go`, `encode.go` | IR types in field order (REQ-010); `Sort` and `Encode` (REQ-039); `SchemaVersion = "1"` |
| `internal/gitref` | `gitref.go` | `Head(dir) (commit string, dirty bool)`, run via `git -C dir`. A missing git binary, a directory outside a repo, or a repo without commits returns `("", false)` |
| `internal/scan` | `walk.go` | Recursive walk, skip rules (REQ-023), symlink and root containment (REQ-024), `go.mod` discovery (REQ-027), unsupported counts (REQ-028). Returns paths in lexical order |
| | `extract.go` | Parse one file (`parser.ParseComments`, object resolution on). `//go:build ignore` check (REQ-025). Generated flag (REQ-032). Declarations, imports, call and embed sites → `fileFacts` |
| | `hash.go` | Remove every comment field, print against an empty `FileSet`, SHA-256 (REQ-022, REQ-026) |
| | `resolve.go` | Index plus the resolution rules REQ-029–REQ-037 |
| | `build.go` | Merge declarations into nodes, merge edges, package hashes, counts |
| | `scan.go` | `Run(ctx, Options) (*ir.IR, Stats, error)`, a bounded worker pool |
| `internal/cli` | `scan.go` | Flags, output naming (REQ-002, REQ-004, REQ-005), `.zu/.gitignore` (REQ-003), summary line (REQ-006), exit codes (REQ-008, REQ-009), atomic write (REQ-044) |

`scan` knows nothing about git, flags or files on disk beyond the root it reads. `cli`
puts the pieces together, so `scan.Run` can be tested on fixtures with no process or
output side effects.

## Data Flow and Rules

### 1. Walk (REQ-023, REQ-024, REQ-027, REQ-028)
- Uses `filepath.WalkDir`, which does not follow symlinks to directories. A symlinked
  *file* is resolved with `filepath.EvalSymlinks` and skipped if it resolves outside the
  root.
- `go.mod` files are parsed with `modfile.ParseLax`, which keeps `module` and `require`.
  A package's module is its nearest enclosing `go.mod`. Import path =
  `module path + "/" + rel(dir, module root)`, or just the module path at the module
  root.
- `.go` files outside any module get a parse error ("no enclosing go.mod"). They are not
  analysed.

### 2. Extract, per file, in parallel
- Workers fill `facts[i]` for file `i` in the sorted list, so merge order never depends
  on scheduling (REQ-038).
- Each file gets its own `token.FileSet`. Positions become `{path, line}` at once, and
  the set is dropped with the AST.
- `//go:build` is parsed with `go/build/constraint`. A file is skipped when the
  expression is the tag `ignore` itself, or an `&&` that contains it.
- Generated check: `ast.IsGenerated(file)`, the official Go convention, which checks
  every comment before the `package` clause (**REQ-032 amendment**, below).
- Declarations become `declFact{id, kind, parent, exported, typeKind, hash, loc}`.
  `exported` is `ast.IsExported(name)` (REQ-045). `typeKind` comes from `TypeSpec.Type`
  being `*ast.StructType` or `*ast.InterfaceType`, and is only computed when
  `Assign == 0` (not an alias) (REQ-046). The receiver base type strips `*` and type
  parameters (`IndexExpr` / `IndexListExpr`) (REQ-014).
- Call sites keep only the three certain forms. The shadowing checks run here; the
  checks that need the index wait for pass 2:
  - `F()` or `F[T]()`, where `F.Obj` is nil or points to a top-level `*ast.FuncDecl` →
    `callSite{kind: bare, name}`. A local var, param or type Obj means the call is not
    certain.
  - `x.F()`, where `x.Obj` is nil → `callSite{kind: qualified, x, F}`. `x` is either an
    import name or a package-level name from another file; pass 2 decides which.
  - `r.M()`, where `r.Obj.Decl` is the method's receiver `*ast.Field` and the body has
    no `AssignStmt` or `IncDecStmt` with `r` on the left using the same Obj →
    `callSite{kind: recv, M}`.
  - Builtins (`len`, `append`, `min`, `clear`, …), when not shadowed, are dropped.
  - Every other call expression is `callSite{kind: other}` and only counted.
- Embed sites: unnamed struct fields and non-method interface elements whose type is
  `Ident`, `SelectorExpr`, `*X` or `X[T]`. Union and `~T` elements are skipped.

### 3. Hash (REQ-022, REQ-026)
- `ast.Inspect` sets every `*ast.CommentGroup` field to nil (`Doc`, `Comment` on
  `FuncDecl`, `GenDecl`, `Field`, `TypeSpec`, `ValueSpec`, `ImportSpec`). The spike showed
  field comments leak into printed output otherwise.
- The declaration is printed with `printer.Fprint(&buf, token.NewFileSet(), decl)`. An
  empty `FileSet` makes the printer ignore the original line breaks, so re-wrapping a
  parameter list does not change the hash; the spike confirmed identical output.
- The hash is the SHA-256 of those bytes, run after every other fact is extracted,
  because it modifies the AST.
- A type's hash covers its `TypeSpec`. A function's hash covers its `FuncDecl`, body
  included.
- **Package hash amendment:** the pairs also include one synthetic member,
  `("#decls", hash)`. It is the SHA-256 over the sorted hashes of the package's `const`, `var`,
  `import` and blank (`_`) declarations, plus one `fileHash` per file (package clause name,
  normalised `//go:build`, cgo preamble, every directive line). Without it, a changed
  constant, a new import, a `//go:embed` pattern or a build constraint would leave the
  package "unmodified", which contradicts Meaningful Change.
- Directive lines (`//go:…` except `//go:build`, and `//export`) attached to a declaration
  are hashed with it, so `//go:linkname` or `//go:embed` edits change that node's hash.
  A single-spec `GenDecl` loses its parentheses before printing: `import "x"` and
  `import ("x")` hash the same.

### 4. Index and resolve (REQ-029–REQ-037)
- **Index:**
  - `pkgs[importPath] → {name (package clause of the first file in path order), funcs, types, methods[type]}`
  - `modules[]` sorted by path length, longest first, for prefix matching
  - `requires[module]` as a sorted list
- **Imports**, per file. The effective name is the explicit name, or else the target's
  package clause name:
  - internal package → `imports` edge;
  - under a discovered module but not scanned → `unresolvedImports[path]++`;
  - longest-prefix `require` match → edge to `external:<module>`;
  - first element has no dot → stdlib, ignored;
  - anything else → `unresolvedImports`.
  - For external and stdlib packages, the guessed effective name is the last path
    element with any `/vN` suffix or `.vN` (gopkg.in) removed, and with the `go-`
    prefix or `-go` suffix removed. The guess is only used to classify calls as
    external, never to create an edge.
- **Calls:**
  - `bare` → an edge if `F` is a top-level function in the same package. If `F` is a
    same-package type, it is a conversion and dropped. Otherwise it goes to
    `unresolvedCalls[pkg]`, which covers dot imports.
  - `qualified` → if `x` is the effective name of one of the file's imports:
    - internal → an edge when `F` is a top-level function, dropped when it is a type
      (a conversion), otherwise unresolved;
    - external or stdlib → dropped.
    - If `x` is not an import name, it is a package-level variable or type in this
      repository → unresolved.
  - `recv` → an edge if `M` is in the base type's method set, otherwise unresolved
    (a func-typed field or a promoted method).
  - `other` → unresolved.
- **Embeds:** a same-package identifier or internal `p.T` → `embeds` edge; external →
  edge to the `external` node; stdlib → dropped; an unknown internal type → dropped.
- **Edges** are keyed by `(from, to, kind)`. Repeated sites add locations to the same
  edge.

### 5. Build
- Declarations with the same id merge (REQ-026). Locations are sorted. The merged hash
  is the SHA-256 over the per-declaration hashes in location order. A node with a
  single declaration keeps that declaration's hash.
- `generated` is set only if every declaration is generated. `typeKind` becomes
  `"other"` on disagreement.
- Package node: located at the `package` clause of its first file, with `module` set,
  and its hash from the sorted `(id, hash)` pairs of its members plus `#decls`.
- External node: `id = module path`, located at the `require` line; it appears only
  when something references it.

## API Contracts

### CLI
```
zu scan [dir] [-out -|<path>] [-max-parse-errors N]
stderr: zu scan: 412 packages, 3120 files, 0 parse errors, 1830 unresolved calls, unsupported: .proto=12 .sh=4
exit:   0 ok · 2 parse errors > N (IR still written) · 3 bad dir/flag (nothing written)
```
Default output: `<dir>/.zu/ir/<commit12>[-dirty].json` or `<dir>/.zu/ir/worktree.json`.

### IR (schemaVersion "1")
```json
{
  "schemaVersion": "1",
  "ref": {"commit": "9f2c…", "dirty": false},
  "grouping": "tree",
  "policyHash": "sha256:…",
  "nodes": [
    {"id": "example.com/shop/store", "kind": "package", "module": "example.com/shop",
     "hash": "…", "locations": [{"path": "store/repo.go", "line": 1}]},
    {"id": "example.com/shop/store.Repo", "kind": "type", "parent": "example.com/shop/store",
     "exported": true, "typeKind": "struct", "hash": "…", "locations": [...]},
    {"id": "example.com/shop/store.Repo.Get", "kind": "function",
     "parent": "example.com/shop/store.Repo", "exported": true, "hash": "…", "locations": [...]},
    {"id": "github.com/lib/pq", "kind": "external", "locations": [{"path": "go.mod", "line": 7}]}
  ],
  "edges": [{"from": "…", "to": "…", "kind": "calls", "locations": [...]}],
  "unresolvedCalls": {"example.com/shop/store": 12},
  "unresolvedImports": {"example.com/shop/gen": 1},
  "parseErrors": [{"path": "bad.go", "message": "bad.go:3:1: expected declaration"}],
  "unsupported": {".proto": 12}
}
```
- Optional fields (`parent`, `module`, `exported`, `typeKind`, `generated`, `hash`) are
  omitted when they don't apply to a node's kind. `exported` is a `*bool` so `false`
  still gets written.
- Empty collections are written as `[]` or `{}`, never `null`, so the file shape is the
  same for every repo.
- `policyHash` is `sha256:` plus the hash of the canonical encoding of the empty Policy.
  The Policy feature defines that encoding; feature 01 pins the constant in a test.
- `parseErrors[].message` has the absolute root prefix removed (REQ-043).

## Error Handling

| Situation | Behaviour |
|---|---|
| dir missing, not a dir, or unreadable; bad flag | stderr reason, nothing written, exit 3 |
| file fails to parse | `parseErrors` entry, keep going; exit 2 if the count is over N |
| unreadable file or directory mid-walk | recorded as a parse error with the OS message, relative path only |
| malformed `go.mod` | parse error; that module's packages are still scanned, with no `require`s |
| git missing, errors, or no repo | `commit: ""`, output `worktree.json`; not an error |
| write fails | stderr, exit 3; the temp file is removed; no partial IR (REQ-044) |
| Ctrl-C | context cancelled; workers stop; nothing written |

## Security Considerations
- The walk never leaves the root: directory symlinks are not followed, and file symlinks
  are checked (REQ-024).
- The only process run is `git`, via `exec.Command("git", "-C", dir, …)` with fixed
  arguments and no shell (REQ-042). No network code is linked in; a test checks the
  import graph of `internal/scan` has no `net` package.
- Every path in the IR is `filepath.ToSlash(rel(root, p))`. A test scans a fixture under
  `t.TempDir()` and asserts the absolute prefix never appears in the output (REQ-043).

## Performance Considerations
- One parse per file. The AST and `FileSet` are released after extraction, so peak
  memory is about (workers × one AST) + all facts. Kubernetes facts are estimated at a
  few hundred MB; this is measured in the benchmarks task.
- The worker pool is sized by `GOMAXPROCS`. Per-file work is independent. The index and
  resolve passes are single-threaded map lookups.
- No cache or incremental scan (out of scope). Benchmarks: `scripts/bench-corpus.sh`
  clones the pinned tag into `.zu/corpus/` and records `/usr/bin/time -l` (macOS) or
  `-v` (Linux) output in `benchmarks.md`.

## Testing Strategy
- **Golden fixture:** `internal/scan/testdata/shop/`, a module with a nested module, a
  `vendor/`, a `testdata/`, a `.hidden/`, a `_test.go`, two build-tag variants,
  `init`×2, a generated file with a licence header first, an external `require`, an
  alias, an interface, a generic type, all three certain-call forms plus shadowed
  versions of each, a dot import, a conversion, an embed of each kind, and one
  unparseable file. `TestScanGolden` compares the result to `shop.golden.json`;
  `-update` rewrites it.
- **Determinism:** the same scan at GOMAXPROCS 1 and 8 must be byte-equal.
- **Hash stability:** a copy of the fixture is run through `gofmt`, re-wrapped and
  re-commented, and every hash must match. One edited statement must change exactly one
  function hash, its package hash and nothing else. A const change must change only the
  package hash.
- **Unit tests** per rule: skip rules, symlinks (created in `t.TempDir()`), module
  mapping, build constraint, `IsGenerated`, `localKind` shadowing, import-name guessing,
  `ir.Encode` ordering and empty collections.
- **CLI tests** go through `cli.Run`: output naming (git repo with and without commits,
  dirty, non-repo, via `git init` in `t.TempDir()`, skipped if git is missing),
  `-out -`, `-out path`, `.zu/.gitignore`, exit codes 0, 2 and 3, the summary line.
- **Self-scan** of zu's own repo: 0 parse errors, no absolute paths.

## Requirement amendments (applied to requirements.md)

1. **REQ-022:** the printer runs against an empty `FileSet` with every comment field
   removed, except compiler directives. The package hash also covers a synthetic `#decls`
   member for const/var/import/blank declarations and a per-file hash (package name, build
   constraint, cgo preamble, directives). Otherwise re-wrapping would change hashes, and a
   const, `//go:embed` or build-constraint change would not mark the package modified.
   (The per-file part and directives were added after the code review.)
2. **REQ-032:** use the Go convention (`ast.IsGenerated`: a matching line in any comment
   before the `package` clause), not "first comment group". Kubernetes' generated files
   put the licence header first and would otherwise be missed.

## Out of Scope
As in [requirements.md](requirements.md#out-of-scope).
