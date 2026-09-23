package cli

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/diff"
	"zu/internal/ir"
	"zu/internal/scan"
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

func TestDiffPolicyChanged(t *testing.T) {
	diffRepo(t)
	old := scanTree
	t.Cleanup(func() { scanTree = old })
	calls := 0
	scanTree = func(ctx context.Context, tree scan.Tree) (*ir.IR, scan.Stats, error) {
		doc, stats, err := old(ctx, tree)
		if calls++; calls == 2 && err == nil {
			doc.PolicyHash = "sha256:other"
		}
		return doc, stats, err
	}
	code, out, errOut := run("diff", "main")
	if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, "policy changed") {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
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
