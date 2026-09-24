# 08 · CRAP Metrics Overlay — Plan

**Status:** approved 2026-09-24 (scrutinized, fixed, advisor sign-off). Deviation 17's doc amendments are applied. Rulings at approval: the "match no function" count excludes package-level literals and unparsed files, and no threshold is used. In a Change View the panel says the rollup is over the drawn packages ("Worst CRAP μ+σ among drawn: N"). If Firefox reports a crash on reload, accept.mjs retries once and logs it.

**Drafted** 2026-09-24, revised after scrutiny (M1–M8 and N1–N8, with the coordinator's rulings), replayed green on 786ed2b.

**Drafted** 2026-09-24 against `main` at 786ed2b, with 07's acceptance recorded. Every diff here is against that commit. This plan uses 07's `rolledRanks` pattern (`web/src/policy.ts`), `cut.ts` `index`, the `cls` class list in `Canvas.tsx` and the `Legend` in `App.tsx`. It also uses 04's `htmlOptions.prepare`, which checks the flags before a scan.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is the plan's verification record, and it is committed with the plan. It is 07's script with one change: a step that misbehaves prints its last 10 lines, not only its last. It extracts every code block from this file and applies them to a fresh copy of `main` task by task, the way an implementer would:

- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step, `replay.py` runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. The script prints one line per step, and exits 1 if any step misbehaves. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 docx/features/08-crap-overlay/replay.py docx/features/08-crap-overlay/plan.md "$S"
```

The replay needs Go, git, `patch`, Python 3, `npm ci` (Tasks 7–11 are UI tasks), `golangci-lint` (Tasks 6 and 12) and Playwright's three browsers (Task 11). Task 11 runs the browser harness from `web/e2e`, so it needs `web/e2e/node_modules` as well as `web/node_modules`: a replay that links `node_modules` from a checkout instead of running `npm ci` must link both.

**Goal:** A7. With `-coverprofile`, colour every package and box by CRAP, as uml-viewer's metrics overlay does. Without it, draw exactly what 07 draws. decisions.md l.35 settles the inputs:

- cyclomatic complexity is computed by zu;
- coverage comes from `go test -coverprofile`;
- missing data counts as red;
- mutation score comes after v1.

**Architecture:**
- **Complexity is measured in the one parse and kept out of the IR.** Before it drops the AST (ADR 0002), `extractFile` records three things for each function declaration: its cyclomatic complexity, its span (from `func` to the closing brace), and the file name a coverprofile keys it by, which a `//line` directive in generated code can change. It also records the spans of code that no function node holds: package-level function literals and `func _` bodies. `scan.Measures` holds one span per declaration for each function node id, and every file key the scan parsed with its loose code's spans. `scan.Run` returns it in `Stats`. The IR does not change: schemaVersion stays `"1"`, and no golden changes (Deviation 1).
- **Coverage has its own reader.** `internal/cover` stream-parses a coverprofile into blocks per file key (`import/path/file.go`). The profile's paths are only map keys. zu never opens them and never writes them anywhere.
- **Export does the join and the arithmetic.** `export.AddMetrics` assigns each block to the function whose span holds its start. It computes each function's CRAP and each package's μ, max and σ, as uml-viewer's `class-crap` does, and writes `View.metrics` only for ids the View draws. It also counts the blocks that fall in a file the scan parsed but in none of its code, and the CLI reports them (Deviations 6 and 18). As in 07, Go evaluates and the page draws.
- **The page grades, rolls up and fills.** `metrics.ts` mirrors uml-viewer's `crap-band`, `crap-grade` and `rolled-crap`. `scene` gives every box, container and function a `crap` field. The canvas fills a node by its band and shows a badge with the number and the band in words; the legend and the panel explain both. The panel takes a box's CRAP from the drawn scene, so it always says what the badge says (Deviation 16).

**Tech Stack:** Go 1.24, with `go/ast` for complexity. React 19, `@xyflow/react` and `vitest`, as in 07. No new dependency.

**Source decisions:**
- decisions.md l.35 (above). requirements-draft.md:
  - A7 (l.83): "Overlay metrics onto nodes as colour when a metrics snapshot is present; degrade silently when absent";
  - the Metrics overlay section (l.165–167): "The IR references them by node id; it does not compute them. Adding a new metric source means writing a reader, not touching the parser";
  - Standalone viewing (l.208): "explicit allowlisted paths for source, policy, metrics and output".
- ADR 0002 (one parse, syntax only) and ADR 0003 (a byte-identical IR).
- uml-viewer's primary source at commit 79cc1ef:
  - `domain/config.clj`:
    - `crap-thresholds` l.3–7 (μ+σ: green 8, yellow 12, red 20);
    - `crap-band` l.19 (missing → red);
    - `along` l.48;
    - `crap-grade` l.63 (1–10, missing → 1);
    - `combined-grade` l.92 (mutation, not in v1);
    - `worse-crap` l.99;
  - `application/overlay.clj`:
    - `class-crap` l.103 (μ, max and population σ, each rounded to 0.1);
    - `apply-metrics` l.177 (no snapshot, and the document is returned unchanged);
  - `domain/hierarchy.clj`:
    - `rolled-crap` l.88 (the worst μ+σ among an id and its descendants; "a class with no CRAP data counts as red");
    - `nested-group-box` l.453;
  - `adapters/draw.clj`:
    - `grade-ramp` l.34;
    - `fill-for` l.40 (the dark fills Task 9 reuses);
    - the "C" metric dot l.195;
  - README l.479–480: "Missing CRAP or mutation data counts as red (grade 1), not unknown. Parents take the worst CRAP".
- The Go coverprofile format, as `go test -coverprofile` writes it: a first line `mode: set|count|atomic`, then `import/path/file.go:l.c,l.c statements count` per block. Measured with Go 1.24.5: a package with no test files is listed with zero counts under `./...`.

**Out of Scope:**
- The mutation score and `combined-grade` (decisions.md: after v1).
- Reading `.metrics/` snapshots, or any file the user did not name (Deviation 11).
- Metrics in the IR, in `zu check` or in `zu diff`'s printed Summary. CRAP never fails a build.
- A continuous colour ramp (Deviation 9) and the per-type (class) CRAP of a type's methods.
- Base-side coverage in a Change View (Deviation 14).
- Scoring package-level function literals (`var f = func…`), and matching a profile to a revision (Deviations 4 and 6).

---

## Deviations and decisions for review

1. **Complexity is computed by zu, but outside the IR.** requirements l.167 says the IR "does not compute" metrics, while decisions.md l.35 says zu computes complexity. Both hold if the parse measures complexity and export joins it, and nothing enters the IR:
   - `Measures` travels beside the IR in `scan.Stats`;
   - ADR 0002 holds: the count comes from `go/ast` in the one parse, and the AST is still dropped per file;
   - ADR 0003 holds: the IR is byte-identical with or without a profile. Measured on zu, `cmp` of the IR from `zu scan` with and without `-coverprofile` shows no difference, and `shop.golden.json` passes unchanged (Task 2 runs without `-update`);
   - the IR's optional `metrics?` field (requirements l.155) stays unwritten, because the View carries metrics.

   The alternative was a `cc` field on function nodes. It is deterministic, but it would put a metric into the IR against l.167, churn every golden, and change the meaning of an IR under schema `"1"`.
2. **"Degrade silently when absent" and "missing counts as red" apply at different levels.**
   - **No profile:** no `metrics` in the View, and so no fill, badge, legend entry or panel line. This is A7, and it is uml-viewer's `apply-metrics` (l.177), which returns the document unchanged when there are no snapshots.
   - **A profile is given, and none of a package's function files are in it:** the package has no `crap`, and the page draws it red with a "?" badge (`crap-band` l.19, `crap-grade` l.63, README l.479). A box holding it is red too (`rolled-crap` l.88).
   - **A single function's file is missing from the profile:** for example, a `_windows.go` variant under a macOS test run. The function has no `crap`. It is counted in `missing` and left out of the package's μ and σ, just as `class-crap` averages only the scores it has.
   - **Generated code under a `//line` directive** is keyed in the profile by the directive's file name (`gen.y:200.0`), not by the `.go` file. `extractFile` records the same name and line, since `fset.Position` applies the directive, so such code is matched. It is not reported as missing, and its package is not drawn red with "?" (Task 4 tests it). Checked with Go 1.24.5: `//line gen.y:200` above a one-line function makes `go test -coverprofile` write `lt/g/gen.y:200.0,200.1`, and `zu scan -coverprofile` reports `coverage for 1 of 1 functions` and CRAP 2.1 for it.
3. **A package with no functions is not measured.** It has no badge, no fill, and no say in a box's rollup. uml-viewer counts a class with no data as red. But a Go package of only types, constants and variables has no code to cover: zu's own `internal/version` would be drawn red for having no statements.
4. **Which function a block belongs to:** the function whose span holds the block's start. A closure counts toward its enclosing function, as its branches do in the complexity count (gocyclo's rule). Blocks in package-level function literals (`var f = func…`) and `func _` bodies belong to no function node and are in no score. The parse records their spans, so they are not counted as unmatched either (Deviation 18). A package whose code is all such literals has no functions and is not measured (Deviation 3).
5. **Duplicate blocks** come from several test binaries (`-coverpkg`) or from profiles joined end to end. A duplicate block counts as covered if any copy was hit. A repeated `mode:` line is accepted when it names the same mode; any other mode is an error.
6. **A profile's file key maps to a node by `package id + "/" + file`**, where `file` is the base name after any `//line` directive. Package ids are import paths (ADR 0003), so this works for several modules in one tree and for nested modules, without a module root or GOPATH. zu cannot tell which revision a profile comes from, so stderr reports what it can see:
   - `CRAP: coverage for N of M functions`: files the profile lacks.
   - `CRAP: K profile blocks match no function: profile may be from another revision`, printed when K > 0. K counts the blocks, in files the scan parsed, that start in none of their code (Deviation 18). A profile of another revision moves blocks out of that code. On profiles that do match, K is 0 on zu and on hugo (Task 12).
   - `CRAP: the working tree has uncommitted changes; if go test ran on them, drop -ref` (`zu scan -ref`), or `… add -worktree` (`zu diff`, whose head is the HEAD commit unless `-worktree`). `go test` runs the working tree, while these read a commit. The check is `gitref.Head`'s dirty flag.
   Matching the profile to the tree is still the user's job; zu never rejects a profile for this.
7. **One id with several declarations** (build variants, repeated `init`) keeps a span for each, and each span keeps its own complexity:
   - a function's complexity is the highest among the declarations whose files the profile has, so a linux body's branches never score a darwin run's coverage. Without coverage data, it is the highest of all;
   - statements add up across every declaration the profile has.
8. **Formulas:**
   - a function's CRAP is `cc²·(1−cov)³ + cc` (crap4clj's formula), with `cov` as statement coverage. A function with no statements has `cov = 1`;
   - a package has μ, max and population σ over its functions' CRAP, each rounded to 0.1 (`class-crap`);
   - a box takes the worst μ+σ below it (`rolled-crap`);
   - the grade is 1–10 via `along` with stops 8/12/20 → 10/5.5/1;
   - Go may fuse `a*b + c` into one FMA instruction on arm64. An explicit `float64(…)` around each product rounds it first, so every machine writes the same View.
9. **Three bands, not a ramp, and a test for their colours.** uml-viewer interpolates a fill from the grade (`grade-ramp` l.34, `fill-for` l.40). zu fills by `crap-band` instead: three CSS classes. `styles.test.ts` (Task 9) reads their colours from the tokens in `styles.css` and checks them in light and dark:
   - **Text** in `--fg`, `--muted`, added, modified or moved stays at least 4.5:1 on every fill (lowest: 4.51 light, 4.62 dark).
   - **Borders and outlines** in `--pin` and `--accent` stay at least 3:1, which applies to non-text marks (lowest: 3.59 light, 4.67 dark).
   - `--removed` **text** never sits on a fill: a removed node has no metrics (Deviation 14).
   - **The fills differ from each other** by a ΔE76 of at least 10 for normal, deuteranopic and protanopic vision (Machado et al. 2009, severity 1), in both modes. The lowest pair is 12.6 in light and 10.4 in dark.

   The first draft's light fills (#e3f4e8 green, #fdebe7 red) were only 1.6 apart for deuteranopes. The light fills are now darker and more saturated: #c8f8c4, #f0e49c and #ffdcdc. The dark ones stay near `fill-for`'s RGB: #173b2c, #3e3814 and #3b1d11.

   The badge names the band in words (`low`, `mid` or `high`) after the number, so colour is never the only sign. The grade is in the badge's tooltip and in the panel.
10. **Each mark has its own channel, so all of them show at once:**
    - CRAP: the fill, plus a badge with μ+σ (or "?") and its band word, so colour is never the only signal (as U9 requires of change marks). The badge sits at the lower right of a box or declaration. On a container it sits in the header, left of the toggle, because a child box can fill the container's lower right; the label stops short of it. Task 11 checks that no container's badge meets a box inside it;
    - change marks: the border, text colour and outline (04);
    - a hidden violation: the red border (07);
    - the rank badge: the upper left (07);
    - the toggle: the upper right.

    Task 11 checks that a modified package in a Change View carries both `crap-red` and `st-modified`.
11. **The CLI surface is `-coverprofile file` on `zu scan` and `zu diff`, and only with `-html`:**
    - The name matches `go test`'s flag.
    - Coverage belongs to one machine and one test run, so it never enters the IR, which is why the flag needs `-html`.
    - It is an explicit path, not a `.metrics/` convention (requirements l.29): Standalone viewing (l.208) asks for "explicit allowlisted paths for … metrics", and zu reads no file the user did not name.
    - `prepare()` parses the profile before the scan, so a bad profile exits 3 before a scan that can take minutes, as 04's `-include` does.
12. **Safety:**
    - The profile path is user input, like `-out`, and may be anywhere. The rule that paths must resolve inside the root, and 06's `ReadSmall`/symlink hardening, protect paths that the repository supplies (such as `zu.policy.yaml`), not paths that the user names.
    - It must be a regular file, so a FIFO or device cannot hang zu. `os.Stat` checks the path before it is opened, since opening a FIFO blocks until something writes to it (as `scan/tree.go`'s `readMax` checks before it opens). Task 5 tests a FIFO, on Unix only.
    - Errors name the path once: `-coverprofile <path>: no such file or directory`.
    - `ReadSmall`'s 1 MiB cap would refuse real profiles, so the parser streams instead: at most 64 KiB per line, with memory proportional to the number of blocks. A malformed line exits 3 with its line number.
    - The profile's content is data: its file keys are only compared with package ids. It is never opened, and its paths are never written. Only per-id numbers for ids the View already draws reach the page (Task 5 tests that the profile's name does not appear).
13. **The profile is read before the scan.** A bad profile is a bad invocation (exit 3) and leaves no `.zu` behind.
14. **A Change View measures head only.** A profile describes the tree that ran the tests, which is head or the working tree. Base's coverage is not what the change is asking about, and a removed node has no metrics.
15. **Task 9 tests its colours, not its components.** `styles.test.ts` checks the fills (Deviation 9). The badge and the class names only render scene state that Task 8 tests, and Task 11's harness checks them in three engines (07's Deviation 13). That covers the badges, the fills as computed styles, and where the badges sit.
16. **The panel says what the badge says.** A Change View draws the changed subgraph (U10), but the panel reads the whole View for its facts. So a box's CRAP rollup in the panel is the drawn scene's own (`SceneNode.crap`), just as 07's rank badges roll up over the drawn View. A box's badge describes what is drawn, and the panel repeats it. "Show full project" redraws both. The alternative, rolling up over the whole View, would make a green changed box turn red because of packages the page does not show. Tasks 10 and 11 test it.
17. **Doc amendments, applied at approval.** They are not task steps.
    - `decisions.md`, "Metrics overlay (A7)":
      - complexity is measured in the parse and carried in `scan.Stats`, not in the IR;
      - the IR's `metrics?` stays unwritten, and CRAP lives in the View;
      - the input is an explicit `-coverprofile file` that needs `-html`;
      - a Change View shows head's coverage only.
    - `requirements-draft.md`:
      - the IR contract's `metrics?` row (l.155): amended, the measures live beside the IR and the numbers in the View;
      - l.146 ("the IR is the only thing the renderer reads"): the View's `metrics` is an exception;
      - l.167 ("not touching the parser"): complexity comes from the parser's one pass.
    - `glossary.md`: entries for CRAP, μ+σ (risk), band, and missing (no coverage data).
18. **K is precise: a block counts only if it is in a file zu parsed and outside every function span and every loose-code span** (package-level function literals and `func _` bodies, recorded in the one parse); blocks in files zu did not parse (Policy exclude, `//go:build ignore`, other packages) are not counted. Tasks 1, 2, 4 and 5 test it.

---

## The contract

**View** (schema `"1"`). `metrics` is optional and absent without `-coverprofile`, so every golden from 04 to 07 is unchanged:

```json
{
  "metrics": {
    "packages": {
      "zu/internal/cli": {"funcs": 28, "crap": {"mu": 8.4, "max": 35.8, "sigma": 8.8}},
      "example.com/m/b": {"funcs": 1, "missing": 1}
    },
    "funcs": {
      "example.com/m/a.F": {"cc": 1, "stmts": 1, "covered": 1, "crap": 1},
      "example.com/m/b.H": {"cc": 2, "stmts": 0, "covered": 0}
    }
  }
}
```

- `packages`: every drawn package with at least one function or method. `missing` counts the functions whose files the profile lacks. `crap` is absent when all of them are missing, which the page draws as red.
- `funcs`: every drawn function or method node (the declarations of `-include`d packages and of a Change View's changed packages). `crap` is absent when the function has no coverage data.
- Numbers are rounded to 0.1. Sums run in sorted id order, and Go writes map keys sorted, so the View is byte-identical for the same commit, Policy and profile (Task 12 measured this).

**CLI:** `zu scan [dir] … -html file -coverprofile profile` and `zu diff base [head] … -html file -coverprofile profile`.
- Without `-html`: exit 3, `-coverprofile needs -html`.
- An unreadable, non-regular or malformed profile: exit 3, `-coverprofile <path>: …`, before scanning. A FIFO is refused without being opened.
- On success, stderr gains (with `zu diff` in place of `zu scan` for a diff):
  - `zu scan: CRAP: coverage for N of M functions`, always;
  - `zu scan: CRAP: K profile blocks match no function: profile may be from another revision` (or `1 profile block matches…`), when K > 0;
  - `zu scan: CRAP: the working tree has uncommitted changes; if go test ran on them, drop -ref`, when `-ref` is given and the tree is dirty. `zu diff` prints `… add -worktree` when head is the HEAD commit (no `-worktree`) and the tree is dirty.
- None of these change the exit code (Deviation 6).

**Page:**
- A measured box, container or function node gets `crap-green`, `crap-yellow` or `crap-red` as its fill. A badge shows μ+σ (a function's own CRAP), or "?" for no coverage data, then the band word: `6 low`, `10 mid`, `35 high`, `? high`. The badge's title gives the grade. It sits at the lower right of a box or declaration, and in a container's header (Deviation 10).
- The legend adds "CRAP μ+σ ≤ 8 low", "≤ 12 mid" and "> 12 high · ? no coverage data" when any drawn node is measured.
- The panel shows:
  - for a package: its μ, max, σ, μ+σ and grade, how many functions lack data, and its five highest-CRAP drawn functions as links;
  - for a box: its worst μ+σ over the boxes drawn inside it, the same number as its badge (Deviation 16);
  - for a function: its complexity, coverage and CRAP.

---

# Tasks

### Task 1: Complexity and span per function, in the one parse

`extractFile` already walks every `*ast.FuncDecl` once and drops the AST after hashing. Before the drop, it now records the function's cyclomatic complexity and its span, and the file name the span is in after any `//line` directive (Deviation 2). `loose` records the spans of package-level function literals and `func _` bodies, whose blocks belong to no function node (Deviation 18). Complexity follows gocyclo's rule: 1, plus one for each `if`, `for`, `range`, non-default `case` or comm clause, `&&` and `||`, with closures included. A type declaration gets neither.

**Files:**
- Create: `internal/scan/measure.go`, `internal/scan/measure_test.go`
- Modify: `internal/scan/extract.go`

**Steps:**

- [x] **Write the failing test**

<!-- file: internal/scan/measure_test.go -->
```go
package scan

import (
	"reflect"
	"testing"
)

func TestExtractComplexityAndSpan(t *testing.T) {
	src := `package p

type T struct{}

// Plain has no branches.
func Plain() {}

func (T) Branchy(xs []int, c chan int) int {
	n := 0
	for _, x := range xs {
		if x > 0 && x < 10 || x == 42 {
			n++
		}
	}
	for i := 0; i < 3; i++ {
	}
	switch n {
	case 1, 2:
	case 3:
	default:
	}
	select {
	case <-c:
	default:
	}
	f := func() {
		if n > 0 {
		}
	}
	f()
	return n
}

//line gen.y:200
func Gen() {}
`
	f := extractOne(t, src)
	if f.Err != nil {
		t.Fatal(f.Err)
	}
	type m struct {
		Name       string
		CC         int
		File       string
		Start, End Pos
	}
	var got []m
	for _, d := range f.Decls {
		got = append(got, m{d.Name, d.CC, d.File, d.Start, d.End})
	}
	// T is a type: no complexity, no span. Branchy: 1 + range + if + && + ||
	// + for + two non-default cases + one non-default comm clause + the
	// closure's if = 10. Gen is where its //line directive says, as go test
	// -coverprofile keys it: gen.y, line 200, columns unknown (0).
	want := []m{
		{"T", 0, "", Pos{}, Pos{}},
		{"Plain", 1, "f.go", Pos{6, 1}, Pos{6, 16}},
		{"Branchy", 10, "f.go", Pos{8, 1}, Pos{32, 2}},
		{"Gen", 1, "gen.y", Pos{200, 0}, Pos{200, 0}},
	}
	if len(got) != len(want) {
		t.Fatalf("decls = %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("decl %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// A coverprofile also covers code that no function node holds: the function
// literals of package-level vars, and func _ bodies. Their spans let export
// tell such blocks from blocks that a profile of another revision moved.
func TestExtractLooseCode(t *testing.T) {
	f := extractOne(t, `package p

var hook = func() {
	if true {
	}
}

var (
	a, b   = 1, func() int { return 2 }
	nested = func() func() { return func() {} }
)

func _() { _ = 0 }

func F() { _ = func() {} }

//line gen.y:10
var gen = func() {}
`)
	if f.Err != nil {
		t.Fatal(f.Err)
	}
	// F's literal is inside F's span, and nested's inner one inside nested's.
	want := []Span{
		{"p/f.go", "f.go", 0, Pos{3, 12}, Pos{6, 2}},
		{"p/f.go", "f.go", 0, Pos{9, 14}, Pos{9, 37}},
		{"p/f.go", "f.go", 0, Pos{10, 11}, Pos{10, 45}},
		{"p/f.go", "f.go", 0, Pos{13, 1}, Pos{13, 19}},
		{"p/f.go", "gen.y", 0, Pos{10, 0}, Pos{10, 0}},
	}
	if !reflect.DeepEqual(f.Loose, want) {
		t.Fatalf("Loose =\n%+v\nwant\n%+v", f.Loose, want)
	}
}
```

- [x] **Run:** `go test ./internal/scan -run 'TestExtract(ComplexityAndSpan|LooseCode)'` Expected: FAIL (`undefined: Pos`)

- [x] **Implement**

```diff
--- a/internal/scan/extract.go
+++ b/internal/scan/extract.go
@@ -28,6 +28,7 @@ type fileFacts struct {
 	Imports     []importFact
 	Calls       []callSite
 	Embeds      []embedSite
+	Loose       []Span // 08: code no function node holds (see loose)
 }
 
 // declFact is one type, function or method declaration. Ids are formed
@@ -41,6 +42,10 @@ type declFact struct {
 	Hash     string
 	Shape    string // Hash with the name and receiver type blanked
 	Line     int
+	CC       int               // functions only (08): cyclomatic complexity
+	File     string            // functions only (08): the file name a coverprofile keys it by
+	Start    Pos               // functions only (08): func keyword
+	End      Pos               // functions only (08): just past the closing brace
 	node     ast.Node          // released once hashed
 	doc      *ast.CommentGroup // enclosing declaration's doc, for its directives
 }
@@ -102,8 +107,16 @@ func extractFile(t Tree, rel string) *fileFacts {
 			}
 		}
 	}
+	for _, decl := range file.Decls {
+		f.Loose = append(f.Loose, loose(fset, rel, decl)...)
+	}
 	for i := range f.Decls {
 		d := &f.Decls[i]
+		if fn, ok := d.node.(*ast.FuncDecl); ok {
+			d.CC = complexity(fn)
+			d.File, d.Start = position(fset, fn.Pos())
+			_, d.End = position(fset, fn.End())
+		}
 		d.Hash, d.Shape = hashDecl(d.node, []string{d.Name, d.Recv}, d.doc)
 		d.node, d.doc = nil, nil
 	}
```

<!-- file: internal/scan/measure.go -->
```go
package scan

import (
	"go/ast"
	"go/token"
	"path/filepath"
)

// Pos is a line and a byte column, both 1-based, as go/token and
// go test -coverprofile write them; the column is 0 where a //line
// directive leaves it unknown.
type Pos struct{ Line, Col int }

// Span is one declaration of a function: the file it is in, the name a
// coverprofile keys that file by, its complexity, and the source it covers
// from func to its closing brace.
type Span struct {
	Path       string // slash path relative to the root
	File       string // base name after any //line directive
	CC         int    // cyclomatic complexity
	Start, End Pos
}

// Measure is what the scan measures of one function or method node (08).
// A node declared in several files (build variants, repeated init) has a
// span for each.
type Measure struct {
	Pkg   string // the package id
	Spans []Span // sorted by path, then start
}

// Measures maps a function or method node id to its Measure. They are not
// part of the IR: the IR carries no metrics (requirements, Metrics overlay),
// and export joins them with a coverage profile.
type Measures map[string]Measure

// complexity is gocyclo's cyclomatic complexity: 1, plus one per if, for,
// range, non-default case or comm clause, && and ||, closures included.
func complexity(fn *ast.FuncDecl) int {
	cc := 1
	ast.Inspect(fn, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.IfStmt, *ast.ForStmt, *ast.RangeStmt:
			cc++
		case *ast.CaseClause:
			if x.List != nil {
				cc++
			}
		case *ast.CommClause:
			if x.Comm != nil {
				cc++
			}
		case *ast.BinaryExpr:
			if x.Op == token.LAND || x.Op == token.LOR {
				cc++
			}
		}
		return true
	})
	return cc
}

// loose is the code in decl that a coverprofile covers but no function node
// holds: the function literals of a package-level var (a literal nested in
// one is inside its span), and the body of a func _.
func loose(fset *token.FileSet, rel string, decl ast.Decl) []Span {
	var out []Span
	add := func(n ast.Node) {
		s := Span{Path: rel}
		s.File, s.Start = position(fset, n.Pos())
		_, s.End = position(fset, n.End())
		out = append(out, s)
	}
	switch d := decl.(type) {
	case *ast.FuncDecl:
		if d.Name.Name == "_" {
			add(d)
		}
	case *ast.GenDecl:
		ast.Inspect(d, func(n ast.Node) bool {
			if _, ok := n.(*ast.FuncLit); ok {
				add(n)
				return false
			}
			return true
		})
	}
	return out
}

// position is where p is as go test -coverprofile writes it: after any
// //line directive, which names another file and line (generated code) and
// leaves the column unknown, 0. The file is its base name.
func position(fset *token.FileSet, p token.Pos) (string, Pos) {
	at := fset.Position(p)
	return filepath.Base(at.Filename), Pos{at.Line, at.Column}
}
```

- [x] **Run:** `go test ./internal/scan` Expected: PASS
- [x] **Commit:** `Measure each function's complexity and span in the one parse`

### Task 2: `scan.Measures` beside the IR

`assemble` collects the declarations of each function id, one span each with its own complexity (Deviation 7), and returns them as `Measures.Funcs`. `Measures.Files` keys every file the scan parsed as a profile keys it (package id + `/` + file name after `//line`) and holds its loose code's spans; a build-ignored file is absent. `Run` puts `Measures` in `Stats`. Nothing is added to the IR. The green run is the whole package without `-update`, so `TestScanGolden` proves that `shop.golden.json` is unchanged.

**Files:**
- Modify: `internal/scan/build.go`, `internal/scan/measure.go`, `internal/scan/scan.go`, `internal/scan/measure_test.go`, `internal/scan/resolve_test.go` (its helper follows `assemble`'s new signature)

**Steps:**

- [x] **Write the failing test**

```diff
--- a/internal/scan/measure_test.go
+++ b/internal/scan/measure_test.go
@@ -114,3 +114,39 @@ var gen = func() {}
 		t.Fatalf("Loose =\n%+v\nwant\n%+v", f.Loose, want)
 	}
 }
+
+func TestRunMeasuresFunctions(t *testing.T) {
+	root := tree(t, map[string]string{
+		"go.mod":       "module example.com/m\n",
+		"p/a_linux.go": "//go:build linux\n\npackage p\n\nfunc F(x int) {\n\tif x > 0 {\n\t}\n}\n",
+		"p/a_other.go": "//go:build !linux\n\npackage p\n\nfunc F(x int) {}\n",
+		"p/t.go":       "package p\n\ntype T struct{}\n\nfunc (T) M() {}\n",
+		"p/v.go":       "package p\n\nvar V = func() {}\n\n//line gen.y:10\nfunc G() {}\n",
+		"p/x.go":       "//go:build ignore\n\npackage p\n\nvar X = func() {}\n",
+	})
+	_, stats := run(t, root, 1)
+	// Each build variant keeps its own complexity: coverage from a darwin
+	// run must not be scored with the linux body's branches. Files holds
+	// every file key the scan parsed, gen.y included and x.go not, with the
+	// spans of code no function node holds.
+	want := Measures{
+		Funcs: map[string]Measure{
+			"example.com/m/p.F": {Pkg: "example.com/m/p", Spans: []Span{
+				{"p/a_linux.go", "a_linux.go", 2, Pos{5, 1}, Pos{8, 2}},
+				{"p/a_other.go", "a_other.go", 1, Pos{5, 1}, Pos{5, 17}},
+			}},
+			"example.com/m/p.G":   {Pkg: "example.com/m/p", Spans: []Span{{"p/v.go", "gen.y", 1, Pos{10, 0}, Pos{10, 0}}}},
+			"example.com/m/p.T.M": {Pkg: "example.com/m/p", Spans: []Span{{"p/t.go", "t.go", 1, Pos{5, 1}, Pos{5, 16}}}},
+		},
+		Files: map[string][]Span{
+			"example.com/m/p/a_linux.go": nil,
+			"example.com/m/p/a_other.go": nil,
+			"example.com/m/p/gen.y":      nil,
+			"example.com/m/p/t.go":       nil,
+			"example.com/m/p/v.go":       {{"p/v.go", "v.go", 0, Pos{3, 9}, Pos{3, 18}}},
+		},
+	}
+	if !reflect.DeepEqual(stats.Measures, want) {
+		t.Fatalf("Measures =\n%+v\nwant\n%+v", stats.Measures, want)
+	}
+}
```

- [x] **Run:** `go test ./internal/scan -run TestRunMeasuresFunctions` Expected: FAIL (`stats.Measures undefined`)

- [x] **Implement**

```diff
--- a/internal/scan/build.go
+++ b/internal/scan/build.go
@@ -33,8 +33,9 @@ type edgeID struct {
 	Kind     ir.EdgeKind
 }
 
-// assemble turns per-file facts into an IR (unsorted; ir.Encode sorts).
-func assemble(w *walkResult, facts []*fileFacts) *ir.IR {
+// assemble turns per-file facts into an IR (unsorted; ir.Encode sorts) and
+// the Measures of its function and method nodes.
+func assemble(w *walkResult, facts []*fileFacts) (*ir.IR, Measures) {
 	b := &builder{
 		ix: buildIndex(w, facts),
 		doc: &ir.IR{
@@ -53,6 +54,7 @@ func assemble(w *walkResult, facts []*fileFacts) *ir.IR {
 			b.doc.ParseErrors = append(b.doc.ParseErrors, *f.Err)
 		}
 	}
+	ms := Measures{Funcs: map[string]Measure{}, Files: map[string][]Span{}}
 	for _, f := range facts {
 		if f.Skip || f.Err != nil {
 			continue
@@ -69,10 +71,14 @@ func assemble(w *walkResult, facts []*fileFacts) *ir.IR {
 		names := b.imports(p, f)
 		b.calls(p, f, names)
 		b.embeds(p, f, names)
+		files(ms.Files, p.ID, f)
 	}
 	dropped := b.dropCollisions()
 	for id, ds := range b.decls {
 		b.nodes[id] = mergeDecls(id, ds[0].Pkg, ds)
+		if ds[0].Kind == ir.KindFunction {
+			ms.Funcs[id] = measure(ds)
+		}
 	}
 	for _, p := range b.ix.pkgs {
 		b.nodes[p.ID].Hash = b.packageHash(p)
@@ -85,7 +91,36 @@ func assemble(w *walkResult, facts []*fileFacts) *ir.IR {
 			b.doc.Edges = append(b.doc.Edges, *e)
 		}
 	}
-	return b.doc
+	return b.doc, ms
+}
+
+// measure merges the declarations of one function node, which mergeDecls
+// has sorted by location: a span for each.
+func measure(ds []declAt) Measure {
+	m := Measure{Pkg: ds[0].Pkg}
+	for _, d := range ds {
+		m.Spans = append(m.Spans, Span{Path: d.Loc.Path, File: d.File, CC: d.CC, Start: d.Start, End: d.End})
+	}
+	return m
+}
+
+// files records the file keys f gives a coverprofile (its own name, and
+// any that its //line directives name) with its loose code's spans.
+func files(into map[string][]Span, pkg string, f *fileFacts) {
+	parsed := func(file string) {
+		if _, ok := into[pkg+"/"+file]; !ok {
+			into[pkg+"/"+file] = nil
+		}
+	}
+	parsed(path.Base(f.Path))
+	for _, d := range f.Decls {
+		if d.File != "" {
+			parsed(d.File)
+		}
+	}
+	for _, s := range f.Loose {
+		into[pkg+"/"+s.File] = append(into[pkg+"/"+s.File], s)
+	}
 }
 
 // dropCollisions removes every declaration id that is also a package id, or
```

```diff
--- a/internal/scan/measure.go
+++ b/internal/scan/measure.go
@@ -29,10 +29,17 @@ type Measure struct {
 	Spans []Span // sorted by path, then start
 }
 
-// Measures maps a function or method node id to its Measure. They are not
-// part of the IR: the IR carries no metrics (requirements, Metrics overlay),
-// and export joins them with a coverage profile.
-type Measures map[string]Measure
+// Measures are what the scan measures for a coverage profile (08). They are
+// not part of the IR: the IR carries no metrics (requirements, Metrics
+// overlay), and export joins them with a profile.
+type Measures struct {
+	// Funcs maps a function or method node id to its Measure.
+	Funcs map[string]Measure
+	// Files maps every file the scan parsed, by the key a profile gives it
+	// (package id + "/" + file name after //line), to the spans in it of
+	// code no function node holds (see loose).
+	Files map[string][]Span
+}
 
 // complexity is gocyclo's cyclomatic complexity: 1, plus one per if, for,
 // range, non-default case or comm clause, && and ||, closures included.
```

```diff
--- a/internal/scan/resolve_test.go
+++ b/internal/scan/resolve_test.go
@@ -20,7 +20,7 @@ func scanTree(t *testing.T, files map[string]string) *ir.IR {
 	for i, f := range w.Files {
 		facts[i] = extractFile(d, f)
 	}
-	doc := assemble(w, facts)
+	doc, _ := assemble(w, facts)
 	ir.Sort(doc)
 	return doc
 }
```

```diff
--- a/internal/scan/scan.go
+++ b/internal/scan/scan.go
@@ -26,12 +26,14 @@ type Options struct {
 	PolicyHash string
 }
 
-// Stats summarise a scan for the one-line report.
+// Stats summarise a scan for the one-line report, and carry what the scan
+// measured but the IR does not hold (08).
 type Stats struct {
 	Packages        int
 	Files           int // Go files parsed, excluding build-ignored ones
 	ParseErrors     int
 	UnresolvedCalls int
+	Measures        Measures
 }
 
 // Run scans opts.Tree. The result is unsorted; ir.Encode canonicalises it.
@@ -46,11 +48,11 @@ func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
 	if err != nil {
 		return nil, Stats{}, err
 	}
-	doc := assemble(w, facts)
+	doc, ms := assemble(w, facts)
 	doc.Grouping = "tree"
 	doc.PolicyHash = cmp.Or(opts.PolicyHash, DefaultPolicyHash)
 
-	st := Stats{ParseErrors: len(doc.ParseErrors)}
+	st := Stats{ParseErrors: len(doc.ParseErrors), Measures: ms}
 	for _, n := range doc.Nodes {
 		if n.Kind == ir.KindPackage {
 			st.Packages++
```

- [x] **Run:** `go test ./... ` Expected: PASS (goldens unchanged)
- [x] **Commit:** `Carry function measures out of the scan beside the IR`

### Task 3: `internal/cover` reads a coverprofile

The parser streams the profile, keeps each block once (Deviation 5), sorts each file's blocks by start, and reports the first bad line by number. It quotes at most 20 bytes of a bad mode. A CRLF profile already parses, since `bufio.ScanLines` drops the CR; the test keeps that true.

**Files:**
- Create: `internal/cover/cover.go`, `internal/cover/cover_test.go`

**Steps:**

- [x] **Write the failing test**

<!-- file: internal/cover/cover_test.go -->
```go
package cover

import (
	"reflect"
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	// Two test binaries covering one file (-coverpkg) repeat its blocks; a
	// block counts as covered when any repeat of it ran. Code under a
	// //line directive is keyed by the directive's file, column 0.
	in := `mode: set
ex.com/m/b/b.go:3.14,3.26 1 0
ex.com/m/g/gen.y:200.0,201.0 2 1
ex.com/m/a/a.go:7.2,7.10 1 0
ex.com/m/a/a.go:3.19,4.11 1 1
ex.com/m/a/a.go:4.11,6.3 1 0
mode: set
ex.com/m/a/a.go:4.11,6.3 1 1
`
	p, err := Parse(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	want := Profile{
		"ex.com/m/a/a.go": {
			{Start: Pos{3, 19}, End: Pos{4, 11}, Stmts: 1, Hit: true},
			{Start: Pos{4, 11}, End: Pos{6, 3}, Stmts: 1, Hit: true},
			{Start: Pos{7, 2}, End: Pos{7, 10}, Stmts: 1},
		},
		"ex.com/m/b/b.go":  {{Start: Pos{3, 14}, End: Pos{3, 26}, Stmts: 1}},
		"ex.com/m/g/gen.y": {{Start: Pos{200, 0}, End: Pos{201, 0}, Stmts: 2, Hit: true}},
	}
	if !reflect.DeepEqual(p, want) {
		t.Fatalf("Parse =\n%+v\nwant\n%+v", p, want)
	}
	// A profile saved with Windows line endings reads the same.
	crlf, err := Parse(strings.NewReader(strings.ReplaceAll(in, "\n", "\r\n")))
	if err != nil || !reflect.DeepEqual(crlf, want) {
		t.Errorf("CRLF: Parse = %+v, %v", crlf, err)
	}
}

func TestParseRejects(t *testing.T) {
	long := "mode: set\nm/a.go:1.1,1.2 1 " + strings.Repeat("1", 70<<10) + "\n"
	cases := map[string]string{
		"":                                 "line 1: not a coverprofile: want mode: set, count or atomic",
		"hello\n":                          "line 1: not a coverprofile: want mode: set, count or atomic",
		"mode: set\nm/a.go:1.1,1.2 1\n":    "line 2: want file:line.col,line.col statements count",
		"mode: set\nm/a.go 1 1\n":          "line 2: want file:line.col,line.col statements count",
		"mode: set\nm/a.go:1.1,1.x 1 1\n":  "line 2: want file:line.col,line.col statements count",
		"mode: set\nm/a.go:1.1,1.2 -1 1\n": "line 2: want file:line.col,line.col statements count",
		"mode: set\nmode: count\n":         `line 2: mode "count" after mode set`,
		"mode: set\nmode: " + strings.Repeat("x", 100): `line 2: mode "xxxxxxxxxxxxxxxxxxxx" after mode set`,
		long:                                "line 2: longer than 64 KiB",
		"mode: set\nm/a.go:1.1,1.2 1 1\n\n": "line 3: want file:line.col,line.col statements count",
	}
	for in, want := range cases {
		_, err := Parse(strings.NewReader(in))
		if err == nil || err.Error() != want {
			t.Errorf("Parse(%.40q) = %v, want %q", in, err, want)
		}
	}
}
```

- [x] **Run:** `go test ./internal/cover` Expected: FAIL (`undefined: Parse`)

- [x] **Implement**

<!-- file: internal/cover/cover.go -->
```go
// Package cover reads the profile go test -coverprofile writes (08). The
// profile is data: its file keys are matched against package ids and never
// opened, and only per-function numbers derived from it leave zu.
package cover

import (
	"bufio"
	"cmp"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"
)

// maxLine bounds one profile line; a real one is under 200 bytes.
const maxLine = 64 << 10

// Pos is a line and a byte column, both 1-based; the column is 0 in code
// under a //line directive.
type Pos struct{ Line, Col int }

// Block is one statement block: its range, its statement count, and whether
// any test run executed it.
type Block struct {
	Start, End Pos
	Stmts      int
	Hit        bool
}

// Profile maps a file key, the package import path plus "/" plus the file
// name, to its blocks sorted by start. A block repeated by several test
// binaries appears once, hit when any repeat was.
type Profile map[string][]Block

// Parse reads a coverprofile of any mode, with either line ending. It keeps
// no line longer than 64 KiB and reports the first malformed line by number.
func Parse(r io.Reader) (Profile, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 4096), maxLine)
	type key struct {
		file       string
		start, end Pos
	}
	seen := map[key]int{} // → index in p[file]
	p := Profile{}
	mode := ""
	n := 0
	for sc.Scan() {
		n++
		line := sc.Text()
		if m, ok := strings.CutPrefix(line, "mode: "); ok {
			switch {
			case n == 1 && (m == "set" || m == "count" || m == "atomic"):
				mode = m
				continue
			case n > 1 && m == mode:
				continue // profiles joined end to end
			case n > 1:
				return nil, fmt.Errorf("line %d: mode %.20q after mode %s", n, m, mode) // at most 20 runes of it
			}
		}
		if n == 1 {
			return nil, errors.New("line 1: not a coverprofile: want mode: set, count or atomic")
		}
		file, b, ok := parseBlock(line)
		if !ok {
			return nil, fmt.Errorf("line %d: want file:line.col,line.col statements count", n)
		}
		k := key{file, b.Start, b.End}
		if i, dup := seen[k]; dup {
			p[file][i].Hit = p[file][i].Hit || b.Hit
			continue
		}
		seen[k] = len(p[file])
		p[file] = append(p[file], b)
	}
	if err := sc.Err(); errors.Is(err, bufio.ErrTooLong) {
		return nil, fmt.Errorf("line %d: longer than 64 KiB", n+1)
	} else if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, errors.New("line 1: not a coverprofile: want mode: set, count or atomic")
	}
	for _, bs := range p {
		slices.SortFunc(bs, func(a, b Block) int { return cmpPos(a.Start, b.Start) })
	}
	return p, nil
}

// parseBlock parses "file:l.c,l.c stmts count".
func parseBlock(line string) (string, Block, bool) {
	f := strings.Fields(line)
	if len(f) != 3 {
		return "", Block{}, false
	}
	at := strings.LastIndexByte(f[0], ':')
	if at <= 0 {
		return "", Block{}, false
	}
	from, to, ok := strings.Cut(f[0][at+1:], ",")
	if !ok {
		return "", Block{}, false
	}
	var b Block
	var count int
	ok = parsePos(from, &b.Start) && parsePos(to, &b.End) &&
		parseCount(f[1], &b.Stmts) && parseCount(f[2], &count)
	b.Hit = count > 0
	return f[0][:at], b, ok
}

func parsePos(s string, p *Pos) bool {
	l, c, ok := strings.Cut(s, ".")
	return ok && parseCount(l, &p.Line) && parseCount(c, &p.Col)
}

func parseCount(s string, n *int) bool {
	v, err := strconv.Atoi(s)
	*n = v
	return err == nil && v >= 0
}

func cmpPos(a, b Pos) int { return cmp.Or(cmp.Compare(a.Line, b.Line), cmp.Compare(a.Col, b.Col)) }
```

- [x] **Run:** `go test ./internal/cover` Expected: PASS
- [x] **Commit:** `Parse go test coverprofiles`

### Task 4: `export.AddMetrics` joins measures and coverage into the View

A binary search finds each span's first block. Only ids the View draws are written. Packages the Policy omits (`m/d` in the test) are dropped, and the profile's paths never reach the View. `AddMetrics` returns how many of the profile's blocks, in files the scan parsed, start in no function span and no loose-code span (Deviation 18).

**Files:**
- Create: `internal/export/metrics.go`, `internal/export/metrics_test.go`
- Modify: `internal/export/view.go`

**Steps:**

- [ ] **Write the failing test**

<!-- file: internal/export/metrics_test.go -->
```go
package export

import (
	"encoding/json"
	"testing"

	"zu/internal/cover"
	"zu/internal/scan"
)

func span(file string, cc, from, to int) scan.Span {
	return scan.Span{Path: "x/" + file, File: file, CC: cc, Start: scan.Pos{Line: from, Col: 1}, End: scan.Pos{Line: to, Col: 2}}
}

func TestAddMetrics(t *testing.T) {
	v := &View{Nodes: []Node{
		{ID: "m/a", Kind: "package"}, {ID: "m/a.F", Kind: "function"},
		{ID: "m/b", Kind: "package"}, {ID: "m/c", Kind: "package"}, {ID: "m/c.V", Kind: "function"},
		{ID: "m/g", Kind: "package"},
	}}
	gen := scan.Span{Path: "g/gen.go", File: "gen.y", CC: 2, Start: scan.Pos{Line: 200}, End: scan.Pos{Line: 205}}
	lit := scan.Span{Path: "a/a.go", File: "a.go", Start: scan.Pos{Line: 13, Col: 9}, End: scan.Pos{Line: 15, Col: 2}}
	funcs := map[string]scan.Measure{
		"m/a.F": {Pkg: "m/a", Spans: []scan.Span{span("a.go", 3, 3, 9)}},
		"m/a.G": {Pkg: "m/a", Spans: []scan.Span{span("a.go", 1, 11, 11)}}, // no statements: covered
		"m/b.H": {Pkg: "m/b", Spans: []scan.Span{span("b.go", 2, 3, 5)}},   // b.go is not in the profile
		// A build variant scores with the complexity of the body that ran:
		// v_linux.go is not in the profile, so its 5 does not count.
		"m/c.V": {Pkg: "m/c", Spans: []scan.Span{span("v_linux.go", 5, 3, 9), span("v_other.go", 1, 3, 4)}},
		"m/d.I": {Pkg: "m/d", Spans: []scan.Span{span("d.go", 9, 3, 5)}}, // m/d is not drawn (omitted)
		// Generated under //line gen.y:200: the profile keys it by gen.y.
		"m/g.Gen": {Pkg: "m/g", Spans: []scan.Span{gen}},
	}
	// The files the scan parsed; a.go has a package-level var f = func…
	parsed := map[string][]scan.Span{
		"m/a/a.go": {lit}, "m/b/b.go": nil, "m/c/v_linux.go": nil, "m/c/v_other.go": nil,
		"m/d/d.go": nil, "m/g/gen.go": nil, "m/g/gen.y": nil,
	}
	ms := scan.Measures{Funcs: funcs, Files: parsed}
	prof := cover.Profile{
		"m/a/a.go": {
			{Start: cover.Pos{Line: 3, Col: 20}, End: cover.Pos{Line: 4, Col: 9}, Stmts: 1, Hit: true},
			{Start: cover.Pos{Line: 4, Col: 9}, End: cover.Pos{Line: 6, Col: 3}, Stmts: 2},
			{Start: cover.Pos{Line: 13, Col: 20}, End: cover.Pos{Line: 14, Col: 9}, Stmts: 5}, // in the literal
			{Start: cover.Pos{Line: 20, Col: 1}, End: cover.Pos{Line: 20, Col: 9}, Stmts: 1},  // outside all code
		},
		"m/a/new.go":     {{Start: cover.Pos{Line: 3, Col: 1}, End: cover.Pos{Line: 3, Col: 9}, Stmts: 1}}, // a file the scan did not parse
		"m/c/v_other.go": {{Start: cover.Pos{Line: 3, Col: 9}, End: cover.Pos{Line: 4, Col: 1}, Stmts: 1}},
		"m/d/d.go":       {{Start: cover.Pos{Line: 3, Col: 9}, End: cover.Pos{Line: 5, Col: 2}, Stmts: 1}},
		"m/g/gen.y": {
			{Start: cover.Pos{Line: 200}, End: cover.Pos{Line: 201}, Stmts: 1, Hit: true},
			{Start: cover.Pos{Line: 201}, End: cover.Pos{Line: 203}, Stmts: 1, Hit: true},
		},
		"other/x/x.go": {{Start: cover.Pos{Line: 1, Col: 1}, End: cover.Pos{Line: 1, Col: 9}, Stmts: 1}}, // not a scanned package
	}
	unmatched := AddMetrics(v, ms, prof)
	got, _ := json.Marshal(v.Metrics)
	// F: coverage 1/3, CRAP = 3²·(2/3)³ + 3 = 5.67. G: CRAP 1. m/a over
	// {5.67, 1}: μ 3.33, max 5.67, σ 2.33 (population, as class-crap).
	// V: cc 1, uncovered, CRAP 1² + 1 = 2. Gen: covered, CRAP 2.
	want := `{"packages":{"m/a":{"funcs":2,"crap":{"mu":3.3,"max":5.7,"sigma":2.3}},"m/b":{"funcs":1,"missing":1},` +
		`"m/c":{"funcs":1,"crap":{"mu":2,"max":2,"sigma":0}},"m/g":{"funcs":1,"crap":{"mu":2,"max":2,"sigma":0}}},` +
		`"funcs":{"m/a.F":{"cc":3,"stmts":3,"covered":1,"crap":5.7},"m/c.V":{"cc":1,"stmts":1,"covered":0,"crap":2}}}`
	if string(got) != want {
		t.Fatalf("Metrics =\n%s\nwant\n%s", got, want)
	}
	// Only a.go line 20 lies in a parsed file but in no function or
	// literal: what a profile of another revision looks like. new.go and
	// other/x are files the scan did not parse (excluded, build-ignored or
	// elsewhere), so they say nothing about this tree.
	if unmatched != 1 {
		t.Errorf("unmatched = %d, want 1", unmatched)
	}
}

func TestAddMetricsMissingFunctionCRAP(t *testing.T) {
	v := &View{Nodes: []Node{{ID: "m/b", Kind: "package"}, {ID: "m/b.H", Kind: "function"}}}
	ms := scan.Measures{Funcs: map[string]scan.Measure{"m/b.H": {Pkg: "m/b", Spans: []scan.Span{span("b.go", 2, 3, 5), span("b_linux.go", 4, 3, 5)}}}}
	AddMetrics(v, ms, cover.Profile{})
	got, _ := json.Marshal(v.Metrics.Funcs)
	if want := `{"m/b.H":{"cc":4,"stmts":0,"covered":0}}`; string(got) != want {
		t.Fatalf("Funcs = %s, want %s: no crap is no coverage data, and cc the highest variant's", got, want)
	}
}
```

- [ ] **Run:** `go test ./internal/export -run TestAddMetrics` Expected: FAIL (`v.Metrics undefined`)

- [ ] **Implement**

<!-- file: internal/export/metrics.go -->
```go
package export

import (
	"math"
	"slices"
	"sort"

	"zu/internal/cover"
	"zu/internal/scan"
)

// Metrics is the CRAP overlay (08): per drawn package the CRAP of its
// functions and methods, and per drawn function its own numbers.
type Metrics struct {
	Packages map[string]PackageMetrics `json:"packages"`
	Funcs    map[string]FuncMetrics    `json:"funcs"`
}

// PackageMetrics summarises a package's functions and methods. CRAP is
// absent when the profile has none of their files: the page draws that as
// the worst (decisions.md, "missing data counts as red").
type PackageMetrics struct {
	Funcs   int       `json:"funcs"`
	Missing int       `json:"missing,omitempty"` // functions whose files the profile lacks
	CRAP    *CRAPStat `json:"crap,omitempty"`
}

// CRAPStat is μ, max and population σ over function CRAP scores, each
// rounded to 0.1, as uml-viewer's class-crap (overlay.clj l.103).
type CRAPStat struct {
	Mu    float64 `json:"mu"`
	Max   float64 `json:"max"`
	Sigma float64 `json:"sigma"`
}

// FuncMetrics is one function: complexity (of the variants the profile
// has, the highest), statements and covered statements, and CRAP rounded
// to 0.1, absent when the profile lacks its files.
type FuncMetrics struct {
	CC      int      `json:"cc"`
	Stmts   int      `json:"stmts"`
	Covered int      `json:"covered"`
	CRAP    *float64 `json:"crap,omitempty"`
}

// AddMetrics joins the scan's measures with a coverprofile into v.Metrics.
// Only ids v draws are written; the profile's paths never are. It returns
// how many of the profile's blocks lie in a file the scan parsed but in none
// of its code: a profile of another revision has them, a matching one none.
func AddMetrics(v *View, ms scan.Measures, prof cover.Profile) (unmatched int) {
	drawn := map[string]bool{}
	for _, n := range v.Nodes {
		drawn[n.ID] = true
	}
	m := &Metrics{Packages: map[string]PackageMetrics{}, Funcs: map[string]FuncMetrics{}}
	scores := map[string][]float64{}
	ids := make([]string, 0, len(ms.Funcs))
	for id := range ms.Funcs {
		ids = append(ids, id)
	}
	slices.Sort(ids) // sums in a fixed order: the same View every run
	for _, id := range ids {
		me := ms.Funcs[id]
		if !drawn[me.Pkg] {
			continue
		}
		fm, crap, ok := funcMetrics(me, prof)
		pm := m.Packages[me.Pkg]
		pm.Funcs++
		if ok {
			scores[me.Pkg] = append(scores[me.Pkg], crap)
		} else {
			pm.Missing++
		}
		m.Packages[me.Pkg] = pm
		if drawn[id] {
			m.Funcs[id] = fm
		}
	}
	for pkg, xs := range scores {
		pm := m.Packages[pkg]
		pm.CRAP = stat(xs)
		m.Packages[pkg] = pm
	}
	v.Metrics = m
	return unmatchedBlocks(ms, prof)
}

// funcMetrics counts the statements of the blocks that start inside the
// function's spans. A function with no statements is fully covered. Its
// complexity is the highest among the spans the profile has, so a variant
// that did not run does not score the one that did. It reports false when
// the profile has none of the function's files.
func funcMetrics(me scan.Measure, prof cover.Profile) (FuncMetrics, float64, bool) {
	var fm FuncMetrics
	found := false
	for _, s := range me.Spans {
		blocks, ok := prof[me.Pkg+"/"+s.File]
		if !ok {
			continue
		}
		found = true
		fm.CC = max(fm.CC, s.CC)
		i, end := within(blocks, s)
		for ; i < end; i++ {
			fm.Stmts += blocks[i].Stmts
			if blocks[i].Hit {
				fm.Covered += blocks[i].Stmts
			}
		}
	}
	if !found {
		for _, s := range me.Spans {
			fm.CC = max(fm.CC, s.CC)
		}
		return fm, 0, false
	}
	cov := 1.0
	if fm.Stmts > 0 {
		cov = float64(fm.Covered) / float64(fm.Stmts)
	}
	crap := CRAP(fm.CC, cov)
	r := round1(crap)
	fm.CRAP = &r
	return fm, crap, true
}

// within is the range of blocks, sorted by start, that start inside s.
func within(blocks []cover.Block, s scan.Span) (int, int) {
	from := cover.Pos{Line: s.Start.Line, Col: s.Start.Col}
	to := cover.Pos{Line: s.End.Line, Col: s.End.Col}
	i := sort.Search(len(blocks), func(i int) bool { return !before(blocks[i].Start, from) })
	end := i
	for end < len(blocks) && !before(to, blocks[end].Start) {
		end++
	}
	return i, end
}

// unmatchedBlocks counts the blocks, in files the scan parsed, that start
// inside no function and no loose code (package-level literals, func _):
// what a profile of another revision has moved. Files the scan did not
// parse (Policy exclude, //go:build ignore, other packages) are not counted.
func unmatchedBlocks(ms scan.Measures, prof cover.Profile) int {
	spans := map[string][]scan.Span{} // file key → code spans in it
	for key, loose := range ms.Files {
		spans[key] = append(spans[key], loose...)
	}
	for _, me := range ms.Funcs {
		for _, s := range me.Spans {
			k := me.Pkg + "/" + s.File
			spans[k] = append(spans[k], s)
		}
	}
	n := 0
	for key, blocks := range prof {
		if _, parsed := ms.Files[key]; !parsed {
			continue
		}
		in := make([]bool, len(blocks))
		for _, s := range spans[key] {
			i, end := within(blocks, s)
			for ; i < end; i++ {
				in[i] = true
			}
		}
		for _, ok := range in {
			if !ok {
				n++
			}
		}
	}
	return n
}

// CRAP is cc²·(1−cov)³ + cc (Savoia and Evans; crap4clj's formula).
// The explicit conversion rounds the product, so no platform fuses it
// into the sum (FMA) and every machine writes the same View.
func CRAP(cc int, cov float64) float64 {
	c := float64(cc)
	return float64(c*c*math.Pow(1-cov, 3)) + c
}

func stat(xs []float64) *CRAPStat {
	var sum, top float64
	for _, x := range xs {
		sum += x
		top = max(top, x)
	}
	mu := sum / float64(len(xs))
	var sq float64
	for _, x := range xs {
		d := x - mu
		sq += float64(d * d) // no FMA, as in CRAP
	}
	return &CRAPStat{Mu: round1(mu), Max: round1(top), Sigma: round1(math.Sqrt(sq / float64(len(xs))))}
}

func round1(x float64) float64 { return math.Round(x*10) / 10 }

func before(a, b cover.Pos) bool { return a.Line < b.Line || a.Line == b.Line && a.Col < b.Col }
```

```diff
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -31,6 +31,8 @@ type View struct {
 	// Violations is the Change View's new, fixed and known violations (07),
 	// from the whole Summary zu diff printed.
 	Violations *diff.ViolationDelta `json:"violations,omitempty"`
+	// Metrics is the CRAP overlay (08), only when zu was given a coverprofile.
+	Metrics *Metrics `json:"metrics,omitempty"`
 }
 
 // Node is an IR node reduced to what a view draws.
```

- [ ] **Run:** `go test ./internal/export` Expected: PASS
- [ ] **Commit:** `Join function measures and coverage into the View's CRAP metrics`

### Task 5: `zu scan -html … -coverprofile file`

`prepare()` checks the flag and reads the profile before the scan (Deviations 11–13). `writeHTML` takes the scan's `Measures`, and `addMetrics` writes them into the View and prints the coverage line and, when there are any, the count of blocks that match no function. With `-ref`, `warnUncommitted` asks `gitHead` whether the tree is dirty (Deviation 6).

**Files:**
- Create: `internal/cli/crap_test.go`, `internal/cli/crap_fifo_test.go` (`//go:build unix`: `syscall.Mkfifo` exists only there)
- Modify: `internal/cli/html.go`, `internal/cli/scan.go`

**Steps:**

- [ ] **Write the failing test**

<!-- file: internal/cli/crap_fifo_test.go -->
```go
//go:build unix

package cli

import (
	"bytes"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Opening a FIFO for reading blocks until something writes to it, so zu
// must refuse it before it opens it.
func TestScanCoverprofileRefusesAFIFO(t *testing.T) {
	withUI(t)
	fifo := filepath.Join(t.TempDir(), "cover.out")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Skipf("mkfifo: %v", err)
	}
	dir := repo(t, small)
	done := make(chan string, 1)
	go func() {
		var stderr bytes.Buffer
		Run([]string{"scan", dir, "-html", "x.html", "-coverprofile", fifo}, &bytes.Buffer{}, &stderr)
		done <- stderr.String()
	}()
	select {
	case got := <-done:
		if !strings.Contains(got, "not a regular file") {
			t.Errorf("stderr = %q", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("zu blocked opening a FIFO")
	}
}
```

<!-- file: internal/cli/crap_test.go -->
```go
package cli

import (
	"bytes"
	"maps"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// profileFor writes a coverprofile that runs F's one statement.
func profileFor(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "private-name.out")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

const smallProfile = "mode: set\nexample.com/m/a/a.go:3.10,3.17 1 1\n"

func TestScanHTMLDrawsCRAP(t *testing.T) {
	withUI(t)
	dir, out := repo(t, small), filepath.Join(t.TempDir(), "out.html")
	prof := profileFor(t, smallProfile)
	var stderr bytes.Buffer
	args := []string{"scan", dir, "-html", out, "-include", "./a", "-coverprofile", prof}
	if code := Run(args, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	s := readFile(t, out)
	want := `"metrics":{"packages":{"example.com/m/a":{"funcs":2,"crap":{"mu":1,"max":1,"sigma":0}}},` +
		`"funcs":{"example.com/m/a.F":{"cc":1,"stmts":1,"covered":1,"crap":1},"example.com/m/a.G":{"cc":1,"stmts":0,"covered":0,"crap":1}}}`
	if !strings.Contains(s, want) {
		t.Errorf("html lacks %s", want)
	}
	if strings.Contains(s, "private-name") {
		t.Error("the profile's path reached the page")
	}
	if !strings.Contains(stderr.String(), "zu scan: CRAP: coverage for 2 of 2 functions\n") ||
		strings.Contains(stderr.String(), "no function") || strings.Contains(stderr.String(), "uncommitted") {
		t.Errorf("stderr = %q", stderr.String())
	}
}

// A profile of another revision puts blocks where this tree has no code;
// zu cannot match revisions, so it says how many. A package-level literal
// is code, and a file the scan did not parse says nothing about the tree.
func TestScanCRAPReportsBlocksOutsideEveryFunction(t *testing.T) {
	withUI(t)
	files := maps.Clone(small)
	files["a/v.go"] = "package a\n\nvar V = func() int { return 1 }\n"
	dir, out := repo(t, files), filepath.Join(t.TempDir(), "out.html")
	prof := profileFor(t, smallProfile+"example.com/m/a/v.go:3.20,3.32 1 1\n"+
		"example.com/m/a/a.go:1.1,1.10 1 1\nexample.com/m/a/gone.go:3.1,3.9 2 0\n")
	var stderr bytes.Buffer
	if code := Run([]string{"scan", dir, "-html", out, "-coverprofile", prof}, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	if want := "zu scan: CRAP: 1 profile block matches no function: profile may be from another revision\n"; !strings.Contains(stderr.String(), want) {
		t.Errorf("stderr = %q, want %q", stderr.String(), want)
	}
}

// go test runs the working tree; -ref reads a commit. With uncommitted
// changes the two differ, and the profile's lines may not match the commit's.
func TestScanRefCRAPWarnsOfUncommittedChanges(t *testing.T) {
	withUI(t)
	needGit(t)
	dir, out := repo(t, small), filepath.Join(t.TempDir(), "out.html")
	git(t, dir, "init", "-q")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "one")
	writeFile(t, dir, "a/a.go", "package a\n\n// F runs G.\nfunc F() { G() }\n\nfunc G() {}\n")
	prof := profileFor(t, "mode: set\nexample.com/m/a/a.go:4.10,4.17 1 1\n") // go test on the working tree
	const want = "zu scan: CRAP: the working tree has uncommitted changes; if go test ran on them, drop -ref\n"
	for _, ref := range []bool{true, false} {
		args := []string{"scan", dir, "-html", out, "-coverprofile", prof, "-out", "-"}
		if ref {
			args = append(args, "-ref", "HEAD")
		}
		var stderr bytes.Buffer
		if code := Run(args, &bytes.Buffer{}, &stderr); code != ExitOK {
			t.Fatalf("%v: exit %d: %s", args, code, stderr.String())
		}
		if got := strings.Contains(stderr.String(), want); got != ref {
			t.Errorf("-ref %v: warned %v, stderr %q", ref, got, stderr.String())
		}
		// The commit has a blank line where the working tree has F's block.
		if got := strings.Contains(stderr.String(), "1 profile block matches no function"); got != ref {
			t.Errorf("-ref %v: unmatched block reported %v, stderr %q", ref, got, stderr.String())
		}
	}
}

func TestScanHTMLWithoutAProfileDrawsNoCRAP(t *testing.T) {
	withUI(t)
	dir, out := repo(t, small), filepath.Join(t.TempDir(), "out.html")
	if code := Run([]string{"scan", dir, "-html", out}, &bytes.Buffer{}, &bytes.Buffer{}); code != ExitOK {
		t.Fatalf("exit %d", code)
	}
	if strings.Contains(readFile(t, out), `"metrics"`) {
		t.Error("no profile, no overlay (A7: degrade silently)")
	}
}

func TestScanCoverprofileBadInvocationExitsBeforeScanning(t *testing.T) {
	withUI(t)
	good := profileFor(t, smallProfile)
	for args, want := range map[string]string{
		"-coverprofile " + good:                                           "-coverprofile needs -html",
		"-html x.html -coverprofile " + good + ".nosuch":                  "-coverprofile " + good + ".nosuch: no such file",
		"-html x.html -coverprofile " + t.TempDir():                       "not a regular file",
		"-html x.html -coverprofile " + profileFor(t, "x\n"):              "line 1: not a coverprofile",
		"-html x.html -coverprofile " + profileFor(t, "mode: set\nm 1\n"): "line 2:",
	} {
		dir := repo(t, small)
		var stderr bytes.Buffer
		if code := Run(append([]string{"scan", dir}, strings.Fields(args)...), &bytes.Buffer{}, &stderr); code != ExitBadInvocation {
			t.Errorf("%s: exit %d, want %d", args, code, ExitBadInvocation)
		}
		if !strings.Contains(stderr.String(), want) {
			t.Errorf("%s: stderr %q lacks %q", args, stderr.String(), want)
		}
		noZu(t, dir)
	}
}
```

- [ ] **Run:** `go test ./internal/cli -run 'CRAP|Coverprofile'` Expected: FAIL (`flag provided but not defined: -coverprofile`)

- [ ] **Implement**

```diff
--- a/internal/cli/html.go
+++ b/internal/cli/html.go
@@ -7,8 +7,10 @@ import (
 	"fmt"
 	"io"
 	"io/fs"
+	"os"
 	"strings"
 
+	"zu/internal/cover"
 	"zu/internal/diff"
 	"zu/internal/export"
 	"zu/internal/gitref"
@@ -36,7 +38,9 @@ type htmlOptions struct {
 	path     string
 	include  listFlag
 	linkTmpl string
-	tmpl     []byte // the UI page, loaded by prepare
+	cover    string        // -coverprofile (08)
+	tmpl     []byte        // the UI page, loaded by prepare
+	profile  cover.Profile // read by prepare; nil without -coverprofile
 }
 
 // prepare checks everything that does not need the IR, so a bad invocation
@@ -47,6 +51,9 @@ func (o *htmlOptions) prepare() error {
 		if len(o.include) > 0 || o.linkTmpl != "" {
 			return errors.New("-include and -link-template need -html")
 		}
+		if o.cover != "" {
+			return errors.New("-coverprofile needs -html")
+		}
 		return nil
 	case o.path == "-":
 		return errors.New("-html needs a file path")
@@ -64,9 +71,80 @@ func (o *htmlOptions) prepare() error {
 		return fmt.Errorf("html: %w", err)
 	}
 	o.tmpl = tmpl
+	if o.cover != "" {
+		if o.profile, err = readProfile(o.cover); err != nil {
+			return fmt.Errorf("-coverprofile %s: %w", o.cover, err)
+		}
+	}
 	return nil
 }
 
+// readProfile reads the coverprofile the user named. Like -out it may be
+// anywhere. It must be a regular file, checked before it is opened: opening
+// a FIFO blocks until something writes to it, and a device never ends.
+func readProfile(name string) (cover.Profile, error) {
+	fi, err := os.Stat(name)
+	if err != nil {
+		return nil, pathless(err)
+	}
+	if !fi.Mode().IsRegular() {
+		return nil, errors.New("not a regular file")
+	}
+	f, err := os.Open(name)
+	if err != nil {
+		return nil, pathless(err)
+	}
+	defer f.Close()
+	if fi, err = f.Stat(); err != nil {
+		return nil, err
+	}
+	if !fi.Mode().IsRegular() { // replaced since the Stat
+		return nil, errors.New("not a regular file")
+	}
+	return cover.Parse(f)
+}
+
+// pathless drops the path from an *fs.PathError: the message names it once.
+func pathless(err error) error {
+	var pe *fs.PathError
+	if errors.As(err, &pe) {
+		return pe.Err
+	}
+	return err
+}
+
+// addMetrics draws CRAP when prepare read a profile, and says how much of
+// the scan it covers: a profile from another tree covers little, and one
+// from another revision puts blocks where no function is.
+func addMetrics(cmd string, v *export.View, ms scan.Measures, o *htmlOptions, stderr io.Writer) {
+	if o.profile == nil {
+		return
+	}
+	unmatched := export.AddMetrics(v, ms, o.profile)
+	funcs, missing := 0, 0
+	for _, p := range v.Metrics.Packages {
+		funcs, missing = funcs+p.Funcs, missing+p.Missing
+	}
+	fmt.Fprintf(stderr, "zu %s: CRAP: coverage for %d of %d functions\n", cmd, funcs-missing, funcs)
+	switch {
+	case unmatched == 1:
+		fmt.Fprintf(stderr, "zu %s: CRAP: 1 profile block matches no function: profile may be from another revision\n", cmd)
+	case unmatched > 1:
+		fmt.Fprintf(stderr, "zu %s: CRAP: %d profile blocks match no function: profile may be from another revision\n", cmd, unmatched)
+	}
+}
+
+// warnUncommitted says when the profile is matched to a commit while the
+// working tree, where go test runs, has uncommitted changes.
+func warnUncommitted(ctx context.Context, cmd, top, fix string, o *htmlOptions, stderr io.Writer) {
+	if o.profile == nil {
+		return
+	}
+	if _, dirty := gitHead(ctx, top); dirty {
+		fmt.Fprintf(stderr, "zu %s: CRAP: the working tree has uncommitted changes; if go test ran on them, %s\n", cmd, fix)
+	}
+}
+
 func builtTemplate() ([]byte, error) {
 	assets, err := web.Assets()
 	if err != nil {
@@ -82,7 +160,7 @@ func builtTemplate() ([]byte, error) {
 // writeHTML writes the Project View export of doc (already sorted by
 // ir.Encode) as the Policy draws it, reading source through the tree the
 // scan read.
-func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, o *htmlOptions, stderr io.Writer) error {
+func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, stderr io.Writer) error {
 	root := export.RootModule(doc)
 	pats := make([]export.Pattern, 0, len(o.include))
 	for _, s := range o.include {
@@ -97,6 +175,10 @@ func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy,
 		return err
 	}
 	export.Mark(v, pol, doc)
+	addMetrics("scan", v, ms, o, stderr)
+	if src.ref != nil {
+		warnUncommitted(ctx, "scan", src.root, "drop -ref", o, stderr)
+	}
 	v.Tool = version.Version
 	prefix := "" // a -ref scan runs at the repository top
 	if src.ref == nil {
```

```diff
--- a/internal/cli/scan.go
+++ b/internal/cli/scan.go
@@ -34,7 +34,8 @@ var (
 
 // runScan implements `zu scan [dir] [-ref commit | -include-ignored]
 // [-out -|path] [-max-parse-errors N] [-html file [-include pattern]…
-// [-link-template url]]`. Flags may come before or after dir.
+// [-link-template url] [-coverprofile file]]`. Flags may come before or
+// after dir.
 func runScan(args []string, stdout, stderr io.Writer) int {
 	fs := flag.NewFlagSet("zu scan", flag.ContinueOnError)
 	fs.SetOutput(stderr)
@@ -46,6 +47,7 @@ func runScan(args []string, stdout, stderr io.Writer) int {
 	fs.StringVar(&hopts.path, "html", "", "also write a self-contained HTML Project View to `file`")
 	fs.Var(&hopts.include, "include", "with -html, inline declarations and source of packages matching `pattern` (repeatable; ./ = root module; not -include-ignored)")
 	fs.StringVar(&hopts.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
+	fs.StringVar(&hopts.cover, "coverprofile", "", "with -html, colour packages by CRAP from `file`, written by go test -coverprofile over this tree")
 	dir, err := parseWithDir(fs, args)
 	if err != nil {
 		if !errors.Is(err, flag.ErrHelp) {
@@ -112,7 +114,7 @@ func runScan(args []string, stdout, stderr io.Writer) int {
 		return ExitBadInvocation
 	}
 	if hopts.path != "" {
-		if err := writeHTML(ctx, src, doc, pol, &hopts, stderr); err != nil {
+		if err := writeHTML(ctx, src, doc, pol, stats.Measures, &hopts, stderr); err != nil {
 			fmt.Fprintf(stderr, "zu scan: html: %v\n", err)
 			return ExitBadInvocation
 		}
```

- [ ] **Run:** `go test ./internal/cli` Expected: PASS
- [ ] **Commit:** `Add -coverprofile to zu scan -html`

### Task 6: `zu diff -html … -coverprofile file`, head only

`runDiff` kept head's `Stats` as `_`. It now passes `Measures` through `changeSides` (Deviation 14). When head is a commit, not `-worktree`, `writeChangeHTML` warns of a dirty tree.

**Files:**
- Modify: `internal/cli/crap_test.go`, `internal/cli/diff.go`, `internal/cli/html.go`

**Steps:**

- [ ] **Write the failing test**

```diff
--- a/internal/cli/crap_test.go
+++ b/internal/cli/crap_test.go
@@ -127,3 +127,58 @@ func TestScanCoverprofileBadInvocationExitsBeforeScanning(t *testing.T) {
 		noZu(t, dir)
 	}
 }
+
+func TestDiffHTMLDrawsHeadsCRAP(t *testing.T) {
+	withUI(t)
+	diffRepo(t)
+	out := filepath.Join(t.TempDir(), "change.html")
+	prof := profileFor(t, "mode: set\nexample.com/m/a/a.go:3.14,3.26 1 1\n")
+	code, _, errOut := run("diff", "main", "-html", out, "-coverprofile", prof)
+	if code != ExitOK {
+		t.Fatalf("exit %d: %s", code, errOut)
+	}
+	s := readFile(t, out)
+	want := `"metrics":{"packages":{"example.com/m/a":{"funcs":2,"crap":{"mu":1,"max":1,"sigma":0}},` +
+		`"example.com/m/b":{"funcs":1,"missing":1}}`
+	if !strings.Contains(s, want) {
+		t.Errorf("html lacks %s", want)
+	}
+	if !strings.Contains(errOut, "zu diff: CRAP: coverage for 2 of 3 functions\n") {
+		t.Errorf("stderr = %q", errOut)
+	}
+	if strings.Contains(errOut, "uncommitted") {
+		t.Errorf("a clean tree: stderr = %q", errOut)
+	}
+	if code, _, errOut := run("diff", "main", "-coverprofile", prof); code != ExitBadInvocation ||
+		!strings.Contains(errOut, "-coverprofile needs -html") {
+		t.Errorf("without -html: exit %d, stderr %q", code, errOut)
+	}
+}
+
+// zu diff's head is the HEAD commit unless -worktree, while go test runs
+// the working tree: with uncommitted changes, say how to match them.
+func TestDiffHTMLCRAPWarnsOfUncommittedChanges(t *testing.T) {
+	withUI(t)
+	dir := diffRepo(t)
+	writeFile(t, dir, "a/a.go", "package a\n\n// F is two.\nfunc F() int { return 2 }\n\nfunc G() {}\n")
+	out := filepath.Join(t.TempDir(), "change.html")
+	prof := profileFor(t, "mode: set\nexample.com/m/a/a.go:4.14,4.26 1 1\n")
+	const want = "zu diff: CRAP: the working tree has uncommitted changes; if go test ran on them, add -worktree\n"
+	for _, worktree := range []bool{false, true} {
+		args := []string{"diff", "main", "-html", out, "-coverprofile", prof}
+		if worktree {
+			args = append(args, "-worktree")
+		}
+		code, _, errOut := run(args...)
+		if code != ExitOK {
+			t.Fatalf("%v: exit %d: %s", args, code, errOut)
+		}
+		if got := strings.Contains(errOut, want); got == worktree {
+			t.Errorf("-worktree %v: warned %v, stderr %q", worktree, got, errOut)
+		}
+		// HEAD has a blank line where the working tree has F's block.
+		if got := strings.Contains(errOut, "1 profile block matches no function"); got == worktree {
+			t.Errorf("-worktree %v: unmatched block reported %v, stderr %q", worktree, got, errOut)
+		}
+	}
+}
```

- [ ] **Run:** `go test ./internal/cli -run 'TestDiffHTML.*CRAP'` Expected: FAIL (`flag provided but not defined: -coverprofile`)

- [ ] **Implement**

```diff
--- a/internal/cli/diff.go
+++ b/internal/cli/diff.go
@@ -29,8 +29,9 @@ func loadPolicy(tree scan.Tree) (*policy.Policy, error) {
 
 // runDiff implements `zu diff <base> [head] [-format text|markdown|json]
 // [-worktree [-include-ignored]] [-max-parse-errors N] [-html file
-// [-link-template T]]`: the Structural Summary of head against the
-// merge-base of base and head, and optionally the Change View export.
+// [-link-template T] [-coverprofile file]]`: the Structural Summary of head
+// against the merge-base of base and head, and optionally the Change View
+// export.
 // Exit 2 when head fails to parse, else 1 when the change adds violations
 // of the Policy's rules, else 0.
 func runDiff(args []string, stdout, stderr io.Writer) int {
@@ -44,6 +45,7 @@ func runDiff(args []string, stdout, stderr io.Writer) int {
 	fs.StringVar(&hopts.path, "html", "", "also write a self-contained HTML Change View to `file`")
 	fs.StringVar(&hopts.linkTmpl, "link-template", "", "with -html, link source to `url` with {commit}, {path} and {line}")
 	fs.Var(&hopts.include, "include", "not accepted: the change decides what -html inlines")
+	fs.StringVar(&hopts.cover, "coverprofile", "", "with -html, colour head's packages by CRAP from `file`, written by go test -coverprofile over head")
 	refs, err := parsePositional(fs, args)
 	bad := func(format string, a ...any) int {
 		fmt.Fprintf(stderr, "zu diff: "+format+"\n", a...)
@@ -100,7 +102,7 @@ func runDiff(args []string, stdout, stderr io.Writer) int {
 		return bad("head: %v", err)
 	}
 	defer head.close()
-	headDoc, pol, _, err := scanSource(ctx, head)
+	headDoc, pol, headStats, err := scanSource(ctx, head)
 	if err != nil {
 		return bad("head: %v", err)
 	}
@@ -145,7 +147,7 @@ func runDiff(args []string, stdout, stderr io.Writer) int {
 	fmt.Fprintf(stderr, "zu diff: %d packages changed, %d affected, parse errors base=%d head=%d\n",
 		len(s.Packages), len(s.Affected), len(baseDoc.ParseErrors), len(headDoc.ParseErrors))
 	if hopts.path != "" {
-		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree, pol: pol}
+		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree, pol: pol, measures: headStats.Measures}
 		if err := writeChangeHTML(ctx, c, s, &hopts, stderr); err != nil {
 			return bad("html: %v", err)
 		}
```

```diff
--- a/internal/cli/html.go
+++ b/internal/cli/html.go
@@ -196,6 +196,7 @@ type changeSides struct {
 	base, head         *ir.IR
 	baseTree, headTree scan.Tree
 	pol                *policy.Policy // head's, which the hash check proved is base's
+	measures           scan.Measures  // head's (08)
 }
 
 // writeChangeHTML writes the Change View export of base → head. Links point at
@@ -214,6 +215,10 @@ func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *h
 		return err
 	}
 	export.Mark(v, c.pol, c.head)
+	addMetrics("diff", v, c.measures, o, stderr)
+	if _, commit := c.headTree.(*gitref.CommitTree); commit {
+		warnUncommitted(ctx, "diff", c.top, "add -worktree", o, stderr)
+	}
 	v.Violations = violations
 	for _, t := range []scan.Tree{c.baseTree, c.headTree} {
 		if ct, ok := t.(*gitref.CommitTree); ok && ct.Err() != nil {
```

- [ ] **Run:** `test -z "$(gofmt -l cmd internal)" && go vet ./... && go test ./... && golangci-lint run ./...` Expected: PASS
- [ ] **Commit:** `Add -coverprofile to zu diff -html for head's CRAP`

### Task 7: `metrics.ts`: the grade, the band and the rollup

This is uml-viewer's `crap-grade`, `crap-band` and `rolled-crap`, cached per View like 07's `rolledRanks`. `data.ts` gains the `metrics` type.

**Files:**
- Create: `web/src/metrics.ts`, `web/src/metrics.test.ts`
- Modify: `web/src/data.ts`

**Steps:**

- [ ] **Write the failing test**

<!-- file: web/src/metrics.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import { crapBand, crapGrade, crapLabel, rolledCrap } from "./metrics";
import { pkgs, view } from "./testkit";

// m/a/x μ+σ 4, m/a/y 11, m/b/z measured without coverage data, m/c/w not
// measured (no functions).
const v = {
  ...view(pkgs(["m/a/x", "m/a/y", "m/b/z", "m/c/w"], "m")),
  metrics: {
    packages: {
      "m/a/x": { funcs: 2, crap: { mu: 3, max: 5, sigma: 1 } },
      "m/a/y": { funcs: 4, missing: 1, crap: { mu: 10, max: 30, sigma: 1 } },
      "m/b/z": { funcs: 1, missing: 1 },
    },
    funcs: {},
  },
};

describe("CRAP as uml-viewer grades it", () => {
  it("grades μ+σ on 1–10 through the 8/12/20 stops, missing as the worst", () => {
    expect([4, 8, 10, 12, 16, 20, 25].map(crapGrade)).toEqual([10, 10, 7.75, 5.5, 3.25, 1, 1]);
    expect(crapGrade(null)).toBe(1);
  });

  it("bands at 8 and 12, missing as red", () => {
    expect([8, 8.1, 12, 12.1].map(crapBand)).toEqual(["green", "yellow", "yellow", "red"]);
    expect(crapBand(null)).toBe("red");
  });

  it("labels a badge with its band in words, so colour is never the only sign", () => {
    expect([2, 10, 12.5, null].map(crapLabel)).toEqual(["2 low", "10 mid", "12.5 high", "? high"]);
  });

  it("rolls a box up to the worst package under it; no data is the worst", () => {
    const r = rolledCrap(v);
    expect(Object.fromEntries(r)).toEqual({ "m/a/x": 4, "m/a/y": 11, "m/a": 11, "m/b/z": null, "m/b": null, m: null });
    expect(r.has("m/c")).toBe(false); // a package without functions is neutral
  });

  it("rolls nothing without metrics", () => {
    expect(rolledCrap(view(pkgs(["m/a"], "m"))).size).toBe(0);
  });
});
```

- [ ] **Run:** `cd web && npx vitest run src/metrics.test.ts` Expected: FAIL (cannot resolve `./metrics`)

- [ ] **Implement**

```diff
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -21,6 +21,12 @@ export type Proposal = {
   name: string; layers: { name: string; members: string[] }[]; omit?: string[];
   ranks: Record<string, number>; violations: { from: string; to: string }[];
 };
+// Metrics is the CRAP overlay (08). A package without `crap` has functions
+// but no coverage data; a function without `crap` has no coverage data.
+export type Metrics = {
+  packages: Record<string, { funcs: number; missing?: number; crap?: { mu: number; max: number; sigma: number } }>;
+  funcs: Record<string, { cc: number; stmts: number; covered: number; crap?: number }>;
+};
 export type View = {
   schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref; changed?: string[];
   modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
@@ -29,6 +35,7 @@ export type View = {
   // 06: only when the Policy has rules; 07: or an order or Proposals.
   policy?: { hash: string; levels: string[][]; order?: string[]; proposals?: Proposal[] };
   violations?: { new: Violation[]; fixed: Violation[]; known: number }; // 07: Change View only
+  metrics?: Metrics; // 08: only when zu was given -coverprofile
   // 07, never written by zu: the box tree a Proposal draws (proposal.ts). cut.ts
   // index reads parent instead of package ids, and scene.ts labels from label.
   regroup?: { parent: Record<string, string>; label: Record<string, string> };
```

<!-- file: web/src/metrics.ts -->
```ts
// 08: the CRAP overlay. zu writes each package's μ, max and σ over its
// functions' CRAP (internal/export AddMetrics); the page grades μ+σ as
// uml-viewer does (config.clj at 79cc1ef) and rolls a box up to the worst
// package under it.
import { index } from "./cut";
import type { View } from "./data";

// config.clj crap-thresholds, l.3–7: μ+σ, lower is better.
export const CRAP_STOPS = { green: 8, yellow: 12, red: 20 } as const;
export type Band = "green" | "yellow" | "red";

// Risk is μ+σ; null means measured but without coverage data.
export type Risk = number | null;

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  x0 === x1 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);

// crapGrade is config.clj crap-grade (l.63): μ+σ on 1–10, 10 best, through
// `along` (l.48); missing data is the worst grade, 1.
export function crapGrade(risk: Risk): number {
  if (risk === null) return 1;
  const { green, yellow, red } = CRAP_STOPS;
  if (risk <= green) return 10;
  if (risk <= yellow) return lerp(risk, green, yellow, 10, 5.5);
  if (risk <= red) return lerp(risk, yellow, red, 5.5, 1);
  return 1;
}

// crapBand is config.clj crap-band (l.19): missing counts as red.
export function crapBand(risk: Risk): Band {
  if (risk === null) return "red";
  return risk <= CRAP_STOPS.green ? "green" : risk <= CRAP_STOPS.yellow ? "yellow" : "red";
}

// BAND_WORD names each band as a risk, for the badge and the legend.
export const BAND_WORD: Record<Band, string> = { green: "low", yellow: "mid", red: "high" };

// crapLabel is a badge's text: μ+σ (or "?" for no coverage data) and its
// band in words, so colour is never the only sign.
export const crapLabel = (risk: Risk) => `${risk ?? "?"} ${BAND_WORD[crapBand(risk)]}`;

const round1 = (x: number) => Math.round(x * 10) / 10;

// worse is config.clj worse-crap (l.99): no data beats any number.
const worse = (a: Risk | undefined, b: Risk): Risk =>
  a === undefined ? b : a === null || b === null ? null : Math.max(a, b);

const rolled = new WeakMap<View, Map<string, Risk>>();

// rolledCrap is every measured package's μ+σ and every box's worst among
// the packages under it (hierarchy.clj rolled-crap, l.88). A package with
// no functions has nothing to measure and is left out (Deviation 3).
export function rolledCrap(view: View): Map<string, Risk> {
  const hit = rolled.get(view);
  if (hit) return hit;
  const out = new Map<string, Risk>();
  const m = view.metrics?.packages ?? {};
  const { parent, pkgs } = index(view);
  for (const p of pkgs) {
    const pm = m[p.id];
    if (!pm) continue;
    const r: Risk = pm.crap ? round1(pm.crap.mu + pm.crap.sigma) : null;
    for (let b = p.id; b !== ""; b = parent.get(b) ?? "") out.set(b, worse(out.get(b), r));
  }
  rolled.set(view, out);
  return out;
}
```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run src/metrics.test.ts` Expected: PASS
- [ ] **Commit:** `Grade CRAP and roll it up to boxes`

### Task 8: The scene carries CRAP

- A box or container takes its rolled μ+σ.
- A `#pkg` leaf takes its own package's μ+σ, not its box's. The two share an id, as they do for ranks.
- A function node takes its own CRAP.
- A type takes nothing.

**Files:**
- Modify: `web/src/metrics.ts`, `web/src/metrics.test.ts`, `web/src/scene.ts`

**Steps:**

- [ ] **Write the failing test**

```diff
--- a/web/src/metrics.test.ts
+++ b/web/src/metrics.test.ts
@@ -1,6 +1,8 @@
 import { describe, expect, it } from "vitest";
 import { crapBand, crapGrade, crapLabel, rolledCrap } from "./metrics";
-import { pkgs, view } from "./testkit";
+import { scene } from "./scene";
+import { DEFAULT_STATE } from "./state";
+import { decl, pkgs, view } from "./testkit";
 
 // m/a/x μ+σ 4, m/a/y 11, m/b/z measured without coverage data, m/c/w not
 // measured (no functions).
@@ -41,3 +43,42 @@ describe("CRAP as uml-viewer grades it", () => {
     expect(rolledCrap(view(pkgs(["m/a"], "m"))).size).toBe(0);
   });
 });
+
+describe("the scene carries CRAP", () => {
+  const d = {
+    ...v,
+    nodes: [
+      ...v.nodes.map((n) => ({ ...n, detail: true })),
+      decl("m/a/x.F", "m/a/x", "function"), decl("m/a/x.G", "m/a/x", "function"), decl("m/a/x.T", "m/a/x"),
+    ],
+    metrics: { ...v.metrics, funcs: { "m/a/x.F": { cc: 2, stmts: 4, covered: 4, crap: 2 }, "m/a/x.G": { cc: 3, stmts: 1, covered: 0 } } },
+  };
+  const crap = (depth: number | null, focus = "") =>
+    Object.fromEntries(scene(d, { ...DEFAULT_STATE, depth, focus }).nodes.map((n) => [n.id, n.crap]));
+
+  it("on every box and container, rolled up; none on an unmeasured box", () => {
+    expect(crap(2)).toEqual({
+      m: { risk: null, band: "red" }, "m/a": { risk: 11, band: "yellow" },
+      "m/b": { risk: null, band: "red" }, "m/c": undefined,
+    });
+    expect(crap(3)["m/a/x"]).toEqual({ risk: 4, band: "green" });
+  });
+
+  it("on a function by its own CRAP; none on a type", () => {
+    expect(crap(null, "m/a/x#pkg")).toEqual({
+      "m/a/x.F": { risk: 2, band: "green" }, "m/a/x.G": { risk: null, band: "red" }, "m/a/x.T": undefined,
+    });
+  });
+
+  it("on a package's own #pkg leaf by its own CRAP, not its box's", () => {
+    const root = { ...d, nodes: [...pkgs(["m"], "m"), ...d.nodes] }; // package m itself is unmeasured
+    const sc = scene(root, { ...DEFAULT_STATE, depth: 2 });
+    expect(sc.nodes.find((n) => n.id === "m#pkg")?.crap).toBeUndefined();
+    expect(sc.nodes.find((n) => n.id === "m")?.crap).toEqual({ risk: null, band: "red" });
+  });
+
+  it("nowhere without metrics", () => {
+    const { metrics: _, ...plain } = d;
+    expect(scene(plain, { ...DEFAULT_STATE, depth: 3 }).nodes.some((n) => n.crap)).toBe(false);
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/metrics.test.ts` Expected: FAIL (`crap` is undefined on every node)

- [ ] **Implement**

```diff
--- a/web/src/metrics.ts
+++ b/web/src/metrics.ts
@@ -45,6 +45,14 @@ const round1 = (x: number) => Math.round(x * 10) / 10;
 const worse = (a: Risk | undefined, b: Risk): Risk =>
   a === undefined ? b : a === null || b === null ? null : Math.max(a, b);
 
+// packageRisk is a package's own μ+σ: null without coverage data, undefined
+// when it has no functions to measure.
+export function packageRisk(view: View, id: string): Risk | undefined {
+  const pm = view.metrics?.packages[id];
+  if (!pm) return undefined;
+  return pm.crap ? round1(pm.crap.mu + pm.crap.sigma) : null;
+}
+
 const rolled = new WeakMap<View, Map<string, Risk>>();
 
 // rolledCrap is every measured package's μ+σ and every box's worst among
@@ -54,12 +62,10 @@ export function rolledCrap(view: View): Map<string, Risk> {
   const hit = rolled.get(view);
   if (hit) return hit;
   const out = new Map<string, Risk>();
-  const m = view.metrics?.packages ?? {};
   const { parent, pkgs } = index(view);
   for (const p of pkgs) {
-    const pm = m[p.id];
-    if (!pm) continue;
-    const r: Risk = pm.crap ? round1(pm.crap.mu + pm.crap.sigma) : null;
+    const r = packageRisk(view, p.id);
+    if (r === undefined) continue;
     for (let b = p.id; b !== ""; b = parent.get(b) ?? "") out.set(b, worse(out.get(b), r));
   }
   rolled.set(view, out);
```

```diff
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -4,6 +4,7 @@ import type { View, ViewEdge } from "./data";
 import { autoDepth, childrenOf, cmp, cut, declsOf, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
 import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
+import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
 import { rolledRanks } from "./policy";
 import { withinHops } from "./select";
 import type { Known, Stage, ViewState } from "./state";
@@ -20,6 +21,7 @@ export type SceneNode = {
   rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
   hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
   order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
+  crap?: { risk: Risk; band: Band }; // 08: a box's rolled μ+σ, a function's own CRAP; null = no coverage data
 };
 export type SceneEdge = {
   id: string; from: string; to: string; pairs: number; members: Bundle["members"];
@@ -125,6 +127,8 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   };
 
   const ranks = rolledRanks(view);
+  const craps = rolledCrap(view);
+  const funcs = view.metrics?.funcs ?? {};
   const order = view.policy?.order ?? [];
   const nodes: SceneNode[] = [...ids].sort(cmp).map((id) => {
     const parent = up(id);
@@ -144,6 +148,10 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     const r = n.shape !== "box" && n.shape !== "container" ? undefined
       : id.endsWith(PKG) ? node.get(id.slice(0, -PKG.length))?.rank : ranks.get(id);
     if (r !== undefined) n.rank = r;
+    const k = n.shape === "decl" ? (node.get(id)?.kind === "function" && funcs[id] ? (funcs[id].crap ?? null) : undefined)
+      : n.shape !== "box" && n.shape !== "container" ? undefined
+      : id.endsWith(PKG) ? packageRisk(view, id.slice(0, -PKG.length)) : craps.get(id);
+    if (k !== undefined) n.crap = { risk: k, band: crapBand(k) };
     const o = order.indexOf(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
     if (o >= 0 && n.shape !== "decl") n.order = o;
     return n;
```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run` Expected: PASS
- [ ] **Commit:** `Carry CRAP on scene boxes and functions`

### Task 9: The fill and the badge

`cls` adds `crap-<band>`, and a `Crap` badge with `crapLabel` sits at the lower right of box and declaration nodes and in a container's header (Deviation 10). The fills are defined as tokens for light and dark. `styles.test.ts` checks their contrast and their distance under colour-vision deficiency (Deviation 9); the components are checked in Task 11 (Deviation 15). Vitest turns CSS imports into empty strings unless `test.css` is on, so the test's `?raw` import needs it.

**Files:**
- Create: `web/src/styles.test.ts`
- Modify: `web/src/Canvas.tsx`, `web/src/styles.css`, `web/vite.config.ts`

**Steps:**

- [ ] **Write the failing test**

<!-- file: web/src/styles.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import css from "./styles.css?raw";

// 08: the CRAP fills must keep text readable and stay apart for readers
// with red-green colour blindness (Deviation 9). Colours are read from the
// tokens, so a change to styles.css is checked here.
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
}
const light = tokens(css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)")));
const dark = { ...light, ...tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)")).split("\n}\n")[0]) };

type RGB = [number, number, number];
const linear = (hex: string): RGB =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(linear(a)), luminance(linear(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// Machado, Oliveira and Fernandes (2009), severity 1, on linear RGB.
const SIM: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};
function lab(c: RGB): RGB {
  const [r, g, b] = c.map((v) => Math.min(1, Math.max(0, v)));
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
// deltaE is CIE76 between a and b as a reader with vision v sees them.
function deltaE(a: string, b: string, v: string): number {
  const see = (hex: string) => lab(SIM[v].map((row) => row.reduce((s, k, i) => s + k * linear(hex)[i], 0)) as RGB);
  const [p, q] = [see(a), see(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const FILLS = ["crap-green", "crap-yellow", "crap-red"];

describe.each([["light", light], ["dark", dark]])("CRAP fills, %s", (_, t) => {
  it("keep node text at 4.5:1 and outlines at 3:1", () => {
    // --removed never sits on a fill: a removed node has no metrics (head
    // only), so it only needs 3:1 as the hidden-violation border (--pin).
    const low: string[] = [];
    for (const f of FILLS) {
      for (const [k, min] of [["fg", 4.5], ["muted", 4.5], ["added", 4.5], ["modified", 4.5], ["moved", 4.5], ["pin", 3], ["accent", 3]] as const) {
        if (contrast(t[f], t[k]) < min) low.push(`${k} on ${f} ${contrast(t[f], t[k]).toFixed(2)}`);
      }
    }
    expect(low).toEqual([]);
  });

  it("differ by ΔE 10 or more to normal, deuteranopic and protanopic vision", () => {
    const near: string[] = [];
    for (const v of Object.keys(SIM)) {
      for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
        const d = deltaE(t[FILLS[a]], t[FILLS[b]], v);
        if (d < 10) near.push(`${FILLS[a]}/${FILLS[b]} ${v} ${d.toFixed(1)}`);
      }
    }
    expect(near).toEqual([]);
  });
});
```

```diff
--- a/web/vite.config.ts
+++ b/web/vite.config.ts
@@ -29,5 +29,6 @@ export default defineConfig({
   worker: { format: "iife" },
   // Dev mode reads the Go golden View from internal/export/testdata.
   server: { fs: { allow: [".."] } },
-  test: { environment: "node", include: ["src/**/*.test.ts"] },
+  // css: styles.test.ts reads styles.css?raw (08); vitest empties CSS otherwise.
+  test: { environment: "node", include: ["src/**/*.test.ts"], css: true },
 });
```

- [ ] **Run:** `cd web && npx vitest run src/styles.test.ts` Expected: FAIL (no `--crap-green` token in `styles.css`)

- [ ] **Implement**

```diff
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -16,6 +16,7 @@ import { edgeMark } from "./change";
 import { parentBox } from "./cut";
 import type { View } from "./data";
 import { absolute, triangles, type Placed } from "./layout";
+import { crapGrade, crapLabel } from "./metrics";
 import type { Scene, SceneNode } from "./scene";
 import { boxStats } from "./tree";
 
@@ -73,10 +74,28 @@ function Toggle({ data }: { data: Data }) {
 }
 
 // cls: the shape, the Change View mark (04 Part B), a violation hidden inside
-// (07), selection and dimming.
+// (07), the CRAP fill (08), selection and dimming.
 const cls = (base: string, n: SceneNode, selected: boolean) =>
   `node ${base}${n.change ? ` ${n.change}` : ""}${n.hidden ? " hides-violation" : ""}${n.rank !== undefined ? " ranked" : ""}` +
-  `${selected ? " selected" : ""}${n.dim ? " dim" : ""}`;
+  `${n.crap ? ` crap-${n.crap.band}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}`;
+
+// Crap is the CRAP badge (08), at the lower right, or in a container's
+// header: the number and its band in words, so the fill is never the only
+// sign. A box shows its worst μ+σ, a function its CRAP; "?" is no coverage
+// data, which counts as red (decisions.md).
+function Crap({ node }: { node: SceneNode }) {
+  const c = node.crap;
+  if (!c) return null;
+  const what = node.shape === "decl" ? "CRAP" : "worst CRAP μ+σ";
+  const title = c.risk === null
+    ? "No coverage data: counts as red"
+    : `${what} ${c.risk} (grade ${crapGrade(c.risk).toFixed(1)} of 10)`;
+  return (
+    <span className="crap" title={title}>
+      {crapLabel(c.risk)}
+    </span>
+  );
+}
 
 // Rank is the Policy rank at the upper left (uml-viewer README: "Class boxes
 // show the current view's rank (innermost 0) at the upper left").
@@ -95,6 +114,7 @@ function BoxNode({ data, selected }: NodeProps<ZNode>) {
     <div className={cls("box", data.node, selected)} title={data.node.id}>
       <Ends />
       <Rank node={data.node} />
+      <Crap node={data.node} />
       <Toggle data={data} />
       <div className="label">{data.node.label}</div>
       {s && (
@@ -113,6 +133,7 @@ function ContainerNode({ data, selected }: NodeProps<ZNode>) {
     <div className={cls("container", data.node, selected)} title={data.node.id}>
       <Ends />
       <Rank node={data.node} />
+      <Crap node={data.node} />
       <Toggle data={data} />
       <div className="label">{data.node.label}</div>
       <Marks data={data} />
@@ -145,6 +166,7 @@ function DeclNode({ data, selected }: NodeProps<ZNode>) {
   return (
     <div className={cls("decl", node, selected)} title={node.id}>
       <Ends />
+      <Crap node={node} />
       <div className="label">{node.label}</div>
       {node.methods.map((r, i) => (
         <div
```

```diff
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -18,6 +18,11 @@
   --del-bg: #ffebe9;
   --pin: #cf222e; /* a pinned (violating) edge, 06 */
   --proposal: #9a6700; /* the Proposal banner, gold as in uml-viewer (draw.clj l.650), 07 */
+  /* CRAP fills (08): text stays 4.5:1 on them, and they stay apart for
+     red-green colour blindness (styles.test.ts) */
+  --crap-green: #c8f8c4;
+  --crap-yellow: #f0e49c;
+  --crap-red: #ffdcdc;
   font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
   color: var(--fg);
   background: var(--bg);
@@ -44,6 +49,11 @@
     --del-bg: #3d1a1c;
     --pin: #ff7b72;
     --proposal: #d29922;
+    /* near uml-viewer draw.clj fill-for (l.40): 4.5:1 text, and apart for
+       red-green colour blindness (styles.test.ts) */
+    --crap-green: #173b2c;
+    --crap-yellow: #3e3814;
+    --crap-red: #3b1d11;
   }
 }
 
@@ -494,6 +504,39 @@ button.st-removed {
 .node.ranked .label {
   padding-left: 18px;
 }
+/* CRAP (08) owns the fill; change marks own border, text and outline, and a
+   hidden violation the red border, so all three show at once. */
+.node.crap-green {
+  background: var(--crap-green);
+}
+.node.crap-yellow {
+  background: var(--crap-yellow);
+}
+.node.crap-red {
+  background: var(--crap-red);
+}
+.node .crap {
+  position: absolute;
+  right: 3px;
+  bottom: 3px;
+  white-space: nowrap;
+  padding: 0 3px;
+  border-radius: 3px;
+  background: var(--bg);
+  color: var(--fg);
+  font-size: 10px;
+  line-height: 14px;
+}
+/* A container's children fill its body, so its badge sits in the header,
+   left of the toggle, and the label stops short of it. */
+.node.container .crap {
+  top: 3px;
+  right: 24px;
+  bottom: auto;
+}
+.node.container[class*="crap-"] .label {
+  padding-right: 72px;
+}
 .node.hides-violation {
   border-color: var(--pin);
   box-shadow: inset 0 0 0 1px var(--pin);
```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run && npx vite build` Expected: PASS
- [ ] **Commit:** `Fill boxes by CRAP band with a badge`

### Task 10: The panel and the legend

`crapFacts` is pure and tested. For a box it takes the drawn scene's rollup, `SceneNode.crap`, which `App` passes in, so the panel and the badge agree in a Change View (Deviation 16). `Panel` renders it above the selection's body, and the legend's CRAP swatches appear only when a drawn node is measured.

**Files:**
- Modify: `web/src/metrics.ts`, `web/src/metrics.test.ts`, `web/src/Panel.tsx`, `web/src/App.tsx`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing test**

```diff
--- a/web/src/metrics.test.ts
+++ b/web/src/metrics.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it } from "vitest";
-import { crapBand, crapGrade, crapLabel, rolledCrap } from "./metrics";
+import { changedSubgraph } from "./change";
+import { crapBand, crapFacts, crapGrade, crapLabel, rolledCrap } from "./metrics";
 import { scene } from "./scene";
 import { DEFAULT_STATE } from "./state";
 import { decl, pkgs, view } from "./testkit";
@@ -82,3 +83,60 @@ describe("the scene carries CRAP", () => {
     expect(scene(plain, { ...DEFAULT_STATE, depth: 3 }).nodes.some((n) => n.crap)).toBe(false);
   });
 });
+
+describe("the panel's CRAP facts", () => {
+  const d = {
+    ...v,
+    nodes: [...v.nodes, decl("m/a/y.F", "m/a/y", "function"), decl("m/a/y.G", "m/a/y", "function"), decl("m/a/y.H", "m/a/y", "function")],
+    metrics: {
+      ...v.metrics,
+      funcs: {
+        "m/a/y.F": { cc: 3, stmts: 3, covered: 1, crap: 5.7 },
+        "m/a/y.G": { cc: 6, stmts: 10, covered: 0, crap: 42 },
+        "m/a/y.H": { cc: 2, stmts: 4, covered: 2 },
+      },
+    },
+  };
+
+  it("a package: μ, max, σ and grade, the functions without data, the riskiest first", () => {
+    expect(crapFacts(d, "m/a/y#pkg")).toEqual({
+      lines: ["CRAP μ 10 · max 30 · σ 1 · μ+σ 11, grade 6.6 of 10", "1 of 4 functions without coverage data"],
+      top: [
+        { id: "m/a/y.G", crap: 42 },
+        { id: "m/a/y.F", crap: 5.7 },
+      ],
+    });
+    expect(crapFacts(d, "m/b/z")).toEqual({ lines: ["No coverage data for its 1 function: counts as red"], top: [] });
+  });
+
+  it("a box: the worst μ+σ below it, as its badge has it", () => {
+    const r = rolledCrap(d);
+    expect(crapFacts(d, "m/a", r.get("m/a"))?.lines).toEqual(["Worst CRAP μ+σ below: 11, grade 6.6 of 10"]);
+    expect(crapFacts(d, "m", r.get("m"))?.lines).toEqual(["Worst CRAP μ+σ below: no coverage data, counts as red"]);
+    expect(crapFacts(d, "m/c", r.get("m/c"))).toBeNull(); // nothing measured below
+  });
+
+  it("a box in a Change View's changed subgraph says what its badge says", () => {
+    // m/in/x, unchanged and without coverage data, is not drawn: the badge
+    // rolls up only m/in/store, and so must the panel.
+    const whole = {
+      ...view([...pkgs(["m"], "m"), ...pkgs(["m/in/store"], "m", { status: "modified" }), ...pkgs(["m/in/x"], "m")]),
+      kind: "change" as const,
+      changed: ["m/in/store"],
+      metrics: { packages: { "m/in/store": { funcs: 1, crap: { mu: 5, max: 5, sigma: 0 } }, "m/in/x": { funcs: 2, missing: 2 } }, funcs: {} },
+    };
+    const box = scene(changedSubgraph(whole), { ...DEFAULT_STATE, depth: 2 }).nodes.find((n) => n.id === "m/in");
+    expect(box?.crap).toEqual({ risk: 5, band: "green" });
+    expect(crapFacts(whole, "m/in", box?.crap?.risk)?.lines).toEqual(["Worst CRAP μ+σ below: 5, grade 10.0 of 10"]);
+  });
+
+  it("a function: complexity, coverage and CRAP", () => {
+    expect(crapFacts(d, "m/a/y.F")?.lines).toEqual(["Complexity 3 · 1 of 3 statements covered (33%) · CRAP 5.7"]);
+    expect(crapFacts(d, "m/a/y.H")?.lines).toEqual(["Complexity 2 · no coverage data: counts as red"]);
+  });
+
+  it("nothing unmeasured, and nothing without metrics", () => {
+    expect(crapFacts(d, "m/c/w")).toBeNull();
+    expect(crapFacts(view(pkgs(["m/a"], "m")), "m/a")).toBeNull();
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/metrics.test.ts` Expected: FAIL (`crapFacts is not a function`)

- [ ] **Implement**

```diff
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -21,7 +21,9 @@ import { useViewState } from "./useViewState";
 
 const PKG = "#pkg";
 
-function Legend({ change, policy, ranks, proposal }: { change: boolean; policy: boolean; ranks: boolean; proposal: string | null }) {
+type LegendProps = { change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null };
+
+function Legend({ change, policy, ranks, crap, proposal }: LegendProps) {
   return (
     <div className="legend" aria-label="Legend">
       {change && (
@@ -36,6 +38,13 @@ function Legend({ change, policy, ranks, proposal }: { change: boolean; policy:
       )}
       {policy && <span className="swatch violation">{redLegend(proposal)}</span>}
       {ranks && <span>n: Level, 0 = innermost, drawn at the bottom</span>}
+      {crap && (
+        <>
+          <span className="swatch crap-green">CRAP μ+σ ≤ 8 low</span>
+          <span className="swatch crap-yellow">≤ 12 mid</span>
+          <span className="swatch crap-red">&gt; 12 high · ? no coverage data</span>
+        </>
+      )}
     </div>
   );
 }
@@ -214,6 +223,7 @@ export function App({ view: whole }: { view: View }) {
   // when something is ranked; an order-only Policy needs neither.
   const rules = (proposed.policy?.levels.length ?? 0) > 0 || proposed.edges.some((e) => e.violation);
   const ranks = sc.nodes.some((n) => n.rank !== undefined);
+  const crap = sc.nodes.some((n) => n.crap); // 08: only with a coverprofile (A7)
   const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
   const pkg = state.focus.endsWith(PKG) ? state.focus.slice(0, -PKG.length) : state.focus;
 
@@ -246,7 +256,9 @@ export function App({ view: whole }: { view: View }) {
             {PROPOSAL_NOTICE}: {state.proposal}
           </div>
         )}
-        {(change || rules || ranks) && <Legend change={change} policy={rules} ranks={ranks} proposal={proposed === whole ? null : state.proposal} />}
+        {(change || rules || ranks || crap) && (
+          <Legend change={change} policy={rules} ranks={ranks} crap={crap} proposal={proposed === whole ? null : state.proposal} />
+        )}
         {sc !== requested && (
           <div className="notice" id="zu-notice" role="status">
             Collapsed to depth {sc.depth}: depth {requested.depth} has{" "}
@@ -318,6 +330,7 @@ export function App({ view: whole }: { view: View }) {
           edge={edge}
           bundles={sc.bundles}
           hidden={sc.nodes.find((n) => n.id === sc.selected)?.hidden}
+          crap={sc.nodes.find((n) => n.id === sc.selected)?.crap?.risk}
           onReveal={jump}
           onClose={() => choose(null)}
         />
```

```diff
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -3,6 +3,7 @@ import type { Bundle } from "./bundle";
 import type { Hunk, Loc, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, targets, type Row } from "./facts";
 import { linkFor } from "./links";
+import { crapFacts, type Risk } from "./metrics";
 import type { SceneEdge } from "./scene";
 import { EXTERNALS, OUTSIDE, boxStats } from "./tree";
 
@@ -16,6 +17,7 @@ type Props = {
   edge: SceneEdge | null;
   bundles: Bundle[]; // the scene's bundles: an aggregate's real targets come from them
   hidden?: ViewEdge[]; // 07: violating imports inside the selected box, drawn as no line
+  crap?: Risk; // 08: the selected box's CRAP as the scene rolled it up
   onReveal: (id: string) => void;
   onClose: () => void;
 };
@@ -186,7 +188,35 @@ function Hidden({ edges, onReveal }: { edges: ViewEdge[]; onReveal: (id: string)
   );
 }
 
-export function Panel({ view, id, edge, bundles, hidden, onReveal, onClose }: Props) {
+// Crap is what the CRAP overlay knows of the selection (08).
+function Crap({ view, id, box, onReveal }: { view: View; id: string; box?: Risk; onReveal: (id: string) => void }) {
+  const f = crapFacts(view, id, box);
+  if (!f) return null;
+  return (
+    <section className="crap-facts">
+      {f.lines.map((l) => (
+        <p key={l}>{l}</p>
+      ))}
+      {f.top.length > 0 && (
+        <>
+          <h3>Highest CRAP</h3>
+          <ul className="rows">
+            {f.top.map((t) => (
+              <li key={t.id}>
+                <button type="button" className="link" onClick={() => onReveal(t.id)}>
+                  <code>{t.id}</code>
+                </button>
+                <span className="muted"> {t.crap}</span>
+              </li>
+            ))}
+          </ul>
+        </>
+      )}
+    </section>
+  );
+}
+
+export function Panel({ view, id, edge, bundles, hidden, crap, onReveal, onClose }: Props) {
   const title = edge ? `${edge.from} → ${edge.to}` : (id ?? "");
   const node = id === null ? undefined : view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
   let body: React.ReactNode;
@@ -244,6 +274,7 @@ export function Panel({ view, id, edge, bundles, hidden, onReveal, onClose }: Pr
         </button>
       </header>
       {!edge && hidden && <Hidden edges={hidden} onReveal={onReveal} />}
+      {!edge && id !== null && <Crap view={view} id={id} box={crap} onReveal={onReveal} />}
       {body}
     </aside>
   );
```

```diff
--- a/web/src/metrics.ts
+++ b/web/src/metrics.ts
@@ -3,7 +3,7 @@
 // uml-viewer does (config.clj at 79cc1ef) and rolls a box up to the worst
 // package under it.
 import { index } from "./cut";
-import type { View } from "./data";
+import type { View, ViewNode } from "./data";
 
 // config.clj crap-thresholds, l.3–7: μ+σ, lower is better.
 export const CRAP_STOPS = { green: 8, yellow: 12, red: 20 } as const;
@@ -71,3 +71,55 @@ export function rolledCrap(view: View): Map<string, Risk> {
   rolled.set(view, out);
   return out;
 }
+
+export type CrapFacts = { lines: string[]; top: { id: string; crap: number }[] };
+
+const graded = (r: number) => `${r}, grade ${crapGrade(r).toFixed(1)} of 10`;
+
+// crapFacts is what the panel says of id's CRAP: a function's complexity,
+// coverage and CRAP; a package's μ, max, σ and its riskiest drawn functions;
+// a box's worst μ+σ below it, which is box: the drawn scene's own rollup, so
+// the panel and the badge always agree (a Change View draws a subgraph).
+// Null when id is not measured.
+export function crapFacts(view: View, id: string, box?: Risk): CrapFacts | null {
+  const m = view.metrics;
+  if (!m) return null;
+  const f = m.funcs[id];
+  if (f) {
+    const cov = f.stmts === 0 ? 100 : Math.round((100 * f.covered) / f.stmts);
+    const line = f.crap === undefined
+      ? `Complexity ${f.cc} · no coverage data: counts as red`
+      : `Complexity ${f.cc} · ${f.covered} of ${f.stmts} statements covered (${cov}%) · CRAP ${f.crap}`;
+    return { lines: [line], top: [] };
+  }
+  // A package drawn as a box that holds others (its #pkg leaf is itself)
+  // gets the box's facts; its leaf, or a package with no box under it, its own.
+  const leaf = id.endsWith("#pkg");
+  const pkg = leaf ? id.slice(0, -"#pkg".length) : id;
+  const p = m.packages[pkg];
+  if (p && (leaf || !index(view).children.has(pkg))) {
+    const node = new Map(view.nodes.map((n) => [n.id, n]));
+    const top = view.nodes
+      .filter((n) => n.kind === "function" && m.funcs[n.id]?.crap !== undefined && packageOf(node, n.id) === pkg)
+      .map((n) => ({ id: n.id, crap: m.funcs[n.id].crap! }))
+      .sort((a, b) => b.crap - a.crap || (a.id < b.id ? -1 : 1))
+      .slice(0, 5);
+    if (!p.crap) {
+      return { lines: [`No coverage data for its ${p.funcs} function${p.funcs === 1 ? "" : "s"}: counts as red`], top };
+    }
+    const { mu, max, sigma } = p.crap;
+    const lines = [`CRAP μ ${mu} · max ${max} · σ ${sigma} · μ+σ ${graded(round1(mu + sigma))}`];
+    if (p.missing) lines.push(`${p.missing} of ${p.funcs} functions without coverage data`);
+    return { lines, top };
+  }
+  if (box === undefined) return null;
+  return { lines: [`Worst CRAP μ+σ below: ${box === null ? "no coverage data, counts as red" : graded(box)}`], top: [] };
+}
+
+// packageOf is the package a declaration belongs to: a method's parent is
+// its type, whose parent is the package.
+function packageOf(node: Map<string, ViewNode>, id: string): string {
+  let p = node.get(id)?.parent ?? "";
+  while (p && node.get(p)?.kind !== "package") p = node.get(p)?.parent ?? "";
+  return p;
+}
```

```diff
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -371,6 +371,15 @@ button.st-removed {
   border-style: dashed;
   border-color: var(--accent);
 }
+.legend .swatch.crap-green {
+  background: var(--crap-green);
+}
+.legend .swatch.crap-yellow {
+  background: var(--crap-yellow);
+}
+.legend .swatch.crap-red {
+  background: var(--crap-red);
+}
 .legend .swatch.violation {
   border-color: var(--pin);
   color: var(--pin);
```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run && npx vite build` Expected: PASS
- [ ] **Commit:** `Explain CRAP in the panel and the legend`

### Task 11: The browser harness covers 08

This task adds two pages to 05's harness, shaped as `export.AddMetrics` writes them:

- `crap.html`: a Policy-shaped Project View with metrics and one function, `m/internal/cli.Run`, with its own `funcs` entry;
- `crap-change.html`: the shop Change View with a modified package measured, and a red package that the changed subgraph does not draw.

Nine checks:
- `crap`: bands and badge words at depths 2 and 3;
- `crapBadgeClear`: no container's badge rect meets a child's rect, at depths 2 and 3 (M6; red with the lower-right placement);
- `crapFills`: the fills' computed colours;
- `crapLegend`;
- `crapPanel`: the package facts and the "Highest CRAP" list with `m/internal/cli.Run 6`;
- `crapFunc`: the function node's badge `6 low` and its panel line;
- `crapChange`: fill and change border together;
- `crapChangeBox`: a box's badge and panel give the same drawn rollup, not the far red package (M1);
- `noCrap`: no fill or badge without metrics.

That makes 39 checks per engine.

**Files:**
- Modify: `web/e2e/accept.mjs`

**Steps:**

- [ ] **Write the check**

```diff
--- a/web/e2e/accept.mjs
+++ b/web/e2e/accept.mjs
@@ -57,6 +57,44 @@ write("violations.html", page({
   ...change, policy: { hash: "sha256:e2e", levels: [], proposals: [{ ...hexagon, ranks: {}, violations: [] }] },
   violations: { new: [{ rule: "levels", from: "example.com/shop/internal/store", to: "example.com/shop/internal/money" }], fixed: [], known: 2 },
 }));
+// 08: CRAP as export.AddMetrics writes it. m/cmd μ+σ 2 (green), m/internal/cli
+// 10 (yellow) with one function, Run, m/internal/ir measured without coverage
+// data (red, "?"), m/util and m/internal/ir/bad unmeasured.
+const metrics = {
+  packages: {
+    "m/cmd": { funcs: 1, crap: { mu: 2, max: 2, sigma: 0 } },
+    "m/internal/cli": { funcs: 3, missing: 1, crap: { mu: 9, max: 12, sigma: 1 } },
+    "m/internal/ir": { funcs: 2, missing: 2 },
+  },
+  funcs: { "m/internal/cli.Run": { cc: 4, stmts: 8, covered: 4, crap: 6 } },
+};
+write("crap.html", page({
+  ...shop, modules: ["m"], sources: {}, metrics,
+  nodes: [
+    pkg("m", "m"), ...ranked.map(([id]) => ({ ...pkg(id, "m"), ...(id === "m/internal/cli" ? { detail: true } : {}) })),
+    { id: "m/internal/cli.Run", kind: "function", parent: "m/internal/cli", exported: true, loc },
+  ],
+  edges: [imp("m/cmd", "m/internal/cli"), imp("m/internal/cli", "m/internal/ir"), imp("m/cmd", "m/util")],
+}));
+// The shop Change View with its four modified packages measured, and one
+// unchanged package without coverage data that the changed subgraph leaves
+// out: the internal box's badge and panel must both leave it out.
+const hidden = "example.com/shop/internal/far";
+const store = "example.com/shop/internal/store";
+write("crap-change.html", page({
+  ...change,
+  nodes: [...change.nodes, pkg(hidden, "example.com/shop")],
+  metrics: {
+    packages: {
+      "example.com/shop": { funcs: 1, crap: { mu: 1, max: 1, sigma: 0 } },
+      "example.com/shop/internal/checkout": { funcs: 1, crap: { mu: 3, max: 3, sigma: 0 } },
+      "example.com/shop/internal/money": { funcs: 2, crap: { mu: 4, max: 5, sigma: 1 } },
+      [store]: { funcs: 5, crap: { mu: 30, max: 50, sigma: 5 } },
+      [hidden]: { funcs: 1, missing: 1 },
+    },
+    funcs: {},
+  },
+}));
 
 const base = "file://" + dir + "/";
 const vp = (p) => p.locator(".react-flow__viewport").getAttribute("style");
@@ -186,6 +224,69 @@ async function run(b) {
     const dy = n.y + n.height / 2 - (c.y + c.height / 2);
     return Math.abs(dx) <= 2 && Math.abs(dy) <= 2 ? true : `off by ${Math.round(dx)}, ${Math.round(dy)}`;
   });
+  // 08: the CRAP overlay.
+  const craps = () => p.evaluate(() => [...document.querySelectorAll(".react-flow__node")].flatMap((n) => {
+    const box = n.querySelector(".node");
+    const band = /crap-(\w+)/.exec(box?.className ?? "")?.[1];
+    return band ? [`${n.getAttribute("data-id")} ${band} ${n.querySelector(".crap")?.textContent}`] : [];
+  }).sort());
+  out.crap = [];
+  for (const d of [2, 3]) {
+    await p.goto(base + `crap.html#d=${d}`);
+    await p.reload();
+    await drawn(p);
+    await settle(p);
+    out.crap.push(await craps());
+    // A container's badge overlaps none of the boxes inside it.
+    out.crapBadgeClear = await p.evaluate(() => {
+      const rect = (e) => e.getBoundingClientRect();
+      const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
+      const nodes = [...document.querySelectorAll(".react-flow__node")];
+      return nodes.flatMap((n) => {
+        const badge = n.querySelector(".node.container > .crap");
+        const id = n.getAttribute("data-id");
+        if (!badge) return [];
+        return nodes.filter((c) => c.getAttribute("data-id").startsWith(id + "/") && meets(rect(badge), rect(c)))
+          .map((c) => `${id} badge over ${c.getAttribute("data-id")}`);
+      });
+    }).then((xs) => [...(out.crapBadgeClear ?? []), ...xs]);
+  }
+  // At depth 3: green, yellow, red and unmeasured are four different fills.
+  out.crapFills = await p.evaluate(() => new Set(["m/cmd", "m/internal/cli", "m/internal/ir", "m/util"].map((id) =>
+    getComputedStyle(document.querySelector(`.react-flow__node[data-id="${id}"] .node`)).backgroundColor)).size);
+  out.crapLegend = await p.locator(".legend").innerText().then((t) => t.split("\n").filter((l) => /CRAP|≤|>/.test(l)));
+  await p.goto(base + "crap.html#d=3&s=m%2Finternal%2Fcli");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  out.crapPanel = await p.locator(".crap-facts").innerText().then((t) => t.split("\n").filter(Boolean)).catch(() => null);
+  await p.goto(base + "crap.html#f=m%2Finternal%2Fcli&s=m%2Finternal%2Fcli.Run");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  out.crapFunc = [
+    await p.locator('.react-flow__node[data-id="m/internal/cli.Run"] .crap').textContent().catch(() => null),
+    await p.locator(".crap-facts").innerText().catch(() => null),
+  ];
+  // The Change View: a modified package's fill and change border show
+  // together, and a box's badge and panel agree.
+  await p.goto(base + "crap-change.html#d=3");
+  await drawn(p);
+  await settle(p);
+  out.crapChange = await p.locator(`.react-flow__node[data-id="${store}"] .node`).getAttribute("class")
+    .then((c) => ["crap-red", "st-modified"].map((k) => c.split(" ").includes(k)));
+  await p.goto(base + "crap-change.html#d=2&s=example.com%2Fshop%2Finternal");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  out.crapChangeBox = [
+    await p.locator('.react-flow__node[data-id="example.com/shop/internal"] .crap').first().textContent(),
+    await p.locator(".crap-facts").innerText().catch(() => null),
+  ];
+  await p.goto(base + "with.html");
+  await drawn(p);
+  await settle(p);
+  out.noCrap = [await p.locator(".node .crap").count(), await p.locator(".legend .crap-green").count()];
   await p.goto(base + "violations.html#p=Hexagon");
   await drawn(p);
   await settle(p);
@@ -234,6 +335,19 @@ const want = {
   orderCentred: true,
   violations: ["New violations (1)", "levels example.com/shop/internal/store → example.com/shop/internal/money", "", "0 fixed, 2 pre-existing"],
   changeNoProposal: [0, 0],
+  // 08
+  crap: [
+    ["m red ? high", "m/cmd green 2 low", "m/internal red ? high"],
+    ["m red ? high", "m/cmd green 2 low", "m/internal red ? high", "m/internal/cli yellow 10 mid", "m/internal/ir red ? high"],
+  ],
+  crapBadgeClear: [],
+  crapFills: 4,
+  crapLegend: ["CRAP μ+σ ≤ 8 low", "≤ 12 mid", "> 12 high · ? no coverage data"],
+  crapPanel: ["CRAP μ 9 · max 12 · σ 1 · μ+σ 10, grade 7.8 of 10", "1 of 3 functions without coverage data", "Highest CRAP", "m/internal/cli.Run 6"],
+  crapFunc: ["6 low", "Complexity 4 · 4 of 8 statements covered (50%) · CRAP 6"],
+  crapChange: [true, true],
+  crapChangeBox: ["35 high", "Worst CRAP μ+σ below: 35, grade 1.0 of 10"],
+  noCrap: [0, 0],
 };
 
 const channel = process.env.ZU_E2E_CHANNEL;
```

- [ ] **Run:** `cd web && npx vite build && cd e2e && npm run accept` Expected: PASS (`ok (39/39 checks)` in chromium, firefox and webkit)
- [ ] **Commit:** `Cover the CRAP overlay in the browser harness`

### Task 12: Acceptance

- [ ] **1. Gates**
- [ ] **Run:** `test -z "$(gofmt -l cmd internal web/*.go)" && go vet ./... && go test ./... && golangci-lint run ./... && cd web && npx tsc --noEmit && npx vitest run && npx vite build` Expected: all clean.
- [ ] **2. zu on itself.** Run `make build`, then `go test -coverprofile=.zu/cover.out ./...` and `bin/zu scan . -html self.html -coverprofile .zu/cover.out`.

  Measured on this implementation (Go 1.24.5, darwin/arm64), with a profile of 2,075 lines (90 KB):
  - `zu scan` exits 0 in 0.06–0.07 s (0.06 s without the profile). stderr reads `zu scan: CRAP: coverage for 245 of 245 functions`, and no unmatched-block line: K = 0. The two package-level `var … = func` literals (`internal/cli/diff.go:20`, `scan.go:25`) are recorded as loose code (Deviation 18). The IR is byte-identical (`cmp`) to one from `zu scan` without `-coverprofile`, and two runs write a byte-identical `self.html`.
  - gocyclo v0.6.0 lists 247 functions. zu measures 245, and the complexity of every one of them matches gocyclo's. The other 2 are the same two literals, which are not function nodes (Deviation 4).
  - The View's packages, as μ / max / σ → μ+σ:

    | package | functions | μ | max | σ | μ+σ | band |
    |---|---|---|---|---|---|---|
    | zu/cmd/zu | 1 | 2 | 2 | 0 | 2 | green |
    | zu/internal/cli | 30 | 8.2 | 35.8 | 8.6 | 16.8 | red |
    | zu/internal/cover | 5 | 6.2 | 18 | 6.2 | 12.4 | red |
    | zu/internal/diff | 30 | 6.1 | 24.1 | 5.7 | 11.8 | yellow |
    | zu/internal/export | 37 | 7 | 47.7 | 8 | 15 | red |
    | zu/internal/gitref | 18 | 5 | 14.4 | 4.1 | 9.1 | yellow |
    | zu/internal/ir | 3 | 4.4 | 11.1 | 4.7 | 9.1 | yellow |
    | zu/internal/policy | 49 | 5.4 | 29.6 | 5.2 | 10.6 | yellow |
    | zu/internal/scan | 71 | 6 | 19 | 4.3 | 10.3 | yellow |
    | zu/web | 1 | 1 | 1 | 0 | 1 | green |

    `zu/internal/version` has no functions and is unmeasured (Deviation 3). zu's own code sits mostly yellow: with high coverage, CRAP approaches cc, so the band is set by complex, well-tested functions (`export.Change`, cc 47).
- [ ] **3. hugo** (`scratchpad/hugo07`, 193 packages, 522 files). The profile comes from `go test -run='^$' -coverprofile=… ./...`: every package is compiled, but no test runs. That gives a full-size profile (32,410 lines, 2.2 MB, above `ReadSmall`'s 1 MiB) with almost every count 0. It tests the parser and the join at scale; it does not measure hugo's real coverage, which would need its full test run.
  - `zu scan . -html … -coverprofile …` exits 0 in 0.25–0.31 s, against 0.24 s without it (3 runs). stderr reads `coverage for 5402 of 5457 functions`, and no unmatched-block line: K = 0. Before Deviation 18 the same profile gave K = 361, all package-level function literals in 37 files. The IR is byte-identical with and without the profile. The page grows from 2,195,435 to 2,213,346 bytes.
  - Measured packages: 184 of 193. The 9 unmeasured packages have no functions. Bands: 153 red, 9 yellow, 21 green, and 1 without data.
  - The 55 functions without data are all build-tagged away from the test build:
    - `github.com/gohugoio/hugo/deploy` (21 of 21, `withdeploy`): the one package drawn red with "?";
    - the root package (30 of 31: `magefile.go`, `//go:build mage`);
    - `commands` (1 of 185);
    - `tocss/scss` (3 of 9).

    This is Deviation 2 working as designed.

## Notes

- **Task count: 12**, within Quick mode's 15.
- **Verification of this plan** (2026-09-24): `replay.py` applied every code block in task order to a fresh `git archive` of `main` at 786ed2b, with `web/node_modules` and `web/e2e/node_modules` linked in (08 adds no dependency). It ran each task's red and green steps, and all 22 behaved: 10 red steps failed and 12 green steps passed. The replayed tree was byte-identical to the implementation the diffs were cut from. After that, Task 12's gates were clean: `gofmt -l`, `go vet ./...`, `go test ./...`, `golangci-lint run ./...`, `tsc`, `vitest` (135 tests in 21 files) and `vite build`. The harness passed 39/39 in Chromium, Firefox and WebKit, 07's 30 checks included. In about eight harness runs during development, Firefox twice reported "Page crashed" on a reload, once in one of 07's checks; the three runs after that were clean. Task 12 steps 2 and 3 were measured on this implementation.
- **TDD:** every task except 11 writes its failing test first (CLAUDE.md). Task 11 is the browser check of Tasks 9 and 10, and its new checks fail against the code it checks when that code is wrong (the badge-overlap check was red with the first placement) (Deviation 15).
- **Determinism:** the IR does not change. `metrics` sums run in sorted id order and are rounded to 0.1, and map keys are written sorted. Products are rounded before they are added, so arm64's fused multiply-add cannot change a digit (Deviation 8). Two runs gave a byte-identical `self.html` (Task 12).
- **The model never authors the graph:** the overlay only colours nodes that the parser emitted. Complexity comes from the parser's own AST, and coverage from the user's profile.
- **Performance:** complexity is one `ast.Inspect` per function during the existing parse. The join is a binary search per span over its file's sorted blocks. Counting unmatched blocks is one pass over the blocks. `rolledCrap` is cached per View. On zu, `zu scan -html -coverprofile` takes 0.06–0.07 s. On hugo, with a 2.2 MB profile, it takes 0.25–0.31 s, against 0.24 s without one.
- **Security:** see Deviation 12. The one new input is a file the user names. It is checked with `os.Stat` before it is opened, so a FIFO cannot block zu. It is streamed, bounded per line, and must be a regular file. Nothing from it but per-id numbers reaches the page, and those are rendered as React text. Error messages quote at most 20 bytes of it.
- **Stuck?** Stop and ask. Don't force through blockers.

## Progress

- [x] Task 1 · Complexity and span per function
- [x] Task 2 · `scan.Measures` beside the IR
- [x] Task 3 · `internal/cover`
- [ ] Task 4 · `export.AddMetrics`
- [ ] Task 5 · `zu scan -coverprofile`
- [ ] Task 6 · `zu diff -coverprofile`
- [ ] Task 7 · Grade, band and rollup
- [ ] Task 8 · CRAP on the scene
- [ ] Task 9 · Fill and badge
- [ ] Task 10 · Panel and legend
- [ ] Task 11 · Browser harness
- [ ] Task 12 · Acceptance
