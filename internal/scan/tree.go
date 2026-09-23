package scan

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

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
	// ReadFile returns the content of a path from Files, following the
	// symlink if it is one.
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
	return os.ReadFile(filepath.Join(d.root, filepath.FromSlash(rel))) // #nosec G304 -- rel comes from Files
}

// linkedFileInside reports whether the symlink at p resolves to a regular
// file inside the root.
func (d *dirTree) linkedFileInside(p string) bool {
	target, err := filepath.EvalSymlinks(p)
	if err != nil {
		return false
	}
	info, err := os.Stat(target)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	r, err := filepath.Rel(d.root, target)
	return err == nil && r != ".." && !strings.HasPrefix(r, ".."+string(filepath.Separator))
}

func (d *dirTree) rel(p string) string {
	r, err := filepath.Rel(d.root, p)
	if err != nil {
		return filepath.Base(p)
	}
	return filepath.ToSlash(r)
}
