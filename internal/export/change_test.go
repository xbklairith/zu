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
