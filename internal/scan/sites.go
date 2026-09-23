package scan

import (
	"go/ast"
	"go/token"
	"strconv"
)

// importFact is one import spec. Name is the explicit name ("", ".", "_" or
// an alias).
type importFact struct {
	Path string
	Name string
	Line int
}

// callKind is the syntactic shape of a call, judged while the AST and its
// scopes are still available. Resolution against other packages happens later.
type callKind uint8

const (
	callBare      callKind = iota + 1 // F(): F unshadowed, top-level here or in another file
	callQualified                     // x.F(): x unshadowed, an import name or another file's package-level name
	callRecv                          // r.M(): r is the method's own, never-reassigned receiver
	callOther                         // anything else into possibly-repo code: counted, never drawn
)

// callSite is one call inside a function or method body.
type callSite struct {
	FromRecv string // receiver base type of the calling method, or ""
	FromName string
	Kind     callKind
	X        string
	Name     string
	Line     int
}

// embedSite is one embedded type in a struct or interface declaration.
type embedSite struct {
	Owner string
	X     string // package qualifier, or "" for the same package
	Name  string
	Line  int
}

func (f *fileFacts) addImports(fset *token.FileSet, file *ast.File) {
	for _, spec := range file.Imports {
		p, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		imp := importFact{Path: p, Line: fset.Position(spec.Path.Pos()).Line}
		if spec.Name != nil {
			imp.Name = spec.Name.Name
		}
		f.Imports = append(f.Imports, imp)
	}
}

// addCalls records the call sites in a function body. Calls outside function
// bodies (package-level initialisers) have no calling node and are skipped.
func (f *fileFacts) addCalls(fset *token.FileSet, d *ast.FuncDecl) {
	if d.Body == nil || d.Name.Name == "_" {
		return
	}
	from := callSite{FromRecv: recvBase(d), FromName: d.Name.Name}
	recv := receiverObject(d)
	ast.Inspect(d.Body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		s := from
		s.Line = fset.Position(call.Lparen).Line
		if classifyCall(&s, call.Fun, recv) {
			f.Calls = append(f.Calls, s)
		}
		return true
	})
}

// classifyCall fills s from the called expression and reports whether the
// call is recorded at all. Conversions and function literals are not.
func classifyCall(s *callSite, fun ast.Expr, recv *ast.Object) bool { //nolint:staticcheck // SA1019: syntax-only scope resolution, see design "Key decision"
	fun = unwrapInstantiation(fun)
	switch x := fun.(type) {
	case *ast.Ident:
		switch localKind(x) {
		case ast.Bad, ast.Fun: // unresolved in this file, or a top-level func here
			s.Kind, s.Name = callBare, x.Name
		case ast.Typ:
			return false // conversion
		default:
			s.Kind = callOther
		}
	case *ast.SelectorExpr:
		id, ok := x.X.(*ast.Ident)
		switch {
		case !ok:
			s.Kind = callOther
		case localKind(id) == ast.Bad:
			s.Kind, s.X, s.Name = callQualified, id.Name, x.Sel.Name
		case recv != nil && id.Obj == recv:
			s.Kind, s.Name = callRecv, x.Sel.Name
		default:
			s.Kind = callOther
		}
	case *ast.FuncLit, *ast.ArrayType, *ast.MapType, *ast.ChanType, *ast.FuncType,
		*ast.InterfaceType, *ast.StructType, *ast.StarExpr:
		return false // literal call or conversion
	default:
		s.Kind = callOther
	}
	return true
}

func unwrapInstantiation(e ast.Expr) ast.Expr {
	for {
		switch x := e.(type) {
		case *ast.ParenExpr:
			e = x.X
		case *ast.IndexExpr:
			e = x.X
		case *ast.IndexListExpr:
			e = x.X
		default:
			return e
		}
	}
}

// localKind reports what the parser resolved id to within its file: ast.Bad
// when it is not declared in this file (an import name, a builtin, or another
// file's top-level name), otherwise the declared object's kind. This is the
// one place that relies on go/parser's object resolution.
func localKind(id *ast.Ident) ast.ObjKind {
	if id.Obj == nil {
		return ast.Bad
	}
	return id.Obj.Kind
}

// receiverObject returns the receiver's object if the method names it and
// never assigns to it; otherwise nil, so no r.M() call counts as certain.
func receiverObject(d *ast.FuncDecl) *ast.Object { //nolint:staticcheck // SA1019: syntax-only scope resolution, see design "Key decision"
	if d.Recv == nil || len(d.Recv.List) == 0 || len(d.Recv.List[0].Names) == 0 {
		return nil
	}
	obj := d.Recv.List[0].Names[0].Obj
	if obj == nil || d.Body == nil {
		return nil
	}
	reassigned := false
	isRecv := func(e ast.Expr) bool {
		id, ok := e.(*ast.Ident)
		return ok && id.Obj == obj
	}
	ast.Inspect(d.Body, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.AssignStmt:
			for _, l := range x.Lhs {
				if isRecv(l) {
					reassigned = true
				}
			}
		case *ast.IncDecStmt:
			if isRecv(x.X) {
				reassigned = true
			}
		}
		return !reassigned
	})
	if reassigned {
		return nil
	}
	return obj
}

// addEmbeds records embedded types of a top-level struct or interface.
func (f *fileFacts) addEmbeds(fset *token.FileSet, ts *ast.TypeSpec) {
	var fields *ast.FieldList
	switch t := ts.Type.(type) {
	case *ast.StructType:
		fields = t.Fields
	case *ast.InterfaceType:
		fields = t.Methods
	}
	if fields == nil {
		return
	}
	for _, fld := range fields.List {
		if len(fld.Names) > 0 {
			continue
		}
		e := fld.Type
		if s, ok := e.(*ast.StarExpr); ok {
			e = s.X
		}
		e = unwrapInstantiation(e)
		site := embedSite{Owner: ts.Name.Name, Line: fset.Position(fld.Type.Pos()).Line}
		switch x := e.(type) {
		case *ast.Ident:
			site.Name = x.Name
		case *ast.SelectorExpr:
			id, ok := x.X.(*ast.Ident)
			if !ok {
				continue
			}
			site.X, site.Name = id.Name, x.Sel.Name
		default:
			continue // unions, ~T, interface methods' function types
		}
		f.Embeds = append(f.Embeds, site)
	}
}
