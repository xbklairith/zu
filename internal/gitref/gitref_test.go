package gitref

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"
)

func needGit(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_AUTHOR_NAME", "t")
	t.Setenv("GIT_AUTHOR_EMAIL", "t@example.com")
	t.Setenv("GIT_COMMITTER_NAME", "t")
	t.Setenv("GIT_COMMITTER_EMAIL", "t@example.com")
}

func run(t *testing.T, dir string, args ...string) string {
	t.Helper()
	out, err := exec.Command("git", append([]string{"-C", dir}, args...)...).CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return string(out)
}

func write(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestHeadOutsideRepository(t *testing.T) {
	needGit(t)
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(t.TempDir()))
	commit, dirty := Head(context.Background(), t.TempDir())
	if commit != "" || dirty {
		t.Fatalf("got (%q, %v), want (\"\", false)", commit, dirty)
	}
}

func TestHeadRepositoryWithoutCommits(t *testing.T) {
	needGit(t)
	dir := t.TempDir()
	run(t, dir, "init", "-q")
	write(t, filepath.Join(dir, "a.go"), "package a\n")
	commit, dirty := Head(context.Background(), dir)
	if commit != "" || dirty {
		t.Fatalf("got (%q, %v), want (\"\", false)", commit, dirty)
	}
}

func TestHeadCleanDirtyAndUntracked(t *testing.T) {
	needGit(t)
	dir := t.TempDir()
	run(t, dir, "init", "-q")
	write(t, filepath.Join(dir, "a.go"), "package a\n")
	run(t, dir, "add", "a.go")
	run(t, dir, "commit", "-q", "-m", "one")
	want := run(t, dir, "rev-parse", "HEAD")
	want = want[:len(want)-1]

	commit, dirty := Head(context.Background(), dir)
	if commit != want || dirty {
		t.Fatalf("clean: got (%q, %v), want (%q, false)", commit, dirty, want)
	}
	if len(commit) != 40 && len(commit) != 64 {
		t.Fatalf("commit %q is not a full id", commit)
	}

	write(t, filepath.Join(dir, "new.go"), "package a\n")
	if _, dirty := Head(context.Background(), dir); dirty {
		t.Fatal("untracked file must not make the tree dirty")
	}

	write(t, filepath.Join(dir, "a.go"), "package a // edited\n")
	if _, dirty := Head(context.Background(), dir); !dirty {
		t.Fatal("modified tracked file must make the tree dirty")
	}
}

func TestHeadWithoutGitBinary(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	commit, dirty := Head(context.Background(), t.TempDir())
	if commit != "" || dirty {
		t.Fatalf("got (%q, %v), want (\"\", false)", commit, dirty)
	}
}

// A scanned repository is untrusted: its config must not run code, and
// reading its state must not modify it (REQ-042, REQ-003).
func TestHeadRunsNoRepoConfiguredCodeAndWritesNothing(t *testing.T) {
	needGit(t)
	dir := t.TempDir()
	run(t, dir, "init", "-q")
	write(t, filepath.Join(dir, "a.go"), "package a\n")
	run(t, dir, "add", "a.go")
	run(t, dir, "commit", "-q", "-m", "one")
	marker := filepath.Join(t.TempDir(), "PWNED")
	run(t, dir, "config", "core.fsmonitor", "touch "+marker+"; false")
	write(t, filepath.Join(dir, "a.go"), "package a // edited\n")

	index := filepath.Join(dir, ".git", "index")
	before, err := os.Stat(index)
	if err != nil {
		t.Fatal(err)
	}
	if _, dirty := Head(context.Background(), dir); !dirty {
		t.Fatal("want dirty")
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("repository-configured fsmonitor command was executed")
	}
	after, err := os.Stat(index)
	if err != nil {
		t.Fatal(err)
	}
	if !after.ModTime().Equal(before.ModTime()) {
		t.Fatal(".git/index was rewritten")
	}
}

func TestPrefix(t *testing.T) {
	needGit(t)
	top := t.TempDir()
	run(t, top, "init", "-q")
	sub := filepath.Join(top, "sub", "dir")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if got := Prefix(ctx, top); got != "" {
		t.Errorf("Prefix(top) = %q, want \"\"", got)
	}
	if got := Prefix(ctx, sub); got != "sub/dir/" {
		t.Errorf("Prefix(sub/dir) = %q, want \"sub/dir/\"", got)
	}
}

func TestOrigin(t *testing.T) {
	needGit(t)
	dir := t.TempDir()
	run(t, dir, "init", "-q")
	ctx := context.Background()
	if got := Origin(ctx, dir); got != "" {
		t.Errorf("Origin without a remote = %q, want \"\"", got)
	}
	run(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	if got := Origin(ctx, dir); got != "git@github.com:o/r.git" {
		t.Errorf("Origin = %q", got)
	}
}

// Meta names the files a commit, checkout, reset or add rewrites, which 13's
// watch polls beside the tree: HEAD, the index, the ref HEAD names and
// packed-refs. A ref lives in the common directory of a linked worktree.
func TestMeta(t *testing.T) {
	needGit(t)
	dir := t.TempDir()
	run(t, dir, "init", "-q")
	run(t, dir, "symbolic-ref", "HEAD", "refs/heads/trunk")
	top, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	g := filepath.Join(top, ".git")
	want := []string{filepath.Join(g, "HEAD"), filepath.Join(g, "index"), filepath.Join(g, "packed-refs"), filepath.Join(g, "refs", "heads", "trunk")}
	if got := Meta(context.Background(), dir); !slices.Equal(got, want) {
		t.Errorf("Meta = %v, want %v", got, want)
	}
	run(t, dir, "commit", "-q", "--allow-empty", "-m", "one")
	wt := filepath.Join(t.TempDir(), "wt")
	run(t, dir, "worktree", "add", "-q", "-b", "side", wt)
	wtop, err := filepath.EvalSymlinks(wt)
	if err != nil {
		t.Fatal(err)
	}
	wg := filepath.Join(g, "worktrees", filepath.Base(wtop))
	want = []string{filepath.Join(wg, "HEAD"), filepath.Join(wg, "index"), filepath.Join(g, "packed-refs"), filepath.Join(g, "refs", "heads", "side")}
	if got := Meta(context.Background(), wt); !slices.Equal(got, want) {
		t.Errorf("a linked worktree: Meta = %v, want %v", got, want)
	}
	run(t, dir, "checkout", "-q", "--detach")
	want = []string{filepath.Join(g, "HEAD"), filepath.Join(g, "index"), filepath.Join(g, "packed-refs")}
	if got := Meta(context.Background(), dir); !slices.Equal(got, want) {
		t.Errorf("a detached HEAD: Meta = %v, want %v", got, want)
	}
	if got := Meta(context.Background(), t.TempDir()); got != nil {
		t.Errorf("outside a repository: %v", got)
	}
}
