package scan

import (
	"go/ast"
	"go/build/constraint"
	"go/parser"
	"go/token"
	"os"
	"path"
	"path/filepath"

	"zu/internal/ir"
)

// fileFacts is everything later passes need from one file. The AST is gone
// by the time anyone reads it.
type fileFacts struct {
	Path      string // slash path relative to the root
	Dir       string // path.Dir(Path)
	Skip      bool   // excluded by //go:build ignore
	Err       *ir.ParseError
	PkgName   string
	PkgLine   int
	Generated bool
	Decls     []declFact
}

// declFact is one type, function or method declaration. Ids are formed
// later, once the package import path is known.
type declFact struct {
	Name     string
	Recv     string // receiver base type name; empty for types and functions
	Kind     ir.NodeKind
	Exported bool
	TypeKind string // types only
	Hash     string
	Line     int
}

// extractFile parses root/rel and pulls out its facts.
func extractFile(root, rel string) *fileFacts {
	f := &fileFacts{Path: rel, Dir: path.Dir(rel)}
	src, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel))) // #nosec G304 -- rel comes from walk
	if err != nil {
		f.Err = &ir.ParseError{Path: rel, Message: unwrapPath(err).Error()}
		return f
	}
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, rel, src, parser.ParseComments)
	if err != nil {
		f.Err = &ir.ParseError{Path: rel, Message: err.Error()}
		return f
	}
	if buildIgnored(file) {
		f.Skip = true
		return f
	}
	f.PkgName = file.Name.Name
	f.PkgLine = fset.Position(file.Package).Line
	f.Generated = ast.IsGenerated(file)
	return f
}

// buildIgnored reports whether the file's //go:build line is the tag ignore
// itself or an && that requires it. Other constraints are ignored: every
// build variant is scanned.
func buildIgnored(file *ast.File) bool {
	for _, g := range file.Comments {
		if g.Pos() >= file.Package {
			break
		}
		for _, c := range g.List {
			if !constraint.IsGoBuild(c.Text) {
				continue
			}
			expr, err := constraint.Parse(c.Text)
			if err != nil {
				return false
			}
			return requiresIgnore(expr)
		}
	}
	return false
}

func requiresIgnore(e constraint.Expr) bool {
	switch e := e.(type) {
	case *constraint.TagExpr:
		return e.Tag == "ignore"
	case *constraint.AndExpr:
		return requiresIgnore(e.X) || requiresIgnore(e.Y)
	}
	return false
}
