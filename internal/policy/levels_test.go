package policy

import (
	"slices"
	"strings"
	"testing"

	"zu/internal/ir"
)

// layered is a small layered repo: m/domain is inner, m/app outer, m/cmd
// outermost; m/util is unranked and x.io/lib is external.
func layered(imports ...string) *ir.IR {
	doc := &ir.IR{}
	for _, id := range []string{"m/domain", "m/domain/model", "m/app", "m/cmd", "m/util"} {
		doc.Nodes = append(doc.Nodes, ir.Node{ID: id, Kind: ir.KindPackage, Module: "m"})
	}
	doc.Nodes = append(doc.Nodes,
		ir.Node{ID: "m/app.Svc", Kind: ir.KindType, Parent: "m/app"},
		ir.Node{ID: "x.io/lib", Kind: ir.KindExternal})
	for _, e := range imports {
		from, to, _ := strings.Cut(e, ">")
		doc.Edges = append(doc.Edges, ir.Edge{From: from, To: to, Kind: ir.EdgeImports, Locations: loc("f.go", 1)})
	}
	return doc
}

func mustParse(t *testing.T, src string) *Policy {
	t.Helper()
	p, err := Parse([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestRankOfTakesTheLongestRankedPrefix(t *testing.T) {
	p := mustParse(t, "levels: [[m/domain], m/app, m/domain/model]\n")
	for id, want := range map[string]int{"m/domain": 0, "m/domain/x": 0, "m/domain/model": 2, "m/domain/model/v1": 2, "m/app": 1} {
		if got, ok := p.RankOf(id); !ok || got != want {
			t.Errorf("RankOf(%q) = %d, %v; want %d", id, got, ok, want)
		}
	}
	if _, ok := p.RankOf("m/domainx"); ok {
		t.Error("m/domainx is not under m/domain")
	}
}

func TestLevelsFlagInnerToOuterImports(t *testing.T) {
	p := mustParse(t, "levels: [m/domain, m/app, m/cmd]\n")
	doc := layered(
		"m/cmd>m/app", "m/app>m/domain", "m/domain/model>m/domain", // outer → inner and same rank: allowed
		"m/domain>m/app", "m/domain/model>m/cmd", // inner → outer: violations
		"m/util>m/cmd", "m/domain>m/util", "m/domain>x.io/lib", // unranked or external ends are not compared
		"m/app.Svc>m/cmd", // a declaration's call is not an import
	)
	doc.Edges[len(doc.Edges)-1].Kind = ir.EdgeCalls
	got := p.Check(doc)
	want := []Violation{{RuleLevels, "m/domain", "m/app"}, {RuleLevels, "m/domain/model", "m/cmd"}}
	if !slices.Equal(got, want) {
		t.Fatalf("Check = %v, want %v", got, want)
	}
}

func TestEdgeKindsAssociationExempts(t *testing.T) {
	p := mustParse(t, "levels: [m/domain, m/app]\nedge-kinds: [{from: m/domain, to: m/app, kind: association}]\n")
	if got := p.Check(layered("m/domain/model>m/app")); len(got) != 0 {
		t.Fatalf("an association is not a dependency (policy.clj l.279), got %v", got)
	}
}

func TestLevelsSeeThePolicyLens(t *testing.T) {
	p := mustParse(t, "levels: [m/domain, m/app]\nomit-edges: [{from: m/domain, to: m/app}]\n")
	if got := p.Check(layered("m/domain>m/app")); len(got) != 0 {
		t.Fatalf("an omitted edge is not checked, got %v", got)
	}
}

func TestValidateRejectsALevelThatRanksNothing(t *testing.T) {
	p := mustParse(t, "levels: [m/domain, m/ap]\n")
	err := p.Validate(layered())
	if err == nil || !strings.Contains(err.Error(), `levels[1]: "m/ap" matches no package`) {
		t.Fatalf("Validate = %v", err)
	}
	if err := mustParse(t, "levels: [m/domain, m]\n").Validate(layered()); err != nil {
		t.Fatalf("a box id ranks the packages under it: %v", err)
	}
}

func TestCompareListsLevelsBeforeCycle(t *testing.T) {
	vs := []Violation{{RuleCycle, "m/a", "m/b"}, {RuleLevels, "m/z", "m/y"}, {RuleCycle, "m/0", "m/1"}, {RuleLevels, "m/c", "m/d"}}
	slices.SortFunc(vs, Compare)
	want := []Violation{{RuleLevels, "m/c", "m/d"}, {RuleLevels, "m/z", "m/y"}, {RuleCycle, "m/0", "m/1"}, {RuleCycle, "m/a", "m/b"}}
	if !slices.Equal(vs, want) {
		t.Fatalf("sorted = %v, want %v", vs, want)
	}
}
