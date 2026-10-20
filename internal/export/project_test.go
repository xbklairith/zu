package export

import (
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"

	"zu/internal/ir"
)

func shopIR(t *testing.T) *ir.IR {
	t.Helper()
	b, err := os.ReadFile("../scan/testdata/shop.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc ir.IR
	if err := json.Unmarshal(b, &doc); err != nil {
		t.Fatal(err)
	}
	return &doc
}

func fakeRead(files map[string]bool) ReadFunc {
	return func(p string) ([]byte, error) {
		files[p] = true
		return []byte("// " + p + "\n"), nil
	}
}

func TestProjectPackageLevelOnlyByDefault(t *testing.T) {
	read := map[string]bool{}
	v, err := Project(shopIR(t), nil, fakeRead(read))
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range v.Nodes {
		if n.Kind != "package" && n.Kind != "external" {
			t.Errorf("unexpected %s node %s without -include", n.Kind, n.ID)
		}
	}
	for _, e := range v.Edges {
		if e.Kind != "imports" {
			t.Errorf("unexpected %s edge without -include", e.Kind)
		}
	}
	if len(v.Sources) != 0 || len(read) != 0 {
		t.Errorf("sources read without -include: %v", read)
	}
	store := find(t, v, "example.com/shop/internal/store")
	if store.Decls == 0 || store.Unresolved != 4 || store.Detail {
		t.Errorf("store = %+v, want decls>0, unresolved=4, detail=false", store)
	}
	if !slices.Equal(v.Modules, sortedModules(shopIR(t))) {
		t.Errorf("modules = %v", v.Modules)
	}
}

func TestProjectIncludeAddsDeclarationsAndTheirFiles(t *testing.T) {
	doc := shopIR(t)
	p, _ := ParsePattern("./internal/store", RootModule(doc))
	read := map[string]bool{}
	v, err := Project(doc, []Pattern{p}, fakeRead(read))
	if err != nil {
		t.Fatal(err)
	}
	if !find(t, v, "example.com/shop/internal/store").Detail {
		t.Error("store not marked detail")
	}
	find(t, v, "example.com/shop/internal/store.Repo.Get") // methods come along
	for _, n := range v.Nodes {
		if n.Kind == "function" && strings.HasPrefix(n.ID, "example.com/shop/internal/checkout.") {
			t.Errorf("checkout declaration %s leaked in", n.ID)
		}
	}
	for p := range v.Sources {
		if !strings.HasPrefix(p, "internal/store/") {
			t.Errorf("source %s is not in the included package", p)
		}
	}
	if len(v.Sources) == 0 {
		t.Error("no sources for the included package")
	}
}

// 17: a Screen centred on a declaration draws only the calls and embeds the
// page holds; the rest, to or from a package without -include, are counted
// on the declaration so the Screen can say what it leaves out.
func TestProjectCountsCallsOffThePage(t *testing.T) {
	doc := shopIR(t)
	p, _ := ParsePattern("./internal/store", RootModule(doc))
	v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
	if err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string][2]int{
		"example.com/shop/internal/store.Open":       {1, 0}, // checkout.Place calls it
		"example.com/shop/internal/store.Order":      {1, 0}, // checkout.Cart embeds it
		"example.com/shop/internal/store.Repo.check": {0, 1}, // it calls money.Add
		"example.com/shop/internal/store.Repo":       {0, 0}, // it embeds lib/pq, which is drawn
		"example.com/shop/internal/store.Repo.Reset": {0, 0}, // it calls store.Open, on the page
	} {
		if n := find(t, v, id); n.OffIn != want[0] || n.OffOut != want[1] {
			t.Errorf("%s: off in, out = %d, %d; want %d, %d", id, n.OffIn, n.OffOut, want[0], want[1])
		}
	}
	// Only declarations count: every package and external is on every page.
	// With checkout's declarations, store.Repo, off the page, embeds lib/pq.
	for _, include := range []string{"./internal/store", "./internal/checkout"} {
		p, _ := ParsePattern(include, RootModule(doc))
		v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
		if err != nil {
			t.Fatal(err)
		}
		for _, n := range v.Nodes {
			if n.Kind != "type" && n.Kind != "function" && (n.OffIn != 0 || n.OffOut != 0) {
				t.Errorf("%s: %s %s counts calls off the page", include, n.Kind, n.ID)
			}
		}
	}
}

// 19: the Code panel lights every line behind a call or an embed, so the
// View keeps each one: loc is the first, more the rest, each with its path
// (a declaration in several files, as build variants are, calls from each).
// An import keeps its first only: no Code panel shows a package's files.
func TestProjectKeepsEveryLocationOfACallOrEmbed(t *testing.T) {
	at := func(path string, line int) ir.Location { return ir.Location{Path: path, Line: line} }
	doc := &ir.IR{
		Nodes: []ir.Node{
			{ID: "m", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{at("a.go", 1)}},
			{ID: "m/q", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{at("q/q.go", 1)}},
			{ID: "m.F", Kind: ir.KindFunction, Parent: "m", Locations: []ir.Location{at("a.go", 3), at("b.go", 3)}},
			{ID: "m.G", Kind: ir.KindFunction, Parent: "m", Locations: []ir.Location{at("a.go", 9)}},
		},
		Edges: []ir.Edge{
			{From: "m", To: "m/q", Kind: ir.EdgeImports, Locations: []ir.Location{at("a.go", 2), at("b.go", 2)}},
			{From: "m.F", To: "m.G", Kind: ir.EdgeCalls, Locations: []ir.Location{at("a.go", 4), at("a.go", 5), at("b.go", 4)}},
		},
	}
	p, _ := ParsePattern("m", "m")
	v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Edges) != 2 {
		t.Fatalf("edges = %+v", v.Edges)
	}
	imp, call := v.Edges[0], v.Edges[1]
	if imp.Count != 2 || imp.Loc != at("a.go", 2) || imp.More != nil {
		t.Errorf("import = %+v, want count 2 at a.go:2 and no more", imp)
	}
	if call.Count != 3 || call.Loc != at("a.go", 4) || !slices.Equal(call.More, []ir.Location{at("a.go", 5), at("b.go", 4)}) {
		t.Errorf("call = %+v, want count 3 at a.go:4, more a.go:5 and b.go:4", call)
	}
}

// 19: each source the View inlines carries its Syntax runs, so the page
// colours it without a lexer of its own.
func TestProjectColoursEachSource(t *testing.T) {
	doc := shopIR(t)
	p, _ := ParsePattern("./internal/store", RootModule(doc))
	v, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Syntax) != len(v.Sources) {
		t.Fatalf("%d sources, %d coloured", len(v.Sources), len(v.Syntax))
	}
	for path, text := range v.Sources {
		if got, want := v.Syntax[path], Syntax([]byte(text)); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: syntax %v, want %v", path, got, want)
		}
	}
}

// 19: zu serve draws every package's declarations by default. Every
// selects them all, in an IR with none too, and with no ReadFunc the View
// inlines no source: the page reads it from zu serve.
func TestProjectEveryPackageWithoutSource(t *testing.T) {
	doc := shopIR(t)
	v, err := Project(doc, []Pattern{Every}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Nodes) != len(doc.Nodes) {
		t.Errorf("%d nodes, want the IR's %d", len(v.Nodes), len(doc.Nodes))
	}
	for _, n := range v.Nodes {
		if n.Kind == "package" && !n.Detail {
			t.Errorf("package %s not detailed", n.ID)
		}
	}
	if len(v.Sources) != 0 || v.Syntax != nil {
		t.Errorf("inlined %d sources, %d coloured", len(v.Sources), len(v.Syntax))
	}
	if _, err := Project(&ir.IR{}, []Pattern{Every}, nil); err != nil {
		t.Errorf("an IR with no package: %v", err)
	}
}

func TestProjectRejectsAnIncludeThatMatchesNothing(t *testing.T) {
	doc := shopIR(t)
	p, _ := ParsePattern("./nosuch/...", RootModule(doc))
	_, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
	if err == nil || !strings.Contains(err.Error(), "./nosuch/...") {
		t.Errorf("err = %v, want one naming the pattern", err)
	}
}

func TestProjectRejectsNonLocalSourcePaths(t *testing.T) {
	doc := &ir.IR{Nodes: []ir.Node{
		{ID: "m", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{{Path: "a.go", Line: 1}}},
		{ID: "m.F", Kind: ir.KindFunction, Parent: "m", Locations: []ir.Location{{Path: "../etc/passwd", Line: 1}}},
	}}
	p, _ := ParsePattern("m", "m")
	if _, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{})); err == nil {
		t.Error("a path outside the repository was read")
	}
}

func find(t *testing.T, v *View, id string) Node {
	t.Helper()
	for _, n := range v.Nodes {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("node %s missing", id)
	return Node{}
}

func sortedModules(doc *ir.IR) []string {
	var m []string
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindPackage && !slices.Contains(m, n.Module) {
			m = append(m, n.Module)
		}
	}
	slices.Sort(m)
	return m
}
