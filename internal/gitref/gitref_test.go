package gitref

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
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
