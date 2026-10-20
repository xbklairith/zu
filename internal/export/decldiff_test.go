package export

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"zu/internal/diff"
)

func TestDeclSpans(t *testing.T) {
	src := `//line gen.y:1
package p

// F does.
// Two lines.
func F() {
}

type (
	// A is one.
	A int
	B struct {
		x int
	}
)

// T is lone.
type T[E any] struct{ e E }

func (t *T[E]) M() {}

var v = 1
`
	want := []declSpan{
		{name: "F", line: 6, first: 4, last: 7},
		{name: "A", line: 11, first: 10, last: 11},
		{name: "B", line: 12, first: 12, last: 14},
		{name: "T", line: 18, first: 17, last: 18},
		{name: "M", line: 20, first: 20, last: 20},
	}
	if got := declSpans([]byte(src)); !reflect.DeepEqual(got, want) {
		t.Errorf("spans =\n%+v\nwant\n%+v", got, want)
	}
	if got := declSpans([]byte("package p\n\nfunc F( {\n")); got != nil {
		t.Errorf("spans of a file that does not parse = %+v, want none", got)
	}
}

// alone is each line's colour as Syntax gives it for the line by itself:
// the shop's changed lines hold no token across lines.
func alone(lines []string) [][]int {
	out := make([][]int, len(lines))
	for i, l := range lines {
		out[i] = Syntax([]byte(l[1:]))[0]
	}
	return out
}

func TestChangeDeclDiffs(t *testing.T) {
	v, _ := changeView(t)
	const s = "example.com/shop/internal/"
	var ids []string
	for id := range v.DeclDiffs {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	// Every declaration the change modified, removed or moved, and only
	// those: not store.Repo, drawn as Get's type.
	if want := []string{"example.com/shop.main", s + "checkout.Total", s + "money.Plus", s + "store.Order", s + "store.ReadWriter", s + "store.Repo.Get", s + "store.Repo.check"}; !slices.Equal(ids, want) {
		t.Errorf("declaration diffs of %v, want %v", ids, want)
	}
	const store, money = "internal/store/store.go", "internal/money/money.go"
	for _, c := range []struct {
		id   string
		want DeclDiff
	}{
		{s + "store.Repo.Get", DeclDiff{BasePath: store, HeadPath: store, Hunk: Hunk{BaseStart: 42, BaseLines: 8, HeadStart: 36, HeadLines: 9, Lines: []string{
			" // Get returns one order.",
			" func (r *Repo) Get(id int) (Order, error) {",
			" \tr.Lock()",
			" \tdefer r.Unlock()",
			" \to := r.cache[id]",
			" \tr.hook()",
			"+\tr.hook()",
			" \treturn o, r.check(o)",
			" }",
		}}}},
		// A removed declaration is its text at Base.
		{s + "store.ReadWriter", DeclDiff{BasePath: store, Hunk: Hunk{BaseStart: 18, BaseLines: 5, Lines: []string{
			"-// ReadWriter reads and writes orders.",
			"-type ReadWriter interface {",
			"-\tReader",
			"-\tPut(o Order) error",
			"-}",
		}}}},
		// A Move's Base side is its source's.
		{s + "money.Plus", DeclDiff{BasePath: money, HeadPath: money, Hunk: Hunk{BaseStart: 13, BaseLines: 2, HeadStart: 17, HeadLines: 2, Lines: []string{
			" // Add returns the sum.",
			"-func Add(a, b Cents) Cents { return a + b }",
			"+func Plus(a, b Cents) Cents { return a + b }",
		}}}},
	} {
		got := v.DeclDiffs[c.id]
		if len(got) != 1 {
			t.Errorf("%s has %d declaration diffs, want 1", c.id, len(got))
			continue
		}
		c.want.Syntax = alone(c.want.Lines)
		if !reflect.DeepEqual(got[0], c.want) {
			t.Errorf("%s declaration diff =\n%+v\nwant\n%+v", c.id, got[0], c.want)
		}
	}
}

// Each line of a hunk is coloured as its side's file colours it: a "-" line
// as Base's, the others as head's.
func TestChangeHunksAreColoured(t *testing.T) {
	v, _ := changeView(t)
	if len(v.Hunks) == 0 {
		t.Fatal("no hunks")
	}
	for p, hs := range v.Hunks {
		for _, h := range hs {
			if want := alone(h.Lines); !reflect.DeepEqual(h.Syntax, want) {
				t.Errorf("%s hunk @%d colour =\n%v\nwant\n%v", p, h.HeadStart, h.Syntax, want)
			}
		}
	}
}

// writeTree writes files under a new directory.
func writeTree(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for p, s := range files {
		full := filepath.Join(root, filepath.FromSlash(p))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(s), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// A declaration written more than once (build variants, repeated init) pairs
// its texts: each with an equal text, in its own file before another; then
// with a text in its file, in order; then the rest in order. A pair whose text
// the change kept has no diff; a text with no partner stands alone, as an init
// added before others does, and an init moved to another file pairs with its
// equal there, not with its file's changed one.
func TestDeclDiffPairs(t *testing.T) {
	const mod = "module m\n\ngo 1.24\n"
	f := func(n int) string {
		return "package a\n\n// F is a variant.\nfunc F() int { return " + string(rune('0'+n)) + " }\n"
	}
	inits := func(y int) string {
		return "package a\n\nvar x, y int\n\nfunc init() { x = 1 }\n\nfunc init() { y = " + string(rune('0'+y)) + " }\n"
	}
	g := func(n int) string { return "package a\n\nfunc G() int { return " + string(rune('0'+n)) + " }\n" }
	more := "package a\n\nfunc init() { x = 5 }\n\nfunc init() { y = 6 }\n"
	baseRoot := writeTree(t, map[string]string{"go.mod": mod, "a/f_linux.go": f(1), "a/f_windows.go": f(2), "a/f_darwin.go": f(3), "a/init.go": inits(2),
		"a/g_linux.go": g(0), "a/g_windows.go": g(0), "a/more.go": more, "a/old.go": "package a\n\nfunc init() { x = 7 }\n\nfunc init() { y = 8 }\n"})
	headRoot := writeTree(t, map[string]string{"go.mod": mod, "a/f_linux.go": f(4), "a/f_windows.go": f(2), "a/init.go": inits(3),
		"a/g_linux.go": g(9), "a/g_windows.go": g(0),
		"a/more.go": strings.Replace(more, "\n\n", "\n\nfunc init() { y = 0 }\n\n", 1),
		"a/old.go":  "package a\n\nfunc init() { y = 9 }\n",
		"a/new.go":  "package a\n\nfunc init() { x = 7 }\n"})
	base, baseTree := scanTree(t, baseRoot, strings.Repeat("b", 40))
	head, headTree := scanTree(t, headRoot, strings.Repeat("h", 40))
	v, err := Change(base, head, diff.Compare(base, head), diff.Summarize(base, head), baseTree, headTree)
	if err != nil {
		t.Fatal(err)
	}
	where := func(ds []DeclDiff) []string {
		var out []string
		for _, d := range ds {
			out = append(out, d.BasePath+" → "+d.HeadPath+": "+strings.Join(d.Lines, " | "))
		}
		return out
	}
	if got, want := where(v.DeclDiffs["m/a.F"]), []string{
		"a/f_darwin.go → : -// F is a variant. | -func F() int { return 3 }",
		"a/f_linux.go → a/f_linux.go:  // F is a variant. | -func F() int { return 1 } | +func F() int { return 4 }",
	}; !slices.Equal(got, want) {
		t.Errorf("F's declaration diffs =\n%q\nwant\n%q", got, want)
	}
	if got, want := where(v.DeclDiffs["m/a.G"]), []string{
		"a/g_linux.go → a/g_linux.go: -func G() int { return 0 } | +func G() int { return 9 }",
	}; !slices.Equal(got, want) {
		t.Errorf("G's declaration diffs =\n%q\nwant\n%q", got, want)
	}
	if got, want := where(v.DeclDiffs["m/a.init"]), []string{
		"a/init.go → a/init.go: -func init() { y = 2 } | +func init() { y = 3 }",
		"a/old.go → a/old.go: -func init() { y = 8 } | +func init() { y = 9 }",
		" → a/more.go: +func init() { y = 0 }",
	}; !slices.Equal(got, want) {
		t.Errorf("init's declaration diffs =\n%q\nwant\n%q", got, want)
	}
}
