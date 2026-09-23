package policy

import "zu/internal/ir"

// boxes is the chain of Package Tree boxes from a package's module root down
// to the package itself (ADR 0008): "m/a/b" in module "m" is m, m/a, m/a/b.
func boxes(id, module string) []string {
	chain := []string{module}
	if id == module {
		return chain
	}
	for i := len(module) + 1; i <= len(id); i++ {
		if i == len(id) || id[i] == '/' {
			chain = append(chain, id[:i])
		}
	}
	return chain
}

// lift maps an import between two packages to an arc between the two
// children of their lowest common box, and names that box ("" when the ends
// are in different modules, whose roots are siblings). A package that is an
// ancestor of the other end stands for its own #pkg leaf.
func lift(from, to string, module map[string]string) (parent, a, b string, ok bool) {
	if from == to {
		return "", "", "", false
	}
	if module[from] != module[to] {
		return "", module[from], module[to], true
	}
	cf, ct := boxes(from, module[from]), boxes(to, module[to])
	k := 0
	for k < len(cf) && k < len(ct) && cf[k] == ct[k] {
		k++
	}
	a, b = cf[min(k, len(cf)-1)], ct[min(k, len(ct)-1)]
	return cf[k-1], a, b, true
}

// cycleViolations lifts every package import to its sibling-box arc and
// flags each arc that lies on a cycle among its siblings. Go forbids import
// cycles between packages, so these are the cycles A8 can find.
func (p *Policy) cycleViolations(doc *ir.IR) []Violation {
	module := map[string]string{}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindPackage {
			module[n.ID] = n.Module
		}
	}
	out := map[string]map[string][]string{} // parent box → arc tails → heads
	for _, e := range doc.Edges {
		if e.Kind != ir.EdgeImports || module[e.From] == "" || module[e.To] == "" {
			continue
		}
		parent, a, b, ok := lift(e.From, e.To, module)
		if !ok {
			continue
		}
		if out[parent] == nil {
			out[parent] = map[string][]string{}
		}
		out[parent][a] = append(out[parent][a], b)
	}
	var vs []Violation
	for _, arcs := range out {
		comp := components(arcs)
		for a, heads := range arcs {
			for _, b := range heads {
				if comp[a] == comp[b] {
					vs = append(vs, Violation{RuleCycle, a, b})
				}
			}
		}
	}
	return vs
}

// components is Tarjan's algorithm: node → strongly connected component
// number, for every node on an arc. A node alone in its component has a
// number no other node shares.
func components(arcs map[string][]string) map[string]int {
	index, low, comp := map[string]int{}, map[string]int{}, map[string]int{}
	var stack []string
	on := map[string]bool{}
	var visit func(v string)
	visit = func(v string) {
		index[v], low[v] = len(index), len(index)
		stack = append(stack, v)
		on[v] = true
		for _, w := range arcs[v] {
			if _, seen := index[w]; !seen {
				visit(w)
				low[v] = min(low[v], low[w])
			} else if on[w] {
				low[v] = min(low[v], index[w])
			}
		}
		if low[v] == index[v] {
			n := len(comp) + 1
			for {
				w := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				on[w] = false
				comp[w] = n
				if w == v {
					break
				}
			}
		}
	}
	for v := range arcs {
		if _, seen := index[v]; !seen {
			visit(v)
		}
	}
	return comp
}

// EdgeRules maps every package import of doc, as Apply sees it, that breaks
// a rule to that rule: the edges drawn red. A Levels violation wins over a
// cycle, since it names the edge itself rather than its boxes' arc.
func (p *Policy) EdgeRules(doc *ir.IR) map[Pair]string {
	out := map[Pair]string{}
	if !p.Rules() {
		return out
	}
	doc = p.Apply(doc)
	onCycle := map[Violation]bool{}
	if p.Cycles {
		for _, v := range p.cycleViolations(doc) {
			onCycle[v] = true
		}
	}
	module := map[string]string{}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindPackage {
			module[n.ID] = n.Module
		}
	}
	for _, v := range p.levelViolations(doc) {
		out[Pair{v.From, v.To}] = RuleLevels
	}
	for _, e := range doc.Edges {
		if e.Kind != ir.EdgeImports || out[Pair{e.From, e.To}] != "" || module[e.From] == "" || module[e.To] == "" {
			continue
		}
		if _, a, b, ok := lift(e.From, e.To, module); ok && onCycle[Violation{RuleCycle, a, b}] {
			out[Pair{e.From, e.To}] = RuleCycle
		}
	}
	return out
}
