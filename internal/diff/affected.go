package diff

import (
	"cmp"
	"slices"
	"strings"

	"zu/internal/ir"
)

// Hop is one package of the Affected Set with its distance, in imports, from
// the nearest changed package (0 for a changed package itself).
type Hop struct {
	Package string `json:"package"`
	Hops    int    `json:"hops"`
}

// Affected returns the Affected Set (0009): the changed packages at hop 0
// plus every package that transitively imports one of them, over head's
// import edges between package nodes, each with its shortest hop distance.
// changed are the ids of added or modified packages; ids that are not
// packages in head are ignored. The result is sorted by (hops, package), and
// its length is the blast-radius count.
func Affected(head *ir.IR, changed []string) []Hop {
	pkgs := map[string]bool{}
	for _, n := range head.Nodes {
		if n.Kind == ir.KindPackage {
			pkgs[n.ID] = true
		}
	}
	importers := map[string][]string{}
	for _, e := range head.Edges {
		if e.Kind == ir.EdgeImports && pkgs[e.From] && pkgs[e.To] {
			importers[e.To] = append(importers[e.To], e.From)
		}
	}
	dist := map[string]int{}
	var queue []string
	for _, id := range changed {
		if _, seen := dist[id]; pkgs[id] && !seen {
			dist[id] = 0
			queue = append(queue, id)
		}
	}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, imp := range importers[id] {
			if _, seen := dist[imp]; !seen {
				dist[imp] = dist[id] + 1
				queue = append(queue, imp)
			}
		}
	}
	out := make([]Hop, 0, len(dist))
	for id, h := range dist {
		out = append(out, Hop{Package: id, Hops: h})
	}
	slices.SortFunc(out, func(a, b Hop) int {
		return cmp.Or(cmp.Compare(a.Hops, b.Hops), strings.Compare(a.Package, b.Package))
	})
	return out
}
