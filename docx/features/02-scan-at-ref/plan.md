# 02 · scan at a ref — Plan

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Goal:** `zu scan -ref <commit>` builds the IR of any commit straight from git objects, byte-identical to a disk scan of a clean checkout of that commit. Every declaration node also carries a name-blind `shape` hash, so feature 03 can pair renames as Moves.

**Architecture:**
- The scanner stops reading the disk directly. `walk` and `extractFile` read through a small `scan.Tree` interface with two implementations:
  - `scan.DirTree`: today's disk walk, unchanged behaviour.
  - `gitref.CommitTree`: runs `git ls-tree` once, then reads blobs over a single `git cat-file --batch` pipe.
- Both implementations apply the same rules: the same pruning, and in-tree file symlinks are resolved while links to directories or outside the root are skipped. The file classification above them (go.mod discovery, `.go` selection, unsupported counts) is shared code.
- `shape` is computed next to `hash` from the same stripped AST: first print it as it stands, then print it again with the declared name and the receiver type name blanked out.

**Tech Stack:**
- Go 1.24 and the standard library.
- The git CLI (decision 0005), with the existing `safeArgs`.
- Files: `internal/scan/{tree.go,walk.go,extract.go,hash.go,build.go,scan.go}`, `internal/gitref/tree.go`, `internal/ir/ir.go`, `internal/cli/scan.go`.

**Settled inputs:** decisions 0003 (amended: `shape`) and 0005; `docx/core/decisions.md` › Diff scope; the round-2 answers R1, R3 and R5.

**Out of Scope:**
- `zu diff`, merge-base, `-worktree`, and the Structural Summary: all feature 03.
- An IR cache.
- Submodule contents. A gitlink has no files in the commit, so a ref scan cannot see them; parity is defined for repositories without checked-out submodules.
- `go.mod` versions (not compared, per R2).
- Windows paths.

---

## Tasks

### Task 1: `shape` field in the IR

**Files:**
- Modify: `internal/ir/ir.go` (the `Node` struct)
- Modify: `internal/ir/ir_test.go`
- Modify: `docx/features/01-scan-ir/requirements.md` (the node-field list in REQ-013/REQ-022; add an "amended by 02" note)

**Steps:**

- [ ] **Test**: in `ir_test.go`, `TestNodeShapeFollowsHash`. Encode one function node with `Hash:"h"` and `Shape:"s"`. Assert that `"hash": "h",` is directly followed by `"shape": "s",`, and that a package node with no shape has no `"shape"` key.
- [ ] **Verify RED**: `go test ./internal/ir -run TestNodeShapeFollowsHash` → FAIL (unknown field `Shape`).
- [ ] **Action**:

   ```go
   Hash      string     `json:"hash,omitempty"`
   // Shape is Hash with the declared name and receiver type name blanked:
   // equal shapes pair a removed and an added declaration as a Move (0003).
   // Types and functions only.
   Shape     string     `json:"shape,omitempty"`
   Locations []Location `json:"locations"`
   ```

   `schemaVersion` stays `"1"`: the field is additive and no IR reader exists yet.
- [ ] **Verify**: `go test ./internal/ir` → ok.
- [ ] **Commit**: `git add internal/ir/ir.go internal/ir/ir_test.go docx/features/01-scan-ir/requirements.md && git commit -m "Add shape to IR nodes"`

---

### Task 2: Compute the shape hash

**Files:**
- Modify: `internal/scan/hash.go` (new `hashDecl`)
- Modify: `internal/scan/extract.go` (`declFact.Shape`; the hashing loop at the end of `extractFile`)
- Modify: `internal/scan/build.go` (`mergeDecls`)
- Modify: `internal/scan/hash_test.go`
- Modify: `testdata/shop.golden.json` (regenerated)

**Steps:**

- [ ] **Test**: in `hash_test.go`, add `TestShape`. Parse each pair of sources below, then compare the one declaration's `Hash` and `Shape`.

   | Pair | hash | shape |
   |---|---|---|
   | `func round(x int) int { return x }` → `func roundHalfEven(x int) int { return x }` | differs | equal |
   | recursive `func f(n int) int { if n == 0 { return 0 }; return f(n-1) }` → the same with `g` | differs | equal |
   | `type T struct{ next *T }` → `type U struct{ next *U }` | differs | equal |
   | `func (t *T) M() {}` → `func (u *U) M() {}` (receiver type renamed) | differs | equal |
   | `func f() int { return 1 }` → `func f() int { return 2 }` | differs | differs |
   | `//go:noinline` added to `f` | differs | differs |

- [ ] **Verify RED**: `go test ./internal/scan -run TestShape` → FAIL.
- [ ] **Action**: replace the body of `hashNode` with a shared helper, and add `hashDecl`:

   ```go
   // hashDecl returns the declaration's hash and its shape: the same print
   // with every identifier spelled like the declared name or the receiver
   // type name replaced by "_", so a rename keeps the shape. Over-blanking
   // (a field that shares the name) only makes shapes more equal, and Moves
   // pair only one-to-one.
   func hashDecl(n ast.Node, names []string, extra ...*ast.CommentGroup) (hash, shape string) {
   	dirs := directives(n, extra...)
   	stripComments(n)
   	hash = printHash(dirs, n)
   	ast.Inspect(n, func(x ast.Node) bool {
   		if id, ok := x.(*ast.Ident); ok && slices.Contains(names, id.Name) {
   			id.Name = "_"
   		}
   		return true
   	})
   	return hash, printHash(dirs, n)
   }
   ```

   Here `directives` holds the directive-collecting half of today's `hashNode`, and `printHash` holds the printer half. `hashNode(n, extra...)` becomes `printHash(directives(n, extra...), stripped n)`, so its output is byte-for-byte unchanged.

   In `extractFile`, call:

   ```go
   d.Hash, d.Shape = hashDecl(d.node, []string{d.Name, d.Recv}, d.doc)
   ```

   `d.Recv` is empty for types and functions; empty strings never match an identifier. In `mergeDecls`, merged shapes are the SHA-256 over the per-declaration shapes in location order, exactly like `Hash`, and `n.Shape` is set.
- [ ] **Verify**: `go test ./internal/scan -run 'TestShape|TestHash'` → ok. Existing hash tests must pass unchanged, which proves `hash` did not move.
- [ ] **Golden**: `go test ./internal/scan -update`, then `git diff --stat testdata/shop.golden.json`. Expected: only `"shape":` lines are added; no `"hash":` line changes. Then run `go test ./...` → ok.
- [ ] **Commit**: `git add internal/scan/hash.go internal/scan/hash_test.go internal/scan/extract.go internal/scan/build.go testdata/shop.golden.json && git commit -m "Hash declaration shape for rename pairing"`

---

### Task 3: `scan.Tree` and `DirTree` (a refactor with no behaviour change)

**Files:**
- Create: `internal/scan/tree.go`
- Modify: `internal/scan/walk.go` (`walk` takes a `Tree`; the disk-specific parts move to `tree.go`)
- Modify: `internal/scan/extract.go` (`extractFile(t Tree, rel string)`)
- Modify: `internal/scan/scan.go` (`Options.Tree`)
- Modify: `internal/cli/scan.go` and the tests that build `scan.Options{Root: …}`

**Steps:**

- [ ] **Action**: define the interface.

   ```go
   // Tree is a file tree the scanner reads: a directory on disk or a git
   // commit. Paths are slash paths relative to the tree root.
   type Tree interface {
   	// Files returns the regular files to consider, in lexical order: no
   	// file under a pruned directory (see skipDir), plus file symlinks
   	// whose resolved target is a regular file inside the tree. Problems
   	// with single entries go in errs; err means the tree is unusable.
   	Files() (files []string, errs []ir.ParseError, err error)
   	// ReadFile returns the content of a path from Files, following the
   	// symlink if it is one.
   	ReadFile(rel string) ([]byte, error)
   }

   // DirTree is the directory at root. It fails if root is missing or not
   // a directory.
   func DirTree(root string) (Tree, error)
   ```

   - `DirTree` gets the existing `os.Stat`/`Abs`/`EvalSymlinks` checks, the `WalkDir` loop, and `linkedFileInside`.
   - `walk(t Tree)` keeps everything after listing: go.mod parsing through `t.ReadFile`, `.go` and `_test.go` selection, unsupported counts, `ErrNoModule`, and module mapping.
   - `walkResult.Root` is removed; `extractAll` passes the tree through.
   - `Options` becomes `{Tree Tree; Workers int}`.
- [ ] **Verify**: `go test ./...` → ok, with the golden file unchanged (`git diff --quiet testdata/`). Existing walk, security and CLI tests are the behaviour lock.
- [ ] **Verify**: `grep -n '"os"' internal/scan/*.go | grep -v _test` → only `tree.go`.
- [ ] **Commit**: `git add internal/scan/tree.go internal/scan/walk.go internal/scan/extract.go internal/scan/scan.go internal/cli/scan.go internal/scan/*_test.go internal/cli/*_test.go && git commit -m "Read scanned files through a Tree"`

---

### Task 4: `gitref.CommitTree`

**Files:**
- Create: `internal/gitref/tree.go`
- Create: `internal/gitref/tree_test.go`

**Steps:**

- [ ] **Test**: `tree_test.go`, using the existing `needGit`, `run` and `write` helpers. Commit a repo containing:
   - `go.mod`, `a/a.go`, `vendor/v.go`, `.hidden/h.go`, `_x/x.go`;
   - an in-tree link `b/link.go -> ../a/a.go`, and a chain `c/l2.go -> ../b/link.go`;
   - an escaping link `d/out.go -> ../../etc/passwd`, a directory link `e -> a`, and a dangling link `f/gone.go -> nope.go`.

   Then edit `a/a.go` without committing and assert:
   - `Files()` = `[a/a.go b/link.go c/l2.go go.mod]`;
   - `ReadFile("b/link.go")` and `ReadFile("c/l2.go")` return the **committed** `a/a.go`, not the edited working copy;
   - `Resolve(ctx, dir, "-x")` fails without running git;
   - `Resolve(ctx, dir, "nope")` fails with an error naming the ref;
   - `Resolve(ctx, dir, "HEAD")` returns the full id from `git rev-parse HEAD`;
   - in a non-repository, `Resolve` fails.
- [ ] **Verify RED**: `go test ./internal/gitref -run Tree` → FAIL.
- [ ] **Action**:

   ```go
   // Resolve returns the repository top level containing dir and the full
   // commit id ref names. A ref starting with "-" is refused before git runs.
   func Resolve(ctx context.Context, dir, ref string) (top, commit string, err error)

   // CommitTree is one commit read from git objects. It implements
   // scan.Tree; ReadFile is safe for concurrent use (one cat-file pipe
   // behind a mutex). Close ends the git process.
   type CommitTree struct{ /* ... */ }

   func OpenCommit(ctx context.Context, top, commit string) (*CommitTree, error)
   func (t *CommitTree) Files() ([]string, []ir.ParseError, error)
   func (t *CommitTree) ReadFile(rel string) ([]byte, error)
   func (t *CommitTree) Close() error
   ```

   - **Resolve**: runs `rev-parse --show-toplevel` in `dir`, then `rev-parse --verify -q --end-of-options <ref>^{commit}` in `top`.
   - **OpenCommit**: runs `ls-tree -r -z --full-tree <commit>` once and records mode, oid and path for each entry. It starts `cat-file --batch` with `safeArgs` and `GIT_OPTIONAL_LOCKS=0`. No filters run: `--batch` returns raw blobs.
   - **Files**:
     - Drop any path with a directory component for which `scan`'s pruning rule is true. Export that rule from `scan` as `scan.PrunedDir(name string) bool` so the two sides cannot drift.
     - Keep mode `100644`/`100755` entries.
     - For mode `120000`, read the link text and resolve it component by component (`path.Join` of the link's directory and the text), following further links up to 40 hops. Keep the entry only if it ends at a regular blob inside the tree.
     - Skip `160000` (submodules) and directory results.
   - **ReadFile**: returns the blob of the resolved oid. A broken pipe or a short read sets a sticky `Err()`, which the CLI checks.
- [ ] **Verify**: `go test -race ./internal/gitref` → ok.
- [ ] **Commit**: `git add internal/gitref/tree.go internal/gitref/tree_test.go internal/scan/walk.go internal/scan/tree.go && git commit -m "Read commits from git objects"`

---

### Task 5: Disk and ref scans are byte-identical

**Files:**
- Create: `internal/scan/parity_test.go` (`package scan_test`, so importing `gitref` creates no cycle)

**Steps:**

- [ ] **Test**: `TestRefScanMatchesDiskScan`.
   1. Copy `testdata/shop` into a temp repo.
   2. Add the link cases from Task 4, a nested module with its own `go.mod`, a malformed `go.mod` boundary, and a file with a parse error.
   3. Commit it.
   4. Scan it with `scan.DirTree(top)` and with `gitref.OpenCommit(top, head)`.
   5. Set `Ref` on both to the same value and `ir.Encode` both.
   6. Assert the bytes are equal. On failure, print the first differing line.
- [ ] **Verify**: `go test ./internal/scan -run TestRefScanMatchesDiskScan` → ok. If it fails, fix the tree implementation, never the test.
- [ ] **Commit**: `git add internal/scan/parity_test.go && git commit -m "Test ref and disk scans for byte equality"`

---

### Task 6: `zu scan -ref <commit>`

**Files:**
- Modify: `internal/cli/scan.go`
- Modify: `internal/cli/scan_test.go`
- Modify: `internal/cli/cli.go` (usage line)

**Steps:**

- [ ] **Test**: add these tests to `scan_test.go`.

   | Test | Setup | Expected |
   |---|---|---|
   | `TestScanRefWritesCommitIR` | commit, then edit a file in the worktree | `zu scan -ref HEAD <subdir>` exits 0 and writes `<top>/.zu/ir/<commit12>.json` with `dirty:false`, the committed content, and paths relative to the top level |
   | `TestScanRefBadRef` | — | `-ref nope`, `-ref -x`, and `-ref HEAD` outside a repository each exit 3, with a reason on stderr and nothing written |
   | `TestScanRefInterrupted` | cancel through the `interruptContext` seam | exit 3, nothing written |

- [ ] **Verify RED**: `go test ./internal/cli -run ScanRef` → FAIL.
- [ ] **Action**:
   - Add `ref := fs.String("ref", "", "scan `commit` from git objects instead of the working tree")`.
   - When it is set: call `gitref.Resolve`, then `gitref.OpenCommit`, with `defer tree.Close()`. Run `scan.Run(ctx, scan.Options{Tree: tree})` and set `doc.Ref = ir.Ref{Commit: commit}`. If `tree.Err() != nil`, exit 3. The default output goes under `top`.
   - Otherwise keep today's path through `scan.DirTree(dir)`.
   - Make the `gitHead` and `gitResolve` seams package variables, as today.
- [ ] **Verify**: `go test -race ./internal/cli` → ok.
- [ ] **Smoke**: `go run ./cmd/zu scan -ref HEAD -out - . | head -5` → an IR whose `ref.commit` equals `git rev-parse HEAD`.
- [ ] **Commit**: `git add internal/cli/scan.go internal/cli/scan_test.go internal/cli/cli.go && git commit -m "Add zu scan -ref"`

---

### Task 7: Docs, benchmarks, final check

**Files:**
- Modify: `docx/glossary.md` (a new **Shape** entry: "a declaration's hash with its own name and receiver type name blanked; equal shapes identify a Move")
- Modify: `CLAUDE.md` (layout: `internal/scan` tree.go, and `internal/gitref` CommitTree, noting that git is still the only process zu runs)
- Modify: `scripts/bench-corpus.sh` (also time `zu scan -ref <tag>` next to the disk scan)
- Create: `docx/features/02-scan-at-ref/benchmarks.md`

**Steps:**

- [ ] **Bench**: `scripts/bench-corpus.sh`, run in the background. Record wall time and peak RSS for disk scans vs ref scans on hugo and kubernetes. Expected: a ref scan stays within 2× the disk scan time, and peak RSS stays under 4 GB.
- [ ] **Self-parity**: on a clean zu checkout (`git status --porcelain` is empty), run `go run ./cmd/zu scan -ref HEAD -out "$SCRATCH/ref.json" .` and `go run ./cmd/zu scan -out "$SCRATCH/disk.json" .`, then `cmp "$SCRATCH/ref.json" "$SCRATCH/disk.json"`. Expected: no output. Untracked files would break this, which is expected; see Notes.
- [ ] **Full check**: `set -o pipefail; make check` → exit 0.
- [ ] **Commit**: `git add docx/glossary.md CLAUDE.md scripts/bench-corpus.sh docx/features/02-scan-at-ref/benchmarks.md docx/features/02-scan-at-ref/plan.md && git commit -m "Document ref scans and record benchmarks"`

---

## Notes

- **The parity promise, precisely:** same commit, clean checkout (no untracked or ignored `.go` files), no checked-out submodules. Disk scans see untracked and ignored files; ref scans never do.
- **Security:**
  - `--end-of-options` and the leading-`-` check stop ref injection.
  - `cat-file --batch` never runs clean or smudge filters.
  - Links are resolved purely by path arithmetic inside the tree, so nothing outside the repository is read.
- **`shape` can over-pair across kinds**, for example a type and a function both named `_` after blanking. Feature 03 pairs only within the same `kind`, and only one-to-one.
- **Import direction:** `gitref` imports `scan` (for `PrunedDir` and `ir`); `scan` never imports `gitref` outside `_test.go`.
- **Deliberately not done:** a filter on `git ls-files` (that belongs to feature 03's `-worktree`), and reusing the tree between two scans.

## Progress

- [ ] Task 1: `shape` field in the IR
- [ ] Task 2: Compute the shape hash
- [ ] Task 3: `scan.Tree` and `DirTree`
- [ ] Task 4: `gitref.CommitTree`
- [ ] Task 5: Disk and ref scans are byte-identical
- [ ] Task 6: `zu scan -ref`
- [ ] Task 7: Docs, benchmarks, final check

**Status:** Not Started
