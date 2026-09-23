package policy

import (
	"cmp"
	"fmt"
	"slices"

	"zu/internal/ir"
)

// Rule names, as a Violation records them.
const (
	RuleLevels = "levels"
	RuleCycle  = "cycle"
)

// Violation is one broken rule. For RuleLevels From and To are packages;
// for RuleCycle they are sibling Package Tree boxes on a cycle.
type Violation struct {
	Rule string `json:"rule"`
	From string `json:"from"`
	To   string `json:"to"`
}

// Compare orders violations by rule, from, to.
func Compare(a, b Violation) int {
	return cmp.Or(cmp.Compare(a.Rule, b.Rule), cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To))
}

// RankOf is the rank of the longest ranked id that id is under (policy.clj
// rank-of, l.196). Rank 0 is the innermost level.
func (p *Policy) RankOf(id string) (int, bool) {
	rank, best := 0, -1
	for i, lv := range p.Levels {
		for _, l := range lv {
			if under(id, l) && len(l) > best {
				rank, best = i, len(l)
			}
		}
	}
	return rank, best >= 0
}

// Check evaluates the Policy's rules on doc as the Policy sees it (Apply)
// and returns the violations sorted and unique.
func (p *Policy) Check(doc *ir.IR) []Violation {
	doc = p.Apply(doc)
	vs := p.levelViolations(doc)
	if p.Cycles {
		vs = append(vs, p.cycleViolations(doc)...)
	}
	slices.SortFunc(vs, Compare)
	return slices.Compact(vs)
}

// levelViolations flags every package import from a lower rank to a higher
// one: an inner level depending on an outer one (policy.clj
// violating-dependency?, l.213). Both ends must be ranked; same rank is
// allowed; an association (edge-kinds) is not a dependency (l.279).
func (p *Policy) levelViolations(doc *ir.IR) []Violation {
	if len(p.Levels) == 0 {
		return nil
	}
	pkgs := packageIDs(doc)
	var vs []Violation
	for _, e := range doc.Edges {
		if e.Kind != ir.EdgeImports || !pkgs[e.From] || !pkgs[e.To] || p.association(e.From, e.To) {
			continue
		}
		rf, okf := p.RankOf(e.From)
		rt, okt := p.RankOf(e.To)
		if okf && okt && rf < rt {
			vs = append(vs, Violation{RuleLevels, e.From, e.To})
		}
	}
	return vs
}

func (p *Policy) association(from, to string) bool {
	return slices.ContainsFunc(p.EdgeKinds, func(k EdgeKind) bool {
		return k.Kind == Association && under(from, k.From) && under(to, k.To)
	})
}

func packageIDs(doc *ir.IR) map[string]bool {
	out := map[string]bool{}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindPackage {
			out[n.ID] = true
		}
	}
	return out
}

// Validate reports a Levels id that ranks no package of doc: almost always
// a typo, and a rule that silently checks nothing.
func (p *Policy) Validate(doc *ir.IR) error {
	pkgs := packageIDs(doc)
	for i, lv := range p.Levels {
		for _, l := range lv {
			found := false
			for id := range pkgs {
				if under(id, l) {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("%s: levels[%d]: %q matches no package", FileName, i, l)
			}
		}
	}
	return nil
}
