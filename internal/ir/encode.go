package ir

import (
	"cmp"
	"encoding/json"
	"io"
	"slices"
)

// Sort puts every list in canonical order and replaces nil collections with
// empty ones, so the same content always encodes to the same bytes.
func Sort(doc *IR) {
	for i := range doc.Nodes {
		sortLocations(doc.Nodes[i].Locations)
		if doc.Nodes[i].Locations == nil {
			doc.Nodes[i].Locations = []Location{}
		}
	}
	for i := range doc.Edges {
		sortLocations(doc.Edges[i].Locations)
		if doc.Edges[i].Locations == nil {
			doc.Edges[i].Locations = []Location{}
		}
	}
	slices.SortFunc(doc.Nodes, func(a, b Node) int { return cmp.Compare(a.ID, b.ID) })
	slices.SortFunc(doc.Edges, func(a, b Edge) int {
		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
	})
	slices.SortFunc(doc.ParseErrors, func(a, b ParseError) int {
		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Message, b.Message))
	})
	if doc.Nodes == nil {
		doc.Nodes = []Node{}
	}
	if doc.Edges == nil {
		doc.Edges = []Edge{}
	}
	if doc.ParseErrors == nil {
		doc.ParseErrors = []ParseError{}
	}
	if doc.UnresolvedCalls == nil {
		doc.UnresolvedCalls = map[string]int{}
	}
	if doc.UnresolvedImports == nil {
		doc.UnresolvedImports = map[string]int{}
	}
	if doc.Unsupported == nil {
		doc.Unsupported = map[string]int{}
	}
}

func sortLocations(l []Location) {
	slices.SortFunc(l, func(a, b Location) int {
		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line))
	})
}

// Encode sorts doc, stamps the schema version, and writes it as two-space
// indented JSON with a trailing newline. Map keys are sorted by encoding/json.
func Encode(w io.Writer, doc *IR) error {
	doc.SchemaVersion = SchemaVersion
	Sort(doc)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	return enc.Encode(doc)
}
