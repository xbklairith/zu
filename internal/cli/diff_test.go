package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/diff"
	"zu/internal/gitref"
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
	git(t, dir, "update-ref", "refs/remotes/origin/feat", head) // pushed and fetched
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
		// 14: the base blob, the file's diff and F's changed line on the compare page.
		`"base":"https://github.com/o/r/blob/` + base + `/{path}#L{line}"`,
		`"files":{"a/a.go":"https://github.com/o/r/compare/` + base + `...` + head + `#diff-` + aGo + `"}`,
		`"nodes":{"example.com/m/a.F":"https://github.com/o/r/compare/` + base + `...` + head + `#diff-` + aGo + `R3"}`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %s", want)
		}
	}
	if !strings.Contains(errOut, "zu diff: html → "+out+" (1 source files inlined") {
		t.Errorf("stderr = %q", errOut)
	}
}

// With -mr N (14b) every host diff link, the header's too, targets the pull
// request's files page; the base blob stays.
func TestDiffHTMLLinksTheMergeRequest(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	base := git(t, dir, "rev-parse", "main")
	git(t, dir, "update-ref", "refs/remotes/origin/feat", "HEAD") // pushed and fetched
	out := filepath.Join(t.TempDir(), "change.html")
	if code, _, errOut := run("diff", "main", "-html", out, "-mr", "7"); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	s := readFile(t, out)
	const pr = "https://github.com/o/r/pull/7/files"
	for _, want := range []string{
		`"compare":"` + pr + `"`,
		`"mr":"PR #7"`,
		`"base":"https://github.com/o/r/blob/` + base + `/{path}#L{line}"`,
		`"files":{"a/a.go":"` + pr + `#diff-` + aGo + `"}`,
		`"nodes":{"example.com/m/a.F":"` + pr + `#diff-` + aGo + `R3"}`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %s", want)
		}
	}
	if strings.Contains(s, "/compare/") {
		t.Error("with -mr a link still targets the compare page")
	}
}

// aGo is GitHub's anchor of a/a.go: printf %s a/a.go | shasum -a 256.
const aGo = "6f0e76217f46bde75131273709c148632e8120c9be0617a825f09640d38454a5"

// A dirty head links nothing on the host but the base side (14): the base
// commit is clean, and a removed declaration is found there.
func TestDiffHTMLWorktreeLinksOnlyTheBase(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	git(t, dir, "update-ref", "refs/remotes/origin/feat", "HEAD")
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 3 }\n\nfunc G() {}\n")
	out := filepath.Join(t.TempDir(), "change.html")
	if code, _, errOut := run("diff", "main", "-worktree", "-html", out); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	s := readFile(t, out)
	base := git(t, dir, "rev-parse", "main")
	if !strings.Contains(s, `"links":{"blob":"","base":"https://github.com/o/r/blob/`+base+`/{path}#L{line}"}`) {
		t.Error("a dirty head must link only to the base commit")
	}
	if !strings.Contains(s, `"+func F() int { return 3 }"`) {
		t.Error("the worktree edit is not in the hunks")
	}
}

// A commit no remote-tracking ref holds is not on the host yet, so nothing
// links to it there (14): only the base, which origin/main holds.
func TestDiffHTMLUnpushedHeadLinksOnlyTheBase(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	git(t, dir, "update-ref", "refs/remotes/origin/main", "main")
	out := filepath.Join(t.TempDir(), "change.html")
	code, _, errOut := run("diff", "main", "-html", out)
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	s := readFile(t, out)
	base := git(t, dir, "rev-parse", "main")
	if !strings.Contains(s, `"links":{"blob":"","base":"https://github.com/o/r/blob/`+base+`/{path}#L{line}"}`) {
		t.Error("an unpushed head must link only to the base commit")
	}
	head := git(t, dir, "rev-parse", "HEAD")
	if !strings.Contains(errOut, "zu diff: note: "+head[:12]+" is on no remote-tracking ref") {
		t.Errorf("stderr does not say why host links are missing: %q", errOut)
	}
	git(t, dir, "update-ref", "-d", "refs/remotes/origin/main")
	if code, _, errOut := run("diff", "main", "-html", out); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if s := readFile(t, out); strings.Contains(s, `"links"`) {
		t.Error("with nothing on the remote, nothing links to the host")
	}
	// A host zu does not link to is never "left out": no note.
	git(t, dir, "remote", "set-url", "origin", "git@bitbucket.org:o/r.git")
	code, _, errOut = run("diff", "main", "-html", out)
	if code != ExitOK || strings.Contains(errOut, "remote-tracking") {
		t.Errorf("exit %d, stderr %q", code, errOut)
	}
}

// When git diff fails, the Change View is still written, and each changed
// declaration links to its file's diff on the compare page (14).
func TestDiffHTMLGitDiffFailureLinksEachFile(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	git(t, dir, "update-ref", "refs/remotes/origin/feat", "HEAD")
	old := gitDiff
	gitDiff = func(context.Context, string, string, string) ([]gitref.FileDiff, error) {
		return nil, errors.New("boom")
	}
	t.Cleanup(func() { gitDiff = old })
	out := filepath.Join(t.TempDir(), "change.html")
	code, _, errOut := run("diff", "main", "-html", out)
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if !strings.Contains(errOut, "zu diff: note: git diff failed (boom); host links point at each file's diff") {
		t.Errorf("stderr = %q", errOut)
	}
	cmp := `https://github.com/o/r/compare/` + git(t, dir, "rev-parse", "main") + `...` + git(t, dir, "rev-parse", "HEAD") + `#diff-` + aGo
	if s := readFile(t, out); !strings.Contains(s, `"nodes":{"example.com/m/a.F":"`+cmp+`"}`) {
		t.Error("a.F does not link to its file's diff")
	}
}

// A package moved with git mv and edited in two lines links each file under
// its new path: a moved declaration the edit changed to its line, one the
// edit missed to its file, never to a line the host shows for something
// else (14).
func TestDiffHTMLMovedPackageLinksTheNewPath(t *testing.T) {
	withUI(t)
	needGit(t)
	// Long enough that two edited lines keep it a rename: git, like the
	// host, calls a file renamed while at least half of it is unchanged.
	var filler string
	for i := range 20 {
		filler += fmt.Sprintf("\nfunc H%d() {}\n", i)
	}
	dir := repo(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"a/a.go": "package a\n\nfunc F() int { return 1 }\n\nfunc G() {}\n" + filler,
		"b/b.go": "package b\n\nimport \"example.com/m/a\"\n\nfunc B() { a.G() }\n",
	})
	git(t, dir, "init", "-q", "-b", "main")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "base")
	git(t, dir, "checkout", "-q", "-b", "feat")
	t.Chdir(dir)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	git(t, dir, "mv", "a", "c")
	writeFile(t, dir, "c/a.go", "package c\n\nfunc F() int { return 1 }\n\nfunc G() { _ = 0 }\n"+filler)
	writeFile(t, dir, "b/b.go", "package b\n\nimport \"example.com/m/c\"\n\nfunc B() { c.G() }\n")
	git(t, dir, "commit", "-q", "-am", "move a to c")
	base := git(t, dir, "rev-parse", "main")
	head := git(t, dir, "rev-parse", "HEAD")
	git(t, dir, "update-ref", "refs/remotes/origin/feat", head)
	out := filepath.Join(t.TempDir(), "change.html")
	if code, _, errOut := run("diff", "main", "-html", out); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	s := readFile(t, out)
	cmp := `https://github.com/o/r/compare/` + base + `...` + head + `#diff-`
	for _, want := range []string{
		`"files":{"b/b.go":"` + cmp + bGo + `","c/a.go":"` + cmp + cGo + `"}`,
		`"example.com/m/c.F":"` + cmp + cGo + `"`,
		`"example.com/m/c.G":"` + cmp + cGo + `R5"`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %s", want)
		}
	}
	if strings.Contains(s, aGo) {
		t.Error("a link names the old path a/a.go")
	}
}

// bGo and cGo are GitHub's anchors of b/b.go and c/a.go (sha256 of the path).
const (
	bGo = "9c7fdc5697cffd37ba63c15d88f002ab329e2f2a8f46b1cd123b008262c69a68"
	cGo = "7223cd615191d576a1cca14f37997bd46bb87aa82f9c241a6b6ed4b11079cbb1"
)

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

// -mr (14b) takes an integer from 1, with -html, and needs a merge request
// to point at: never with -link-template, nor without a hosted origin.
func TestDiffHTMLMergeRequestBadInvocations(t *testing.T) {
	withUI(t)
	diffRepo(t) // no origin
	out := filepath.Join(t.TempDir(), "change.html")
	for _, tc := range []struct {
		args []string
		want string
	}{
		{[]string{"-html", out, "-mr", "x"}, "-mr wants a merge request number from 1"},
		{[]string{"-html", out, "-mr", "0"}, "-mr wants a merge request number from 1"},
		{[]string{"-html", out, "-mr", "-3"}, "-mr wants a merge request number from 1"},
		{[]string{"-mr", "7"}, "-mr needs -html"},
		{[]string{"-html", out, "-mr", "7", "-link-template", "https://h/{commit}/{path}"}, "-mr does not apply with -link-template"},
		{[]string{"-html", out, "-mr", "7"}, "-mr needs an origin on GitHub or GitLab"},
	} {
		code, _, errOut := run(append([]string{"diff", "main"}, tc.args...)...)
		if code != ExitBadInvocation || !strings.Contains(errOut, tc.want) {
			t.Errorf("%v: exit %d, stderr %q; want exit 3 with %q", tc.args, code, errOut, tc.want)
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
