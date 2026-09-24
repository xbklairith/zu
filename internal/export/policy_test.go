package export

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

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
	if after, _ := json.Marshal(v); string(before) != string(after) {
		t.Fatal("a Policy with no rules must leave the View (and 04's goldens) unchanged")
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
