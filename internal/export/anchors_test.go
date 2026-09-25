package export

import (
	"encoding/json"
	"maps"
	"math"
	"os"
	"strconv"
	"strings"
	"testing"

	"zu/internal/ir"
	"zu/internal/scan"
)

// hunk: base lines 1-4, head lines 1-5 of
//
//	 package a          1 1
//	-func F() int { 1 } 2
//	+func F() int { 2 }   2
//	 func G() {}        3 3
//	+func H() {}          4
//	 // end            4 5
var fileHunks = []Hunk{{BaseStart: 1, BaseLines: 4, HeadStart: 1, HeadLines: 5, Lines: []string{
	" package a", "-func F() int { 1 }", "+func F() int { 2 }", " func G() {}", "+func H() {}", " // end",
}}}

func TestFirstChange(t *testing.T) {
	cases := []struct {
		name        string
		line, until int
		base        bool
		want        change // zero: none
	}{
		{"modified at its first line: the new text", 2, 3, false, change{'+', 3, 2}},
		{"replaced lines give the new text", 1, 3, false, change{'+', 3, 2}},
		{"added", 4, math.MaxInt, false, change{'+', 4, 4}},
		{"removed, base side", 2, math.MaxInt, true, change{'-', 2, 2}},
		{"nothing in range", 3, 4, false, change{}},
		{"past the end", 6, math.MaxInt, false, change{}},
	}
	for _, c := range cases {
		if got, _ := firstChange(fileHunks, c.line, c.until, c.base); got != c.want {
			t.Errorf("%s: %+v, want %+v", c.name, got, c.want)
		}
	}
}

// renamed is a/r.go moved to b/r.go with its package clause edited, as
// git diff -M gives it: one hunk at the top, and one where Gone was.
var renamed = HostFile{Path: "b/r.go", OldPath: "a/r.go", Hunks: []Hunk{
	{BaseStart: 1, BaseLines: 3, HeadStart: 1, HeadLines: 3, Lines: []string{"-package a", "+package b", " ", " func M1() {}"}},
	{BaseStart: 30, BaseLines: 1, HeadStart: 29, HeadLines: 0, Lines: []string{"-func Gone() {}"}},
}}

// The host's files for the Change View below: a/a.go edited in place, a/gone.go
// deleted, and the rename.
var hostFiles = []HostFile{
	{Path: "a/a.go", OldPath: "a/a.go", Hunks: fileHunks},
	{OldPath: "a/gone.go", Hunks: []Hunk{{BaseStart: 1, BaseLines: 3, Lines: []string{"-package a", "-", "-func Z() {}"}}}},
	renamed,
}

// movedSpans are the moved functions' measured spans in b/r.go, as zu diff
// passes head's: M2 ends before the lines git shows Gone removed from.
var movedSpans = scan.Measures{Funcs: map[string]scan.Measure{
	"m/b.M1": {Spans: []scan.Span{{Path: "b/r.go", Start: scan.Pos{Line: 3, Col: 1}, End: scan.Pos{Line: 3, Col: 14}}}},
	"m/b.M2": {Spans: []scan.Span{{Path: "b/r.go", Start: scan.Pos{Line: 21, Col: 1}, End: scan.Pos{Line: 23, Col: 2}}}},
}}

// One file with a modified, an added and a removed declaration; a file the
// change deleted; a renamed file with moved, generated and removed
// declarations; on GitHub and GitLab; and every case with no links.
func TestDiffLinks(t *testing.T) {
	const b, h = "bbbb", "hhhh"
	view := func(head ir.Ref) *View {
		return &View{
			Kind: "change", Base: &ir.Ref{Commit: b}, Head: head,
			Nodes: []Node{
				{ID: "m/a", Kind: "package", Status: "modified", Loc: ir.Location{Path: "a/a.go", Line: 1}},
				{ID: "m/a.F", Kind: "function", Status: "modified", Loc: ir.Location{Path: "a/a.go", Line: 2}},
				{ID: "m/a.G", Kind: "function", Loc: ir.Location{Path: "a/a.go", Line: 3}}, // unchanged, drawn as a parent
				{ID: "m/a.H", Kind: "function", Status: "added", Loc: ir.Location{Path: "a/a.go", Line: 4}},
				{ID: "m/a.Old", Kind: "function", Status: "removed", Loc: ir.Location{Path: "a/a.go", Line: 2}},
				{ID: "m/a.Z", Kind: "function", Status: "removed", Loc: ir.Location{Path: "a/gone.go", Line: 3}},
				{ID: "m/b.X", Kind: "function", Status: "modified", Loc: ir.Location{Path: "b/b.go", Line: 9}}, // not in the host's diff
				// The rename: moved declarations whose lines git does not show
				// as changed, a generated one, and one removed on the way.
				{ID: "m/b.Gen", Kind: "type", Status: "modified", Generated: true, Loc: ir.Location{Path: "b/r.go", Line: 1}},
				{ID: "m/b.M1", Kind: "function", MovedFrom: "m/a.M1", Loc: ir.Location{Path: "b/r.go", Line: 3}},
				{ID: "m/b.M2", Kind: "function", MovedFrom: "m/a.M2", Loc: ir.Location{Path: "b/r.go", Line: 21}},
				{ID: "m/a.Gone", Kind: "function", Status: "removed", Loc: ir.Location{Path: "a/r.go", Line: 30}},
			},
			// zu's own hunks, which pair files by path: the rename is two.
			Hunks: map[string][]Hunk{
				"a/a.go": fileHunks, "a/gone.go": hostFiles[1].Hunks,
				"a/r.go": {{BaseStart: 1, BaseLines: 1, Lines: []string{"-package a"}}},
				"b/r.go": {{HeadStart: 1, HeadLines: 1, Lines: []string{"+package b"}}},
			},
		}
	}
	// printf %s PATH | shasum -a 256 (GitHub) and -a 1 (GitLab)
	const (
		gh       = "https://github.com/o/r/compare/bbbb...hhhh#diff-"
		ghFile   = gh + "6f0e76217f46bde75131273709c148632e8120c9be0617a825f09640d38454a5"
		ghGone   = gh + "c46f4fd109577125d53ceee7616c779aa32f745078a742e4e173fe7f80fb3b7b"
		ghRen    = gh + "3f12eeb4a0c446696b23b7a71cdaf971fb74608e7d40e8824af182dce37bc86f" // b/r.go, the new path
		gl       = "https://gitlab.com/g/r/-/compare/bbbb...hhhh?file_path="
		glFile   = gl + "a%2Fa.go#cfb4ad65a271be152f896011f6f2a5ce741005b5"
		glGone   = gl + "a%2Fgone.go#86ec06dfaa62ad90d9df7920abf4a3f1a4dd06b9"
		glLine   = gl + "a%2Fa.go#line_cfb4ad65a_" // the first 9 hex of a/a.go's SHA-1
		glRen    = gl + "b%2Fr.go#b7d3b0a22b1c18c2fbcf0471a7716a2f71ed1a6f"
		glRenLin = gl + "b%2Fr.go#line_b7d3b0a22_"
	)
	for _, c := range []struct {
		origin string
		files  map[string]string
		nodes  map[string]string
	}{
		{"git@github.com:o/r.git",
			map[string]string{"a/a.go": ghFile, "a/gone.go": ghGone, "b/r.go": ghRen},
			map[string]string{
				"m/a.F": ghFile + "R2", "m/a.H": ghFile + "R4", "m/a.Old": ghFile + "L2", "m/a.Z": ghGone,
				"m/b.Gen": ghRen, "m/b.M1": ghRen, "m/b.M2": ghRen, "m/a.Gone": ghRen + "L30",
			}},
		{"https://gitlab.com/g/r.git",
			map[string]string{"a/a.go": glFile, "a/gone.go": glGone, "b/r.go": glRen},
			map[string]string{
				"m/a.F": glLine + "A2", "m/a.H": glLine + "A4", "m/a.Old": glLine + "2", "m/a.Z": glGone,
				"m/b.Gen": glRen, "m/b.M1": glRen, "m/b.M2": glRen, "m/a.Gone": glRenLin + "30",
			}},
	} {
		v := view(ir.Ref{Commit: h})
		DiffLinks(v, c.origin, hostFiles, movedSpans)
		if v.Links == nil {
			t.Fatalf("%s: no links", c.origin)
		}
		if !maps.Equal(v.Links.Files, c.files) {
			t.Errorf("%s: files = %v, want %v", c.origin, v.Links.Files, c.files)
		}
		if !maps.Equal(v.Links.Nodes, c.nodes) {
			t.Errorf("%s: nodes = %v, want %v", c.origin, v.Links.Nodes, c.nodes)
		}
	}
	for name, c := range map[string]struct {
		origin string
		head   ir.Ref
		files  []HostFile
	}{
		"dirty head":   {"git@github.com:o/r.git", ir.Ref{Commit: h, Dirty: true}, hostFiles},
		"unknown host": {"git@example.com:o/r.git", ir.Ref{Commit: h}, hostFiles},
		"no origin":    {"", ir.Ref{Commit: h}, hostFiles},
		"no host diff": {"git@github.com:o/r.git", ir.Ref{Commit: h}, nil},
	} {
		v := view(c.head)
		DiffLinks(v, c.origin, c.files, scan.Measures{})
		if v.Links != nil {
			t.Errorf("%s: links %+v", name, v.Links)
		}
	}
}

// A function's measured span bounds its search: G ends at line 3, so the
// line H added at 4 is not G's, although nothing drawn lies between them.
func TestDiffLinksKeepToAFunctionsSpan(t *testing.T) {
	v := &View{
		Kind: "change", Base: &ir.Ref{Commit: "bbbb"}, Head: ir.Ref{Commit: "hhhh"},
		Nodes: []Node{{ID: "m/a.G", Kind: "function", Status: "modified", Loc: ir.Location{Path: "a/a.go", Line: 3}}},
		Hunks: map[string][]Hunk{"a/a.go": fileHunks},
	}
	const file = "https://github.com/o/r/compare/bbbb...hhhh#diff-6f0e76217f46bde75131273709c148632e8120c9be0617a825f09640d38454a5"
	DiffLinks(v, "git@github.com:o/r.git", hostFiles[:1], scan.Measures{})
	if got := v.Links.Nodes["m/a.G"]; got != file+"R4" {
		t.Fatalf("unmeasured: %q, want the next change, R4", got)
	}
	ms := scan.Measures{Funcs: map[string]scan.Measure{"m/a.G": {Spans: []scan.Span{
		{Path: "a/a.go", Start: scan.Pos{Line: 3, Col: 1}, End: scan.Pos{Line: 3, Col: 12}},
	}}}}
	v.Links = nil
	DiffLinks(v, "git@github.com:o/r.git", hostFiles[:1], ms)
	if got := v.Links.Nodes["m/a.G"]; got != file {
		t.Errorf("measured: %q, want the file", got)
	}
}

// On the shop Change View every changed declaration links to a line its
// file's hunks mark changed on its own side: R to a '+', L to a '-'.
func TestDiffLinksOnShop(t *testing.T) {
	b, err := os.ReadFile("testdata/shop.change.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var v View
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	// The shop's change renames nothing, so zu's hunks are the host's.
	var files []HostFile
	for p, hs := range v.Hunks {
		files = append(files, HostFile{Path: p, OldPath: p, Hunks: hs})
	}
	DiffLinks(&v, "git@github.com:o/r.git", files, scan.Measures{})
	marked := func(path string, side byte, line int) bool {
		for _, h := range v.Hunks[path] {
			for _, c := range changes(h) {
				if c.kind == side && (side == '+' && c.head == line || side == '-' && c.base == line) {
					return true
				}
			}
		}
		return false
	}
	for _, n := range v.Nodes {
		if n.Kind == "package" || n.Status == "" && n.MovedFrom == "" {
			continue
		}
		link := v.Links.Nodes[n.ID]
		i := strings.LastIndexAny(link, "RL") // GitHub's R or L and the line
		line, err := strconv.Atoi(link[i+1:])
		if err != nil || !strings.HasPrefix(link, v.Links.Files[n.Loc.Path]) {
			t.Errorf("%s: link %q", n.ID, link)
			continue
		}
		side := byte('+')
		if link[i] == 'L' {
			side = '-'
		}
		if !marked(n.Loc.Path, side, line) || side == '+' && line < n.Loc.Line {
			t.Errorf("%s at %s:%d: %s%d is not a changed line at or after it", n.ID, n.Loc.Path, n.Loc.Line, link[i:i+1], line)
		}
		t.Logf("%s %s:%d → %s", n.ID, n.Loc.Path, n.Loc.Line, link[strings.Index(link, "#"):])
	}
}

// Hosted is whether zu links into origin's host on its own: GitHub and
// GitLab, under any remote URL form.
func TestHosted(t *testing.T) {
	for origin, want := range map[string]bool{
		"git@github.com:o/r.git":         true,
		"https://gitlab.com/g/sub/r.git": true,
		"ssh://git@github.com/o/r":       true,
		"git@bitbucket.org:o/r.git":      false,
		"https://git.example.com/o/r":    false,
		"":                               false,
	} {
		if got := Hosted(origin); got != want {
			t.Errorf("Hosted(%q) = %v, want %v", origin, got, want)
		}
	}
}
