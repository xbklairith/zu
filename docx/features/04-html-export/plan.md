# 04 · HTML Export — Plan

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Goal:** `zu scan -html FILE` (Part A) and `zu diff … -html FILE` (Part B) write one self-contained HTML file that draws the Project View or Change View and lets a reader drill into the Package Tree and read the inlined source, offline, with no zu install.

**Architecture:** A new Go package `internal/export` turns an IR into a **View** (a small JSON document: packages, externals, bundled import edges, declarations and source only where wanted) and writes it into the single-file UI template that Vite builds into `web/dist/index.html`, replacing one marker `<script id="zu-data">` element. The React UI reads that element, derives the Package Tree from node ids (ADR 0008), lays out the visible boxes with ELK on the main thread, and draws them with React Flow. The page loads nothing: every script and style is inlined and a CSP meta tag forbids network access. The only URLs are links the reader clicks.

**Tech Stack:** Go 1.24 (`internal/export`, `internal/cli`, `internal/gitref`, `web/embed.go`); React 19, `@xyflow/react` 12, `elkjs` 0.12 (main thread), `vite` 8 + `vite-plugin-singlefile` 2.3, `vitest` 5 (node environment, pure functions only).

**Source decisions:** ADR 0006 (self-contained file, source worth reading), 0008 (Package Tree, drill in / Esc), 0009 (Affected Set), 0003 (ids, Moves by `shape`); `docx/core/decisions.md` settled choices; grilling round 1 for feature 04 (2026-09-24), answers Q1–Q6 all as recommended.

**Out of Scope:**
- Everything deferred to 05 (interaction): U4 highlight/dim, U6 declutter cycle, focus N hops, collapse-depth control, stdlib/external toggles, view state in the URL hash, U8 search, U7 SVG/PNG export.
- `serve`, watch mode, session restore.
- Syntax highlighting; prose; model output.
- CRAP overlay, Policy, Levels, violations (later features). The Change View shows no violations section until the Policy feature.
- MR/PR deep links (`-mr N`); code-host API calls.
- A Web Worker for ELK (see Deviations).

---

## Deviations from settled answers (found while planning — confirm at approval)

1. **Q4 auto-collapse is relative to the drilled-in box, and module roots are depth 1 below the page root.** The measured Test Corpus makes "deepest level with ≤ 60 boxes" well-defined only this way:

   | repo | modules | boxes one level below root | two levels | opens at |
   |---|---|---|---|---|
   | gohugoio/hugo | 1 | 1 | 37 | 37 boxes |
   | kubernetes/kubernetes | 38 | 38 | 198 | 38 boxes |

   If even the first level exceeds 60 boxes, it is drawn anyway with a note giving the count.
2. **Externals have their own budget.** kubernetes has 111 external modules, and the external toggle is deferred to 05. Rule *(mine)*: draw each external as an oval when a view touches ≤ 20 of them; otherwise draw one oval, "N external modules", and list them in the side panel.
3. **Links are `#Lx`, not `#Lx-Ly`.** `ir.Location` has a start line only. A range needs an IR schema change (feature 01's golden). Deferred.
4. **Links need a clean commit.** No links when `ref.commit` is empty or `ref.dirty` is true: the inlined worktree source would not match the linked commit.
5. **ELK runs on the main thread in 04**, not in a Worker as the settled stack says. A `blob:` worker inside a single-file `file://` page adds CSP and browser risk, and 04 never draws more than about 60 boxes. The Worker moves to 05, which adds views that can be large.
6. **A package's source files are the files its declarations live in.** The IR's package node records only its first file (`internal/scan/build.go:134`), so a file with no declarations (only imports or comments) is not inlined.
7. **Drilling in replaces the canvas (navigation), it does not expand in place.** Import edges whose other end lies outside the drilled-in box go to one dimmed "outside" node whose panel lists the real targets. U2 (expand in place) stays with 05.

## Measured sizes (kubernetes v1.37.0, 2,963 packages, 25,843 import edges)

The package-level View is **5.85 MB** of compact JSON (hugo: 0.28 MB), against 99 MB for the full IR. That is acceptable for one file. Declarations and source are added only for `-include` packages.

---

## The View contract (Go ↔ UI)

Written by `internal/export`, read by `web/src/data.ts`. Keys are part of the contract. `schema` is `"1"`.

```json
{
  "schema": "1",
  "kind": "project",
  "tool": "v0.1.0",
  "head": {"commit": "90cb22a…", "dirty": false},
  "modules": ["example.com/shop", "example.com/shop/tools/gen"],
  "nodes": [
    {"id": "example.com/shop/internal/store", "kind": "package", "module": "example.com/shop",
     "loc": {"path": "internal/store/db_linux.go", "line": 3}, "decls": 16, "unresolved": 4, "detail": true},
    {"id": "example.com/shop/internal/store.Repo", "kind": "type", "parent": "example.com/shop/internal/store",
     "exported": true, "typeKind": "struct", "loc": {"path": "internal/store/store.go", "line": 30}},
    {"id": "github.com/lib/pq", "kind": "external", "loc": {"path": "go.mod", "line": 6}}
  ],
  "edges": [
    {"from": "example.com/shop/internal/checkout", "to": "example.com/shop/internal/store",
     "kind": "imports", "count": 1, "loc": {"path": "internal/checkout/checkout.go", "line": 8}}
  ],
  "sources": {"internal/store/store.go": "package store\n…"},
  "links": {"blob": "https://github.com/o/r/blob/90cb22a…/{path}#L{line}"},
  "honesty": {"parseErrors": [], "unresolvedCalls": 10998, "unresolvedImports": 0, "unsupported": {".ts": 12}}
}
```

- `nodes`: every package and external, always. `type`/`function` nodes only for packages with `detail: true`. Sorted by `id`.
- `edges`: every `imports` edge, always. `calls`/`embeds` only when both ends are in `nodes`. `count` = number of source locations, `loc` = the first. Sorted by `from`, `to`, `kind`.
- `sources`: repo-relative path → file text, only for `detail` packages. Keys sorted (encoding/json does this).
- Part B adds `base`, `links.compare`, and `status` on nodes and edges (see Part B).

---

# Part A — Project View export (unblocked)

### Task 1: `-include` patterns and the root module

**Files:**
- Create: `internal/export/include.go`, `internal/export/include_test.go`

**Steps:**

- [ ] **Write the failing test**

   ```go
   package export

   import (
   	"testing"

   	"zu/internal/ir"
   )

   func TestPatternMatch(t *testing.T) {
   	const root = "example.com/shop"
   	cases := []struct {
   		pat, pkg string
   		want     bool
   	}{
   		{"example.com/shop/internal/store", "example.com/shop/internal/store", true},
   		{"example.com/shop/internal/store", "example.com/shop/internal/storex", false},
   		{"./internal/...", "example.com/shop/internal/store", true},
   		{"./internal/...", "example.com/shop/internal", true},
   		{"./internal/...", "example.com/shop/internalx", false},
   		{"./...", "example.com/shop", true},
   		{".", "example.com/shop", true},
   		{".", "example.com/shop/internal/store", false},
   		{"example.com/shop/tools/...", "example.com/shop/tools/gen", true},
   	}
   	for _, c := range cases {
   		p, err := ParsePattern(c.pat, root)
   		if err != nil {
   			t.Fatalf("ParsePattern(%q): %v", c.pat, err)
   		}
   		if got := p.Match(c.pkg); got != c.want {
   			t.Errorf("%q.Match(%q) = %v, want %v", c.pat, c.pkg, got, c.want)
   		}
   	}
   }

   func TestParsePatternRejects(t *testing.T) {
   	for _, s := range []string{"", "/abs/...", "./a/../b", "a//b", "a/", "./x"} {
   		root := "example.com/shop"
   		if s == "./x" {
   			root = "" // no root module: ./ has nothing to be relative to
   		}
   		if _, err := ParsePattern(s, root); err == nil {
   			t.Errorf("ParsePattern(%q, %q) accepted", s, root)
   		}
   	}
   }

   func TestRootModule(t *testing.T) {
   	doc := &ir.IR{Nodes: []ir.Node{
   		{ID: "example.com/shop/internal/store", Kind: ir.KindPackage, Module: "example.com/shop",
   			Locations: []ir.Location{{Path: "internal/store/store.go", Line: 1}}},
   		{ID: "example.com/gen", Kind: ir.KindPackage, Module: "example.com/gen",
   			Locations: []ir.Location{{Path: "tools/gen/gen.go", Line: 1}}},
   	}}
   	if got := RootModule(doc); got != "example.com/shop" {
   		t.Errorf("RootModule = %q, want example.com/shop", got)
   	}
   }
   ```

- [ ] **Run — expect FAIL** (`undefined: ParsePattern`)

   Run: `go test ./internal/export/`

- [ ] **Implement**

   ```go
   // Package export turns an IR into the data one HTML Export carries and writes
   // the self-contained file (decision 0006).
   package export

   import (
   	"fmt"
   	"path"
   	"strings"

   	"zu/internal/ir"
   )

   // Pattern selects packages by import path: "a/b" exactly, "a/b/..." for a/b and
   // everything below it. A leading "./" (or ".") means the root module.
   type Pattern struct {
   	path string
   	tree bool
   }

   // ParsePattern parses one -include value. rootModule is the module at the scan
   // root, or "" when there is none.
   func ParsePattern(s, rootModule string) (Pattern, error) {
   	bad := fmt.Errorf("-include %q: want an import path, optionally ending in /... (./ means the root module)", s)
   	p, tree := s, false
   	if rest, ok := strings.CutSuffix(p, "/..."); ok {
   		p, tree = rest, true
   	}
   	if p == "." || strings.HasPrefix(p, "./") {
   		if rootModule == "" {
   			return Pattern{}, fmt.Errorf("-include %q: no module at the scan root for ./ to refer to", s)
   		}
   		p = strings.TrimSuffix(rootModule+"/"+strings.TrimPrefix(strings.TrimPrefix(p, "."), "/"), "/")
   	}
   	if p == "" || strings.HasPrefix(p, "/") || strings.HasSuffix(p, "/") ||
   		strings.Contains(p, "//") || strings.Contains(p, "..") {
   		return Pattern{}, bad
   	}
   	return Pattern{path: p, tree: tree}, nil
   }

   // Match reports whether the package with import path pkg is selected.
   func (p Pattern) Match(pkg string) bool {
   	return pkg == p.path || p.tree && strings.HasPrefix(pkg, p.path+"/")
   }

   // RootModule returns the module whose directory is the scan root, derived from
   // any of its packages: id = module + "/" + rel and the package dir ends in rel.
   func RootModule(doc *ir.IR) string {
   	for _, n := range doc.Nodes {
   		if n.Kind != ir.KindPackage || len(n.Locations) == 0 {
   			continue
   		}
   		rel := strings.TrimPrefix(strings.TrimPrefix(n.ID, n.Module), "/")
   		dir := path.Dir(n.Locations[0].Path)
   		if rel == "" && dir == "." || rel != "" && dir == rel {
   			return n.Module
   		}
   	}
   	return ""
   }
   ```

- [ ] **Run — expect PASS**

   Run: `go test ./internal/export/ && go vet ./internal/export/`
   Expected: `ok  zu/internal/export`

- [ ] **Commit**

   ```bash
   git add internal/export/include.go internal/export/include_test.go
   git commit -m "Add -include import-path patterns for the HTML Export"
   ```

---

### Task 2: Build the Project View data from an IR

**Files:**
- Create: `internal/export/view.go`, `internal/export/project.go`, `internal/export/project_test.go`

**Steps:**

- [ ] **Write the failing tests.** Use the real fixture IR (`internal/scan/testdata/shop.golden.json`) so the test follows the scanner.

   ```go
   package export

   import (
   	"encoding/json"
   	"os"
   	"slices"
   	"strings"
   	"testing"

   	"zu/internal/ir"
   )

   func shopIR(t *testing.T) *ir.IR {
   	t.Helper()
   	b, err := os.ReadFile("../scan/testdata/shop.golden.json")
   	if err != nil {
   		t.Fatal(err)
   	}
   	var doc ir.IR
   	if err := json.Unmarshal(b, &doc); err != nil {
   		t.Fatal(err)
   	}
   	return &doc
   }

   func fakeRead(files map[string]bool) ReadFunc {
   	return func(p string) ([]byte, error) {
   		files[p] = true
   		return []byte("// " + p + "\n"), nil
   	}
   }

   func TestProjectPackageLevelOnlyByDefault(t *testing.T) {
   	read := map[string]bool{}
   	v, err := Project(shopIR(t), nil, fakeRead(read))
   	if err != nil {
   		t.Fatal(err)
   	}
   	for _, n := range v.Nodes {
   		if n.Kind != "package" && n.Kind != "external" {
   			t.Errorf("unexpected %s node %s without -include", n.Kind, n.ID)
   		}
   	}
   	for _, e := range v.Edges {
   		if e.Kind != "imports" {
   			t.Errorf("unexpected %s edge without -include", e.Kind)
   		}
   	}
   	if len(v.Sources) != 0 || len(read) != 0 {
   		t.Errorf("sources read without -include: %v", read)
   	}
   	store := find(t, v, "example.com/shop/internal/store")
   	if store.Decls == 0 || store.Unresolved != 4 || store.Detail {
   		t.Errorf("store = %+v, want decls>0, unresolved=4, detail=false", store)
   	}
   	if !slices.Equal(v.Modules, sortedModules(shopIR(t))) {
   		t.Errorf("modules = %v", v.Modules)
   	}
   }

   func TestProjectIncludeAddsDeclarationsAndTheirFiles(t *testing.T) {
   	doc := shopIR(t)
   	p, _ := ParsePattern("./internal/store", RootModule(doc))
   	read := map[string]bool{}
   	v, err := Project(doc, []Pattern{p}, fakeRead(read))
   	if err != nil {
   		t.Fatal(err)
   	}
   	if !find(t, v, "example.com/shop/internal/store").Detail {
   		t.Error("store not marked detail")
   	}
   	find(t, v, "example.com/shop/internal/store.Repo.Get") // methods come along
   	for _, n := range v.Nodes {
   		if n.Kind == "function" && strings.HasPrefix(n.ID, "example.com/shop/internal/checkout.") {
   			t.Errorf("checkout declaration %s leaked in", n.ID)
   		}
   	}
   	for p := range v.Sources {
   		if !strings.HasPrefix(p, "internal/store/") {
   			t.Errorf("source %s is not in the included package", p)
   		}
   	}
   	if len(v.Sources) == 0 {
   		t.Error("no sources for the included package")
   	}
   }

   func TestProjectRejectsNonLocalSourcePaths(t *testing.T) {
   	doc := &ir.IR{Nodes: []ir.Node{
   		{ID: "m", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{{Path: "a.go", Line: 1}}},
   		{ID: "m.F", Kind: ir.KindFunction, Parent: "m", Locations: []ir.Location{{Path: "../etc/passwd", Line: 1}}},
   	}}
   	p, _ := ParsePattern("m", "m")
   	if _, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{})); err == nil {
   		t.Error("a path outside the repository was read")
   	}
   }

   func find(t *testing.T, v *View, id string) Node {
   	t.Helper()
   	for _, n := range v.Nodes {
   		if n.ID == id {
   			return n
   		}
   	}
   	t.Fatalf("node %s missing", id)
   	return Node{}
   }

   func sortedModules(doc *ir.IR) []string {
   	var m []string
   	for _, n := range doc.Nodes {
   		if n.Kind == ir.KindPackage && !slices.Contains(m, n.Module) {
   			m = append(m, n.Module)
   		}
   	}
   	slices.Sort(m)
   	return m
   }
   ```

- [ ] **Run — expect FAIL** (`undefined: Project`)

   Run: `go test ./internal/export/`

- [ ] **Implement `view.go`**

   ```go
   package export

   import (
   	"cmp"
   	"slices"

   	"zu/internal/ir"
   	"zu/internal/version"
   )

   // ViewSchema is the version of the View document the UI reads.
   const ViewSchema = "1"

   // View is everything one HTML Export draws. Field order and JSON keys are the
   // contract with web/src/data.ts.
   type View struct {
   	Schema  string            `json:"schema"`
   	Kind    string            `json:"kind"` // "project" or "change"
   	Tool    string            `json:"tool"`
   	Head    ir.Ref            `json:"head"`
   	Base    *ir.Ref           `json:"base,omitempty"`
   	Modules []string          `json:"modules"`
   	Nodes   []Node            `json:"nodes"`
   	Edges   []Edge            `json:"edges"`
   	Sources map[string]string `json:"sources"`
   	Links   *Links            `json:"links,omitempty"`
   	Honesty Honesty           `json:"honesty"`
   }

   // Node is an IR node reduced to what a view draws.
   type Node struct {
   	ID         string      `json:"id"`
   	Kind       string      `json:"kind"`
   	Parent     string      `json:"parent,omitempty"`
   	Module     string      `json:"module,omitempty"`
   	Exported   *bool       `json:"exported,omitempty"`
   	TypeKind   string      `json:"typeKind,omitempty"`
   	Generated  bool        `json:"generated,omitempty"`
   	Loc        ir.Location `json:"loc"`
   	Decls      int         `json:"decls,omitempty"`      // packages: declarations in the IR
   	Unresolved int         `json:"unresolved,omitempty"` // packages: Unresolved Calls
   	Detail     bool        `json:"detail,omitempty"`     // packages: declarations and source are in this file
   	Status     string      `json:"status,omitempty"`     // Change View only
   }

   // Edge is an IR edge with its location count instead of every location.
   type Edge struct {
   	From   string      `json:"from"`
   	To     string      `json:"to"`
   	Kind   string      `json:"kind"`
   	Count  int         `json:"count"`
   	Loc    ir.Location `json:"loc"`
   	Status string      `json:"status,omitempty"`
   }

   // Honesty is what the view is not showing, always displayed in the header.
   type Honesty struct {
   	ParseErrors       []ir.ParseError `json:"parseErrors"`
   	UnresolvedCalls   int             `json:"unresolvedCalls"`
   	UnresolvedImports int             `json:"unresolvedImports"`
   	Unsupported       map[string]int  `json:"unsupported"`
   }

   func newView(kind string, doc *ir.IR) *View {
   	h := Honesty{ParseErrors: slices.Clone(doc.ParseErrors), Unsupported: map[string]int{}}
   	for _, c := range doc.UnresolvedCalls {
   		h.UnresolvedCalls += c
   	}
   	for _, c := range doc.UnresolvedImports {
   		h.UnresolvedImports += c
   	}
   	for k, c := range doc.Unsupported {
   		h.Unsupported[k] = c
   	}
   	if h.ParseErrors == nil {
   		h.ParseErrors = []ir.ParseError{}
   	}
   	return &View{
   		Schema: ViewSchema, Kind: kind, Tool: version.Version, Head: doc.Ref,
   		Modules: []string{}, Nodes: []Node{}, Edges: []Edge{}, Sources: map[string]string{},
   		Honesty: h,
   	}
   }

   func first(l []ir.Location) ir.Location {
   	if len(l) == 0 {
   		return ir.Location{}
   	}
   	return l[0]
   }

   func toNode(n *ir.Node) Node {
   	return Node{
   		ID: n.ID, Kind: string(n.Kind), Parent: n.Parent, Module: n.Module,
   		Exported: n.Exported, TypeKind: n.TypeKind, Generated: n.Generated, Loc: first(n.Locations),
   	}
   }

   func toEdge(e *ir.Edge) Edge {
   	return Edge{From: e.From, To: e.To, Kind: string(e.Kind), Count: len(e.Locations), Loc: first(e.Locations)}
   }

   // sortView puts every list in canonical order so the same input renders the
   // same bytes.
   func sortView(v *View) {
   	slices.Sort(v.Modules)
   	slices.SortFunc(v.Nodes, func(a, b Node) int { return cmp.Compare(a.ID, b.ID) })
   	slices.SortFunc(v.Edges, func(a, b Edge) int {
   		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
   	})
   	slices.SortFunc(v.Honesty.ParseErrors, func(a, b ir.ParseError) int {
   		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Message, b.Message))
   	})
   }
   ```

- [ ] **Implement `project.go`**

   ```go
   package export

   import (
   	"fmt"
   	"path/filepath"
   	"slices"

   	"zu/internal/ir"
   )

   // ReadFunc returns the content of a repo-relative, forward-slash path.
   type ReadFunc func(path string) ([]byte, error)

   // Project builds the Project View: every package and external with its import
   // edges, plus declarations, calls, embeds and source for included packages.
   func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
   	byID := make(map[string]*ir.Node, len(doc.Nodes))
   	for i := range doc.Nodes {
   		byID[doc.Nodes[i].ID] = &doc.Nodes[i]
   	}
   	pkgOf := func(id string) string { // walks method → type → package
   		for n := byID[id]; n != nil; n = byID[n.Parent] {
   			if n.Kind == ir.KindPackage {
   				return n.ID
   			}
   		}
   		return ""
   	}
   	detail, decls := map[string]bool{}, map[string]int{}
   	for i := range doc.Nodes {
   		n := &doc.Nodes[i]
   		switch n.Kind {
   		case ir.KindType, ir.KindFunction:
   			decls[pkgOf(n.ID)]++
   		case ir.KindPackage:
   			detail[n.ID] = slices.ContainsFunc(include, func(p Pattern) bool { return p.Match(n.ID) })
   		}
   	}

   	v := newView("project", doc)
   	modules, files, in := map[string]bool{}, map[string]bool{}, map[string]bool{}
   	for i := range doc.Nodes {
   		n := &doc.Nodes[i]
   		vn := toNode(n)
   		switch n.Kind {
   		case ir.KindPackage:
   			modules[n.Module] = true
   			vn.Decls, vn.Unresolved, vn.Detail = decls[n.ID], doc.UnresolvedCalls[n.ID], detail[n.ID]
   		case ir.KindType, ir.KindFunction:
   			if !detail[pkgOf(n.ID)] {
   				continue
   			}
   			for _, l := range n.Locations {
   				files[l.Path] = true
   			}
   		}
   		v.Nodes = append(v.Nodes, vn)
   		in[n.ID] = true
   	}
   	for m := range modules {
   		v.Modules = append(v.Modules, m)
   	}
   	for i := range doc.Edges {
   		e := &doc.Edges[i]
   		if e.Kind == ir.EdgeImports || in[e.From] && in[e.To] {
   			v.Edges = append(v.Edges, toEdge(e))
   		}
   	}
   	if err := addSources(v, files, read); err != nil {
   		return nil, err
   	}
   	sortView(v)
   	return v, nil
   }

   // addSources inlines each file, refusing any path that could leave the repository.
   func addSources(v *View, files map[string]bool, read ReadFunc) error {
   	paths := make([]string, 0, len(files))
   	for p := range files {
   		paths = append(paths, p)
   	}
   	slices.Sort(paths)
   	for _, p := range paths {
   		if !filepath.IsLocal(filepath.FromSlash(p)) {
   			return fmt.Errorf("source path %q is outside the repository", p)
   		}
   		b, err := read(p)
   		if err != nil {
   			return fmt.Errorf("read source %s: %w", p, err)
   		}
   		v.Sources[p] = string(b)
   	}
   	return nil
   }
   ```

- [ ] **Run — expect PASS**

   Run: `go test ./internal/export/ && go vet ./internal/export/`
   Expected: `ok  zu/internal/export`

- [ ] **Commit**

   ```bash
   git add internal/export/view.go internal/export/project.go internal/export/project_test.go
   git commit -m "Build the Project View data from an IR"
   ```

---

### Task 3: Render the View into the UI template

**Files:**
- Create: `internal/export/render.go`, `internal/export/render_test.go`, `internal/export/testdata/template.html`

**Steps:**

- [ ] **Create the fixture template** (stands in for `web/dist/index.html` so `go test ./...` never needs the UI built)

   ```html
   <!doctype html><html><head><title>t</title></head><body><script id="zu-data" type="application/json">{}</script><div id="root"></div></body></html>
   ```

- [ ] **Write the failing tests**

   ```go
   package export

   import (
   	"bytes"
   	"os"
   	"strings"
   	"testing"
   )

   func template(t *testing.T) []byte {
   	t.Helper()
   	b, err := os.ReadFile("testdata/template.html")
   	if err != nil {
   		t.Fatal(err)
   	}
   	return b
   }

   func TestRenderIsDeterministic(t *testing.T) {
   	doc := shopIR(t)
   	p, _ := ParsePattern("./...", RootModule(doc))
   	var a, b bytes.Buffer
   	for _, buf := range []*bytes.Buffer{&a, &b} {
   		v, err := Project(shopIR(t), []Pattern{p}, fakeRead(map[string]bool{}))
   		if err != nil {
   			t.Fatal(err)
   		}
   		if err := Render(buf, template(t), v); err != nil {
   			t.Fatal(err)
   		}
   	}
   	if !bytes.Equal(a.Bytes(), b.Bytes()) {
   		t.Error("two renders of the same IR differ")
   	}
   }

   func TestRenderCannotBreakOutOfTheDataElement(t *testing.T) {
   	v := newView("project", shopIR(t))
   	v.Sources["x.go"] = "s := \"</script><script>alert(1)</script><!--\" "
   	var out bytes.Buffer
   	if err := Render(&out, template(t), v); err != nil {
   		t.Fatal(err)
   	}
   	s := out.String()
   	if strings.Count(s, "</script>") != 1 || strings.Contains(s, "<!--") || strings.Contains(s, " ") {
   		t.Errorf("source text escaped the data element:\n%s", s)
   	}
   }

   func TestRenderNeedsExactlyOneMarker(t *testing.T) {
   	v := newView("project", shopIR(t))
   	for _, tmpl := range []string{"<html></html>", string(template(t)) + string(template(t))} {
   		if err := Render(&bytes.Buffer{}, []byte(tmpl), v); err == nil {
   			t.Errorf("accepted template %q", tmpl)
   		}
   	}
   }
   ```

- [ ] **Run — expect FAIL** (`undefined: Render`)

   Run: `go test ./internal/export/`

- [ ] **Implement**

   ```go
   package export

   import (
   	"bytes"
   	"encoding/json"
   	"fmt"
   	"io"
   )

   // Marker is the element Render fills. web/index.html carries it exactly once
   // and the built web/dist/index.html must still carry it (web/embed_test.go).
   var Marker = []byte(`<script id="zu-data" type="application/json">{}</script>`)

   // Render writes tmpl with the marker's "{}" replaced by v as JSON.
   // encoding/json's default HTML escaping turns <, > and & into < and so on,
   // and escapes U+2028/U+2029, so no source text can close the script element or
   // open a comment. Do not call SetEscapeHTML(false) here (ir.Encode does, for
   // readability; this output is HTML).
   func Render(w io.Writer, tmpl []byte, v *View) error {
   	if n := bytes.Count(tmpl, Marker); n != 1 {
   		return fmt.Errorf("UI template has %d data markers, want 1", n)
   	}
   	sortView(v)
   	data, err := json.Marshal(v)
   	if err != nil {
   		return err
   	}
   	open := len(Marker) - len("{}</script>")
   	i := bytes.Index(tmpl, Marker)
   	for _, part := range [][]byte{tmpl[:i+open], data, tmpl[i+open+len("{}"):]} {
   		if _, err := w.Write(part); err != nil {
   			return err
   		}
   	}
   	return nil
   }
   ```

- [ ] **Run — expect PASS**

   Run: `go test ./internal/export/`
   Expected: `ok  zu/internal/export`

- [ ] **Commit**

   ```bash
   git add internal/export/render.go internal/export/render_test.go internal/export/testdata/template.html
   git commit -m "Render the View into the single-file UI template"
   ```

---

### Task 4: Source links from the origin remote (B6)

**Files:**
- Create: `internal/export/links.go`, `internal/export/links_test.go`
- Modify: `internal/gitref/gitref.go` (add `Origin`), `internal/gitref/gitref_test.go`

**Steps:**

- [ ] **Write the failing tests**

   ```go
   package export

   import (
   	"testing"

   	"zu/internal/ir"
   )

   func TestForRepo(t *testing.T) {
   	const c = "90cb22a1b2c3d4e5f60718293a4b5c6d7e8f9012"
   	clean := ir.Ref{Commit: c}
   	cases := []struct {
   		name, origin, tmpl string
   		ref                ir.Ref
   		want               string // "" = no links
   	}{
   		{"github ssh", "git@github.com:xbklairith/zu.git", "", clean, "https://github.com/xbklairith/zu/blob/" + c + "/{path}#L{line}"},
   		{"github https with token", "https://x-access-token:SECRET@github.com/o/r.git", "", clean, "https://github.com/o/r/blob/" + c + "/{path}#L{line}"},
   		{"gitlab ssh url, subgroup", "ssh://git@gitlab.com/g/sub/r.git", "", clean, "https://gitlab.com/g/sub/r/-/blob/" + c + "/{path}#L{line}"},
   		{"unknown host", "git@git.example.com:o/r.git", "", clean, ""},
   		{"template wins", "git@git.example.com:o/r.git", "https://git.example.com/o/r/src/{commit}/{path}#L{line}", clean, "https://git.example.com/o/r/src/" + c + "/{path}#L{line}"},
   		{"dirty", "git@github.com:o/r.git", "", ir.Ref{Commit: c, Dirty: true}, ""},
   		{"no commit", "git@github.com:o/r.git", "", ir.Ref{}, ""},
   		{"no origin", "", "", clean, ""},
   	}
   	for _, tc := range cases {
   		l, err := ForRepo(tc.origin, tc.ref, tc.tmpl)
   		if err != nil {
   			t.Fatalf("%s: %v", tc.name, err)
   		}
   		got := ""
   		if l != nil {
   			got = l.Blob
   		}
   		if got != tc.want {
   			t.Errorf("%s: blob = %q, want %q", tc.name, got, tc.want)
   		}
   	}
   }

   func TestForRepoRejectsUnsafeTemplates(t *testing.T) {
   	for _, tmpl := range []string{"http://h/{path}", "javascript:alert(1)//{path}", "https://h/no-path"} {
   		if _, err := ForRepo("", ir.Ref{Commit: "abc"}, tmpl); err == nil {
   			t.Errorf("accepted -link-template %q", tmpl)
   		}
   	}
   }
   ```

   In `internal/gitref/gitref_test.go` add `TestOrigin`: init a repo in `t.TempDir()`, `git remote add origin git@github.com:o/r.git`, and expect `Origin(ctx, dir) == "git@github.com:o/r.git"`; a repo with no remote gives `""`.

- [ ] **Run — expect FAIL** (`undefined: ForRepo`, `undefined: Origin`)

   Run: `go test ./internal/export/ ./internal/gitref/`

- [ ] **Implement `gitref.Origin`** (append to `internal/gitref/gitref.go`)

   ```go
   // Origin returns the URL of the "origin" remote, or "" when there is none.
   // It may carry credentials; callers must not copy it into output as-is.
   func Origin(ctx context.Context, dir string) string {
   	out, err := git(ctx, dir, "remote", "get-url", "origin")
   	if err != nil {
   		return ""
   	}
   	return strings.TrimSpace(out)
   }
   ```

- [ ] **Implement `links.go`**

   ```go
   package export

   import (
   	"errors"
   	"net/url"
   	"strings"

   	"zu/internal/ir"
   )

   // Links are URL templates the UI fills with {path} and {line}. Compare is set
   // only in a Change View.
   type Links struct {
   	Blob    string `json:"blob"`
   	Compare string `json:"compare,omitempty"`
   }

   // ForRepo returns link templates for head, or nil when a link would mislead:
   // no commit, uncommitted changes, or an origin zu cannot map and no template.
   // Only host and path of origin are used, so credentials in it never reach the file.
   func ForRepo(origin string, head ir.Ref, template string) (*Links, error) {
   	if template != "" {
   		if !strings.HasPrefix(template, "https://") || !strings.Contains(template, "{path}") {
   			return nil, errors.New("-link-template must start with https:// and contain {path}")
   		}
   	}
   	if head.Commit == "" || head.Dirty {
   		return nil, nil
   	}
   	if template != "" {
   		return &Links{Blob: strings.ReplaceAll(template, "{commit}", head.Commit)}, nil
   	}
   	host, repo := parseRemote(origin)
   	switch {
   	case host == "github.com":
   		return &Links{Blob: "https://github.com/" + repo + "/blob/" + head.Commit + "/{path}#L{line}"}, nil
   	case host == "gitlab.com":
   		return &Links{Blob: "https://gitlab.com/" + repo + "/-/blob/" + head.Commit + "/{path}#L{line}"}, nil
   	}
   	return nil, nil
   }

   // parseRemote returns host and repository path from an https, ssh or scp-style
   // remote URL, dropping any user or password.
   func parseRemote(origin string) (host, repo string) {
   	s := strings.TrimSuffix(strings.TrimSpace(origin), ".git")
   	if strings.Contains(s, "://") {
   		u, err := url.Parse(s)
   		if err != nil {
   			return "", ""
   		}
   		return u.Hostname(), strings.Trim(u.Path, "/")
   	}
   	at, colon := strings.Index(s, "@"), strings.Index(s, ":")
   	if colon < 0 || at > colon {
   		return "", ""
   	}
   	return s[at+1 : colon], strings.Trim(s[colon+1:], "/")
   }
   ```

- [ ] **Run — expect PASS**

   Run: `go test ./internal/export/ ./internal/gitref/`
   Expected: both `ok`

- [ ] **Commit**

   ```bash
   git add internal/export/links.go internal/export/links_test.go internal/gitref/gitref.go internal/gitref/gitref_test.go
   git commit -m "Derive source links from the origin remote, never its credentials"
   ```

---

### Task 5: `zu scan -html FILE [-include P]… [-link-template T]`

**Files:**
- Modify: `internal/cli/scan.go` (flags at lines 32–35, output after the IR write at lines 76–80)
- Create: `internal/cli/html.go`, `internal/cli/html_test.go`

**Behaviour:**
- `scan` still writes the IR exactly as today (`-out -` still works). `-html` writes the export afterwards, atomically.
- `-include` and `-link-template` without `-html` → exit 3. `-html -` → exit 3 (stdout carries the IR with `-out -`).
- The UI template comes from `web.Assets()`'s `index.html`. If it is missing or still the placeholder, exit 3 with: `zu scan: this zu was built without the UI; build it with make build`.
- stderr gets one more line: `zu scan: html → FILE (N source files inlined; share it only where that code may go)`.
- A parse-error exit 2 still happens after the HTML is written.

**Steps:**

- [ ] **Write the failing tests** in `internal/cli/html_test.go`. Reuse `repo`, `small`, `git` and `needGit` from `scan_test.go`, and set the `uiTemplate` seam to `internal/export/testdata/template.html`'s bytes. Cases:
   1. `scan <dir> -html out.html -include ./a`: exit 0; `out.html` contains `"id":"example.com/m/a.F"` and `"a/a.go":`; `.zu/ir/worktree.json` still exists.
   2. `-include ./a` without `-html` → exit 3; `-html -` → exit 3; `-include /x` → exit 3 with `-include` in stderr.
   3. With `uiTemplate` returning the "built without the UI" error → exit 3, stderr contains `make build`, no `out.html`.
   4. In a git repo with `origin` = `https://user:pw@github.com/o/r.git` and a clean commit: `out.html` contains `https://github.com/o/r/blob/` and does not contain `pw@`.

- [ ] **Run — expect FAIL**

   Run: `go test ./internal/cli/ -run HTML`

- [ ] **Implement `internal/cli/html.go`**

   ```go
   package cli

   import (
   	"bytes"
   	"context"
   	"errors"
   	"fmt"
   	"io"
   	"io/fs"
   	"os"
   	"path/filepath"
   	"strings"

   	"zu/internal/export"
   	"zu/internal/gitref"
   	"zu/internal/ir"
   	"zu/web"
   )

   // Seams for tests: the built UI page and the origin remote.
   var (
   	uiTemplate = builtTemplate
   	gitOrigin  = gitref.Origin
   )

   // listFlag collects a repeatable flag.
   type listFlag []string

   func (l *listFlag) String() string     { return strings.Join(*l, ",") }
   func (l *listFlag) Set(s string) error { *l = append(*l, s); return nil }

   type htmlOptions struct {
   	path     string
   	include  listFlag
   	linkTmpl string
   }

   func (o *htmlOptions) validate() error {
   	switch {
   	case o.path == "" && (len(o.include) > 0 || o.linkTmpl != ""):
   		return errors.New("-include and -link-template need -html")
   	case o.path == "-":
   		return errors.New("-html needs a file path")
   	}
   	return nil
   }

   func builtTemplate() ([]byte, error) {
   	assets, err := web.Assets()
   	if err != nil {
   		return nil, err
   	}
   	b, err := fs.ReadFile(assets, "index.html")
   	if errors.Is(err, fs.ErrNotExist) || err == nil && !bytes.Contains(b, export.Marker) {
   		return nil, errors.New("this zu was built without the UI; build it with make build")
   	}
   	return b, err
   }

   // writeHTML writes the Project View export of doc (already sorted by ir.Encode).
   func writeHTML(ctx context.Context, dir string, doc *ir.IR, o *htmlOptions, stderr io.Writer) error {
   	tmpl, err := uiTemplate()
   	if err != nil {
   		return err
   	}
   	root := export.RootModule(doc)
   	var pats []export.Pattern
   	for _, s := range o.include {
   		p, err := export.ParsePattern(s, root)
   		if err != nil {
   			return err
   		}
   		pats = append(pats, p)
   	}
   	read := func(p string) ([]byte, error) {
   		return os.ReadFile(filepath.Join(dir, filepath.FromSlash(p))) // #nosec G304 -- repo-relative IR path, checked by export
   	}
   	v, err := export.Project(doc, pats, read)
   	if err != nil {
   		return err
   	}
   	if v.Links, err = export.ForRepo(gitOrigin(ctx, dir), doc.Ref, o.linkTmpl); err != nil {
   		return err
   	}
   	var buf bytes.Buffer
   	if err := export.Render(&buf, tmpl, v); err != nil {
   		return err
   	}
   	if err := writeAtomic(o.path, buf.Bytes()); err != nil {
   		return err
   	}
   	fmt.Fprintf(stderr, "zu scan: html → %s (%d source files inlined; share it only where that code may go)\n",
   		o.path, len(v.Sources))
   	return nil
   }
   ```

- [ ] **Wire into `runScan`** (`internal/cli/scan.go`)

   ```go
   	// after the existing flag definitions (line 35):
   	var hopts htmlOptions
   	fs.StringVar(&hopts.path, "html", "", "also write a self-contained HTML Project View to `file`")
   	fs.Var(&hopts.include, "include", "inline declarations and source of packages matching `pattern` (repeatable; ./ = root module)")
   	fs.StringVar(&hopts.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")

   	// after the -max-parse-errors check (line 46):
   	if err := hopts.validate(); err != nil {
   		fmt.Fprintf(stderr, "zu scan: %v\n", err)
   		return ExitBadInvocation
   	}

   	// after the IR write succeeds and before the summary line (line 81):
   	if hopts.path != "" {
   		if err := writeHTML(ctx, dir, doc, &hopts, stderr); err != nil {
   			fmt.Fprintf(stderr, "zu scan: html: %v\n", err)
   			return ExitBadInvocation
   		}
   	}
   ```
   Also update the `runScan` doc comment to list the new flags.

- [ ] **Run — expect PASS; run the whole suite and lint**

   Run: `go test -race ./... && golangci-lint run ./...`
   Expected: all `ok`, no lint findings.

- [ ] **Commit**

   ```bash
   git add internal/cli/scan.go internal/cli/html.go internal/cli/html_test.go
   git commit -m "Add zu scan -html to write a self-contained Project View"
   ```

---

### Task 6: UI toolchain — single file, CSP, data element, tests

**Files:**
- Modify: `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/tsconfig.json`, `web/embed_test.go`, `Makefile`
- Create: `web/src/data.ts`, `web/src/data.test.ts`

**Steps:**

- [ ] **Add dependencies** (pinned by the lockfile)

   Run: `cd web && npm install @xyflow/react@^12.11.6 elkjs@^0.12.0 && npm install -D vite-plugin-singlefile@^2.3.3 vitest@^5.0.1`
   Then add `"test": "vitest run"` to `scripts` in `web/package.json`.

- [ ] **Data element in `web/index.html`**, just before `<div id="root">`. No web fonts: the export uses system font stacks only.

   ```html
   <script id="zu-data" type="application/json">{}</script>
   ```

- [ ] **`web/vite.config.ts`**

   ```ts
   /// <reference types="vitest/config" />
   import { defineConfig, type Plugin } from "vite";
   import react from "@vitejs/plugin-react";
   import { viteSingleFile } from "vite-plugin-singlefile";

   // The export may load nothing (decision 0006): scripts and styles are inlined
   // by viteSingleFile and this policy forbids every fetch. Build only, so dev
   // keeps HMR. public/.gitkeep is still copied through, so dist/ is never empty.
   const csp: Plugin = {
     name: "zu-csp",
     apply: "build",
     transformIndexHtml: () => [
       {
         tag: "meta",
         attrs: {
           "http-equiv": "Content-Security-Policy",
           content:
             "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
         },
         injectTo: "head-prepend",
       },
     ],
   };

   export default defineConfig({
     plugins: [react(), viteSingleFile(), csp],
     build: { outDir: "dist", emptyOutDir: true },
     test: { environment: "node", include: ["src/**/*.test.ts"] },
   });
   ```

- [ ] **Write the failing test** `web/src/data.test.ts`. It reads the Go golden from Task 7 once that exists. For now it covers only the schema gate.

   ```ts
   import { describe, expect, it } from "vitest";
   import { parseView } from "./data";

   describe("parseView", () => {
     it("refuses a schema it does not know", () => {
       expect(() => parseView('{"schema":"2"}')).toThrow(/schema 2/);
     });
     it("accepts schema 1", () => {
       expect(parseView('{"schema":"1","nodes":[],"edges":[]}').schema).toBe("1");
     });
   });
   ```

- [ ] **Run — expect FAIL**, then **implement `web/src/data.ts`**

   ```ts
   // The View document written by internal/export (Go). Keys are the contract.
   export type Loc = { path: string; line: number };
   export type NodeKind = "package" | "type" | "function" | "external";
   export type ViewNode = {
     id: string; kind: NodeKind; parent?: string; module?: string; exported?: boolean;
     typeKind?: string; generated?: boolean; loc: Loc; decls?: number; unresolved?: number;
     detail?: boolean; status?: string;
   };
   export type ViewEdge = {
     from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
   };
   export type Ref = { commit: string; dirty: boolean };
   export type View = {
     schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref;
     modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
     links?: { blob: string; compare?: string };
     honesty: {
       parseErrors: { path: string; message: string }[]; unresolvedCalls: number;
       unresolvedImports: number; unsupported: Record<string, number>;
     };
   };

   export const SCHEMA = "1";

   export function parseView(text: string): View {
     const v = JSON.parse(text);
     if (v?.schema !== SCHEMA) {
       throw new Error(`zu view schema ${v?.schema ?? "missing"}; this page reads schema ${SCHEMA}`);
     }
     return v as View;
   }

   // readEmbedded returns the View zu wrote into the page, or null for the bare template.
   export function readEmbedded(doc: Document): View | null {
     const text = doc.getElementById("zu-data")?.textContent?.trim();
     return !text || text === "{}" ? null : parseView(text);
   }
   ```

- [ ] **Guard the built page in Go.** Add to `web/embed_test.go` (it skips when the UI is not built, so `go test ./...` still works without it):

   ```go
   func TestBuiltPageIsSelfContained(t *testing.T) {
   	assets, err := Assets()
   	if err != nil {
   		t.Fatal(err)
   	}
   	b, err := fs.ReadFile(assets, "index.html")
   	if err != nil {
   		t.Skip("UI not built (make web)")
   	}
   	page := string(b)
   	if n := strings.Count(page, `<script id="zu-data" type="application/json">{}</script>`); n != 1 {
   		t.Errorf("data marker count = %d, want 1", n)
   	}
   	for _, bad := range []string{"<script src", "<link", "url(http", "@import", "fonts.googleapis", "fonts.gstatic"} {
   		if strings.Contains(page, bad) {
   			t.Errorf("built page loads an external resource: %q", bad)
   		}
   	}
   	if !strings.Contains(page, "Content-Security-Policy") {
   		t.Error("built page has no CSP")
   	}
   }
   ```
   (`<link` is checked broadly. The page needs none, and a favicon `<link>` would cause a request.)

- [ ] **Makefile**: add `test-web` and make `check` build and test the UI.

   ```make
   test-web: ## Run UI unit tests
   	cd web && npm test

   check: web lint test test-web ## Everything CI runs
   ```
   Add `test-web` to `.PHONY`.

- [ ] **Verify**

   Run: `make web && go test ./web/ -run SelfContained -v && cd web && npm test`
   Expected: `--- PASS: TestBuiltPageIsSelfContained`; vitest `2 passed`; `web/dist/index.html` is one file and `web/dist/assets/` does not exist.

- [ ] **Commit**

   ```bash
   git add web/package.json web/package-lock.json web/vite.config.ts web/index.html web/src/data.ts web/src/data.test.ts web/embed_test.go Makefile
   git commit -m "Build the UI as one self-contained page with a data element and CSP"
   ```

---

### Task 7: Golden View fixture shared by Go and the UI

**Files:**
- Create: `internal/export/golden_test.go`, `internal/export/testdata/shop.view.golden.json`
- Modify: `web/src/data.test.ts`, `web/src/main.tsx`

**Steps:**

- [ ] **Write a golden test** that builds `Project(shopIR, ./internal/store, fakeRead)` and compares `json.MarshalIndent(v, "", "  ")` to `testdata/shop.view.golden.json`, with `-update` to rewrite it (same pattern as `internal/scan`'s golden). Set `version.Version` to `"test"` for the test so the golden does not depend on the build.
- [ ] **Run with `-update`, review the diff, run without it**

   Run: `go test ./internal/export -run Golden -update && git diff --stat && go test ./internal/export`
   Expected: `ok`

- [ ] **UI reads the same fixture.** Add to `data.test.ts`:

   ```ts
   import golden from "../../internal/export/testdata/shop.view.golden.json";
   it("parses the Go golden", () => {
     const v = parseView(JSON.stringify(golden));
     expect(v.nodes.some((n) => n.id === "example.com/shop/internal/store.Repo")).toBe(true);
   });
   ```
   Add `"resolveJsonModule": true` to `web/tsconfig.json`.

- [ ] **Dev mode shows the fixture.** Vite serves only `web/` by default, so add `server: { fs: { allow: [".."] } }` to `vite.config.ts`. Then in `main.tsx`, when `readEmbedded(document)` is null and `import.meta.env.DEV`, `await import("../../internal/export/testdata/shop.view.golden.json")`. The dead branch is dropped from the build. In a build with no data, render "This page carries no zu data. Create one with `zu scan -html FILE`."
- [ ] **Verify**: `cd web && npm test && npm run build`. Expected: 3 passed; the build succeeds and `grep -c "example.com/shop" dist/index.html` prints `0` (the fixture is not bundled).
- [ ] **Commit**: `git add internal/export/golden_test.go internal/export/testdata/shop.view.golden.json web/src/data.test.ts web/src/main.tsx web/tsconfig.json && git commit -m "Share a golden View between the Go export and the UI"`

---

### Task 8: Package Tree, drill-in and auto-collapse (pure logic)

**Files:**
- Create: `web/src/tree.ts`, `web/src/tree.test.ts`

**Rules (from ADR 0008, Q4, and Deviations 1, 2 and 7):**
- A **box id** is a module path or a module path plus one or more segments. Every package id is a box; so is every prefix between its module and itself. A package box can also contain child boxes.
- The **focus** is a box id, or `""` for the page root, whose children are the module roots.
- **Leaves at relative depth d** under the focus: for each package under the focus, its ancestor-or-self box at most d levels below the focus. A package whose id equals the focus is the container, not a leaf. Its declarations appear as leaves when it has `detail`.
- **Containers:** every box strictly between the focus and a leaf is drawn as a container around its leaves ("a package is drawn inside its nearest ancestor segment", ADR 0008). `containers(view, focus, depth)` returns them with their parent box.
- **Auto depth:** start at d = 1 and increase while the leaves at d + 1 number ≤ 60 and are more than at d. If d = 1 already has > 60, draw them with a note.
- **Endpoint mapping:** a package maps to its leaf box. A package outside the focus maps to `"outside"`. Externals map to themselves when ≤ 20 of them are touched by the drawn edges, otherwise to `"externals"`.
- **Bundles:** import edges mapped to (leaf, leaf) pairs. `pairs` = number of distinct package pairs. Self-loops are dropped. Output is sorted.
- **Declarations:** when the focus is a package with `detail`, its types and functions are leaves too. Methods sit inside their type (as rows, not nodes). Calls and embeds between them are bundled to type/function leaves.

**Steps:**

- [ ] **Write the failing tests** (synthetic ids that mirror the corpus shapes)

   ```ts
   import { describe, expect, it } from "vitest";
   import { autoDepth, bundles, leavesAt, parentBox } from "./tree";
   import type { View } from "./data";

   const pkgs = (ids: string[], module: string) =>
     ids.map((id) => ({ id, kind: "package" as const, module, loc: { path: "x.go", line: 1 } }));
   const view = (nodes: View["nodes"], edges: View["edges"] = []): View =>
     ({ schema: "1", kind: "project", tool: "t", head: { commit: "", dirty: false },
        modules: [...new Set(nodes.map((n) => n.module!).filter(Boolean))].sort(),
        nodes, edges, sources: {},
        honesty: { parseErrors: [], unresolvedCalls: 0, unresolvedImports: 0, unsupported: {} } });

   describe("Package Tree", () => {
     it("hugo shape: one module opens at its 37 top-level segments", () => {
       const ids = Array.from({ length: 37 }, (_, i) =>
         Array.from({ length: 4 }, (_, j) => `g.io/hugo/s${i}/p${j}`)).flat();
       const v = view(pkgs(ids, "g.io/hugo"));
       expect(autoDepth(v, "")).toBe(2);
       expect(leavesAt(v, "", 2)).toHaveLength(37);
     });
     it("kubernetes shape: 38 modules open at the modules", () => {
       const nodes = Array.from({ length: 38 }, (_, m) =>
         pkgs(Array.from({ length: 6 }, (_, j) => `k8s.io/m${m}/d${j}/x`), `k8s.io/m${m}`)).flat();
       const v = view(nodes);
       expect(autoDepth(v, "")).toBe(1);
       expect(leavesAt(v, "", 1)).toHaveLength(38);
     });
     it("draws an oversized first level anyway", () => {
       const v = view(pkgs(Array.from({ length: 70 }, (_, i) => `m/p${i}`), "m"));
       expect(autoDepth(v, "m")).toBe(1);
       expect(leavesAt(v, "m", 1)).toHaveLength(70);
     });
     it("Esc goes to the parent box, then to the root", () => {
       const v = view(pkgs(["m/a/b"], "m"));
       expect(parentBox(v, "m/a/b")).toBe("m/a");
       expect(parentBox(v, "m")).toBe("");
     });
     it("bundles imports to leaves, counts package pairs, maps outside and externals", () => {
       const nodes: View["nodes"] = [...pkgs(["m/a/x", "m/a/y", "m/b/z"], "m"), ...pkgs(["n/q"], "n"),
         ...Array.from({ length: 21 }, (_, i) => ({ id: `ext${i}`, kind: "external" as const, loc: { path: "go.mod", line: 1 } }))];
       const imp = (from: string, to: string) => ({ from, to, kind: "imports" as const, count: 1, loc: { path: "x.go", line: 1 } });
       const v = view(nodes, [imp("m/a/x", "m/b/z"), imp("m/a/y", "m/b/z"), imp("m/a/x", "m/a/y"), imp("m/b/z", "n/q"),
         ...Array.from({ length: 21 }, (_, i) => imp("m/a/x", `ext${i}`))]);
       expect(bundles(v, "m", 1)).toEqual([
         { from: "m/a", to: "externals", pairs: 21 },
         { from: "m/a", to: "m/b", pairs: 2 },
         { from: "m/b", to: "outside", pairs: 1 },
       ]);
     });
   });
   ```

- [ ] **Run — expect FAIL**, then **implement `tree.ts`**. Required exports: `boxesOf(view)` (memoized box index), `leavesAt(view, focus, depth): string[]` (sorted), `autoDepth(view, focus): number`, `parentBox(view, box): string`, `bundles(view, focus, depth): {from, to, pairs}[]` (sorted by from, then to), `declLeaves(view, pkg)`, and `EXTERNAL_BUDGET = 20`, `BOX_BUDGET = 60`. The module a package belongs to is its `module` field. The segments are `id.slice(module.length + 1).split("/")`.
- [ ] **Run — expect PASS**: `cd web && npm test` → all passed; `npm run typecheck` clean.
- [ ] **Commit**: `git add web/src/tree.ts web/src/tree.test.ts && git commit -m "Derive the Package Tree, drill-in and auto-collapse from node ids"`

---

### Task 9: Deterministic layout

**Files:**
- Create: `web/src/layout.ts`, `web/src/layout.test.ts`

**Rules:** ELK `layered`, `elk.direction: DOWN` (importer above imported), `elk.randomSeed: 1`, `elk.layered.considerModelOrder.strategy: NODES_AND_EDGES`, `elk.hierarchyHandling: INCLUDE_CHILDREN`. Containers from `tree.containers` become ELK compound nodes with their leaves as `children` (padding 12, 24 on top for the label). Edges attach to leaves. Nodes and edges go in sorted by id. Node sizes come from the label length (7.5 px per character + 24, clamped to 90–280, height 40), never from DOM measurement, so layout does not depend on fonts. Use `elkjs/lib/elk.bundled.js` on the main thread (Deviation 5).

**Steps:**

- [ ] **Write the failing test**: lay out `bundles(golden, "", autoDepth)` twice and expect equal positions (`toEqual`); every node gets finite `x` and `y`; the same input in shuffled order gives the same positions.
- [ ] **Run — expect FAIL**, then **implement** `layout(items: {id; label; parent?: string; shape: "container" | "box" | "oval" | "decl" | "outside"}[], edges): Promise<Map<id, {x, y, w, h, parent?}>>`. Positions are relative to the parent, matching React Flow's `parentId`.
- [ ] **Run — expect PASS**: `cd web && npm test`.
- [ ] **Commit**: `git add web/src/layout.ts web/src/layout.test.ts && git commit -m "Lay out views deterministically with ELK"`

---

### Task 10: Canvas, header and drill navigation

**Files:**
- Create: `web/src/App.tsx`, `web/src/Canvas.tsx`, `web/src/Header.tsx`, `web/src/styles.css`
- Modify: `web/src/main.tsx`

**Behaviour:**
- **Header:** `Project View · <modules, comma-separated, at most 3 then "+N"> @ <commit12>` (or "worktree", plus "uncommitted changes" when dirty).
- **Honesty banner (always shown):** `N parse errors · M unresolved calls not drawn · K unresolved imports · unsupported: .ts 12, .sh 1`. Clicking parse errors lists path: message.
- **Sensitivity:** a fixed line: `Contains source from this repository.`
- **Breadcrumb:** the focus path, each segment clickable. Below it: `N boxes at depth d. Double-click to open a box, Esc to go up.` If more than 60 boxes are shown, add `more than 60 boxes, drawn anyway`.
- **Canvas (React Flow):**
  - Custom node types: `box` shows the label, a declaration count and an unresolved-calls count. `oval` is an external. `outside` is dimmed. `decl` is a type or function, with method rows inside a type.
  - Edges are straight or smoothstep, with the pair count as the label when > 1.
  - Controls allow pan, zoom and fit (U1). The view is fit on every focus change.
  - `onNodeDoubleClick` on a box sets the focus. A package without `detail` shows an empty-state card inside the canvas: `Declarations not included. Re-run with -include <id>`.
  - Esc sets the focus to `parentBox`. Clicking a node selects it.
- Styling uses system font stacks and CSS custom properties for light and dark, with no web fonts.

**Steps:**

- [ ] **Implement** the components above. Keep all logic in `tree.ts`/`layout.ts`, and keep components thin.
- [ ] **Verify** by running the dev server against the golden (`cd web && npx vite`), then in the browser:
  - Shop has fewer than 60 packages, so the page opens with every package drawn inside its segment containers (`internal` holds `checkout`, `money` and `store`).
  - Double-clicking `store` shows its declarations with `Repo` holding the methods `Get`, `Reset` and `check`.
  - Double-clicking `checkout` shows the "Declarations not included" card.
  - Esc returns up one level at a time.
  - The honesty banner shows 1 parse error, 8 unresolved calls, 1 unresolved import, and unsupported `.sh 1, .ts 1`.
- [ ] **Run**: `cd web && npm run typecheck && npm test && npm run build && cd .. && go test ./web/`
- [ ] **Commit**: `git add web/src/App.tsx web/src/Canvas.tsx web/src/Header.tsx web/src/styles.css web/src/main.tsx && git commit -m "Draw the Project View with drill-in navigation and the honesty banner"`

---

### Task 11: Side panel with source and links

**Files:**
- Create: `web/src/Panel.tsx`, `web/src/links.ts`, `web/src/links.test.ts`

**Behaviour:**
- **Package or segment box:** id, file:line, declaration count, Unresolved Calls, imports out and imported-by lists (package ids with counts), and a "View at <commit12>" link.
- **Declaration:** kind, id, file:line, calls in and out, and the source file with line numbers, scrolled to and highlighting `loc.line`. Source is React text children only: no `dangerouslySetInnerHTML`, no markup parsing.
- **External:** module path and importers. **Outside/externals aggregate:** the list of real targets with counts.
- **Links:** `linkFor(links, path, line)` fills `{path}` (each segment passed through `encodeURIComponent`) and `{line}`. It returns `null` unless the result starts with `https://`. Links render with `target="_blank" rel="noopener noreferrer"`.

**Steps:**

- [ ] **Write the failing tests** for `linkFor`:
  - GitHub template plus `internal/a b/x.go` gives `…/internal/a%20b/x.go#L12`.
  - A template that is not https gives `null`.
  - `links` undefined gives `null`.
- [ ] **Run — expect FAIL**, implement `links.ts`, then `Panel.tsx`.
- [ ] **Verify** in the dev server:
  - Selecting `store.Repo.Get` shows `store.go` scrolled to line 43, highlighted.
  - A source line containing `<b>` renders literally.
- [ ] **Run**: `cd web && npm run typecheck && npm test`
- [ ] **Commit**: `git add web/src/Panel.tsx web/src/links.ts web/src/links.test.ts && git commit -m "Show source, edges and host links in the side panel"`

---

### Task 12: Part A acceptance

**Steps:**

- [ ] **Build and export zu itself**

   Run: `make check && make build && bin/zu scan -html /tmp/zu-self.html -include ./internal/...`
   Expected: exit 0; stderr ends with the `html → /tmp/zu-self.html (N source files inlined …)` line.

- [ ] **Determinism**

   Run: `bin/zu scan -out /dev/null -html /tmp/a.html -include ./... && bin/zu scan -out /dev/null -html /tmp/b.html -include ./... && shasum /tmp/a.html /tmp/b.html`
   Expected: identical hashes.

- [ ] **Corpus** (`scripts/bench-corpus.sh` has cloned them into `.zu/corpus/`)

   Run: `bin/zu scan .zu/corpus/hugo@v0.166.0 -out /dev/null -html /tmp/hugo.html -include ./hugolib && bin/zu scan .zu/corpus/kubernetes@v1.37.0 -out /dev/null -html /tmp/k8s.html && ls -l /tmp/hugo.html /tmp/k8s.html`
   Expected: `k8s.html` < 8 MB; hugo opens at 37 boxes and kubernetes at 38 modules plus one "111 external modules" oval.

- [ ] **Offline and browsers.** Open each file from `file://` in Chrome, Firefox and Safari. Check:
  - the DevTools console shows no CSP violations;
  - the Network panel shows only the document itself;
  - first paint is under 3 s for `k8s.html`, measured with the Performance panel.
- [ ] **Record evidence** in `docx/features/04-html-export/acceptance.md`: sizes, hashes, timings, and browser results.
- [ ] **Commit**: `git add docx/features/04-html-export/acceptance.md && git commit -m "Record HTML Export Project View acceptance evidence"`

---

# Part B — Change View export (blocked on 02 and 03)

**Start only when feature 02 (scan at a ref) and feature 03 (diff to CI) are merged. Then revise these tasks against their real types.** They are written against glossary terms, so the contract below is what 04 needs from 03's spec.

## Contract 04 needs from 03

```go
// zu/internal/diff (feature 03), or wherever 03 puts it.
type Result struct {
	Base, Head   ir.Ref
	BaseIR       *ir.IR
	HeadIR       *ir.IR
	Nodes        map[string]Status // every id in either IR: added | removed | modified | unchanged (Change Status)
	Edges        []EdgeChange      // From, To, Kind, Status; Reversed bool on package import pairs
	Moves        []Move            // Removed id → Added id (paired by shape, ADR 0003)
	Affected     map[string]int    // Affected Set: package id → hop distance, 0 = changed (ADR 0009)
	ChangedFiles []string          // files with a Meaningful Change, repo-relative, sorted
}

// And from 02: read a file at a ref (or the worktree under -worktree).
type ReadAt func(ref ir.Ref, path string) ([]byte, error)
```

To be decided in the Part B revision: whether hunks are computed in Go from base and head content or taken from `git diff` (ADR 0005 allows the git CLI).

### Task B1: `export.Change(result, read)`

- Nodes and edges carry `status`. Moves become one node with status `moved` and a `from` field. Affected Set packages carry `hop`.
- `detail` is true for changed packages. Their changed declarations are included; unchanged ones only raise the `decls` count, so the UI shows "+N unchanged".
- Sources: head content of `ChangedFiles`, plus a `hunks` map (path → list of `{baseStart, baseLines, headStart, headLines, lines[]}`).
- Unchanged neighbours one hop away are included at package level and dimmed.
- Tests: the golden of a two-commit fixture repo covering add, remove, modify, a Move, a reversed import, and a gofmt-only edit (which is not a Meaningful Change: no status, no source).

### Task B2: `zu diff <base> [head] -html FILE`

- Reuses `htmlOptions` (no `-include`: the change decides what is inlined).
- `links.compare` = GitHub `https://github.com/<repo>/compare/<base>...<head>`, GitLab `https://gitlab.com/<repo>/-/compare/<base>...<head>`.
- No blob links under `-worktree` (Deviation 4). The Structural Summary still goes to stdout.

### Task B3: Change View UI

- **Marks (U9 + settled marks):** changed nodes solid in the status colour; the Affected Set outlined; edges drawn + or − with pair counts; Moves dashed; a legend. Colours pass contrast in light and dark.
- **Toggle (U10):** changed subgraph (changed packages plus one hop, dimmed) ↔ full Project View.
- **Changed list (U11):** changed packages, bottom-up by dependency. Clicking one centres it.
- **Panel:** hunks inline (U12), plus a compare link.
- **Opening view (Q4):** changed packages open showing only changed declarations plus a "+N unchanged" chip.

### Task B4: Part B acceptance

Same as Task 12, for `zu diff`, on a real zu commit range and a hugo tag range. Record in `acceptance.md`.

---

## Notes

- **Task count: 16** (12 in Part A, 4 in Part B). That is above Quick mode's guideline of 15. Kept in Quick mode as the user chose; Part B will be re-planned in full once 03 lands anyway.
- **TDD:** every task writes its failing test first (CLAUDE.md). UI components (Tasks 10–11) are verified in the browser. Their logic lives in tested pure modules.
- **Determinism:** same IR(s) + flags + zu binary → byte-identical HTML. The Go side sorts everything it emits; ELK input is sorted; nothing records time.
- **Security:** no network loads (CSP + `web/embed_test.go`); source rendered as text; data escaped by `encoding/json`; origin credentials never copied; links only https; source paths must be local.
- **Stuck?** Stop and ask. Don't force through blockers.

## Progress

- [ ] Task 1 · `-include` patterns
- [ ] Task 2 · Project View data
- [ ] Task 3 · Render
- [ ] Task 4 · Links
- [ ] Task 5 · `zu scan -html`
- [ ] Task 6 · UI toolchain
- [ ] Task 7 · Golden View
- [ ] Task 8 · Package Tree logic
- [ ] Task 9 · Layout
- [ ] Task 10 · Canvas and header
- [ ] Task 11 · Side panel
- [ ] Task 12 · Part A acceptance
- [ ] Task B1 · `export.Change` (blocked on 02, 03)
- [ ] Task B2 · `zu diff -html` (blocked)
- [ ] Task B3 · Change View UI (blocked)
- [ ] Task B4 · Part B acceptance (blocked)

**Status:** Not Started
