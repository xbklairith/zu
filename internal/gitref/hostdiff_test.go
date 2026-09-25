package gitref

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// funcs is a Go file of package pkg with n one-line functions F1…Fn, one
// per line from line 3.
func funcs(pkg string, n int) string {
	var b strings.Builder
	fmt.Fprintf(&b, "package %s\n\n", pkg)
	for i := 1; i <= n; i++ {
		fmt.Fprintf(&b, "func F%d() {}\n", i)
	}
	return b.String()
}

// put writes a file, making its directories.
func put(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	write(t, path, body)
}

// hostRepo commits a base, then a head that renames a/a.go to b/a.go with
// two lines edited, edits c/c.go (dropping its last newline), deletes
// d/gone.go, renames e/e.go to f/e.go unchanged, adds n/new.go, edits a path with a space and an accent, makes
// m.go executable and edits a README. It returns the two commits.
func hostRepo(t *testing.T) (dir, base, head string) {
	t.Helper()
	needGit(t)
	dir = t.TempDir()
	run(t, dir, "init", "-q", "-b", "main")
	files := map[string]string{
		"a/a.go":      funcs("a", 30),
		"c/c.go":      "package c\n\nfunc C() int {\n\treturn 1\n}\n",
		"d/gone.go":   "package d\n\nfunc Z() {}\n",
		"sp ace/é.go": "package sp\n\nfunc S() {}\n",
		"m.go":        "package m\n",
		"e/e.go":      "package e\n",
		"README.md":   "hello\n",
	}
	for p, body := range files {
		put(t, filepath.Join(dir, p), body)
	}
	run(t, dir, "add", "-A")
	run(t, dir, "commit", "-q", "-m", "base")
	base = strings.TrimSpace(run(t, dir, "rev-parse", "HEAD"))
	if err := os.Mkdir(filepath.Join(dir, "b"), 0o755); err != nil {
		t.Fatal(err)
	}
	run(t, dir, "mv", "a/a.go", "b/a.go")
	run(t, dir, "mv", "e", "f")
	write(t, filepath.Join(dir, "b/a.go"), strings.Replace(strings.Replace(funcs("a", 30), "package a", "package b", 1), "func F15() {}", "func F15() { _ = 1 }", 1))
	write(t, filepath.Join(dir, "c/c.go"), "package c\n\nfunc C() int {\n\treturn 2\n}")
	run(t, dir, "rm", "-q", "d/gone.go")
	put(t, filepath.Join(dir, "n/new.go"), "package n\n")
	write(t, filepath.Join(dir, "sp ace/é.go"), "package sp\n\nfunc S() { _ = 0 }\n")
	if err := os.Chmod(filepath.Join(dir, "m.go"), 0o755); err != nil { // #nosec G302 -- a test's mode change
		t.Fatal(err)
	}
	write(t, filepath.Join(dir, "README.md"), "bye\n")
	run(t, dir, "add", "-A")
	run(t, dir, "commit", "-q", "-m", "head")
	head = strings.TrimSpace(run(t, dir, "rev-parse", "HEAD"))
	return dir, base, head
}

// Diff gives each changed Go file as the host's compare page shows it: a
// rename under its new path with its old one and only the lines that moved
// in it, a deletion under its old path, a mode change with no hunks.
func TestDiff(t *testing.T) {
	dir, base, head := hostRepo(t)
	// A user's config must not change what the host would show.
	run(t, dir, "config", "diff.noprefix", "true")
	run(t, dir, "config", "diff.algorithm", "patience")
	run(t, dir, "config", "diff.context", "9")
	got, err := Diff(context.Background(), dir, base, head)
	if err != nil {
		t.Fatal(err)
	}
	want := []FileDiff{
		{Path: "b/a.go", OldPath: "a/a.go", Hunks: []Hunk{
			{BaseStart: 1, BaseLines: 4, HeadStart: 1, HeadLines: 4, Lines: []string{"-package a", "+package b", " ", " func F1() {}", " func F2() {}"}},
			{BaseStart: 14, BaseLines: 7, HeadStart: 14, HeadLines: 7, Lines: []string{
				" func F12() {}", " func F13() {}", " func F14() {}", "-func F15() {}", "+func F15() { _ = 1 }", " func F16() {}", " func F17() {}", " func F18() {}",
			}},
		}},
		{Path: "c/c.go", OldPath: "c/c.go", Hunks: []Hunk{
			{BaseStart: 1, BaseLines: 5, HeadStart: 1, HeadLines: 5, Lines: []string{
				" package c", " ", " func C() int {", "-\treturn 1", "-}", "+\treturn 2", "+}",
			}},
		}},
		{OldPath: "d/gone.go", Hunks: []Hunk{
			{BaseStart: 1, BaseLines: 3, HeadStart: 0, HeadLines: 0, Lines: []string{"-package d", "-", "-func Z() {}"}},
		}},
		{Path: "f/e.go", OldPath: "e/e.go"},
		{Path: "m.go", OldPath: "m.go"},
		{Path: "n/new.go", Hunks: []Hunk{{BaseStart: 0, BaseLines: 0, HeadStart: 1, HeadLines: 1, Lines: []string{"+package n"}}}},
		{Path: "sp ace/é.go", OldPath: "sp ace/é.go", Hunks: []Hunk{
			{BaseStart: 1, BaseLines: 3, HeadStart: 1, HeadLines: 3, Lines: []string{" package sp", " ", "-func S() {}", "+func S() { _ = 0 }"}},
		}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Diff =\n%+v\nwant\n%+v", got, want)
	}
	if _, err := Diff(context.Background(), dir, "-p", head); err == nil {
		t.Error("an option as a commit was accepted")
	}
}

// OnRemote is whether a remote-tracking ref holds the commit: what the host
// can show, read offline from the clone's refs.
func TestOnRemote(t *testing.T) {
	dir, base, head := hostRepo(t)
	ctx := context.Background()
	if OnRemote(ctx, dir, head) || OnRemote(ctx, dir, base) {
		t.Fatal("no remote-tracking ref, yet a commit is on the remote")
	}
	run(t, dir, "update-ref", "refs/remotes/origin/main", base)
	if !OnRemote(ctx, dir, base) || OnRemote(ctx, dir, head) {
		t.Error("origin/main at base: base should be on the remote, head not")
	}
	run(t, dir, "update-ref", "refs/remotes/origin/feat", head)
	if !OnRemote(ctx, dir, head) {
		t.Error("origin/feat at head: head should be on the remote")
	}
	run(t, dir, "update-ref", "refs/heads/local", head) // a local branch is not the host
	if OnRemote(ctx, dir, "-p") || OnRemote(ctx, t.TempDir(), head) {
		t.Error("an option or a directory outside git is on no remote")
	}
}
