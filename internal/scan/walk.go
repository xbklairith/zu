package scan

import (
	"errors"
	"fmt"
	"io/fs"
	"path"
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

// walkResult is everything the listing pass learns.
type walkResult struct {
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

// walkTree lists the Go files to scan in t, discovers modules, and counts
// unsupported source files. The only error is an unusable tree.
func walkTree(t Tree) (*walkResult, error) {
	files, errs, err := t.Files()
	if err != nil {
		return nil, err
	}
	w := &walkResult{Unsupported: map[string]int{}, Errors: errs}
	var goFiles []string
	for _, rel := range files {
		name := path.Base(rel)
		switch ext := path.Ext(name); {
		case name == "go.mod":
			w.readModule(t, rel)
		case ext == ".go":
			if !strings.HasSuffix(name, "_test.go") {
				goFiles = append(goFiles, rel)
			}
		case sourceExts[ext]:
			w.Unsupported[ext]++
		}
	}
	if len(goFiles) > 0 && len(w.Modules) == 0 {
		return nil, ErrNoModule
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

func (w *walkResult) readModule(t Tree, rel string) {
	data, err := t.ReadFile(rel)
	if err != nil {
		w.errorf(rel, "%s", ioMessage(err))
		return
	}
	f, err := modfile.ParseLax(rel, data, nil)
	if err != nil {
		// Still a boundary: its files must not fall through to a parent
		// module under a wrong import path.
		w.errorf(rel, "%v", err)
		w.Modules = append(w.Modules, &module{Dir: path.Dir(rel)})
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

// ErrNoModule means the root holds Go files but no go.mod at or under it.
var ErrNoModule = errors.New("no go.mod at or under the scan root; scan the module root")

// ioMessage is err's message without its path. Common failures get a fixed
// text so the IR does not depend on the OS's wording (REQ-038).
func ioMessage(err error) string {
	switch {
	case errors.Is(err, fs.ErrPermission):
		return "permission denied"
	case errors.Is(err, fs.ErrNotExist):
		return "file does not exist"
	}
	return unwrapPath(err).Error()
}
