package scan

import (
	"path"

	"zu/internal/ir"
)

// builder accumulates nodes and edges; maps give lookup, ir.Sort gives order.
type builder struct {
	ix    *index
	doc   *ir.IR
	nodes map[string]*ir.Node
	edges map[edgeID]*ir.Edge
}

type edgeID struct {
	From, To string
	Kind     ir.EdgeKind
}

// assemble turns per-file facts into an IR (unsorted; ir.Encode sorts).
func assemble(w *walkResult, facts []*fileFacts) *ir.IR {
	b := &builder{
		ix: buildIndex(w, facts),
		doc: &ir.IR{
			UnresolvedCalls:   map[string]int{},
			UnresolvedImports: map[string]int{},
			Unsupported:       w.Unsupported,
			ParseErrors:       append([]ir.ParseError(nil), w.Errors...),
		},
		nodes: map[string]*ir.Node{},
		edges: map[edgeID]*ir.Edge{},
	}
	for _, f := range facts {
		if f.Err != nil {
			b.doc.ParseErrors = append(b.doc.ParseErrors, *f.Err)
		}
	}
	for _, f := range facts {
		if f.Skip || f.Err != nil {
			continue
		}
		p := b.ix.pkgs[importPath(w.moduleFor(f.Dir), f.Dir)]
		b.packageNode(p)
		b.imports(p, f)
	}
	for _, n := range b.nodes {
		b.doc.Nodes = append(b.doc.Nodes, *n)
	}
	for _, e := range b.edges {
		b.doc.Edges = append(b.doc.Edges, *e)
	}
	return b.doc
}

func (b *builder) packageNode(p *pkgInfo) {
	if b.nodes[p.ID] != nil {
		return
	}
	b.nodes[p.ID] = &ir.Node{
		ID: p.ID, Kind: ir.KindPackage, Module: p.Module.Path,
		Locations: []ir.Location{{Path: p.First.Path, Line: p.First.PkgLine}},
	}
}

func (b *builder) imports(p *pkgInfo, f *fileFacts) {
	for _, imp := range f.Imports {
		t := b.ix.resolveImport(p.Module, imp.Path, imp.Name)
		loc := ir.Location{Path: f.Path, Line: imp.Line}
		switch t.Class {
		case importInternal:
			b.edge(p.ID, t.Pkg.ID, ir.EdgeImports, loc)
		case importExternal:
			b.external(p.Module, t)
			b.edge(p.ID, t.Module, ir.EdgeImports, loc)
		case importUnresolved:
			b.doc.UnresolvedImports[imp.Path]++
		}
	}
}

// external ensures the node for a required module, located at the require
// line of each go.mod that led to it.
func (b *builder) external(m *module, t target) {
	loc := ir.Location{Path: path.Join(m.Dir, "go.mod"), Line: t.Require.Line}
	n := b.nodes[t.Module]
	if n == nil {
		b.nodes[t.Module] = &ir.Node{ID: t.Module, Kind: ir.KindExternal, Locations: []ir.Location{loc}}
		return
	}
	for _, l := range n.Locations {
		if l == loc {
			return
		}
	}
	n.Locations = append(n.Locations, loc)
}

func (b *builder) edge(from, to string, kind ir.EdgeKind, loc ir.Location) {
	id := edgeID{from, to, kind}
	e := b.edges[id]
	if e == nil {
		e = &ir.Edge{From: from, To: to, Kind: kind}
		b.edges[id] = e
	}
	e.Locations = append(e.Locations, loc)
}
