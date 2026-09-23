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
	if len(b) != 3 {
		t.Fatalf("want 3 other decl hashes (import, const, var), got %d", len(b))
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
