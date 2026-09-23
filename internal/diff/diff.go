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
func Compare(base, head *ir.IR) Delta {
	var d Delta
	baseNodes := byID(base)
	headNodes := byID(head)
	var removed, added []ir.Node
	for id, b := range baseNodes {
		h, ok := headNodes[id]
		switch {
		case !ok:
			removed = append(removed, b)
		case h.Hash != b.Hash:
			d.Nodes = append(d.Nodes, NodeChange{ID: id, Kind: h.Kind, Status: Modified})
		}
	}
	for id, h := range headNodes {
		if _, ok := baseNodes[id]; !ok {
			added = append(added, h)
		}
	}
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

	d.Edges = edges(base, head)
	return d
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

// edges compares edge sets and folds a removed a→b import with an added b→a
// import into one reversed change.
func edges(base, head *ir.IR) []EdgeChange {
	type key struct {
		kind     ir.EdgeKind
		from, to string
	}
	set := func(d *ir.IR) map[key]bool {
		s := make(map[key]bool, len(d.Edges))
		for _, e := range d.Edges {
			s[key{e.Kind, e.From, e.To}] = true
		}
		return s
	}
	bs, hs := set(base), set(head)
	var out []EdgeChange
	for k := range hs {
		if bs[k] {
			continue
		}
		back := key{k.kind, k.to, k.from}
		if k.kind == ir.EdgeImports && bs[back] && !hs[back] {
			out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: Reversed})
			continue
		}
		out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: Added})
	}
	for k := range bs {
		if hs[k] {
			continue
		}
		back := key{k.kind, k.to, k.from}
		if k.kind == ir.EdgeImports && hs[back] && !bs[back] {
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
