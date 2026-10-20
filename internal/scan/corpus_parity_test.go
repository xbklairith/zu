package scan

import (
	"bytes"
	"cmp"
	"context"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// On a real tree, every rescan through a Cache writes the IR a cold scan
// writes, byte for byte, after each kind of edit a watch sees (16). The
// random-edit test covers the rules; this one covers a real tree's scale:
// kubernetes' 2,963 packages, its staging modules (required and scanned), a
// package with 347 importers. It runs only when ZU_CORPUS names a writable
// copy of a corpus tree (`cp -cRp`, never the corpus itself), and puts back
// every file it touched. ZU_CORPUS_PKG names the package to edit, relative
// to the tree; the default is kubernetes' apimachinery util/sets.
//
//	ZU_CORPUS=/path/to/copy go test ./internal/scan -run TestCorpusRescansMatchColdScans -v
func TestCorpusRescansMatchColdScans(t *testing.T) {
	root := os.Getenv("ZU_CORPUS")
	if root == "" {
		t.Skip("ZU_CORPUS is not set")
	}
	rel := cmp.Or(os.Getenv("ZU_CORPUS_PKG"), "staging/src/k8s.io/apimachinery/pkg/util/sets")
	dir := filepath.Join(root, filepath.FromSlash(rel))
	ents, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ZU_CORPUS_PKG: %v", err)
	}
	var files []string // the package's non-test Go files
	for _, e := range ents {
		if n := e.Name(); !e.IsDir() && strings.HasSuffix(n, ".go") && !strings.HasSuffix(n, "_test.go") {
			files = append(files, filepath.Join(dir, n))
		}
	}
	if len(files) == 0 {
		t.Fatalf("%s holds no Go files", rel)
	}
	clause := regexp.MustCompile(`(?m)^package (\w+)`)
	orig := map[string][]byte{}
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		orig[f] = b
	}
	name := clause.FindSubmatch(orig[files[0]])[1]
	restore := func() {
		for f, b := range orig {
			if err := os.WriteFile(f, b, 0o644); err != nil {
				t.Error(err)
			}
		}
		for _, p := range []string{"zz_parity.go", "zz_broken.go", "zzparity"} {
			if err := os.RemoveAll(filepath.Join(dir, p)); err != nil {
				t.Error(err)
			}
		}
	}
	t.Cleanup(restore)
	write := func(p string, b []byte) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	remove := func(p string) {
		t.Helper()
		if err := os.RemoveAll(p); err != nil {
			t.Fatal(err)
		}
	}
	withFunc := func(body string) []byte {
		return append(slices.Clone(orig[files[0]]), []byte("\nfunc ZzParity() {"+body+"}\n")...)
	}
	pkg := "package " + string(name) + "\n\n"

	cache := NewCache()
	step := func(what string, partial bool) {
		t.Helper()
		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
		if err != nil {
			t.Fatalf("%s: %v", what, err)
		}
		cold, cs := run(t, root, 0)
		if a, b := encode(t, warm), encode(t, cold); !bytes.Equal(a, b) {
			t.Fatalf("%s: the IR differs from a cold scan's\n%s", what, firstDiff(a, b))
		}
		if !reflect.DeepEqual(ws.Measures, cs.Measures) {
			t.Fatalf("%s: the Measures differ from a cold scan's", what)
		}
		if partial && ws.Assembled >= cs.Packages {
			t.Errorf("%s: assembled all %d packages: the tree does not reuse parts", what, cs.Packages)
		}
		t.Logf("%-24s assembled %4d of %d packages, %d parse errors", what, ws.Assembled, cs.Packages, len(cold.ParseErrors))
	}

	step("first scan", false)
	write(files[0], withFunc(""))
	step("new function", true)
	write(files[0], withFunc(" _ = 1 "))
	step("body-only edit", true)
	write(files[0], orig[files[0]])
	step("function removed", true)
	for _, f := range files {
		write(f, clause.ReplaceAll(orig[f], []byte("package zzparity")))
	}
	step("package renamed", true)
	restore()
	step("package renamed back", true)
	write(filepath.Join(dir, "zz_parity.go"), []byte(pkg+"type ZzParity struct{}\n"))
	step("new file", true)
	remove(filepath.Join(dir, "zz_parity.go"))
	step("file deleted", true)
	write(filepath.Join(dir, "zzparity", "zz.go"), []byte("package zzparity\n\nfunc F() {}\n"))
	step("new package", false)
	remove(filepath.Join(dir, "zzparity"))
	step("package deleted", false)
	write(filepath.Join(dir, "zz_broken.go"), []byte(pkg+"func (\n"))
	step("parse error", true)
	remove(filepath.Join(dir, "zz_broken.go"))
	step("parse error fixed", true)
}
