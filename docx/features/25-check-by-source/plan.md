# 25 · Check by Source — Plan

**Status:** APPROVED 2026-10-22 (lead, after scrutiny-25, its fixes and the replay; advisor sign-off). Not built: Tasks 1–3 wait.

**Base.** Every diff here is against `main` at da92a30. The diffs come from a scratch branch whose first commit is a `git archive` of da92a30. After it come one commit per red step and one per green step, four in all. The plan was replayed on a fresh `git archive` of `main` (**Replay record**).

**Revised 2026-10-22** after the lead's decisions on the first draft: a second count, by imported package, with its own closing line (Deviation 11); packages at one violation each folded into one line (Deviation 7, which reverses the first draft's); Deviations 1–6 and 8–10 accepted as set. **Fixed 2026-10-22** after scrutiny: the closing line's lower bound stated everywhere; the stale `-format` claim corrected in **Doc amendments**; a cycles-only test case; wording in the glossary entry and **Risks**.

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 21's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. From the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) \
  && python3 -u docx/features/25-check-by-source/replay.py docx/features/25-check-by-source/plan.md "$S"; rm -rf "${S:?}"
```

It needs:
- Go, git, `patch` and Python 3;
- npm, Node and `golangci-lint`, for Task 3's `make check`, which builds and type-checks the UI. No browser runs.

---

## Goal

`zu check` says where its new Levels violations start and where they end. After its summary line it counts them twice: by importer, the package each one starts in, and by imported package, the package each one imports. Packages with two or more come first, most first; the rest, one each, share one line. When there are two or more and one package holds half or more of them, and more than any other, a closing line names it. Every line `zu check` printed before 25 is printed as it was.

**Scenario:** agent-orchestrator at 7c83bd6, under a Policy that ranks its architecture doc's layers as 5 Levels, inner first: Data and Infrastructure (with `internal/daemon`), Core, Services, HTTP, CLI.
- **Before 25:** `zu check` exits 1. It prints 57 violation lines and `zu check: 57 new, 0 known, 0 fixed`. 38 of the 57 start in `internal/daemon`, the composition root that wires every service, which the doc files under Infrastructure. 17 end in `internal/httpd/apierr`. Nothing says so: the reader has to count 57 lines.
- **After 25:** the same 58 lines, byte for byte, then 10 more:

  ```text
  zu check: new levels violations by importer:
        38  github.com/aoagents/agent-orchestrator/backend/internal/daemon
        19  other importers, 1 each
  zu check: 38 of 57 new levels violations start in github.com/aoagents/agent-orchestrator/backend/internal/daemon
  zu check: new levels violations by imported package:
        17  github.com/aoagents/agent-orchestrator/backend/internal/httpd/apierr
         2  github.com/aoagents/agent-orchestrator/backend/internal/observe/scm
         2  github.com/aoagents/agent-orchestrator/backend/internal/service/shellterm
         2  github.com/aoagents/agent-orchestrator/backend/internal/service/usage
        34  other imported packages, 1 each
  ```

  stderr is the same line as before.
- **The fix the user can already make:** rank `internal/daemon` with `internal/cli`, the outermost Level. A package may import its own Level and every Level inside it. `zu check` then reports 19 new violations, each from a different importer, so the importer count prints nothing. The imported count shows the second finding:

  ```text
  zu check: new levels violations by imported package:
        16  github.com/aoagents/agent-orchestrator/backend/internal/httpd/apierr
         3  other imported packages, 1 each
  zu check: 16 of 19 new levels violations end in github.com/aoagents/agent-orchestrator/backend/internal/httpd/apierr
  ```

  16 packages under `internal/service` import `httpd/apierr`, which the Policy ranks with HTTP, one Level above them. Before 25 the reader had to count them among the 19 lines.

## Architecture

1. **The counts** (`internal/policy/tally.go`, new). `ByImporter(vs)` counts the Levels violations among `vs` by `From`, the importer. `ByImported(vs)` counts them by `To`, the imported package. Both return `[]Tally` (an id and a count), most first, then by id. Cycle violations are left out. A cycle violation is an arc between two sibling Package Tree boxes, lifted from imports that may start and end in many packages, so it has no single importer or imported package.
2. **One count's lines** (`internal/cli/check.go`, `writeCount`). The same rules hold for both counts; only their words differ.
   - A count is written when it groups something: two or more packages, one of them at two or more. It is a heading, `zu check: <noun> levels violations by importer:` (or `by imported package:`), then one line per package at two or more, `  %6d  <id>`. The count is right-aligned in the 6 characters of the rule column, so each id starts where a violation's `from` starts.
   - The packages at one each come last, folded into one line: `  %6d  other importers, 1 each` with their number, or `       1  other importer` when there is one. So the counts sum to the total.
   - The closing line is written when there are two or more Levels violations and the first package holds half or more of them and more than the second: `zu check: <n> of <total> <noun> levels violations start in <id>` for an importer, `… end in <id>` for an imported package.
3. **Both counts** (`writeCounts`): the importer count and its closing line, then the imported count and its closing line.
4. **Where they are written.**
   - On stdout, after the summary line, over the new violations (`fresh`), with the noun "new". With no new Levels violations nothing is written.
   - On stderr, after `-update-baseline`'s listing when it creates the Baseline, over what it accepts, with the noun "accepted".
5. **What does not change:** the violation lines, the summary line, stderr's other lines, the exit codes, the Baseline file, the Policy and its hash, and `zu diff`. The stdout `zu check` wrote before 25 is a prefix of the stdout it writes now.

## Out of scope

- **`zu diff`'s violations section** (text, Markdown, JSON). 25 owns `check.go` and `zu check`'s output only.
- **The HTML and the View, the Proposal view, the Policy format and the Baseline format.**
- **A Policy key that exempts a package** (`roots:` or similar). It would hide 38 real upward imports on agent-orchestrator, and ranking `daemon` outermost already works (**Goal**).
- **A `-format` flag for `check`.** `check` writes text only; **Doc amendments** corrects `decisions.md`, which says otherwise.

## Overlap

25 touches four Go files and no others:
- `internal/cli/check.go` and `internal/cli/check_test.go` (modified);
- `internal/policy/tally.go` and `internal/policy/tally_test.go` (new).

The planned build order is 21 → 25 → 26 → 24.
- **21 (Externals Rail)** changes `web/` only and no Go file, so 25's diffs apply after it unchanged.
- **26 (`zu scan -mermaid`)** owns `internal/cli/scan.go`. 25 does not touch it. Both work in package `cli`, where 25 adds `end`, `importerEnd`, `importedEnd`, `writeCounts` and `writeCount`, and, in tests, `importerRepo`; 26 must not declare these names. The tests reuse `layeredPolicy` (`check_test.go`) without changing it. 25's tests call three helpers in other test files without changing them: `run` (`cli_test.go`), `repo` (`scan_test.go`) and `writeFile` (`diff_test.go`). If 26 renames `repo`, 25's tests must follow.
- **24 (Proposal arrows)** changes `policy.go`, `proposal.go`, the View JSON and the UI, not `check.go`. 25 adds `Tally`, `ByImporter`, `ByImported` and `tally` to package `policy`; 24 must not declare them.
- **22 (Type Map)** is not planned yet.
- **Docs.** 25 rewrites `decisions.md`'s **Output formats** bullet, amends the `check` row of `requirements-draft.md`'s command table, and adds a glossary entry after Baseline. 26 will also amend the **Output formats** bullet, on top of 25's text. 24 and 26 may amend the same files on other lines; doc amendments are applied by hand.

The plans of 24 and 26 were not written when this one was, so this section rests on the lead's description of them.

## Deviations and decisions for review

On 2026-10-22 the lead accepted 1–6 and 8–10 of the first draft as set, and decided 7 (the fold, reversing the first draft's every-package list) and 11 (the imported count). 12 is this draft's wording for 11's closing line.

1. **"Importer", not "source".** The output says "by importer" and "start in". The glossary's Walk entry already calls the package at a violation's `from` end its importer. "Source" means source code everywhere else in zu: the Code Panel, `/source`, `export.SourceFile`. The feature keeps its name, Check by Source, and its directory.
2. **New violations only.** The counts cover the lines printed above them. A count that took in known violations would name packages the reader cannot see in the output. With a Baseline that holds every current violation, `zu check` prints no count.
3. **Levels violations only, and each heading says "levels".** A cycle has no single importer or imported package (**Architecture 1**). A closing line's total is the Levels count, so it reads "38 of 57 new levels violations", not "new violations" as in the brief's example: with `cycles: true`, the summary's "N new" holds both rules, and "of N new violations" would be false.
4. **After the summary line, not between it and the violations.** 06's contract reads "each new violation …, then `zu check: N new, K known, F fixed`", and it stays true as written. The stdout of before 25 is a prefix of the stdout after it, so a reader that stops at the summary line sees no change. Stderr was weighed: it would keep stdout byte-identical in every mode, but the counts are part of the report, and a CI step that saves or posts `zu check`'s stdout would lose them. The cost is under **Risks**: `tail -n 1` no longer gives the summary.
5. **`-update-baseline` counts what it accepts, too.** When it creates the Baseline it lists every violation it accepts on stderr. That is the moment a team accepts 57 violations, 38 of them from one package, so the same counts follow the listing, with "accepted". It is the same function, and with one violation it writes nothing.
6. **When a count and a closing line are written.** The rules are the same for both ends.
   - A count needs two or more packages, one of them at two or more. With one package, the closing line says it all: "2 of 2 new levels violations start in …". When every package is at one, the count would be a single fold line.
   - The closing line needs half or more, as the brief sets, and more than any other package. At exactly half, two packages can tie (2 and 2 of 4), and naming one by id order would be arbitrary. There is no closing line at 1 of 1, by choice: "1 of 1 … start in X" would repeat the only violation line.
7. **The fold** (decided by the lead, 2026-10-22, from the first draft's open question). On agent-orchestrator, 19 of the 20 importers start one violation each, and 34 of the 38 imported packages are imported by one. Each count lists only the packages at two or more, then one line for the rest, with their number: "19  other importers, 1 each". One left over reads "1  other importer", without "1 each". The fold line comes last even when its number is the largest; the names are in the violation lines above.
8. **No hint.** A closing line states a count. It does not say what to do with it. Ranking `daemon` outermost is in this plan's Scenario, not in zu's output.
9. **No new Policy key**, as the brief decides.
10. **The counts are in `internal/policy`, the format in `internal/cli`.** `ByImporter` and `ByImported` are pure and tested on their own. A new file keeps them apart from what 24 changes.
11. **The imported count** (decided by the lead, 2026-10-22, from the first draft's measurement). It is the importer count's twin: same rules, same order, "by imported package" and "end in". It follows the importer count and its closing line. On agent-orchestrator after the daemon fix it is the only count printed: `httpd/apierr`, 16 of 19.
12. **"End in" for the imported count's closing line**, mirroring "start in": `zu check: 16 of 19 new levels violations end in …/httpd/apierr`.

## Measurements

Pass criteria, set before the run, from the brief and the lead's revision:
- `zu check`'s existing lines on agent-orchestrator equal `ao.check.txt`'s, byte for byte: 58 on stdout and 1 on stderr;
- the importer count names `internal/daemon` with 38, and its closing line says 38 of 57;
- with `internal/daemon` ranked with `internal/cli`, the imported count alone prints, naming `internal/httpd/apierr` with 16 of 19;
- two runs write the same bytes.

**The run** (2026-10-22, by hand, on the revised branch). The lead's shallow clone of agent-orchestrator at 7c83bd6, with the lead's `zu.policy.yaml`, was copied with `cp -cR` into the scratch directory. Two binaries were built with `CGO_ENABLED=0 go build ./cmd/zu`, one at the base and one at the branch's last commit; `check` needs no UI. Each ran `zu check <copy>`, stdout and stderr to separate files. zu only parsed the clone; nothing of the clone's ran.

| Check | Result |
|---|---|
| base build: stdout, then stderr, against `ao.check.txt` | identical (`cmp`): the measurement reproduces the lead's file |
| 25's build: exit code | 1, as before |
| 25's build: stdout lines 1–58 | identical to the base's (the base's stdout is a prefix of 25's) |
| 25's build: stderr | identical to the base's (1 line) |
| 25's build: stdout lines 59–68 | the counts below: `internal/daemon` 38 of 57; `internal/httpd/apierr` 17, under half, so no closing line |
| two runs of 25's build | identical stdout and stderr |
| `-update-baseline` (no Baseline) | exit 0; stderr: the header, the 57 lines, then the same 10 lines with "accepted" (68 lines); stdout `zu check: 0 new, 57 known, 0 fixed` |
| `daemon` ranked with `cli` (the fix), base build | exit 1; 19 new; 20 stdout lines, 1 stderr line |
| `daemon` ranked with `cli`, 25's build | exit 1; the base's 20 lines as a prefix, then the imported count alone (4 lines): `internal/httpd/apierr` 16 of 19; stderr identical to the base's |

25's stdout lines 59–68, before the fix:

```text
zu check: new levels violations by importer:
      38  github.com/aoagents/agent-orchestrator/backend/internal/daemon
      19  other importers, 1 each
zu check: 38 of 57 new levels violations start in github.com/aoagents/agent-orchestrator/backend/internal/daemon
zu check: new levels violations by imported package:
      17  github.com/aoagents/agent-orchestrator/backend/internal/httpd/apierr
       2  github.com/aoagents/agent-orchestrator/backend/internal/observe/scm
       2  github.com/aoagents/agent-orchestrator/backend/internal/service/shellterm
       2  github.com/aoagents/agent-orchestrator/backend/internal/service/usage
      34  other imported packages, 1 each
```

25's stdout lines 21–24, after ranking `daemon` with `cli`:

```text
zu check: new levels violations by imported package:
      16  github.com/aoagents/agent-orchestrator/backend/internal/httpd/apierr
       3  other imported packages, 1 each
zu check: 16 of 19 new levels violations end in github.com/aoagents/agent-orchestrator/backend/internal/httpd/apierr
```

All criteria pass.

## Doc amendments (exact text; not task steps)

**`docx/core/decisions.md`, line 44 (Output formats).** The bullet says `check` takes `-format`, which it never did, and it is where the counts belong: they describe what `check` writes, not what the Baseline means. The **Baseline** bullet (line 23) is unchanged; it already defines new violations as those the Baseline does not hold. Replace the bullet:

> - **Output formats:** `diff`/`check` take `-format text|markdown|json`; markdown can be pasted as a PR comment; HTML via export. The summary includes the blast-radius count and says "no structural change" when only cosmetic edits were made.

with:

> - **Output formats:** `diff` takes `-format text|markdown|json`, and `check` writes text only; markdown can be pasted as a PR comment; HTML via export. The summary includes the blast-radius count and says "no structural change" when only cosmetic edits were made. After its summary line, `check` counts the new Levels violations by importer, then by imported package (25). Each count is written when it groups something, two or more packages with one of them at two or more: `zu check: new levels violations by importer:` (or `by imported package:`), then one line per package at two or more, `  <count>  <package>`, most first, ties by id, then the rest in one line, `  <N>  other importers, 1 each` (`other importer` for one). Each count's closing line, `zu check: N of M new levels violations start in <package>` (`end in` for an imported package), is written, with or without its count's heading, when there are two or more Levels violations and one package holds half or more of them and more than any other. Cycle violations are not counted: a cycle's arc lies between boxes, lifted from imports that may start in many packages, so it has no single importer or imported package. Every line `check` wrote before 25 is written as it was. When `-update-baseline` creates the Baseline, it counts what it accepts the same way, on stderr after its list, with "accepted" for "new".

**`docx/core/requirements-draft.md`, line 182 (the command table).** Replace the `check` row's last cell, "Violations on stdout, exit code", with:

> Violations on stdout, then the new Levels violations counted by importer and by imported package (25); exit code

**`docx/glossary.md`, a new entry after Baseline:**

> ## Importer
>
> The package an import starts in; the package it names is the imported package. A Levels violation's importer is its inner package, which imports a package in an outer Level. `zu check` counts its new Levels violations by importer and by imported package (25). A cycle violation is an arc between boxes, lifted from imports that may start in many packages, so it has no single importer or imported package.

## Tasks

### Task 1: Count Levels violations by importer and by imported package (`internal/policy/tally.go`)

The test (`tally_test.go`, new) counts five Levels violations, out of order, with two cycle arcs among them. By importer: 2, 2 and 1, the tie by id. By imported package: 3, 1 and 1, the tie by id. The cycle arcs are left out, and violations that are all cycles give no tallies.

**Files:**
- Test: `internal/policy/tally_test.go` (new)
- Code: `internal/policy/tally.go` (new)

**Steps:**

- [ ] **Write the failing test**

<!-- file: internal/policy/tally_test.go -->
```go
package policy

import (
	"slices"
	"testing"
)

// 25: Levels violations counted by the package each starts in and by the
// package each imports, most first, ties by id; a cycle's arcs have no
// single importer or imported package and are left out.
func TestTalliesCountLevelsViolationsByEachEnd(t *testing.T) {
	vs := []Violation{
		{RuleLevels, "m/c", "m/x"},
		{RuleLevels, "m/b", "m/z"},
		{RuleLevels, "m/a", "m/y"},
		{RuleLevels, "m/b", "m/x"},
		{RuleLevels, "m/a", "m/x"},
		{RuleCycle, "m/q", "m/r"},
		{RuleCycle, "m/r", "m/q"},
	}
	if got, want := ByImporter(vs), []Tally{{"m/a", 2}, {"m/b", 2}, {"m/c", 1}}; !slices.Equal(got, want) {
		t.Errorf("ByImporter = %v, want %v", got, want)
	}
	if got, want := ByImported(vs), []Tally{{"m/x", 3}, {"m/y", 1}, {"m/z", 1}}; !slices.Equal(got, want) {
		t.Errorf("ByImported = %v, want %v", got, want)
	}
	cycles := []Violation{{RuleCycle, "m/q", "m/r"}}
	if len(ByImporter(cycles)) != 0 || len(ByImported(cycles)) != 0 {
		t.Error("cycles only: want no tallies")
	}
}
```

- [ ] **Run:** `go test ./internal/policy -run TestTallies -count=1` Expected: FAIL (`undefined: ByImporter`, `undefined: ByImported`, `undefined: Tally`)

- [ ] **Implement**

<!-- file: internal/policy/tally.go -->
```go
package policy

import (
	"cmp"
	"slices"
)

// Tally is a package and the number of Levels violations at one end of
// which it stands (25).
type Tally struct {
	ID    string
	Count int
}

// ByImporter counts the Levels violations among vs by importer, the package
// each starts in, most first, ties by id. A cycle's arcs are left out: an
// arc between boxes has no single importer.
func ByImporter(vs []Violation) []Tally {
	return tally(vs, func(v Violation) string { return v.From })
}

// ByImported counts the Levels violations among vs by the package each
// imports, as ByImporter counts them by importer.
func ByImported(vs []Violation) []Tally {
	return tally(vs, func(v Violation) string { return v.To })
}

func tally(vs []Violation, end func(Violation) string) []Tally {
	n := map[string]int{}
	for _, v := range vs {
		if v.Rule == RuleLevels {
			n[end(v)]++
		}
	}
	out := make([]Tally, 0, len(n))
	for id, c := range n {
		out = append(out, Tally{id, c})
	}
	slices.SortFunc(out, func(a, b Tally) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(a.ID, b.ID))
	})
	return out
}
```

- [ ] **Run:** `go test ./internal/policy -count=1` Expected: PASS

- [ ] **Commit:** `Count Levels violations by importer and by imported package`

### Task 2: `zu check` writes both counts (`internal/cli/check.go`)

The tests compare whole outputs, not substrings:
- `TestCheckCountsNewViolationsByEachEnd`: six new violations, four from `dom/w`, and three into `app/e`. After the six lines and the summary, as before, come both counts with their fold lines, "4 of 6" for `dom/w` and "3 of 6" for `app/e`. `-update-baseline` writes the same counts on stderr with "accepted", and stdout is the summary alone. Two new violations from a new importer then give "2 of 2", and the Baseline's six are not counted.
- `TestCheckLeavesCyclesOutOfTheCounts`: with `cycles: true`, two cycle arcs are listed as before and are in neither count nor in either total: "2 of 3" at each end, each fold line in the singular.
- `TestCheckCountsOnlyWhenTheyGroup`, eight cases of what follows the summary line: one violation, one each from three importers into three packages, and a cycles-only Policy with a cycle (nothing); one importer, and one imported package (that end's closing line alone); a tie at 2 and 2 at both ends (both counts, no closing line); half and ahead (both counts and both closing lines); under half (the importer count alone). The first three pass before 25: they pin today's output.

`importerRepo` writes a module whose packages make the given imports, under a given Policy.

**Files:**
- Test: `internal/cli/check_test.go`
- Code: `internal/cli/check.go`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/internal/cli/check_test.go b/internal/cli/check_test.go
index 8ff9bd4..491539a 100644
--- a/internal/cli/check_test.go
+++ b/internal/cli/check_test.go
@@ -157,3 +157,137 @@ func TestCheckKeepsBaselineWhenBudgetUncommented(t *testing.T) {
 		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
 	}
 }
+
+// importerRepo is a repo in module example.com/m whose packages make the
+// given imports ("dom/a>app/x"), under the Policy text pol.
+func importerRepo(t *testing.T, pol string, imports ...string) string {
+	t.Helper()
+	deps := map[string][]string{}
+	for _, imp := range imports {
+		from, to, _ := strings.Cut(imp, ">")
+		deps[from] = append(deps[from], to)
+		if _, ok := deps[to]; !ok {
+			deps[to] = nil // a package that only is imported
+		}
+	}
+	files := map[string]string{"go.mod": "module example.com/m\n", policy.FileName: pol}
+	for pkg, tos := range deps {
+		body := "package " + pkg[strings.LastIndex(pkg, "/")+1:] + "\n"
+		for _, to := range tos {
+			body += "\nimport _ \"example.com/m/" + to + "\"\n"
+		}
+		files[pkg+"/f.go"] = body
+	}
+	return repo(t, files)
+}
+
+// 25: after the summary, the new Levels violations counted by importer and
+// by imported package, packages with one each folded into one line, and a
+// closing line for a package at half or more of them. The lines before are
+// as they were. -update-baseline counts what it accepts the same way.
+func TestCheckCountsNewViolationsByEachEnd(t *testing.T) {
+	dir := importerRepo(t, layeredPolicy,
+		"dom/w>app/a", "dom/w>app/b", "dom/w>app/c", "dom/w>app/e", "dom/p>app/e", "dom/q>app/e")
+	lines := "  levels  example.com/m/dom/p → example.com/m/app/e\n" +
+		"  levels  example.com/m/dom/q → example.com/m/app/e\n" +
+		"  levels  example.com/m/dom/w → example.com/m/app/a\n" +
+		"  levels  example.com/m/dom/w → example.com/m/app/b\n" +
+		"  levels  example.com/m/dom/w → example.com/m/app/c\n" +
+		"  levels  example.com/m/dom/w → example.com/m/app/e\n"
+	counts := func(noun string) string {
+		return "zu check: " + noun + " levels violations by importer:\n" +
+			"       4  example.com/m/dom/w\n" +
+			"       2  other importers, 1 each\n" +
+			"zu check: 4 of 6 " + noun + " levels violations start in example.com/m/dom/w\n" +
+			"zu check: " + noun + " levels violations by imported package:\n" +
+			"       3  example.com/m/app/e\n" +
+			"       3  other imported packages, 1 each\n" +
+			"zu check: 3 of 6 " + noun + " levels violations end in example.com/m/app/e\n"
+	}
+	want := lines + "zu check: 6 new, 0 known, 0 fixed\n" + counts("new")
+	if code, out, _ := run("check", dir); code != ExitViolation || out != want {
+		t.Fatalf("exit %d, stdout:\n%s\nwant:\n%s", code, out, want)
+	}
+
+	wantErr := "zu check: created " + policy.BaselineFile + ", accepting 6 violations:\n" + lines + counts("accepted")
+	if code, out, errOut := run("check", "-update-baseline", dir); code != ExitOK || errOut != wantErr || out != "zu check: 0 new, 6 known, 0 fixed\n" {
+		t.Fatalf("exit %d, stdout %q, stderr:\n%s\nwant:\n%s", code, out, errOut, wantErr)
+	}
+
+	// Known violations are not counted: the Baseline holds dom/w's four.
+	writeFile(t, dir, "dom/d/f.go", "package d\n\nimport _ \"example.com/m/app/a\"\n\nimport _ \"example.com/m/app/b\"\n")
+	want = "  levels  example.com/m/dom/d → example.com/m/app/a\n" +
+		"  levels  example.com/m/dom/d → example.com/m/app/b\n" +
+		"zu check: 2 new, 6 known, 0 fixed\n" +
+		"zu check: 2 of 2 new levels violations start in example.com/m/dom/d\n"
+	if code, out, _ := run("check", dir); code != ExitViolation || out != want {
+		t.Fatalf("exit %d, stdout:\n%s\nwant:\n%s", code, out, want)
+	}
+}
+
+// 25: a cycle's arcs have no single importer or imported package, so they
+// are neither counted nor in the total.
+func TestCheckLeavesCyclesOutOfTheCounts(t *testing.T) {
+	dir := importerRepo(t, layeredPolicy+"cycles: true\n",
+		"dom/a>app/x", "dom/a>app/y", "dom/b>app/x", "p>q/x", "q/y>p")
+	want := "  levels  example.com/m/dom/a → example.com/m/app/x\n" +
+		"  levels  example.com/m/dom/a → example.com/m/app/y\n" +
+		"  levels  example.com/m/dom/b → example.com/m/app/x\n" +
+		"  cycle   example.com/m/p → example.com/m/q\n" +
+		"  cycle   example.com/m/q → example.com/m/p\n" +
+		"zu check: 5 new, 0 known, 0 fixed\n" +
+		"zu check: new levels violations by importer:\n" +
+		"       2  example.com/m/dom/a\n" +
+		"       1  other importer\n" +
+		"zu check: 2 of 3 new levels violations start in example.com/m/dom/a\n" +
+		"zu check: new levels violations by imported package:\n" +
+		"       2  example.com/m/app/x\n" +
+		"       1  other imported package\n" +
+		"zu check: 2 of 3 new levels violations end in example.com/m/app/x\n"
+	if code, out, _ := run("check", dir); code != ExitViolation || out != want {
+		t.Fatalf("exit %d, stdout:\n%s\nwant:\n%s", code, out, want)
+	}
+}
+
+// 25: a count is printed only when it groups something (two or more
+// packages, one at two or more), and a closing line only when one package
+// is at half or more of the violations and more than any other.
+func TestCheckCountsOnlyWhenTheyGroup(t *testing.T) {
+	const (
+		byImporter = "zu check: new levels violations by importer:\n"
+		byImported = "zu check: new levels violations by imported package:\n"
+	)
+	for name, tc := range map[string]struct {
+		pol     string // layeredPolicy when empty
+		imports []string
+		after   string // stdout after the summary line
+	}{
+		"one":          {"", []string{"dom/a>app/x"}, ""},
+		"one each":     {"", []string{"dom/a>app/x", "dom/b>app/y", "dom/c>app/z"}, ""},
+		"cycles only":  {"cycles: true\n", []string{"p>q/x", "q/y>p"}, ""},
+		"one importer": {"", []string{"dom/a>app/x", "dom/a>app/y"}, "zu check: 2 of 2 new levels violations start in example.com/m/dom/a\n"},
+		"one imported": {"", []string{"dom/a>app/x", "dom/b>app/x"}, "zu check: 2 of 2 new levels violations end in example.com/m/app/x\n"},
+		"tied": {"", []string{"dom/a>app/x", "dom/a>app/y", "dom/b>app/x", "dom/b>app/y"},
+			byImporter + "       2  example.com/m/dom/a\n       2  example.com/m/dom/b\n" +
+				byImported + "       2  example.com/m/app/x\n       2  example.com/m/app/y\n"},
+		"half, ahead": {"", []string{"dom/a>app/x", "dom/a>app/y", "dom/b>app/x", "dom/c>app/x"},
+			byImporter + "       2  example.com/m/dom/a\n       2  other importers, 1 each\n" +
+				"zu check: 2 of 4 new levels violations start in example.com/m/dom/a\n" +
+				byImported + "       3  example.com/m/app/x\n       1  other imported package\n" +
+				"zu check: 3 of 4 new levels violations end in example.com/m/app/x\n"},
+		"under half": {"", []string{"dom/a>app/v", "dom/a>app/w", "dom/b>app/x", "dom/c>app/y", "dom/d>app/z"},
+			byImporter + "       2  example.com/m/dom/a\n       3  other importers, 1 each\n"},
+	} {
+		t.Run(name, func(t *testing.T) {
+			pol := tc.pol
+			if pol == "" {
+				pol = layeredPolicy
+			}
+			_, out, _ := run("check", importerRepo(t, pol, tc.imports...))
+			_, after, ok := strings.Cut(out, " fixed\n")
+			if !ok || after != tc.after {
+				t.Fatalf("stdout:\n%s\nwant after the summary:\n%s", out, tc.after)
+			}
+		})
+	}
+}
```

- [ ] **Run:** `go test ./internal/cli -run TestCheck -count=1` Expected: FAIL (the counts are absent: `TestCheckCountsNewViolationsByEachEnd`, `TestCheckLeavesCyclesOutOfTheCounts`, and 5 of `TestCheckCountsOnlyWhenTheyGroup`'s 8 cases; "one", "one each" and "cycles only" pass at red, as they pin today's output)

- [ ] **Implement**

```diff
diff --git a/internal/cli/check.go b/internal/cli/check.go
index 3a47371..3d7020b 100644
--- a/internal/cli/check.go
+++ b/internal/cli/check.go
@@ -99,6 +99,7 @@ func runCheck(args []string, stdout, stderr io.Writer) int {
 		if created {
 			fmt.Fprintf(stderr, "zu check: created %s, accepting %d violations:\n", policy.BaselineFile, len(base.Violations))
 			writeViolations(stderr, base.Violations)
+			writeCounts(stderr, "accepted", base.Violations)
 		} else {
 			fmt.Fprintf(stderr, "zu check: wrote %s (%d violations)\n", policy.BaselineFile, len(base.Violations))
 		}
@@ -107,6 +108,7 @@ func runCheck(args []string, stdout, stderr io.Writer) int {
 	fresh, fixed := base.Split(current)
 	writeViolations(stdout, fresh)
 	fmt.Fprintf(stdout, "zu check: %d new, %d known, %d fixed\n", len(fresh), len(current)-len(fresh), len(fixed))
+	writeCounts(stdout, "new", fresh)
 	if len(fixed) > 0 && !*update {
 		fmt.Fprintf(stderr, "zu check: run zu check -update-baseline to drop %d fixed entries from %s\n", len(fixed), policy.BaselineFile)
 	}
@@ -130,6 +132,57 @@ func readBaseline(read func(string) ([]byte, error)) (*policy.Baseline, error) {
 	return policy.DecodeBaseline(data)
 }
 
+// end names one end of a Levels violation in writeCount's lines.
+type end struct {
+	by, other, others, verb string
+}
+
+var (
+	importerEnd = end{"importer", "other importer", "other importers, 1 each", "start in"}
+	importedEnd = end{"imported package", "other imported package", "other imported packages, 1 each", "end in"}
+)
+
+// writeCounts counts the Levels violations in vs by importer, then by
+// imported package (25), after the lines that list them. noun says which
+// violations they are ("new", "accepted").
+func writeCounts(w io.Writer, noun string, vs []policy.Violation) {
+	writeCount(w, noun, importerEnd, policy.ByImporter(vs))
+	writeCount(w, noun, importedEnd, policy.ByImported(vs))
+}
+
+// writeCount writes one end's tallies when they group something: two or
+// more packages, one of them at two or more. It lists the packages at two or
+// more, then folds the rest, at one each, into one line. The closing line
+// names a package at half or more of the violations and more than any other.
+func writeCount(w io.Writer, noun string, e end, ts []policy.Tally) {
+	if len(ts) == 0 {
+		return
+	}
+	total, ones := 0, 0
+	for _, t := range ts {
+		total += t.Count
+		if t.Count == 1 {
+			ones++
+		}
+	}
+	if len(ts) > 1 && ts[0].Count > 1 {
+		fmt.Fprintf(w, "zu check: %s levels violations by %s:\n", noun, e.by)
+		for _, t := range ts[:len(ts)-ones] {
+			fmt.Fprintf(w, "  %6d  %s\n", t.Count, t.ID)
+		}
+		switch {
+		case ones == 1:
+			fmt.Fprintf(w, "  %6d  %s\n", ones, e.other)
+		case ones > 1:
+			fmt.Fprintf(w, "  %6d  %s\n", ones, e.others)
+		}
+	}
+	top := ts[0]
+	if total > 1 && 2*top.Count >= total && (len(ts) == 1 || ts[1].Count < top.Count) {
+		fmt.Fprintf(w, "zu check: %d of %d %s levels violations %s %s\n", top.Count, total, noun, e.verb, top.ID)
+	}
+}
+
 // writeViolations lists violations one per line, sorted as given.
 func writeViolations(w io.Writer, vs []policy.Violation) {
 	for _, v := range vs {
```

- [ ] **Run:** `go test ./internal/cli ./internal/policy -count=1` Expected: PASS

- [ ] **Commit:** `Count zu check's new Levels violations by importer and by imported package`

### Task 3: Acceptance

**Files:**
- Record: `docx/features/25-check-by-source/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output: golangci-lint prints nothing when it finds nothing, and its wrapper can exit 0 with issues)

- [ ] **Measure** (by hand; not a replay step).
  1. Copy the agent-orchestrator clone at 7c83bd6, with the lead's `zu.policy.yaml`, with `cp -cR`. It is untrusted: zu parses it; run nothing of its own.
  2. Build `bin/zu` at this plan's base and at its last task, in two checkouts (`CGO_ENABLED=0 go build -o … ./cmd/zu`).
  3. Run each build's `zu check <copy> >out 2>err`. Check that the base's out and err, concatenated, equal `ao.check.txt`, and that the base's out is a prefix of 25's and their err is the same.
  4. Run 25's build again and `cmp` both files with the first run's.
  5. Run `zu check -update-baseline <copy>`, then delete the Baseline it wrote.
  6. In the copy's Policy, move `…/internal/daemon` from the first Level to the last, beside `…/internal/cli`. Run both builds again: the base's stdout is a prefix of 25's, and 25's ends with the imported count alone.
  7. Record the results in `acceptance.md`, against **Measurements**. The step passes when they reproduce this plan's table and both outputs.

- [ ] **Commit:** `Record Check by Source's acceptance`

---

## Risks

- **`tail -n 1` no longer gives the summary.** The counts follow the summary line (Deviation 4), so a script that takes stdout's last line as `zu check: N new, K known, F fixed` gets a closing line or a fold line whenever a count is written: on agent-orchestrator, `zu check: 38 of 57 new levels violations start in …`. A script that greps the summary (`^zu check: [0-9]+ new`) or reads up to it is unaffected. The README and the docs give no such script.
- **A script that treats every line starting with two spaces as a violation** reads the counts' lines too. A violation line holds " → "; a count's line never does.
- **The counts' length.** A count lists only packages at two or more, then one fold line, so it has at most half as many package lines as there are violations, plus the fold line, its heading and its closing line. On agent-orchestrator the two counts take 10 lines under 57 violations.
- **The fold line can hold the largest number** ("34  other imported packages, 1 each" under four packages at 17, 2, 2 and 2). It is always last, and its words say what it is.
- **An unanchored `grep -c levels`** now overcounts: the counts' headings and closing lines contain "levels". `grep -c '^  levels'` counts the violation lines alone.
- **A count above 999,999** widens its column, and the ids after it stop lining up. That is all.

## Notes

- **Task count: 3**, within Quick mode's limit.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given.
  - Task 1 is red on a build failure: `Tally`, `ByImporter` and `ByImported` are undefined.
  - Task 2 is red on assertions: 2 tests and 5 of the third's 8 cases, each on output that stops at the summary line.
- **The model never authors the graph.** The counts read `Policy.Check`'s violations; nothing is inferred.
- **Output stays byte-identical.** `tally` sorts by a total order (count, then id, and ids are unique), so map order never reaches the output. Two runs on agent-orchestrator wrote the same bytes.
- **Found and corrected in the docs:** `decisions.md`'s **Output formats** bullet said `check` takes `-format text|markdown|json`. It does not: `check.go` has no `-format` flag. **Doc amendments** rewrites the bullet; no code changes for it.
- **Follow-ups, not in 25:** the counts in `zu diff`'s violations section.

## Replay record

Replayed with `replay.py` on 2026-10-22, after scrutiny's fixes, on a fresh `git archive` of `main` at da92a30, in a scratch directory. `web/node_modules` was clone-copied from the repository (`cp -cR`). This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. The plan replayed differs from this one only in its Replay record. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `go test ./internal/policy -run TestTallies -count=1` | 1 |
| 1 | green | `go test ./internal/policy -count=1` | 0 |
| 2 | red | `go test ./internal/cli -run TestCheck -count=1` | 1 |
| 2 | green | `go test ./internal/cli ./internal/policy -count=1` | 0 |
| 3 | green | `make check` | 0 |

- After Task 3, the replayed tree was byte-identical to the scratch branch's last commit in every file (`diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output). 4 files change against the base: 261 lines added, none removed.
- `golangci-lint run ./...` in the replayed tree printed nothing, and with `--issues-exit-code=7` it exited 0: no issues. On the scratch branch, `make check` ran 12 Go packages' tests with `-race` and 372 vitest tests in 33 files, all passing. The replay shows `make check`'s last line, a warning the UI build prints on stderr.
- The red reasons were seen as stated, on the scratch branch's red commits, since `replay.py` prints only each step's last line:
  - Task 1: the build fails, with `Tally`, `ByImporter` and `ByImported` undefined.
  - Task 2: `TestCheckCountsNewViolationsByEachEnd` and `TestCheckLeavesCyclesOutOfTheCounts` fail, and 5 of `TestCheckCountsOnlyWhenTheyGroup`'s 8 cases (one importer, one imported, tied, half and ahead, under half), each on output that stops at the summary line. "one", "one each" and "cycles only" pass.
- The fixes changed tests and prose only: `check.go`, `tally.go` and `tally_test.go` are byte-identical to the build measured under **Measurements**, so its figures stand.
- Toolchain: Go 1.24.5, Node 24.17.0, Python 3.11.17, macOS on an Apple M2.
