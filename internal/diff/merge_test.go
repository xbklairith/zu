package diff

import (
	"fmt"
	"math/rand/v2"
	"reflect"
	"slices"
	"testing"

	"zu/internal/ir"
)

// Compare of two IRs in order walks them side by side (16); it must find
// what matching by id and by edge finds, for IRs in order or not: moves,
// modified hashes, reversed and one-way imports included.
func TestCompareMatchesMatchingByKey(t *testing.T) {
	r := rand.New(rand.NewPCG(16, 5))
	pkgs := []string{"m/a", "m/b", "m/c"}
	side := func() *ir.IR {
		d := &ir.IR{}
		for _, p := range pkgs {
			if r.IntN(5) > 0 {
				d.Nodes = append(d.Nodes, ir.Node{ID: p, Kind: ir.KindPackage})
			}
			for _, name := range []string{"F", "G", "T"} {
				if r.IntN(2) == 0 {
					continue
				}
				kind := ir.KindFunction
				if name == "T" {
					kind = ir.KindType
				}
				d.Nodes = append(d.Nodes, ir.Node{ID: p + "." + name, Kind: kind, Parent: p,
					Hash: fmt.Sprint(r.IntN(2)), Shape: fmt.Sprint(r.IntN(2))})
			}
		}
		if r.IntN(2) == 0 {
			d.Nodes = append(d.Nodes, ir.Node{ID: "ext.io/x", Kind: ir.KindExternal})
		}
		for range r.IntN(8) {
			from, to := pkgs[r.IntN(3)], pkgs[r.IntN(3)]
			d.Edges = append(d.Edges, ir.Edge{From: from, To: to, Kind: []ir.EdgeKind{ir.EdgeImports, ir.EdgeImports, ir.EdgeCalls}[r.IntN(3)]})
		}
		if r.IntN(3) > 0 {
			ir.Sort(d)
			if r.IntN(4) > 0 { // in order; else an edge may be there twice
				d.Edges = slices.CompactFunc(d.Edges, func(a, b ir.Edge) bool { return a.From == b.From && a.To == b.To && a.Kind == b.Kind })
			}
		} else {
			r.Shuffle(len(d.Nodes), func(i, j int) { d.Nodes[i], d.Nodes[j] = d.Nodes[j], d.Nodes[i] })
		}
		return d
	}
	merged := 0
	for i := range 3000 {
		base, head := side(), side()
		if ir.InOrder(base) && ir.InOrder(head) {
			merged++
		}
		if got, want := Compare(base, head), compareByKey(base, head); !reflect.DeepEqual(got, want) {
			t.Fatalf("case %d: Compare\n%+v\nmatching by key\n%+v", i, got, want)
		}
	}
	if merged < 1000 {
		t.Fatalf("only %d of 3000 cases had both IRs in order", merged)
	}
}

// Only an import reverses: a call a→b replaced by b→a is two changes.
func TestCompareReversesImportsOnly(t *testing.T) {
	base := doc([]string{"p m/a", "p m/b"}, "c m/a m/b")
	head := doc([]string{"p m/a", "p m/b"}, "c m/b m/a")
	want := []EdgeChange{
		{From: "m/a", To: "m/b", Kind: ir.EdgeCalls, Status: Removed},
		{From: "m/b", To: "m/a", Kind: ir.EdgeCalls, Status: Added},
	}
	if got := Compare(base, head).Edges; !reflect.DeepEqual(got, want) {
		t.Fatalf("edges %+v, want %+v", got, want)
	}
}
