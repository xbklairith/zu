package gitref

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// worktreeRepo commits a/a.go, c/c.go and a link, then leaves: c/c.go
// deleted, b/b.go untracked, gen/g.go ignored, and .zu/ output ignored.
func worktreeRepo(t *testing.T) string {
	t.Helper()
	needGit(t)
	dir := t.TempDir()
	for rel, body := range map[string]string{
		"go.mod": "module m\n", "a/a.go": "package a\n", "c/c.go": "package c\n",
		".gitignore": "gen/\n", "sub/s.go": "package sub\n",
	} {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		write(t, p, body)
	}
	if err := os.Symlink("a.go", filepath.Join(dir, "a", "l.go")); err != nil {
		t.Fatal(err)
	}
	run(t, dir, "init", "-q")
	run(t, dir, "add", "-A")
	run(t, dir, "commit", "-q", "-m", "one")
	if err := os.Remove(filepath.Join(dir, "c", "c.go")); err != nil {
		t.Fatal(err)
	}
	for rel, body := range map[string]string{
		"b/b.go": "package b\n", "gen/g.go": "package gen\n", ".zu/.gitignore": "*\n", ".zu/ir/x.json": "{}",
	} {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		write(t, p, body)
	}
	return dir
}

func TestWorktreeFiles(t *testing.T) {
	dir := worktreeRepo(t)
	ctx := context.Background()

	l, err := WorktreeFiles(ctx, dir, false)
	if err != nil || l == nil {
		t.Fatalf("WorktreeFiles = %v, %v", l, err)
	}
	want := []string{".gitignore", "a/a.go", "a/l.go", "b/b.go", "go.mod", "sub/s.go"}
	if !slices.Equal(l.Files, want) {
		t.Errorf("Files = %v\nwant    %v", l.Files, want)
	}
	if !l.Extra {
		t.Error("b/b.go is untracked: Extra must be true")
	}

	l, err = WorktreeFiles(ctx, dir, true)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(l.Files, "gen/g.go") || !slices.Contains(l.Files, ".zu/ir/x.json") || !l.Extra {
		t.Errorf("with ignored files, Files = %v", l.Files)
	}

	l, err = WorktreeFiles(ctx, filepath.Join(dir, "a"), false)
	if err != nil || !slices.Equal(l.Files, []string{"a.go", "l.go"}) || l.Extra {
		t.Errorf("from a subdirectory: %+v, %v; want paths relative to it", l, err)
	}
}

func TestWorktreeFilesCleanAndOutside(t *testing.T) {
	dir := worktreeRepo(t)
	run(t, dir, "add", "-A")
	run(t, dir, "commit", "-q", "-m", "two")
	l, err := WorktreeFiles(context.Background(), dir, false)
	if err != nil || l.Extra {
		t.Fatalf("clean tree with only ignored extras: %+v, %v; want Extra false", l, err)
	}
	if l, err := WorktreeFiles(context.Background(), t.TempDir(), false); l != nil || err != nil {
		t.Fatalf("outside a repository = %+v, %v; want nil, nil", l, err)
	}
}
