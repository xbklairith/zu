package export

import (
	"bytes"
	"context"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"zu/internal/diff"
	"zu/internal/ir"
	"zu/internal/scan"
)

// shopCopy copies the scanner's shop fixture into a temp dir.
func shopCopy(t *testing.T) string {
	t.Helper()
	src := filepath.Join("..", "scan", "testdata", "shop")
	dst := t.TempDir()
	err := filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		if d.IsDir() {
			return os.MkdirAll(filepath.Join(dst, rel), 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(dst, rel), b, 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
	return dst
}

// edit replaces old with repl in root/rel, failing if old is absent.
func edit(t *testing.T, root, rel, old, repl string) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(b, []byte(old)) {
		t.Fatalf("%s does not contain %q", rel, old)
	}
	if err := os.WriteFile(p, bytes.Replace(b, []byte(old), []byte(repl), 1), 0o644); err != nil {
		t.Fatal(err)
	}
}

func scanTree(t *testing.T, root, commit string) (*ir.IR, scan.Tree) {
	t.Helper()
	tree, err := scan.DirTree(root)
	if err != nil {
		t.Fatal(err)
	}
	doc, _, err := scan.Run(context.Background(), scan.Options{Tree: tree})
	if err != nil {
		t.Fatal(err)
	}
	doc.Ref = ir.Ref{Commit: commit}
	return doc, tree
}

// changeView scans the shop fixture as base and, as head, a copy with the
// edits of internal/diff's shopPair (a Move, a new import, a modified method,
// a removed type, a reversed import) plus a gofmt-only edit, and builds the
// Change View between them.
func changeView(t *testing.T) (*View, *diff.Summary) {
	t.Helper()
	base, baseTree := scanTree(t, shopCopy(t), strings.Repeat("b", 40))
	h := shopCopy(t)
	edit(t, h, "internal/money/money.go", "func Add(", "func Plus(")
	edit(t, h, "internal/checkout/checkout.go", "sum = Add(sum", "sum = Plus(sum")
	edit(t, h, "main.go", `"example.com/shop/internal/checkout"`, `"example.com/shop/internal/checkout"
	"example.com/shop/internal/money"`)
	edit(t, h, "main.go", "fmt.Println(checkout.Total(nil))", "fmt.Println(checkout.Total(nil), money.Zero)")
	edit(t, h, "internal/store/store.go", "\tr.hook()\n", "\tr.hook()\n\tr.hook()\n")
	edit(t, h, "internal/store/store.go", "// ReadWriter reads and writes orders.\ntype ReadWriter interface {\n\tReader\n\tPut(o Order) error\n}\n", "")
	edit(t, h, "internal/store/store.go", "\n\t\"example.com/shop/internal/money\"\n", "\n")
	edit(t, h, "internal/store/store.go", "Total money.Cents", "Total int64")
	edit(t, h, "internal/store/store.go", "\t_ = money.Add(o.Total, money.Zero)\n", "")
	edit(t, h, "internal/money/money.go", "package money\n", "package money\n\nimport \"example.com/shop/internal/store\"\n\nvar _ store.Order\n")
	// gofmt-only: same syntax tree, so no Change Status and no inlined file.
	edit(t, h, "internal/store/register.go", "func register() { _ = dialect() }", "func register() {\n\t_ = dialect()\n}")
	head, headTree := scanTree(t, h, strings.Repeat("h", 40))

	sum := diff.Summarize(base, head)
	v, err := Change(base, head, diff.Compare(base, head), sum, baseTree, headTree)
	if err != nil {
		t.Fatal(err)
	}
	return v, sum
}

func nodeByID(v *View, id string) *Node {
	for i := range v.Nodes {
		if v.Nodes[i].ID == id {
			return &v.Nodes[i]
		}
	}
	return nil
}

func TestChangeGolden(t *testing.T) {
	v, _ := changeView(t)
	got, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	const golden = "testdata/shop.change.golden.json"
	if *update {
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("%v (run with -update to create)", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("View differs from %s (rerun with -update and review the diff)", golden)
	}
}

func TestChangeMarksTheDelta(t *testing.T) {
	v, sum := changeView(t)
	const shop = "example.com/shop/internal/"

	if v.Kind != "change" || v.Base == nil || v.Base.Commit != strings.Repeat("b", 40) {
		t.Errorf("kind %q base %+v, want a change view with base bbb…", v.Kind, v.Base)
	}
	var want []string
	for _, r := range sum.Packages {
		want = append(want, r.ID)
	}
	if !slices.Equal(v.Changed, want) {
		t.Errorf("Changed = %v, want the Summary's order %v", v.Changed, want)
	}

	// A Move is one node: the target carries movedFrom, the source is absent.
	if n := nodeByID(v, shop+"money.Plus"); n == nil || n.MovedFrom != shop+"money.Add" || n.Status != "" {
		t.Errorf("money.Plus = %+v, want movedFrom money.Add and no status", n)
	}
	if n := nodeByID(v, shop+"money.Add"); n != nil {
		t.Errorf("Move source money.Add was emitted: %+v", n)
	}
	if n := nodeByID(v, shop+"store.ReadWriter"); n == nil || n.Status != "removed" {
		t.Errorf("store.ReadWriter = %+v, want removed", n)
	}
	if n := nodeByID(v, shop+"store.Repo.Get"); n == nil || n.Status != "modified" {
		t.Errorf("store.Repo.Get = %+v, want modified", n)
	}
	// Unchanged declarations are not drawn; they only count toward decls.
	if n := nodeByID(v, shop+"store.register"); n != nil {
		t.Errorf("gofmt-only store.register was emitted: %+v", n)
	}
	if n := nodeByID(v, shop+"store"); n == nil || !n.Detail || n.Status != "modified" || n.Hop == nil || *n.Hop != 0 || n.Decls == 0 {
		t.Errorf("store = %+v, want a modified detail package at hop 0 with decls", n)
	}
	if n := nodeByID(v, "example.com/shop/tools/gen"); n == nil || n.Hop == nil || *n.Hop != 1 || n.Status != "" {
		t.Errorf("tools/gen = %+v, want unchanged at hop 1", n)
	}

	var reversed bool
	for _, e := range v.Edges {
		if e.From == shop+"money" && e.To == shop+"store" && e.Kind == "imports" {
			reversed = e.Status == "reversed"
		}
		if e.From == shop+"store" && e.To == shop+"money" && e.Kind == "imports" {
			t.Errorf("reversed import drawn twice: %+v", e)
		}
	}
	if !reversed {
		t.Error("money → store is not marked reversed")
	}

	if _, ok := v.Sources["internal/store/register.go"]; ok {
		t.Error("gofmt-only register.go was inlined")
	}
	if _, ok := v.Hunks["internal/store/register.go"]; ok {
		t.Error("gofmt-only register.go has hunks")
	}
	if _, ok := v.Sources["internal/store/store.go"]; !ok {
		t.Error("store.go, holding a modified method, was not inlined")
	}
}

func TestChangeHunksOfModifiedMethod(t *testing.T) {
	v, _ := changeView(t)
	get := nodeByID(v, "example.com/shop/internal/store.Repo.Get")
	if get == nil {
		t.Fatal("store.Repo.Get missing")
	}
	var found bool
	for _, h := range v.Hunks[get.Loc.Path] {
		i := slices.Index(h.Lines, "+\tr.hook()")
		if i < 0 {
			continue
		}
		found = true
		if !slices.Contains(h.Lines[:i], " \tr.hook()") {
			t.Errorf("added r.hook() has no context before it: %q", h.Lines)
		}
		var plus, minus int
		for _, l := range h.Lines {
			switch l[0] {
			case '+':
				plus++
			case '-':
				minus++
			}
		}
		if h.HeadLines-h.BaseLines != plus-minus {
			t.Errorf("hunk counts %d/%d do not match %q", h.BaseLines, h.HeadLines, h.Lines)
		}
	}
	if !found {
		t.Errorf("no hunk adds r.hook() in %s: %+v", get.Loc.Path, v.Hunks[get.Loc.Path])
	}
}

// changeWith builds the Change View of the shop fixture against a copy with
// each {file, old, new} edit made.
func changeWith(t *testing.T, edits ...[3]string) *View {
	t.Helper()
	base, baseTree := scanTree(t, shopCopy(t), strings.Repeat("b", 40))
	h := shopCopy(t)
	for _, e := range edits {
		edit(t, h, e[0], e[1], e[2])
	}
	head, headTree := scanTree(t, h, strings.Repeat("h", 40))
	v, err := Change(base, head, diff.Compare(base, head), diff.Summarize(base, head), baseTree, headTree)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// TestChangeNear pins 18's unchanged neighbours: the declarations one call or
// embed from a drawn one, and every method of a type on the page, with the
// calls and embeds among them and the off-page counts. Nodes and Edges stay
// as the tree draws them.
func TestChangeNear(t *testing.T) {
	const s = "example.com/shop/internal/"
	type off struct{ in, out int }
	for _, c := range []struct {
		name  string
		v     func(t *testing.T) *View
		nodes []string
		edges []string // kind from to status
		offs  map[string]off
	}{
		{
			// Cart embeds the modified Order; the removed ReadWriter embedded
			// Reader; Reset is a method of Repo, drawn for its changed methods.
			name: "shop", v: func(t *testing.T) *View { v, _ := changeView(t); return v },
			nodes: []string{s + "checkout.Cart", s + "store.Reader", s + "store.Repo.Reset"},
			edges: []string{
				"embeds " + s + "checkout.Cart " + s + "store.Order ",
				"embeds " + s + "store.ReadWriter " + s + "store.Reader removed",
			},
			offs: map[string]off{s + "store.Repo.Reset": {0, 1}},
		},
		{
			// Open's callers, Reset's type and that type's other methods.
			name: "a changed function", v: func(t *testing.T) *View {
				return changeWith(t, [3]string{"internal/store/store.go", "return &Repo{cache: map[int]Order{}}", "return &Repo{cache: map[int]Order{}, hook: func() {}}"})
			},
			nodes: []string{s + "checkout.Place", s + "store.Repo", s + "store.Repo.Get", s + "store.Repo.Reset", s + "store.Repo.check"},
			edges: []string{
				"calls " + s + "checkout.Place " + s + "store.Open ",
				"embeds " + s + "store.Repo github.com/lib/pq ",
				"calls " + s + "store.Repo.Get " + s + "store.Repo.check ",
				"calls " + s + "store.Repo.Reset " + s + "store.Open ",
			},
			offs: map[string]off{s + "checkout.Place": {0, 1}, s + "store.Repo.check": {0, 1}},
		},
		{
			// check's caller and callee, and its type's other method.
			name: "a changed method", v: func(t *testing.T) *View {
				return changeWith(t, [3]string{"internal/store/store.go", "money.Add(o.Total, money.Zero)", "money.Add(money.Zero, o.Total)"})
			},
			nodes: []string{s + "money.Add", s + "store.Repo.Get", s + "store.Repo.Reset"},
			edges: []string{
				"calls " + s + "store.Repo.Get " + s + "store.Repo.check ",
				"calls " + s + "store.Repo.check " + s + "money.Add ",
			},
			offs: map[string]off{s + "money.Add": {1, 0}, s + "store.Repo.Reset": {0, 1}},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			v := c.v(t)
			if v.Near == nil {
				t.Fatal("no near")
			}
			var nodes, edges []string
			for _, n := range v.Near.Nodes {
				nodes = append(nodes, n.ID)
				if n.Status != "" || n.MovedFrom != "" {
					t.Errorf("near %s has a status: %+v", n.ID, n)
				}
				if nodeByID(v, n.ID) != nil {
					t.Errorf("near %s is also in Nodes", n.ID)
				}
				if got := (off{n.OffIn, n.OffOut}); got != c.offs[n.ID] {
					t.Errorf("near %s: off in, out = %v, want %v", n.ID, got, c.offs[n.ID])
				}
			}
			for _, e := range v.Near.Edges {
				edges = append(edges, e.Kind+" "+e.From+" "+e.To+" "+e.Status)
			}
			if !slices.Equal(nodes, c.nodes) {
				t.Errorf("near nodes = %q, want %q", nodes, c.nodes)
			}
			if !slices.Equal(edges, c.edges) {
				t.Errorf("near edges = %q, want %q", edges, c.edges)
			}
			for _, n := range v.Nodes {
				if n.OffIn != 0 || n.OffOut != 0 {
					t.Errorf("drawn %s: off in, out = %d, %d; its neighbours are all near", n.ID, n.OffIn, n.OffOut)
				}
			}
		})
	}
}

// TestChangeNearIsSorted: near is built from maps, and the same change writes
// the same bytes.
func TestChangeNearIsSorted(t *testing.T) {
	edit := [3]string{"internal/store/store.go", "return &Repo{cache: map[int]Order{}}", "return &Repo{cache: map[int]Order{}, hook: func() {}}"}
	a, err := json.Marshal(changeWith(t, edit))
	if err != nil {
		t.Fatal(err)
	}
	for range 4 {
		b, err := json.Marshal(changeWith(t, edit))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(a, b) {
			t.Fatal("two builds of one change wrote different bytes")
		}
	}
}
