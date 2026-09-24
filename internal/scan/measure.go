package scan

import (
	"go/ast"
	"go/token"
	"path/filepath"
)

// Pos is a line and a byte column, both 1-based, as go/token and
// go test -coverprofile write them; the column is 0 where a //line
// directive leaves it unknown.
type Pos struct{ Line, Col int }

// Span is one declaration of a function: the file it is in, the name a
// coverprofile keys that file by, its complexity, and the source it covers
// from func to its closing brace.
type Span struct {
	Path       string // slash path relative to the root
	File       string // base name after any //line directive
	CC         int    // cyclomatic complexity
	Start, End Pos
}

// Measure is what the scan measures of one function or method node (08).
// A node declared in several files (build variants, repeated init) has a
// span for each.
type Measure struct {
	Pkg   string // the package id
	Spans []Span // sorted by path, then start
}

// Measures are what the scan measures for a coverage profile (08). They are
// not part of the IR: the IR carries no metrics (requirements, Metrics
// overlay), and export joins them with a profile.
type Measures struct {
	// Funcs maps a function or method node id to its Measure.
	Funcs map[string]Measure
	// Files maps every file the scan parsed, by the key a profile gives it
	// (package id + "/" + file name after //line), to the spans in it of
	// code no function node holds (see loose).
	Files map[string][]Span
}

// complexity is gocyclo's cyclomatic complexity: 1, plus one per if, for,
// range, non-default case or comm clause, && and ||, closures included.
func complexity(fn *ast.FuncDecl) int {
	cc := 1
	ast.Inspect(fn, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.IfStmt, *ast.ForStmt, *ast.RangeStmt:
			cc++
		case *ast.CaseClause:
			if x.List != nil {
				cc++
			}
		case *ast.CommClause:
			if x.Comm != nil {
				cc++
			}
		case *ast.BinaryExpr:
			if x.Op == token.LAND || x.Op == token.LOR {
				cc++
			}
		}
		return true
	})
	return cc
}

// loose is the code in decl that a coverprofile covers but no function node
// holds: the function literals of a package-level var (a literal nested in
// one is inside its span), and the body of a func _.
func loose(fset *token.FileSet, rel string, decl ast.Decl) []Span {
	var out []Span
	add := func(n ast.Node) {
		s := Span{Path: rel}
		s.File, s.Start = position(fset, n.Pos())
		_, s.End = position(fset, n.End())
		out = append(out, s)
	}
	switch d := decl.(type) {
	case *ast.FuncDecl:
		if d.Name.Name == "_" {
			add(d)
		}
	case *ast.GenDecl:
		ast.Inspect(d, func(n ast.Node) bool {
			if _, ok := n.(*ast.FuncLit); ok {
				add(n)
				return false
			}
			return true
		})
	}
	return out
}

// position is where p is as go test -coverprofile writes it: after any
// //line directive, which names another file and line (generated code) and
// leaves the column unknown, 0. The file is its base name.
func position(fset *token.FileSet, p token.Pos) (string, Pos) {
	at := fset.Position(p)
	return filepath.Base(at.Filename), Pos{at.Line, at.Column}
}
