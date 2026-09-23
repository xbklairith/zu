// Package export turns an IR into the data one HTML Export carries and writes
// the self-contained file (decision 0006).
package export

import (
	"fmt"
	"path"
	"strings"

	"zu/internal/ir"
)

// Pattern selects packages by import path: "a/b" exactly, "a/b/..." for a/b and
// everything below it. A leading "./" (or ".") means the root module, and then
// only packages of that module match, as with go's ./... .
type Pattern struct {
	src    string
	path   string
	tree   bool
	module string // set for ./ patterns
}

func (p Pattern) String() string { return p.src }

// ParsePattern parses one -include value. rootModule is the module at the scan
// root, or "" when there is none.
func ParsePattern(s, rootModule string) (Pattern, error) {
	bad := fmt.Errorf("-include %q: want an import path, optionally ending in /... (./ means the root module)", s)
	p, tree, module := s, false, ""
	if rest, ok := strings.CutSuffix(p, "/..."); ok {
		p, tree = rest, true
	}
	if p == "." || strings.HasPrefix(p, "./") {
		if rootModule == "" {
			return Pattern{}, fmt.Errorf("-include %q: no module at the scan root for ./ to refer to", s)
		}
		p = strings.TrimSuffix(rootModule+"/"+strings.TrimPrefix(strings.TrimPrefix(p, "."), "/"), "/")
		module = rootModule
	}
	if p == "" || strings.HasPrefix(p, "/") || strings.HasSuffix(p, "/") ||
		strings.Contains(p, "//") || strings.Contains(p, "..") {
		return Pattern{}, bad
	}
	return Pattern{src: s, path: p, tree: tree, module: module}, nil
}

// Match reports whether the package with import path pkg, in module, is selected.
func (p Pattern) Match(pkg, module string) bool {
	if p.module != "" && module != p.module {
		return false
	}
	return pkg == p.path || p.tree && strings.HasPrefix(pkg, p.path+"/")
}

// RootModule returns the module whose directory is the scan root, derived from
// any of its packages: id = module + "/" + rel and the package dir ends in rel.
func RootModule(doc *ir.IR) string {
	for _, n := range doc.Nodes {
		if n.Kind != ir.KindPackage || len(n.Locations) == 0 {
			continue
		}
		rel := strings.TrimPrefix(strings.TrimPrefix(n.ID, n.Module), "/")
		dir := path.Dir(n.Locations[0].Path)
		if rel == "" && dir == "." || rel != "" && dir == rel {
			return n.Module
		}
	}
	return ""
}
