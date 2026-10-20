// Package diff compares two IRs. It is pure: no I/O, and the same input
// always gives the same, sorted output.
package diff

import (
	"cmp"
	"slices"
	"strings"

	"zu/internal/ir"
)

// Status is a Change Status (glossary).
type Status string

// Change statuses. Reversed applies to import edges only.
const (
	Added    Status = "added"
	Removed  Status = "removed"
	Modified Status = "modified"
	Reversed Status = "reversed"
)

// NodeChange is one node whose Change Status is not unchanged.
type NodeChange struct {
	ID     string      `json:"id"`
	Kind   ir.NodeKind `json:"kind"`
	Status Status      `json:"status"`
}

// EdgeChange is one edge added, removed or (imports only) reversed. A
// reversed pair is reported once, in head's direction.
type EdgeChange struct {
	From   string      `json:"from"`
	To     string      `json:"to"`
	Kind   ir.EdgeKind `json:"kind"`
	Status Status      `json:"status"`
}

// Move pairs a removed and an added declaration that are the same code under
// another name or in another package (0003).
type Move struct {
	From string      `json:"from"`
	To   string      `json:"to"`
	Kind ir.NodeKind `json:"kind"`
}

// Delta is everything that differs between two IRs. Nodes are sorted by id,
// edges by (kind, from, to), moves by from. A Move's ids are not in Nodes.
type Delta struct {
	Nodes []NodeChange
	Edges []EdgeChange
	Moves []Move
}

// Compare returns what changed from base to head. Nodes are matched by id: a
// node only in head is added, only in base removed, and in both with a
// different hash modified (external nodes have no hash, so they are never
// modified). Edges are matched by (from, to, kind); locations are ignored.
// Two IRs in ir.Sort's order are walked side by side, with no map of either
// (16); others are matched through maps, to the same Delta.
func Compare(base, head *ir.IR) Delta {
	if ir.InOrder(base) && ir.InOrder(head) {
		return compare(base, head, mergeNodes, mergeEdges)
	}
	return compareByKey(base, head)
}

func compareByKey(base, head *ir.IR) Delta { return compare(base, head, nodesByKey, edgesByKey) }

// A nodeDiff finds the nodes whose hash changed, and those only in base and
// only in head; an edgeDiff, the edges only in base and only in head.
type (
	nodeDiff func(base, head *ir.IR) (modified []NodeChange, removed, added []ir.Node)
	edgeDiff func(base, head *ir.IR) (removed, added []edgeKey)
)

type edgeKey struct {
	kind     ir.EdgeKind
	from, to string
}

func compare(base, head *ir.IR, nodes nodeDiff, edges edgeDiff) Delta {
	var d Delta
	modified, removed, added := nodes(base, head)
	d.Nodes = modified
	pkgs := map[string]bool{} // package ids on either side
	for _, n := range append(slices.Clip(base.Nodes), head.Nodes...) {
		if n.Kind == ir.KindPackage {
			pkgs[n.ID] = true
		}
	}
	d.Moves = moves(removed, added, pkgs)
	moved := map[string]bool{}
	for _, m := range d.Moves {
		moved[m.From], moved[m.To] = true, true
	}
	for _, n := range removed {
		if !moved[n.ID] {
			d.Nodes = append(d.Nodes, NodeChange{ID: n.ID, Kind: n.Kind, Status: Removed})
		}
	}
	for _, n := range added {
		if !moved[n.ID] {
			d.Nodes = append(d.Nodes, NodeChange{ID: n.ID, Kind: n.Kind, Status: Added})
		}
	}
	slices.SortFunc(d.Nodes, func(a, b NodeChange) int { return strings.Compare(a.ID, b.ID) })

	d.Edges = fold(edges(base, head))
	return d
}

func nodesByKey(base, head *ir.IR) (modified []NodeChange, removed, added []ir.Node) {
	baseNodes := byID(base)
	headNodes := byID(head)
	for id, b := range baseNodes {
		h, ok := headNodes[id]
		switch {
		case !ok:
			removed = append(removed, b)
		case h.Hash != b.Hash:
			modified = append(modified, NodeChange{ID: id, Kind: h.Kind, Status: Modified})
		}
	}
	for id, h := range headNodes {
		if _, ok := baseNodes[id]; !ok {
			added = append(added, h)
		}
	}
	return modified, removed, added
}

// mergeNodes is nodesByKey for two IRs whose nodes are in order by id.
func mergeNodes(base, head *ir.IR) (modified []NodeChange, removed, added []ir.Node) {
	b, h := base.Nodes, head.Nodes
	for len(b) > 0 || len(h) > 0 {
		switch {
		case len(h) == 0 || len(b) > 0 && b[0].ID < h[0].ID:
			removed = append(removed, b[0])
			b = b[1:]
		case len(b) == 0 || h[0].ID < b[0].ID:
			added = append(added, h[0])
			h = h[1:]
		default:
			if h[0].Hash != b[0].Hash {
				modified = append(modified, NodeChange{ID: h[0].ID, Kind: h[0].Kind, Status: Modified})
			}
			b, h = b[1:], h[1:]
		}
	}
	return modified, removed, added
}

func byID(d *ir.IR) map[string]ir.Node {
	m := make(map[string]ir.Node, len(d.Nodes))
	for _, n := range d.Nodes {
		m[n.ID] = n
	}
	return m
}

// moves pairs removed and added declarations of one kind and one shape when
// the group holds exactly one of each (0003) and the pair keeps its package
// or its name: when both change, equal shapes are more likely two small
// look-alike bodies than one moved declaration, and a false Move would tell
// a reviewer that changed code is unchanged.
func moves(removed, added []ir.Node, pkgs map[string]bool) []Move {
	type key struct {
		kind  ir.NodeKind
		shape string
	}
	group := func(ns []ir.Node) map[key][]ir.Node {
		g := map[key][]ir.Node{}
		for _, n := range ns {
			if n.Shape != "" && (n.Kind == ir.KindType || n.Kind == ir.KindFunction) {
				k := key{n.Kind, n.Shape}
				g[k] = append(g[k], n)
			}
		}
		return g
	}
	gr, ga := group(removed), group(added)
	var out []Move
	for k, rs := range gr {
		as := ga[k]
		if len(rs) != 1 || len(as) != 1 {
			continue
		}
		fromPkg, fromName := splitDecl(rs[0].ID, pkgs)
		toPkg, toName := splitDecl(as[0].ID, pkgs)
		if fromPkg != toPkg && fromName != toName {
			continue
		}
		out = append(out, Move{From: rs[0].ID, To: as[0].ID, Kind: k.kind})
	}
	slices.SortFunc(out, func(a, b Move) int { return strings.Compare(a.From, b.From) })
	return out
}

// splitDecl splits a declaration id into its package id and its name within
// the package ("T" or "T.M"). Import paths may contain dots ("example.com"),
// so the package is the longest dot-delimited prefix that is a package node.
func splitDecl(id string, pkgs map[string]bool) (pkg, name string) {
	for i := len(id) - 1; i > 0; i-- {
		if id[i] == '.' && pkgs[id[:i]] {
			return id[:i], id[i+1:]
		}
	}
	return "", id
}

func edgesByKey(base, head *ir.IR) (removed, added []edgeKey) {
	set := func(d *ir.IR) map[edgeKey]bool {
		s := make(map[edgeKey]bool, len(d.Edges))
		for _, e := range d.Edges {
			s[edgeKey{e.Kind, e.From, e.To}] = true
		}
		return s
	}
	bs, hs := set(base), set(head)
	for k := range hs {
		if !bs[k] {
			added = append(added, k)
		}
	}
	for k := range bs {
		if !hs[k] {
			removed = append(removed, k)
		}
	}
	return removed, added
}

// mergeEdges is edgesByKey for two IRs whose edges are in ir.Sort's order.
func mergeEdges(base, head *ir.IR) (removed, added []edgeKey) {
	b, h := base.Edges, head.Edges
	key := func(e ir.Edge) edgeKey { return edgeKey{e.Kind, e.From, e.To} }
	for len(b) > 0 || len(h) > 0 {
		c := 0
		switch {
		case len(h) == 0:
			c = -1
		case len(b) == 0:
			c = 1
		default:
			c = cmp.Or(strings.Compare(b[0].From, h[0].From), strings.Compare(b[0].To, h[0].To),
				strings.Compare(string(b[0].Kind), string(h[0].Kind)))
		}
		switch {
		case c < 0:
			removed = append(removed, key(b[0]))
			b = b[1:]
		case c > 0:
			added = append(added, key(h[0]))
			h = h[1:]
		default:
			b, h = b[1:], h[1:]
		}
	}
	return removed, added
}

// fold turns the edges only in base and only in head into changes, folding
// a removed a→b import with an added b→a import into one reversed change.
func fold(removed, added []edgeKey) []EdgeChange {
	set := func(ks []edgeKey) map[edgeKey]bool {
		s := make(map[edgeKey]bool, len(ks))
		for _, k := range ks {
			s[k] = true
		}
		return s
	}
	gone, came := set(removed), set(added)
	var out []EdgeChange
	for _, k := range added {
		status := Added
		if k.kind == ir.EdgeImports && gone[edgeKey{k.kind, k.to, k.from}] {
			status = Reversed
		}
		out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: status})
	}
	for _, k := range removed {
		if k.kind == ir.EdgeImports && came[edgeKey{k.kind, k.to, k.from}] {
			continue // reported as reversed
		}
		out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: Removed})
	}
	slices.SortFunc(out, func(a, b EdgeChange) int {
		return cmp.Or(strings.Compare(string(a.Kind), string(b.Kind)),
			strings.Compare(a.From, b.From), strings.Compare(a.To, b.To))
	})
	return out
}
