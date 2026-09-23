package scan

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"go/ast"
	"go/printer"
	"go/token"
)

// hashNode returns the hex SHA-256 of n printed without comments and without
// its original line breaks, so only a meaningful change alters it. It strips
// comments from n in place: call it only once the AST is otherwise done with.
func hashNode(n ast.Node) string {
	stripComments(n)
	var buf bytes.Buffer
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
