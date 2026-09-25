package diff

import (
	"bytes"
	"context"
	"flag"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"zu/internal/ir"
	"zu/internal/scan"
)

var update = flag.Bool("update", false, "rewrite golden files")

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

func scanDir(t *testing.T, root, commit string) *ir.IR {
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
	return doc
}

// shopPair scans the shop fixture as base and, as head, a copy with a renamed
// function, a new import, a modified method, a removed type and a reversed
// import.
func shopPair(t *testing.T) (base, head *ir.IR) {
	t.Helper()
	base = scanDir(t, shopCopy(t), strings.Repeat("b", 40))
	h := shopCopy(t)
	// Rename money.Add → money.Plus (a Move). tools/gen still calls Add and
	// is left unchanged, so it shows in the Affected Set at one hop.
	edit(t, h, "internal/money/money.go", "func Add(", "func Plus(")
	edit(t, h, "internal/checkout/checkout.go", "sum = Add(sum", "sum = Plus(sum")
	// New import main → money.
	edit(t, h, "main.go", `"example.com/shop/internal/checkout"`, `"example.com/shop/internal/checkout"
	"example.com/shop/internal/money"`)
	edit(t, h, "main.go", "fmt.Println(checkout.Total(nil))", "fmt.Println(checkout.Total(nil), money.Zero)")
	// Modified method.
	edit(t, h, "internal/store/store.go", "\tr.hook()\n", "\tr.hook()\n\tr.hook()\n")
	// Removed type.
	edit(t, h, "internal/store/store.go", "// ReadWriter reads and writes orders.\ntype ReadWriter interface {\n\tReader\n\tPut(o Order) error\n}\n", "")
	// Reversed import: store → money becomes money → store.
	edit(t, h, "internal/store/store.go", "\n\t\"example.com/shop/internal/money\"\n", "\n")
	edit(t, h, "internal/store/store.go", "Total money.Cents", "Total int64")
	edit(t, h, "internal/store/store.go", "\t_ = money.Add(o.Total, money.Zero)\n", "")
	edit(t, h, "internal/money/money.go", "package money\n", "package money\n\nimport \"example.com/shop/internal/store\"\n\nvar _ store.Order\n")
	head = scanDir(t, h, strings.Repeat("h", 40))
	return base, head
}

func golden(t *testing.T, name string, got []byte) {
	t.Helper()
	p := filepath.Join("testdata", name)
	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("%v (run with -update to create it)", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("%s differs from golden; run go test ./internal/diff -update and review the diff\n%s", name, got)
	}
}

func TestSummaryGolden(t *testing.T) {
	base, head := shopPair(t)
	s := Summarize(base, head)
	var a, b bytes.Buffer
	if err := WriteJSON(&a, s); err != nil {
		t.Fatal(err)
	}
	if err := WriteJSON(&b, Summarize(base, head)); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a.Bytes(), b.Bytes()) {
		t.Fatal("Summarize + WriteJSON is not repeatable")
	}
	golden(t, "shop.summary.json", a.Bytes())

	// The edits the fixture promises must all be visible.
	if len(s.Moves) != 1 || s.Moves[0].From != "example.com/shop/internal/money.Add" {
		t.Errorf("Moves = %+v, want money.Add → money.Plus", s.Moves)
	}
	var reversed, added bool
	for _, e := range s.Imports {
		reversed = reversed || e.Status == Reversed && e.From == "example.com/shop/internal/money"
		added = added || e.Status == Added && e.From == "example.com/shop" && e.To == "example.com/shop/internal/money"
	}
	if !reversed || !added {
		t.Errorf("Imports = %+v, want a reversed money→store and an added main→money", s.Imports)
	}
}

func TestSummaryNoChange(t *testing.T) {
	base := scanDir(t, shopCopy(t), "c")
	s := Summarize(base, base)
	if s.Changed || len(s.Packages) != 0 || len(s.Imports) != 0 || len(s.Moves) != 0 || len(s.Affected) != 0 || len(s.Nodes) != 0 {
		t.Fatalf("summary of no change = %+v", s)
	}
	var buf bytes.Buffer
	if err := WriteJSON(&buf, s); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"changed": false`, `"packages": []`, `"imports": []`, `"moves": []`, `"affected": []`, `"nodes": []`, `"base": []`, `"head": []`} {
		if !strings.Contains(buf.String(), want) {
			t.Errorf("JSON lacks %s:\n%s", want, buf.String())
		}
	}
	if !strings.HasSuffix(buf.String(), "}\n") {
		t.Error("JSON must end with a newline")
	}
}

func TestSummaryRowOrderBottomUp(t *testing.T) {
	// api → svc → {x, y}; x ⇄ y is a cycle. All changed.
	nodes := []string{"p api 1", "p svc 1", "p x 1", "p y 1"}
	edges := []string{"i api svc", "i svc x", "i svc y", "i x y", "i y x"}
	base := doc(nodes, edges...)
	head := doc([]string{"p api 2", "p svc 2", "p x 2", "p y 2"}, edges...)
	var ids []string
	for _, r := range Summarize(base, head).Packages {
		ids = append(ids, r.ID)
	}
	if want := []string{"x", "y", "svc", "api"}; !reflect.DeepEqual(ids, want) {
		t.Fatalf("rows = %v, want %v (leaves first; one cycle shares a rank)", ids, want)
	}
}

// A caller that already compared the sides summarizes that Delta instead of
// comparing again (14): the Summary is the same.
func TestSummarizeDeltaIsSummarize(t *testing.T) {
	base, head := shopPair(t)
	d := Compare(base, head)
	if got, want := SummarizeDelta(base, head, d), Summarize(base, head); !reflect.DeepEqual(got, want) {
		t.Errorf("SummarizeDelta =\n%+v\nwant\n%+v", got, want)
	}
	if !reflect.DeepEqual(d, Compare(base, head)) {
		t.Error("SummarizeDelta changed the Delta it was given")
	}
}
