package policy

import (
	"slices"
	"strings"
	"testing"
)

func TestSuggestRanksModulesWhenThereAreSeveral(t *testing.T) {
	doc := graph([]string{"m/a@m", "m/b@m", "n/c@n"}, "n/c>m/a")
	if got := Suggest(doc); !slices.EqualFunc(got, []Level{{"m"}, {"n"}}, slices.Equal) {
		t.Fatalf("Suggest = %v", got)
	}
}

func TestSuggestRanksTheFirstBranchingBoxesByImports(t *testing.T) {
	// m/internal is the only child of m, so the candidates are its children.
	doc := graph([]string{
		"m/internal/dom@m", "m/internal/dom/model@m", "m/internal/app@m", "m/internal/cli@m",
		"m/internal/x@m", "m/internal/y@m",
	},
		"m/internal/app>m/internal/dom/model", "m/internal/cli>m/internal/app", "m/internal/cli>m/internal/dom",
		"m/internal/x>m/internal/y", "m/internal/y>m/internal/x", "m/internal/x>m/internal/app", // x ⇄ y share a level
	)
	got := Suggest(doc)
	want := []Level{
		{"m/internal/dom"},
		{"m/internal/app"},
		{"m/internal/cli", "m/internal/x", "m/internal/y"},
	}
	if !slices.EqualFunc(got, want, slices.Equal) {
		t.Fatalf("Suggest = %v, want %v", got, want)
	}
}

func TestInitFileParsesAndHoldsAsWritten(t *testing.T) {
	doc := graph([]string{"m/a@m", "m/b@m", "n/c@n"}, "m/a>m/b", "n/c>m/a")
	levels := Suggest(doc)
	src := InitFile(levels, "abc123")
	p, err := Parse(src)
	if err != nil {
		t.Fatalf("%v\n%s", err, src)
	}
	if !slices.EqualFunc(levels, p.Levels, slices.Equal) {
		t.Fatalf("levels %v round-tripped as %v", levels, p.Levels)
	}
	if err := p.Validate(doc); err != nil {
		t.Fatal(err)
	}
	if vs := p.Check(doc); len(vs) != 0 {
		t.Fatalf("the suggestion must hold as written, got %v", vs)
	}
	if !strings.Contains(string(src), "abc123") || !strings.Contains(string(src), "# exclude:") {
		t.Errorf("header or exclude hint missing:\n%s", src)
	}
}

func TestInitFileWithNoLayering(t *testing.T) {
	p, err := Parse(InitFile(nil, ""))
	if err != nil || p.Rules() {
		t.Fatalf("no candidates: %+v, %v", p, err)
	}
}
