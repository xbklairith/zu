package scan

import (
	"reflect"
	"testing"
)

func TestExtractImports(t *testing.T) {
	f := extractOne(t, `package p

import (
	"fmt"
	st "example.com/m/store"
	. "example.com/m/dot"
	_ "embed"
)
`)
	want := []importFact{
		{Path: "fmt", Line: 4},
		{Path: "example.com/m/store", Name: "st", Line: 5},
		{Path: "example.com/m/dot", Name: ".", Line: 6},
		{Path: "embed", Name: "_", Line: 7},
	}
	if !reflect.DeepEqual(f.Imports, want) {
		t.Fatalf("Imports = %+v", f.Imports)
	}
}

func TestExtractCallSites(t *testing.T) {
	f := extractOne(t, `package p

import "example.com/m/store"

type T struct{ fn func() }

func F() {
	G()                // bare
	H[int]()           // bare, generic instantiation
	store.Open()       // qualified
	pkgVar.M()         // qualified (other-file package var; decided later)
	G := func() {}     // shadows G
	G()                // other
	store := 1         // shadows the import
	_ = store
	func() {}()        // literal: dropped
	x := []byte("a")   // conversion: dropped
	_ = x
	len(x)             // builtin: recorded bare, dropped at resolve
	a.b.C()            // other
	T(T{})             // conversion via same-file type: dropped
}

func G() {}

func H[X any]() {}

func (t *T) M() {
	t.N()              // recv
	t.fn()             // recv (field or method; decided later)
	go func() { t.N() }() // recv inside a literal
}

func (t *T) N() {
	t = &T{}
	t.M()              // other: receiver reassigned
}

func (T) O() { G() }

func S() {
	store := 1
	store.Open() // other: import shadowed
}
`)
	type c struct {
		From string
		Kind callKind
		X    string
		Name string
		Line int
	}
	var got []c
	for _, s := range f.Calls {
		got = append(got, c{s.FromRecv + "." + s.FromName, s.Kind, s.X, s.Name, s.Line})
	}
	want := []c{
		{".F", callBare, "", "G", 8},
		{".F", callBare, "", "H", 9},
		{".F", callQualified, "store", "Open", 10},
		{".F", callQualified, "pkgVar", "M", 11},
		{".F", callOther, "", "", 13},
		{".F", callBare, "", "len", 19},
		{".F", callOther, "", "", 20},
		{"T.M", callRecv, "", "N", 29},
		{"T.M", callRecv, "", "fn", 30},
		{"T.M", callRecv, "", "N", 31},
		{"T.N", callOther, "", "", 36},
		{"T.O", callBare, "", "G", 39},
		{".S", callOther, "", "", 43},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("calls\n got %+v\nwant %+v", got, want)
	}
}

func TestExtractEmbedSites(t *testing.T) {
	f := extractOne(t, `package p

import "example.com/m/store"

type A struct {
	B
	*store.Repo
	List[int]
	name string
}

type I interface {
	J
	store.Reader
	~int | string
	Method()
}
`)
	want := []embedSite{
		{Owner: "A", Name: "B", Line: 6},
		{Owner: "A", X: "store", Name: "Repo", Line: 7},
		{Owner: "A", Name: "List", Line: 8},
		{Owner: "I", Name: "J", Line: 13},
		{Owner: "I", X: "store", Name: "Reader", Line: 14},
	}
	if !reflect.DeepEqual(f.Embeds, want) {
		t.Fatalf("Embeds\n got %+v\nwant %+v", f.Embeds, want)
	}
}

func TestExtractSkipsCallsInBlankFunctions(t *testing.T) {
	f := extractOne(t, "package p\n\nfunc _() { G() }\n\nfunc G() {}\n")
	if len(f.Calls) != 0 {
		t.Fatalf("calls from func _ have no node to start from, got %+v", f.Calls)
	}
}
