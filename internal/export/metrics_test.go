package export

import (
	"encoding/json"
	"testing"

	"zu/internal/cover"
	"zu/internal/scan"
)

func span(file string, cc, from, to int) scan.Span {
	return scan.Span{Path: "x/" + file, File: file, CC: cc, Start: scan.Pos{Line: from, Col: 1}, End: scan.Pos{Line: to, Col: 2}}
}

func TestAddMetrics(t *testing.T) {
	v := &View{Nodes: []Node{
		{ID: "m/a", Kind: "package"}, {ID: "m/a.F", Kind: "function"},
		{ID: "m/b", Kind: "package"}, {ID: "m/c", Kind: "package"}, {ID: "m/c.V", Kind: "function"},
		{ID: "m/g", Kind: "package"},
	}}
	gen := scan.Span{Path: "g/gen.go", File: "gen.y", CC: 2, Start: scan.Pos{Line: 200}, End: scan.Pos{Line: 205}}
	lit := scan.Span{Path: "a/a.go", File: "a.go", Start: scan.Pos{Line: 13, Col: 9}, End: scan.Pos{Line: 15, Col: 2}}
	funcs := map[string]scan.Measure{
		"m/a.F": {Pkg: "m/a", Spans: []scan.Span{span("a.go", 3, 3, 9)}},
		"m/a.G": {Pkg: "m/a", Spans: []scan.Span{span("a.go", 1, 11, 11)}}, // no statements: covered
		"m/b.H": {Pkg: "m/b", Spans: []scan.Span{span("b.go", 2, 3, 5)}},   // b.go is not in the profile
		// A build variant scores with the complexity of the body that ran:
		// v_linux.go is not in the profile, so its 5 does not count.
		"m/c.V": {Pkg: "m/c", Spans: []scan.Span{span("v_linux.go", 5, 3, 9), span("v_other.go", 1, 3, 4)}},
		"m/d.I": {Pkg: "m/d", Spans: []scan.Span{span("d.go", 9, 3, 5)}}, // m/d is not drawn (omitted)
		// Generated under //line gen.y:200: the profile keys it by gen.y.
		"m/g.Gen": {Pkg: "m/g", Spans: []scan.Span{gen}},
	}
	// The files the scan parsed; a.go has a package-level var f = func…
	parsed := map[string][]scan.Span{
		"m/a/a.go": {lit}, "m/b/b.go": nil, "m/c/v_linux.go": nil, "m/c/v_other.go": nil,
		"m/d/d.go": nil, "m/g/gen.go": nil, "m/g/gen.y": nil,
	}
	ms := scan.Measures{Funcs: funcs, Files: parsed}
	prof := cover.Profile{
		"m/a/a.go": {
			{Start: cover.Pos{Line: 3, Col: 20}, End: cover.Pos{Line: 4, Col: 9}, Stmts: 1, Hit: true},
			{Start: cover.Pos{Line: 4, Col: 9}, End: cover.Pos{Line: 6, Col: 3}, Stmts: 2},
			{Start: cover.Pos{Line: 13, Col: 20}, End: cover.Pos{Line: 14, Col: 9}, Stmts: 5}, // in the literal
			{Start: cover.Pos{Line: 20, Col: 1}, End: cover.Pos{Line: 20, Col: 9}, Stmts: 1},  // outside all code
		},
		"m/a/new.go":     {{Start: cover.Pos{Line: 3, Col: 1}, End: cover.Pos{Line: 3, Col: 9}, Stmts: 1}}, // a file the scan did not parse
		"m/c/v_other.go": {{Start: cover.Pos{Line: 3, Col: 9}, End: cover.Pos{Line: 4, Col: 1}, Stmts: 1}},
		"m/d/d.go":       {{Start: cover.Pos{Line: 3, Col: 9}, End: cover.Pos{Line: 5, Col: 2}, Stmts: 1}},
		"m/g/gen.y": {
			{Start: cover.Pos{Line: 200}, End: cover.Pos{Line: 201}, Stmts: 1, Hit: true},
			{Start: cover.Pos{Line: 201}, End: cover.Pos{Line: 203}, Stmts: 1, Hit: true},
		},
		"other/x/x.go": {{Start: cover.Pos{Line: 1, Col: 1}, End: cover.Pos{Line: 1, Col: 9}, Stmts: 1}}, // not a scanned package
	}
	unmatched := AddMetrics(v, ms, prof)
	got, _ := json.Marshal(v.Metrics)
	// F: coverage 1/3, CRAP = 3²·(2/3)³ + 3 = 5.67. G: CRAP 1. m/a over
	// {5.67, 1}: μ 3.33, max 5.67, σ 2.33 (population, as class-crap).
	// V: cc 1, uncovered, CRAP 1² + 1 = 2. Gen: covered, CRAP 2.
	want := `{"packages":{"m/a":{"funcs":2,"crap":{"mu":3.3,"max":5.7,"sigma":2.3}},"m/b":{"funcs":1,"missing":1},` +
		`"m/c":{"funcs":1,"crap":{"mu":2,"max":2,"sigma":0}},"m/g":{"funcs":1,"crap":{"mu":2,"max":2,"sigma":0}}},` +
		`"funcs":{"m/a.F":{"cc":3,"stmts":3,"covered":1,"crap":5.7},"m/c.V":{"cc":1,"stmts":1,"covered":0,"crap":2}}}`
	if string(got) != want {
		t.Fatalf("Metrics =\n%s\nwant\n%s", got, want)
	}
	// Only a.go line 20 lies in a parsed file but in no function or
	// literal: what a profile of another revision looks like. new.go and
	// other/x are files the scan did not parse (excluded, build-ignored or
	// elsewhere), so they say nothing about this tree.
	if unmatched != 1 {
		t.Errorf("unmatched = %d, want 1", unmatched)
	}
}

func TestAddMetricsMissingFunctionCRAP(t *testing.T) {
	v := &View{Nodes: []Node{{ID: "m/b", Kind: "package"}, {ID: "m/b.H", Kind: "function"}}}
	ms := scan.Measures{Funcs: map[string]scan.Measure{"m/b.H": {Pkg: "m/b", Spans: []scan.Span{span("b.go", 2, 3, 5), span("b_linux.go", 4, 3, 5)}}}}
	AddMetrics(v, ms, cover.Profile{})
	got, _ := json.Marshal(v.Metrics.Funcs)
	if want := `{"m/b.H":{"cc":4,"stmts":0,"covered":0}}`; string(got) != want {
		t.Fatalf("Funcs = %s, want %s: no crap is no coverage data, and cc the highest variant's", got, want)
	}
}
