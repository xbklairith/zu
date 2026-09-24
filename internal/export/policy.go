package export

import (
	"cmp"
	"slices"

	"zu/internal/ir"
	"zu/internal/policy"
)

// PolicyInfo is what the UI needs of the Policy: its hash, its Levels inner
// first, the sibling order and the Proposals (07).
type PolicyInfo struct {
	Hash      string         `json:"hash"`
	Levels    [][]string     `json:"levels"`
	Order     []string       `json:"order,omitempty"`
	Proposals []ProposalInfo `json:"proposals,omitempty"`
}

// ProposalInfo is one Proposal as the UI draws it: its layers inner first,
// the ids it omits, the layer (rank) of every package it ranks and the
// package imports that break its layering. Unranked, unomitted packages are
// drawn as Unassigned.
type ProposalInfo struct {
	Name       string         `json:"name"`
	Layers     []policy.Layer `json:"layers"`
	Omit       []string       `json:"omit,omitempty"`
	Ranks      map[string]int `json:"ranks"`
	Violations []policy.Pair  `json:"violations"`
}

// Mark adds the Policy to a View built from pol.Apply(doc): the rank of
// every ranked package, the rule each violating import breaks, the order
// and the Proposals. A Policy with none of these adds nothing, so a View
// without them is 04's.
func Mark(v *View, pol *policy.Policy, doc *ir.IR) {
	norm := pol.Normalize()
	if !pol.Rules() && len(norm.Order) == 0 && len(norm.Proposals) == 0 {
		return
	}
	v.Policy = &PolicyInfo{Hash: pol.Hash(), Levels: [][]string{}, Order: norm.Order}
	for _, l := range norm.Levels {
		v.Policy.Levels = append(v.Policy.Levels, l)
	}
	for i := range v.Nodes {
		n := &v.Nodes[i]
		if n.Kind != string(ir.KindPackage) {
			continue
		}
		if r, ok := pol.RankOf(n.ID); ok {
			n.Rank = &r
		}
	}
	rules := pol.EdgeRules(doc)
	for i := range v.Edges {
		e := &v.Edges[i]
		if e.Kind == string(ir.EdgeImports) {
			e.Violation = rules[policy.Pair{From: e.From, To: e.To}]
		}
	}
	for _, pr := range norm.Proposals {
		v.Policy.Proposals = append(v.Policy.Proposals, proposalInfo(v, pol, pr, doc))
	}
}

func proposalInfo(v *View, pol *policy.Policy, pr policy.Proposal, doc *ir.IR) ProposalInfo {
	q, _ := pol.ForProposal(pr.Name)
	info := ProposalInfo{Name: pr.Name, Layers: pr.Layers, Omit: pr.Omit, Ranks: map[string]int{}, Violations: []policy.Pair{}}
	for _, n := range v.Nodes {
		if n.Kind != string(ir.KindPackage) || q.Omitted(n.ID) {
			continue
		}
		if r, ok := q.RankOf(n.ID); ok {
			info.Ranks[n.ID] = r
		}
	}
	for p := range q.EdgeRules(doc) {
		info.Violations = append(info.Violations, p)
	}
	slices.SortFunc(info.Violations, func(a, b policy.Pair) int {
		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To))
	})
	return info
}
