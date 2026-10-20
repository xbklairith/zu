package export

import (
	"cmp"
	"slices"

	"zu/internal/diff"
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
	// Syntax is each source's colour for the Code panel (19): Syntax(text).
	Syntax  map[string][][]int `json:"syntax,omitempty"`
	Links   *Links             `json:"links,omitempty"`
	Honesty Honesty            `json:"honesty"`
	Changed []string           `json:"changed,omitempty"` // Change View: changed packages, bottom-up
	Hunks   map[string][]Hunk  `json:"hunks,omitempty"`   // Change View: line diffs of changed files
	Policy  *PolicyInfo        `json:"policy,omitempty"`  // only when the Policy has rules, an order or Proposals
	// Violations is the Change View's new, fixed and known violations (07),
	// from the whole Summary zu diff printed.
	Violations *diff.ViolationDelta `json:"violations,omitempty"`
	// Metrics is the CRAP overlay (08), only when zu was given a coverprofile.
	Metrics *Metrics `json:"metrics,omitempty"`
	// Near is a Change View's unchanged neighbours, for the Screen (18).
	Near *Near `json:"near,omitempty"`
}

// Near is what a Change View's Screen draws beside Nodes and Edges (18): the
// unchanged declarations one call or embed from a drawn one, their types and
// every method of a type on the page, with the calls and embeds among them
// all that Edges does not hold. The tree never reads it, so it draws only
// what changed.
type Near struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
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
	Main       bool        `json:"main,omitempty"` // packages (12): package main
	Loc        ir.Location `json:"loc"`
	Decls      int         `json:"decls,omitempty"`      // packages: declarations in the IR
	GenDecls   int         `json:"genDecls,omitempty"`   // packages (12): those of them in generated files
	Unresolved int         `json:"unresolved,omitempty"` // packages: Unresolved Calls
	Detail     bool        `json:"detail,omitempty"`     // packages: declarations and source are in this file
	Status     string      `json:"status,omitempty"`     // Change View only
	MovedFrom  string      `json:"movedFrom,omitempty"`  // Change View: the Move's base id
	Hop        *int        `json:"hop,omitempty"`        // Change View: distance in the Affected Set
	Rank       *int        `json:"rank,omitempty"`       // packages: the Policy Level, 0 = innermost
	Demoted    string      `json:"demoted,omitempty"`    // packages (12): why the first view sets it aside, "name" or "generated"
	OffIn      int         `json:"offIn,omitempty"`      // declarations (17): call sites and embeds into it from declarations not on this page
	OffOut     int         `json:"offOut,omitempty"`     // declarations (17): and out of it to them
}

// Edge is an IR edge with its location count and first location; a call
// or embed keeps the rest too (19), for the Code panel to light.
type Edge struct {
	From  string      `json:"from"`
	To    string      `json:"to"`
	Kind  string      `json:"kind"`
	Count int         `json:"count"`
	Loc   ir.Location `json:"loc"`
	// More is a call's or an embed's locations after Loc, in the IR's order:
	// each its own path, as a declaration in several files calls from each.
	More   []ir.Location `json:"more,omitempty"`
	Status string        `json:"status,omitempty"`
	// Violation is the rule this import breaks ("levels" or "cycle").
	Violation string `json:"violation,omitempty"`
}

// SourceFile is one file as zu serve sends it to the page on demand (19),
// at GET /source: what View.Sources and View.Syntax hold for an inlined one.
type SourceFile struct {
	Path   string  `json:"path"`
	Text   string  `json:"text"`
	Syntax [][]int `json:"syntax"`
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
		Exported: n.Exported, TypeKind: n.TypeKind, Generated: n.Generated, Main: n.Main, Loc: first(n.Locations),
	}
}

func toEdge(e *ir.Edge) Edge {
	ve := Edge{From: e.From, To: e.To, Kind: string(e.Kind), Count: len(e.Locations), Loc: first(e.Locations)}
	if e.Kind != ir.EdgeImports && len(e.Locations) > 1 {
		ve.More = slices.Clone(e.Locations[1:])
	}
	return ve
}

// sortView puts every list in canonical order so the same input renders the
// same bytes.
func sortView(v *View) {
	byID := func(a, b Node) int { return cmp.Compare(a.ID, b.ID) }
	byEnds := func(a, b Edge) int {
		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
	}
	slices.Sort(v.Modules)
	slices.SortFunc(v.Nodes, byID)
	slices.SortFunc(v.Edges, byEnds)
	if v.Near != nil {
		slices.SortFunc(v.Near.Nodes, byID)
		slices.SortFunc(v.Near.Edges, byEnds)
	}
	slices.SortFunc(v.Honesty.ParseErrors, func(a, b ir.ParseError) int {
		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Message, b.Message))
	})
}

// Links are URL templates the UI fills with {path} and {line}. Compare is set
// only in a Change View, as are the rest (14): Base is Blob at the base
// commit, for what the change removed; Files maps each path in Hunks, and
// Nodes each changed declaration, to its place on the compare page.
type Links struct {
	Blob    string            `json:"blob"`
	Compare string            `json:"compare,omitempty"`
	MR      string            `json:"mr,omitempty"` // with -mr (14b): Compare is that merge request's page, and this how the host names it
	Base    string            `json:"base,omitempty"`
	Files   map[string]string `json:"files,omitempty"`
	Nodes   map[string]string `json:"nodes,omitempty"`
}
