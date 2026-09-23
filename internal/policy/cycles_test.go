package policy

import (
	"slices"
	"strings"
	"testing"

	"zu/internal/ir"
)

// graph builds packages (id@module) and import edges (from>to).
func graph(pkgs []string, imports ...string) *ir.IR {
	doc := &ir.IR{}
	for _, p := range pkgs {
		id, mod, _ := strings.Cut(p, "@")
		doc.Nodes = append(doc.Nodes, ir.Node{ID: id, Kind: ir.KindPackage, Module: mod})
	}
	for _, e := range imports {
		from, to, _ := strings.Cut(e, ">")
		doc.Edges = append(doc.Edges, ir.Edge{From: from, To: to, Kind: ir.EdgeImports})
	}
	return doc
}

func TestLiftIsTheLowestCommonBoxsChildren(t *testing.T) {
	mod := map[string]string{"m/a/x": "m", "m/b/y": "m", "m/a": "m", "m/a/b/c": "m", "n/q": "n", "m": "m"}
	for _, tc := range []struct{ from, to, parent, a, b string }{
		{"m/a/x", "m/b/y", "m", "m/a", "m/b"},
		{"m/a", "m/a/b/c", "m/a", "m/a", "m/a/b"}, // m/a stands for its #pkg leaf
		{"m/a/b/c", "m/a", "m/a", "m/a/b", "m/a"},
		{"m", "m/a/x", "m", "m", "m/a"},
		{"m/a/x", "n/q", "", "m", "n"}, // modules are roots
	} {
		parent, a, b, ok := lift(tc.from, tc.to, mod)
		if !ok || parent != tc.parent || a != tc.a || b != tc.b {
			t.Errorf("lift(%s, %s) = %q %q %q %v, want %q %q %q", tc.from, tc.to, parent, a, b, ok, tc.parent, tc.a, tc.b)
		}
	}
	if _, _, _, ok := lift("m/a/x", "m/a/x", mod); ok {
		t.Error("a package does not form an arc with itself")
	}
}

func TestCyclesBetweenSiblingBoxes(t *testing.T) {
	doc := graph([]string{"m/a/x@m", "m/a/w@m", "m/b/y@m", "m/b/z@m", "m/c@m", "m/d@m", "m/d/e@m", "n/q@n", "n/r@n"},
		"m/a/x>m/b/y", "m/b/z>m/a/w", // m/a ⇄ m/b
		"m/c>m/a/x",              // into the cycle, not on it
		"m/d>m/d/e", "m/d/e>m/d", // leaf ⇄ child box, under m/d
		"n/q>m/c", "m/c>n/r", // module ⇄ module
	)
	got := mustParse(t, "cycles: true\n").Check(doc)
	want := []Violation{
		{RuleCycle, "m", "n"}, {RuleCycle, "m/a", "m/b"}, {RuleCycle, "m/b", "m/a"},
		{RuleCycle, "m/d", "m/d/e"}, {RuleCycle, "m/d/e", "m/d"}, {RuleCycle, "n", "m"},
	}
	if !slices.Equal(got, want) {
		t.Fatalf("Check =\n%v\nwant\n%v", got, want)
	}
	if got := (&Policy{}).Check(doc); len(got) != 0 {
		t.Fatalf("cycles are opt-in, got %v", got)
	}
}

func TestEdgeRulesMarkThePackageImportsToDrawRed(t *testing.T) {
	doc := graph([]string{"m/a/x@m", "m/b/y@m", "m/b/z@m", "m/c@m"},
		"m/a/x>m/b/y", "m/b/z>m/a/x", "m/c>m/a/x", "m/a/x>m/c")
	p := mustParse(t, "levels: [m/a, m/c]\ncycles: true\n")
	got := p.EdgeRules(doc)
	want := map[Pair]string{
		{"m/a/x", "m/b/y"}: RuleCycle, {"m/b/z", "m/a/x"}: RuleCycle, // m/a ⇄ m/b
		{"m/a/x", "m/c"}: RuleLevels, // a Levels violation, also on the m/a ⇄ m/c cycle: levels wins
		{"m/c", "m/a/x"}: RuleCycle,
	}
	if len(got) != len(want) {
		t.Fatalf("EdgeRules = %v, want %v", got, want)
	}
	for k, r := range want {
		if got[k] != r {
			t.Errorf("EdgeRules[%v] = %q, want %q", k, got[k], r)
		}
	}
}
