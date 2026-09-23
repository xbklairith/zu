package scan

import (
	"slices"
	"testing"
)

func declHashes(t *testing.T, src string) map[string]string {
	t.Helper()
	f := extractOne(t, src)
	if f.Err != nil {
		t.Fatal(f.Err)
	}
	m := map[string]string{}
	for _, d := range f.Decls {
		if len(d.Hash) != 64 {
			t.Fatalf("%s: hash %q is not hex SHA-256", d.Name, d.Hash)
		}
		m[d.Recv+"."+d.Name] = d.Hash
	}
	return m
}

const hashBase = `package p

type T struct {
	A int
	B string
}

func F(x int, y int) int {
	return g(x, y)
}
`

func TestHashIgnoresCommentsAndLayout(t *testing.T) {
	variant := `// Package p has docs.
package p

// T is documented.
type T struct {
	// A has a doc.
	A int // and a line comment
	B string
}

// F is documented.
func F(x int,
	y int) int {
	/* block */ return g(x,
		y) // trailing
}
`
	a, b := declHashes(t, hashBase), declHashes(t, variant)
	for k := range a {
		if a[k] != b[k] {
			t.Errorf("%s: hash changed by comments or layout", k)
		}
	}
}

func TestHashChangesWithCode(t *testing.T) {
	a := declHashes(t, hashBase)
	b := declHashes(t, `package p

type T struct {
	A int
	B string
}

func F(x int, y int) int {
	return g(y, x)
}
`)
	if a[".F"] == b[".F"] {
		t.Error("statement change must change the function hash")
	}
	if a[".T"] != b[".T"] {
		t.Error("unrelated type hash must not change")
	}
}

func TestHashOtherDecls(t *testing.T) {
	base := `package p

import "fmt"

const C = 1

var V = 2

func F() { fmt.Println() }
`
	other := func(src string) []string {
		f := extractOne(t, src)
		if f.Err != nil {
			t.Fatal(f.Err)
		}
		h := slices.Clone(f.OtherHashes)
		slices.Sort(h)
		return h
	}
	b := other(base)
	if len(b) != 4 {
		t.Fatalf("want 4 other hashes (file, import, const, var), got %d", len(b))
	}
	sameCommented := other(`package p

import "fmt" // printing

// C is one.
const C = 1

var V = 2

func F() { fmt.Println("changed body") }
`)
	if !slices.Equal(b, sameCommented) {
		t.Error("comments or function edits must not change other decl hashes")
	}
	changed := other(`package p

import "fmt"

const C = 2

var V = 2

func F() { fmt.Println() }
`)
	if slices.Equal(b, changed) {
		t.Error("const change must change other decl hashes")
	}
}

func declShapes(t *testing.T, src string) (hash, shape string) {
	t.Helper()
	f := extractOne(t, src)
	if f.Err != nil {
		t.Fatal(f.Err)
	}
	if len(f.Decls) != 1 {
		t.Fatalf("want one declaration, got %d", len(f.Decls))
	}
	d := f.Decls[0]
	if len(d.Shape) != 64 {
		t.Fatalf("%s: shape %q is not hex SHA-256", d.Name, d.Shape)
	}
	return d.Hash, d.Shape
}

func TestShape(t *testing.T) {
	for _, c := range []struct {
		name, a, b string
		sameShape  bool
	}{
		{"rename", "func round(x int) int { return x }", "func roundHalfEven(x int) int { return x }", true},
		{"recursive rename",
			"func f(n int) int {\n\tif n == 0 {\n\t\treturn 0\n\t}\n\treturn f(n - 1)\n}",
			"func g(n int) int {\n\tif n == 0 {\n\t\treturn 0\n\t}\n\treturn g(n - 1)\n}", true},
		{"self-referencing type", "type T struct{ next *T }", "type U struct{ next *U }", true},
		{"receiver type rename", "func (x *T) M() {}", "func (x *U) M() {}", true},
		{"body change", "func f() int { return 1 }", "func f() int { return 2 }", false},
		{"directive added", "func f() {}", "//go:noinline\nfunc f() {}", false},
	} {
		ha, sa := declShapes(t, "package p\n\n"+c.a+"\n")
		hb, sb := declShapes(t, "package p\n\n"+c.b+"\n")
		if ha == hb {
			t.Errorf("%s: hash must differ", c.name)
		}
		if (sa == sb) != c.sameShape {
			t.Errorf("%s: shape equal = %v, want %v", c.name, sa == sb, c.sameShape)
		}
	}
}
