package scan

import (
	"reflect"
	"testing"
)

func TestExtractComplexityAndSpan(t *testing.T) {
	src := `package p

type T struct{}

// Plain has no branches.
func Plain() {}

func (T) Branchy(xs []int, c chan int) int {
	n := 0
	for _, x := range xs {
		if x > 0 && x < 10 || x == 42 {
			n++
		}
	}
	for i := 0; i < 3; i++ {
	}
	switch n {
	case 1, 2:
	case 3:
	default:
	}
	select {
	case <-c:
	default:
	}
	f := func() {
		if n > 0 {
		}
	}
	f()
	return n
}

//line gen.y:200
func Gen() {}
`
	f := extractOne(t, src)
	if f.Err != nil {
		t.Fatal(f.Err)
	}
	type m struct {
		Name       string
		CC         int
		File       string
		Start, End Pos
	}
	var got []m
	for _, d := range f.Decls {
		got = append(got, m{d.Name, d.CC, d.File, d.Start, d.End})
	}
	// T is a type: no complexity, no span. Branchy: 1 + range + if + && + ||
	// + for + two non-default cases + one non-default comm clause + the
	// closure's if = 10. Gen is where its //line directive says, as go test
	// -coverprofile keys it: gen.y, line 200, columns unknown (0).
	want := []m{
		{"T", 0, "", Pos{}, Pos{}},
		{"Plain", 1, "f.go", Pos{6, 1}, Pos{6, 16}},
		{"Branchy", 10, "f.go", Pos{8, 1}, Pos{32, 2}},
		{"Gen", 1, "gen.y", Pos{200, 0}, Pos{200, 0}},
	}
	if len(got) != len(want) {
		t.Fatalf("decls = %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("decl %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// A coverprofile also covers code that no function node holds: the function
// literals of package-level vars, and func _ bodies. Their spans let export
// tell such blocks from blocks that a profile of another revision moved.
func TestExtractLooseCode(t *testing.T) {
	f := extractOne(t, `package p

var hook = func() {
	if true {
	}
}

var (
	a, b   = 1, func() int { return 2 }
	nested = func() func() { return func() {} }
)

func _() { _ = 0 }

func F() { _ = func() {} }

//line gen.y:10
var gen = func() {}
`)
	if f.Err != nil {
		t.Fatal(f.Err)
	}
	// F's literal is inside F's span, and nested's inner one inside nested's.
	want := []Span{
		{"p/f.go", "f.go", 0, Pos{3, 12}, Pos{6, 2}},
		{"p/f.go", "f.go", 0, Pos{9, 14}, Pos{9, 37}},
		{"p/f.go", "f.go", 0, Pos{10, 11}, Pos{10, 45}},
		{"p/f.go", "f.go", 0, Pos{13, 1}, Pos{13, 19}},
		{"p/f.go", "gen.y", 0, Pos{10, 0}, Pos{10, 0}},
	}
	if !reflect.DeepEqual(f.Loose, want) {
		t.Fatalf("Loose =\n%+v\nwant\n%+v", f.Loose, want)
	}
}

func TestRunMeasuresFunctions(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod":       "module example.com/m\n",
		"p/a_linux.go": "//go:build linux\n\npackage p\n\nfunc F(x int) {\n\tif x > 0 {\n\t}\n}\n",
		"p/a_other.go": "//go:build !linux\n\npackage p\n\nfunc F(x int) {}\n",
		"p/t.go":       "package p\n\ntype T struct{}\n\nfunc (T) M() {}\n",
		"p/v.go":       "package p\n\nvar V = func() {}\n\n//line gen.y:10\nfunc G() {}\n",
		"p/x.go":       "//go:build ignore\n\npackage p\n\nvar X = func() {}\n",
	})
	_, stats := run(t, root, 1)
	// Each build variant keeps its own complexity: coverage from a darwin
	// run must not be scored with the linux body's branches. Files holds
	// every file key the scan parsed, gen.y included and x.go not, with the
	// spans of code no function node holds.
	want := Measures{
		Funcs: map[string]Measure{
			"example.com/m/p.F": {Pkg: "example.com/m/p", Spans: []Span{
				{"p/a_linux.go", "a_linux.go", 2, Pos{5, 1}, Pos{8, 2}},
				{"p/a_other.go", "a_other.go", 1, Pos{5, 1}, Pos{5, 17}},
			}},
			"example.com/m/p.G":   {Pkg: "example.com/m/p", Spans: []Span{{"p/v.go", "gen.y", 1, Pos{10, 0}, Pos{10, 0}}}},
			"example.com/m/p.T.M": {Pkg: "example.com/m/p", Spans: []Span{{"p/t.go", "t.go", 1, Pos{5, 1}, Pos{5, 16}}}},
		},
		Files: map[string][]Span{
			"example.com/m/p/a_linux.go": nil,
			"example.com/m/p/a_other.go": nil,
			"example.com/m/p/gen.y":      nil,
			"example.com/m/p/t.go":       nil,
			"example.com/m/p/v.go":       {{"p/v.go", "v.go", 0, Pos{3, 9}, Pos{3, 18}}},
		},
	}
	if !reflect.DeepEqual(stats.Measures, want) {
		t.Fatalf("Measures =\n%+v\nwant\n%+v", stats.Measures, want)
	}
}
