package export

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"slices"
	"strings"

	"zu/internal/diff"
	"zu/internal/ir"
	"zu/internal/scan"
)

// DeclDiff is a changed declaration's own diff (20): its whole text at Base,
// from its doc comment to its last line, against its whole text at head. A
// removed declaration has no HeadPath and every line "-"; a Move's Base side
// is its source's. It numbers its lines as Hunk does, from BaseStart in
// BasePath and HeadStart in HeadPath.
type DeclDiff struct {
	BasePath string `json:"basePath,omitempty"`
	HeadPath string `json:"headPath,omitempty"`
	Hunk
}

// declSpan is where a declaration is written in a file: its name's line, and
// its first and last lines, the first being its doc comment's when it has one.
type declSpan struct {
	name              string
	line, first, last int
}

// declSpans finds each function, method and type src declares, by the
// file's own lines, as the scan's are, whatever a //line directive says. A
// type in a group spans its spec; a lone type, its whole declaration. A file
// that does not parse gives none.
func declSpans(src []byte) []declSpan {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "", src, parser.ParseComments|parser.SkipObjectResolution)
	if err != nil {
		return nil
	}
	line := func(p token.Pos) int { return fset.PositionFor(p, false).Line }
	var out []declSpan
	add := func(name *ast.Ident, doc *ast.CommentGroup, from, to token.Pos) {
		if doc != nil {
			from = doc.Pos()
		}
		out = append(out, declSpan{name: name.Name, line: line(name.Pos()), first: line(from), last: line(to - 1)})
	}
	for _, d := range f.Decls {
		switch d := d.(type) {
		case *ast.FuncDecl:
			add(d.Name, d.Doc, d.Pos(), d.End())
		case *ast.GenDecl:
			if d.Tok != token.TYPE {
				continue
			}
			for _, s := range d.Specs {
				ts := s.(*ast.TypeSpec)
				if d.Lparen.IsValid() {
					add(ts.Name, ts.Doc, ts.Pos(), ts.End())
				} else {
					add(ts.Name, d.Doc, d.Pos(), d.End())
				}
			}
		}
	}
	return out
}

// side is one tree of a change with each file read once (20): what the scan
// did not list, or a checkout has deleted since (16), reads as empty.
type side struct {
	name   string // "base" or "head", for errors
	tree   scan.Tree
	list   []string // the scan's listing, read at the first file
	listed bool
	files  map[string]*sideFile
}

// sideFile is one file of a side: its text, cut into lines as Syntax cuts them,
// and, once asked for, its colour and its declarations' spans.
type sideFile struct {
	text   []byte
	lines  []string
	syntax [][]int
	spans  []declSpan
	parsed bool
}

func newSide(name string, t scan.Tree) *side {
	return &side{name: name, tree: t, files: map[string]*sideFile{}}
}

// keep gives the side a file it has already read, with its colour: the head
// files the View inlines.
func (s *side) keep(p string, text []byte, syntax [][]int) {
	s.files[p] = &sideFile{text: text, lines: strings.Split(string(text), "\n"), syntax: syntax}
}

func (s *side) file(p string) (*sideFile, error) {
	if f, ok := s.files[p]; ok {
		return f, nil
	}
	if !filepath.IsLocal(filepath.FromSlash(p)) {
		return nil, fmt.Errorf("source path %q is outside the repository", p)
	}
	if !s.listed {
		list, _, err := s.tree.Files()
		if err != nil {
			return nil, fmt.Errorf("list %s files: %w", s.name, err)
		}
		s.list, s.listed = list, true
	}
	var b []byte
	if _, ok := slices.BinarySearch(s.list, p); ok {
		var err error
		if b, err = s.tree.ReadFile(p); errors.Is(err, fs.ErrNotExist) {
			b = nil
		} else if err != nil {
			return nil, fmt.Errorf("read %s %s: %w", s.name, p, err)
		}
	}
	s.keep(p, b, nil)
	return s.files[p], nil
}

func (f *sideFile) colour() [][]int {
	if f.syntax == nil {
		f.syntax = Syntax(f.text)
	}
	return f.syntax
}

// at is the span of the declaration named name whose name is on line.
func (f *sideFile) at(name string, line int) (declSpan, bool) {
	if !f.parsed {
		f.spans, f.parsed = declSpans(f.text), true
	}
	i := slices.IndexFunc(f.spans, func(s declSpan) bool { return s.line == line && s.name == name })
	if i < 0 {
		return declSpan{}, false
	}
	return f.spans[i], true
}

// written is one place a declaration is written: its file, path and span.
type written struct {
	path string
	f    *sideFile
	declSpan
}

func (t *written) lines() []string {
	if t == nil {
		return nil
	}
	return t.f.lines[t.first-1 : t.last]
}

// textsOf is each place n is written on s, or false when one is not where
// the IR says (a file that no longer parses).
func textsOf(s *side, n *ir.Node) ([]*written, bool, error) {
	if n == nil {
		return nil, true, nil
	}
	name := strings.TrimPrefix(n.ID, n.Parent+".")
	var out []*written
	for _, l := range n.Locations {
		f, err := s.file(l.Path)
		if err != nil {
			return nil, false, err
		}
		sp, ok := f.at(name, l.Line)
		if !ok {
			return nil, false, nil
		}
		out = append(out, &written{l.Path, f, sp})
	}
	return out, true, nil
}

// pair matches a declaration's texts at Base with its texts at head: each
// with an equal text, in its own file before another (a text the change kept,
// or moved), then with a text in its file, in order, then the rest in order.
// A text left over pairs with nil. Pairs follow Base's order, then head's
// texts left over.
func pair(base, head []*written) [][2]*written {
	partner := make([]int, len(base))
	for i := range partner {
		partner[i] = -1
	}
	used := make([]bool, len(head))
	// match pairs each Base text still alone with the first head text left
	// that ok takes.
	match := func(ok func(b, h *written) bool) {
		for i, b := range base {
			for k, h := range head {
				if partner[i] < 0 && !used[k] && ok(b, h) {
					partner[i], used[k] = k, true
				}
			}
		}
	}
	equal := func(b, h *written) bool { return slices.Equal(b.lines(), h.lines()) }
	match(func(b, h *written) bool { return b.path == h.path && equal(b, h) })
	match(equal)
	match(func(b, h *written) bool { return b.path == h.path })
	match(func(_, _ *written) bool { return true })
	var out [][2]*written
	for i, b := range base {
		p := [2]*written{b, nil}
		if partner[i] >= 0 {
			p[1] = head[partner[i]]
		}
		out = append(out, p)
	}
	for k, h := range head {
		if !used[k] {
			out = append(out, [2]*written{nil, h})
		}
	}
	return out
}

// declDiffs gives each drawn declaration the change modified, removed or
// moved the diff of each of its texts the change did not keep (20). An added
// declaration has none: its text is head's, which the Code panel shows (19).
func declDiffs(v *View, baseByID, headByID map[string]*ir.Node, bs, hs *side) (map[string][]DeclDiff, error) {
	out := map[string][]DeclDiff{}
	for _, n := range v.Nodes {
		var b, h *ir.Node
		switch {
		case n.Kind != string(ir.KindType) && n.Kind != string(ir.KindFunction):
			continue
		case n.MovedFrom != "":
			b, h = baseByID[n.MovedFrom], headByID[n.ID]
		case n.Status == string(diff.Modified):
			b, h = baseByID[n.ID], headByID[n.ID]
		case n.Status == string(diff.Removed):
			b = baseByID[n.ID]
		default:
			continue
		}
		bt, bok, err := textsOf(bs, b)
		if err != nil {
			return nil, err
		}
		ht, hok, err := textsOf(hs, h)
		if err != nil {
			return nil, err
		}
		if !bok || !hok {
			continue
		}
		for _, p := range pair(bt, ht) {
			if p[0] != nil && p[1] != nil && slices.Equal(p[0].lines(), p[1].lines()) {
				continue
			}
			out[n.ID] = append(out[n.ID], declDiff(p[0], p[1]))
		}
	}
	return out, nil
}

func declDiff(b, h *written) DeclDiff {
	ops := edits(b.lines(), h.lines())
	d := DeclDiff{Hunk: hunkOf(ops, 0, len(ops))}
	var baseRuns, headRuns [][]int
	if b != nil {
		d.BasePath, d.BaseStart, baseRuns = b.path, b.first, b.f.colour()
	}
	if h != nil {
		d.HeadPath, d.HeadStart, headRuns = h.path, h.first, h.f.colour()
	}
	colour(&d.Hunk, baseRuns, headRuns)
	return d
}

// colour gives each line of h its runs (Syntax) in its side's file: a "-"
// line Base's, the others head's.
func colour(h *Hunk, base, head [][]int) {
	runs := func(r [][]int, n int) []int {
		if n >= 1 && n <= len(r) {
			return r[n-1]
		}
		return []int{}
	}
	b, hd := h.BaseStart, h.HeadStart
	h.Syntax = make([][]int, len(h.Lines))
	for i, l := range h.Lines {
		switch l[0] {
		case '-':
			h.Syntax[i] = runs(base, b)
			b++
		case '+':
			h.Syntax[i] = runs(head, hd)
			hd++
		default:
			h.Syntax[i] = runs(head, hd)
			b, hd = b+1, hd+1
		}
	}
}
