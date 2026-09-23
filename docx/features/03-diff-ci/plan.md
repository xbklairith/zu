# 03 · diff → CI — Plan

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).
> **Depends on:** [02 · scan at a ref](../02-scan-at-ref/plan.md) (`scan.Tree`, `gitref.CommitTree`, `shape`).

**Goal:** `zu diff <base> [head]` compares the IR at the merge-base of the two refs with the IR at head, and prints the Structural Summary as text, Markdown or JSON, for a CI job to post on the MR.

**Architecture:**
- A new, pure package, `internal/diff`, turns two `*ir.IR` into a `Summary`. It computes Change Status, Moves, reversed imports and the Affected Set. It does no I/O.
- Renderers in `internal/diff/render*.go` write the three formats.
- `internal/gitref` gains merge-base.
- `-worktree` reuses feature 02's `gitref.WorktreeFiles` and `scan.ListTree`, the same file selection `zu scan` uses.
- `internal/cli/diff.go` wires them together:
  1. resolve both refs;
  2. find the merge-base, or exit 3;
  3. open the trees;
  4. scan both, fresh;
  5. check that the policy hashes match;
  6. summarise, render, and exit.

**Tech Stack:** Go 1.24 standard library; the git CLI (decision 0005); golden files under `internal/diff/testdata/`.

**Settled inputs:**
- Decisions 0003 (Move by `shape`), 0004 (policy hash) and 0009 (Affected Set).
- `docx/core/decisions.md` › Diff base, Diff head, Diff scope, Structural Summary (v1).
- Glossary: Base, Change Status, Move, Affected Set, Structural Summary.

**Out of Scope:**
- Rule violations and exit 1 (the Policy feature).
- Links (B6), the HTML/UI Change View, an IR cache, and `-C dir` or path filters.
- `go.mod` and other languages' toolchain and dependency files. They are not compared; the footer says so.

---

## Tasks

### Task 1: Compare two IRs (`internal/diff`)

**Files:**
- Create: `internal/diff/diff.go`
- Create: `internal/diff/diff_test.go`

**Steps:**

- [x] **Test**: build small `ir.IR` values inline and cover each of these:

   | Case | Expected |
   |---|---|
   | a node only in head / only in base | `added` / `removed` |
   | same id, different `hash` | `modified` |
   | same id, same `hash` | not listed (`unchanged`) |
   | an edge `(from, to, kind)` only on one side | `added` / `removed` edge; edge locations are ignored |
   | imports `a→b` removed and `b→a` added (packages) | one `reversed` entry, not two edges |
   | one removed and one added `function` with equal `shape`, different id | one Move `{from, to}`; neither appears in added/removed |
   | two removed and one added with the same `shape` | no Move (one-to-one only) |
   | equal `shape` but different `kind` | no Move |
   | equal `shape`, both package and name change | no Move |
   | equal `shape`, same package or same name (including dotted paths such as `example.com`) | Move |
   | a package whose only change is a `const` | package `modified` with 0 declaration changes |
   | `external` nodes | compared by id only (they have no hash) |

- [x] **Verify RED**: `go test ./internal/diff` → FAIL (package missing).
- [x] **Action**:

   ```go
   // Package diff compares two IRs. It is pure: no I/O, and the same input
   // always gives the same, sorted output.
   package diff

   type Status string // Change Status (glossary)

   const (
   	Added    Status = "added"
   	Removed  Status = "removed"
   	Modified Status = "modified"
   )

   type NodeChange struct {
   	ID     string      `json:"id"`
   	Kind   ir.NodeKind `json:"kind"`
   	Status Status      `json:"status"`
   }

   type EdgeChange struct {
   	From   string      `json:"from"`
   	To     string      `json:"to"`
   	Kind   ir.EdgeKind `json:"kind"`
   	Status Status      `json:"status"` // added, removed or "reversed" (imports only)
   }

   type Move struct {
   	From string      `json:"from"`
   	To   string      `json:"to"`
   	Kind ir.NodeKind `json:"kind"`
   }

   type Delta struct {
   	Nodes []NodeChange
   	Edges []EdgeChange
   	Moves []Move
   }

   func Compare(base, head *ir.IR) Delta
   ```

   Sorting:
   - nodes by id;
   - edges by (kind, from, to);
   - moves by from.

   A reversed pair is reported once, as the head direction. `Reversed` is an edge status only.
- [x] **Verify**: `go test ./internal/diff` → ok.
- [x] **Commit**: `git add internal/diff/diff.go internal/diff/diff_test.go && git commit -m "Compare two IRs"`

---

### Task 2: Affected Set

**Files:**
- Create: `internal/diff/affected.go`
- Create: `internal/diff/affected_test.go`

**Steps:**

- [x] **Test**:
   - Head has imports `api→orders→money` and `billing→money`, and `money` is modified. Expect `money:0`, `orders:1`, `billing:1`, `api:2`.
   - Changed packages are in the set at hop 0 (ADR 0009, glossary *Affected Set*: "the changed packages plus every package that imports them"; its size is the blast-radius count).
   - Cycles terminate.
   - External nodes never appear.
   - An added package's importers are included.
   - Nothing changed → an empty set.
- [x] **Verify RED**: `go test ./internal/diff -run Affected` → FAIL.
- [x] **Action**:

   ```go
   // Affected returns the Affected Set (0009): the changed packages at hop 0
   // plus the packages that transitively import one of them,
   // package over head's import edges, with their hop distance (0009).
   // changed are the package ids with status added or modified.
   func Affected(head *ir.IR, changed []string) []Hop

   type Hop struct {
   	Package string `json:"package"`
   	Hops    int    `json:"hops"`
   }
   ```

   The search is a breadth-first search over reversed `imports` edges between `package` nodes. Changed packages seed the search at hop 0. Results are sorted by (hops, package). The blast-radius count is `len(Affected(...))`.
- [x] **Verify**: `go test ./internal/diff` → ok.
- [x] **Commit**: `git add internal/diff/affected.go internal/diff/affected_test.go && git commit -m "Compute the Affected Set over imports"`

---

### Task 3: Summary model and JSON

**Files:**
- Create: `internal/diff/summary.go`
- Create: `internal/diff/summary_test.go`
- Create: `internal/diff/testdata/shop.summary.json` (golden)

**Steps:**

- [x] **Test**:
   - **Golden.** Take the base IR from `testdata/shop` and a head IR from *scanning* a modified copy of it (copy the fixture into `t.TempDir()`, edit the sources, `scan.Run`), never a hand-edited IR, so `hash` and `shape` are the scanner's. The edits: a renamed function, a new import, a modified method, a removed type, and a reversed import. `Summarize` + `WriteJSON` must equal the golden file, which the `-update` flag rewrites.
   - **Repeatability.** Running it twice gives identical bytes.
   - **No change.** Base == head gives `"changed": false` and empty lists.
- [x] **Verify RED**: `go test ./internal/diff -run Summary` → FAIL.
- [x] **Action**:

   ```go
   const SummaryVersion = "1"

   // NotCompared is printed in every format's footer (decisions: Diff scope).
   const NotCompared = "Not compared: go.mod changes (dependency versions, go and toolchain lines) and other languages' toolchain and dependency files."

   type Summary struct {
   	SummaryVersion string        `json:"summaryVersion"`
   	Base           ir.Ref        `json:"base"`
   	Head           ir.Ref        `json:"head"`
   	Changed        bool          `json:"changed"`
   	Packages       []PackageRow  `json:"packages"`       // changed packages, bottom-up (see below)
   	Imports        []EdgeChange  `json:"imports"`
   	EdgeCounts     map[string]Counts `json:"edgeCounts"` // "calls", "embeds": {added, removed}
   	Moves          []Move        `json:"moves"`
   	Affected       []Hop         `json:"affected"`
   	Nodes          []NodeChange  `json:"nodes"`          // every declaration change, for tools
   	ParseErrors    SideErrors    `json:"parseErrors"`    // {base: [...], head: [...]}
   	NotCompared    string        `json:"notCompared"`
   }

   type PackageRow struct {
   	ID       string `json:"id"`
   	Status   Status `json:"status"`
   	Added    int    `json:"added"`
   	Modified int    `json:"modified"`
   	Removed  int    `json:"removed"`
   	Hops     int    `json:"hops"` // 0 for a changed package
   }

   func Summarize(base, head *ir.IR) *Summary
   func WriteJSON(w io.Writer, s *Summary) error // two-space indent, trailing newline, empty collections as [] / {}
   ```

   - **Row order, "bottom-up" (settled: change reading order).** Sort the changed packages by the length of the longest import chain to other changed packages, fewest first (leaves first), then by id. Compute it on the condensation of head's import graph (strongly connected components as single nodes), so a cycle, which the merged build variants can create, still has a defined order: packages in one component share its rank and sort by id. Test: a two-package import cycle among changed packages. Violations would come first, but they don't exist yet.
   - **Moves** count once. Their from and to ids are left out of the added/removed counts.
- [x] **Verify**: `go test ./internal/diff` → ok.
- [x] **Commit**: `git add internal/diff/summary.go internal/diff/summary_test.go internal/diff/testdata && git commit -m "Build the Structural Summary and its JSON"`

---

### Task 4: Text and Markdown renderers, with Mermaid

**Files:**
- Create: `internal/diff/render.go`
- Create: `internal/diff/render_test.go`
- Create: `internal/diff/testdata/shop.summary.{txt,md}` (golden)

**Steps:**

- [x] **Test**:
   1. Golden text and Markdown for the Task 3 summary.
   2. The no-change summary prints `no structural change` and the footer.
   3. Mermaid includes the changed packages plus one hop of importers, marked with `classDef dim`. Mermaid node ids are generated (`n1`, `n2`, … in row order) and labels are quoted, so `/`, `.` and `"` in ids cannot break the diagram.
   4. With more than 30 nodes, the Mermaid block is replaced by `_Diagram omitted: N packages (limit 30)._`.
   5. A summary with 5,000 changed packages renders Markdown of at most 65,536 bytes, ending its lists with `…and N more`.
   6. The Markdown escapes `|` in ids.
- [x] **Verify RED**: `go test ./internal/diff -run Render` → FAIL.
- [x] **Action**:
   - `WriteText(w, s)` and `WriteMarkdown(w, s)`.
   - **Markdown layout, in order:**
     1. the title `### zu · structural change`;
     2. the line `base <12> (merge-base) → head <12>` (`worktree` when dirty);
     3. the counts line;
     4. the package table (`Package | Change | + ~ − | Hops`);
     5. the Dependencies list (`+`, `−`, `⇄ reversed`);
     6. Moves;
     7. `Affected: N packages (c changed, k at 1 hop, …)`, N = the whole Affected Set;
     8. the calls and embeds counts;
     9. the Mermaid block;
     10. the parse-error counts;
     11. the `NotCompared` footer.
   - **Size budget.** Render the sections into a buffer against a byte budget of 65,536 minus the footer's length. When a list would overflow, stop it and write `…and N more`. The table is truncated before the lists are.
- [x] **Verify**: `go test ./internal/diff` → ok.
- [x] **Commit**: `git add internal/diff/render.go internal/diff/render_test.go internal/diff/testdata && git commit -m "Render the summary as text and Markdown"`

---

### Task 5: merge-base (`internal/gitref`)

**Files:**
- Create: `internal/gitref/diff.go`
- Create: `internal/gitref/diff_test.go`

**Steps:**

- [ ] **Test**:

   | Test | Expected |
   |---|---|
   | `MergeBase` on a branch fork | the fork commit |
   | `MergeBase` when head equals base | head |
   | `MergeBase` in a `git clone --depth 1 file://…` of a two-branch repo, with the other branch fetched shallow | `ErrNoMergeBase` |
   | `MergeBase` with a criss-cross history | the same commit as `git merge-base` |

- [ ] **Verify RED**: `go test ./internal/gitref -run MergeBase` → FAIL.
- [ ] **Action**:

   ```go
   var ErrNoMergeBase = errors.New("no merge-base: the clone lacks shared history; fetch full history (e.g. actions/checkout fetch-depth: 0, or git fetch --unshallow)")

   // MergeBase is `git merge-base <a> <b>`: git's single pick, even for
   // criss-cross histories. Exit status 1 with no output → ErrNoMergeBase.
   func MergeBase(ctx context.Context, top, a, b string) (string, error)
   ```

- [ ] **Verify**: `go test -race ./internal/gitref` → ok.
- [ ] **Commit**: `git add internal/gitref/diff.go internal/gitref/diff_test.go && git commit -m "Find merge-bases"`

---

### Task 6: `scan.ListTree` for `-worktree`: done in feature 02

Feature 02 needed the same file selection for `zu scan` (its scrutinize found that a disk scan of an untracked or ignored file was labelled as the clean commit). It shipped:

- `gitref.WorktreeFiles(ctx, dir, includeIgnored) (*Listing, error)`: `Listing.Files` holds the files the next commit would contain, relative to `dir`, sorted, with deleted tracked files dropped. `Listing.Extra` is set when an untracked or ignored file lies outside pruned directories. It returns `nil, nil` outside a work tree.
- `scan.ListTree(root, files)`: `DirTree`'s file rules applied to a given list.

Nothing is left to do here.

---

### Task 7: `zu diff` CLI

**Files:**
- Create: `internal/cli/diff.go`
- Create: `internal/cli/diff_test.go`
- Modify: `internal/cli/cli.go` (dispatch `diff`; remove it from `planned`)

**Steps:**

- [ ] **Test** (temp repos, using the `needGit` helper):

   | Case | Expected |
   |---|---|
   | fork `main`, change one function on `feat`, `zu diff main` on `feat` | exit 0, Markdown on stdout with the package row, one stderr status line |
   | head defaults to HEAD: uncommitted edit, no `-worktree` | the edit is absent |
   | `-worktree` | the edit is present; the header says `worktree` |
   | `-worktree` with an untracked `.go` file / an ignored `.go` file | included / excluded |
   | `-worktree -include-ignored` | the ignored file is included |
   | `-include-ignored` without `-worktree` | exit 3 |
   | `-worktree` together with an explicit head | exit 3 |
   | a rename on `feat` | the JSON has one Move and no added/removed for it |
   | base == head | exit 0, `no structural change` |
   | shallow clone with no merge-base | exit 3, stderr contains `fetch-depth: 0` |
   | unknown ref, ref starting with `-`, outside a repo, bad `-format` | exit 3 |
   | a parse error at head, `-max-parse-errors 0` | summary still printed, exit 2 |
   | the same case with `-max-parse-errors 1` | exit 0 |
   | a parse error at base only (already on the base branch), `-max-parse-errors 0` | exit 0; the footer reports `parse errors base=1` |
   | the two IRs' `policyHash` differ (via a test seam) | exit 3, `policy changed` in stderr |
   | run from a subdirectory | output byte-identical to running at the top level |
   | Ctrl-C through `interruptContext` | exit 3, nothing on stdout |

- [ ] **Verify RED**: `go test ./internal/cli -run Diff` → FAIL.
- [ ] **Action**: `runDiff(args, stdout, stderr)`.
   1. **Flags:** `-format text|markdown|json` (default `text`), `-worktree`, `-include-ignored`, `-max-parse-errors N`. Arguments: `<base> [head]`.
   2. **Resolve:** `gitref.Resolve(".", base)` → `top` and the base commit. Resolve head with the same call (default `HEAD`).
   3. **Merge-base:** `gitref.MergeBase(top, base, head)`. On `ErrNoMergeBase`, exit 3 and print its message.
   4. **Base tree:** `gitref.OpenCommit(top, mb)`.
   5. **Head tree:** with `-worktree`, `scan.ListTree(top, l.Files)` where `l` is `gitref.WorktreeFiles(ctx, top, includeIgnored)`, labelled as `zu scan` labels it: `Ref{Commit: head, Dirty: modified || l.Extra}`. Otherwise `gitref.OpenCommit(top, head)`.
   6. **Scan:** run `scan.Run` on each tree in turn, not concurrently, so peak memory is two IRs, not two scans. Check `tree.Err()` on each.
   7. **Policy hash:** if they differ, exit 3 with `policy changed between base and head; diff uses head's policy once the Policy feature lands` (0004).
   8. **Render:** `diff.Summarize`, then render to stdout.
   9. **Status line:** `zu diff: <n> packages changed, <m> affected, parse errors base=<a> head=<b>`.
   10. **Exit:** 2 if head's parse errors exceed N, else 0. Base's parse errors are pre-existing (B7): they are reported, never fail the MR.
- [ ] **Verify**: `go test -race ./internal/cli` → ok.
- [ ] **Smoke**: `go run ./cmd/zu diff HEAD~3 -format markdown` in the zu repository → readable Markdown, exit 0.
- [ ] **Commit**: `git add internal/cli/diff.go internal/cli/diff_test.go internal/cli/cli.go && git commit -m "Add zu diff"`

---

### Task 8: Docs, memory, final check

**Files:**
- Create: `docx/features/03-diff-ci/output.md`: the documented JSON contract (`summaryVersion` "1", every field), the Markdown layout, exit codes, flags, the merge-base requirement with CI snippets *described* (not shipped), and the "not compared" list.
- Create: `docx/features/03-diff-ci/benchmarks.md`
- Modify: `scripts/bench-corpus.sh` (add `zu diff <tag~50> <tag>` on hugo and kubernetes)
- Modify: `CLAUDE.md` (layout: `internal/diff`)

**Steps:**

- [ ] **Bench**: run `scripts/bench-corpus.sh` in the background. Record the diff wall time and peak RSS. Expected: kubernetes peak RSS < 4 GB (REQ-041's budget), and it is recorded either way.
- [ ] **Full check**: `set -o pipefail; make check` → exit 0.
- [ ] **Commit**: `git add docx/features/03-diff-ci CLAUDE.md scripts/bench-corpus.sh && git commit -m "Document zu diff output and record benchmarks"`

---

## Notes

- **The head IR under `-worktree`** uses exactly `zu scan`'s file selection and dirty rule, so `zu scan` and `zu diff -worktree` agree. Its ignored files follow `-include-ignored`.
- **Trivial-body Moves (settled by steering, 2026-09-24):** a Move also needs the package or the name to stay the same. `func Stop() {}` removed from package `x` and `func Reset() {}` added to package `y` stay a removal and an addition. A minimum body size was rejected as arbitrary. See ADR 0003, Consequences.
- **Removed packages** can't be in the Affected Set: nothing at head imports them.
- **No `.zu/` writes:** `zu diff` writes only stdout and stderr. IRs stay in memory.
- **Exit 1 stays unused** until the Policy feature adds violations.

## Progress

- [x] Task 1: Compare two IRs
- [x] Task 2: Affected Set
- [x] Task 3: Summary model and JSON
- [x] Task 4: Text and Markdown renderers, with Mermaid
- [ ] Task 5: merge-base
- [x] Task 6: `scan.ListTree` (done in feature 02)
- [ ] Task 7: `zu diff` CLI
- [ ] Task 8: Docs, memory, final check

**Status:** In Progress
