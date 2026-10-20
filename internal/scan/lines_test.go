package scan

import (
	"context"
	"maps"
	"slices"
	"testing"
)

// TestLocationsAreTheFilesOwnLines: a //line directive, which generated code
// writes, names another file's lines. The IR's locations are the file's own,
// the lines its panel marks and the host shows; only a coverprofile keys
// code by the directive's (08, Measures).
func TestLocationsAreTheFilesOwnLines(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod": "module x\n\ngo 1.24\n",
		"q/q.go": "package q\n\ntype E struct{}\n",
		"p/p.go": `//line gen.y:100
package p

//line gen.y:200
import "x/q"

//line gen.y:300
type T struct{ q.E }

//line gen.y:400
func F() { G() }

func G() {}
`,
	})
	doc, _, err := Run(context.Background(), Options{Tree: dirOf(t, root)})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]int{}
	for _, n := range doc.Nodes {
		if len(n.Locations) == 1 && n.Locations[0].Path == "p/p.go" {
			got[n.ID] = n.Locations[0].Line
		}
	}
	for _, e := range doc.Edges {
		if len(e.Locations) == 1 && e.Locations[0].Path == "p/p.go" {
			got[string(e.Kind)+" "+e.From+" "+e.To] = e.Locations[0].Line
		}
	}
	want := map[string]int{
		"x/p": 2, "x/p.T": 8, "x/p.F": 11, "x/p.G": 13,
		"imports x/p x/q": 5, "embeds x/p.T x/q.E": 8, "calls x/p.F x/p.G": 11,
	}
	for _, k := range slices.Sorted(maps.Keys(want)) {
		if w := want[k]; got[k] != w {
			t.Errorf("%s at line %d, want %d (the file's own)", k, got[k], w)
		}
	}
	if len(got) != len(want) {
		t.Errorf("locations in p/p.go: %v, want %v", got, want)
	}
}
