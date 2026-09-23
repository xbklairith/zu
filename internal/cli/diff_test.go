package cli

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/diff"
	"zu/internal/policy"
)

// diffRepo commits a two-package module on main, then branches feat and
// changes a.F there. It leaves feat checked out and the test inside the repo.
func diffRepo(t *testing.T) string {
	t.Helper()
	needGit(t)
	dir := repo(t, map[string]string{
		"go.mod":     "module example.com/m\n",
		"a/a.go":     "package a\n\nfunc F() int { return 1 }\n\nfunc G() {}\n",
		"b/b.go":     "package b\n\nimport \"example.com/m/a\"\n\nfunc B() { a.G() }\n",
		".gitignore": "/gen/\n",
	})
	git(t, dir, "init", "-q", "-b", "main")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "base")
	git(t, dir, "checkout", "-q", "-b", "feat")
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 2 }\n\nfunc G() {}\n")
	git(t, dir, "commit", "-q", "-am", "change F")
	t.Chdir(dir)
	return dir
}

func writeFile(t *testing.T, dir, rel, body string) {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func summaryOf(t *testing.T, out string) *diff.Summary {
	t.Helper()
	var s diff.Summary
	if err := json.Unmarshal([]byte(out), &s); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	return &s
}

func nodeStatus(s *diff.Summary, id string) diff.Status {
	for _, n := range s.Nodes {
		if n.ID == id {
			return n.Status
		}
	}
	return ""
}

func TestDiffMarkdown(t *testing.T) {
	diffRepo(t)
	code, out, errOut := run("diff", "main", "-format", "markdown")
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if !strings.Contains(out, "| `example.com/m/a` | modified | +0 ~1 −0 | 0 |") {
		t.Errorf("Markdown lacks the package row:\n%s", out)
	}
	if !strings.HasPrefix(errOut, "zu diff: 1 packages changed, 2 affected, parse errors base=0 head=0") || strings.Count(errOut, "\n") != 1 {
		t.Errorf("status line = %q", errOut)
	}
}

func TestDiffWorktree(t *testing.T) {
	dir := diffRepo(t)
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 2 }\n\nfunc G() {}\n\nfunc Edit() {}\n")
	writeFile(t, dir, "c/c.go", "package c\n\nfunc Untracked() {}\n")
	writeFile(t, dir, "gen/g.go", "package gen\n\nfunc Ignored() {}\n")

	_, out, _ := run("diff", "main", "-format", "json")
	s := summaryOf(t, out)
	if nodeStatus(s, "example.com/m/a.Edit") != "" || s.Head.Dirty {
		t.Errorf("without -worktree the edit must be absent: head %+v", s.Head)
	}

	_, out, _ = run("diff", "main", "-worktree", "-format", "json")
	s = summaryOf(t, out)
	if nodeStatus(s, "example.com/m/a.Edit") != diff.Added || nodeStatus(s, "example.com/m/c.Untracked") != diff.Added {
		t.Errorf("-worktree must include the edit and the untracked file: %+v", s.Nodes)
	}
	if nodeStatus(s, "example.com/m/gen.Ignored") != "" || !s.Head.Dirty {
		t.Errorf("-worktree must exclude ignored files and be dirty: %+v %+v", s.Nodes, s.Head)
	}
	_, out, _ = run("diff", "main", "-worktree")
	if !strings.Contains(out, "(worktree)") {
		t.Errorf("header must say worktree:\n%s", out)
	}

	_, out, _ = run("diff", "main", "-worktree", "-include-ignored", "-format", "json")
	if nodeStatus(summaryOf(t, out), "example.com/m/gen.Ignored") != diff.Added {
		t.Errorf("-include-ignored must include the ignored file:\n%s", out)
	}
}

func TestDiffMove(t *testing.T) {
	dir := diffRepo(t)
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 2 }\n\nfunc H() {}\n")
	writeFile(t, dir, "b/b.go", "package b\n\nimport \"example.com/m/a\"\n\nfunc B() { a.H() }\n")
	git(t, dir, "commit", "-q", "-am", "rename G")
	_, out, _ := run("diff", "main", "-format", "json")
	s := summaryOf(t, out)
	if len(s.Moves) != 1 || s.Moves[0].From != "example.com/m/a.G" || s.Moves[0].To != "example.com/m/a.H" {
		t.Fatalf("Moves = %+v", s.Moves)
	}
	if nodeStatus(s, "example.com/m/a.G") != "" || nodeStatus(s, "example.com/m/a.H") != "" {
		t.Errorf("a moved declaration must not be added or removed: %+v", s.Nodes)
	}
}

func TestDiffNoChange(t *testing.T) {
	diffRepo(t)
	code, out, errOut := run("diff", "HEAD", "HEAD")
	if code != ExitOK || !strings.Contains(out, "no structural change") {
		t.Fatalf("exit %d: %s%s", code, out, errOut)
	}
}

func TestDiffBadInvocation(t *testing.T) {
	diffRepo(t)
	for name, args := range map[string][]string{
		"no base":                        {"diff"},
		"three refs":                     {"diff", "main", "feat", "HEAD"},
		"include-ignored alone":          {"diff", "main", "-include-ignored"},
		"worktree with an explicit head": {"diff", "main", "feat", "-worktree"},
		"unknown ref":                    {"diff", "nope"},
		"option-like ref":                {"diff", "-x"},
		"option-like head":               {"diff", "main", "--", "-x"},
		"bad format":                     {"diff", "main", "-format", "yaml"},
		"negative tolerance":             {"diff", "main", "-max-parse-errors", "-1"},
	} {
		code, out, errOut := run(args...)
		if code != ExitBadInvocation || errOut == "" || out != "" {
			t.Errorf("%s: exit %d, stdout %q, stderr %q; want %d with a reason", name, code, out, errOut, ExitBadInvocation)
		}
	}
	t.Chdir(t.TempDir())
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(t.TempDir()))
	if code, _, _ := run("diff", "HEAD"); code != ExitBadInvocation {
		t.Errorf("outside a repository: exit %d", code)
	}
}

func TestDiffShallowClone(t *testing.T) {
	src := diffRepo(t)
	git(t, src, "checkout", "-q", "main")
	writeFile(t, src, "a/m.go", "package a\n\nfunc M() {}\n")
	git(t, src, "add", "-A")
	git(t, src, "commit", "-q", "-m", "main moves on")
	dst := filepath.Join(t.TempDir(), "clone")
	git(t, t.TempDir(), "clone", "-q", "--depth", "1", "--branch", "feat", "file://"+src, dst)
	git(t, dst, "fetch", "-q", "--depth", "1", "origin", "main:main")
	t.Chdir(dst)
	code, out, errOut := run("diff", "main")
	if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, "fetch-depth: 0") {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
	}
}

func TestDiffParseErrors(t *testing.T) {
	dir := diffRepo(t)
	writeFile(t, dir, "a/bad.go", "package a\n\nfunc {\n")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "break")
	code, out, errOut := run("diff", "main", "-max-parse-errors", "0")
	if code != ExitParseFailure || !strings.Contains(out, "Parse errors: base 0, head 1") {
		t.Fatalf("exit %d: %s%s", code, out, errOut)
	}
	if code, _, _ := run("diff", "main", "-max-parse-errors", "1"); code != ExitOK {
		t.Errorf("tolerated parse error: exit %d", code)
	}
	// An error already on the base branch, fixed on the MR branch, is
	// pre-existing: reported, never failing.
	git(t, dir, "checkout", "-q", "-b", "fix")
	git(t, dir, "rm", "-q", "a/bad.go")
	git(t, dir, "commit", "-q", "-m", "fix")
	code, _, errOut = run("diff", "feat", "-max-parse-errors", "0")
	if code != ExitOK || !strings.Contains(errOut, "parse errors base=1 head=0") {
		t.Errorf("base-only parse error: exit %d, stderr %q", code, errOut)
	}
}

// Head's Policy governs both sides (ADR 0004): the MR that adds a Policy is
// diffed like any other, and a package it excludes is excluded at base too,
// so excluding it is not a removal. Under -worktree the working tree's
// Policy governs.
func TestDiffScansBothSidesUnderHeadsPolicy(t *testing.T) {
	needGit(t)
	dir := repo(t, map[string]string{
		"go.mod":        "module example.com/m\n",
		"a/a.go":        "package a\n",
		"gen/gen.pb.go": "package gen\n\nfunc Old() {}\n",
	})
	git(t, dir, "init", "-q", "-b", "main")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "base")
	git(t, dir, "checkout", "-q", "-b", "feat")
	writeFile(t, dir, "gen/gen.pb.go", "package gen\n\nfunc New() {}\n")
	writeFile(t, dir, policy.FileName, "exclude: [\"**/*.pb.go\"]\n")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "add a Policy")
	t.Chdir(dir)
	code, out, errOut := run("diff", "main", "-format", "json")
	if code != ExitOK {
		t.Fatalf("the MR adding a Policy: exit %d, stderr %q", code, errOut)
	}
	if s := summaryOf(t, out); s.Changed {
		t.Errorf("gen is excluded on both sides, want no change: %+v", s.Packages)
	}

	writeFile(t, dir, policy.FileName, "order: [example.com/m/a]\n") // no exclude
	code, out, errOut = run("diff", "main", "-worktree", "-format", "json")
	if code != ExitOK {
		t.Fatalf("-worktree: exit %d, stderr %q", code, errOut)
	}
	s := summaryOf(t, out)
	if len(s.Packages) != 1 || s.Packages[0].ID != "example.com/m/gen" || s.Packages[0].Status != "modified" {
		t.Errorf("under the working tree's Policy gen is scanned on both sides and modified: %+v", s.Packages)
	}
}

func TestDiffFromSubdirectory(t *testing.T) {
	dir := diffRepo(t)
	_, top, _ := run("diff", "main", "-format", "json")
	t.Chdir(filepath.Join(dir, "a"))
	_, sub, errOut := run("diff", "main", "-format", "json")
	if top != sub || top == "" {
		t.Fatalf("output differs from a subdirectory (%s):\n%s\n---\n%s", errOut, top, sub)
	}
}

func TestDiffInterrupted(t *testing.T) {
	diffRepo(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	oldCtx, oldResolve := interruptContext, gitResolve
	t.Cleanup(func() { interruptContext, gitResolve = oldCtx, oldResolve })
	interruptContext = func() (context.Context, context.CancelFunc) { return ctx, cancel }
	gitResolve = func(c context.Context, d, ref string) (string, string, error) {
		top, commit, err := oldResolve(c, d, ref)
		cancel()
		return top, commit, err
	}
	if code, out, errOut := run("diff", "main"); code != ExitBadInvocation || out != "" {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
	}
}

func TestDiffHTMLWritesTheChangeView(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	base := git(t, dir, "rev-parse", "main")
	head := git(t, dir, "rev-parse", "HEAD")
	out := filepath.Join(t.TempDir(), "change.html")

	code, stdout, errOut := run("diff", "main", "-html", out)
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if !strings.Contains(stdout, "example.com/m/a") {
		t.Errorf("the Structural Summary is no longer on stdout:\n%s", stdout)
	}
	s := readFile(t, out)
	for _, want := range []string{
		`"kind":"change"`,
		`"changed":["example.com/m/a"]`,
		`"a/a.go":[{"baseStart":1`,
		`"+func F() int { return 2 }"`,
		`"compare":"https://github.com/o/r/compare/` + base + `...` + head + `"`,
		`"blob":"https://github.com/o/r/blob/` + head + `/{path}#L{line}"`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %s", want)
		}
	}
	if !strings.Contains(errOut, "zu diff: html → "+out+" (1 source files inlined") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestDiffHTMLWorktreeHasNoLinks(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 3 }\n\nfunc G() {}\n")
	out := filepath.Join(t.TempDir(), "change.html")
	if code, _, errOut := run("diff", "main", "-worktree", "-html", out); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	s := readFile(t, out)
	if strings.Contains(s, `"links"`) {
		t.Error("a dirty head must not link to the host")
	}
	if !strings.Contains(s, `"+func F() int { return 3 }"`) {
		t.Error("the worktree edit is not in the hunks")
	}
}

func TestDiffHTMLBadInvocations(t *testing.T) {
	withUI(t)
	diffRepo(t)
	out := filepath.Join(t.TempDir(), "change.html")
	for _, args := range [][]string{
		{"diff", "main", "-html", out, "-include", "./a"},
		{"diff", "main", "-link-template", "https://h/{path}"},
		{"diff", "main", "-html", "-"},
	} {
		if code, _, errOut := run(args...); code != ExitBadInvocation {
			t.Errorf("%v: exit %d, want %d (%s)", args, code, ExitBadInvocation, errOut)
		}
	}
	if _, err := os.Stat(out); err == nil {
		t.Error("a bad invocation wrote the html")
	}
}

func TestDiffHTMLKeepsTheParseFailureExit(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	writeFile(t, dir, "c/c.go", "package c\n\nfunc {\n")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-qm", "broken")
	out := filepath.Join(t.TempDir(), "change.html")
	if code, _, errOut := run("diff", "main", "-html", out); code != ExitParseFailure {
		t.Fatalf("exit %d, want %d: %s", code, ExitParseFailure, errOut)
	}
	if _, err := os.Stat(out); err != nil {
		t.Errorf("html not written before the parse-failure exit: %v", err)
	}
}

// A change that adds a Levels violation exits 1 and lists it first; one
// already at base is pre-existing (B7, B9).
func TestDiffNewViolationExitsOne(t *testing.T) {
	needGit(t)
	dir := repo(t, map[string]string{
		"go.mod":        "module example.com/m\n",
		"a/a.go":        "package a\n",
		"b/b.go":        "package b\n\nimport _ \"example.com/m/a\"\n",
		policy.FileName: "levels: [example.com/m/b, example.com/m/a]\n", // b inner: b → a is known
	})
	git(t, dir, "init", "-q", "-b", "main")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "base")
	git(t, dir, "checkout", "-q", "-b", "feat")
	t.Chdir(dir)
	code, out, errOut := run("diff", "main")
	if code != ExitOK || !strings.Contains(out, "No new violations · 0 fixed, 1 pre-existing") {
		t.Fatalf("known only: exit %d, stdout %q, stderr %q", code, out, errOut)
	}

	writeFile(t, dir, "b/c/c.go", "package c\n\nimport _ \"example.com/m/a\"\n")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "add c")
	code, out, errOut = run("diff", "main", "-format", "json")
	if code != ExitViolation || !strings.Contains(errOut, "1 new violations") {
		t.Fatalf("new violation: exit %d, stderr %q", code, errOut)
	}
	s := summaryOf(t, out)
	if s.Violations == nil || len(s.Violations.New) != 1 || s.Violations.New[0].From != "example.com/m/b/c" || s.Violations.Known != 1 {
		t.Fatalf("violations = %+v", s.Violations)
	}
}

// A level naming a package the MR deletes is a warning, not a stop: check
// enforces it on the tree that has the stale name. The MR that also fixes
// the Policy passes cleanly, since head's Policy governs both sides.
func TestDiffWarnsWhenALevelNamesNoPackage(t *testing.T) {
	needGit(t)
	dir := repo(t, map[string]string{
		"go.mod":        "module example.com/m\n",
		"a/a.go":        "package a\n",
		"b/b.go":        "package b\n",
		"c/c.go":        "package c\n",
		policy.FileName: "levels: [example.com/m/a, example.com/m/b, example.com/m/c]\n",
	})
	git(t, dir, "init", "-q", "-b", "main")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "base")
	git(t, dir, "checkout", "-q", "-b", "feat")
	git(t, dir, "rm", "-q", "c/c.go")
	git(t, dir, "commit", "-q", "-m", "delete c")
	t.Chdir(dir)
	code, _, errOut := run("diff", "main")
	if code != ExitOK || !strings.Contains(errOut, "warning") || !strings.Contains(errOut, `"example.com/m/c"`) {
		t.Fatalf("deleted ranked package: exit %d, stderr %q", code, errOut)
	}

	writeFile(t, dir, policy.FileName, "levels: [example.com/m/a, example.com/m/b]\n")
	git(t, dir, "commit", "-q", "-am", "drop c from the levels")
	code, _, errOut = run("diff", "main")
	if code != ExitOK || strings.Contains(errOut, "warning") {
		t.Fatalf("Policy fixed in the same MR: exit %d, stderr %q", code, errOut)
	}
}
