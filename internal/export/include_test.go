package export

import (
	"testing"

	"zu/internal/ir"
)

func TestPatternMatch(t *testing.T) {
	const root = "example.com/shop"
	const nested = "example.com/shop/tools" // a nested module, like kubernetes' hack/tools
	cases := []struct {
		pat, pkg, module string
		want             bool
	}{
		{"example.com/shop/internal/store", "example.com/shop/internal/store", root, true},
		{"example.com/shop/internal/store", "example.com/shop/internal/storex", root, false},
		{"./internal/...", "example.com/shop/internal/store", root, true},
		{"./internal/...", "example.com/shop/internal", root, true},
		{"./internal/...", "example.com/shop/internalx", root, false},
		{"./...", "example.com/shop", root, true},
		{"./...", "example.com/shop/tools/gen", nested, false}, // ./ stays in the root module, like go's ./...
		{"example.com/shop/...", "example.com/shop/tools/gen", nested, true},
		{".", "example.com/shop", root, true},
		{".", "example.com/shop/internal/store", root, false},
	}
	for _, c := range cases {
		p, err := ParsePattern(c.pat, root)
		if err != nil {
			t.Fatalf("ParsePattern(%q): %v", c.pat, err)
		}
		if got := p.Match(c.pkg, c.module); got != c.want {
			t.Errorf("%q.Match(%q, %q) = %v, want %v", c.pat, c.pkg, c.module, got, c.want)
		}
		if p.String() != c.pat {
			t.Errorf("String() = %q, want %q", p.String(), c.pat)
		}
	}
}

func TestParsePatternRejects(t *testing.T) {
	for _, s := range []string{"", "/abs/...", "./a/../b", "a//b", "a/", "./x"} {
		root := "example.com/shop"
		if s == "./x" {
			root = "" // no root module: ./ has nothing to be relative to
		}
		if _, err := ParsePattern(s, root); err == nil {
			t.Errorf("ParsePattern(%q, %q) accepted", s, root)
		}
	}
}

func TestRootModule(t *testing.T) {
	doc := &ir.IR{Nodes: []ir.Node{
		{ID: "example.com/shop/internal/store", Kind: ir.KindPackage, Module: "example.com/shop",
			Locations: []ir.Location{{Path: "internal/store/store.go", Line: 1}}},
		{ID: "example.com/gen", Kind: ir.KindPackage, Module: "example.com/gen",
			Locations: []ir.Location{{Path: "tools/gen/gen.go", Line: 1}}},
	}}
	if got := RootModule(doc); got != "example.com/shop" {
		t.Errorf("RootModule = %q, want example.com/shop", got)
	}
}
