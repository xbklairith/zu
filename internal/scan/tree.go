package scan

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"syscall"

	"zu/internal/ir"
)

// Tree is a file tree the scanner reads: a directory on disk or a git commit.
// Paths are slash paths relative to the tree root.
type Tree interface {
	// Files returns the files to consider, in lexical order: regular files
	// outside pruned directories (see PrunedDir), plus file symlinks whose
	// resolved target is a regular file inside the tree. Directory symlinks
	// are never followed. Problems with single entries go in errs; err
	// means the tree is unusable.
	Files() (files []string, errs []ir.ParseError, err error)
	// ReadFile returns the content of a path from Files, or of a file zu
	// looks up by name such as the Policy. A symlink is followed only to a
	// regular file inside the tree, as Files would list it; anything else
	// (a link leaving the tree, a path through a directory link, a
	// directory, a device) is fs.ErrNotExist.
	ReadFile(rel string) ([]byte, error)
}

// PrunedDir reports whether the scanner skips a directory of this name:
// vendor, testdata, and names starting with "." or "_", as the go command
// does. The root itself is never pruned.
func PrunedDir(name string) bool {
	return name == "vendor" || name == "testdata" ||
		strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")
}

// dirTree is a directory on disk.
type dirTree struct {
	root string // absolute, symlinks resolved
}

// DirTree is the directory at root. It fails if root is missing or is not a
// directory.
func DirTree(root string) (Tree, error) {
	return openDir(root)
}

func openDir(root string) (*dirTree, error) {
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", root)
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if abs, err = filepath.EvalSymlinks(abs); err != nil {
		return nil, err
	}
	return &dirTree{root: abs}, nil
}

// listTree is a directory on disk restricted to a list of files, such as
// the ones git would commit.
type listTree struct {
	*dirTree
	listed []string
	stamps map[string]Stamp // each listed file's Stamp, from Files' Lstat
	// once guards files and errs: Files lists once, so a second caller in
	// the same scan (the Change View's hunks) skips the Lstat pass (16).
	once  sync.Once
	files []string
	errs  []ir.ParseError
}

// ListTree is the directory at root, restricted to files: slash paths
// relative to root, in any order. Of those, Files keeps what DirTree would:
// regular files and in-tree file symlinks outside pruned directories and
// directory links. Listed paths missing from disk are skipped. Files lists once: a later call returns
// the first listing and Stamps (16).
func ListTree(root string, files []string) (Tree, error) {
	d, err := openDir(root)
	if err != nil {
		return nil, err
	}
	return &listTree{dirTree: d, listed: files}, nil
}

func (l *listTree) Files() ([]string, []ir.ParseError, error) {
	l.once.Do(func() { l.files, l.errs = l.list() })
	return slices.Clone(l.files), slices.Clone(l.errs), nil
}

func (l *listTree) list() ([]string, []ir.ParseError) {
	listed := slices.Compact(slices.Sorted(slices.Values(l.listed)))
	listed = slices.DeleteFunc(listed, func(rel string) bool {
		dirs := strings.Split(rel, "/")
		return slices.ContainsFunc(dirs[:len(dirs)-1], PrunedDir)
	})
	// Lstat each listed file, a few at a time: kubernetes lists 28k, and one
	// at a time takes 100ms of a rescan (16).
	type seen struct {
		st   Stamp
		keep bool
		err  error
	}
	got := make([]seen, len(listed))
	var dirs sync.Map // viaLink's answers, shared by the workers
	var wg sync.WaitGroup
	const workers = 4
	for k := range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := k; i < len(listed); i += workers {
				if l.viaLink(path.Dir(listed[i]), &dirs) {
					continue // git lists what a directory held before it became a link (19)
				}
				p := filepath.Join(l.root, filepath.FromSlash(listed[i]))
				info, err := os.Lstat(p)
				switch {
				case errors.Is(err, fs.ErrNotExist):
				case err != nil:
					got[i].err = err
				case info.Mode().IsRegular(), info.Mode()&fs.ModeSymlink != 0 && l.linkedFileInside(p):
					got[i] = seen{st: StampOf(info), keep: true}
				}
			}
		}()
	}
	wg.Wait()
	var files []string
	var errs []ir.ParseError
	stamps := make(map[string]Stamp, len(listed))
	for i, rel := range listed {
		switch g := got[i]; {
		case g.err != nil:
			errs = append(errs, ir.ParseError{Path: rel, Message: ioMessage(g.err)})
		case g.keep:
			files = append(files, rel)
			stamps[rel] = g.st
		}
	}
	l.stamps = stamps
	return files, errs
}

// stamp is rel's Stamp as Files saw it, or zero before Files runs.
func (l *listTree) stamp(rel string) Stamp { return l.stamps[rel] }

func (d *dirTree) Files() ([]string, []ir.ParseError, error) {
	var files []string
	var errs []ir.ParseError
	err := filepath.WalkDir(d.root, func(p string, e fs.DirEntry, err error) error {
		rel := d.rel(p)
		if err != nil {
			if p == d.root {
				return err
			}
			errs = append(errs, ir.ParseError{Path: rel, Message: ioMessage(err)})
			if e != nil && e.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if e.IsDir() {
			if p != d.root && PrunedDir(e.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		switch {
		case e.Type().IsRegular():
		case e.Type()&fs.ModeSymlink != 0 && d.linkedFileInside(p):
		default:
			return nil
		}
		files = append(files, rel)
		return nil
	})
	return files, errs, err
}

func (d *dirTree) ReadFile(rel string) ([]byte, error) {
	return d.readMax(rel, -1)
}

// readMax reads rel, at most limit bytes when limit >= 0. rel must be a
// regular file or a symlink that linkedFileInside accepts, under no
// directory link: the Policy and the Baseline are read by name, not from
// Files, and zu serve reads source files by path (19), so a planted link
// must not reach outside the root.
func (d *dirTree) readMax(rel string, limit int64) ([]byte, error) {
	if d.viaLink(path.Dir(rel), nil) {
		return nil, &fs.PathError{Op: "read", Path: rel, Err: fs.ErrNotExist}
	}
	p := filepath.Join(d.root, filepath.FromSlash(rel))
	info, err := os.Lstat(p)
	if err != nil {
		return nil, err
	}
	switch {
	case info.Mode().IsRegular():
	case info.Mode()&fs.ModeSymlink != 0 && d.linkedFileInside(p):
	default:
		return nil, &fs.PathError{Op: "read", Path: rel, Err: fs.ErrNotExist}
	}
	f, err := d.open(rel)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var r io.Reader = f
	if limit >= 0 {
		r = io.LimitReader(f, limit)
	}
	return io.ReadAll(r)
}

// open opens rel, a path readMax has checked, through an os.Root of the
// tree: whatever is on disk by the time it opens, it follows no link out of
// the root, so a directory swapped for a link after the checks does not take
// the read outside (19). Such an escape, or a directory gone from under rel,
// is fs.ErrNotExist, as the checks would have said.
func (d *dirTree) open(rel string) (*os.File, error) {
	r, err := os.OpenRoot(d.root)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	f, err := r.Open(filepath.FromSlash(rel))
	var pe *fs.PathError
	// os.Root does not export its escape error, so it is known by its text.
	if errors.As(err, &pe) && (pe.Err.Error() == "path escapes from parent" || errors.Is(pe.Err, syscall.ENOTDIR) || errors.Is(pe.Err, syscall.ELOOP)) {
		return nil, &fs.PathError{Op: "read", Path: rel, Err: fs.ErrNotExist}
	}
	return f, err
}

// MaxSmallFile caps the files zu reads whole by name, the Policy and the
// Baseline. Source files have no cap.
const MaxSmallFile = 1 << 20

// ReadSmall reads rel from t and fails if it is larger than MaxSmallFile.
// On disk it reads at most one byte more than the cap; a commit's blob is
// read by git and then checked.
func ReadSmall(t Tree, rel string) ([]byte, error) {
	var data []byte
	var err error
	if d, ok := t.(interface {
		readMax(string, int64) ([]byte, error)
	}); ok {
		data, err = d.readMax(rel, MaxSmallFile+1)
	} else {
		data, err = t.ReadFile(rel)
	}
	if err == nil && len(data) > MaxSmallFile {
		return nil, fmt.Errorf("%s is larger than %d bytes", rel, MaxSmallFile)
	}
	return data, err
}

// linkedFileInside reports whether the symlink at p resolves to a regular
// file inside the root.
func (d *dirTree) linkedFileInside(p string) bool {
	_, ok := ResolveLinks(d.rel(p), d.lookup)
	return ok
}

// viaLink reports whether a directory on dir's way down from the root is
// not a directory to Lstat: a link, which Files never follows. One Lstat
// cannot describe is left to the caller's own Lstat to report. seen, when
// not nil, keeps each answer for the next path.
func (d *dirTree) viaLink(dir string, seen *sync.Map) bool {
	if dir == "." || dir == "/" {
		return false
	}
	if seen != nil {
		if v, ok := seen.Load(dir); ok {
			return v.(bool)
		}
	}
	info, err := os.Lstat(filepath.Join(d.root, filepath.FromSlash(dir)))
	link := err == nil && !info.IsDir() || d.viaLink(path.Dir(dir), seen)
	if seen != nil {
		seen.Store(dir, link)
	}
	return link
}

// lookup describes rel without following it.
func (d *dirTree) lookup(rel string) (EntryKind, string) {
	p := filepath.Join(d.root, filepath.FromSlash(rel))
	info, err := os.Lstat(p)
	switch {
	case err != nil:
		return EntryMissing, ""
	case info.Mode()&fs.ModeSymlink != 0:
		target, err := os.Readlink(p)
		if err != nil {
			return EntryMissing, ""
		}
		return EntryLink, filepath.ToSlash(target)
	case info.IsDir():
		return EntryDir, ""
	case info.Mode().IsRegular():
		return EntryFile, ""
	}
	return EntryOther, ""
}

// EntryKind is what a path in a tree is, without following it.
type EntryKind int

// Entry kinds.
const (
	EntryMissing EntryKind = iota
	EntryFile              // a regular file
	EntryDir
	EntryLink
	EntryOther // a device, socket, submodule and the like
)

// maxLinkHops bounds symlink chains, as the kernel does.
const maxLinkHops = 40

// ResolveLinks follows the symlinks in p, a slash path relative to a tree
// root, component by component as filepath.EvalSymlinks does, and returns
// the path of the regular file p leads to. lookup describes one path without
// following it, returning a link's target text. It fails for anything else:
// a directory, a missing target, a path leaving the tree, a chain longer
// than 40 links, or an absolute target. Absolute targets are never followed:
// where they point depends on where the tree is checked out, and the IR must
// not.
func ResolveLinks(p string, lookup func(rel string) (EntryKind, string)) (string, bool) {
	var cur []string // resolved components, free of links
	todo := strings.Split(p, "/")
	hops := 0
	for len(todo) > 0 {
		c := todo[0]
		todo = todo[1:]
		switch c {
		case "", ".":
			continue
		case "..":
			if len(cur) == 0 {
				return "", false
			}
			cur = cur[:len(cur)-1]
			continue
		}
		next := strings.Join(append(slices.Clip(cur), c), "/")
		kind, target := lookup(next)
		switch kind {
		case EntryMissing:
			return "", false
		case EntryLink:
			if hops++; hops > maxLinkHops || path.IsAbs(target) {
				return "", false
			}
			// Relative to the link's directory, which cur already is.
			todo = append(strings.Split(target, "/"), todo...)
			continue
		}
		cur = append(cur, c)
	}
	if len(cur) == 0 {
		return "", false
	}
	final := strings.Join(cur, "/")
	if kind, _ := lookup(final); kind != EntryFile {
		return "", false
	}
	return final, true
}

func (d *dirTree) rel(p string) string {
	r, err := filepath.Rel(d.root, p)
	if err != nil {
		return filepath.Base(p)
	}
	return filepath.ToSlash(r)
}
