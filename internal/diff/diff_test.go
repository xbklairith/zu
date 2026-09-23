package diff

import (
	"reflect"
	"strings"
	"testing"

	"zu/internal/ir"
)

// doc builds an IR from compact node and edge specs.
//
//	node: "kind id hash [shape]"  (kind: p, t, f, x; parent is inferred)
//	edge: "kind from to"          (kind: i, c, e)
func doc(nodes []string, edges ...string) *ir.IR {
	kinds := map[string]ir.NodeKind{"p": ir.KindPackage, "t": ir.KindType, "f": ir.KindFunction, "x": ir.KindExternal}
	ekinds := map[string]ir.EdgeKind{"i": ir.EdgeImports, "c": ir.EdgeCalls, "e": ir.EdgeEmbeds}
	d := &ir.IR{}
	parents := map[string]bool{}
	for _, s := range nodes {
		f := strings.Fields(s)
		if f[0] == "p" {
			parents[f[1]] = true
		}
	}
	for _, s := range nodes {
		f := strings.Fields(s)
		n := ir.Node{ID: f[1], Kind: kinds[f[0]]}
		if len(f) > 2 {
			n.Hash = f[2]
		}
		if len(f) > 3 {
			n.Shape = f[3]
		}
		if n.Kind == ir.KindType || n.Kind == ir.KindFunction {
			// parent: the longest prefix before a "." that is a node
			for i := len(n.ID) - 1; i > 0; i-- {
				if n.ID[i] == '.' {
					n.Parent = n.ID[:i]
					break
				}
			}
		}
		d.Nodes = append(d.Nodes, n)
	}
	for _, s := range edges {
		f := strings.Fields(s)
		d.Edges = append(d.Edges, ir.Edge{From: f[1], To: f[2], Kind: ekinds[f[0]],
			Locations: []ir.Location{{Path: s, Line: 1}}})
	}
	return d
}

func TestCompareNodes(t *testing.T) {
	base := doc([]string{
		"p m/a h1", "f m/a.Gone g1 sg", "f m/a.Same s1 ss", "f m/a.Mod m1 sm", "x ext.com/x",
	})
	head := doc([]string{
		"p m/a h2", "f m/a.Same s1 ss", "f m/a.Mod m2 sm2", "f m/a.New n1 sn", "x ext.com/y",
	})
	got := Compare(base, head)
	want := []NodeChange{
		{ID: "ext.com/x", Kind: ir.KindExternal, Status: Removed},
		{ID: "ext.com/y", Kind: ir.KindExternal, Status: Added},
		{ID: "m/a", Kind: ir.KindPackage, Status: Modified},
		{ID: "m/a.Gone", Kind: ir.KindFunction, Status: Removed},
		{ID: "m/a.Mod", Kind: ir.KindFunction, Status: Modified},
		{ID: "m/a.New", Kind: ir.KindFunction, Status: Added},
	}
	if !reflect.DeepEqual(got.Nodes, want) {
		t.Fatalf("Nodes = %+v\nwant   %+v", got.Nodes, want)
	}
	if len(got.Moves) != 0 {
		t.Errorf("Moves = %+v, want none (different shapes)", got.Moves)
	}
}

func TestCompareConstOnlyChange(t *testing.T) {
	base := doc([]string{"p m/a h1", "f m/a.F f1 s"})
	head := doc([]string{"p m/a h2", "f m/a.F f1 s"})
	got := Compare(base, head)
	want := []NodeChange{{ID: "m/a", Kind: ir.KindPackage, Status: Modified}}
	if !reflect.DeepEqual(got.Nodes, want) {
		t.Fatalf("Nodes = %+v", got.Nodes)
	}
}

func TestCompareEdges(t *testing.T) {
	pk := []string{"p m/a h", "p m/b h", "p m/c h", "f m/a.F h s1", "f m/b.G h s2"}
	base := doc(pk, "i m/a m/b", "i m/a m/c", "c m/a.F m/b.G")
	head := doc(pk, "i m/b m/a", "i m/a m/c", "e m/a.F m/b.G")
	head.Edges[1].Locations = []ir.Location{{Path: "moved.go", Line: 9}} // locations are ignored
	got := Compare(base, head)
	want := []EdgeChange{
		{From: "m/a.F", To: "m/b.G", Kind: ir.EdgeCalls, Status: Removed},
		{From: "m/a.F", To: "m/b.G", Kind: ir.EdgeEmbeds, Status: Added},
		{From: "m/b", To: "m/a", Kind: ir.EdgeImports, Status: Reversed},
	}
	if !reflect.DeepEqual(got.Edges, want) {
		t.Fatalf("Edges = %+v\nwant   %+v", got.Edges, want)
	}
}

func TestCompareMoves(t *testing.T) {
	for _, tc := range []struct {
		name       string
		base, head []string
		moves      []Move
		nodes      []string // ids left in Nodes (besides the packages)
	}{
		{
			name:  "rename in place",
			base:  []string{"p m/a h", "f m/a.Old o sh"},
			head:  []string{"p m/a h", "f m/a.New n sh"},
			moves: []Move{{From: "m/a.Old", To: "m/a.New", Kind: ir.KindFunction}},
		},
		{
			name:  "same name, other package",
			base:  []string{"p m/a h", "p m/b h", "t m/a.T o sh"},
			head:  []string{"p m/a h", "p m/b h", "t m/b.T n sh"},
			moves: []Move{{From: "m/a.T", To: "m/b.T", Kind: ir.KindType}},
		},
		{
			name:  "method moved with its type renamed",
			base:  []string{"p m/a h", "f m/a.T.M o sh"},
			head:  []string{"p m/a h", "f m/a.U.M n sh"},
			moves: []Move{{From: "m/a.T.M", To: "m/a.U.M", Kind: ir.KindFunction}},
		},
		{
			name:  "dotted package without a slash",
			base:  []string{"p example.com h", "p example.com/b h", "f example.com.Run o sh"},
			head:  []string{"p example.com h", "p example.com/b h", "f example.com/b.Run n sh"},
			moves: []Move{{From: "example.com.Run", To: "example.com/b.Run", Kind: ir.KindFunction}},
		},
		{
			name:  "dotted package, both change",
			base:  []string{"p example.com h", "p example.com/b h", "f example.com.Stop o sh"},
			head:  []string{"p example.com h", "p example.com/b h", "f example.com/b.Reset n sh"},
			nodes: []string{"example.com.Stop", "example.com/b.Reset"},
		},
		{
			name:  "package and name both change",
			base:  []string{"p m/x h", "p m/y h", "f m/x.Stop o sh"},
			head:  []string{"p m/x h", "p m/y h", "f m/y.Reset n sh"},
			nodes: []string{"m/x.Stop", "m/y.Reset"},
		},
		{
			name:  "two removed, one added",
			base:  []string{"p m/a h", "f m/a.A o sh", "f m/a.B o sh"},
			head:  []string{"p m/a h", "f m/a.C n sh"},
			nodes: []string{"m/a.A", "m/a.B", "m/a.C"},
		},
		{
			name:  "same shape, different kind",
			base:  []string{"p m/a h", "f m/a.F o sh"},
			head:  []string{"p m/a h", "t m/a.T n sh"},
			nodes: []string{"m/a.F", "m/a.T"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := Compare(doc(tc.base), doc(tc.head))
			if !reflect.DeepEqual(got.Moves, tc.moves) {
				t.Errorf("Moves = %+v, want %+v", got.Moves, tc.moves)
			}
			var ids []string
			for _, n := range got.Nodes {
				if n.Kind != ir.KindPackage {
					ids = append(ids, n.ID)
				}
			}
			if !reflect.DeepEqual(ids, tc.nodes) {
				t.Errorf("node changes = %v, want %v", ids, tc.nodes)
			}
		})
	}
}

func TestCompareIsPureAndSorted(t *testing.T) {
	base := doc([]string{"p m/b h", "p m/a h", "f m/b.Z z s1", "f m/a.Y y s2"})
	head := doc([]string{"p m/a h"})
	a, b := Compare(base, head), Compare(base, head)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("Compare is not deterministic")
	}
	if len(a.Nodes) != 3 || a.Nodes[0].ID != "m/a.Y" || a.Nodes[1].ID != "m/b" || a.Nodes[2].ID != "m/b.Z" {
		t.Fatalf("Nodes not sorted by id: %+v", a.Nodes)
	}
}
