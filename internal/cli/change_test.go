package cli

import (
	"context"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/scan"
)

// inlined is the View JSON zu wrote into an HTML page.
func inlined(t *testing.T, path string) string {
	t.Helper()
	html := readFile(t, path)
	open := `<script id="zu-data" type="application/json">`
	s := html[strings.Index(html, open)+len(open):]
	return s[:strings.Index(s, "</script>")]
}

// runAside is run with its own interrupt context, so a command that ends
// does not stop the zu serve startServe runs.
func runAside(args ...string) (int, string, string) {
	old := interruptContext
	interruptContext = func() (context.Context, context.CancelFunc) { return context.WithCancel(context.Background()) }
	defer func() { interruptContext = old }()
	return run(args...)
}

// zu serve -base sends the Change View zu diff -worktree -html writes for
// the same tree, byte for byte: on a clean worktree, with its host links,
// and after an edit, with none but the base's (14).
func TestServeBaseSendsTheViewDiffHTMLWrites(t *testing.T) {
	dir := diffRepo(t)
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	git(t, dir, "update-ref", "refs/remotes/origin/feat", "HEAD") // pushed and fetched
	url, _ := startServe(t, dir, "-base", "main", "-poll", "0")
	out := filepath.Join(t.TempDir(), "change.html")
	for i, edit := range []string{"", "package a\n\nfunc F() int { return 3 }\n\nfunc G() {}\n\nfunc H() {}\n"} {
		if edit != "" {
			writeFile(t, dir, "a/a.go", edit)
		}
		served := fetch(t, url+"view.json")
		if code, _, errOut := runAside("diff", "main", "-worktree", "-html", out); code != ExitOK {
			t.Fatalf("diff: exit %d: %s", code, errOut)
		}
		if want := inlined(t, out); served != want {
			t.Errorf("round %d: served View differs from zu diff's:\nserved %s\ndiff   %s", i, served, want)
		}
		if !strings.Contains(served, `"kind":"change"`) {
			t.Errorf("round %d: not a Change View: %.200s", i, served)
		}
		if linked := strings.Contains(served, `"nodes":{"example.com/m/a.F":"https://github.com/o/r/compare/`); linked != (edit == "") {
			t.Errorf("round %d: a.F linked to its hunk = %v, want %v", i, linked, edit == "")
		}
	}
	noZu(t, dir)
}

// The Base is scanned once and kept: again only when the merge-base or the
// Policy's hash moves (ADR 0004), never on an edit in the worktree.
func TestServeBaseScansTheBaseOnlyWhenItMoves(t *testing.T) {
	dir := diffRepo(t)
	var scans atomic.Int32
	old := scanTree
	scanTree = func(ctx context.Context, tree scan.Tree, pol *policy.Policy) (*ir.IR, scan.Stats, error) {
		scans.Add(1)
		return old(ctx, tree, pol)
	}
	t.Cleanup(func() { scanTree = old })
	url, _ := startServe(t, dir, "-base", "HEAD", "-poll", "0")
	step := func(what string, want int32) {
		t.Helper()
		fetch(t, url+"view.json")
		if got := scans.Load(); got != want {
			t.Errorf("%s: %d base scans, want %d", what, got, want)
		}
	}
	step("a reload", 1)
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 9 }\n\nfunc G() {}\n")
	step("an edit", 1)
	writeFile(t, dir, policy.FileName, "levels:\n  - [example.com/m/a]\n  - [example.com/m/b]\n")
	step("a new Policy", 2)
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "F is 9")
	step("a commit, which moves HEAD and the merge-base with it", 3)
}

// With a watch, a save is pushed as the Change View it makes.
func TestServeBaseWatchPushesTheChange(t *testing.T) {
	dir := diffRepo(t)
	url, _ := startServe(t, dir, "-base", "main", "-poll", "100ms")
	events := stream(t, url)
	if e := await(t, events); e != "view 1" {
		t.Fatalf("on connect: %q", e)
	}
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 2 }\n\nfunc G() {}\n\nfunc H() {}\n")
	if e := await(t, events); e != "view 2" {
		t.Fatalf("after a save: %q", e)
	}
	v := latest(t, url)
	if !strings.Contains(v, `"kind":"change"`) || !strings.Contains(v, `{"id":"example.com/m/a.H","kind":"function"`) ||
		!strings.Contains(v, `"status":"added"`) {
		t.Errorf("the pushed View lacks the added H: %.400s", v)
	}
}

func TestServeBaseBadInvocations(t *testing.T) {
	withUI(t)
	dir := diffRepo(t)
	notGit := repo(t, small)
	for _, tc := range []struct {
		args []string
		want string
	}{
		{[]string{dir, "-base", "main", "-include", "./a"}, "-include does not apply with -base"},
		{[]string{dir, "-base", "no-such-ref"}, "-base"},
		{[]string{notGit, "-base", "main"}, "-base"},
		{[]string{dir, "-base", "main", "-mr", "x"}, "-mr wants a merge request number from 1"},
		{[]string{dir, "-mr", "7"}, "-mr needs -base"},
		{[]string{dir, "-base", "main", "-mr", "7"}, "-mr needs an origin on GitHub or GitLab"}, // no origin
	} {
		code, out, errOut := run(append([]string{"serve", "-addr", "127.0.0.1:0"}, tc.args...)...)
		if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, tc.want) {
			t.Errorf("%v: exit %d, stdout %q, stderr %q; want exit 3 with %q", tc.args, code, out, errOut, tc.want)
		}
	}
}

// zu serve -base says once per session that GitHub hides a long compare's
// files, the first time it happens, not on every rescan (14b).
func TestServeBaseNotesAHiddenCompareOnce(t *testing.T) {
	dir := longCompare(t, 21)
	url, stderr := startServe(t, dir, "-base", "main", "-poll", "0")
	for range 3 {
		if l := linksOf(t, fetch(t, url+"view.json")); l.Nodes != nil || l.Files != nil {
			t.Fatalf("line links on a compare GitHub hides: %+v", l)
		}
	}
	if got := strings.Count(stderr.String(), hiddenNote); got != 1 {
		t.Errorf("the note is printed %d times, want once: %s", got, stderr.String())
	}
}
