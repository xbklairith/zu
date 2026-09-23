package gitref

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// linkRepo commits a tree with every symlink case the disk walk handles and
// returns its root and the commit id.
func linkRepo(t *testing.T) (string, string) {
	t.Helper()
	needGit(t)
	dir := t.TempDir()
	files := map[string]string{
		"go.mod":       "module example.com/m\n",
		"a/a.go":       "package a\n",
		"vendor/v.go":  "package v\n",
		".hidden/h.go": "package h\n",
		"_x/x.go":      "package x\n",
		"g/deep/d.go":  "package deep\n",
	}
	for rel, body := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		write(t, p, body)
	}
	links := map[string]string{
		"b/link.go":   "../a/a.go",        // in-tree file
		"c/l2.go":     "../b/link.go",     // chain
		"d/out.go":    "../../etc/passwd", // leaves the tree
		"e":           "a",                // directory
		"f/gone.go":   "nope.go",          // dangling
		"h/via.go":    "../gd/d.go",       // through a directory link
		"gd":          "g/deep",           // directory link used by h/via.go
		"i/loop.go":   "loop.go",          // loop
		"vendor/l.go": "../a/a.go",        // inside a pruned directory
		"j/abs.go":    "/etc/passwd",      // absolute
	}
	for rel, target := range links {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(target, p); err != nil {
			t.Fatal(err)
		}
	}
	run(t, dir, "init", "-q")
	run(t, dir, "add", "-A")
	run(t, dir, "commit", "-q", "-m", "links")
	return dir, strings.TrimSpace(run(t, dir, "rev-parse", "HEAD"))
}

func TestCommitTreeFiles(t *testing.T) {
	dir, commit := linkRepo(t)
	write(t, filepath.Join(dir, "a", "a.go"), "package a // edited, not committed\n")

	tree, err := OpenCommit(context.Background(), dir, commit)
	if err != nil {
		t.Fatal(err)
	}
	defer tree.Close()
	files, errs, err := tree.Files()
	if err != nil || len(errs) != 0 {
		t.Fatalf("Files: %v %v", errs, err)
	}
	want := []string{"a/a.go", "b/link.go", "c/l2.go", "g/deep/d.go", "go.mod", "h/via.go"}
	if !slices.Equal(files, want) {
		t.Fatalf("Files = %v\nwant    %v", files, want)
	}
	for _, rel := range []string{"a/a.go", "b/link.go", "c/l2.go"} {
		b, err := tree.ReadFile(rel)
		if err != nil || string(b) != "package a\n" {
			t.Errorf("ReadFile(%s) = %q, %v; want the committed a/a.go", rel, b, err)
		}
	}
	if b, err := tree.ReadFile("h/via.go"); err != nil || string(b) != "package deep\n" {
		t.Errorf("ReadFile(h/via.go) = %q, %v", b, err)
	}
	if _, err := tree.ReadFile("d/out.go"); err == nil {
		t.Error("a link leaving the tree must not be readable")
	}
	if err := tree.Err(); err != nil {
		t.Fatalf("Err = %v", err)
	}
}

func TestCommitTreeConcurrentReads(t *testing.T) {
	dir, commit := linkRepo(t)
	tree, err := OpenCommit(context.Background(), dir, commit)
	if err != nil {
		t.Fatal(err)
	}
	defer tree.Close()
	done := make(chan string)
	for range 8 {
		go func() {
			b, _ := tree.ReadFile("g/deep/d.go")
			done <- string(b)
		}()
	}
	for range 8 {
		if got := <-done; got != "package deep\n" {
			t.Fatalf("concurrent read = %q", got)
		}
	}
}

func TestResolve(t *testing.T) {
	dir, commit := linkRepo(t)
	sub := filepath.Join(dir, "a")
	ctx := context.Background()

	top, got, err := Resolve(ctx, sub, "HEAD")
	if err != nil || got != commit {
		t.Fatalf("Resolve(HEAD) = %q, %v; want %s", got, err, commit)
	}
	if want, _ := filepath.EvalSymlinks(dir); top != want {
		t.Errorf("top = %q, want %q", top, want)
	}
	if _, _, err := Resolve(ctx, dir, "nope"); err == nil || !strings.Contains(err.Error(), `"nope"`) {
		t.Errorf("Resolve(nope) err = %v, want one naming the ref", err)
	}
	if _, _, err := Resolve(ctx, dir, "-x"); err == nil || !strings.Contains(err.Error(), "-x") {
		t.Errorf("Resolve(-x) err = %v", err)
	}
	if _, _, err := Resolve(ctx, dir, ""); err == nil {
		t.Error("Resolve of an empty ref must fail")
	}
	if _, _, err := Resolve(ctx, t.TempDir(), "HEAD"); err == nil {
		t.Error("Resolve outside a repository must fail")
	}
}
