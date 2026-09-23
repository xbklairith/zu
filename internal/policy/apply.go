package policy

import (
	"slices"
	"strings"

	"zu/internal/ir"
)

// under reports whether id is prefix or lies below it in the import-path
// hierarchy: "a/b" is under "a", "a/bc" is not.
func under(id, prefix string) bool {
	return id == prefix || strings.HasPrefix(id, prefix+"/")
}

// underAny reports whether id is under one of prefixes.
func underAny(id string, prefixes []string) bool {
	return slices.ContainsFunc(prefixes, func(p string) bool { return under(id, p) })
}

// packageOf maps every node id to its package: a package or an external to
// itself, a declaration to its package through Parent.
func packageOf(doc *ir.IR) map[string]string {
	parent := make(map[string]string, len(doc.Nodes))
	for _, n := range doc.Nodes {
		parent[n.ID] = n.Parent
	}
	out := make(map[string]string, len(doc.Nodes))
	for _, n := range doc.Nodes {
		id := n.ID
		for parent[id] != "" {
			id = parent[id]
		}
		out[n.ID] = id
	}
	return out
}

// foreignIDs maps each external node under a Foreign prefix to the longest
// such prefix: the id of the one node it collapses into.
func (p *Policy) foreignIDs(doc *ir.IR) map[string]string {
	out := map[string]string{}
	for _, n := range doc.Nodes {
		if n.Kind != ir.KindExternal {
			continue
		}
		for _, f := range p.Foreign {
			if under(n.ID, f) && len(f) > len(out[n.ID]) {
				out[n.ID] = f
			}
		}
	}
	return out
}

// Apply returns doc as the Policy draws and checks it: nodes under Omit gone
// with their declarations and edges, edges matching OmitEdges gone, and
// externals under a Foreign prefix merged into one external node whose id is
// the longest such prefix. Unlisted externals stay (04 already groups them).
// Merged nodes and edges keep every location; an edge that merging turns
// into a self-loop is dropped. doc is not modified and nothing is invented.
func (p *Policy) Apply(doc *ir.IR) *ir.IR {
	pkg := packageOf(doc)
	foreign := p.foreignIDs(doc)
	rename := func(id string) string {
		if f, ok := foreign[id]; ok {
			return f
		}
		return id
	}
	omitted := func(id string) bool { return underAny(pkg[id], p.Omit) }

	out := *doc
	out.Nodes, out.Edges = nil, nil
	nodeAt := map[string]int{}
	for _, n := range doc.Nodes {
		if omitted(n.ID) {
			continue
		}
		n.ID = rename(n.ID)
		if i, ok := nodeAt[n.ID]; ok {
			out.Nodes[i].Locations = union(out.Nodes[i].Locations, n.Locations)
			continue
		}
		n.Locations = slices.Clone(n.Locations)
		nodeAt[n.ID] = len(out.Nodes)
		out.Nodes = append(out.Nodes, n)
	}
	type key struct {
		from, to string
		kind     ir.EdgeKind
	}
	edgeAt := map[key]int{}
	for _, e := range doc.Edges {
		if omitted(e.From) || omitted(e.To) || p.omitsEdge(pkg[e.From], pkg[e.To]) {
			continue
		}
		k := key{rename(e.From), rename(e.To), e.Kind}
		if k.from == k.to {
			continue
		}
		if i, ok := edgeAt[k]; ok {
			out.Edges[i].Locations = union(out.Edges[i].Locations, e.Locations)
			continue
		}
		edgeAt[k] = len(out.Edges)
		out.Edges = append(out.Edges, ir.Edge{From: k.from, To: k.to, Kind: e.Kind, Locations: slices.Clone(e.Locations)})
	}
	ir.Sort(&out)
	return &out
}

// Lens reports whether Apply can change a graph: whether the Policy omits
// or collapses anything.
func (p *Policy) Lens() bool {
	return len(p.Omit)+len(p.OmitEdges)+len(p.Foreign) > 0
}

// omitsEdge reports whether an OmitEdges pair covers a dependency between
// these packages.
func (p *Policy) omitsEdge(fromPkg, toPkg string) bool {
	return slices.ContainsFunc(p.OmitEdges, func(e Pair) bool {
		return under(fromPkg, e.From) && under(toPkg, e.To)
	})
}

// union is a followed by the locations of b it lacks.
func union(a, b []ir.Location) []ir.Location {
	for _, l := range b {
		if !slices.Contains(a, l) {
			a = append(a, l)
		}
	}
	return a
}
