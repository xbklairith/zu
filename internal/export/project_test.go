package export

import (
	"encoding/json"
	"os"
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
