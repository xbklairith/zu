package scan

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"

	"golang.org/x/mod/modfile"

	"zu/internal/ir"
)

// module is one go.mod found under the root.
type module struct {
	Path     string    // module path; "" for a go.mod without one (a boundary only)
	Dir      string    // slash path relative to the root; "." for the root
	Requires []require // in go.mod order
}

// require is one require directive, located for the external node it becomes.
type require struct {
	Path string
	Line int
}

// walkResult is everything the file-system pass learns.
type walkResult struct {
	Root        string // absolute, symlinks resolved
	Files       []string
	Modules     []*module // sorted by Dir
	Unsupported map[string]int
	Errors      []ir.ParseError
}

// sourceExts are the non-Go source languages counted as unsupported.
var sourceExts = map[string]bool{
	".c": true, ".h": true, ".cc": true, ".cpp": true, ".hpp": true, ".m": true,
	".java": true, ".kt": true, ".scala": true, ".cs": true, ".fs": true,
	".py": true, ".rb": true, ".php": true, ".pl": true, ".lua": true,
	".js": true, ".jsx": true, ".mjs": true, ".ts": true, ".tsx": true,
	".rs": true, ".swift": true, ".zig": true, ".dart": true, ".ex": true, ".exs": true,
	".sh": true, ".bash": true, ".proto": true, ".sql": true, ".s": true,
}

// walk lists the Go files to scan under root, discovers modules, and counts
// unsupported source files. It never leaves root and never follows a
// directory symlink. The only error is an unusable root.
func walk(root string) (*walkResult, error) {
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
	w := &walkResult{Root: abs, Unsupported: map[string]int{}}
	var goFiles []string

	err = filepath.WalkDir(abs, func(p string, d fs.DirEntry, err error) error {
		rel := w.rel(p)
		if err != nil {
			if p == abs {
				return err
			}
			w.errorf(rel, "%v", unwrapPath(err))
			if d != nil && d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if p != abs && skipDir(name) {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 && !w.linkedFileInside(p) {
			return nil
		}
		if !d.Type().IsRegular() && d.Type()&fs.ModeSymlink == 0 {
			return nil
		}
		switch ext := path.Ext(name); {
		case name == "go.mod":
			w.readModule(p, rel)
		case ext == ".go":
			if !strings.HasSuffix(name, "_test.go") {
				goFiles = append(goFiles, rel)
			}
		case sourceExts[ext]:
			w.Unsupported[ext]++
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	slices.SortFunc(w.Modules, func(a, b *module) int { return strings.Compare(a.Dir, b.Dir) })
	slices.Sort(goFiles)
	for _, f := range goFiles {
		switch m := w.moduleFor(path.Dir(f)); {
		case m == nil:
			w.errorf(f, "no enclosing go.mod")
		case m.Path != "": // a path-less go.mod fences its files off
			w.Files = append(w.Files, f)
		}
	}
	return w, nil
}

func skipDir(name string) bool {
	return name == "vendor" || name == "testdata" ||
		strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")
}

// linkedFileInside reports whether the symlink at p resolves to a regular
// file inside the root. Directory symlinks are never followed.
func (w *walkResult) linkedFileInside(p string) bool {
	target, err := filepath.EvalSymlinks(p)
	if err != nil {
		return false
	}
	info, err := os.Stat(target)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	r, err := filepath.Rel(w.Root, target)
	return err == nil && r != ".." && !strings.HasPrefix(r, ".."+string(filepath.Separator))
}

func (w *walkResult) readModule(p, rel string) {
	data, err := os.ReadFile(p) // #nosec G304 -- path comes from walking the scan root
	if err != nil {
		w.errorf(rel, "%v", unwrapPath(err))
		return
	}
	f, err := modfile.ParseLax(rel, data, nil)
	if err != nil {
		w.errorf(rel, "%v", err)
		return
	}
	if f.Module == nil || f.Module.Mod.Path == "" {
		// Any go.mod is a module boundary, as for the go command. An empty
		// one is a common way to fence a directory off from its parent
		// module; one with other content is reported as malformed.
		if len(f.Syntax.Stmt) > 0 {
			w.errorf(rel, "missing module directive")
		}
		w.Modules = append(w.Modules, &module{Dir: path.Dir(rel)})
		return
	}
	m := &module{Path: f.Module.Mod.Path, Dir: path.Dir(rel)}
	for _, r := range f.Require {
		m.Requires = append(m.Requires, require{Path: r.Mod.Path, Line: r.Syntax.Start.Line})
	}
	w.Modules = append(w.Modules, m)
}

// moduleFor returns the module of the nearest enclosing go.mod of dir (a
// slash path relative to the root), or nil.
func (w *walkResult) moduleFor(dir string) *module {
	var best *module
	for _, m := range w.Modules {
		if within(dir, m.Dir) && (best == nil || len(m.Dir) > len(best.Dir)) {
			best = m
		}
	}
	return best
}

func within(dir, base string) bool {
	return base == "." || dir == base || strings.HasPrefix(dir, base+"/")
}

// importPath is the import path of the package in dir, which lies in m.
func importPath(m *module, dir string) string {
	if dir == m.Dir {
		return m.Path
	}
	sub := dir
	if m.Dir != "." {
		sub = strings.TrimPrefix(dir, m.Dir+"/")
	}
	return m.Path + "/" + sub
}

func (w *walkResult) rel(p string) string {
	r, err := filepath.Rel(w.Root, p)
	if err != nil {
		return filepath.Base(p)
	}
	return filepath.ToSlash(r)
}

func (w *walkResult) errorf(rel, format string, args ...any) {
	w.Errors = append(w.Errors, ir.ParseError{Path: rel, Message: fmt.Sprintf(format, args...)})
}

// unwrapPath drops the absolute path from an *fs.PathError so no absolute
// path reaches the IR.
func unwrapPath(err error) error {
	var pe *fs.PathError
	if errors.As(err, &pe) {
		return pe.Err
	}
	return err
}
