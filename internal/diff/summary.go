package diff

import (
	"cmp"
	"encoding/json"
	"io"
	"slices"
	"strings"

	"zu/internal/ir"
)

// SummaryVersion is the Structural Summary's JSON format version.
const SummaryVersion = "1"

// NotCompared is printed in every format's footer (decisions: Diff scope).
const NotCompared = "Not compared: go.mod changes (dependency versions, go and toolchain lines) and other languages' toolchain and dependency files."

// Summary is the Structural Summary: what an MR changed, for CI to post.
// Field order is part of the JSON contract.
type Summary struct {
	SummaryVersion string            `json:"summaryVersion"`
	Base           ir.Ref            `json:"base"`
	Head           ir.Ref            `json:"head"`
	Changed        bool              `json:"changed"`
	Violations     *ViolationDelta   `json:"violations,omitempty"` // only when the Policy has rules
	Packages       []PackageRow      `json:"packages"`             // changed packages, bottom-up
	Imports        []EdgeChange      `json:"imports"`
	EdgeCounts     map[string]Counts `json:"edgeCounts"` // "calls", "embeds"
	Moves          []Move            `json:"moves"`
	Affected       []Hop             `json:"affected"`
	Nodes          []NodeChange      `json:"nodes"` // every node change, for tools
	ParseErrors    SideErrors        `json:"parseErrors"`
	NotCompared    string            `json:"notCompared"`

	// imports are head's import edges between changed packages and their
	// direct importers: what the Mermaid diagram draws. Not in the JSON.
	imports []EdgeChange
}

// PackageRow is one changed package with its declaration change counts.
type PackageRow struct {
	ID       string `json:"id"`
	Status   Status `json:"status"`
	Added    int    `json:"added"`
	Modified int    `json:"modified"`
	Removed  int    `json:"removed"`
	Hops     int    `json:"hops"` // 0 for a changed package
}

// Counts is how many edges of one kind were added and removed.
type Counts struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

// SideErrors are the parse errors of each side.
type SideErrors struct {
	Base []ir.ParseError `json:"base"`
	Head []ir.ParseError `json:"head"`
}

// Summarize builds the Structural Summary of base → head.
func Summarize(base, head *ir.IR) *Summary {
	return SummarizeDelta(base, head, Compare(base, head))
}

// SummarizeDelta is Summarize given d, the Delta Compare(base, head) already
// returned, so a caller that needs both compares once (14). It reads d and
// never changes it.
func SummarizeDelta(base, head *ir.IR, d Delta) *Summary {
	s := &Summary{
		SummaryVersion: SummaryVersion,
		Base:           base.Ref,
		Head:           head.Ref,
		Changed:        len(d.Nodes)+len(d.Edges)+len(d.Moves) > 0,
		Imports:        []EdgeChange{},
		EdgeCounts:     map[string]Counts{string(ir.EdgeCalls): {}, string(ir.EdgeEmbeds): {}},
		Moves:          orEmpty(d.Moves),
		Nodes:          orEmpty(d.Nodes),
		ParseErrors:    SideErrors{Base: orEmpty(base.ParseErrors), Head: orEmpty(head.ParseErrors)},
		NotCompared:    NotCompared,
	}
	for _, e := range d.Edges {
		if e.Kind == ir.EdgeImports {
			s.Imports = append(s.Imports, e)
			continue
		}
		c := s.EdgeCounts[string(e.Kind)]
		if e.Status == Added {
			c.Added++
		} else {
			c.Removed++
		}
		s.EdgeCounts[string(e.Kind)] = c
	}

	pkgs := map[string]bool{}
	for _, n := range append(slices.Clip(base.Nodes), head.Nodes...) {
		if n.Kind == ir.KindPackage {
			pkgs[n.ID] = true
		}
	}
	rows := map[string]*PackageRow{}
	row := func(id string) *PackageRow {
		if rows[id] == nil {
			rows[id] = &PackageRow{ID: id, Status: Modified}
		}
		return rows[id]
	}
	for _, n := range d.Nodes {
		switch n.Kind {
		case ir.KindPackage:
			row(n.ID).Status = n.Status
		case ir.KindType, ir.KindFunction:
			pkg, _ := splitDecl(n.ID, pkgs)
			if pkg == "" {
				continue
			}
			r := row(pkg)
			switch n.Status {
			case Added:
				r.Added++
			case Modified:
				r.Modified++
			case Removed:
				r.Removed++
			}
		}
	}
	var changed []string
	for id, r := range rows {
		if r.Status != Removed {
			changed = append(changed, id)
		}
	}
	slices.Sort(changed)
	s.Affected = orEmpty(Affected(head, changed))

	near := map[string]bool{}
	for id := range rows {
		near[id] = true
	}
	for _, h := range s.Affected {
		if h.Hops <= 1 {
			near[h.Package] = true
		}
	}
	for _, e := range head.Edges {
		if e.Kind == ir.EdgeImports && near[e.From] && near[e.To] {
			s.imports = append(s.imports, EdgeChange{From: e.From, To: e.To, Kind: e.Kind})
		}
	}
	// An IR's edges are sorted only when encoded.
	slices.SortFunc(s.imports, func(a, b EdgeChange) int {
		return cmp.Or(strings.Compare(a.From, b.From), strings.Compare(a.To, b.To))
	})

	rank := bottomUp(head, rows)
	s.Packages = make([]PackageRow, 0, len(rows))
	for _, r := range rows {
		s.Packages = append(s.Packages, *r)
	}
	slices.SortFunc(s.Packages, func(a, b PackageRow) int {
		return cmp.Or(cmp.Compare(rank[a.ID], rank[b.ID]), strings.Compare(a.ID, b.ID))
	})
	return s
}

// bottomUp ranks the changed packages for reading order: the number of
// changed packages on the longest import chain below each one, so leaves come
// first. It works on the condensation of head's import graph, so the
// packages of one import cycle share a rank. Packages absent from head (the
// removed ones) rank 0.
func bottomUp(head *ir.IR, rows map[string]*PackageRow) map[string]int {
	var ids []string
	for _, n := range head.Nodes {
		if n.Kind == ir.KindPackage {
			ids = append(ids, n.ID)
		}
	}
	slices.Sort(ids)
	isPkg := map[string]bool{}
	for _, id := range ids {
		isPkg[id] = true
	}
	out := map[string][]string{}
	for _, e := range head.Edges {
		if e.Kind == ir.EdgeImports && isPkg[e.From] && isPkg[e.To] {
			out[e.From] = append(out[e.From], e.To)
		}
	}
	comp := sccs(ids, out)

	// Component graph: which components each one imports, and whether it
	// holds a changed package.
	n := 0
	for _, c := range comp {
		n = max(n, c+1)
	}
	succ := make([]map[int]bool, n)
	hasChanged := make([]bool, n)
	for _, id := range ids {
		c := comp[id]
		if succ[c] == nil {
			succ[c] = map[int]bool{}
		}
		if rows[id] != nil {
			hasChanged[c] = true
		}
		for _, to := range out[id] {
			if comp[to] != c {
				succ[c][comp[to]] = true
			}
		}
	}
	memo := make([]int, n)
	done := make([]bool, n)
	var depth func(c int) int
	depth = func(c int) int {
		if done[c] {
			return memo[c]
		}
		best := 0
		for d := range succ[c] {
			v := depth(d)
			if hasChanged[d] {
				v++
			}
			best = max(best, v)
		}
		memo[c], done[c] = best, true
		return best
	}
	rank := map[string]int{}
	for id := range rows {
		if c, ok := comp[id]; ok {
			rank[id] = depth(c)
		}
	}
	return rank
}

// sccs numbers the strongly connected components of the graph (Tarjan).
func sccs(ids []string, out map[string][]string) map[string]int {
	index := map[string]int{}
	low := map[string]int{}
	onStack := map[string]bool{}
	comp := map[string]int{}
	var stack []string
	next, ncomp := 0, 0
	var visit func(v string)
	visit = func(v string) {
		index[v], low[v] = next, next
		next++
		stack = append(stack, v)
		onStack[v] = true
		for _, w := range out[v] {
			if _, seen := index[w]; !seen {
				visit(w)
				low[v] = min(low[v], low[w])
			} else if onStack[w] {
				low[v] = min(low[v], index[w])
			}
		}
		if low[v] == index[v] {
			for {
				w := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				onStack[w] = false
				comp[w] = ncomp
				if w == v {
					break
				}
			}
			ncomp++
		}
	}
	for _, v := range ids {
		if _, seen := index[v]; !seen {
			visit(v)
		}
	}
	return comp
}

// WriteJSON writes s with two-space indentation and a trailing newline.
// Empty collections are written as [] or {}, never null.
func WriteJSON(w io.Writer, s *Summary) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	return enc.Encode(s)
}

func orEmpty[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
