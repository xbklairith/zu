package scan

import (
	"reflect"
	"testing"

	"zu/internal/ir"
)

// scanTree runs the sequential pipeline over an in-memory tree.
func scanTree(t *testing.T, files map[string]string) *ir.IR {
	t.Helper()
	root := tree(t, files)
	w, err := walk(root)
	if err != nil {
		t.Fatal(err)
	}
	facts := make([]*fileFacts, len(w.Files))
	for i, f := range w.Files {
		facts[i] = extractFile(w.Root, f)
	}
	doc := assemble(w, facts)
	ir.Sort(doc)
	return doc
}

type edgeKey struct {
	From, To string
	Kind     ir.EdgeKind
}

func edgesOf(doc *ir.IR, kind ir.EdgeKind) []edgeKey {
	var out []edgeKey
	for _, e := range doc.Edges {
		if e.Kind == kind {
			out = append(out, edgeKey{e.From, e.To, e.Kind})
		}
	}
	return out
}

func node(doc *ir.IR, id string) *ir.Node {
	for i := range doc.Nodes {
		if doc.Nodes[i].ID == id {
			return &doc.Nodes[i]
		}
	}
	return nil
}

func TestResolveImports(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod": `module example.com/m

require (
	github.com/lib/pq v1.0.0
	github.com/lib v1.0.0
	gopkg.in/yaml.v3 v3.0.0
)
`,
		"app/app.go": `package app

import (
	"fmt"
	"example.com/m/store"
	"example.com/m/missing"
	"github.com/lib/pq/sub"
	"gopkg.in/yaml.v3"
	"unknown.org/x"
	_ "example.com/m/store"
)
`,
		"store/s.go":   "package store\n",
		"tools/go.mod": "module example.com/tools\n",
		"tools/t/t.go": "package t\n\nimport \"example.com/m/store\"\n",
	})
	want := []edgeKey{
		{"example.com/m/app", "example.com/m/store", ir.EdgeImports},
		{"example.com/m/app", "github.com/lib/pq", ir.EdgeImports},
		{"example.com/m/app", "gopkg.in/yaml.v3", ir.EdgeImports},
		{"example.com/tools/t", "example.com/m/store", ir.EdgeImports},
	}
	if got := edgesOf(doc, ir.EdgeImports); !reflect.DeepEqual(got, want) {
		t.Fatalf("imports\n got %+v\nwant %+v", got, want)
	}
	wantU := map[string]int{"example.com/m/missing": 1, "unknown.org/x": 1}
	if !reflect.DeepEqual(doc.UnresolvedImports, wantU) {
		t.Fatalf("UnresolvedImports = %v, want %v", doc.UnresolvedImports, wantU)
	}
	ext := node(doc, "github.com/lib/pq")
	if ext == nil || ext.Kind != ir.KindExternal || ext.Parent != "" ||
		!reflect.DeepEqual(ext.Locations, []ir.Location{{Path: "go.mod", Line: 4}}) {
		t.Fatalf("external node = %+v", ext)
	}
	if node(doc, "github.com/lib") != nil {
		t.Fatal("unreferenced require must not become a node")
	}
	for _, e := range doc.Edges {
		if e.From == "example.com/m/app" && e.To == "example.com/m/store" &&
			!reflect.DeepEqual(e.Locations, []ir.Location{{Path: "app/app.go", Line: 5}, {Path: "app/app.go", Line: 10}}) {
			t.Fatalf("edge locations = %+v", e.Locations)
		}
	}
	pkg := node(doc, "example.com/m/store")
	if pkg == nil || pkg.Kind != ir.KindPackage || pkg.Module != "example.com/m" {
		t.Fatalf("package node = %+v", pkg)
	}
}
