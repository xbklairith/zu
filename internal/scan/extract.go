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
	// OtherHashes holds one hash per const, var or import declaration;
	// they feed the package hash so such edits count as meaningful.
	OtherHashes []string
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
	node     ast.Node // released once hashed
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
	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			if d.Tok == token.TYPE {
				for _, spec := range d.Specs {
					ts := spec.(*ast.TypeSpec)
					f.addDecl(fset, ts.Name, "", ir.KindType, typeKind(ts), ts)
				}
			}
		case *ast.FuncDecl:
			f.addDecl(fset, d.Name, recvBase(d), ir.KindFunction, "", d)
		}
	}
	// Hashing strips comments from the AST, so it runs last.
	for _, decl := range file.Decls {
		if d, ok := decl.(*ast.GenDecl); ok && d.Tok != token.TYPE {
			f.OtherHashes = append(f.OtherHashes, hashNode(d))
		}
	}
	for i := range f.Decls {
		f.Decls[i].Hash = hashNode(f.Decls[i].node)
		f.Decls[i].node = nil
	}
	return f
}

func (f *fileFacts) addDecl(fset *token.FileSet, name *ast.Ident, recv string, kind ir.NodeKind, tk string, node ast.Node) {
	if name.Name == "_" {
		return
	}
	f.Decls = append(f.Decls, declFact{
		Name:     name.Name,
		Recv:     recv,
		Kind:     kind,
		Exported: ast.IsExported(name.Name),
		TypeKind: tk,
		Line:     fset.Position(name.Pos()).Line,
		node:     node,
	})
}

// typeKind classifies a type declaration; aliases are always "other".
func typeKind(ts *ast.TypeSpec) string {
	if ts.Assign.IsValid() {
		return ir.TypeOther
	}
	switch ts.Type.(type) {
	case *ast.StructType:
		return ir.TypeStruct
	case *ast.InterfaceType:
		return ir.TypeInterface
	}
	return ir.TypeOther
}

// recvBase returns the receiver's base type name with any pointer and type
// parameters stripped, or "" for a plain function.
func recvBase(d *ast.FuncDecl) string {
	if d.Recv == nil || len(d.Recv.List) == 0 {
		return ""
	}
	return baseTypeName(d.Recv.List[0].Type)
}

func baseTypeName(e ast.Expr) string {
	for {
		switch x := e.(type) {
		case *ast.StarExpr:
			e = x.X
		case *ast.ParenExpr:
			e = x.X
		case *ast.IndexExpr:
			e = x.X
		case *ast.IndexListExpr:
			e = x.X
		case *ast.Ident:
			return x.Name
		default:
			return ""
		}
	}
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
