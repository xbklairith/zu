# 04 · HTML Export — Plan

**Status:** approved 2026-09-24. Start Part A after feature 03 is merged; Part B also needs 03's `internal/diff`.

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

## Deviations from settled answers (found while planning — approved 2026-09-24 with the plan)

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
8. **`-include` fails loudly.** A pattern that matches no package exits 3. A `./` pattern selects only packages of the root module, so nested modules are not swept in. This matches Go's `./...`.
9. **Links carry the scan's position in the repository.** Scanning a subdirectory records paths relative to it, so blob links are prefixed with `git rev-parse --show-prefix`. A `-ref` scan always runs at the top level and needs no prefix.
10. **Scanning a commit inlines the commit's source.** `zu scan -ref X -html` reads source through the scan's own `scan.Tree` (`CommitTree`), never from disk.

## Measured sizes (kubernetes v1.37.0, 2,963 packages, 25,843 import edges)

The package-level View is **6.2 MB** (5.9 MiB) of compact JSON; hugo's is 0.28 MB. The full IR is 99 MB. A minimal React Flow + ELK bundle is about 1.85 MB, so `k8s.html` should come to about 8.1 MB. The acceptance limit is **10 MB**. Declarations and source are added only for `-include` packages.

---

## The View contract (Go ↔ UI)

Written by `internal/export`, read by `web/src/data.ts`. Keys are part of the contract. `schema` is `"1"`.

```json
{
  "schema": "1",
  "kind": "project",
  "tool": "v0.1.0",
  "head": {"commit": "90cb22a…", "dirty": false},
  "modules": ["example.com/shop", "example.com/shop/tools"],
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
- `tool` is set by the CLI (`version.Version`), never read from a global inside `internal/export`.
- **Change View fields.** These are part of schema `"1"`, optional, and absent in a Project View:
  - top level: `base` (Ref), `changed` (package ids, bottom-up), `links.compare`, `hunks` (path → `[{baseStart, baseLines, headStart, headLines, lines}]`, where each line is prefixed with `" "`, `"+"` or `"-"`);
  - nodes: `status` (a Change Status word: `added`, `removed` or `modified`; absent = unchanged), `movedFrom` (the removed id of a Move), `hop` (Affected Set distance, 0 = changed);
  - edges: `status` (`added`, `removed` or `reversed`, 03's words; absent = unchanged).

---

# Part A — Project View export (unblocked)

### Task 1: `-include` patterns and the root module

The CLI checks pattern syntax before scanning, using `ParsePattern(s, "root.invalid")`, so a bad pattern costs no scan time. It resolves the patterns for real after the scan, once `RootModule` is known.

**Files:**
- Create: `internal/export/include.go`, `internal/export/include_test.go`

**Steps:**

- [x] **Write the failing test**

   ```go
   package export

   import (
   	"testing"

   	"zu/internal/ir"
   )

   func TestPatternMatch(t *testing.T) {
   	const root = "example.com/shop"
   	const nested = "example.com/shop/tools" // a nested module, like kubernetes' hack/tools
   	cases := []struct {
   		pat, pkg, module string
   		want             bool
   	}{
   		{"example.com/shop/internal/store", "example.com/shop/internal/store", root, true},
   		{"example.com/shop/internal/store", "example.com/shop/internal/storex", root, false},
   		{"./internal/...", "example.com/shop/internal/store", root, true},
   		{"./internal/...", "example.com/shop/internal", root, true},
   		{"./internal/...", "example.com/shop/internalx", root, false},
   		{"./...", "example.com/shop", root, true},
   		{"./...", "example.com/shop/tools/gen", nested, false}, // ./ stays in the root module, like go's ./...
   		{"example.com/shop/...", "example.com/shop/tools/gen", nested, true},
   		{".", "example.com/shop", root, true},
   		{".", "example.com/shop/internal/store", root, false},
   	}
   	for _, c := range cases {
   		p, err := ParsePattern(c.pat, root)
   		if err != nil {
   			t.Fatalf("ParsePattern(%q): %v", c.pat, err)
   		}
   		if got := p.Match(c.pkg, c.module); got != c.want {
   			t.Errorf("%q.Match(%q, %q) = %v, want %v", c.pat, c.pkg, c.module, got, c.want)
   		}
   		if p.String() != c.pat {
   			t.Errorf("String() = %q, want %q", p.String(), c.pat)
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

- [x] **Run — expect FAIL** (`undefined: ParsePattern`)

   Run: `go test ./internal/export/`

- [x] **Implement**

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
   // everything below it. A leading "./" (or ".") means the root module, and then
   // only packages of that module match, as with go's ./... .
   type Pattern struct {
   	src    string
   	path   string
   	tree   bool
   	module string // set for ./ patterns
   }

   func (p Pattern) String() string { return p.src }

   // ParsePattern parses one -include value. rootModule is the module at the scan
   // root, or "" when there is none.
   func ParsePattern(s, rootModule string) (Pattern, error) {
   	bad := fmt.Errorf("-include %q: want an import path, optionally ending in /... (./ means the root module)", s)
   	p, tree, module := s, false, ""
   	if rest, ok := strings.CutSuffix(p, "/..."); ok {
   		p, tree = rest, true
   	}
   	if p == "." || strings.HasPrefix(p, "./") {
   		if rootModule == "" {
   			return Pattern{}, fmt.Errorf("-include %q: no module at the scan root for ./ to refer to", s)
   		}
   		p = strings.TrimSuffix(rootModule+"/"+strings.TrimPrefix(strings.TrimPrefix(p, "."), "/"), "/")
   		module = rootModule
   	}
   	if p == "" || strings.HasPrefix(p, "/") || strings.HasSuffix(p, "/") ||
   		strings.Contains(p, "//") || strings.Contains(p, "..") {
   		return Pattern{}, bad
   	}
   	return Pattern{src: s, path: p, tree: tree, module: module}, nil
   }

   // Match reports whether the package with import path pkg, in module, is selected.
   func (p Pattern) Match(pkg, module string) bool {
   	if p.module != "" && module != p.module {
   		return false
   	}
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

- [x] **Run — expect PASS**

   Run: `go test ./internal/export/ && go vet ./internal/export/`
   Expected: `ok  zu/internal/export`

- [x] **Commit**

   ```bash
   git add internal/export/include.go internal/export/include_test.go
   git commit -m "Add -include import-path patterns for the HTML Export"
   ```

---

### Task 2: Build the Project View data from an IR

**Files:**
- Create: `internal/export/view.go`, `internal/export/project.go`, `internal/export/project_test.go`

**Steps:**

- [x] **Write the failing tests.** Use the real fixture IR (`internal/scan/testdata/shop.golden.json`) so the test follows the scanner.

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

   func TestProjectRejectsAnIncludeThatMatchesNothing(t *testing.T) {
   	doc := shopIR(t)
   	p, _ := ParsePattern("./nosuch/...", RootModule(doc))
   	_, err := Project(doc, []Pattern{p}, fakeRead(map[string]bool{}))
   	if err == nil || !strings.Contains(err.Error(), "./nosuch/...") {
   		t.Errorf("err = %v, want one naming the pattern", err)
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

- [x] **Run — expect FAIL** (`undefined: Project`)

   Run: `go test ./internal/export/`

- [x] **Implement `view.go`**

   ```go
   package export

   import (
   	"cmp"
   	"slices"

   	"zu/internal/ir"
   )

   // ViewSchema is the version of the View document the UI reads.
   const ViewSchema = "1"

   // View is everything one HTML Export draws. Field order and JSON keys are the
   // contract with web/src/data.ts.
   type View struct {
   	Schema  string            `json:"schema"`
   	Kind    string            `json:"kind"` // "project" or "change"
   	Tool    string            `json:"tool"` // set by the caller: zu's version
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
   		Schema: ViewSchema, Kind: kind, Head: doc.Ref,
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

- [x] **Implement `project.go`**

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
   	matched := make([]bool, len(include))
   	for i := range doc.Nodes {
   		n := &doc.Nodes[i]
   		switch n.Kind {
   		case ir.KindType, ir.KindFunction:
   			decls[pkgOf(n.ID)]++
   		case ir.KindPackage:
   			for j, p := range include {
   				if p.Match(n.ID, n.Module) {
   					detail[n.ID], matched[j] = true, true
   				}
   			}
   		}
   	}
   	for j, ok := range matched {
   		if !ok {
   			return nil, fmt.Errorf("-include %s matches no package", include[j])
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

- [x] **Run — expect PASS**

   Run: `go test ./internal/export/ && go vet ./internal/export/`
   Expected: `ok  zu/internal/export`

- [x] **Commit**

   ```bash
   git add internal/export/view.go internal/export/project.go internal/export/project_test.go
   git commit -m "Build the Project View data from an IR"
   ```

---

### Task 3: Render the View into the UI template

**Files:**
- Create: `internal/export/render.go`, `internal/export/render_test.go`, `internal/export/testdata/template.html`

**Steps:**

- [x] **Create the fixture template** (stands in for `web/dist/index.html` so `go test ./...` never needs the UI built)

   ```html
   <!doctype html><html><head><title>t</title></head><body><script id="zu-data" type="application/json">{}</script><div id="root"></div></body></html>
   ```

- [x] **Write the failing tests**

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
   	v.Sources["x.go"] = "s := \"</script><script>alert(1)</script><!--\"\u2028"
   	var out bytes.Buffer
   	if err := Render(&out, template(t), v); err != nil {
   		t.Fatal(err)
   	}
   	s := out.String()
   	if strings.Count(s, "</script>") != 1 || strings.Contains(s, "<!--") || strings.Contains(s, "\u2028") {
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

- [x] **Run — expect FAIL** (`undefined: Render`)

   Run: `go test ./internal/export/`

- [x] **Implement**

   ```go
   package export

   import (
   	"bytes"
   	"encoding/json"
   	"fmt"
   	"io"
   )

   // marker is the element Render fills. web/index.html carries it exactly once
   // and the built web/dist/index.html must still carry it (web/embed_test.go).
   const marker = `<script id="zu-data" type="application/json">{}</script>`

   // HasMarker reports whether tmpl can take a View: it carries the marker once.
   func HasMarker(tmpl []byte) bool { return bytes.Count(tmpl, []byte(marker)) == 1 }

   // Render writes tmpl with the marker's "{}" replaced by v as JSON.
   // encoding/json's default HTML escaping turns <, > and & into \u003c, \u003e
   // and \u0026, and escapes U+2028 and U+2029, so no source text can close the
   // script element or open a comment. Do not call SetEscapeHTML(false) here
   // (ir.Encode does, for readability; this output is HTML).
   func Render(w io.Writer, tmpl []byte, v *View) error {
   	if n := bytes.Count(tmpl, []byte(marker)); n != 1 {
   		return fmt.Errorf("UI template has %d data markers, want 1", n)
   	}
   	sortView(v)
   	data, err := json.Marshal(v)
   	if err != nil {
   		return err
   	}
   	open := len(marker) - len("{}</script>")
   	i := bytes.Index(tmpl, []byte(marker))
   	for _, part := range [][]byte{tmpl[:i+open], data, tmpl[i+open+len("{}"):]} {
   		if _, err := w.Write(part); err != nil {
   			return err
   		}
   	}
   	return nil
   }
   ```

- [x] **Run — expect PASS**

   Run: `go test ./internal/export/`
   Expected: `ok  zu/internal/export`

- [x] **Commit**

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

- [x] **Write the failing tests**

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
   		prefix             string // git rev-parse --show-prefix of the scan root
   		want               string // "" = no links
   	}{
   		{"github ssh", "git@github.com:xbklairith/zu.git", "", clean, "", "https://github.com/xbklairith/zu/blob/" + c + "/{path}#L{line}"},
   		{"github https with token", "https://x-access-token:SECRET@github.com/o/r.git", "", clean, "", "https://github.com/o/r/blob/" + c + "/{path}#L{line}"},
   		{"gitlab ssh url, subgroup", "ssh://git@gitlab.com/g/sub/r.git", "", clean, "", "https://gitlab.com/g/sub/r/-/blob/" + c + "/{path}#L{line}"},
   		{"unknown host", "git@git.example.com:o/r.git", "", clean, "", ""},
   		{"scanned from a subdirectory", "git@github.com:o/r.git", "", clean, "sub/dir/", "https://github.com/o/r/blob/" + c + "/sub/dir/{path}#L{line}"},
   		{"template wins", "git@git.example.com:o/r.git", "https://git.example.com/o/r/src/{commit}/{path}#L{line}", clean, "", "https://git.example.com/o/r/src/" + c + "/{path}#L{line}"},
   		{"dirty", "git@github.com:o/r.git", "", ir.Ref{Commit: c, Dirty: true}, "", ""},
   		{"no commit", "git@github.com:o/r.git", "", ir.Ref{}, "", ""},
   		{"no origin", "", "", clean, "", ""},
   	}
   	for _, tc := range cases {
   		l, err := ForRepo(tc.origin, tc.ref, tc.tmpl, tc.prefix)
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
   		if _, err := ForRepo("", ir.Ref{Commit: "abc"}, tmpl, ""); err == nil {
   			t.Errorf("accepted -link-template %q", tmpl)
   		}
   	}
   }
   ```

   In `internal/gitref/gitref_test.go` add `TestPrefix`: `Prefix` of the repo top is `""`, and of `top/sub/dir` is `"sub/dir/"`. Also add `TestOrigin`: init a repo in `t.TempDir()`, `git remote add origin git@github.com:o/r.git`, and expect `Origin(ctx, dir) == "git@github.com:o/r.git"`; a repo with no remote gives `""`.

- [x] **Run — expect FAIL** (`undefined: ForRepo`, `undefined: Origin`, `undefined: Prefix`)

   Run: `go test ./internal/export/ ./internal/gitref/`

- [x] **Implement `gitref.Prefix` and `gitref.Origin`** (append to `internal/gitref/gitref.go`)

   ```go
   // Prefix returns dir's path inside its repository with a trailing slash
   // ("" at the top level, or outside a repository): git rev-parse --show-prefix.
   func Prefix(ctx context.Context, dir string) string {
   	out, err := git(ctx, dir, "rev-parse", "--show-prefix")
   	if err != nil {
   		return ""
   	}
   	return strings.TrimSpace(out)
   }

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

- [x] **Implement `links.go`** (as built, the `Links` type lives in `view.go`, added in Task 2 so `View` compiles)

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
   // Only host and path of origin are used, so credentials in it never reach the
   // file. prefix is the scan root's path inside the repository ("" at the top,
   // else "sub/dir/"), because IR paths are relative to the scan root.
   func ForRepo(origin string, head ir.Ref, template, prefix string) (*Links, error) {
   	if template != "" {
   		if !strings.HasPrefix(template, "https://") || !strings.Contains(template, "{path}") {
   			return nil, errors.New("-link-template must start with https:// and contain {path}")
   		}
   	}
   	if head.Commit == "" || head.Dirty {
   		return nil, nil
   	}
   	if template != "" {
   		t := strings.ReplaceAll(template, "{commit}", head.Commit)
   		return &Links{Blob: strings.ReplaceAll(t, "{path}", prefix+"{path}")}, nil
   	}
   	host, repo := parseRemote(origin)
   	switch {
   	case host == "github.com":
   		return &Links{Blob: "https://github.com/" + repo + "/blob/" + head.Commit + "/" + prefix + "{path}#L{line}"}, nil
   	case host == "gitlab.com":
   		return &Links{Blob: "https://gitlab.com/" + repo + "/-/blob/" + head.Commit + "/" + prefix + "{path}#L{line}"}, nil
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

- [x] **Run — expect PASS**

   Run: `go test ./internal/export/ ./internal/gitref/`
   Expected: both `ok`

- [x] **Commit**

   ```bash
   git add internal/export/links.go internal/export/links_test.go internal/gitref/gitref.go internal/gitref/gitref_test.go
   git commit -m "Derive source links from the origin remote, never its credentials"
   ```

---

### Task 5: `zu scan -html FILE [-include P]… [-link-template T]`

**Files:**
- Modify: `internal/cli/scan.go`, as of `92527ba` / `4a6bd33`, in three places:
  1. the flag block (lines 37–41);
  2. the invocation checks, after the `-include-ignored`/`-ref` check (line 56);
  3. after the IR write succeeds, before the summary line (lines 106–108).
- Create: `internal/cli/html.go`, `internal/cli/html_test.go`

**Behaviour:**
- `scan` still writes the IR exactly as today (`-out -` still works). `-html` writes the export afterwards, atomically.
- **Before scanning, exit 3 on any of these,** so a bad invocation never costs a scan:
  - `-include` or `-link-template` without `-html`;
  - `-html -`;
  - a malformed `-include` pattern;
  - a `-link-template` that is not https or lacks `{path}`;
  - a missing UI, reported as `zu scan: html: this zu was built without the UI; build it with make build`.
- **After the scan:** `-include` patterns are resolved against the root module, and one that matches nothing exits 3 and names the pattern (Deviation 8).
- **Source is read through `src.tree.ReadFile`, the tree the scan just read** (Deviation 10). With `-ref` that is the commit; otherwise the files git would commit, from disk.
- **Links:** the prefix is `gitref.Prefix(src.root)` for a working-tree scan and `""` for `-ref`, whose root is the repository top (Deviation 9).
- stderr gets one more line: `zu scan: html → FILE (N source files inlined; share it only where that code may go)`.
- A parse-error exit 2 still happens after the HTML is written.

**Steps:**

- [x] **Write the failing tests** in `internal/cli/html_test.go`. Reuse `repo`, `small`, `git` and `needGit` from `scan_test.go`. Set the `uiTemplate` seam to return `internal/export/testdata/template.html`'s bytes. Write every output under `t.TempDir()`.
   1. `scan <dir> -html $T/out.html -include ./a`: exit 0; the file contains `"id":"example.com/m/a.F"` and `"a/a.go":`; `<dir>/.zu/ir/` still holds the IR.
   2. **`-ref` inlines the commit.** Commit `a/a.go`, then append `// WORKTREE-EDIT` on disk. `scan <dir> -ref HEAD -html $T/out.html -include ./a`: the file does not contain `WORKTREE-EDIT` and does contain `https://github.com/o/r/blob/<commit>/a/a.go`-style links. Set origin to `git@github.com:o/r.git`.
   3. **Exit 3 before the scan.** `-include ./a` without `-html`; `-html -`; `-include /x`; `-link-template http://h/{path}`. After each, `<dir>/.zu` does not exist.
   4. **Exit 3 after the scan:** `-include ./nosuch/...`, with stderr containing `./nosuch/...`.
   5. **Missing UI.** With `uiTemplate` returning the "built without the UI" error: exit 3, stderr contains `make build`, and `<dir>/.zu` does not exist.
   6. **Credentials.** In a git repo with `origin` = `https://user:pw@github.com/o/r.git` and a clean commit, the file contains `https://github.com/o/r/blob/` and does not contain `pw@`.
   7. **Subdirectory.** The repo has `svc/go.mod` and `svc/a/a.go`, committed, with an origin on github. `scan <top>/svc -html …` links contain `/blob/<commit>/svc/{path}`.

- [x] **Run — expect FAIL**

   Run: `go test ./internal/cli/ -run HTML`

- [x] **Implement `internal/cli/html.go`**

   ```go
   package cli

   import (
   	"bytes"
   	"context"
   	"errors"
   	"fmt"
   	"io"
   	"io/fs"
   	"strings"

   	"zu/internal/export"
   	"zu/internal/gitref"
   	"zu/internal/ir"
   	"zu/internal/version"
   	"zu/web"
   )

   // Seams for tests: the built UI page and the repository facts links need.
   var (
   	uiTemplate = builtTemplate
   	gitOrigin  = gitref.Origin
   	gitPrefix  = gitref.Prefix
   )

   // listFlag collects a repeatable flag.
   type listFlag []string

   func (l *listFlag) String() string     { return strings.Join(*l, ",") }
   func (l *listFlag) Set(s string) error { *l = append(*l, s); return nil }

   type htmlOptions struct {
   	path     string
   	include  listFlag
   	linkTmpl string
   	tmpl     []byte // the UI page, loaded by prepare
   }

   // prepare checks everything that does not need the IR, so a bad invocation
   // fails before a scan that can take minutes.
   func (o *htmlOptions) prepare() error {
   	switch {
   	case o.path == "":
   		if len(o.include) > 0 || o.linkTmpl != "" {
   			return errors.New("-include and -link-template need -html")
   		}
   		return nil
   	case o.path == "-":
   		return errors.New("-html needs a file path")
   	}
   	for _, s := range o.include {
   		if _, err := export.ParsePattern(s, "root.invalid"); err != nil { // syntax only
   			return err
   		}
   	}
   	if _, err := export.ForRepo("", ir.Ref{}, o.linkTmpl, ""); err != nil { // validates the template
   		return err
   	}
   	tmpl, err := uiTemplate()
   	if err != nil {
   		return fmt.Errorf("html: %w", err)
   	}
   	o.tmpl = tmpl
   	return nil
   }

   func builtTemplate() ([]byte, error) {
   	assets, err := web.Assets()
   	if err != nil {
   		return nil, err
   	}
   	b, err := fs.ReadFile(assets, "index.html")
   	if errors.Is(err, fs.ErrNotExist) || err == nil && !export.HasMarker(b) {
   		return nil, errors.New("this zu was built without the UI; build it with make build")
   	}
   	return b, err
   }

   // writeHTML writes the Project View export of doc (already sorted by
   // ir.Encode), reading source through the tree the scan read.
   func writeHTML(ctx context.Context, src *source, doc *ir.IR, o *htmlOptions, stderr io.Writer) error {
   	root := export.RootModule(doc)
   	pats := make([]export.Pattern, 0, len(o.include))
   	for _, s := range o.include {
   		p, err := export.ParsePattern(s, root)
   		if err != nil {
   			return err
   		}
   		pats = append(pats, p)
   	}
   	v, err := export.Project(doc, pats, src.tree.ReadFile)
   	if err != nil {
   		return err
   	}
   	v.Tool = version.Version
   	prefix := "" // a -ref scan runs at the repository top
   	if src.ref == nil {
   		prefix = gitPrefix(ctx, src.root)
   	}
   	if v.Links, err = export.ForRepo(gitOrigin(ctx, src.root), doc.Ref, o.linkTmpl, prefix); err != nil {
   		return err
   	}
   	var buf bytes.Buffer
   	if err := export.Render(&buf, o.tmpl, v); err != nil {
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

- [x] **Wire into `runScan`** (`internal/cli/scan.go`)

   ```go
   	// 1. after the withIgnored flag (line 41):
   	var hopts htmlOptions
   	fs.StringVar(&hopts.path, "html", "", "also write a self-contained HTML Project View to `file`")
   	fs.Var(&hopts.include, "include", "inline declarations and source of packages matching `pattern` (repeatable; ./ = root module)")
   	fs.StringVar(&hopts.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")

   	// 2. after the -include-ignored/-ref check (line 56), before interruptContext:
   	if err := hopts.prepare(); err != nil {
   		fmt.Fprintf(stderr, "zu scan: %v\n", err)
   		return ExitBadInvocation
   	}

   	// 3. after the IR write succeeds (line 106), before the summary line:
   	if hopts.path != "" {
   		if err := writeHTML(ctx, src, doc, &hopts, stderr); err != nil {
   			fmt.Fprintf(stderr, "zu scan: html: %v\n", err)
   			return ExitBadInvocation
   		}
   	}
   ```
   Also add `[-html file [-include pattern]… [-link-template url]]` to the `runScan` doc comment. `-include` and `-include-ignored` are different flags: one selects packages to inline, the other selects files to scan. The help text says so.

- [x] **Run — expect PASS; run the whole suite and lint**

   Run: `go test -race ./... && golangci-lint run ./...`
   Expected: all `ok`, no lint findings.

- [x] **Commit**

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

- [x] **Add dependencies** (pinned by the lockfile)

   Run: `cd web && npm install @xyflow/react@^12.11.6 elkjs@^0.12.0 && npm install -D vite-plugin-singlefile@^2.3.3 vitest@^5.0.1`
   Then add `"test": "vitest run"` to `scripts` in `web/package.json`.

- [x] **Data element in `web/index.html`**, just before `<div id="root">`. No web fonts: the export uses system font stacks only.

   ```html
   <script id="zu-data" type="application/json">{}</script>
   ```

- [x] **`web/vite.config.ts`**

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

- [x] **Write the failing test** `web/src/data.test.ts`. It reads the Go golden from Task 7 once that exists. For now it covers only the schema gate.

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

- [x] **Run — expect FAIL**, then **implement `web/src/data.ts`**

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
     schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref; changed?: string[];
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

- [x] **Guard the built page in Go.** Add to `web/embed_test.go` (it skips when the UI is not built, so `go test ./...` still works without it):

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

- [x] **Makefile**: add `test-web` and make `check` build and test the UI.

   ```make
   test-web: ## Run UI unit tests
   	cd web && npm test

   check: web lint test test-web ## Everything CI runs
   ```
   Add `test-web` to `.PHONY`. Change `clean` to `rm -rf bin web/dist/index.html`, since `dist/assets` is no longer built.

- [x] **Verify**

   Run: `make web && go test ./web/ -run SelfContained -v && cd web && npm test`
   Expected: `--- PASS: TestBuiltPageIsSelfContained`; vitest `2 passed`; `web/dist/index.html` is one file and `web/dist/assets/` does not exist.

- [x] **Commit**

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

- [x] **Write a golden test** that builds `Project(shopIR, ./internal/store, read)`, where `read` reads the real fixture files, `os.ReadFile(filepath.Join("../scan/testdata/shop", p))`. The dev page and Task 11's checks then show real source (`store.go` has 43+ lines). Compare `json.MarshalIndent(v, "", "  ")` to `testdata/shop.view.golden.json`, with `-update` to rewrite it (same pattern as `internal/scan`'s golden). `Tool` stays `""`: `Project` never reads the version.
- [x] **Run with `-update`, review the diff, run without it**

   Run: `go test ./internal/export -run Golden -update && git diff --stat && go test ./internal/export`
   Expected: `ok`

- [x] **UI reads the same fixture.** Add to `data.test.ts`:

   ```ts
   import golden from "../../internal/export/testdata/shop.view.golden.json";
   it("parses the Go golden", () => {
     const v = parseView(JSON.stringify(golden));
     expect(v.nodes.some((n) => n.id === "example.com/shop/internal/store.Repo")).toBe(true);
   });
   ```
   Add `"resolveJsonModule": true` to `web/tsconfig.json`.

- [x] **Dev mode shows the fixture.** Vite serves only `web/` by default, so add `server: { fs: { allow: [".."] } }` to `vite.config.ts`. Then in `main.tsx`, when `readEmbedded(document)` is null and `import.meta.env.DEV`, `await import("../../internal/export/testdata/shop.view.golden.json")`. The dead branch is dropped from the build. In a build with no data, render "This page carries no zu data. Create one with `zu scan -html FILE`."
- [x] **Verify**: `cd web && npm test && npm run build && ! grep -q "example.com/shop" dist/index.html && echo fixture-not-bundled`. Expected: 3 passed, then `fixture-not-bundled`.
- [x] **Commit**: `git add internal/export/golden_test.go internal/export/testdata/shop.view.golden.json web/src/data.test.ts web/src/main.tsx web/tsconfig.json && git commit -m "Share a golden View between the Go export and the UI"`

---

### Task 8: Package Tree, drill-in and auto-collapse (pure logic)

**Files:**
- Create: `web/src/tree.ts`, `web/src/tree.test.ts`

**Rules (from ADR 0008, Q4, and Deviations 1, 2 and 7):**
- A **box id** is a module path or a module path plus one or more segments. Every package id is a box; so is every prefix between its module and itself. A package box can also contain child boxes.
- **Modules are roots (ADR 0008), even when nested.** `example.com/shop/tools` (its own `go.mod`) is a root beside `example.com/shop`, not a box inside it. A package's segments come from its `module` field, never from string prefixes. `parentBox` of a module root is `""`. kubernetes has 38 such roots.
- **A box that is also a package** can be expanded while holding its own package, like `example.com/shop` (the `main` package, plus `internal/…`) or the 33 kubernetes packages whose id is their module path. When it is drawn as a container, its own package appears inside it as a leaf with id `<box>#pkg`, labelled `<last segment> (package)`, and edges to that package attach there. When the box is a leaf, the box itself carries the package.
- The **focus** is a box id, or `""` for the page root, whose children are the module roots.
- **Leaves at relative depth d** under the focus: for each package under the focus, its ancestor-or-self box at most d levels below the focus. A package whose id equals the focus is the container, not a leaf. Its declarations appear as leaves when it has `detail`.
- **Containers:** every box strictly between the focus and a leaf is drawn as a container around its leaves ("a package is drawn inside its nearest ancestor segment", ADR 0008). `containers(view, focus, depth)` returns them with their parent box.
- **Auto depth:** start at d = 1 and increase while the leaves at d + 1 number ≤ 60 and are more than at d. If d = 1 already has > 60, draw them with a note.
- **Endpoint mapping:** a package maps to its leaf box. A package outside the focus maps to `"outside"`. Externals map to themselves when ≤ 20 of them are touched by the drawn edges, otherwise to `"externals"`.
- **Bundles:** import edges mapped to (leaf, leaf) pairs. `pairs` = number of distinct package pairs. Self-loops are dropped. Output is sorted.
- **Declarations:** when the focus is a package with `detail`, its types and functions are leaves too. Methods sit inside their type (as rows, not nodes). Calls and embeds between them are bundled to type/function leaves.

**Steps:**

- [x] **Write the failing tests** (synthetic ids that mirror the corpus shapes)

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
     it("a package that is also a container gets a #pkg leaf; nested modules are roots", () => {
       const v = view([...pkgs(["ex/shop", "ex/shop/internal/a", "ex/shop/internal/b"], "ex/shop"),
         ...pkgs(["ex/shop/tools/gen"], "ex/shop/tools")]);
       expect(leavesAt(v, "", 1)).toEqual(["ex/shop", "ex/shop/tools"]);
       expect(leavesAt(v, "ex/shop", 2)).toEqual(["ex/shop#pkg", "ex/shop/internal/a", "ex/shop/internal/b"]);
       expect(parentBox(v, "ex/shop/tools")).toBe("");
       expect(parentBox(v, "ex/shop/tools/gen")).toBe("ex/shop/tools");
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

- [x] **Run — expect FAIL**, then **implement `tree.ts`**. Required exports: `boxesOf(view)` (memoized box index), `leavesAt(view, focus, depth): string[]` (sorted), `autoDepth(view, focus): number`, `parentBox(view, box): string`, `bundles(view, focus, depth): {from, to, pairs}[]` (sorted by from, then to), `declLeaves(view, pkg)`, and `EXTERNAL_BUDGET = 20`, `BOX_BUDGET = 60`. The module a package belongs to is its `module` field. The segments are `id.slice(module.length + 1).split("/")`.
- [x] **Run — expect PASS**: `cd web && npm test` → all passed; `npm run typecheck` clean.
- [x] **Commit**: `git add web/src/tree.ts web/src/tree.test.ts && git commit -m "Derive the Package Tree, drill-in and auto-collapse from node ids"`

---

### Task 9: Deterministic layout

**Files:**
- Create: `web/src/layout.ts`, `web/src/layout.test.ts`

**Rules:** ELK `layered`, `elk.direction: DOWN` (importer above imported), `elk.randomSeed: 1`, `elk.layered.considerModelOrder.strategy: NODES_AND_EDGES`, `elk.hierarchyHandling: INCLUDE_CHILDREN`. Containers from `tree.containers` become ELK compound nodes with their leaves as `children` (padding 12, 24 on top for the label). Edges attach to leaves. Nodes and edges go in sorted by id. Node sizes come from the label length (7.5 px per character + 24, clamped to 90–280, height 40), never from DOM measurement, so layout does not depend on fonts. Use `elkjs/lib/elk.bundled.js` on the main thread (Deviation 5).

**Steps:**

- [x] **Write the failing test**: with `d = autoDepth(golden, "")`, lay out the leaves and containers of `(golden, "", d)` and `bundles(golden, "", d)` twice and expect equal positions (`toEqual`); every node gets finite `x` and `y`; the same input in shuffled order gives the same positions.
- [x] **Run — expect FAIL**, then **implement** `layout(items: {id; label; parent?: string; shape: "container" | "box" | "oval" | "decl" | "outside"}[], edges): Promise<Map<id, {x, y, w, h, parent?}>>`. Positions are relative to the parent, matching React Flow's `parentId`.
- [x] **Run — expect PASS**: `cd web && npm test`.
- [x] **Commit**: `git add web/src/layout.ts web/src/layout.test.ts && git commit -m "Lay out views deterministically with ELK"`

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

- [x] **Implement** the components above. Keep all logic in `tree.ts`/`layout.ts`, and keep components thin.
- [x] **Verify** by running the dev server against the golden (`cd web && npx vite`), then in the browser:
  - Shop has fewer than 60 packages, so the page opens with two module roots, `example.com/shop` and `example.com/shop/tools`, fully expanded. `example.com/shop` holds `shop (package)` and the `internal` container, which holds `checkout`, `money` and `store`.
  - Double-clicking `store` shows its declarations with `Repo` holding the methods `Get`, `Reset` and `check`.
  - Double-clicking `checkout` shows the "Declarations not included" card.
  - Esc returns up one level at a time.
  - The honesty banner shows 1 parse error, 8 unresolved calls, 1 unresolved import, and unsupported `.sh 1, .ts 1`.
- [x] **Run**: `cd web && npm run typecheck && npm test && npm run build && cd .. && go test ./web/`
- [x] **Commit**: `git add web/src/App.tsx web/src/Canvas.tsx web/src/Header.tsx web/src/styles.css web/src/main.tsx && git commit -m "Draw the Project View with drill-in navigation and the honesty banner"`

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

- [x] **Write the failing tests** for `linkFor`:
  - GitHub template plus `internal/a b/x.go` gives `…/internal/a%20b/x.go#L12`.
  - A template that is not https gives `null`.
  - `links` undefined gives `null`.
- [x] **Run — expect FAIL**, implement `links.ts`, then `Panel.tsx`.
- [x] **Verify** in the dev server:
  - Selecting `store.Repo.Get` shows `store.go` scrolled to line 43, highlighted.
  - A source line containing `<b>` renders literally.
- [x] **Run**: `cd web && npm run typecheck && npm test`
- [x] **Commit**: `git add web/src/Panel.tsx web/src/links.ts web/src/links.test.ts && git commit -m "Show source, edges and host links in the side panel"`

---

### Task 12: Part A acceptance

**Steps:**

- [x] **Build and export zu itself**

   Run: `make check && make build && bin/zu scan -html /tmp/zu-self.html -include ./internal/...`
   Expected: exit 0; stderr ends with the `html → /tmp/zu-self.html (N source files inlined …)` line.

- [x] **Determinism**

   Run: `T=$(mktemp -d) && bin/zu scan -out $T/ir.json -html $T/a.html -include ./... && bin/zu scan -out $T/ir.json -html $T/b.html -include ./... && shasum $T/a.html $T/b.html`
   Expected: identical hashes.

- [x] **Corpus** (`scripts/bench-corpus.sh` has cloned them into `.zu/corpus/`)

   `-out` must name a writable directory: `/dev/null` fails because of the atomic write's temp file.
   Run: `T=$(mktemp -d) && bin/zu scan .zu/corpus/hugo@v0.166.0 -out $T/hugo.json -html $T/hugo.html -include ./hugolib && bin/zu scan .zu/corpus/kubernetes@v1.37.0 -out $T/k8s.json -html $T/k8s.html && ls -l $T/*.html`
   Expected: `k8s.html` < 10 MB (estimate ≈ 8.1 MB); hugo opens at 37 boxes and kubernetes at 38 module roots plus one "111 external modules" oval.

- [~] **Offline and browsers.** (Chrome over 127.0.0.1 done; `file://`, Firefox, Safari and visible first paint pending: `docx/UserInstructions/04-html-export-browser-check.md`) Open each file from `file://` in Chrome, Firefox and Safari. Check:
  - the DevTools console shows no CSP violations;
  - the Network panel shows only the document itself;
  - first paint is under 3 s for `k8s.html`, measured with the Performance panel.
- [x] **Record evidence** in `docx/features/04-html-export/acceptance.md`: sizes, hashes, timings, and browser results.
- [x] **Commit**: `git add docx/features/04-html-export/acceptance.md && git commit -m "Record HTML Export Project View acceptance evidence"`

---

# Part B — Change View export (blocked on 03)

**Feature 03 is merged (d7d418a); its exported signatures match its plan.** Feature 02 has already shipped what Part B reads files with: `scan.Tree`, `gitref.CommitTree` and `scan.ListTree`. These tasks consume 03's plan exactly as written in `docx/features/03-diff-ci/plan.md` (revision `e0138e2`). If 03's types change while it is built, adjust here. Do not change 03 to suit 04.

## What 04 consumes (all defined by 02 and 03, nothing new)

| Need | Source |
|---|---|
| Change Status of nodes and edges | `diff.Compare(base, head *ir.IR) diff.Delta` → `Nodes []NodeChange{ID, Kind, Status}` and `Edges []EdgeChange{From, To, Kind, Status}`. Anything not listed is unchanged, and `reversed` is an edge status on package imports. |
| Moves | `Delta.Moves []Move{From, To, Kind}` (paired by `shape`, one-to-one) |
| Affected Set and row order | `diff.Summarize(base, head) *Summary`: `Affected []Hop{Package, Hops}` (changed packages at hop 0, ADR 0009) and `Packages []PackageRow` in bottom-up order. Call `Summarize` directly; the Summary's Mermaid edge list is unexported and absent from `-format json`. |
| Both IRs and refs | the two `*ir.IR` values `zu diff` already holds, and their `Ref`s |
| File content at base and head | the two `scan.Tree`s `zu diff` opened: `CommitTree` for base; `CommitTree` or `ListTree` (`-worktree`) for head. Both have `ReadFile(rel)`. |

**Decided here: hunks are computed in Go**, with a small deterministic line diff (Myers, 3 lines of context) over base and head content read through the trees. It needs no extra git process, works the same for `-worktree`, and is testable as a pure function. `git diff` was the alternative (ADR 0005 allows it), but it would need a separate path for untracked worktree files.

### Task B1: `export.Change(base, head *ir.IR, delta diff.Delta, sum *diff.Summary, baseTree, headTree scan.Tree)`

`sum` is `diff.Summarize(base, head)`. It supplies the Affected Set (`sum.Affected`, so no separate `affected` argument) and the bottom-up package order (`sum.Packages`), which exists only in the Summary. `delta` still supplies every edge change, because the Summary keeps only counts for calls and embeds.

- **Changed order.** `View.changed` is the list of `sum.Packages[i].ID` values in their Summary order. B1 adds the `Changed []string` field (`json:"changed,omitempty"`) to `View`. It is optional in schema "1" and present only in a Change View. B3's changed list reads it as is and never re-sorts it.

- **Nodes.** Every package and external of head, plus removed packages from base, each with its `status` from the delta (absent = unchanged) and its `hop` from `affected`.
- **Moves.** The node for `Move.To` carries `movedFrom: Move.From`. The `Move.From` node is not emitted, so a Move is one node drawn dashed rather than a removal plus an addition.
- **Declarations.** For every changed package, `detail: true`. Its declarations with a status or a `movedFrom` are included, plus removed ones from base. Unchanged declarations only count toward `decls`, so the UI can show "+N unchanged".
- **Edges.** Head's import edges, plus removed ones from base, each with its status. Calls and embeds are included only between included declarations.
- **Changed files** are the head locations of `added`/`modified` declarations and of Move targets. **Sources** are those files' head content, read with `headTree.ReadFile`.
- **Hunks** cover the changed files plus the base files of removed declarations. They come from base and head content (`baseTree.ReadFile`, `headTree.ReadFile`). A file missing on one side is diffed against empty content.
- **Meaningful Change comes from `hash` alone.** A gofmt-only or comment-only edit gives no status, so its file is never inlined (ADR 0006).
- **Tests.** Two scanned copies of `testdata/shop` in `t.TempDir()` (not hand-edited IRs) with an add, a remove, a modify, a Move, a reversed import, and a gofmt-only edit. There is a golden of the View, and `hunks` are checked for one modified function.

- **Built (B1), with four choices the text above leaves open:**
  - A type that holds a changed method is drawn even when unchanged, so the method has a row to sit in.
  - A Move target's package gets `detail: true` even if it is otherwise unchanged; `changed` stays the Summary's list.
  - Removed externals from base are drawn too, so a removed import edge never dangles.
  - The base files of Move sources get hunks as well: the moved text left them.
  - `hunks` is `Hunks(base, head []byte) []Hunk` in `internal/export/hunks.go`; `hop` is a pointer, so hop 0 survives `omitempty`.

### Task B2: `zu diff <base> [head] -html FILE [-link-template T]`

- `htmlOptions.prepare()` is reused. `-include` is rejected, because the change decides what is inlined.
- **Links.** `links.blob` comes from `ForRepo(origin, head ref, tmpl, "")` (diff always runs at the top level). There are none under `-worktree`, because head is dirty (Deviation 4).
- **`links.compare`:**
  - GitHub: `https://github.com/<repo>/compare/<base>...<head>`
  - GitLab: `https://gitlab.com/<repo>/-/compare/<base>...<head>`
  - Built from the merge-base and head commits, only when both are clean commits.
- The Structural Summary still goes to stdout. The HTML is written after it, and exit codes are unchanged.
- Tests go in `internal/cli/diff_test.go`, in the style of Task 5.

### Task B3: Change View UI

- **Marks (U9 plus the settled marks):**
  - changed nodes solid in their status colour; the Affected Set outlined, with its hop in the panel;
  - edges drawn + or −, reversed edges as ⇄, with pair counts on bundles;
  - Moves dashed, with `movedFrom` shown in the panel;
  - a legend. Colours pass contrast in light and dark.
- **Opening view (Q4):**
  - the changed subgraph: changed packages plus one hop, the neighbours closed and dimmed;
  - changed packages open, showing only changed declarations, plus a "+N unchanged" chip.
- **Toggle (U10):** changed subgraph ↔ full Project View.
- **Changed list (U11):** `View.changed`, in the Structural Summary's bottom-up order. Clicking one centres it.
- **Panel:** hunks inline (U12), plus the compare link.
- **Tests:** vitest for the status → mark mapping, the changed-subgraph selection and the "+N unchanged" count, run against the B1 golden.

### Task B4: Part B acceptance

Same as Task 12, for `zu diff -html`, on a real zu commit range and a hugo tag range: size, determinism, offline, and the three browsers. Record in `acceptance.md`.

---

## Notes

- **Task count: 16** (12 in Part A, 4 in Part B), one over Quick mode's guideline of 15. Kept in Quick mode as the user chose.
- **Revised 2026-09-24** after the scrutiny of 03 and 04. The changes: Deviations 8–10; `-ref`-aware source reading; checks before the scan; `./` scoped to the root module; the subdirectory link prefix; the `#pkg` leaf and nested-module roots; real fixture source; the 10 MB limit; Part B rewritten against 03's real types.
- **TDD:** every task writes its failing test first (CLAUDE.md). UI components (Tasks 10–11) are verified in the browser. Their logic lives in tested pure modules.
- **Determinism:** same IR(s) + flags + zu binary → byte-identical HTML. The Go side sorts everything it emits; ELK input is sorted; nothing records time.
- **Security:** no network loads (CSP + `web/embed_test.go`); source rendered as text; data escaped by `encoding/json`; origin credentials never copied; links only https; source paths must be local.
- **Stuck?** Stop and ask. Don't force through blockers.

## Progress

- [x] Task 1 · `-include` patterns
- [x] Task 2 · Project View data
- [x] Task 3 · Render
- [x] Task 4 · Links
- [x] Task 5 · `zu scan -html`
- [x] Task 6 · UI toolchain
- [x] Task 7 · Golden View
- [x] Task 8 · Package Tree logic
- [x] Task 9 · Layout
- [x] Task 10 · Canvas and header
- [x] Task 11 · Side panel
- [x] Task 12 · Part A acceptance (manual browser checks pending)
- [x] Task B1 · `export.Change`
- [ ] Task B2 · `zu diff -html` (blocked)
- [ ] Task B3 · Change View UI (blocked)
- [ ] Task B4 · Part B acceptance (blocked)

**Status:** Not Started
