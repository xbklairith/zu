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
	pkgOf := packageOf(nodesByID(doc))
	detail, decls, gen := map[string]bool{}, map[string]int{}, map[string]int{}
	matched := make([]bool, len(include))
	for i := range doc.Nodes {
		n := &doc.Nodes[i]
		switch n.Kind {
		case ir.KindType, ir.KindFunction:
			decls[pkgOf(n.ID)]++
			if n.Generated {
				gen[pkgOf(n.ID)]++
			}
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
	modules, files, in, decl := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	for i := range doc.Nodes {
		n := &doc.Nodes[i]
		vn := toNode(n)
		switch n.Kind {
		case ir.KindPackage:
			modules[n.Module] = true
			vn.Decls, vn.GenDecls, vn.Unresolved, vn.Detail = decls[n.ID], gen[n.ID], doc.UnresolvedCalls[n.ID], detail[n.ID]
		case ir.KindType, ir.KindFunction:
			if !detail[pkgOf(n.ID)] {
				continue
			}
			for _, l := range n.Locations {
				files[l.Path] = true
			}
			decl[n.ID] = true
		}
		v.Nodes = append(v.Nodes, vn)
		in[n.ID] = true
	}
	for m := range modules {
		v.Modules = append(v.Modules, m)
	}
	// 17: a call or embed with one end off the page is counted on the other,
	// when that end is a declaration: an external that a type off the page
	// embeds counts nothing, as its Screen draws imports.
	offIn, offOut := map[string]int{}, map[string]int{}
	for i := range doc.Edges {
		e := &doc.Edges[i]
		switch {
		case e.Kind == ir.EdgeImports || in[e.From] && in[e.To]:
			v.Edges = append(v.Edges, toEdge(e))
		case decl[e.From]:
			offOut[e.From] += len(e.Locations)
		case decl[e.To]:
			offIn[e.To] += len(e.Locations)
		}
	}
	for i := range v.Nodes {
		n := &v.Nodes[i]
		n.OffIn, n.OffOut = offIn[n.ID], offOut[n.ID]
	}
	if err := addSources(v, files, read); err != nil {
		return nil, err
	}
	sortView(v)
	return v, nil
}

// addSources inlines each file with its Syntax (19), refusing any path that
// could leave the repository.
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
		if v.Syntax == nil {
			v.Syntax = map[string][][]int{}
		}
		v.Syntax[p] = Syntax(b)
	}
	return nil
}
