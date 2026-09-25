// Package watch tells zu serve when the working tree changed (13). It polls
// the Stamp (size, mtime, ctime, inode) of the files a rescan reads and of
// every directory the scan does not prune, and lists the tree again only
// when a directory, a .gitignore or a meta path (git's HEAD, index and
// refs) changed. It runs no process and reads no file's content.
package watch

import (
	"context"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"zu/internal/scan"
)

// Listing is what a rescan reads.
type Listing struct {
	Files []string // slash paths relative to the root, sorted
	Extra bool     // as gitref.Listing: the tree has files HEAD lacks
}

// Walk lists root as a DirTree does: the listing of a directory outside git.
func Walk(root string) (*Listing, error) {
	t, err := scan.DirTree(root)
	if err != nil {
		return nil, err
	}
	files, _, err := t.Files()
	if err != nil {
		return nil, err
	}
	return &Listing{Files: files}, nil
}

// Watcher polls a tree.
type Watcher struct {
	Root string
	// Meta returns absolute paths outside the listing, such as git's HEAD,
	// index and the ref HEAD names: a change to one lists the tree again
	// and is a change. It is asked again at each listing. Nil: none.
	Meta func(context.Context) []string
	// Always are slash paths a rescan reads whether or not a listing holds
	// them, such as a Policy git ignores.
	Always []string
	// Matters reports whether a rescan reads rel's content. A listed file
	// it rejects is polled only through its directory (an add or a delete).
	Matters func(rel string) bool
	// List lists the tree again.
	List func(context.Context) (*Listing, error)
	// Kept is the Stamp of rel, a listed file or an Always path, when the
	// last scan read it: zero if it was missing or is unknown. Nil: every
	// file is unknown, so the first poll is a change.
	Kept func(rel string) scan.Stamp
	// Polling, when set, runs before each poll at rest.
	Polling func()
	// Every is the time between polls at rest; Quiet, the time between
	// polls while a burst of changes lasts.
	Every, Quiet time.Duration
}

// maxSettle bounds how long a burst can hold a rescan back: 20 Quiets.
const maxSettle = 20

// Run watches from l, the listing the last scan read, until ctx ends, and
// returns ctx's error. When a poll differs from the one before, it polls
// every Quiet until two agree, so a burst is one change. It lists the tree
// again if a directory, a .gitignore or a meta path changed, after reading
// each changed directory for new ones to poll. It then calls changed with
// the listing if a file was added, removed or rewritten, or a meta path or
// an Always path changed. It polls again only after changed returns: one
// rescan runs at a time, and changes made during one are reported once,
// after it.
func (w *Watcher) Run(ctx context.Context, l *Listing, changed func(context.Context, *Listing)) error {
	dirs := map[string]bool{".": true}
	for _, f := range l.Files {
		if !pruned(f) {
			for d := path.Dir(f); !dirs[d]; d = path.Dir(d) {
				dirs[d] = true
			}
		}
	}
	meta := w.meta(ctx)
	sc := w.scope(l, dirs)
	base := sc.poll(meta)
	for i, p := range sc.paths {
		if i < sc.files {
			base.st[i] = w.kept(p) // what the last scan read, not what is there now
		} else {
			base.st[i] = stamp{} // unknown: the first poll reads it and lists again
		}
	}
	for {
		if err := sleep(ctx, w.Every); err != nil {
			return err
		}
		if w.Polling != nil {
			w.Polling()
		}
		cur := sc.poll(meta)
		if cur.equal(base) {
			continue
		}
		for range maxSettle {
			if err := sleep(ctx, w.Quiet); err != nil {
				return err
			}
			again := sc.poll(meta)
			if again.equal(cur) {
				break
			}
			cur = again
		}
		change := !slices.Equal(cur.meta, base.meta)
		relist := change
		var moved []string // directories whose stamp changed
		for i, p := range sc.paths {
			switch {
			case cur.st[i] == base.st[i]:
			case i >= sc.files:
				relist = true
				moved = append(moved, p)
			default:
				relist = relist || ignoreFile(p)
				change = change || w.Matters(p) || slices.Contains(w.Always, p)
			}
		}
		if relist {
			found := w.discover(dirs, moved)
			meta = w.meta(ctx)
			metaNow := pollMeta(meta) // before the listing, so a later change is seen
			nl, err := w.List(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				continue // git failed: poll again, and list again, next time
			}
			nsc := w.scope(nl, dirs)
			next := nsc.poll(nil)
			was, now := sc.byPath(base), sc.byPath(cur)
			for i, p := range nsc.paths {
				switch {
				case i >= nsc.files:
					// A directory's stamp is the one taken before the
					// listing that read it.
					if st, ok := found[p]; ok {
						next.st[i] = st
					} else {
						next.st[i] = now[p]
					}
				case next.st[i] != was[p] && (w.Matters(p) || slices.Contains(w.Always, p)):
					change = true
				}
			}
			next.meta = metaNow
			change = change || !slices.Equal(nl.Files, l.Files)
			l, sc, cur = nl, nsc, next
		}
		if change {
			changed(ctx, l)
		}
		base = cur
	}
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func (w *Watcher) meta(ctx context.Context) []string {
	if w.Meta == nil {
		return nil
	}
	return w.Meta(ctx)
}

// kept is the stamp a poll would give the file the last scan read.
func (w *Watcher) kept(rel string) stamp {
	if w.Kept == nil {
		return stamp{}
	}
	st := w.Kept(rel)
	if st == (scan.Stamp{}) {
		return stamp{} // unknown: a symlink, or a tree that did not Lstat
	}
	return stamp{st: st, seen: true} // a regular file: Type() is 0
}

// discover reads each directory in moved: one that is gone leaves dirs, and
// a subdirectory the scan does not prune joins it, with those below it. It
// returns the stamp of each new directory, taken before it was read.
func (w *Watcher) discover(dirs map[string]bool, moved []string) map[string]stamp {
	found := map[string]stamp{}
	var visit func(d string, isNew bool)
	visit = func(d string, isNew bool) {
		p := filepath.Join(w.Root, filepath.FromSlash(d))
		fi, err := os.Lstat(p)
		if err != nil || !fi.IsDir() {
			delete(dirs, d) // those below it are gone too, and go when polled
			return
		}
		if isNew {
			found[d] = stampOf(fi)
		}
		entries, err := os.ReadDir(p)
		if err != nil {
			return
		}
		for _, e := range entries {
			if sub := path.Join(d, e.Name()); e.IsDir() && !scan.PrunedDir(e.Name()) && !dirs[sub] {
				dirs[sub] = true
				visit(sub, true)
			}
		}
	}
	for _, d := range moved {
		visit(d, false)
	}
	return found
}

// stamp is what a poll compares.
type stamp struct {
	st   scan.Stamp
	typ  fs.FileMode // the type bits: 0 for a regular file
	seen bool
}

func stampOf(fi fs.FileInfo) stamp {
	if fi == nil {
		return stamp{}
	}
	return stamp{scan.Stat(fi), fi.Mode().Type(), true}
}

// scope is what a poll looks at for one listing: the listed files a rescan
// reads, the .gitignores and the Always paths, then every directory in
// dirs. Pruned directories are left out.
type scope struct {
	paths []string // slash paths relative to the root
	abs   []string // the same, joined to the root
	files int      // paths[:files] are files
}

func (w *Watcher) scope(l *Listing, dirs map[string]bool) *scope {
	sc := &scope{}
	for _, f := range l.Files {
		if !pruned(f) && (w.Matters(f) || ignoreFile(f) || slices.Contains(w.Always, f)) {
			sc.paths = append(sc.paths, f)
		}
	}
	for _, a := range w.Always {
		if !slices.Contains(l.Files, a) {
			sc.paths = append(sc.paths, a)
		}
	}
	sc.files = len(sc.paths)
	for d := range dirs {
		sc.paths = append(sc.paths, d)
	}
	slices.Sort(sc.paths[sc.files:])
	for _, p := range sc.paths {
		sc.abs = append(sc.abs, filepath.Join(w.Root, filepath.FromSlash(p)))
	}
	return sc
}

// pruned reports whether rel lies in a directory the scan never reads.
func pruned(rel string) bool {
	dirs := strings.Split(rel, "/")
	return slices.ContainsFunc(dirs[:len(dirs)-1], scan.PrunedDir)
}

func ignoreFile(rel string) bool { return path.Base(rel) == ".gitignore" }

// state is one poll: a stamp per scope path, and one per meta path.
type state struct {
	st   []stamp
	meta []stamp
}

// poll Lstats the scope and meta, two at a time: more workers shorten a
// poll of kubernetes but cost more CPU, which is what an idle serve spends.
func (sc *scope) poll(meta []string) state {
	s := state{st: make([]stamp, len(sc.abs))}
	var wg sync.WaitGroup
	for k := range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := k; i < len(sc.abs); i += 2 {
				fi, _ := os.Lstat(sc.abs[i])
				s.st[i] = stampOf(fi)
			}
		}()
	}
	wg.Wait()
	s.meta = pollMeta(meta)
	return s
}

func pollMeta(meta []string) []stamp {
	var out []stamp
	for _, m := range meta {
		fi, _ := os.Lstat(m)
		out = append(out, stampOf(fi))
	}
	return out
}

func (s state) equal(o state) bool {
	return slices.Equal(s.st, o.st) && slices.Equal(s.meta, o.meta)
}

func (sc *scope) byPath(s state) map[string]stamp {
	m := make(map[string]stamp, len(sc.paths))
	for i, p := range sc.paths {
		m[p] = s.st[i]
	}
	return m
}
