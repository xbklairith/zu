package scan

import (
	"bytes"
	"context"
	"flag"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"zu/internal/ir"
)

var update = flag.Bool("update", false, "rewrite golden files")

// fixture copies testdata/<name> to a temp dir and adds the files a repo
// cannot hold as-is: an unparseable Go file.
func fixture(t *testing.T, name string) string {
	t.Helper()
	root := t.TempDir()
	src := filepath.Join("testdata", name)
	err := filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		dst := filepath.Join(root, rel)
		if d.IsDir() {
			return os.MkdirAll(dst, 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, b, 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "bad"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "bad", "bad.go"), []byte("package bad\n\nfunc {\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

func encode(t *testing.T, doc *ir.IR) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := ir.Encode(&buf, doc); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func run(t *testing.T, root string, workers int) (*ir.IR, Stats) {
	t.Helper()
	doc, stats, err := Run(context.Background(), Options{Root: root, Workers: workers})
	if err != nil {
		t.Fatal(err)
	}
	return doc, stats
}

func TestScanGolden(t *testing.T) {
	doc, stats := run(t, fixture(t, "shop"), 0)
	got := encode(t, doc)
	golden := filepath.Join("testdata", "shop.golden.json")
	if *update {
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("%v (run with -update to create)", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("IR differs from %s (rerun with -update and review the diff)\n%s", golden, got)
	}
	if stats.Packages != 5 || stats.Files != 9 || stats.ParseErrors != 1 {
		t.Errorf("stats = %+v", stats)
	}
}

func TestScanDeterministicAcrossWorkers(t *testing.T) {
	root := fixture(t, "shop")
	prev := runtime.GOMAXPROCS(1)
	a, _ := run(t, root, 1)
	runtime.GOMAXPROCS(8)
	b, _ := run(t, root, 8)
	runtime.GOMAXPROCS(prev)
	if !bytes.Equal(encode(t, a), encode(t, b)) {
		t.Fatal("output differs between 1 and 8 workers")
	}
}

func TestScanTreeGroupingAndDefaultPolicy(t *testing.T) {
	doc, _ := run(t, fixture(t, "shop"), 0)
	if doc.Grouping != "tree" || doc.PolicyHash != DefaultPolicyHash {
		t.Fatalf("grouping %q policyHash %q", doc.Grouping, doc.PolicyHash)
	}
	if !strings.HasPrefix(DefaultPolicyHash, "sha256:") || len(DefaultPolicyHash) != 71 {
		t.Fatalf("DefaultPolicyHash = %q", DefaultPolicyHash)
	}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindPackage && (n.ID == "example.com/shop/internal") {
			t.Fatal("no node for a path segment that is not a package")
		}
	}
}

func hashesByID(doc *ir.IR) map[string]string {
	m := map[string]string{}
	for _, n := range doc.Nodes {
		m[n.ID] = n.Hash
	}
	return m
}

func TestScanHashStabilityAndLocality(t *testing.T) {
	root := fixture(t, "shop")
	base, _ := run(t, root, 0)
	storeGo := filepath.Join(root, "internal", "store", "store.go")
	orig, err := os.ReadFile(storeGo)
	if err != nil {
		t.Fatal(err)
	}

	cosmetic := strings.NewReplacer(
		"// Get returns one order.\n", "// Get returns one order, re-documented.\n// Extra line.\n",
		"func (r *Repo) Get(id int) (Order, error) {", "func (r *Repo) Get(\n\tid int,\n) (Order, error) { // wrapped",
		"_ = money.Add(o.Total, money.Zero)", "_ = money.Add(o.Total, /* zero */ money.Zero)",
		"\tcache map[int]Order\n", "\tcache map[int]Order // by id\n",
	).Replace(string(orig))
	if err := os.WriteFile(storeGo, []byte(cosmetic), 0o644); err != nil {
		t.Fatal(err)
	}
	after, _ := run(t, root, 0)
	b, a := hashesByID(base), hashesByID(after)
	for id, h := range b {
		if a[id] != h {
			t.Errorf("%s: hash changed by comments or layout only", id)
		}
	}

	edited := strings.Replace(string(orig), "o := r.cache[id]", "o := r.cache[id+1]", 1)
	if err := os.WriteFile(storeGo, []byte(edited), 0o644); err != nil {
		t.Fatal(err)
	}
	after, _ = run(t, root, 0)
	a = hashesByID(after)
	var changed []string
	for id, h := range b {
		if a[id] != h {
			changed = append(changed, id)
		}
	}
	want := "example.com/shop/internal/store,example.com/shop/internal/store.Repo.Get"
	slices.Sort(changed)
	if got := strings.Join(changed, ","); got != want {
		t.Fatalf("changed hashes = %s, want %s", got, want)
	}
	if err := os.WriteFile(storeGo, orig, 0o644); err != nil {
		t.Fatal(err)
	}

	// A constant has no node of its own: changing it changes only its
	// package's hash.
	moneyGo := filepath.Join(root, "internal", "money", "money.go")
	src, err := os.ReadFile(moneyGo)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(moneyGo, []byte(strings.Replace(string(src), "const Zero Cents = 0", "const Zero Cents = 1", 1)), 0o644); err != nil {
		t.Fatal(err)
	}
	after, _ = run(t, root, 0)
	a = hashesByID(after)
	changed = changed[:0]
	for id, h := range b {
		if a[id] != h {
			changed = append(changed, id)
		}
	}
	if got := strings.Join(changed, ","); got != "example.com/shop/internal/money" {
		t.Fatalf("const change altered hashes %s, want only the money package", got)
	}
}

func TestScanRejectsBadRoot(t *testing.T) {
	if _, _, err := Run(context.Background(), Options{Root: filepath.Join(t.TempDir(), "nope")}); err == nil {
		t.Fatal("want error for missing root")
	}
}

func TestScanCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := Run(ctx, Options{Root: fixture(t, "shop")}); err == nil {
		t.Fatal("want error for cancelled context")
	}
}
