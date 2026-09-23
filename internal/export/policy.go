package export

import (
	"zu/internal/ir"
	"zu/internal/policy"
)

// PolicyInfo is what the UI needs of the Policy: its hash and its Levels,
// inner first.
type PolicyInfo struct {
	Hash   string     `json:"hash"`
	Levels [][]string `json:"levels"`
}

// Mark adds the Policy's rules to a View built from pol.Apply(doc): the
// rank of every ranked package and the rule each violating import breaks.
// A Policy without rules adds nothing, so a View without rules is 04's.
func Mark(v *View, pol *policy.Policy, doc *ir.IR) {
	if !pol.Rules() {
		return
	}
	v.Policy = &PolicyInfo{Hash: pol.Hash(), Levels: [][]string{}}
	for _, l := range pol.Normalize().Levels {
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
}
