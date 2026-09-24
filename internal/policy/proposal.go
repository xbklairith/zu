package policy

// ForProposal is the Policy a Proposal is drawn and checked under (ADR 0008:
// "violations are re-evaluated for it"): p's lens with the Proposal's omit
// added, and its layers, inner first, as the Levels. A package in two layers
// takes the deeper member's layer, as RankOf does. Cycles are not checked:
// they are arcs between Package Tree boxes, which a Proposal regroups
// (uml-viewer's restamp-ranks, policy.clj l.231, restamps Levels only).
func (p *Policy) ForProposal(name string) (*Policy, bool) {
	n := p.Normalize()
	for _, pr := range n.Proposals {
		if pr.Name != name {
			continue
		}
		q := &Policy{
			Foreign: n.Foreign, Omit: set(append(append([]string{}, n.Omit...), pr.Omit...)),
			OmitEdges: n.OmitEdges, EdgeKinds: n.EdgeKinds,
		}
		for _, l := range pr.Layers {
			q.Levels = append(q.Levels, Level(l.Members))
		}
		return q, true
	}
	return nil, false
}

// Omitted reports whether the Policy omits id: id lies under an omit entry.
func (p *Policy) Omitted(id string) bool {
	return underAny(id, p.Omit)
}
