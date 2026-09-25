package scan

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"testing"
	"time"

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

// listed is root as the watch's rescan reads it: a ListTree over every file
// DirTree lists, whose Files takes each file's Stamp.
func listed(t *testing.T, root string) Tree {
	t.Helper()
	files, _, err := dirOf(t, root).Files()
	if err != nil {
		t.Fatal(err)
	}
	lt, err := ListTree(root, files)
	if err != nil {
		t.Fatal(err)
	}
	return lt
}

// With TrustStamps a rescan reuses a file's facts without reading it while
// its Stamp (size, mtime, ctime, inode) is the one the Cache kept (13,
// rescan-profile fix 3). An edit that keeps the size and puts the mtime
// back still moves the ctime, so it is seen; a touch that keeps the content
// is read and hashed but not parsed; and the IR is always a cold scan's.
func TestCacheTrustsStamps(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("a Stamp has a ctime only on darwin and linux")
	}
	root := fixture(t, "shop")
	money := filepath.Join(root, "internal", "money", "money.go")
	cache := NewCache()
	scan := func(trust bool) (*ir.IR, Stats) {
		t.Helper()
		doc, st, err := Run(context.Background(), Options{Tree: listed(t, root), Cache: cache, TrustStamps: trust})
		if err != nil {
			t.Fatal(err)
		}
		return doc, st
	}
	hasSub := func(doc *ir.IR) bool {
		return slices.ContainsFunc(doc.Nodes, func(n ir.Node) bool { return n.ID == "example.com/shop/internal/money.Sub" })
	}
	scan(false)
	if _, st := scan(true); st.Parsed != 0 {
		t.Fatalf("no change: parsed %d", st.Parsed)
	}

	before, err := os.Stat(money)
	if err != nil {
		t.Fatal(err)
	}
	old, err := os.ReadFile(money)
	if err != nil {
		t.Fatal(err)
	}
	// Same size, mtime put back: Add renamed to Sub.
	edited := bytes.Replace(old, []byte("func Add("), []byte("func Sub("), 1)
	if len(edited) != len(old) || bytes.Equal(edited, old) {
		t.Fatal("the fixture changed: money.go has no func Add")
	}
	if err := os.WriteFile(money, edited, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(money, before.ModTime(), before.ModTime()); err != nil {
		t.Fatal(err)
	}
	if doc, st := scan(true); st.Parsed != 1 || !hasSub(doc) {
		t.Errorf("same size, mtime put back: parsed %d, Sub drawn %v; want the edit seen", st.Parsed, hasSub(doc))
	}

	// A touch that keeps the content: read and hashed, not parsed.
	later := before.ModTime().Add(2 * time.Second)
	if err := os.Chtimes(money, later, later); err != nil {
		t.Fatal(err)
	}
	doc, st := scan(true)
	if cold, _ := run(t, root, 0); st.Parsed != 0 || !bytes.Equal(encode(t, doc), encode(t, cold)) {
		t.Errorf("touched: parsed %d, want 0 and a cold scan's IR", st.Parsed)
	}
}

// reads is a Tree that counts ReadFile calls and lists each file with the
// Stamp the test sets.
type reads struct {
	Tree
	stamps map[string]Stamp
	n      int
}

func (r *reads) ReadFile(rel string) ([]byte, error) { r.n++; return r.Tree.ReadFile(rel) }
func (r *reads) stamp(rel string) Stamp              { return r.stamps[rel] }

// A trusted Stamp is the only thing that skips the read: a new Stamp, an
// unknown one, or no trust reads the file.
func TestCacheTrustSkipsOnlyTheRead(t *testing.T) {
	root := fixture(t, "shop")
	rel := "internal/money/money.go"
	r := &reads{Tree: dirOf(t, root), stamps: map[string]Stamp{rel: {Size: 1, Mod: 2, Ctime: 3, Ino: 4}}}
	c := NewCache()
	step := func(name string, trust bool, wantReads int) {
		t.Helper()
		r.n = 0
		if f, _ := c.extract(r, rel, trust); f == nil || r.n != wantReads {
			t.Errorf("%s: %d reads, want %d", name, r.n, wantReads)
		}
	}
	step("first", true, 1)
	step("same Stamp, trusted", true, 0)
	step("same Stamp, not trusted", false, 1)
	r.stamps[rel] = Stamp{Size: 1, Mod: 2, Ctime: 5, Ino: 4}
	step("new ctime", true, 1)
	step("the new Stamp is kept", true, 0)
	r.stamps[rel] = Stamp{}
	step("unknown", true, 1)
}
