package scan

import (
	"cmp"
	"maps"
	"slices"
	"strings"

	"zu/internal/ir"
)

// assembly is one scan's IR kept by package, so the next scan through the
// same Cache assembles again only the packages whose inputs changed (16).
// A package's part is what assembling the whole tree gives its files: the
// package node, its declarations, the edges out of them, its unresolved
// calls and imports, the externals its imports reach and its Measures.
// Beyond its own files a part reads only the modules (every go.mod) and,
// through its imports, the surface of the packages it imports: their Name,
// functions and types. An assembly is never changed once built.
type assembly struct {
	modules []*module
	parts   map[string]*part // by package id
}

// part is one package's share of the IR.
type part struct {
	files     []*fileFacts // the facts it was built from, in path order
	surface   string       // surfaceOf the package it was built for
	nodes     []ir.Node    // the package and its declarations
	externals []ir.Node    // each external its imports reach, at the require lines
	edges     []ir.Edge
	calls     int            // its unresolved calls
	imports   map[string]int // its unresolved imports
	measures  Measures
}

// assembleParts assembles facts from prev's parts where they still hold and
// builds the rest, and reports how many packages it built. It returns nil
// when two nodes could share an id (see separable): only a whole assembly
// resolves that, as dropCollisions does.
func assembleParts(prev *assembly, w *walkResult, facts []*fileFacts) (*assembly, int) {
	ix := buildIndex(w, facts)
	if !separable(ix, w) {
		return nil, 0
	}
	reuse := prev != nil && len(prev.parts) == len(ix.pkgs) && sameModules(prev.modules, w.Modules)
	for id := range ix.pkgs {
		reuse = reuse && prev.parts[id] != nil
	}
	build := map[string]bool{}
	for id, p := range ix.pkgs {
		if !reuse || !slices.Equal(prev.parts[id].files, p.Files) {
			build[id] = true
		}
	}
	if reuse {
		var moved []string // packages whose surface changed: their importers resolve against it
		for id := range build {
			if surfaceOf(ix.pkgs[id]) != prev.parts[id].surface {
				moved = append(moved, id)
			}
		}
		if len(moved) > 0 {
			by := importers(w, facts)
			for _, id := range moved {
				for q := range by[id] {
					build[q] = true
				}
			}
		}
	}
	a := &assembly{modules: w.Modules, parts: make(map[string]*part, len(ix.pkgs))}
	for id, p := range ix.pkgs {
		if build[id] {
			a.parts[id] = buildPart(ix, w, p)
		} else {
			a.parts[id] = prev.parts[id]
		}
	}
	return a, len(build)
}

// separable reports whether no two nodes can share an id, and no package's
// ids fall among another's, so that each package's part is exactly what a
// whole assembly gives its files and the parts join in order. Dots are legal
// in directory names: package m/a.b and type b of package m/a are both
// "m/a.b", and a method c of that type is "m/a.b.c" as is function c of
// m/a.b; package m/a.F/x is no declaration's id but sorts among m/a's. So a
// package id, or a required module path (an external's id), must not be
// another package's id plus "." and more, nor may a required module path be
// a package id. A require of a module the tree holds never becomes an
// external: that module's path claims every import under it
// (index.classify), so its path may be a package id (kubernetes' staging
// modules).
func separable(ix *index, w *walkResult) bool {
	dotted := func(id string) bool {
		for i := range len(id) {
			if id[i] == '.' && ix.pkgs[id[:i]] != nil {
				return true
			}
		}
		return false
	}
	for id := range ix.pkgs {
		if dotted(id) {
			return false
		}
	}
	held := map[string]bool{}
	for _, m := range w.Modules {
		held[m.Path] = true
	}
	for _, m := range w.Modules {
		for _, r := range m.Requires {
			if !held[r.Path] && (ix.pkgs[r.Path] != nil || dotted(r.Path)) {
				return false
			}
		}
	}
	return true
}

// importers maps each import path to the packages with a file importing it.
func importers(w *walkResult, facts []*fileFacts) map[string]map[string]bool {
	by := map[string]map[string]bool{}
	for _, f := range facts {
		if f.Skip || f.Err != nil {
			continue
		}
		q := importPath(w.moduleFor(f.Dir), f.Dir)
		for _, imp := range f.Imports {
			if by[imp.Path] == nil {
				by[imp.Path] = map[string]bool{}
			}
			by[imp.Path][q] = true
		}
	}
	return by
}

// sameModules reports whether a and b are the same go.mod files, requires
// and their lines included.
func sameModules(a, b []*module) bool {
	return slices.EqualFunc(a, b, func(x, y *module) bool {
		return x.Path == y.Path && x.Dir == y.Dir && slices.Equal(x.Requires, y.Requires)
	})
}

// buildPart assembles p's files alone, against the whole index.
func buildPart(ix *index, w *walkResult, p *pkgInfo) *part {
	doc, ms := assembleWith(ix, w, p.Files)
	pt := &part{files: p.Files, surface: surfaceOf(p), edges: doc.Edges, calls: doc.UnresolvedCalls[p.ID],
		imports: doc.UnresolvedImports, measures: ms}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindExternal {
			pt.externals = append(pt.externals, n)
		} else {
			pt.nodes = append(pt.nodes, n)
		}
	}
	// Sorted once here, as ir.Sort would: the IR joins parts in package
	// order, so ir.Sort finds it nearly in order, and never writes to the
	// location lists that later scans share.
	part := &ir.IR{Nodes: pt.nodes, Edges: pt.edges}
	ir.Sort(part)
	pt.nodes, pt.edges = part.Nodes, part.Edges
	return pt
}

// ir joins the parts into one IR, in order, with the parse errors and
// unsupported files of the whole tree, and their Measures.
func (a *assembly) ir(w *walkResult, facts []*fileFacts) (*ir.IR, Measures) {
	doc := &ir.IR{
		UnresolvedCalls:   map[string]int{},
		UnresolvedImports: map[string]int{},
		Unsupported:       w.Unsupported,
		ParseErrors:       append([]ir.ParseError(nil), w.Errors...),
	}
	for _, f := range facts {
		if f.Err != nil {
			doc.ParseErrors = append(doc.ParseErrors, *f.Err)
		}
	}
	ms := Measures{Funcs: map[string]Measure{}, Files: map[string][]Span{}}
	var nodes [][]ir.Node
	var edges [][]ir.Edge
	ext := map[string][]ir.Location{}
	for id, pt := range a.parts {
		nodes = append(nodes, runs(pt.nodes, func(n ir.Node) bool { return n.ID == id })...)
		edges = append(edges, runs(pt.edges, func(e ir.Edge) bool { return e.From == id })...)
		if pt.calls > 0 {
			doc.UnresolvedCalls[id] = pt.calls
		}
		for p, n := range pt.imports {
			doc.UnresolvedImports[p] += n
		}
		for _, n := range pt.externals {
			for _, l := range n.Locations {
				if !slices.Contains(ext[n.ID], l) {
					ext[n.ID] = append(ext[n.ID], l)
				}
			}
		}
		maps.Copy(ms.Funcs, pt.measures.Funcs)
		maps.Copy(ms.Files, pt.measures.Files)
	}
	for id, l := range ext {
		sortLocations(l)
		nodes = append(nodes, []ir.Node{{ID: id, Kind: ir.KindExternal, Locations: l}})
	}
	// Each run holds one package's node, or its declarations, or the edges
	// out of either, and runs never overlap: a declaration's id is its
	// package's plus "." and a name, and separable rules out any other
	// package's id, declaration or external starting so. So the runs, put in
	// order by their first element, are the nodes and the edges in order.
	slices.SortFunc(nodes, func(x, y []ir.Node) int { return strings.Compare(x[0].ID, y[0].ID) })
	slices.SortFunc(edges, func(x, y []ir.Edge) int { return byEdge(x[0], y[0]) })
	doc.Nodes, doc.Edges = slices.Concat(nodes...), slices.Concat(edges...)
	return doc, ms
}

// runs splits a sorted part list in two: the leading elements that belong
// to the package itself (head), and the rest, its declarations'. Empty runs
// are left out.
func runs[E any](l []E, head func(E) bool) [][]E {
	i := 0
	for i < len(l) && head(l[i]) {
		i++
	}
	var out [][]E
	for _, r := range [][]E{l[:i], l[i:]} {
		if len(r) > 0 {
			out = append(out, r)
		}
	}
	return out
}

func byEdge(a, b ir.Edge) int {
	return cmp.Or(strings.Compare(a.From, b.From), strings.Compare(a.To, b.To), strings.Compare(string(a.Kind), string(b.Kind)))
}

func sortLocations(l []ir.Location) {
	slices.SortFunc(l, func(a, b ir.Location) int {
		return cmp.Or(strings.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line))
	})
}
