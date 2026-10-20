package scan

import (
	"bytes"
	"context"
	"fmt"
	"math/rand/v2"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"zu/internal/ir"
)

// A rescan through a Cache assembles again only the packages whose inputs
// changed (16): a package whose files changed, every package importing one
// whose Name, functions or types changed or that appeared or went, and all
// of them when a go.mod's paths or require lines changed. Every IR is a cold
// scan's, byte for byte.
func TestCacheAssemblesOnlyWhatChanged(t *testing.T) {
	root := fixture(t, "shop")
	cache := NewCache()
	money := "example.com/shop/internal/money"
	step := func(name string, want func(cold *ir.IR, cs Stats) int) {
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
		if n := want(cold, cs); ws.Assembled != n {
			t.Errorf("%s: assembled %d packages, want %d", name, ws.Assembled, n)
		}
		if cs.Assembled != cs.Packages {
			t.Errorf("%s: a cold scan assembled %d of %d packages", name, cs.Assembled, cs.Packages)
		}
	}
	all := func(_ *ir.IR, cs Stats) int { return cs.Packages }
	n := func(k int) func(*ir.IR, Stats) int { return func(*ir.IR, Stats) int { return k } }
	// money and each package that imports it.
	moneyAndImporters := func(cold *ir.IR, _ Stats) int {
		k := 1
		for _, e := range cold.Edges {
			if e.Kind == ir.EdgeImports && e.To == money {
				k++
			}
		}
		if k < 2 {
			t.Fatal("the fixture changed: nothing imports money")
		}
		return k
	}
	write := func(rel, body string) {
		t.Helper()
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	old, err := os.ReadFile(filepath.Join(root, "internal", "money", "money.go"))
	if err != nil || !bytes.Contains(old, []byte("{ return a + b }")) {
		t.Fatal("the fixture changed: money.go has no Add returning a + b")
	}
	moneyGo := strings.Replace(string(old), "a + b", "%s", 1)

	step("first scan", all)
	step("no change", n(0))
	write("internal/money/money.go", fmt.Sprintf(moneyGo, "b + a"))
	step("a body", n(1))
	write("internal/money/neg.go", "package money\n\n// Neg negates.\nfunc Neg(a Cents) Cents { return -a }\n")
	step("a new function", moneyAndImporters)
	write("internal/money/neg.go", "package money\n\n// Neg negates.\nfunc Neg(a Cents) Cents { return 0 - a }\n")
	step("its body", n(1))
	if err := os.Remove(filepath.Join(root, "internal", "money", "neg.go")); err != nil {
		t.Fatal(err)
	}
	step("the function gone", moneyAndImporters)
	write("internal/extra/extra.go", "package extra\n")
	step("a new package", n(1)) // nothing imports it
	if err := os.Rename(filepath.Join(root, "internal", "extra"), filepath.Join(root, "internal", "other")); err != nil {
		t.Fatal(err)
	}
	step("a package renamed", n(1)) // a new package, and one gone that nothing imported
	write("go.mod", "module example.com/shop\n\ngo 1.24\n\nrequire (\n\tgithub.com/lib/pq v1.10.9\n\tgolang.org/x/sync v0.9.0\n)\n")
	step("a version in go.mod", n(0)) // the IR holds require lines, not versions
	write("go.mod", "module example.com/shop\n\ngo 1.24\n\n// the requires move down a line\nrequire (\n\tgithub.com/lib/pq v1.10.9\n\tgolang.org/x/sync v0.9.0\n)\n")
	step("a require's line", all)
	step("no change again", n(0))
	// tools' go.mod moves out and keeps its path: tools/gen's id and facts
	// stay, but its files fall to the root module, which only the go.mod's
	// Dir tells.
	write("kit/README", "no Go files\n")
	if err := os.Rename(filepath.Join(root, "tools", "go.mod"), filepath.Join(root, "kit", "go.mod")); err != nil {
		t.Fatal(err)
	}
	step("a nested go.mod moved", all)
}

// A package importing another resolves its calls by the other's Name, so
// a new package clause alone assembles its importers again.
func TestCacheAssemblesImportersOfARenamedPackage(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"a/a.go": "package a\n\nfunc F() {}\n",
		"b/b.go": "package b\n\nimport \"example.com/m/a\"\n\nfunc G() { a.F() }\n",
	})
	cache := NewCache()
	for i, clause := range []string{"package a", "package z", "package a"} {
		if err := os.WriteFile(filepath.Join(root, "a", "a.go"), []byte(clause+"\n\nfunc F() {}\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
		if err != nil {
			t.Fatal(err)
		}
		cold, _ := run(t, root, 0)
		if !bytes.Equal(encode(t, warm), encode(t, cold)) {
			t.Errorf("%s: the IR differs from a cold scan's", clause)
		}
		if i > 0 && ws.Assembled != 2 {
			t.Errorf("%s: assembled %d packages, want a and b", clause, ws.Assembled)
		}
	}
}

// A package's import may name a path the tree does not hold yet: the import
// is unresolved, and so are the calls through it. When a package appears at
// that path, or goes, only it and the packages whose imports name its path
// are assembled again: the rest read nothing of it (16). A package whose
// arrival lets ids meet assembles the whole tree.
func TestCacheAssemblesImportersOfAnAddedOrRemovedPackage(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"a/a.go": "package a\n\nimport \"example.com/m/c\"\n\nfunc F() { c.G() }\n",
		"b/b.go": "package b\n\nimport \"example.com/m/c/d\"\n\nfunc H() { d.K() }\n",
		"e/e.go": "package e\n\nimport \"example.com/m/a\"\n\nfunc E() { a.F() }\n",
	})
	cache := NewCache()
	step := func(what string, want func(Stats) int, edit func(p string) error, rel string) {
		t.Helper()
		if edit != nil {
			if err := edit(filepath.Join(root, filepath.FromSlash(rel))); err != nil {
				t.Fatal(err)
			}
		}
		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
		if err != nil {
			t.Fatal(err)
		}
		cold, cs := run(t, root, 0)
		if a, b := encode(t, warm), encode(t, cold); !bytes.Equal(a, b) {
			t.Errorf("%s: the IR differs from a cold scan's\n%s", what, firstDiff(a, b))
		}
		if n := want(cs); ws.Assembled != n {
			t.Errorf("%s: assembled %d packages, want %d", what, ws.Assembled, n)
		}
	}
	add := func(body string) func(string) error {
		return func(p string) error {
			if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
				return err
			}
			return os.WriteFile(p, []byte(body), 0o644)
		}
	}
	all := func(cs Stats) int { return cs.Packages }
	n := func(k int) func(Stats) int { return func(Stats) int { return k } }

	step("first scan", all, nil, "")
	step("c appears: a's import resolves", n(2), add("package c\n\nfunc G() {}\n"), "c/c.go")
	step("c/d appears: b's import resolves", n(2), add("package d\n\nfunc K() {}\n"), "c/d/d.go")
	step("c goes: a's import is unresolved again", n(1), os.Remove, "c/c.go")
	step("c/d goes", n(1), os.RemoveAll, "c")
	step("x/d appears, imported by nothing", n(1), add("package d\n\nfunc K() {}\n"), "x/d/d.go")
	step("a.F/y appears: its ids fall among a's", all, add("package y\n"), "a.F/y/y.go")
	step("a.F/y goes", all, os.RemoveAll, "a.F")
	step("no change", n(0), nil, "")
}

// Dots are legal in directory names, so two nodes can share an id: a
// declaration and a package, two declarations, or a declaration and a
// required module. Then the scan assembles the whole tree every time, as it
// did before 16, and the IR is still a cold scan's.
func TestCacheAssemblesWholeWhereIDsMayMeet(t *testing.T) {
	for name, files := range map[string]map[string]string{
		"a method and a function": {
			"go.mod":   "module example.com/m\n",
			"a/a.go":   "package a\n\ntype b struct{}\n\nfunc (b) c() {}\n",
			"a.b/c.go": "package x\n\nfunc c() {}\n",
		},
		"a package below a directory named as a declaration": { // m/a.F/x sorts between m/a.F and m/a.T
			"go.mod":     "module example.com/m\n",
			"a/a.go":     "package a\n\nfunc F() {}\n\ntype T struct{}\n",
			"a.F/x/x.go": "package x\n\nfunc G() {}\n",
		},
		"a type and a required module": {
			"go.mod": "module example.com/m\n\nrequire example.com/m/a.b v1.0.0\n",
			"a/a.go": "package a\n\ntype b struct{}\n",
			"c/c.go": "package c\n\nimport \"example.com/m/a.b/x\"\n\nfunc F() { x.G() }\n",
		},
	} {
		root := tree(t, files)
		cache := NewCache()
		for _, when := range []string{"first", "again"} {
			warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
			if err != nil {
				t.Fatal(err)
			}
			cold, cs := run(t, root, 0)
			if !bytes.Equal(encode(t, warm), encode(t, cold)) {
				t.Errorf("%s, %s: the IR differs from a cold scan's", name, when)
			}
			if ws.Assembled != cs.Packages {
				t.Errorf("%s, %s: assembled %d of %d packages; want all", name, when, ws.Assembled, cs.Packages)
			}
		}
	}
}

// Random edits to a random tree: after each, a rescan through one Cache
// writes the IR and the Measures a cold scan writes. The tree has two
// modules, requires, dotted and nested directories, package clauses that
// differ from the directory, build-ignored and unparseable files, and calls,
// embeds and imports between its packages.
func TestCacheRescansMatchColdScansOverRandomEdits(t *testing.T) {
	for seed := range uint64(6) {
		t.Run(fmt.Sprint(seed), func(t *testing.T) {
			g := &gen{r: rand.New(rand.NewPCG(seed, 16)), files: map[string]string{}}
			root := t.TempDir()
			g.init()
			cache := NewCache()
			partial := 0
			for i := range 60 {
				what := g.edit()
				g.sync(t, root)
				warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
				if err != nil {
					t.Fatalf("step %d (%s): %v", i, what, err)
				}
				cold, cs := run(t, root, 0)
				if a, b := encode(t, warm), encode(t, cold); !bytes.Equal(a, b) {
					t.Fatalf("step %d (%s): the IR differs from a cold scan's\n%s", i, what, firstDiff(a, b))
				}
				if !reflect.DeepEqual(ws.Measures, cs.Measures) {
					t.Fatalf("step %d (%s): the Measures differ from a cold scan's", i, what)
				}
				if cacheBuilt(cache) < cs.Packages && !inOrder(warm) {
					t.Fatalf("step %d (%s): an IR assembled from parts is not in order", i, what)
				}
				ws.Assembled, ws.Parsed, cs.Assembled, cs.Parsed = 0, 0, 0, 0
				if !reflect.DeepEqual(ws, cs) {
					t.Fatalf("step %d (%s): Stats %+v, a cold scan's %+v", i, what, ws, cs)
				}
				if st := ws; st.Packages > 1 && cacheBuilt(cache) > 0 && cacheBuilt(cache) < st.Packages {
					partial++
				}
			}
			if partial < 10 {
				t.Errorf("only %d of 60 rescans assembled part of the tree: the test is not testing reuse", partial)
			}
		})
	}
}

// A package id may sort between another's and its declarations':
// m/a-b falls between m/a and m/a.F. Parts joined in package order would
// leave the IR out of order and ir.Sort a full sort of kubernetes (16).
func TestCacheJoinsPartsInOrder(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod":   "module example.com/m\n",
		"a/a.go":   "package a\n\nimport \"example.com/m/a-b\"\n\nfunc F() { b.G() }\n\ntype T struct{}\n",
		"a-b/b.go": "package b\n\nfunc G() {}\n\nfunc H() { G() }\n",
	})
	cache := NewCache()
	for i, body := range []string{"", "func H() { G(); G() }\n"} {
		if body != "" {
			if err := os.WriteFile(filepath.Join(root, "a-b", "b.go"), []byte("package b\n\nfunc G() {}\n\n"+body), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		doc, st, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
		if err != nil {
			t.Fatal(err)
		}
		if i > 0 && st.Assembled != 1 {
			t.Fatalf("assembled %d packages; want 1", st.Assembled)
		}
		if !inOrder(doc) {
			t.Fatalf("scan %d: the IR is not in order: %v", i, doc.Nodes)
		}
	}
}

// inOrder reports whether doc's nodes and edges are in ir.Sort's order, as
// an IR assembled from parts must be for ir.Sort to be cheap (16).
func inOrder(doc *ir.IR) bool {
	sorted := &ir.IR{Nodes: slices.Clone(doc.Nodes), Edges: slices.Clone(doc.Edges)}
	ir.Sort(sorted)
	return reflect.DeepEqual(sorted.Nodes, doc.Nodes) && reflect.DeepEqual(sorted.Edges, doc.Edges)
}

// cacheBuilt is how many packages the Cache's last scan assembled.
func cacheBuilt(c *Cache) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.built
}

func firstDiff(a, b []byte) string {
	la, lb := strings.Split(string(a), "\n"), strings.Split(string(b), "\n")
	for i := range min(len(la), len(lb)) {
		if la[i] != lb[i] {
			return fmt.Sprintf("line %d:\nwarm %s\ncold %s", i+1, la[i], lb[i])
		}
	}
	return fmt.Sprintf("lengths %d, %d", len(la), len(lb))
}

// gen is a random Go tree and its edits.
type gen struct {
	r     *rand.Rand
	files map[string]string // slash path → content; "" deletes
	dirs  []string          // package directories
}

var genDirs = []string{"p0", "p1", "p1/q", "p2", "p2.x", "tools/t", "p3", "p1-r"}

func (g *gen) init() {
	g.files["go.mod"] = "module example.com/m\n\nrequire (\n\text.io/a v1.0.0\n\text.io/b v1.0.0\n)\n"
	g.files["tools/go.mod"] = "module example.com/tools\n\nrequire ext.io/a v1.0.0\n"
	for _, d := range genDirs[:4] {
		g.addFile(d)
	}
}

func (g *gen) pick(xs []string) string { return xs[g.r.IntN(len(xs))] }

// genImport is d's import path.
func genImport(d string) string {
	if rest, ok := strings.CutPrefix(d, "tools/"); ok {
		return "example.com/tools/" + rest
	}
	return "example.com/m/" + d
}

// body is a file of package dir d: random declarations calling, embedding
// and importing the other package directories.
func (g *gen) body(d string) string {
	name := path.Base(d)
	if i := strings.IndexAny(name, ".-"); i >= 0 {
		name = name[:i]
	}
	if g.r.IntN(8) == 0 {
		name = "other"
	}
	var b strings.Builder
	if g.r.IntN(12) == 0 {
		b.WriteString("//go:build ignore\n\n")
	}
	fmt.Fprintf(&b, "package %s\n\n", name)
	type imp struct{ name, path string }
	var imps []imp
	for k := range 1 + g.r.IntN(3) {
		o := g.pick(genDirs)
		alias := fmt.Sprintf("i%d", k)
		if g.r.IntN(2) == 0 {
			alias = ""
		}
		imps = append(imps, imp{alias, genImport(o)})
	}
	if g.r.IntN(2) == 0 {
		imps = append(imps, imp{"", "ext.io/" + g.pick([]string{"a", "b", "c"}) + "/sub"})
	}
	for _, i := range imps {
		fmt.Fprintf(&b, "import %s %q\n", i.name, i.path)
	}
	qual := func() string {
		i := imps[g.r.IntN(len(imps))]
		if i.name != "" {
			return i.name
		}
		q := path.Base(i.path)
		if j := strings.IndexAny(q, ".-"); j >= 0 {
			q = q[:j]
		}
		return q
	}
	for k := range 1 + g.r.IntN(4) {
		switch g.r.IntN(3) {
		case 0:
			fmt.Fprintf(&b, "\nfunc F%d() { %s.F%d(); F%d(); T%d{}.M%d() }\n", g.r.IntN(4), qual(), g.r.IntN(4), g.r.IntN(4), k, g.r.IntN(3))
		case 1:
			fmt.Fprintf(&b, "\ntype T%d struct { %s.T%d; T%d }\n", g.r.IntN(3), qual(), g.r.IntN(3), g.r.IntN(3))
		default:
			fmt.Fprintf(&b, "\nfunc (t T%d) M%d() { t.M%d(); %s.F%d() }\n", g.r.IntN(3), g.r.IntN(3), g.r.IntN(3), qual(), g.r.IntN(4))
		}
	}
	if g.r.IntN(15) == 0 {
		b.WriteString("\nfunc broken( {\n")
	}
	return b.String()
}

func (g *gen) addFile(d string) string {
	if !slices.Contains(g.dirs, d) {
		g.dirs = append(g.dirs, d)
	}
	p := fmt.Sprintf("%s/f%d.go", d, g.r.IntN(3))
	g.files[p] = g.body(d)
	return p
}

// edit changes the tree once and says how.
func (g *gen) edit() string {
	var goFiles []string
	for p, c := range g.files {
		if c != "" && strings.HasSuffix(p, ".go") {
			goFiles = append(goFiles, p)
		}
	}
	slices.Sort(goFiles)
	switch k := g.r.IntN(20); {
	case k < 11 && len(goFiles) > 0: // most edits rewrite one file
		p := g.pick(goFiles)
		g.files[p] = g.body(path.Dir(p))
		return "rewrite " + p
	case k < 14:
		return "add " + g.addFile(g.pick(g.dirs))
	case k < 16 && len(goFiles) > 1:
		p := g.pick(goFiles)
		g.files[p] = ""
		return "delete " + p
	case k < 18:
		return "add " + g.addFile(g.pick(genDirs))
	case k < 19:
		g.files["go.mod"] = fmt.Sprintf("module example.com/m\n\nrequire (\n\text.io/a v1.0.%d\n\text.io/b v1.0.0\n)\n", g.r.IntN(3))
		if g.r.IntN(2) == 0 {
			g.files["go.mod"] = "module example.com/m\n\n// a comment moves the requires\nrequire ext.io/a v1.0.0\n"
		}
		return "go.mod"
	case k < 20 && g.r.IntN(2) == 0: // the package clause alone
		p := g.pick(goFiles)
		if c := g.files[p]; strings.Contains(c, "package other // was ") {
			g.files[p] = strings.Replace(c, "package other // was ", "package ", 1)
		} else {
			g.files[p] = strings.Replace(c, "package ", "package other // was ", 1)
		}
		return "clause " + p
	default:
		p := g.pick(goFiles)
		g.files[p] = strings.Replace(g.files[p], "package ", "package  ", 1) // same facts, new content
		return "whitespace " + p
	}
}

// sync writes the tree to root.
func (g *gen) sync(t *testing.T, root string) {
	t.Helper()
	for p, c := range g.files {
		f := filepath.Join(root, filepath.FromSlash(p))
		if c == "" {
			if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
				t.Fatal(err)
			}
			delete(g.files, p)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(f), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(f, []byte(c), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// A require of a module the tree holds (kubernetes' staging modules) never
// becomes an external: that module's own path claims every import under it.
// So its path may be a package id, and a rescan still assembles only what
// changed.
func TestCacheAssemblesPartsWhenARequiredModuleIsScanned(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod":     "module example.com/m\n\nrequire example.com/lib v1.0.0\n",
		"a/a.go":     "package a\n\nimport \"example.com/lib\"\n\nfunc F() { lib.G() }\n",
		"b/b.go":     "package b\n\nfunc H() {}\n",
		"lib/go.mod": "module example.com/lib\n",
		"lib/lib.go": "package lib\n\nfunc G() {}\n",
	})
	cache := NewCache()
	for i, body := range []string{"func H() {}", "func H() { H() }"} {
		if err := os.WriteFile(filepath.Join(root, "b", "b.go"), []byte("package b\n\n"+body+"\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
		if err != nil {
			t.Fatal(err)
		}
		cold, cs := run(t, root, 0)
		if !bytes.Equal(encode(t, warm), encode(t, cold)) {
			t.Errorf("%s: the IR differs from a cold scan's", body)
		}
		if want := []int{cs.Packages, 1}[i]; ws.Assembled != want {
			t.Errorf("%s: assembled %d packages, want %d", body, ws.Assembled, want)
		}
	}
}
