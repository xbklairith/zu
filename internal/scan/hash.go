package scan

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"go/ast"
	"go/build/constraint"
	"go/printer"
	"go/token"
	"strings"
)

// hashNode returns the hex SHA-256 of n printed without comments and without
// its original line breaks, so only a meaningful change alters it. Compiler
// directives in n's comments, and in extra (the enclosing declaration's doc),
// do count. It strips comments from n in place: call it only once the AST is
// otherwise done with.
func hashNode(n ast.Node, extra ...*ast.CommentGroup) string {
	var buf bytes.Buffer
	for _, g := range extra {
		writeDirectives(&buf, g)
	}
	ast.Inspect(n, func(n ast.Node) bool {
		if g, ok := n.(*ast.CommentGroup); ok {
			writeDirectives(&buf, g)
		}
		return true
	})
	stripComments(n)
	// An empty FileSet hides the original positions from the printer, which
	// then lays the code out canonically.
	if err := printer.Fprint(&buf, token.NewFileSet(), n); err != nil {
		// Printing a parsed AST into memory does not fail; fall back to a
		// hash that still changes with the node type.
		buf.Reset()
		buf.WriteString(err.Error())
	}
	return hashBytes(buf.Bytes())
}

func hashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// stripComments removes every comment attached to n or its children.
func stripComments(n ast.Node) {
	ast.Inspect(n, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.FuncDecl:
			x.Doc = nil
		case *ast.GenDecl:
			x.Doc = nil
			if len(x.Specs) == 1 {
				// import "x" and import ("x") mean the same thing.
				x.Lparen, x.Rparen = token.NoPos, token.NoPos
			}
		case *ast.Field:
			x.Doc, x.Comment = nil, nil
		case *ast.TypeSpec:
			x.Doc, x.Comment = nil, nil
		case *ast.ValueSpec:
			x.Doc, x.Comment = nil, nil
		case *ast.ImportSpec:
			x.Doc, x.Comment = nil, nil
		}
		return true
	})
}

// isDirective reports whether c is a line the toolchain acts on: //go:embed,
// //go:linkname, //export and the like. //go:build is hashed separately, in
// normalised form, by fileHash.
func isDirective(c *ast.Comment) bool {
	switch {
	case constraint.IsGoBuild(c.Text):
		return false
	case strings.HasPrefix(c.Text, "//go:"), strings.HasPrefix(c.Text, "//export "):
		return true
	}
	return false
}

func writeDirectives(buf *bytes.Buffer, g *ast.CommentGroup) {
	if g == nil {
		return
	}
	for _, c := range g.List {
		if isDirective(c) {
			buf.WriteString(c.Text)
			buf.WriteByte('\n')
		}
	}
}

// fileHash covers what a file means outside its declarations: the package
// clause, the build constraint, the cgo preamble and every directive line.
// It must run before hashNode strips the comments it reads.
func fileHash(file *ast.File) string {
	var buf bytes.Buffer
	buf.WriteString("package " + file.Name.Name + "\n")
	for _, g := range file.Comments {
		for _, c := range g.List {
			if g.Pos() < file.Package && constraint.IsGoBuild(c.Text) {
				if e, err := constraint.Parse(c.Text); err == nil {
					buf.WriteString("build " + e.String() + "\n")
				} else {
					buf.WriteString("build " + c.Text + "\n")
				}
			}
			if isDirective(c) {
				buf.WriteString(c.Text + "\n")
			}
		}
	}
	for _, decl := range file.Decls {
		d, ok := decl.(*ast.GenDecl)
		if !ok || d.Tok != token.IMPORT {
			continue
		}
		for _, spec := range d.Specs {
			is := spec.(*ast.ImportSpec)
			if is.Path.Value != `"C"` {
				continue
			}
			doc := is.Doc
			if doc == nil && len(d.Specs) == 1 {
				doc = d.Doc
			}
			if doc != nil {
				buf.WriteString("cgo\n")
				for _, c := range doc.List {
					buf.WriteString(c.Text + "\n")
				}
			}
		}
	}
	return hashBytes(buf.Bytes())
}
