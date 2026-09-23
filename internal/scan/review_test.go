package scan

import (
	"reflect"
	"testing"

	"zu/internal/ir"
)

// Regression tests for defects found in the feature 01 code review.

func TestReceiverTypeParameterIsNotACall(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"p/a.go": "package p\n\nfunc F(int) {}\n",
		"p/b.go": "package p\n\ntype L[F any] struct{}\n\nfunc (l *L[F]) M() { _ = F(0) }\n",
	})
	if got := edgesOf(doc, ir.EdgeCalls); len(got) != 0 {
		t.Fatalf("conversion to a receiver type parameter became a call edge: %+v", got)
	}
}

func TestSingleSpecParenthesesDoNotChangeHash(t *testing.T) {
	h := func(src string) []string { return extractOne(t, src).OtherHashes }
	if !reflect.DeepEqual(h("package p\n\nimport \"fmt\"\n\nvar _ = fmt.Sprint\n"),
		h("package p\n\nimport (\n\t\"fmt\"\n)\n\nvar (\n\t_ = fmt.Sprint\n)\n")) {
		t.Fatal("regrouping a single import or var into parentheses changed the hash")
	}
}

func TestRepeatedCallOnOneLineHasOneLocation(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"p/a.go": "package p\n\nfunc h() {}\n\nfunc G() { h(); h() }\n",
	})
	for _, e := range doc.Edges {
		if e.To == "example.com/m/p.h" && len(e.Locations) != 1 {
			t.Fatalf("locations = %+v, want one", e.Locations)
		}
	}
}

func TestCallThroughDereferencedFuncPointerIsCounted(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"p/a.go": "package p\n\nfunc G(fp *func()) { (*fp)() }\n",
	})
	if doc.UnresolvedCalls["example.com/m/p"] != 1 {
		t.Fatalf("UnresolvedCalls = %v, want 1", doc.UnresolvedCalls)
	}
}

func TestRequiredModuleUnderOwnPathIsExternal(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod": "module github.com/o/r\n\nrequire github.com/o/r/v2 v2.0.0\n",
		"a.go":   "package r\n\nimport \"github.com/o/r/v2/x\"\n",
	})
	want := []edgeKey{{"github.com/o/r", "github.com/o/r/v2", ir.EdgeImports}}
	if got := edgesOf(doc, ir.EdgeImports); !reflect.DeepEqual(got, want) {
		t.Fatalf("imports = %+v, want %+v (unresolved: %v)", got, want, doc.UnresolvedImports)
	}
}

func TestRangeAssignToReceiverCountsAsReassignment(t *testing.T) {
	f := extractOne(t, "package p\n\ntype T struct{}\n\nfunc (t *T) M(xs []*T) {\n\tfor _, t = range xs {\n\t}\n\tt.N()\n}\n\nfunc (t *T) N() {}\n")
	for _, c := range f.Calls {
		if c.Kind == callRecv {
			t.Fatalf("receiver reassigned by range must not give a certain call: %+v", c)
		}
	}
}

func TestMeaningfulChangesOutsideDeclarationsChangePackageHash(t *testing.T) {
	pkgHash := func(files map[string]string) string {
		files["go.mod"] = "module example.com/m\n"
		return node(scanTree(t, files), "example.com/m/p").Hash
	}
	base := map[string]string{"p/a.go": "package p\n\nimport _ \"embed\"\n\n//go:embed a.txt\nvar s string\n\nfunc F() {}\n\nfunc _() { _ = 1 }\n"}
	for name, variant := range map[string]string{
		"go:embed target":  "package p\n\nimport _ \"embed\"\n\n//go:embed b.txt\nvar s string\n\nfunc F() {}\n\nfunc _() { _ = 1 }\n",
		"package name":     "package q\n\nimport _ \"embed\"\n\n//go:embed a.txt\nvar s string\n\nfunc F() {}\n\nfunc _() { _ = 1 }\n",
		"build constraint": "//go:build linux\n\npackage p\n\nimport _ \"embed\"\n\n//go:embed a.txt\nvar s string\n\nfunc F() {}\n\nfunc _() { _ = 1 }\n",
		"blank func body":  "package p\n\nimport _ \"embed\"\n\n//go:embed a.txt\nvar s string\n\nfunc F() {}\n\nfunc _() { _ = 2 }\n",
		"linkname":         "package p\n\nimport _ \"embed\"\n\n//go:embed a.txt\nvar s string\n\n//go:linkname F runtime.nanotime\nfunc F() {}\n\nfunc _() { _ = 1 }\n",
	} {
		if pkgHash(map[string]string{"p/a.go": variant}) == pkgHash(copyMap(base)) {
			t.Errorf("%s change did not change the package hash", name)
		}
	}
	cgo := func(flag string) string {
		return pkgHash(map[string]string{"p/a.go": "package p\n\n// #cgo CFLAGS: " + flag + "\n// #include <stdio.h>\nimport \"C\"\n"})
	}
	if cgo("-O1") == cgo("-O2") {
		t.Error("cgo preamble change did not change the package hash")
	}
	commentOnly := "package p\n\nimport _ \"embed\"\n\n// S is a string.\n//go:embed a.txt\nvar s string // trailing\n\n// F.\nfunc F() {}\n\nfunc _() { _ = 1 }\n"
	if pkgHash(map[string]string{"p/a.go": commentOnly}) != pkgHash(copyMap(base)) {
		t.Error("plain comments must still not change the package hash")
	}
}

func copyMap(m map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range m {
		out[k] = v
	}
	return out
}
