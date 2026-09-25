package watch

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"zu/internal/scan"
)

// goOnly is what a rescan reads in these tests.
func goOnly(rel string) bool { return strings.HasSuffix(rel, ".go") }

func write(t *testing.T, root, rel, body string) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// every lists every file under root, pruned directories too, as git does,
// but not the files named ignored.
func every(root string, ignored ...string) (*Listing, error) {
	l := &Listing{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(root, p)
		if rel = filepath.ToSlash(rel); !slices.Contains(ignored, rel) {
			l.Files = append(l.Files, rel)
		}
		return nil
	})
	return l, err
}

// watching runs a Watcher over root until the test ends; with changes it
// before it runs. Each change arrives on the channel; hold, when set, runs
// inside the callback. Unless with sets Kept, the Stamps the "last scan"
// kept are Lstat's now.
func watching(t *testing.T, root string, hold func(), with ...func(*Watcher)) (<-chan *Listing, *atomic.Int32) {
	t.Helper()
	var lists atomic.Int32
	w := &Watcher{
		Root: root, Matters: goOnly, Every: 10 * time.Millisecond, Quiet: 60 * time.Millisecond,
		List: func(context.Context) (*Listing, error) { return every(root) },
	}
	for _, o := range with {
		o(w)
	}
	l, err := w.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	list := w.List
	w.List = func(ctx context.Context) (*Listing, error) {
		lists.Add(1)
		return list(ctx)
	}
	if w.Kept == nil {
		kept := map[string]scan.Stamp{}
		for _, f := range append(l.Files, w.Always...) {
			fi, _ := os.Lstat(filepath.Join(root, filepath.FromSlash(f)))
			kept[f] = scan.StampOf(fi)
		}
		w.Kept = func(rel string) scan.Stamp { return kept[rel] }
	}
	ctx, cancel := context.WithCancel(context.Background())
	got := make(chan *Listing, 16)
	done := make(chan error, 1)
	go func() {
		done <- w.Run(ctx, l, func(_ context.Context, l *Listing) {
			if hold != nil {
				hold()
			}
			got <- l
		})
	}()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != context.Canceled {
			t.Errorf("Run = %v, want context.Canceled", err)
		}
	})
	return got, &lists
}

func next(t *testing.T, got <-chan *Listing) *Listing {
	t.Helper()
	select {
	case l := <-got:
		return l
	case <-time.After(5 * time.Second):
		t.Fatal("no change reported")
		return nil
	}
}

func none(t *testing.T, got <-chan *Listing, why string) {
	t.Helper()
	select {
	case l := <-got:
		t.Fatalf("%s: a change was reported: %v", why, l.Files)
	case <-time.After(300 * time.Millisecond):
	}
}

// A watcher reports an edit, an add in a new directory and a delete, and
// nothing for a file no rescan reads or one in a directory the scan prunes.
func TestWatcherReportsEditsAddsAndDeletes(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	write(t, root, "a/a.go", "package a\n")
	write(t, root, "README.md", "hi\n")
	write(t, root, "vendor/v/v.go", "package v\n")
	got, _ := watching(t, root, nil)
	none(t, got, "at rest") // the first poll relists once, but nothing changed

	write(t, root, "README.md", "hello\n")
	none(t, got, "a file no rescan reads")
	write(t, root, "vendor/v/v.go", "package v // edited\n")
	none(t, got, "a file in a directory the scan prunes")

	write(t, root, "a/a.go", "package a\n\nfunc A() {}\n")
	next(t, got)
	write(t, root, "b/c/b.go", "package c\n")
	if l := next(t, got); !slices.Contains(l.Files, "b/c/b.go") {
		t.Errorf("add in a new directory: %v", l.Files)
	}
	if err := os.Remove(filepath.Join(root, "a", "a.go")); err != nil {
		t.Fatal(err)
	}
	if l := next(t, got); slices.Contains(l.Files, "a/a.go") {
		t.Errorf("delete: %v", l.Files)
	}
	none(t, got, "after the delete")
}

// A file that changed since the last scan read it, before the watch began,
// is a change at the first poll: the base is what the scan kept, not what
// the first poll finds.
func TestWatcherStartsFromTheKeptStamps(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	write(t, root, "a.go", "package m\n")
	got, _ := watching(t, root, nil, func(w *Watcher) {
		w.Kept = func(string) scan.Stamp { return scan.Stamp{Size: 1} } // what the scan read is gone
	})
	next(t, got)
	none(t, got, "after the first change")
}

// A burst, such as a checkout rewriting many files, is one change, reported
// once the tree has been quiet for one Quiet.
func TestWatcherCoalescesABurst(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	got, _ := watching(t, root, nil)
	none(t, got, "at rest")
	for i := range 200 {
		write(t, root, filepath.Join("p", string(rune('a'+i%26)), "f"+strings.Repeat("x", i/26)+".go"), "package p\n")
	}
	if l := next(t, got); len(l.Files) != 201 {
		t.Errorf("the burst was reported before it ended: %d files", len(l.Files))
	}
	none(t, got, "after the burst")
}

// One rescan at a time: changes made while one runs are reported once, after
// it returns.
func TestWatcherWaitsForTheRescan(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	write(t, root, "a.go", "package m\n")
	release := make(chan struct{})
	var calls atomic.Int32
	got, _ := watching(t, root, func() {
		if calls.Add(1) == 1 {
			<-release
		}
	})
	write(t, root, "a.go", "package m // 1\n")
	time.Sleep(200 * time.Millisecond) // the first rescan is now running
	write(t, root, "a.go", "package m // 22\n")
	write(t, root, "b.go", "package m\n")
	time.Sleep(200 * time.Millisecond)
	close(release)
	next(t, got)
	if l := next(t, got); !slices.Contains(l.Files, "b.go") {
		t.Errorf("the second rescan missed b.go: %v", l.Files)
	}
	none(t, got, "after the second rescan")
	if n := calls.Load(); n != 2 {
		t.Errorf("%d rescans, want 2", n)
	}
}

// An edit to a file already listed needs no new listing; an added file, a
// .gitignore or a meta path (git's HEAD, index) does, and a meta path is a
// change even when no file is.
func TestWatcherRelistsOnlyWhenTheListingMayChange(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	write(t, root, "a.go", "package m\n")
	write(t, root, ".gitignore", "y\n")
	meta := filepath.Join(t.TempDir(), "index")
	if err := os.WriteFile(meta, []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, lists := watching(t, root, nil, func(w *Watcher) {
		w.Meta = func(context.Context) []string { return []string{meta} }
	})
	none(t, got, "at rest")
	before := lists.Load()
	write(t, root, "a.go", "package m\n\nvar X = 1\n")
	next(t, got)
	if n := lists.Load(); n != before {
		t.Errorf("an edit relisted %d times", n-before)
	}
	write(t, root, ".gitignore", "xx\n")
	none(t, got, "a .gitignore edit that hides nothing")
	if lists.Load() == before {
		t.Error("a .gitignore edit did not relist")
	}
	if err := os.WriteFile(meta, []byte("22"), 0o644); err != nil {
		t.Fatal(err)
	}
	next(t, got)
}

// A file saved in a directory that holds no listed file is seen (13,
// scrutiny B1): every directory is polled. The first poll reads each one
// the listing implies, and finds one that was there already; a later one
// is found by reading the directory that changed, however deep it is.
func TestWatcherSeesAFileInANewDirectory(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	write(t, root, "empty/.keep", "")
	if err := os.MkdirAll(filepath.Join(root, "pre", "q"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, _ := watching(t, root, nil)
	none(t, got, "at rest")
	for _, d := range []string{"d", "e/f/g", "empty/h"} {
		if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(d)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	none(t, got, "empty directories") // longer than a poll: they are found and polled
	for _, f := range []string{"pre/q/p.go", "d/x.go", "e/f/g/y.go", "empty/h/z.go"} {
		write(t, root, f, "package x\n")
		if l := next(t, got); !slices.Contains(l.Files, f) {
			t.Errorf("%s: %v", f, l.Files)
		}
	}
	none(t, got, "after the adds")
}

// A path in Always, such as a Policy git ignores, is polled though no
// listing holds it, from the Stamp the last scan kept: an edit, a delete
// and an add are each a change.
func TestWatcherPollsAlways(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	write(t, root, "zu.policy.yaml", "levels: []\n")
	got, _ := watching(t, root, nil, func(w *Watcher) {
		w.Always = []string{"zu.policy.yaml"}
		w.List = func(context.Context) (*Listing, error) { return every(root, "zu.policy.yaml") }
	})
	none(t, got, "at rest")
	write(t, root, "zu.policy.yaml", "levels: [a]\n")
	next(t, got)
	if err := os.Remove(filepath.Join(root, "zu.policy.yaml")); err != nil {
		t.Fatal(err)
	}
	next(t, got)
	write(t, root, "zu.policy.yaml", "levels: []\n")
	next(t, got)
}

// Meta is asked again at each listing, so a path it names later, such as
// the ref a checkout moved HEAD to, is polled from then on. Polling runs
// before each poll at rest.
func TestWatcherAsksMetaAgain(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	gd := t.TempDir()
	head, ref := filepath.Join(gd, "HEAD"), filepath.Join(gd, "main")
	for _, p := range []string{head, ref} {
		if err := os.WriteFile(p, []byte("1"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var polls atomic.Int32
	var moved atomic.Bool
	got, _ := watching(t, root, nil, func(w *Watcher) {
		w.Meta = func(context.Context) []string {
			if moved.Load() {
				return []string{head, ref}
			}
			return []string{head}
		}
		w.Polling = func() { polls.Add(1) }
	})
	none(t, got, "at rest")
	if err := os.WriteFile(ref, []byte("22"), 0o644); err != nil {
		t.Fatal(err)
	}
	none(t, got, "a ref HEAD does not name")
	moved.Store(true)
	if err := os.WriteFile(head, []byte("22"), 0o644); err != nil {
		t.Fatal(err)
	}
	next(t, got)
	if err := os.WriteFile(ref, []byte("333"), 0o644); err != nil {
		t.Fatal(err)
	}
	next(t, got)
	if polls.Load() == 0 {
		t.Error("Polling never ran")
	}
}

// Walk lists what a DirTree lists.
func TestWalk(t *testing.T) {
	root := t.TempDir()
	write(t, root, "go.mod", "module m\n")
	write(t, root, "vendor/v.go", "package v\n")
	l, err := Walk(root)
	if err != nil || !slices.Equal(l.Files, []string{"go.mod"}) {
		t.Fatalf("Walk = %+v, %v", l, err)
	}
}
