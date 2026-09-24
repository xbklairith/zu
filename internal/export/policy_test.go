package export

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"zu/internal/ir"
	"zu/internal/policy"
)

func shopPolicy(t *testing.T) *policy.Policy {
	t.Helper()
	b, err := os.ReadFile("testdata/shop.policy.yaml")
	if err != nil {
		t.Fatal(err)
	}
	p, err := policy.Parse(b) // Parse, not Load: the fixture is not at a tree root
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestMarkAddsRanksAndViolations(t *testing.T) {
	doc, pol := shopIR(t), shopPolicy(t)
	v, err := Project(pol.Apply(doc), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	Mark(v, pol, doc)
	if v.Policy == nil || v.Policy.Hash != pol.Hash() || len(v.Policy.Levels) != 2 || v.Policy.Levels[1][0] != "example.com/shop/internal/money" {
		t.Fatalf("Policy = %+v", v.Policy)
	}
	ranks := map[string]*int{}
	for _, n := range v.Nodes {
		ranks[n.ID] = n.Rank
	}
	if r := ranks["example.com/shop/internal/store"]; r == nil || *r != 0 {
		t.Errorf("store rank = %v, want 0", r)
	}
	if r := ranks["example.com/shop/internal/money"]; r == nil || *r != 1 {
		t.Errorf("money rank = %v, want 1", r)
	}
	if ranks["example.com/shop/internal/checkout"] != nil {
		t.Error("an unranked package has no rank")
	}
	if _, ok := ranks["github.com/lib"]; !ok {
		t.Errorf("foreign github.com/lib not collapsed: %v", ranks)
	}
	var red []string
	for _, e := range v.Edges {
		if e.Violation != "" {
			red = append(red, e.From+">"+e.To+":"+e.Violation)
		}
	}
	if want := "example.com/shop/internal/store>example.com/shop/internal/money:levels"; strings.Join(red, ",") != want {
		t.Fatalf("violating edges = %v, want %s", red, want)
	}
}

func TestMarkWithoutRulesAddsNothing(t *testing.T) {
	doc := shopIR(t)
	v, err := Project(doc, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := json.Marshal(v)
	Mark(v, &policy.Policy{Foreign: []string{"github.com/lib"}}, doc)
	for i := range v.Nodes { // 12: what Mark adds with any Policy (TestMarkDemotes)
		v.Nodes[i].Demoted = ""
	}
	if after, _ := json.Marshal(v); string(before) != string(after) {
		t.Fatal("a Policy with no rules must leave the View (and 04's goldens) unchanged but for demotion")
	}
}

func TestMarkCarriesOrderAndProposals(t *testing.T) {
	doc := shopIR(t)
	pol, err := policy.Parse([]byte(`order: [example.com/shop/internal/store, example.com/shop/internal]
proposals:
  - name: Store first
    layers:
      - {name: Store, members: [example.com/shop/internal/store]}
      - {name: Rest, members: [example.com/shop/internal]}
    omit: [example.com/shop/tools]
`))
	if err != nil {
		t.Fatal(err)
	}
	v, err := Project(pol.Apply(doc), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	Mark(v, pol, doc)
	got, _ := json.Marshal(v.Policy)
	want := `{"hash":"` + pol.Hash() + `","levels":[],` +
		`"order":["example.com/shop/internal/store","example.com/shop/internal"],` +
		`"proposals":[{"name":"Store first",` +
		`"layers":[{"name":"Store","members":["example.com/shop/internal/store"]},{"name":"Rest","members":["example.com/shop/internal"]}],` +
		`"omit":["example.com/shop/tools"],` +
		`"ranks":{"example.com/shop/internal/checkout":1,"example.com/shop/internal/money":1,"example.com/shop/internal/store":0},` +
		`"violations":[{"from":"example.com/shop/internal/store","to":"example.com/shop/internal/money"}]}]}`
	if string(got) != want {
		t.Fatalf("Policy =\n%s\nwant\n%s", got, want)
	}
	for _, e := range v.Edges {
		if e.Violation != "" {
			t.Errorf("a Policy without rules marks no edge: %+v", e)
		}
	}
}

// 12: Mark says which packages the first view sets aside, with or without a
// Policy file, and passes the budget on.
func TestMarkDemotes(t *testing.T) {
	demoted := func(pol *policy.Policy) map[string]string {
		t.Helper()
		doc := shopIR(t)
		v, err := Project(pol.Apply(doc), nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		Mark(v, pol, doc)
		out := map[string]string{}
		for _, n := range v.Nodes {
			if n.Demoted != "" {
				out[n.ID] = n.Demoted
			}
		}
		return out
	}
	if got := demoted(&policy.Policy{}); len(got) != 1 || got["example.com/shop/tools/gen"] != policy.DemotedName {
		t.Errorf("no Policy: demoted = %v, want tools/gen by name", got)
	}
	keep, err := policy.Parse([]byte("demote: [\"!example.com/shop/tools\", example.com/shop/internal/money]\n"))
	if err != nil {
		t.Fatal(err)
	}
	if got := demoted(keep); len(got) != 1 || got["example.com/shop/internal/money"] != policy.DemotedName {
		t.Errorf("demote and !: demoted = %v, want only internal/money", got)
	}
}

func TestMarkPassesTheBudget(t *testing.T) {
	doc := shopIR(t)
	pol, err := policy.Parse([]byte("budget: 20\n"))
	if err != nil {
		t.Fatal(err)
	}
	v, err := Project(pol.Apply(doc), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	Mark(v, pol, doc)
	if v.Policy == nil || v.Policy.Budget == nil || *v.Policy.Budget != 20 || v.Policy.Hash != pol.Hash() {
		t.Fatalf("Policy = %+v, want budget 20 alone to add it", v.Policy)
	}
	for _, n := range v.Nodes {
		if want := n.ID == "example.com/shop" || n.ID == "example.com/shop/tools/gen"; n.Kind == "package" && n.Main != want {
			t.Errorf("%s main = %v, want %v", n.ID, n.Main, want)
		}
	}
}

// 12 (M1): a package counts its declarations in generated files, and is
// demoted as generated when every declaration of it is.
func TestProjectCountsGeneratedDeclarations(t *testing.T) {
	at := []ir.Location{{Path: "p/a.go", Line: 1}}
	doc := &ir.IR{Nodes: []ir.Node{
		{ID: "m/p", Kind: ir.KindPackage, Module: "m", Locations: at},
		{ID: "m/p.T", Kind: ir.KindType, Parent: "m/p", Generated: true, Locations: at},
		{ID: "m/p.F", Kind: ir.KindFunction, Parent: "m/p", Locations: at},
		{ID: "m/q", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{{Path: "q/a.go", Line: 1}}},
		{ID: "m/q.G", Kind: ir.KindFunction, Parent: "m/q", Generated: true, Locations: at},
		{ID: "m/r", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{{Path: "r/doc.go", Line: 1}}},
	}}
	v, err := Project(doc, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	Mark(v, &policy.Policy{}, doc)
	want := map[string][3]any{"m/p": {2, 1, ""}, "m/q": {1, 1, policy.DemotedGenerated}, "m/r": {0, 0, ""}}
	for _, n := range v.Nodes {
		if w, ok := want[n.ID]; ok && (n.Decls != w[0] || n.GenDecls != w[1] || n.Demoted != w[2] || n.Generated) {
			t.Errorf("%s: decls %d, genDecls %d, demoted %q, generated %v; want %v and no package-level generated", n.ID, n.Decls, n.GenDecls, n.Demoted, n.Generated, w)
		}
	}
}
