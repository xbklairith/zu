package gitref

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

// commit writes one file and commits it, returning the new commit id.
func commit(t *testing.T, dir, name string) string {
	t.Helper()
	write(t, filepath.Join(dir, name), name+"\n")
	run(t, dir, "add", name)
	run(t, dir, "commit", "-q", "-m", name)
	return strings.TrimSpace(run(t, dir, "rev-parse", "HEAD"))
}

// forkRepo has main and feature branching from fork.
func forkRepo(t *testing.T) (dir, fork, mainTip, featTip string) {
	t.Helper()
	needGit(t)
	dir = t.TempDir()
	run(t, dir, "init", "-q", "-b", "main")
	commit(t, dir, "root")
	fork = commit(t, dir, "fork")
	run(t, dir, "checkout", "-q", "-b", "feature")
	featTip = commit(t, dir, "feat")
	run(t, dir, "checkout", "-q", "main")
	mainTip = commit(t, dir, "main")
	return dir, fork, mainTip, featTip
}

func TestMergeBase(t *testing.T) {
	dir, fork, mainTip, featTip := forkRepo(t)
	ctx := context.Background()
	if got, err := MergeBase(ctx, dir, mainTip, featTip); err != nil || got != fork {
		t.Errorf("MergeBase(main, feature) = %q, %v; want %s", got, err, fork)
	}
	if got, err := MergeBase(ctx, dir, featTip, featTip); err != nil || got != featTip {
		t.Errorf("MergeBase(x, x) = %q, %v; want %s", got, err, featTip)
	}
}

func TestMergeBaseShallowClone(t *testing.T) {
	src, _, _, _ := forkRepo(t)
	dst := filepath.Join(t.TempDir(), "clone")
	run(t, t.TempDir(), "clone", "-q", "--depth", "1", "--branch", "main", "file://"+src, dst)
	run(t, dst, "fetch", "-q", "--depth", "1", "origin", "feature:feature")
	mainTip := strings.TrimSpace(run(t, dst, "rev-parse", "main"))
	featTip := strings.TrimSpace(run(t, dst, "rev-parse", "feature"))
	_, err := MergeBase(context.Background(), dst, mainTip, featTip)
	if !errors.Is(err, ErrNoMergeBase) {
		t.Fatalf("err = %v, want ErrNoMergeBase", err)
	}
	if !strings.Contains(err.Error(), "fetch-depth: 0") {
		t.Errorf("the error must say how to fix it: %v", err)
	}
}

func TestMergeBaseCrissCross(t *testing.T) {
	needGit(t)
	dir := t.TempDir()
	run(t, dir, "init", "-q", "-b", "main")
	commit(t, dir, "root")
	run(t, dir, "checkout", "-q", "-b", "a")
	a1 := commit(t, dir, "a1")
	run(t, dir, "checkout", "-q", "-b", "b", "main")
	b1 := commit(t, dir, "b1")
	run(t, dir, "merge", "-q", "--no-edit", a1)
	run(t, dir, "checkout", "-q", "a")
	run(t, dir, "merge", "-q", "--no-edit", b1)
	aTip := strings.TrimSpace(run(t, dir, "rev-parse", "a"))
	bTip := strings.TrimSpace(run(t, dir, "rev-parse", "b"))
	want := strings.TrimSpace(run(t, dir, "merge-base", aTip, bTip))
	if got, err := MergeBase(context.Background(), dir, aTip, bTip); err != nil || got != want {
		t.Fatalf("MergeBase = %q, %v; want git's pick %s", got, err, want)
	}
}
