package policy

import (
	"slices"
	"testing"

	"zu/internal/ir"
)

func loc(path string, line int) []ir.Location { return []ir.Location{{Path: path, Line: line}} }

// sample is a small repo: two packages, a declaration, two AWS modules and
// one other external.
func sample() *ir.IR {
	return &ir.IR{
		Nodes: []ir.Node{
			{ID: "m/a", Kind: ir.KindPackage, Locations: loc("a/a.go", 1)},
			{ID: "m/a.T", Kind: ir.KindType, Parent: "m/a", Locations: loc("a/a.go", 3)},
			{ID: "m/gen", Kind: ir.KindPackage, Locations: loc("gen/g.go", 1)},
			{ID: "github.com/aws/s3", Kind: ir.KindExternal, Locations: loc("a/a.go", 2)},
			{ID: "github.com/aws/sqs", Kind: ir.KindExternal, Locations: loc("a/a.go", 4)},
			{ID: "golang.org/x/sync", Kind: ir.KindExternal, Locations: loc("a/a.go", 5)},
		},
		Edges: []ir.Edge{
			{From: "m/a", To: "github.com/aws/s3", Kind: ir.EdgeImports, Locations: loc("a/a.go", 2)},
			{From: "m/a", To: "github.com/aws/sqs", Kind: ir.EdgeImports, Locations: loc("a/a.go", 4)},
			{From: "m/a", To: "golang.org/x/sync", Kind: ir.EdgeImports, Locations: loc("a/a.go", 5)},
			{From: "m/a", To: "m/gen", Kind: ir.EdgeImports, Locations: loc("a/a.go", 6)},
			{From: "m/a.T", To: "m/gen", Kind: ir.EdgeCalls, Locations: loc("a/a.go", 7)},
		},
	}
}

func ids(doc *ir.IR) (nodes, edges []string) {
	for _, n := range doc.Nodes {
		nodes = append(nodes, n.ID)
	}
	for _, e := range doc.Edges {
		edges = append(edges, e.From+">"+e.To+":"+string(e.Kind))
	}
	return nodes, edges
}

func TestApplyEmptyPolicyIsIdentity(t *testing.T) {
	in := sample()
	ir.Sort(in)
	got := (&Policy{}).Apply(in)
	n1, e1 := ids(in)
	n2, e2 := ids(got)
	if !slices.Equal(n1, n2) || !slices.Equal(e1, e2) {
		t.Fatalf("empty Policy changed the graph:\n%v %v\n%v %v", n1, e1, n2, e2)
	}
}

func TestApplyCollapsesForeignAndOmits(t *testing.T) {
	in := sample()
	p := &Policy{Foreign: []string{"github.com/aws"}, Omit: []string{"m/gen"}}
	got := p.Apply(in)
	nodes, edges := ids(got)
	wantNodes := []string{"github.com/aws", "golang.org/x/sync", "m/a", "m/a.T"}
	wantEdges := []string{"m/a>github.com/aws:imports", "m/a>golang.org/x/sync:imports"}
	if !slices.Equal(nodes, wantNodes) || !slices.Equal(edges, wantEdges) {
		t.Fatalf("got %v %v\nwant %v %v", nodes, edges, wantNodes, wantEdges)
	}
	for _, n := range got.Nodes {
		if n.ID == "github.com/aws" && len(n.Locations) != 2 {
			t.Errorf("collapsed node keeps both locations, got %v", n.Locations)
		}
	}
	for _, e := range got.Edges {
		if e.To == "github.com/aws" && len(e.Locations) != 2 {
			t.Errorf("merged edge keeps both locations, got %v", e.Locations)
		}
	}
	if len(in.Nodes) != 6 || in.Nodes[3].ID != "github.com/aws/s3" {
		t.Error("Apply modified its input")
	}
}

func TestApplyOmitsEdgesByPackage(t *testing.T) {
	p := &Policy{OmitEdges: []Pair{{From: "m/a", To: "m/gen"}}}
	_, edges := ids(p.Apply(sample()))
	for _, e := range edges {
		if e == "m/a>m/gen:imports" || e == "m/a.T>m/gen:calls" {
			t.Errorf("omit-edges kept %s (a declaration follows its package)", e)
		}
	}
	if len(edges) != 3 {
		t.Errorf("edges = %v", edges)
	}
}

func TestUnderIsSegmentWise(t *testing.T) {
	if !under("a/b", "a") || !under("a", "a") || under("a/bc", "a/b") {
		t.Error("under must compare whole path segments")
	}
}

func TestApplyOmitsASegmentBox(t *testing.T) {
	nodes, edges := ids((&Policy{Omit: []string{"m"}}).Apply(sample()))
	if want := []string{"github.com/aws/s3", "github.com/aws/sqs", "golang.org/x/sync"}; !slices.Equal(nodes, want) || len(edges) != 0 {
		t.Fatalf("omit m left %v %v", nodes, edges)
	}
}

func TestLensIsWhatApplyCanChange(t *testing.T) {
	if (&Policy{Levels: []Level{{"m"}}, Cycles: true, Order: []string{"m"}}).Lens() {
		t.Error("rules and order change no graph")
	}
	for _, p := range []*Policy{{Omit: []string{"m"}}, {Foreign: []string{"x"}}, {OmitEdges: []Pair{{"a", "b"}}}} {
		if !p.Lens() {
			t.Errorf("%+v is a lens", p)
		}
	}
}
