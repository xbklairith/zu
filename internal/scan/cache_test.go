package scan

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"zu/internal/ir"
)

// A rescan through a Cache must write the IR a cold scan writes, byte for
// byte, and measure what it measures, after an edit, an add and a delete,
// parsing only the files whose content changed. The edit leaves a call in
// money.go unresolved until the added file declares its callee, so the
// cached facts of an unchanged file must resolve against a new one.
func TestCacheRescanEqualsColdScan(t *testing.T) {
	root := fixture(t, "shop")
	money := filepath.Join(root, "internal", "money")
	cache := NewCache()
	step := func(name string, wantParsed int, wantEdge bool) {
		t.Helper()
		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
		if err != nil {
			t.Fatal(err)
		}
		cold, cs := run(t, root, 0)
		if !bytes.Equal(encode(t, warm), encode(t, cold)) {
			t.Errorf("%s: the IR differs from a cold scan's", name)
		}
		if !reflect.DeepEqual(ws.Measures, cs.Measures) {
			t.Errorf("%s: the Measures differ from a cold scan's", name)
		}
		if wantParsed < 0 {
			wantParsed = cs.Parsed
		}
		if ws.Parsed != wantParsed {
			t.Errorf("%s: parsed %d files, want %d", name, ws.Parsed, wantParsed)
		}
		if len(cache.files) != cs.Parsed {
			t.Errorf("%s: the cache holds %d files, the tree %d", name, len(cache.files), cs.Parsed)
		}
		neg := slices.ContainsFunc(warm.Edges, func(e ir.Edge) bool {
			return e.From == "example.com/shop/internal/money.Add" && e.To == "example.com/shop/internal/money.Neg"
		})
		if neg != wantEdge {
			t.Errorf("%s: calls edge Add → Neg = %v, want %v", name, neg, wantEdge)
		}
	}
	write := func(rel, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(money, rel), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	step("first scan", -1, false)
	step("no change", 0, false)
	write("money.go", "// Package money holds amounts.\npackage money\n\n// Cents is an amount in cents.\ntype Cents int64\n\n// Add returns the sum.\nfunc Add(a, b Cents) Cents { return a - Neg(b) }\n")
	step("edit", 1, false)
	write("neg.go", "package money\n\n// Neg negates.\nfunc Neg(a Cents) Cents { return -a }\n")
	step("add", 1, true)
	if err := os.Remove(filepath.Join(money, "neg.go")); err != nil {
		t.Fatal(err)
	}
	step("delete", 0, false)
}

// A cold scan parses every file it reads, and reports that it did.
func TestRunWithoutACacheParsesEveryFile(t *testing.T) {
	_, st := run(t, fixture(t, "shop"), 0)
	w, err := walk(fixture(t, "shop"))
	if err != nil {
		t.Fatal(err)
	}
	if st.Parsed != len(w.Files) {
		t.Errorf("Parsed = %d, want %d", st.Parsed, len(w.Files))
	}
}
