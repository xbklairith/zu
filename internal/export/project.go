package export

import (
	"fmt"
	"path/filepath"
	"slices"

	"zu/internal/ir"
)

// ReadFunc returns the content of a repo-relative, forward-slash path.
type ReadFunc func(path string) ([]byte, error)

// Project builds the Project View: every package and external with its import
// edges, plus declarations, calls, embeds and source for included packages.
func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
	byID := make(map[string]*ir.Node, len(doc.Nodes))
	for i := range doc.Nodes {
		byID[doc.Nodes[i].ID] = &doc.Nodes[i]
	}
	pkgOf := func(id string) string { // walks method → type → package
		for n := byID[id]; n != nil; n = byID[n.Parent] {
			if n.Kind == ir.KindPackage {
				return n.ID
			}
		}
		return ""
	}
	detail, decls := map[string]bool{}, map[string]int{}
	matched := make([]bool, len(include))
	for i := range doc.Nodes {
		n := &doc.Nodes[i]
		switch n.Kind {
		case ir.KindType, ir.KindFunction:
			decls[pkgOf(n.ID)]++
		case ir.KindPackage:
			for j, p := range include {
				if p.Match(n.ID, n.Module) {
					detail[n.ID], matched[j] = true, true
				}
			}
		}
	}
	for j, ok := range matched {
		if !ok {
			return nil, fmt.Errorf("-include %s matches no package", include[j])
		}
	}

	v := newView("project", doc)
	modules, files, in := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for i := range doc.Nodes {
		n := &doc.Nodes[i]
		vn := toNode(n)
		switch n.Kind {
		case ir.KindPackage:
			modules[n.Module] = true
			vn.Decls, vn.Unresolved, vn.Detail = decls[n.ID], doc.UnresolvedCalls[n.ID], detail[n.ID]
		case ir.KindType, ir.KindFunction:
			if !detail[pkgOf(n.ID)] {
				continue
			}
			for _, l := range n.Locations {
				files[l.Path] = true
			}
		}
		v.Nodes = append(v.Nodes, vn)
		in[n.ID] = true
	}
	for m := range modules {
		v.Modules = append(v.Modules, m)
	}
	for i := range doc.Edges {
		e := &doc.Edges[i]
		if e.Kind == ir.EdgeImports || in[e.From] && in[e.To] {
			v.Edges = append(v.Edges, toEdge(e))
		}
	}
	if err := addSources(v, files, read); err != nil {
		return nil, err
	}
	sortView(v)
	return v, nil
}

// addSources inlines each file, refusing any path that could leave the repository.
func addSources(v *View, files map[string]bool, read ReadFunc) error {
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	slices.Sort(paths)
	for _, p := range paths {
		if !filepath.IsLocal(filepath.FromSlash(p)) {
			return fmt.Errorf("source path %q is outside the repository", p)
		}
		b, err := read(p)
		if err != nil {
			return fmt.Errorf("read source %s: %w", p, err)
		}
		v.Sources[p] = string(b)
	}
	return nil
}
