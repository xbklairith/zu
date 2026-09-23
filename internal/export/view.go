package export

import (
	"cmp"
	"slices"

	"zu/internal/ir"
)

// ViewSchema is the version of the View document the UI reads.
const ViewSchema = "1"

// View is everything one HTML Export draws. Field order and JSON keys are the
// contract with web/src/data.ts.
type View struct {
	Schema  string            `json:"schema"`
	Kind    string            `json:"kind"` // "project" or "change"
	Tool    string            `json:"tool"` // set by the caller: zu's version
	Head    ir.Ref            `json:"head"`
	Base    *ir.Ref           `json:"base,omitempty"`
	Modules []string          `json:"modules"`
	Nodes   []Node            `json:"nodes"`
	Edges   []Edge            `json:"edges"`
	Sources map[string]string `json:"sources"`
	Links   *Links            `json:"links,omitempty"`
	Honesty Honesty           `json:"honesty"`
	Changed []string          `json:"changed,omitempty"` // Change View: changed packages, bottom-up
	Hunks   map[string][]Hunk `json:"hunks,omitempty"`   // Change View: line diffs of changed files
}

// Node is an IR node reduced to what a view draws.
type Node struct {
	ID         string      `json:"id"`
	Kind       string      `json:"kind"`
	Parent     string      `json:"parent,omitempty"`
	Module     string      `json:"module,omitempty"`
	Exported   *bool       `json:"exported,omitempty"`
	TypeKind   string      `json:"typeKind,omitempty"`
	Generated  bool        `json:"generated,omitempty"`
	Loc        ir.Location `json:"loc"`
	Decls      int         `json:"decls,omitempty"`      // packages: declarations in the IR
	Unresolved int         `json:"unresolved,omitempty"` // packages: Unresolved Calls
	Detail     bool        `json:"detail,omitempty"`     // packages: declarations and source are in this file
	Status     string      `json:"status,omitempty"`     // Change View only
	MovedFrom  string      `json:"movedFrom,omitempty"`  // Change View: the Move's base id
	Hop        *int        `json:"hop,omitempty"`        // Change View: distance in the Affected Set
}

// Edge is an IR edge with its location count instead of every location.
type Edge struct {
	From   string      `json:"from"`
	To     string      `json:"to"`
	Kind   string      `json:"kind"`
	Count  int         `json:"count"`
	Loc    ir.Location `json:"loc"`
	Status string      `json:"status,omitempty"`
}

// Honesty is what the view is not showing, always displayed in the header.
type Honesty struct {
	ParseErrors       []ir.ParseError `json:"parseErrors"`
	UnresolvedCalls   int             `json:"unresolvedCalls"`
	UnresolvedImports int             `json:"unresolvedImports"`
	Unsupported       map[string]int  `json:"unsupported"`
}

func newView(kind string, doc *ir.IR) *View {
	h := Honesty{ParseErrors: slices.Clone(doc.ParseErrors), Unsupported: map[string]int{}}
	for _, c := range doc.UnresolvedCalls {
		h.UnresolvedCalls += c
	}
	for _, c := range doc.UnresolvedImports {
		h.UnresolvedImports += c
	}
	for k, c := range doc.Unsupported {
		h.Unsupported[k] = c
	}
	if h.ParseErrors == nil {
		h.ParseErrors = []ir.ParseError{}
	}
	return &View{
		Schema: ViewSchema, Kind: kind, Head: doc.Ref,
		Modules: []string{}, Nodes: []Node{}, Edges: []Edge{}, Sources: map[string]string{},
		Honesty: h,
	}
}

func first(l []ir.Location) ir.Location {
	if len(l) == 0 {
		return ir.Location{}
	}
	return l[0]
}

func toNode(n *ir.Node) Node {
	return Node{
		ID: n.ID, Kind: string(n.Kind), Parent: n.Parent, Module: n.Module,
		Exported: n.Exported, TypeKind: n.TypeKind, Generated: n.Generated, Loc: first(n.Locations),
	}
}

func toEdge(e *ir.Edge) Edge {
	return Edge{From: e.From, To: e.To, Kind: string(e.Kind), Count: len(e.Locations), Loc: first(e.Locations)}
}

// sortView puts every list in canonical order so the same input renders the
// same bytes.
func sortView(v *View) {
	slices.Sort(v.Modules)
	slices.SortFunc(v.Nodes, func(a, b Node) int { return cmp.Compare(a.ID, b.ID) })
	slices.SortFunc(v.Edges, func(a, b Edge) int {
		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
	})
	slices.SortFunc(v.Honesty.ParseErrors, func(a, b ir.ParseError) int {
		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Message, b.Message))
	})
}

// Links are URL templates the UI fills with {path} and {line}. Compare is set
// only in a Change View.
type Links struct {
	Blob    string `json:"blob"`
	Compare string `json:"compare,omitempty"`
}
