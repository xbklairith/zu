package scan

import (
	"go/ast"
	"go/build/constraint"
	"go/parser"
	"go/token"
	"path"

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
	// OtherHashes holds one hash for the file itself (see fileHash) and one
	// per const, var, import or blank (_) declaration; they feed the package
	// hash so such edits count as meaningful.
	OtherHashes []string
	Imports     []importFact
	Calls       []callSite
	Embeds      []embedSite
	Loose       []Span // 08: code no function node holds (see loose)
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
	Shape    string // Hash with the name and receiver type blanked
	Line     int
	CC       int               // functions only (08): cyclomatic complexity
	File     string            // functions only (08): the file name a coverprofile keys it by
	Start    Pos               // functions only (08): func keyword
	End      Pos               // functions only (08): just past the closing brace
	node     ast.Node          // released once hashed
	doc      *ast.CommentGroup // enclosing declaration's doc, for its directives
}

// extractFile parses rel from t and pulls out its facts.
func extractFile(t Tree, rel string) *fileFacts {
	f, _ := (*Cache)(nil).extract(t, rel, false)
	return f
}

// readFailed is the facts of a file t could not read.
func readFailed(rel string, err error) *fileFacts {
	return &fileFacts{Path: rel, Dir: path.Dir(rel), Err: &ir.ParseError{Path: rel, Message: ioMessage(err)}}
}

// extractSource pulls the facts out of src, the content of rel. They depend
// on nothing else, which is what lets a Cache reuse them.
func extractSource(rel string, src []byte) *fileFacts {
	f := &fileFacts{Path: rel, Dir: path.Dir(rel)}
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
	f.PkgLine = fset.PositionFor(file.Package, false).Line
	f.Generated = ast.IsGenerated(file)
	f.addImports(fset, file)
	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			if d.Tok == token.TYPE {
				for _, spec := range d.Specs {
					ts := spec.(*ast.TypeSpec)
					f.addDecl(fset, ts.Name, "", ir.KindType, typeKind(ts), ts)
					f.addEmbeds(fset, ts)
				}
			}
		case *ast.FuncDecl:
			f.addDecl(fset, d.Name, recvBase(d), ir.KindFunction, "", d)
			f.addCalls(fset, d)
		}
	}
	// Hashing strips comments from the AST, so it runs last.
	f.OtherHashes = append(f.OtherHashes, fileHash(file))
	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			if d.Tok != token.TYPE {
				f.OtherHashes = append(f.OtherHashes, hashNode(d))
				continue
			}
			for _, spec := range d.Specs {
				if ts := spec.(*ast.TypeSpec); ts.Name.Name == "_" {
					f.OtherHashes = append(f.OtherHashes, hashNode(ts))
				}
			}
		case *ast.FuncDecl:
			if d.Name.Name == "_" {
				f.OtherHashes = append(f.OtherHashes, hashNode(d))
			}
		}
	}
	for _, decl := range file.Decls {
		f.Loose = append(f.Loose, loose(fset, rel, decl)...)
	}
	for i := range f.Decls {
		d := &f.Decls[i]
		if fn, ok := d.node.(*ast.FuncDecl); ok {
			d.CC = complexity(fn)
			d.File, d.Start = position(fset, fn.Pos())
			_, d.End = position(fset, fn.End())
		}
		d.Hash, d.Shape = hashDecl(d.node, []string{d.Name, d.Recv}, d.doc)
		d.node, d.doc = nil, nil
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
		Line:     fset.PositionFor(name.Pos(), false).Line,
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
