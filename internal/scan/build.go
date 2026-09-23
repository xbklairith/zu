package scan

import (
	"cmp"
	"fmt"
	"path"
	"slices"
	"strings"

	"zu/internal/ir"
)

// builder accumulates nodes and edges; maps give lookup, ir.Sort gives order.
type builder struct {
	ix      *index
	doc     *ir.IR
	nodes   map[string]*ir.Node
	edges   map[edgeID]*ir.Edge
	decls   map[string][]declAt // node id → every declaration of it
	members map[string][]string // package id → ids of its types and functions
}

// declAt is one declaration of a node, kept until merging.
type declAt struct {
	declFact
	Pkg       string
	Loc       ir.Location
	Generated bool
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
		nodes:   map[string]*ir.Node{},
		edges:   map[edgeID]*ir.Edge{},
		decls:   map[string][]declAt{},
		members: map[string][]string{},
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
		for _, d := range f.Decls {
			id := declID(p.ID, d.Recv, d.Name)
			if b.decls[id] == nil {
				b.members[p.ID] = append(b.members[p.ID], id)
			}
			b.decls[id] = append(b.decls[id], declAt{d, p.ID, ir.Location{Path: f.Path, Line: d.Line}, f.Generated})
		}
		names := b.imports(p, f)
		b.calls(p, f, names)
		b.embeds(p, f, names)
	}
	dropped := b.dropCollisions()
	for id, ds := range b.decls {
		b.nodes[id] = mergeDecls(id, ds[0].Pkg, ds)
	}
	for _, p := range b.ix.pkgs {
		b.nodes[p.ID].Hash = b.packageHash(p)
	}
	for _, n := range b.nodes {
		b.doc.Nodes = append(b.doc.Nodes, *n)
	}
	for _, e := range b.edges {
		if !dropped[e.From] && !dropped[e.To] {
			b.doc.Edges = append(b.doc.Edges, *e)
		}
	}
	return b.doc
}

// dropCollisions removes every declaration id that is also a package id, or
// that declarations in two packages share: dots are legal in directory
// names, so package m/a.b and type b of package m/a are both "m/a.b". Each
// dropped id is reported once, at its first location; the package wins.
func (b *builder) dropCollisions() map[string]bool {
	dropped := map[string]bool{}
	for id, ds := range b.decls {
		var pkgs []string
		for _, d := range ds {
			if !slices.Contains(pkgs, d.Pkg) {
				pkgs = append(pkgs, d.Pkg)
			}
		}
		clash := b.ix.pkgs[id] != nil
		if !clash && len(pkgs) == 1 {
			continue
		}
		slices.Sort(pkgs)
		first := slices.MinFunc(ds, func(x, y declAt) int {
			return cmp.Or(cmp.Compare(x.Loc.Path, y.Loc.Path), cmp.Compare(x.Loc.Line, y.Loc.Line))
		})
		what := "is declared in packages " + strings.Join(pkgs, ", ")
		if clash {
			what = "is also the id of package " + id
		}
		b.doc.ParseErrors = append(b.doc.ParseErrors, ir.ParseError{
			Path:    first.Loc.Path,
			Message: fmt.Sprintf("node id %q %s; declarations dropped", id, what),
		})
		dropped[id] = true
		delete(b.decls, id)
	}
	for p, ids := range b.members {
		b.members[p] = slices.DeleteFunc(ids, func(id string) bool { return dropped[id] })
	}
	return dropped
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

// imports adds the file's import edges and returns its import names.
func (b *builder) imports(p *pkgInfo, f *fileFacts) map[string]target {
	names := map[string]target{}
	for _, imp := range f.Imports {
		t := b.ix.resolveImport(p.Module, imp.Path, imp.Name)
		if t.Name != "_" && t.Name != "." {
			names[t.Name] = t
		}
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
	return names
}

// calls turns certain call sites into edges and counts the rest.
func (b *builder) calls(p *pkgInfo, f *fileFacts, names map[string]target) {
	for _, c := range f.Calls {
		from := declID(p.ID, c.FromRecv, c.FromName)
		to, counted := b.resolveCall(p, c, names)
		switch {
		case to != "":
			b.edge(from, to, ir.EdgeCalls, ir.Location{Path: f.Path, Line: c.Line})
		case counted:
			b.doc.UnresolvedCalls[p.ID]++
		}
	}
}

// resolveCall returns the callee id for a certain call, or reports whether
// an uncertain call counts as unresolved (false: builtin, conversion, or a
// call outside this repository).
func (b *builder) resolveCall(p *pkgInfo, c callSite, names map[string]target) (to string, unresolved bool) {
	switch c.Kind {
	case callBare:
		switch {
		case p.Funcs[c.Name]:
			return declID(p.ID, "", c.Name), false
		case p.Types[c.Name], builtins[c.Name]:
			return "", false
		}
	case callQualified:
		t, ok := names[c.X]
		switch {
		case !ok:
		case t.Class == importInternal && t.Pkg.Funcs[c.Name]:
			return declID(t.Pkg.ID, "", c.Name), false
		case t.Class == importInternal && t.Pkg.Types[c.Name]:
			return "", false
		case t.Class == importExternal, t.Class == importStdlib:
			return "", false
		}
	case callRecv:
		if p.Methods[c.FromRecv][c.Name] {
			return declID(p.ID, c.FromRecv, c.Name), false
		}
	}
	return "", true
}

// embeds adds an edge for each embedded type declared in this repository or
// in a required module; standard-library and predeclared types are omitted.
func (b *builder) embeds(p *pkgInfo, f *fileFacts, names map[string]target) {
	for _, e := range f.Embeds {
		from := declID(p.ID, "", e.Owner)
		loc := ir.Location{Path: f.Path, Line: e.Line}
		if e.X == "" {
			if p.Types[e.Name] {
				b.edge(from, declID(p.ID, "", e.Name), ir.EdgeEmbeds, loc)
			}
			continue
		}
		t, ok := names[e.X]
		switch {
		case !ok:
		case t.Class == importInternal && t.Pkg.Types[e.Name]:
			b.edge(from, declID(t.Pkg.ID, "", e.Name), ir.EdgeEmbeds, loc)
		case t.Class == importExternal:
			b.edge(from, t.Module, ir.EdgeEmbeds, loc)
		}
	}
}

// builtins are predeclared functions and types; calling or converting to
// one is never a dependency.
var builtins = map[string]bool{
	"append": true, "cap": true, "clear": true, "close": true, "complex": true,
	"copy": true, "delete": true, "imag": true, "len": true, "make": true,
	"max": true, "min": true, "new": true, "panic": true, "print": true,
	"println": true, "real": true, "recover": true,
	"any": true, "bool": true, "byte": true, "comparable": true, "complex64": true,
	"complex128": true, "error": true, "float32": true, "float64": true,
	"int": true, "int8": true, "int16": true, "int32": true, "int64": true,
	"rune": true, "string": true, "uint": true, "uint8": true, "uint16": true,
	"uint32": true, "uint64": true, "uintptr": true,
}

// declID is the node id of a type, function or method in package pkg.
func declID(pkg, recv, name string) string {
	if recv == "" {
		return pkg + "." + name
	}
	return pkg + "." + recv + "." + name
}

// mergeDecls builds one node from every declaration sharing an id (build
// variants, repeated init). A single declaration keeps its own hash and
// shape; several hash to SHA-256 over theirs in location order.
func mergeDecls(id, pkg string, ds []declAt) *ir.Node {
	slices.SortFunc(ds, func(a, b declAt) int {
		return cmp.Or(cmp.Compare(a.Loc.Path, b.Loc.Path), cmp.Compare(a.Loc.Line, b.Loc.Line))
	})
	first := ds[0]
	exported := first.Exported
	n := &ir.Node{ID: id, Kind: first.Kind, Parent: pkg, Exported: &exported, TypeKind: first.TypeKind, Generated: true}
	if first.Recv != "" {
		n.Parent = declID(pkg, "", first.Recv)
	}
	var hashes, shapes strings.Builder
	for _, d := range ds {
		n.Locations = append(n.Locations, d.Loc)
		n.Generated = n.Generated && d.Generated
		if d.TypeKind != n.TypeKind {
			n.TypeKind = ir.TypeOther
		}
		hashes.WriteString(d.Hash + "\n")
		shapes.WriteString(d.Shape + "\n")
	}
	n.Hash, n.Shape = first.Hash, first.Shape
	if len(ds) > 1 {
		n.Hash = hashBytes([]byte(hashes.String()))
		n.Shape = hashBytes([]byte(shapes.String()))
	}
	return n
}

// packageHash is SHA-256 over the sorted "id hash" lines of the package's
// members plus one "#decls" line for its const, var and import declarations.
func (b *builder) packageHash(p *pkgInfo) string {
	var other []string
	for _, f := range p.Files {
		other = append(other, f.OtherHashes...)
	}
	slices.Sort(other)
	lines := []string{"#decls " + hashBytes([]byte(strings.Join(other, "\n")))}
	for _, id := range b.members[p.ID] {
		lines = append(lines, id+" "+b.nodes[id].Hash)
	}
	slices.Sort(lines)
	return hashBytes([]byte(strings.Join(lines, "\n") + "\n"))
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
	if !slices.Contains(e.Locations, loc) {
		e.Locations = append(e.Locations, loc)
	}
}
