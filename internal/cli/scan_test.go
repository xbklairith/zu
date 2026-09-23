package cli

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/ir"
)

func repo(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for rel, body := range files {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

var small = map[string]string{
	"go.mod":     "module example.com/m\n",
	"a/a.go":     "package a\n\nfunc F() { G() }\n\nfunc G() {}\n",
	"web/app.ts": "x",
}

func readIR(t *testing.T, path string) *ir.IR {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var doc ir.IR
	if err := json.Unmarshal(b, &doc); err != nil {
		t.Fatal(err)
	}
	return &doc
}

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	out, err := exec.Command("git", append([]string{"-C", dir}, args...)...).CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func needGit(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	for k, v := range map[string]string{
		"GIT_CONFIG_GLOBAL": os.DevNull, "GIT_CONFIG_NOSYSTEM": "1",
		"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
		"GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
	} {
		t.Setenv(k, v)
	}
}

func TestScanOutsideGitWritesWorktreeIR(t *testing.T) {
	dir := repo(t, small)
	code, out, errOut := run("scan", dir)
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if out != "" {
		t.Errorf("stdout = %q, want empty", out)
	}
	doc := readIR(t, filepath.Join(dir, ".zu", "ir", "worktree.json"))
	if doc.SchemaVersion != "1" || doc.Ref.Commit != "" || doc.Grouping != "tree" || len(doc.Nodes) != 3 {
		t.Fatalf("IR = %+v", doc)
	}
	gi, err := os.ReadFile(filepath.Join(dir, ".zu", ".gitignore"))
	if err != nil || string(gi) != "*\n" {
		t.Fatalf(".zu/.gitignore = %q, %v", gi, err)
	}
	want := "zu scan: 1 packages, 1 files, 0 parse errors, 0 unresolved calls, unsupported: .ts=1"
	if !strings.HasPrefix(errOut, want) || strings.Count(errOut, "\n") != 1 {
		t.Fatalf("summary = %q, want prefix %q", errOut, want)
	}
	entries, _ := os.ReadDir(filepath.Join(dir, ".zu", "ir"))
	if len(entries) != 1 {
		t.Fatalf("leftover files in .zu/ir: %v", entries)
	}
}

func TestScanNamesOutputByCommit(t *testing.T) {
	needGit(t)
	dir := repo(t, small)
	git(t, dir, "init", "-q")
	if code, _, errOut := run("scan", dir); code != ExitOK {
		t.Fatalf("no-commit repo: exit %d: %s", code, errOut)
	}
	if _, err := os.Stat(filepath.Join(dir, ".zu", "ir", "worktree.json")); err != nil {
		t.Fatal("repo without commits must write worktree.json")
	}
	git(t, dir, "add", "go.mod", "a/a.go")
	git(t, dir, "commit", "-q", "-m", "one")
	head := git(t, dir, "rev-parse", "HEAD")

	if code, _, errOut := run("scan", dir); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	doc := readIR(t, filepath.Join(dir, ".zu", "ir", head[:12]+".json"))
	if doc.Ref.Commit != head || doc.Ref.Dirty {
		t.Fatalf("ref = %+v", doc.Ref)
	}

	if err := os.WriteFile(filepath.Join(dir, "a", "a.go"), []byte("package a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if code, _, errOut := run("scan", dir); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	doc = readIR(t, filepath.Join(dir, ".zu", "ir", head[:12]+"-dirty.json"))
	if !doc.Ref.Dirty {
		t.Fatal("dirty IR must record dirty")
	}
}

func TestScanOutStdout(t *testing.T) {
	dir := repo(t, small)
	code, out, _ := run("scan", dir, "-out", "-")
	if code != ExitOK {
		t.Fatalf("exit %d", code)
	}
	var doc ir.IR
	if err := json.Unmarshal([]byte(out), &doc); err != nil || len(doc.Nodes) != 3 {
		t.Fatalf("stdout is not the IR: %v\n%s", err, out)
	}
	if _, err := os.Stat(filepath.Join(dir, ".zu")); !os.IsNotExist(err) {
		t.Fatal("-out - must not create .zu")
	}
}

func TestScanOutPath(t *testing.T) {
	dir := repo(t, small)
	target := filepath.Join(t.TempDir(), "out.json")
	if code, _, errOut := run("scan", "-out", target, dir); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if len(readIR(t, target).Nodes) != 3 {
		t.Fatal("wrong IR at -out path")
	}
	if _, err := os.Stat(filepath.Join(dir, ".zu")); !os.IsNotExist(err) {
		t.Fatal("-out path must not create .zu")
	}
}

func TestScanParseErrorTolerance(t *testing.T) {
	files := map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n", "b/b.go": "package b\n\nfunc {\n"}
	dir := repo(t, files)
	code, _, _ := run("scan", dir)
	if code != ExitParseFailure {
		t.Fatalf("exit %d, want %d", code, ExitParseFailure)
	}
	doc := readIR(t, filepath.Join(dir, ".zu", "ir", "worktree.json"))
	if len(doc.ParseErrors) != 1 {
		t.Fatalf("IR must still be written with the parse error: %+v", doc.ParseErrors)
	}
	if code, _, _ := run("scan", dir, "-max-parse-errors", "1"); code != ExitOK {
		t.Fatalf("exit %d with tolerance 1, want 0", code)
	}
}

func TestScanBadInvocation(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "nope")
	file := filepath.Join(repo(t, small), "go.mod")
	for name, args := range map[string][]string{
		"missing dir":    {"scan", missing},
		"file as dir":    {"scan", file},
		"unknown flag":   {"scan", "-frob"},
		"negative limit": {"scan", "-max-parse-errors", "-1", t.TempDir()},
		"two dirs":       {"scan", t.TempDir(), t.TempDir()},
	} {
		code, _, errOut := run(args...)
		if code != ExitBadInvocation {
			t.Errorf("%s: exit %d, want %d", name, code, ExitBadInvocation)
		}
		if errOut == "" {
			t.Errorf("%s: no reason on stderr", name)
		}
	}
	if _, err := os.Stat(filepath.Join(missing, ".zu")); !os.IsNotExist(err) {
		t.Fatal("nothing may be written for a bad invocation")
	}
}

func TestScanInterruptedDuringGitWritesNothing(t *testing.T) {
	root := repo(t, small)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	oldCtx, oldHead := interruptContext, gitHead
	t.Cleanup(func() { interruptContext, gitHead = oldCtx, oldHead })
	interruptContext = func() (context.Context, context.CancelFunc) { return ctx, cancel }
	gitHead = func(context.Context, string) (string, bool) {
		cancel() // Ctrl-C arrives while git runs; git then reports no commit
		return "", false
	}

	var stderr strings.Builder
	if code := Run([]string{"scan", root}, io.Discard, &stderr); code != ExitBadInvocation {
		t.Fatalf("exit = %d, want %d; stderr:\n%s", code, ExitBadInvocation, stderr.String())
	}
	if _, err := os.Stat(filepath.Join(root, ".zu")); !os.IsNotExist(err) {
		t.Fatalf("interrupted scan wrote .zu (err=%v)", err)
	}
}
