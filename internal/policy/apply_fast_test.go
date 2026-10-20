package policy

import (
	"fmt"
	"math/rand/v2"
	"reflect"
	"slices"
	"testing"

	"zu/internal/ir"
)

// With no lens, Apply of a canonical IR copies no location list: a rescan
// of kubernetes applies the Policy to 110k nodes and 118k edges (16).
func TestApplyWithoutLensSharesLocations(t *testing.T) {
	doc := sample()
	ir.Sort(doc)
	out := (&Policy{}).Apply(doc)
	if &out.Nodes[0].Locations[0] != &doc.Nodes[0].Locations[0] {
		t.Error("a node's locations were copied")
	}
	if &out.Edges[0].Locations[0] != &doc.Edges[0].Locations[0] {
		t.Error("an edge's locations were copied")
	}
	if &out.Nodes[0] == &doc.Nodes[0] {
		t.Error("the node list is doc's: a change to out would change doc")
	}
}

// Whatever the IR, Apply with no lens gives what the whole Apply gives, and
// leaves doc as it was: out of order, duplicate ids and edges, self-loops,
// unordered or missing locations.
func TestApplyWithoutLensMatchesTheWholeApply(t *testing.T) {
	r := rand.New(rand.NewPCG(16, 3))
	id := func() string { return fmt.Sprintf("m/p%d", r.IntN(4)) + []string{"", ".F", ".T", ".T.M"}[r.IntN(4)] }
	locs := func() []ir.Location {
		var l []ir.Location
		for range r.IntN(3) {
			l = append(l, ir.Location{Path: fmt.Sprintf("f%d.go", r.IntN(2)), Line: r.IntN(4)})
		}
		return l
	}
	for i := range 2000 {
		doc := &ir.IR{}
		for range r.IntN(8) {
			doc.Nodes = append(doc.Nodes, ir.Node{ID: id(), Kind: ir.KindFunction, Locations: locs()})
		}
		for range r.IntN(8) {
			doc.Edges = append(doc.Edges, ir.Edge{From: id(), To: id(), Kind: []ir.EdgeKind{ir.EdgeCalls, ir.EdgeImports}[r.IntN(2)], Locations: locs()})
		}
		if r.IntN(2) == 0 {
			ir.Sort(doc) // canonical, mostly: duplicates and self-loops stay
		}
		was := clone(doc)
		p := &Policy{}
		got, want := p.Apply(doc), p.apply(clone(doc))
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("case %d: Apply\n%+v\nthe whole Apply\n%+v", i, got, want)
		}
		if !reflect.DeepEqual(doc, was) {
			t.Fatalf("case %d: Apply changed doc", i)
		}
	}
}

func clone(doc *ir.IR) *ir.IR {
	c := *doc
	c.Nodes, c.Edges = slices.Clone(doc.Nodes)[:0], slices.Clone(doc.Edges)[:0] // nil stays nil
	for _, n := range doc.Nodes {
		if n.Locations != nil {
			n.Locations = append([]ir.Location{}, n.Locations...)
		}
		c.Nodes = append(c.Nodes, n)
	}
	for _, e := range doc.Edges {
		if e.Locations != nil {
			e.Locations = append([]ir.Location{}, e.Locations...)
		}
		c.Edges = append(c.Edges, e)
	}
	return &c
}
