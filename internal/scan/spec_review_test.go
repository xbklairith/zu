package scan

import (
	"errors"
	"io/fs"
	"strings"
	"testing"

	"zu/internal/ir"
)

// Regression tests for gaps found in the feature 01 spec review.

func TestCollidingIDsAreReportedAndDropped(t *testing.T) {
	// Package m/a.b (directory a.b) and type b in package m/a both have id
	// m/a.b; method b.M and function M of package m/a.b both have m/a.b.M.
	doc := scanTree(t, map[string]string{
		"go.mod":   "module m\n",
		"a/a.go":   "package a\n\ntype b struct{}\n\nfunc (b) M() {}\n\nfunc G() { b{}.M() }\n",
		"a.b/x.go": "package x\n\nfunc M() { N() }\n\nfunc N() {}\n",
	})
	if n := node(doc, "m/a.b"); n.Kind != ir.KindPackage {
		t.Fatalf("m/a.b kind = %q, want the package to survive", n.Kind)
	}
	for _, n := range doc.Nodes {
		if n.ID == "m/a.b.M" {
			t.Fatalf("colliding id m/a.b.M kept: %+v", n)
		}
	}
	for _, e := range doc.Edges {
		if e.From == "m/a.b.M" || e.To == "m/a.b.M" {
			t.Fatalf("edge references a dropped id: %+v", e)
		}
	}
	var msgs []string
	for _, pe := range doc.ParseErrors {
		msgs = append(msgs, pe.Path+": "+pe.Message)
	}
	got := strings.Join(msgs, "\n")
	for _, want := range []string{`a/a.go: node id "m/a.b" `, `a.b/x.go: node id "m/a.b.M" `} {
		if !strings.Contains(got, want) {
			t.Errorf("parse errors missing %q; got\n%s", want, got)
		}
	}
	if len(doc.ParseErrors) != 2 {
		t.Errorf("want one error per colliding id, got\n%s", got)
	}
}

func TestMalformedGoModIsABoundary(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod":     "module m\n",
		"sub/go.mod": "module m/sub\nrequire (\n",
		"sub/p.go":   "package sub\n",
		"q/q.go":     "package q\n",
	})
	if len(doc.ParseErrors) != 1 || doc.ParseErrors[0].Path != "sub/go.mod" {
		t.Fatalf("want exactly one error, for sub/go.mod; got %+v", doc.ParseErrors)
	}
	for _, n := range doc.Nodes {
		if strings.HasPrefix(n.ID, "m/sub") {
			t.Fatalf("files behind a malformed go.mod were scanned: %s", n.ID)
		}
	}
	node(doc, "m/q")
}

func TestRootWithoutAnyGoModIsAnError(t *testing.T) {
	root := tree(t, map[string]string{"a/a.go": "package a\n"})
	if _, err := walk(root); !errors.Is(err, ErrNoModule) {
		t.Fatalf("err = %v, want ErrNoModule", err)
	}
	if _, err := walk(tree(t, map[string]string{"README.md": "x"})); err != nil {
		t.Fatalf("a root without Go files is fine, got %v", err)
	}
}

type accessDenied struct{}

func (accessDenied) Error() string        { return "Access is denied." }
func (accessDenied) Is(target error) bool { return target == fs.ErrPermission }

func TestIOErrorMessagesAreOSIndependent(t *testing.T) {
	err := &fs.PathError{Op: "open", Path: "/abs/x.go", Err: accessDenied{}}
	if got := ioMessage(err); got != "permission denied" {
		t.Fatalf("ioMessage = %q, want %q", got, "permission denied")
	}
}
