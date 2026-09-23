package scan

import (
	"path"
	"strings"
)

// pkgInfo is one scanned package: what other packages can refer to in it.
type pkgInfo struct {
	ID      string // import path
	Module  *module
	Name    string // package clause of its first file
	First   *fileFacts
	Files   []*fileFacts
	Funcs   map[string]bool
	Types   map[string]bool
	Methods map[string]map[string]bool // receiver base type → method names
}

// index maps import paths to scanned packages.
type index struct {
	w    *walkResult
	pkgs map[string]*pkgInfo
}

// importClass is how an import path resolves.
type importClass uint8

const (
	importInternal   importClass = iota + 1 // a scanned package
	importExternal                          // a require of the importing module
	importStdlib                            // ignored entirely
	importUnresolved                        // repo-looking or unknown, not scanned
)

// target is a resolved import.
type target struct {
	Class   importClass
	Pkg     *pkgInfo // importInternal
	Module  string   // importExternal: the required module path
	Require require  // importExternal
	Name    string   // effective package name for qualified references
}

func buildIndex(w *walkResult, facts []*fileFacts) *index {
	ix := &index{w: w, pkgs: map[string]*pkgInfo{}}
	for _, f := range facts {
		if f.Skip || f.Err != nil {
			continue
		}
		m := w.moduleFor(f.Dir)
		id := importPath(m, f.Dir)
		p := ix.pkgs[id]
		if p == nil {
			p = &pkgInfo{ID: id, Module: m, Name: f.PkgName, First: f,
				Funcs: map[string]bool{}, Types: map[string]bool{}, Methods: map[string]map[string]bool{}}
			ix.pkgs[id] = p
		}
		p.Files = append(p.Files, f)
		for _, d := range f.Decls {
			switch {
			case d.Recv != "":
				if p.Methods[d.Recv] == nil {
					p.Methods[d.Recv] = map[string]bool{}
				}
				p.Methods[d.Recv][d.Name] = true
			case d.TypeKind != "":
				p.Types[d.Name] = true
			default:
				p.Funcs[d.Name] = true
			}
		}
	}
	return ix
}

// resolveImport classifies importPath as seen from a package in module from.
func (ix *index) resolveImport(from *module, importPath string, explicitName string) target {
	t := ix.classify(from, importPath)
	switch {
	case explicitName != "":
		t.Name = explicitName
	case t.Class == importInternal:
		t.Name = t.Pkg.Name
	default:
		t.Name = guessName(importPath)
	}
	return t
}

func (ix *index) classify(from *module, importPath string) target {
	if p := ix.pkgs[importPath]; p != nil {
		return target{Class: importInternal, Pkg: p}
	}
	// The longest matching module path wins, whether it was discovered in
	// the tree or only required: a require of a nested module path beats the
	// enclosing module that happens to be scanned.
	var best require
	for _, r := range from.Requires {
		if hasPathPrefix(importPath, r.Path) && len(r.Path) > len(best.Path) {
			best = r
		}
	}
	for _, m := range ix.w.Modules {
		if m.Path != "" && hasPathPrefix(importPath, m.Path) && len(m.Path) >= len(best.Path) {
			return target{Class: importUnresolved}
		}
	}
	if best.Path != "" {
		return target{Class: importExternal, Module: best.Path, Require: best}
	}
	if first, _, _ := strings.Cut(importPath, "/"); !strings.Contains(first, ".") {
		return target{Class: importStdlib}
	}
	return target{Class: importUnresolved}
}

func hasPathPrefix(p, prefix string) bool {
	return p == prefix || strings.HasPrefix(p, prefix+"/")
}

// guessName is the conventional package name for an import path that was
// not scanned: last element, minus a major-version suffix and go- / -go.
// It only decides whether a qualified call is external, never an edge.
func guessName(importPath string) string {
	name := path.Base(importPath)
	if isMajorVersion(name) {
		name = path.Base(path.Dir(importPath))
	}
	if i := strings.Index(name, ".v"); i > 0 && isDigits(name[i+2:]) {
		name = name[:i] // gopkg.in/yaml.v3
	}
	name = strings.TrimPrefix(name, "go-")
	name = strings.TrimSuffix(name, "-go")
	return name
}

func isMajorVersion(s string) bool {
	return len(s) > 1 && s[0] == 'v' && isDigits(s[1:])
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
