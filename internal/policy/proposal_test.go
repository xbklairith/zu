package policy

import (
	"slices"
	"strings"
	"testing"
)

const proposalSrc = `levels: [m/domain, m/app, m/cmd]
cycles: true
omit: [m/util]
edge-kinds: [{from: m/app, to: m/cmd, kind: association}]
proposals:
  - name: Flipped
    layers:
      - {name: Core, members: [m/app]}
      - {name: Edge, members: [m/domain, m/cmd]}
      - {name: Model, members: [m/domain/model]}
    omit: [m/cmd]
`

func TestForProposalRanksTheLayersInnerFirst(t *testing.T) {
	p := mustParse(t, proposalSrc)
	q, ok := p.ForProposal("Flipped")
	if !ok {
		t.Fatal("Flipped not found")
	}
	for id, want := range map[string]int{"m/app": 0, "m/domain": 1, "m/cmd": 1, "m/domain/model": 2} {
		if got, ok := q.RankOf(id); !ok || got != want {
			t.Errorf("RankOf(%q) = %d, %v; want %d", id, got, ok, want)
		}
	}
	if q.Cycles || !slices.Equal(q.Omit, []string{"m/cmd", "m/util"}) || len(q.EdgeKinds) != 1 {
		t.Errorf("ForProposal = %+v: want no cycles, both omits, the edge kinds", q)
	}
	if !q.Omitted("m/cmd/x") || q.Omitted("m/cmdx") || p.Omitted("m/cmd") {
		t.Error("Omitted covers the Proposal's omit by whole segments, and only there")
	}
	if _, ok := p.ForProposal("Nope"); ok {
		t.Error("an unknown Proposal is not found")
	}
}

func TestProposalViolationsAreReEvaluated(t *testing.T) {
	q, _ := mustParse(t, proposalSrc).ForProposal("Flipped")
	doc := layered("m/domain>m/app", "m/app>m/domain", "m/domain>m/domain/model", "m/app>m/cmd")
	got := q.Check(doc)
	want := []Violation{{RuleLevels, "m/app", "m/domain"}, {RuleLevels, "m/domain", "m/domain/model"}}
	if !slices.Equal(got, want) {
		t.Fatalf("Check = %v, want %v (m/cmd is omitted by the Proposal)", got, want)
	}
}

func TestParseRejectsAMemberInTwoLayers(t *testing.T) {
	_, err := Parse([]byte("proposals:\n  - name: P\n    layers:\n      - {name: A, members: [m/app]}\n      - {name: B, members: [m/cmd, m/app]}\n"))
	if err == nil || !strings.Contains(err.Error(), `proposals[0].layers[1]: "m/app" is already in layers[0]`) {
		t.Fatalf("Parse = %v", err)
	}
}

func TestValidateRejectsAProposalMemberThatMatchesNothing(t *testing.T) {
	p := mustParse(t, "levels: [m/domain]\nproposals: [{name: P, layers: [{name: A, members: [m/app]}, {name: B, members: [m/domian]}]}]\n")
	err := p.Validate(layered())
	if err == nil || !strings.Contains(err.Error(), `proposals[0].layers[1]: "m/domian" matches no package`) {
		t.Fatalf("Validate = %v", err)
	}
}
