# 10 · `zu serve` — Plan

**Status:** Complete 2026-09-25 (Tasks 1–7 and review amendments 1–4; acceptance.md). APPROVED 2026-09-25 by the user. The outside review (scrut10) was still running; any finding it upholds arrives as a dated amendment to this plan. Drafted against `main` at e45eb1d, with 09 committed; every diff here is against that commit. Replayed green on a fresh `git archive` of e45eb1d (see Replay record). Proposed doc amendments (decisions.md, requirements-draft.md, CLAUDE.md; none to the glossary) are Deviation 14; they are not task steps. Watch and live redraw are feature 11 (the last section).

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is 08's script unchanged. It applies every code block to a fresh copy of `main`, task by task, the way an implementer would:

- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. It prints one line per step and exits 1 if any step misbehaves. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 docx/features/10-serve/replay.py docx/features/10-serve/plan.md "$S"; rm -rf "$S"
```

The replay needs Go, git, `patch`, Python 3, npm and Node, `golangci-lint` (Task 7), and Playwright's three browsers (Tasks 5 and 6, which run `make build` and the browser harnesses from `web/e2e`).

**Goal:** `zu serve`, build-order item 2 of the requirements and the `serve` row of their CLI table: the working tree's Project View in the browser, from a server that is safe to leave running. decisions.md l.46 puts it after the v1 core, with watch and session restore. This feature ships the server and the incremental rescan it stands on. Watch and live redraw over Server-Sent Events are feature 11.

- **Safety** (requirements, Safety and Standalone viewing): the server binds a loopback address only and refuses any other `-addr` with exit 3. It answers only requests whose `Host` names this machine, which defeats DNS rebinding. It has no write endpoint, serves no file by path, and writes nothing to disk.
- **The same page:** it serves the page the HTML Export uses (ADR 0006: "the same UI bundle later backs `zu serve`"), not a second UI. Instead of an inlined View the page carries a marker telling it to fetch `view.json`, and its CSP gains exactly `connect-src 'self'`.
- **Incremental rescan** (requirements, Performance budgets: "Incremental re-scan after one file changes: under 2 seconds"): `scan.Cache` keeps each file's facts keyed by path and content hash, so a rescan parses only the files whose content changed. Everything after extraction runs over the whole tree, which keeps the rescan's IR byte-identical to a cold scan's (ADR 0003). Measured on kubernetes (Task 7): 1.09–1.19 s from request to response after a one-file edit on a copy of its non-test Go files; 1.74–1.93 s on a full worktree (acceptance.md).
- **Session restore** is the URL hash, which already carries the whole view state (05), on a fixed default port, so a bookmarked or reopened URL restores the view. No other session state.

**Architecture:**
- **`internal/scan`: the Cache.** `extractFile` splits into a read and `extractSource(rel, src)`, whose facts depend on nothing but the path and the content. `Cache.extract` reads a file, hashes it with SHA-256, and returns the cached facts when the hash is the one it last saw; otherwise it parses and stores. `Run` drops entries for files that are gone. Nothing writes to a `fileFacts` after extraction (checked: only `extract.go` and `sites.go` assign to one, both before it is returned), so sharing them between scans is safe. `Stats.Parsed` says how many files a scan parsed.
- **`internal/export`: the live page.** `LivePage(tmpl)` fills the marker with `{"live":true}` and prepends `connect-src 'self'; ` to the page's meta CSP. `Marshal(v)` is the View JSON `Render` inlines; `Render` now calls it.
- **`internal/serve`: the server, with no zu logic.** `Listen` checks the address; `Handler(page, view)` serves the page at `/` and whatever `view` builds at `/view.json`, after the Host, method and `Sec-Fetch-Site` checks.
- **`internal/cli`: `zu serve`.** A `session` holds the options and the Cache. Each `view` call lists the working tree as `zu scan` does, reloads the Policy, rescans through the Cache, and builds the View with `projectView`, the half of `writeHTML` that `zu scan -html` also uses. So the served View is byte-identical to the one `zu scan -html` inlines (Task 4 tests it).
- **`web/`: the page fetches.** `readEmbedded` returns `"live"` for the marker, and `main.tsx` then awaits `fetchView()`. A failed fetch or an unreadable View shows its message instead of a blank page.

**Tech Stack:** Go 1.24 standard library (`net/http`, `crypto/sha256`); React 19 and vitest as in 08; `playwright-core` from `web/e2e` for the browser harness. No new dependency.

**Source decisions:**
- decisions.md l.46 "Watch + session restore: with `serve`, after the v1 core"; l.23 "Both refs are scanned fresh (no IR cache)"; l.40 "view state in the URL hash".
- requirements-draft.md: CLI surface, `serve` ("Scan if needed, then open the local web UI"; "URL on stdout, server in foreground"); "`-open` on `serve`"; "`-port` — defaults to a fixed port, falls back to a free one and says which"; Standalone viewing; Web UI "Served from the binary on localhost"; Safety "The server binds to localhost only … no source path from the IR is turned into a link without validating it resolves inside the declared project root"; Performance budgets; build order item 2; A11 and U1 (watch, for 11).
- ADR 0002 (one parse per file, AST dropped), ADR 0003 (byte-identical IR), ADR 0005 (git is the only process zu runs), ADR 0006 (the page is the export's).

**Out of scope:**
- Watching the tree and pushing a redraw (A11, U1's "preserved across re-renders in watch mode"): feature 11, below.
- A served Change View (Mode B). It is not trivial: it needs the base ref, the merge-base, `-worktree`, the base tree kept open for hunks, and `diff`'s violation delta, all of which live in `runDiff` today. A later feature can add `zu serve -base ref` on the same session.
- `-open`, which would launch a browser (Deviation 7).
- Re-reading `-coverprofile` while serving (Deviation 10).
- A stat fingerprint in front of the content hash (Deviation 3).

---

## Deviations and decisions for review

1. **The endpoint serves the View, not the IR.** The page has never read the IR: it reads the View that `internal/export` builds from it (04), and the IR of kubernetes is 99 MB while its Project View is 6.2 MB. `/view.json` is the View JSON `zu scan -html` would inline for the same tree and flags, byte for byte (Task 4).
2. **Without watch, every page load rescans.** `GET /view.json` lists the working tree, reloads the Policy and rescans through the Cache, so a reload shows the tree as it is now. One rescan runs at a time; a second request waits for the first. Feature 11 replaces "rescan per request" with "rescan when the watcher sees a change, keep the result, push an event".
3. **The Cache key is path and content hash, with no stat fingerprint.** Every rescan reads and hashes every listed Go file; only a changed hash re-parses. Measured on kubernetes (Task 7): a rescan after a one-file edit takes 1.09–1.19 s end to end over HTTP, 0.64–0.84 s of it in `scan.Run`, so the 2 s budget holds without trusting mtimes. On a full worktree (git tracks 31,300 files there, against the copy's Go files and go.mods) the rescan takes 1.74–1.93 s: still met, with 0.07–0.26 s to spare (acceptance.md). A size-and-mtime fingerprint would save the read and hash (0.27 s serial, warm), but it can miss an edit that keeps both (same size, same timestamp tick). Feature 11's watcher polls size and mtime to decide *when* to rescan; the rescan still trusts only content.
4. **The CSP is rewritten in the page, and the header adds what a meta cannot carry.** A page enforces its meta policy and any header policy together, so a header cannot grant a fetch the meta forbids. `LivePage` therefore prepends `connect-src 'self'; ` to the meta's `content`, independent of how Vite escapes the rest (it writes `&#39;none&#39;`). The response header is `Content-Security-Policy: frame-ancestors 'none'`, which a meta policy ignores. `web/embed_test.go` checks the built page can take the rewrite. Firefox's own favicon loader asks for `/favicon.ico`, which `img-src data:` refuses and logs; the page makes no such request, and the harness ignores that one message (Task 5).
5. **Addresses.**
   - `-addr host:port`, where host is a loopback IP literal (`127.0.0.1`, any `127.x.y.z`, `::1`) or `localhost`, which binds `127.0.0.1`. zu resolves no name, not even `localhost`: a hosts file can point any name elsewhere, and zu stays offline. An empty host (`:7433`, every interface), `0.0.0.0`, `::` or any other name exits 3 before the scan.
   - Without `-addr`: `127.0.0.1:7433`, or a free loopback port when that one is in use, and stderr says so (requirements: "defaults to a fixed port, falls back to a free one and says which"). The fixed port is what makes session restore work across restarts: the URL, and so the view in its hash, stays valid. An explicit `-addr` never falls back.
   - The URL goes to stdout, alone on its line (`http://127.0.0.1:7433/`); everything else goes to stderr.
6. **Three request checks, all before any scan.**
   - `Host` must be `localhost` or a loopback IP, with or without a port; otherwise 421. A rebinding attack's page reaches 127.0.0.1 under its own name, which the browser puts in `Host`.
   - Only `GET` and `HEAD`; otherwise 405 with `Allow: GET, HEAD`. Only `/` and `/view.json`; otherwise 404. There is no path-to-file mapping at all, so no source path can resolve outside the project root: source reaches the page only inside the View, read through the scan's Tree (which refuses links leaving the root) and checked by `addSources`' `filepath.IsLocal`.
   - `/view.json` refuses `Sec-Fetch-Site: same-site` or `cross-site` with 403. Another site's page cannot read the answer (there is no CORS), but it could make zu rescan at will. Opening `/` from a link elsewhere stays allowed: the page holds no data. The check stops other sites' fetches of `view.json` only: a top-level navigation to `/` from anywhere loads the page, whose own same-origin fetch of `view.json` then rescans once (review, 2026-09-25).
   Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The server sets `ReadHeaderTimeout` (10 s) and `IdleTimeout` (60 s).
7. **No `-open`.** Launching a browser means running a process other than git, which ADR 0005 and `gitref`'s package comment rule out. The URL on stdout is enough to click or pipe.
8. **"Scan if needed" is "scan on start".** `zu serve` keeps no IR on disk (decisions l.23, "no IR cache") and writes nothing, not even `.zu/`. It scans once before printing the URL, so a tree zu cannot scan (no `go.mod`, a bad Policy) exits 3 instead of serving an error. After that a failed rescan is a 500 whose text the page shows, and the server keeps running.
9. **Flags are `zu scan -html`'s, minus what does not apply.** `-include`, `-link-template` and `-coverprofile` mean what they mean for `zu scan -html`. `-ref` does not apply (a commit does not change), nor `-out`, `-html` or `-max-parse-errors` (parse errors show in the page's header, as in any export). `-include-ignored` is left for later; nothing asked for it.
10. **`-coverprofile` is read once, at start.** A profile describes one test run; re-reading it on every rescan would pair a new tree with an old run just as silently. The CRAP lines on stderr repeat on each rescan, so a profile going stale shows as a growing "match no function" count (08 Deviation 6). Re-reading it when its mtime changes belongs with 11's watcher.
11. **`zu serve` stops on Ctrl-C with exit 0,** after `http.Server.Shutdown` (5 s grace). A server that fails after start exits 3.
12. **A page that cannot read its View now says why.** Before, an inlined View of an unknown schema threw at the top level and left a blank page. Now `main.tsx` catches it and shows the message, for exports and served pages alike.
13. **The usage line and `planned`.** `serve` was the last planned command, so the `planned` map and its test go, and the usage line says what `serve` now does.
14. **Doc amendments, proposed for approval** (not task steps):
    - `decisions.md` l.46, replace "**Watch + session restore:** with `serve`, after the v1 core." with:
      > **Serve (10):** `zu serve [dir] [-addr host:port] [-include …] [-link-template …] [-coverprofile …]` serves the working tree's Project View on a loopback address only (default 127.0.0.1:7433, a free port when that is taken), answers only requests whose Host names this machine, and has no write endpoint; it writes nothing to disk. The page is the HTML Export's, fetching its View from `/view.json` under the export's CSP plus `connect-src 'self'`. Each page load rescans; `scan.Cache` re-parses only files whose content changed, and the IR stays byte-identical to a cold scan's. Session restore is the URL hash on the fixed port. No `-open`: git is the only process zu runs. **Watch** (11): poll the files git lists, rescan on change, redraw over Server-Sent Events keeping the hash. A served Change View is not planned yet.
    - `requirements-draft.md`, CLI surface table, `serve` row: "Scan if needed, then open the local web UI" → "Scan the working tree, then serve the local web UI; every page load rescans what changed". Flags: replace the `-open` bullet with "`-open` — dropped: zu runs no process but git (ADR 0005); `serve` prints its URL on stdout", and the `-port` bullet with "`-addr` on `serve` — a loopback `host:port`; defaults to 127.0.0.1:7433, falls back to a free port and says which".
    - `requirements-draft.md`, Performance budgets: after "Incremental re-scan after one file changes: under 2 seconds." add "(Measured by feature 10 on a full kubernetes v1.37.0 worktree: 1.74–1.93 s, request to response.)" (the figure measured in Task 7, not the drafting copy's 1.09–1.19 s)
    - `CLAUDE.md`, Layout: after the `internal/scan` line add "; `Cache` keeps each file's facts by path and content hash, so a rescan parses only changed files (`cache_test.go` proves the rescan's IR equals a cold scan's)", and add a line "- `internal/serve` — `zu serve`'s HTTP layer: loopback-only `Listen`, `Handler` (Host check, read-only, `/` and `/view.json`); `internal/cli/serve.go` holds the session".
    - `glossary.md`: no change. "Project View", "IR" and "HTML Export" cover it; the served page is the HTML Export's page.

---

## The contract

**CLI:** `zu serve [dir] [-addr host:port] [-include pattern]… [-link-template url] [-coverprofile file]`. Flags may come before or after `dir` (default `.`).

- stdout: the URL, `http://<addr>/`, once the first scan succeeded.
- stderr, per scan (the first at start, then one per `/view.json` request):
  `zu serve: scanned in 1.122s: 2963 packages, 9909 files, 1 parsed, 0 parse errors`, preceded by the CRAP lines when `-coverprofile` is given.
- stderr, when the default port is taken: `zu serve: 127.0.0.1:7433 is in use; serving on a free port`.
- Exit 3 before scanning: a non-loopback `-addr` (`zu serve: -addr: 0.0.0.0:0 is not a loopback address: zu serve listens on 127.0.0.1, ::1 or localhost only`), an address in use when given explicitly, an unknown flag, a second directory, a bad `-include`, `-link-template` or `-coverprofile`, or a zu built without the UI. Exit 3 after the first scan fails. Exit 0 on Ctrl-C.

**HTTP**, for requests whose `Host` is `localhost` or a loopback IP (else 421):

| Request | Answer |
|---|---|
| `GET /` | the export page with `{"live":true}` in its data marker and `connect-src 'self'; ` first in its CSP; `text/html; charset=utf-8` |
| `GET /view.json` | a rescan, then the Project View JSON (`application/json`), byte-identical to what `zu scan -html` inlines for the same tree and flags; 500 with the error text when the rescan fails; 403 when `Sec-Fetch-Site` is `same-site` or `cross-site` |
| any other path | 404 |
| any other method | 405, `Allow: GET, HEAD` |

Every answer carries `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

**Page:** `{"live":true}` in the marker makes the page `fetch("view.json", {cache: "no-store"})` and draw the result exactly as an inlined View. A non-2xx answer shows `zu serve: <body>`.

---

# Tasks

### Task 1: `scan.Cache` re-parses only files whose content changed

A rescan through a Cache must write the IR a cold scan writes, byte for byte, after an edit, an add and a delete, and parse only what changed. The edit makes `money.Add` call `Neg`, which no file declares yet; the add declares it in a new file. The unchanged `money.go`'s cached facts must then resolve against the new file (a `calls` edge appears), and lose it again when the file is deleted. That is the cross-file case an incremental scan gets wrong if it caches anything past extraction. `fixture` adds an unparseable file, so a cached parse error is covered too.

**Files:**
- Create: `internal/scan/cache.go`, `internal/scan/cache_test.go`
- Modify: `internal/scan/extract.go`, `internal/scan/scan.go`

**Steps:**

- [x] **Write the failing test**

<!-- file: internal/scan/cache_test.go -->
```go
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
```

- [x] **Run:** `go test ./internal/scan -run 'TestCache|TestRunWithoutACache'` Expected: FAIL (`opts.Cache undefined`, `st.Parsed undefined`)

- [x] **Implement.** `extractFile` keeps its signature for the existing tests; the parse moves to `extractSource`.

```diff
--- a/internal/scan/extract.go
+++ b/internal/scan/extract.go
@@ -52,12 +52,19 @@ type declFact struct {
 
 // extractFile parses rel from t and pulls out its facts.
 func extractFile(t Tree, rel string) *fileFacts {
+	f, _ := (*Cache)(nil).extract(t, rel)
+	return f
+}
+
+// readFailed is the facts of a file t could not read.
+func readFailed(rel string, err error) *fileFacts {
+	return &fileFacts{Path: rel, Dir: path.Dir(rel), Err: &ir.ParseError{Path: rel, Message: ioMessage(err)}}
+}
+
+// extractSource pulls the facts out of src, the content of rel. They depend
+// on nothing else, which is what lets a Cache reuse them.
+func extractSource(rel string, src []byte) *fileFacts {
 	f := &fileFacts{Path: rel, Dir: path.Dir(rel)}
-	src, err := t.ReadFile(rel)
-	if err != nil {
-		f.Err = &ir.ParseError{Path: rel, Message: ioMessage(err)}
-		return f
-	}
 	fset := token.NewFileSet()
 	file, err := parser.ParseFile(fset, rel, src, parser.ParseComments)
 	if err != nil {
```

<!-- file: internal/scan/cache.go -->
```go
package scan

import (
	"crypto/sha256"
	"sync"
)

// Cache keeps each file's facts between scans, keyed by path and content
// hash, so a rescan parses only the files whose content changed (10). A
// file's facts depend on nothing but its path and content, so one Cache
// serves any Tree. Everything after extraction (modules, the index, the
// build) still runs over every file, which is what keeps a rescan's IR
// byte-identical to a cold scan's. Safe for concurrent use.
type Cache struct {
	mu    sync.Mutex
	files map[string]cached
}

type cached struct {
	sum   [sha256.Size]byte
	facts *fileFacts // shared between scans: nothing writes to it after extraction
}

// NewCache returns an empty Cache.
func NewCache() *Cache { return &Cache{files: map[string]cached{}} }

// extract returns rel's facts, from c when rel's content is what c last saw,
// and reports whether it parsed rel. A nil Cache parses every file. A read
// error is never cached: it says nothing about the content.
func (c *Cache) extract(t Tree, rel string) (f *fileFacts, parsed bool) {
	src, err := t.ReadFile(rel)
	if err != nil {
		return readFailed(rel, err), false
	}
	if c == nil {
		return extractSource(rel, src), true
	}
	sum := sha256.Sum256(src)
	c.mu.Lock()
	e, ok := c.files[rel]
	c.mu.Unlock()
	if ok && e.sum == sum {
		return e.facts, false
	}
	f = extractSource(rel, src)
	c.mu.Lock()
	c.files[rel] = cached{sum, f}
	c.mu.Unlock()
	return f, true
}

// keep drops every file not in files, so a deleted file's facts do not
// outlive it.
func (c *Cache) keep(files []string) {
	if c == nil {
		return
	}
	live := make(map[string]bool, len(files))
	for _, f := range files {
		live[f] = true
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for p := range c.files {
		if !live[p] {
			delete(c.files, p)
		}
	}
}
```

```diff
--- a/internal/scan/scan.go
+++ b/internal/scan/scan.go
@@ -24,6 +24,9 @@ type Options struct {
 	Exclude func(rel string) bool
 	// PolicyHash is recorded in the IR; "" means DefaultPolicyHash.
 	PolicyHash string
+	// Cache, when set, keeps each file's facts for the next scan, which
+	// then parses only the files whose content changed (10).
+	Cache *Cache
 }
 
 // Stats summarise a scan for the one-line report, and carry what the scan
@@ -34,6 +37,7 @@ type Stats struct {
 	ParseErrors     int
 	UnresolvedCalls int
 	Measures        Measures
+	Parsed          int // files this scan parsed; with a Cache, only the new and changed ones (10)
 }
 
 // Run scans opts.Tree. The result is unsorted; ir.Encode canonicalises it.
@@ -44,15 +48,16 @@ func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
 	if err != nil {
 		return nil, Stats{}, err
 	}
-	facts, err := extractAll(ctx, opts.Tree, w, opts.Workers)
+	facts, parsed, err := extractAll(ctx, opts.Tree, w, opts.Workers, opts.Cache)
 	if err != nil {
 		return nil, Stats{}, err
 	}
+	opts.Cache.keep(w.Files)
 	doc, ms := assemble(w, facts)
 	doc.Grouping = "tree"
 	doc.PolicyHash = cmp.Or(opts.PolicyHash, DefaultPolicyHash)
 
-	st := Stats{ParseErrors: len(doc.ParseErrors), Measures: ms}
+	st := Stats{ParseErrors: len(doc.ParseErrors), Measures: ms, Parsed: parsed}
 	for _, n := range doc.Nodes {
 		if n.Kind == ir.KindPackage {
 			st.Packages++
@@ -69,13 +74,16 @@ func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
 	return doc, st, nil
 }
 
-// extractAll parses every file in parallel. Each worker writes only its own
-// slot, so the result order is the sorted file order regardless of timing.
-func extractAll(ctx context.Context, t Tree, w *walkResult, workers int) ([]*fileFacts, error) {
+// extractAll parses every file in parallel, or takes its facts from c when
+// its content is unchanged, and counts the files it parsed. Each worker
+// writes only its own slot, so the result order is the sorted file order
+// regardless of timing.
+func extractAll(ctx context.Context, t Tree, w *walkResult, workers int, c *Cache) ([]*fileFacts, int, error) {
 	if workers <= 0 {
 		workers = runtime.GOMAXPROCS(0)
 	}
 	facts := make([]*fileFacts, len(w.Files))
+	parsed := make([]bool, len(w.Files))
 	next := make(chan int)
 	var wg sync.WaitGroup
 	for range workers {
@@ -83,7 +91,7 @@ func extractAll(ctx context.Context, t Tree, w *walkResult, workers int) ([]*fil
 		go func() {
 			defer wg.Done()
 			for i := range next {
-				facts[i] = extractFile(t, w.Files[i])
+				facts[i], parsed[i] = c.extract(t, w.Files[i])
 			}
 		}()
 	}
@@ -102,5 +110,11 @@ feed:
 	if err == nil {
 		err = ctx.Err()
 	}
-	return facts, err
+	n := 0
+	for _, p := range parsed {
+		if p {
+			n++
+		}
+	}
+	return facts, n, err
 }
```

- [x] **Run:** `go test -race ./internal/scan` Expected: PASS, the golden and parity tests unchanged.

### Task 2: `export.LivePage` and `export.Marshal`

The served page fetches its View, so it carries a marker instead of one, and its CSP must allow exactly that fetch. The fixture template gains the CSP element the build writes, with Vite's `&#39;` escaping, so the rewrite is tested against the real shape. `web/embed_test.go` checks the built page can take it; it skips until `make build` (Task 5 builds it).

**Files:**
- Modify: `internal/export/render.go`, `internal/export/render_test.go`, `internal/export/testdata/template.html`, `web/embed_test.go`

**Steps:**

- [x] **Write the failing tests**

<!-- file: internal/export/testdata/template.html -->
```html
<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; worker-src blob:"><title>t</title></head><body><script id="zu-data" type="application/json">{}</script><div id="root"></div></body></html>
```

```diff
--- a/internal/export/render_test.go
+++ b/internal/export/render_test.go
@@ -55,3 +55,52 @@ func TestRenderNeedsExactlyOneMarker(t *testing.T) {
 		}
 	}
 }
+
+// zu serve's page (10) carries no View: it fetches view.json, which its CSP
+// must allow, from the server that served it and nowhere else.
+func TestLivePageFetchesItsViewFromItsOrigin(t *testing.T) {
+	page, err := LivePage(template(t))
+	if err != nil {
+		t.Fatal(err)
+	}
+	s := string(page)
+	for _, want := range []string{
+		`<script id="zu-data" type="application/json">{"live":true}</script>`,
+		`http-equiv="Content-Security-Policy" content="connect-src 'self'; default-src &#39;none&#39;; worker-src blob:"`,
+	} {
+		if !strings.Contains(s, want) {
+			t.Errorf("live page lacks %s:\n%s", want, s)
+		}
+	}
+}
+
+func TestLivePageNeedsOneMarkerAndOneCSP(t *testing.T) {
+	good := string(template(t))
+	csp := `<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; worker-src blob:">`
+	for name, tmpl := range map[string]string{
+		"no marker": strings.Replace(good, marker, "", 1),
+		"no CSP":    strings.Replace(good, csp, "", 1),
+		"two CSPs":  strings.Replace(good, csp, csp+csp, 1),
+	} {
+		if _, err := LivePage([]byte(tmpl)); err == nil {
+			t.Errorf("%s: accepted", name)
+		}
+	}
+}
+
+// Marshal writes the View as Render inlines it.
+func TestMarshalIsWhatRenderInlines(t *testing.T) {
+	v := newView("project", shopIR(t))
+	v.Sources["x.go"] = "a < b"
+	data, err := Marshal(v)
+	if err != nil {
+		t.Fatal(err)
+	}
+	var page bytes.Buffer
+	if err := Render(&page, template(t), v); err != nil {
+		t.Fatal(err)
+	}
+	if !bytes.Contains(page.Bytes(), data) || !bytes.Contains(data, []byte(`a \u003c b`)) {
+		t.Errorf("Marshal = %s", data)
+	}
+}
```

```diff
--- a/web/embed_test.go
+++ b/web/embed_test.go
@@ -4,6 +4,8 @@ import (
 	"io/fs"
 	"strings"
 	"testing"
+
+	"zu/internal/export"
 )
 
 func TestAssetsIsRootedAtDist(t *testing.T) {
@@ -43,4 +45,7 @@ func TestBuiltPageIsSelfContained(t *testing.T) {
 	if !strings.Contains(page, "revokeObjectURL(self.location.href)") {
 		t.Error("no inline worker in the page: ELK would lay out on the main thread")
 	}
+	if _, err := export.LivePage(b); err != nil {
+		t.Errorf("zu serve cannot serve the built page: %v", err)
+	}
 }
```

- [x] **Run:** `go test ./internal/export` Expected: FAIL (`undefined: LivePage`)

- [x] **Implement**

```diff
--- a/internal/export/render.go
+++ b/internal/export/render.go
@@ -5,6 +5,7 @@ import (
 	"encoding/json"
 	"fmt"
 	"io"
+	"strings"
 )
 
 // marker is the element Render fills. web/index.html carries it exactly once
@@ -23,8 +24,7 @@ func Render(w io.Writer, tmpl []byte, v *View) error {
 	if n := bytes.Count(tmpl, []byte(marker)); n != 1 {
 		return fmt.Errorf("UI template has %d data markers, want 1", n)
 	}
-	sortView(v)
-	data, err := json.Marshal(v)
+	data, err := Marshal(v)
 	if err != nil {
 		return err
 	}
@@ -37,3 +37,31 @@ func Render(w io.Writer, tmpl []byte, v *View) error {
 	}
 	return nil
 }
+
+// Marshal writes v in canonical order as the JSON Render inlines, which is
+// also what zu serve sends (10).
+func Marshal(v *View) ([]byte, error) {
+	sortView(v)
+	return json.Marshal(v)
+}
+
+// cspAttr opens the page's Content-Security-Policy, which web/vite.config.ts
+// writes as the first element of <head>.
+const cspAttr = `<meta http-equiv="Content-Security-Policy" content="`
+
+// LivePage is the page zu serve sends (10): tmpl with the marker holding
+// {"live":true}, which tells the page to fetch view.json, and its CSP
+// allowing that fetch from the page's own origin and nowhere else. A header
+// CSP could not do it: a page enforces its meta policy and a header policy
+// both, so only the meta policy can grant the fetch.
+func LivePage(tmpl []byte) ([]byte, error) {
+	if n := bytes.Count(tmpl, []byte(marker)); n != 1 {
+		return nil, fmt.Errorf("UI template has %d data markers, want 1", n)
+	}
+	if n := bytes.Count(tmpl, []byte(cspAttr)); n != 1 {
+		return nil, fmt.Errorf("UI template has %d Content-Security-Policy elements, want 1", n)
+	}
+	live := strings.Replace(marker, "{}", `{"live":true}`, 1)
+	page := bytes.Replace(tmpl, []byte(marker), []byte(live), 1)
+	return bytes.Replace(page, []byte(cspAttr), []byte(cspAttr+"connect-src 'self'; "), 1), nil
+}
```

- [x] **Run:** `go test ./internal/export ./internal/cli ./web` Expected: PASS (`cli`'s HTML tests read the changed fixture).

### Task 3: `internal/serve`: loopback only, Host-checked, read-only

The package knows nothing of zu: it takes the page bytes and a function that builds the View. The tests forge `Host` and `Sec-Fetch-Site` headers the way a rebinding page or another site's page would send them, and check the View is never built for them.

**Files:**
- Create: `internal/serve/serve.go`, `internal/serve/serve_test.go`

**Steps:**

- [x] **Write the failing test**

<!-- file: internal/serve/serve_test.go -->
```go
package serve

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLoopbackAddr(t *testing.T) {
	for addr, want := range map[string]string{
		"127.0.0.1:0":    "127.0.0.1:0",
		"127.0.0.2:7433": "127.0.0.2:7433",
		"[::1]:0":        "[::1]:0",
		"localhost:7433": "127.0.0.1:7433", // bound, not resolved
		"LocalHost:1":    "127.0.0.1:1",
		":7433":          "", // every interface
		"0.0.0.0:7433":   "",
		"[::]:7433":      "",
		"192.168.1.2:80": "",
		"example.com:80": "", // a name zu would have to resolve
		"localhost.:80":  "",
		"127.0.0.1":      "", // no port
	} {
		got, err := LoopbackAddr(addr)
		if want == "" {
			if err == nil {
				t.Errorf("LoopbackAddr(%q) = %q, want an error", addr, got)
			}
			continue
		}
		if err != nil || got != want {
			t.Errorf("LoopbackAddr(%q) = %q, %v; want %q", addr, got, err, want)
		}
	}
}

func TestListenRefusesANonLoopbackAddress(t *testing.T) {
	ln, err := Listen("0.0.0.0:0")
	if err == nil {
		ln.Close()
		t.Fatal("listened on every interface")
	}
	if !strings.Contains(err.Error(), "loopback") {
		t.Errorf("err = %v", err)
	}
}

// Without -addr zu serve takes its fixed port, so a bookmarked view keeps
// working across restarts, and a free loopback port when that one is taken.
func TestListenFallsBackWhenTheDefaultPortIsTaken(t *testing.T) {
	taken, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer taken.Close()
	ln, err := listen("", taken.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	got := ln.Addr().(*net.TCPAddr)
	if !got.IP.IsLoopback() || got.String() == taken.Addr().String() {
		t.Errorf("listening on %v", got)
	}
}

func TestListenTakesTheDefaultPortWhenFree(t *testing.T) {
	free, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := free.Addr().String()
	free.Close()
	ln, err := listen("", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if ln.Addr().String() != addr {
		t.Errorf("listening on %v, want %s", ln.Addr(), addr)
	}
}

// get sends one request to a Handler serving "PAGE", and a View that counts
// its builds.
func get(t *testing.T, method, path, host string, hdr map[string]string, view func(context.Context) ([]byte, error)) (*httptest.ResponseRecorder, int) {
	t.Helper()
	builds := 0
	if view == nil {
		view = func(context.Context) ([]byte, error) { return []byte(`{"schema":"1"}`), nil }
	}
	h := Handler([]byte("PAGE"), func(ctx context.Context) ([]byte, error) {
		builds++
		return view(ctx)
	})
	r := httptest.NewRequest(method, path, nil)
	r.Host = host
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w, builds
}

func TestHandlerServesThePageAndItsView(t *testing.T) {
	w, _ := get(t, "GET", "/", "127.0.0.1:7433", nil, nil)
	if w.Code != 200 || w.Body.String() != "PAGE" || w.Header().Get("Content-Type") != "text/html; charset=utf-8" {
		t.Errorf("/ = %d %q %q", w.Code, w.Header().Get("Content-Type"), w.Body.String())
	}
	w, builds := get(t, "GET", "/view.json", "localhost:7433", map[string]string{"Sec-Fetch-Site": "same-origin"}, nil)
	if w.Code != 200 || w.Body.String() != `{"schema":"1"}` || w.Header().Get("Content-Type") != "application/json" || builds != 1 {
		t.Errorf("/view.json = %d %q %q, %d builds", w.Code, w.Header().Get("Content-Type"), w.Body.String(), builds)
	}
	for k, v := range map[string]string{
		"Content-Security-Policy": "frame-ancestors 'none'",
		"X-Content-Type-Options":  "nosniff",
		"Cache-Control":           "no-store",
		"Referrer-Policy":         "no-referrer",
	} {
		if got := w.Header().Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
}

// A page on another site can make the browser send a request here, with a
// name it controls resolving to 127.0.0.1 (DNS rebinding). The Host header
// still carries that name.
func TestHandlerAnswersOnlyRequestsForThisMachine(t *testing.T) {
	for _, host := range []string{"127.0.0.1", "127.0.0.1:7433", "localhost", "LOCALHOST:1", "[::1]:7433", "[::1]", "127.9.9.9:1"} {
		if w, _ := get(t, "GET", "/", host, nil, nil); w.Code != 200 {
			t.Errorf("Host %q: %d", host, w.Code)
		}
	}
	for _, host := range []string{"", "evil.example", "evil.example:7433", "localhost.evil.example", "10.0.0.1:7433", "[::]:7433"} {
		for _, path := range []string{"/", "/view.json"} {
			w, builds := get(t, "GET", path, host, nil, nil)
			if w.Code != http.StatusMisdirectedRequest || builds != 0 {
				t.Errorf("Host %q %s: %d, %d builds", host, path, w.Code, builds)
			}
		}
	}
}

// The browser labels a request a page on another origin makes. Such a page
// cannot read the answer, but it could make zu rescan at will.
func TestHandlerBuildsTheViewOnlyForItsOwnPage(t *testing.T) {
	for site, want := range map[string]int{"": 200, "same-origin": 200, "none": 200, "same-site": 403, "cross-site": 403} {
		w, builds := get(t, "GET", "/view.json", "127.0.0.1:7433", map[string]string{"Sec-Fetch-Site": site}, nil)
		if w.Code != want || (builds == 1) != (want == 200) {
			t.Errorf("Sec-Fetch-Site %q: %d, %d builds; want %d", site, w.Code, builds, want)
		}
	}
	// Opening the page from a link on another site is fine: it holds no data.
	if w, _ := get(t, "GET", "/", "127.0.0.1:7433", map[string]string{"Sec-Fetch-Site": "cross-site"}, nil); w.Code != 200 {
		t.Errorf("/ from another site: %d", w.Code)
	}
}

func TestHandlerIsReadOnly(t *testing.T) {
	for _, m := range []string{"POST", "PUT", "DELETE", "PATCH", "OPTIONS"} {
		w, builds := get(t, m, "/view.json", "127.0.0.1:7433", nil, nil)
		if w.Code != http.StatusMethodNotAllowed || w.Header().Get("Allow") != "GET, HEAD" || builds != 0 {
			t.Errorf("%s: %d Allow=%q, %d builds", m, w.Code, w.Header().Get("Allow"), builds)
		}
	}
	for _, p := range []string{"/index.html", "/go.mod", "/../go.mod", "/view.json/x", "/src/main.go"} {
		if w, _ := get(t, "GET", p, "127.0.0.1:7433", nil, nil); w.Code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", p, w.Code)
		}
	}
}

func TestHandlerReportsAFailedBuild(t *testing.T) {
	w, _ := get(t, "GET", "/view.json", "127.0.0.1:7433", nil, func(context.Context) ([]byte, error) {
		return nil, errors.New("zu.policy.yaml: line 3: bad level")
	})
	if w.Code != 500 || !strings.Contains(w.Body.String(), "zu.policy.yaml: line 3: bad level") {
		t.Errorf("%d %q", w.Code, w.Body.String())
	}
}
```

- [x] **Run:** `go test ./internal/serve` Expected: FAIL (`undefined: LoopbackAddr`)

- [x] **Implement**

<!-- file: internal/serve/serve.go -->
```go
// Package serve is zu's local web server (10): the page the HTML Export
// uses and the View it draws, to this machine only. It serves no file by
// path and accepts no writes; source reaches the page only inside the View,
// read through the scan's Tree.
package serve

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"syscall"
)

// DefaultAddr is where zu serve listens without -addr. A fixed port keeps a
// view's URL, and with it the view state in its hash, valid across restarts.
const DefaultAddr = "127.0.0.1:7433"

// Listen opens addr, which LoopbackAddr must accept. With addr "" it opens
// DefaultAddr, or a free loopback port when DefaultAddr is in use.
func Listen(addr string) (net.Listener, error) {
	return listen(addr, DefaultAddr)
}

func listen(addr, def string) (net.Listener, error) {
	if addr != "" {
		bind, err := LoopbackAddr(addr)
		if err != nil {
			return nil, err
		}
		return net.Listen("tcp", bind)
	}
	ln, err := net.Listen("tcp", def)
	if !errors.Is(err, syscall.EADDRINUSE) {
		return ln, err
	}
	host, _, _ := net.SplitHostPort(def)
	return net.Listen("tcp", net.JoinHostPort(host, "0"))
}

// LoopbackAddr returns the address to bind for addr, a host:port whose host
// is a loopback IP or localhost, which binds 127.0.0.1. It resolves no
// names: a hosts file can point any name, localhost included, elsewhere.
func LoopbackAddr(addr string) (string, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", err
	}
	switch {
	case strings.EqualFold(host, "localhost"):
		host = "127.0.0.1"
	case !loopbackIP(host):
		return "", fmt.Errorf("%s is not a loopback address: zu serve listens on 127.0.0.1, ::1 or localhost only", addr)
	}
	return net.JoinHostPort(host, port), nil
}

func loopbackIP(s string) bool {
	ip := net.ParseIP(s)
	return ip != nil && ip.IsLoopback()
}

// loopbackHost reports whether a request's Host header names this machine:
// localhost or a loopback IP, with or without a port.
func loopbackHost(hostport string) bool {
	host, _, err := net.SplitHostPort(hostport)
	if err != nil {
		host = strings.TrimSuffix(strings.TrimPrefix(hostport, "["), "]")
	}
	return strings.EqualFold(host, "localhost") || loopbackIP(host)
}

// Handler serves page at / and, at /view.json, the View JSON that view
// builds for each request. It answers only requests whose Host names this
// machine, which defeats DNS rebinding, and builds the View only for its own
// page: a request another site's page makes is refused before any scan.
func Handler(page []byte, view func(context.Context) ([]byte, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", "frame-ancestors 'none'") // the page's meta CSP cannot say this
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		switch {
		case !loopbackHost(r.Host):
			http.Error(w, "zu serve answers requests for localhost only", http.StatusMisdirectedRequest)
		case r.Method != http.MethodGet && r.Method != http.MethodHead:
			h.Set("Allow", "GET, HEAD")
			http.Error(w, "zu serve is read-only", http.StatusMethodNotAllowed)
		case r.URL.Path == "/":
			h.Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(page)
		case r.URL.Path != "/view.json":
			http.NotFound(w, r)
		case crossSite(r):
			http.Error(w, "zu serve sends the View only to its own page", http.StatusForbidden)
		default:
			data, err := view(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			h.Set("Content-Type", "application/json")
			_, _ = w.Write(data)
		}
	})
}

// crossSite reports whether the browser says another origin's page made r.
func crossSite(r *http.Request) bool {
	switch r.Header.Get("Sec-Fetch-Site") {
	case "same-site", "cross-site":
		return true
	}
	return false
}
```

- [x] **Run:** `go test -race ./internal/serve` Expected: PASS

### Task 4: `zu serve`

`writeHTML`'s View-building half becomes `projectView`, and `prepare`'s checks after the `-html` switch become `load`, so `zu scan -html` and `zu serve` build one View one way. The first test proves it: the served `/view.json` equals the JSON `zu scan -html` inlines, byte for byte, and serving leaves no `.zu/` behind. The second proves each load rescans and parses only the new file. `startServe` runs the command in a goroutine with the `interruptContext` seam, reads the URL from a pipe, and interrupts it when the test ends, expecting exit 0.

**Files:**
- Create: `internal/cli/serve.go`, `internal/cli/serve_test.go`
- Modify: `internal/cli/html.go`, `internal/cli/cli.go`, `internal/cli/cli_test.go`

**Steps:**

- [x] **Write the failing tests.** `serve` is no longer planned, so its not-implemented test goes.

<!-- file: internal/cli/serve_test.go -->
```go
package cli

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// lockedBuffer is a stderr the server goroutine writes while the test reads.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// startServe runs zu serve with args until the test ends, when it
// interrupts it and expects exit 0. It returns the URL zu printed.
func startServe(t *testing.T, args ...string) (string, *lockedBuffer) {
	t.Helper()
	withUI(t)
	ctx, cancel := context.WithCancel(context.Background())
	old := interruptContext
	interruptContext = func() (context.Context, context.CancelFunc) { return ctx, cancel }
	outR, outW := io.Pipe()
	stderr := &lockedBuffer{}
	code := make(chan int, 1)
	go func() {
		code <- Run(append([]string{"serve", "-addr", "127.0.0.1:0"}, args...), outW, stderr)
		outW.Close()
	}()
	t.Cleanup(func() {
		cancel()
		if c := <-code; c != ExitOK {
			t.Errorf("exit %d after interrupt: %s", c, stderr.String())
		}
		interruptContext = old
	})
	line, err := bufio.NewReader(outR).ReadString('\n')
	if err != nil {
		t.Fatalf("no URL on stdout (%v); stderr:\n%s", err, stderr.String())
	}
	go func() { _, _ = io.Copy(io.Discard, outR) }()
	return strings.TrimSpace(line), stderr
}

func fetch(t *testing.T, url string) string {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET %s: %d %s", url, resp.StatusCode, b)
	}
	return string(b)
}

// zu serve sends the View zu scan -html inlines for the same tree and
// flags, byte for byte, and writes nothing into the tree.
func TestServeSendsTheViewScanHTMLInlines(t *testing.T) {
	dir := repo(t, small)
	url, _ := startServe(t, dir, "-include", "./a")
	if !strings.HasPrefix(url, "http://127.0.0.1:") || !strings.HasSuffix(url, "/") {
		t.Fatalf("URL = %q", url)
	}
	page := fetch(t, url)
	for _, want := range []string{`{"live":true}`, `connect-src 'self'`} {
		if !strings.Contains(page, want) {
			t.Errorf("page lacks %s", want)
		}
	}
	served := fetch(t, url+"view.json")
	noZu(t, dir)

	out := filepath.Join(t.TempDir(), "out.html")
	if code, _, errOut := run("scan", dir, "-out", "-", "-html", out, "-include", "./a"); code != ExitOK {
		t.Fatalf("scan: exit %d: %s", code, errOut)
	}
	html := readFile(t, out)
	open := `<script id="zu-data" type="application/json">`
	inlined := html[strings.Index(html, open)+len(open):]
	inlined = inlined[:strings.Index(inlined, "</script>")]
	if served != inlined {
		t.Errorf("served View differs from the inlined one:\nserved  %s\ninlined %s", served, inlined)
	}
}

// Every load of the page rescans, parsing only the files that changed.
func TestServeRescansOnlyWhatChanged(t *testing.T) {
	dir := repo(t, small)
	url, stderr := startServe(t, dir)
	if !strings.Contains(stderr.String(), "1 files, 1 parsed") {
		t.Errorf("startup scan: %s", stderr.String())
	}
	if v := fetch(t, url+"view.json"); strings.Contains(v, "example.com/m/b") {
		t.Fatal("b before it exists")
	}
	writeFile(t, dir, "b/b.go", "package b\n")
	if v := fetch(t, url+"view.json"); !strings.Contains(v, `"id":"example.com/m/b"`) {
		t.Errorf("b missing after it was added: %s", v)
	}
	lines := strings.Split(strings.TrimSpace(stderr.String()), "\n")
	for i, want := range []string{"1 files, 1 parsed", "1 files, 0 parsed", "2 files, 1 parsed"} {
		if i >= len(lines) || !strings.Contains(lines[i], want) || !strings.HasPrefix(lines[i], "zu serve: scanned in ") {
			t.Errorf("scan %d: want %q in %q", i, want, lines)
		}
	}
}

func TestServeBadInvocations(t *testing.T) {
	withUI(t)
	noGoMod := repo(t, map[string]string{"a/a.go": "package a\n"})
	for _, tc := range []struct {
		args []string
		want string
	}{
		{[]string{"-addr", "0.0.0.0:0"}, "not a loopback address"},
		{[]string{"-addr", ":0"}, "not a loopback address"},
		{[]string{"-addr", "example.com:0"}, "not a loopback address"},
		{[]string{"-coverprofile", "missing.out"}, "-coverprofile missing.out"},
		{[]string{"-include", "./a", "extra"}, "unexpected argument"},
		{[]string{"-html", "x.html"}, "flag provided but not defined: -html"},
		{[]string{"-ref", "HEAD"}, "flag provided but not defined: -ref"},
		{[]string{noGoMod}, "no go.mod"},
	} {
		dir := repo(t, small)
		args := append([]string{"serve", "-addr", "127.0.0.1:0", dir}, tc.args...)
		if tc.args[0] == noGoMod {
			args = []string{"serve", "-addr", "127.0.0.1:0", noGoMod}
		}
		code, out, errOut := run(args...)
		if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, tc.want) {
			t.Errorf("%v: exit %d, stdout %q, stderr %q; want exit 3 with %q", tc.args, code, out, errOut, tc.want)
		}
		noZu(t, dir)
	}
}

func TestServeWithoutTheUI(t *testing.T) {
	old := uiTemplate
	uiTemplate = func() ([]byte, error) { return os.ReadFile("no-such-template.html") }
	t.Cleanup(func() { uiTemplate = old })
	if code, _, errOut := run("serve", "-addr", "127.0.0.1:0", repo(t, small)); code != ExitBadInvocation || !strings.Contains(errOut, "no-such-template.html") {
		t.Errorf("exit %d: %s", code, errOut)
	}
}
```

```diff
--- a/internal/cli/cli_test.go
+++ b/internal/cli/cli_test.go
@@ -93,15 +93,3 @@ func TestUnknownCommandIsBadInvocation(t *testing.T) {
 		t.Errorf("stderr %q missing unknown-command message", errOut)
 	}
 }
-
-func TestPlannedCommandsReportNotImplemented(t *testing.T) {
-	for _, cmd := range []string{"serve"} {
-		code, _, errOut := run(cmd)
-		if code != ExitBadInvocation {
-			t.Errorf("%s: exit = %d, want %d", cmd, code, ExitBadInvocation)
-		}
-		if !strings.Contains(errOut, cmd+": not implemented") {
-			t.Errorf("%s: stderr %q missing not-implemented message", cmd, errOut)
-		}
-	}
-}
```

- [x] **Run:** `go test ./internal/cli -run Serve` Expected: FAIL (`zu serve: not implemented`)

- [x] **Implement**

```diff
--- a/internal/cli/html.go
+++ b/internal/cli/html.go
@@ -58,6 +58,12 @@ func (o *htmlOptions) prepare() error {
 	case o.path == "-":
 		return errors.New("-html needs a file path")
 	}
+	return o.load()
+}
+
+// load checks the patterns and the link template, and loads the UI page and
+// the coverprofile: everything a View needs besides the scan.
+func (o *htmlOptions) load() error {
 	for _, s := range o.include {
 		if _, err := export.ParsePattern(s, "root.invalid"); err != nil { // syntax only
 			return err
@@ -161,23 +167,33 @@ func builtTemplate() ([]byte, error) {
 // ir.Encode) as the Policy draws it, reading source through the tree the
 // scan read.
 func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, stderr io.Writer) error {
+	v, err := projectView(ctx, "scan", src, doc, pol, ms, o, stderr)
+	if err != nil {
+		return err
+	}
+	return renderView("scan", v, o, stderr)
+}
+
+// projectView builds the Project View of doc, which must be sorted, for zu
+// scan -html and zu serve alike.
+func projectView(ctx context.Context, cmd string, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, stderr io.Writer) (*export.View, error) {
 	root := export.RootModule(doc)
 	pats := make([]export.Pattern, 0, len(o.include))
 	for _, s := range o.include {
 		p, err := export.ParsePattern(s, root)
 		if err != nil {
-			return err
+			return nil, err
 		}
 		pats = append(pats, p)
 	}
 	v, err := export.Project(pol.Apply(doc), pats, src.tree.ReadFile)
 	if err != nil {
-		return err
+		return nil, err
 	}
 	export.Mark(v, pol, doc)
-	addMetrics("scan", v, ms, o, stderr)
+	addMetrics(cmd, v, ms, o, stderr)
 	if src.ref != nil {
-		warnUncommitted(ctx, "scan", src.root, "drop -ref", o, stderr)
+		warnUncommitted(ctx, cmd, src.root, "drop -ref", o, stderr)
 	}
 	v.Tool = version.Version
 	prefix := "" // a -ref scan runs at the repository top
@@ -185,9 +201,9 @@ func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy,
 		prefix = gitPrefix(ctx, src.root)
 	}
 	if v.Links, err = export.ForRepo(gitOrigin(ctx, src.root), doc.Ref, o.linkTmpl, prefix); err != nil {
-		return err
+		return nil, err
 	}
-	return renderView("scan", v, o, stderr)
+	return v, nil
 }
 
 // changeSides are the two scanned sides of zu diff, trees still open.
```

```diff
--- a/internal/cli/cli.go
+++ b/internal/cli/cli.go
@@ -23,18 +23,13 @@ const usage = `usage: zu <command> [flags]
 
 commands:
   scan      parse the checkout (or a commit, with -ref) and write the IR
-  serve     scan if needed, then serve the local web UI
+  serve     serve the working tree's Project View on localhost; each page load rescans
   diff      summarise a change: head against its merge-base with base
   check     evaluate the Policy's rules; fail on violations not in the Baseline
   policy    init: write a suggested zu.policy.yaml (never overwrites)
   version   print application, commit, IR schema and Policy format versions
 `
 
-// planned lists commands that are part of the CLI surface but not built yet.
-var planned = map[string]bool{
-	"serve": true,
-}
-
 // Run executes the command line args (without the program name) and returns
 // the process exit code.
 func Run(args []string, stdout, stderr io.Writer) int {
@@ -62,9 +57,8 @@ func Run(args []string, stdout, stderr io.Writer) int {
 		return runCheck(args[1:], stdout, stderr)
 	case cmd == "policy":
 		return runPolicy(args[1:], stdout, stderr)
-	case planned[cmd]:
-		fmt.Fprintf(stderr, "zu %s: not implemented\n", cmd)
-		return ExitBadInvocation
+	case cmd == "serve":
+		return runServe(args[1:], stdout, stderr)
 	default:
 		fmt.Fprintf(stderr, "zu: unknown command %q\n\n%s", cmd, usage)
 		return ExitBadInvocation
```

<!-- file: internal/cli/serve.go -->
```go
package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"zu/internal/export"
	"zu/internal/ir"
	"zu/internal/scan"
	"zu/internal/serve"
)

// runServe implements `zu serve [dir] [-addr host:port] [-include pattern]…
// [-link-template url] [-coverprofile file]` (10): the Project View of the
// working tree, on a loopback address, until interrupted. Every load of the
// page rescans the tree, parsing only the files whose content changed.
// Flags may come before or after dir. It writes nothing to disk.
func runServe(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("zu serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	addr := fs.String("addr", "", "listen on `host:port`, a loopback address (default "+serve.DefaultAddr+", or a free port when that is taken)")
	var o htmlOptions
	fs.Var(&o.include, "include", "inline declarations and source of packages matching `pattern` (repeatable; ./ = root module)")
	fs.StringVar(&o.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
	fs.StringVar(&o.cover, "coverprofile", "", "colour packages by CRAP from `file`, written by go test -coverprofile over this tree; read once, at start")
	dir, err := parseWithDir(fs, args)
	if err != nil {
		if !errors.Is(err, flag.ErrHelp) {
			fmt.Fprintf(stderr, "zu serve: %v\n", err)
		}
		return ExitBadInvocation
	}
	bad := func(err error) int {
		fmt.Fprintf(stderr, "zu serve: %v\n", err)
		return ExitBadInvocation
	}
	if err := o.load(); err != nil {
		return bad(err)
	}
	page, err := export.LivePage(o.tmpl)
	if err != nil {
		return bad(err)
	}
	ln, err := serve.Listen(*addr)
	if err != nil {
		return bad(fmt.Errorf("-addr: %w", err))
	}
	defer ln.Close()
	if *addr == "" && ln.Addr().String() != serve.DefaultAddr {
		fmt.Fprintf(stderr, "zu serve: %s is in use; serving on a free port\n", serve.DefaultAddr)
	}

	ctx, stop := interruptContext()
	defer stop()
	s := &session{dir: dir, o: &o, cache: scan.NewCache(), stderr: stderr}
	if _, err := s.view(ctx); err != nil { // a tree zu cannot scan fails here, not in the page
		return bad(err)
	}
	srv := &http.Server{Handler: serve.Handler(page, s.view), ReadHeaderTimeout: 10 * time.Second}
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ln) }()
	fmt.Fprintf(stdout, "http://%s/\n", ln.Addr())
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
		return ExitOK
	case err := <-done:
		return bad(err)
	}
}

// session is one zu serve: its options, and the Cache its rescans share.
type session struct {
	mu     sync.Mutex // one rescan at a time
	dir    string
	o      *htmlOptions
	cache  *scan.Cache
	stderr io.Writer
}

// view rescans the working tree under its Policy, as zu scan does, and
// returns the Project View JSON that zu scan -html would inline.
func (s *session) view(ctx context.Context) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	start := time.Now()
	src, err := openSource(ctx, s.dir, "", false)
	if err != nil {
		return nil, err
	}
	defer src.close()
	pol, err := loadPolicy(src.tree)
	if err != nil {
		return nil, err
	}
	doc, stats, err := scan.Run(ctx, scan.Options{Tree: src.tree, Exclude: pol.Excluded, PolicyHash: pol.Hash(), Cache: s.cache})
	if err != nil {
		return nil, err
	}
	doc.Ref.Commit, doc.Ref.Dirty = gitHead(ctx, src.root)
	doc.Ref.Dirty = doc.Ref.Commit != "" && (doc.Ref.Dirty || src.extra)
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	ir.Sort(doc) // as ir.Encode does before zu scan -html builds its View
	v, err := projectView(ctx, "serve", src, doc, pol, stats.Measures, s.o, s.stderr)
	if err != nil {
		return nil, err
	}
	data, err := export.Marshal(v)
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(s.stderr, "zu serve: scanned in %v: %d packages, %d files, %d parsed, %d parse errors\n",
		time.Since(start).Round(time.Millisecond), stats.Packages, stats.Files, stats.Parsed, stats.ParseErrors)
	return data, nil
}
```

- [x] **Run:** `go test -race ./internal/cli` Expected: PASS, every `scan -html` and `diff -html` test unchanged.

### Task 5: the browser harness serves a tree

`web/e2e/serve.mjs` builds nothing itself: it copies `testdata/shop` to a temp dir, starts `bin/zu serve` on it with `-include ./internal/store`, and checks in Chromium, Firefox and WebKit that:

- a URL with a view in its hash opens that view: the page fetched its View, drew it, and selected `Repo.Get` (`.row.selected` is `.Get`);
- reopening the URL in a new page restores the same view (session restore);
- a package added to the tree is drawn after a reload, and was not before;
- no CSP message is logged.

It fails now, as it should: Task 4's page carries the live marker, but the page does not yet know it, fails to parse `{"live":true}` as a View, and draws nothing.

**Files:**
- Create: `web/e2e/serve.mjs`
- Modify: `web/e2e/package.json`

**Steps:**

- [x] **Write the failing check**

<!-- file: web/e2e/serve.mjs -->
```js
// Browser acceptance for zu serve (10 Task 6). Not part of make check: it
// needs browsers and a bin/zu built with the UI. Run from web/e2e after
// `make build`: npm run accept-serve
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "zu-serve-"));
cpSync(join(here, "../../internal/scan/testdata/shop"), dir, { recursive: true });
const server = spawn(join(here, "../../bin/zu"), ["serve", dir, "-addr", "127.0.0.1:0", "-include", "./internal/store"], {
  stdio: ["ignore", "pipe", "pipe"],
});
// Stopped and removed however the run ends.
process.on("exit", () => {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
});
let log = "";
server.stderr.on("data", (d) => (log += d));
const url = await new Promise((ok, fail) => {
  server.stdout.once("data", (d) => ok(String(d).trim()));
  server.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
});

const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
const settle = (p) => p.waitForTimeout(900);
const selected = (p) => p.locator(".row.selected").textContent().catch(() => null);
const has = (p, id) => p.locator(`.react-flow__node[data-id="${id}"]`).count();
const view = "#f=example.com/shop/internal/store&s=example.com/shop/internal/store.Repo.Get";

async function run(name, b) {
  const out = {};
  const errors = [];
  let p = await b.newPage();
  // Firefox's own favicon loader asks for /favicon.ico, which img-src data:
  // refuses; the page makes no such request.
  const csp = (t) => /Content.Security|CSP|refused/i.test(t) && !/FaviconLoader/.test(t);
  p.on("console", (m) => csp(m.text()) && errors.push(m.text().slice(0, 160)));
  p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
  // A view's URL opens that view: the page fetched its View and applied the hash.
  await p.goto(url + view);
  await drawn(p);
  await settle(p);
  out.selected = await selected(p);
  out.hash = await p.evaluate(() => decodeURIComponent(location.hash));
  // Session restore: reopening the URL, in a new page, restores the view.
  await p.close();
  p = await b.newPage();
  await p.goto(url + view);
  await drawn(p);
  await settle(p);
  out.reopened = await selected(p);
  // A package added to the tree is drawn on the next load.
  const id = `example.com/shop/internal/added${name}`;
  await p.goto(url + "#d=3");
  await p.reload();
  await drawn(p);
  await settle(p);
  const before = await has(p, id);
  mkdirSync(join(dir, "internal", `added${name}`));
  writeFileSync(join(dir, "internal", `added${name}`, "a.go"), `package added${name}\n`);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.added = [before, await has(p, id)];
  await p.close();
  out.errors = errors;
  return out;
}

const want = {
  selected: ".Get",
  hash: view,
  reopened: ".Get",
  added: [0, 1],
  errors: [],
};

const channel = process.env.ZU_E2E_CHANNEL;
let failed = 0;
for (const [name, type, opts] of [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]]) {
  const b = await type.launch(opts);
  const got = await run(name, b).finally(() => b.close().catch(() => {}));
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
console.log(log.trim().split("\n").at(-1));
process.exit(failed ? 1 : 0);
```

```diff
--- a/web/e2e/package.json
+++ b/web/e2e/package.json
@@ -4,7 +4,8 @@
   "type": "module",
   "scripts": {
     "browsers": "playwright-core install chromium firefox webkit",
-    "accept": "node accept.mjs"
+    "accept": "node accept.mjs",
+    "accept-serve": "node serve.mjs"
   },
   "devDependencies": {
     "playwright-core": "1.63.0"
```

- [x] **Run:** `make build` Expected: PASS (the UI as it is, and `bin/zu` with Tasks 1–4).

- [x] **Run:** `cd web/e2e && npm run accept-serve` Expected: FAIL (`locator.waitFor: Timeout 30000ms exceeded` on `.react-flow__node`: no node is drawn, because the page does not fetch its View yet)

### Task 6: the page fetches its View

**Files:**
- Modify: `web/src/data.ts`, `web/src/data.test.ts`, `web/src/main.tsx`

**Steps:**

- [x] **Write the failing tests**

```diff
--- a/web/src/data.test.ts
+++ b/web/src/data.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
-import { parseView } from "./data";
+import { fetchView, parseView, readEmbedded, type View } from "./data";
 
 describe("parseView", () => {
   it("refuses a schema it does not know", () => {
@@ -14,3 +14,37 @@ describe("parseView", () => {
     expect(v.nodes.some((n) => n.id === "example.com/shop/internal/store.Repo")).toBe(true);
   });
 });
+
+// A page whose zu-data element holds text.
+const page = (text: string) => ({ getElementById: () => ({ textContent: text }) }) as unknown as Document;
+
+describe("readEmbedded", () => {
+  it("is null for the bare template", () => {
+    expect(readEmbedded(page("{}"))).toBeNull();
+  });
+  it("returns the View zu scan -html inlined", () => {
+    expect((readEmbedded(page(JSON.stringify(golden))) as View).schema).toBe("1");
+  });
+  it("says the View is live when zu serve sent the page (10)", () => {
+    expect(readEmbedded(page('{"live":true}'))).toBe("live");
+  });
+});
+
+describe("fetchView", () => {
+  const answer = (status: number, body: string) => async (url: RequestInfo | URL, init?: RequestInit) => {
+    expect([url, init?.cache]).toEqual(["view.json", "no-store"]);
+    return new Response(body, { status });
+  };
+  it("reads the View zu serve sends", async () => {
+    const v = await fetchView(answer(200, JSON.stringify(golden)));
+    expect(v.nodes.length).toBe(golden.nodes.length);
+  });
+  it("says why zu serve could not build it", async () => {
+    await expect(fetchView(answer(500, "zu.policy.yaml: line 3: bad level\n"))).rejects.toThrow(
+      "zu serve: zu.policy.yaml: line 3: bad level",
+    );
+  });
+  it("refuses a schema it does not know", async () => {
+    await expect(fetchView(answer(200, '{"schema":"2"}'))).rejects.toThrow(/schema 2/);
+  });
+});
```

- [x] **Run:** `cd web && npx vitest run src/data.test.ts` Expected: FAIL (`fetchView is not a function`; `readEmbedded` of the marker throws)

- [x] **Implement**

```diff
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -55,8 +55,22 @@ export function parseView(text: string): View {
   return v as View;
 }
 
-// readEmbedded returns the View zu wrote into the page, or null for the bare template.
-export function readEmbedded(doc: Document): View | null {
+// LIVE is what zu serve writes into the page (10): the View is at view.json.
+const LIVE = '{"live":true}';
+
+// readEmbedded returns the View zu wrote into the page, "live" when zu serve
+// sent the page, or null for the bare template.
+export function readEmbedded(doc: Document): View | "live" | null {
   const text = doc.getElementById("zu-data")?.textContent?.trim();
-  return !text || text === "{}" ? null : parseView(text);
+  if (!text || text === "{}") return null;
+  return text === LIVE ? "live" : parseView(text);
+}
+
+// fetchView asks zu serve for the View, from the origin that sent the page
+// (the CSP allows no other). Each request rescans the working tree.
+export async function fetchView(get: typeof fetch = fetch): Promise<View> {
+  const r = await get("view.json", { cache: "no-store" });
+  const text = await r.text();
+  if (!r.ok) throw new Error(`zu serve: ${text.trim() || r.status}`);
+  return parseView(text);
 }
```

```diff
--- a/web/src/main.tsx
+++ b/web/src/main.tsx
@@ -1,13 +1,15 @@
 import { StrictMode } from "react";
 import { createRoot } from "react-dom/client";
 import { App } from "./App";
-import { parseView, readEmbedded, type View } from "./data";
+import { fetchView, parseView, readEmbedded, type View } from "./data";
 import "./styles.css";
 
-// loadView returns the View zu embedded. The dev server, serving the bare
-// template, falls back to the Go golden; the build drops that branch.
+// loadView returns the View zu embedded, or the one zu serve sends. The dev
+// server, serving the bare template, falls back to the Go golden; the build
+// drops that branch.
 async function loadView(): Promise<View | null> {
   const embedded = readEmbedded(document);
+  if (embedded === "live") return fetchView();
   if (embedded || !import.meta.env.DEV) return embedded;
   const golden = await import("../../internal/export/testdata/shop.view.golden.json");
   return parseView(JSON.stringify(golden.default));
@@ -16,11 +18,19 @@ async function loadView(): Promise<View | null> {
 const root = document.getElementById("root");
 if (!root) throw new Error("missing #root element");
 performance.mark("zu-parse-start");
-const view = await loadView();
+let view: View | null = null;
+let failed = "";
+try {
+  view = await loadView();
+} catch (e) {
+  failed = e instanceof Error ? e.message : String(e); // a View this page cannot read, or a failed rescan
+}
 performance.mark("zu-parse-end");
 createRoot(root).render(
   <StrictMode>
-    {view ? (
+    {failed ? (
+      <p className="empty">{failed}</p>
+    ) : view ? (
       <App view={view} />
     ) : (
       <p className="empty">
```

- [x] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

- [x] **Run:** `make build` Expected: PASS

- [x] **Run:** `go test ./web` Expected: PASS, now against the built page: `LivePage` accepts its CSP element.

- [x] **Run:** `cd web/e2e && npm run accept-serve` Expected: PASS, 5/5 checks in each engine.

- [x] **Run:** `cd web/e2e && npm run accept` Expected: PASS, 39/39 in each engine (04–08's pages, from `file://`, unchanged).

### Task 7: README, gates and the kubernetes budget

**Files:**
- Modify: `README.md`

**Steps:**

- [x] **README**

```diff
--- a/README.md
+++ b/README.md
@@ -2,8 +2,8 @@
 
 zu draws a Go repository's component topology as an interactive diagram, and any
 change to it (an MR, a branch, your working tree) as a structural delta over that
-diagram. It runs locally and offline: one binary, no runtime, no server, no
-telemetry.
+diagram. It runs locally and offline: one binary, no runtime, no telemetry. The one
+server, `zu serve`, listens on localhost only.
 
 ## Install
 
@@ -55,6 +55,7 @@ embedded.
 ```bash
 zu scan                       # write the IR for the working tree to .zu/ir/
 zu scan -html zu.html         # also write a self-contained, offline HTML diagram
+zu serve                      # serve the working tree's diagram at http://127.0.0.1:7433/
 zu diff main                  # the Structural Summary of HEAD against main
 zu diff main -format markdown # the same, for an MR comment
 zu check                      # fail on Policy violations not in the Baseline
@@ -63,6 +64,12 @@ zu policy init                # write a suggested zu.policy.yaml
 
 Open the HTML file straight from disk (`file://`); it loads nothing from the network.
 
+`zu serve` draws the working tree and rescans it each time you load the page, parsing
+only the files that changed. It listens on a loopback address only (`-addr`, default
+127.0.0.1:7433, or a free port when that one is taken) and answers only requests
+addressed to localhost. It writes nothing to disk. The URL carries the view you are
+looking at, so reopening it restores that view. Stop it with Ctrl-C.
+
 ## Output contract
 
 - **`zu diff`** (text, Markdown and JSON `summaryVersion` "1", flags, the merge-base
```

- [x] **Gates**

- [x] **Run:** `test -z "$(gofmt -l cmd internal web/*.go)" && go vet ./... && go test -race ./... && golangci-lint run ./... && cd web && npx tsc --noEmit && npx vitest run` Expected: PASS. golangci-lint exits non-zero on any issue; run by hand through the RTK wrapper it exits 0 regardless, so read its output there.

- [x] **The budget on kubernetes.** The Test Corpus checkout is read-only here, so copy its Go files and `go.mod`s (no tests: zu skips them) into a scratch repository, which `zu serve` then lists through git as it would any working tree. The copy is 251 MB with its `.git`. `bench-serve.sh` (below, not committed) starts `zu serve`, loads the View once, then five times appends a function to one file and times the next load. Per the review (2026-09-25) the budget was measured on a full worktree instead: see acceptance.md.

  ```bash
  K=.zu/corpus/kubernetes@v1.37.0 S=$(mktemp -d)
  (cd "$K" && git ls-files -z -- '*.go' 'go.mod' '*/go.mod' ':!:*_test.go' | rsync -a --from0 --files-from=- ./ "$S/k8s/")
  (cd "$S/k8s" && git init -q && git add -A && git -c user.name=b -c user.email=b@b commit -qm k8s)
  cat >"$S/bench-serve.sh" <<'EOF'
  #!/usr/bin/env bash
  # bench-serve.sh ZU REPO FILE: time zu serve's rescan after one-file edits.
  set -euo pipefail
  zu=$1 repo=$2 file=$3
  log=$(mktemp)
  "$zu" serve "$repo" -addr 127.0.0.1:0 >"$log.url" 2>"$log" &
  pid=$!
  trap 'kill $pid 2>/dev/null; cp "$repo/$file.orig" "$repo/$file" 2>/dev/null; rm -f "$repo/$file.orig" "$log" "$log.url"' EXIT
  until [ -s "$log.url" ]; do sleep 0.2; done
  url=$(cat "$log.url")
  cp "$repo/$file" "$repo/$file.orig"
  curl -fsS -o /dev/null "${url}view.json"              # warm: nothing changed
  for i in 1 2 3 4 5; do
    printf '\nfunc zuBench%d() {}\n' "$i" >>"$repo/$file"  # one file edited
    /usr/bin/time -p curl -fsS -o /dev/null "${url}view.json" 2>&1 | awk '/real/ {printf "curl %ss  ", $2}'
    tail -1 "$log"
  done
  EOF
  bash "$S/bench-serve.sh" bin/zu "$S/k8s" pkg/kubelet/kubelet.go; rm -rf "$S"
  ```

  Measured while drafting (Apple M2, 8 cores, 16 GB, macOS, Go 1.24.5, source in the page cache):

  | | time | parsed |
  |---|---|---|
  | start, cold scan to URL | 2.72 s | 9,909 of 9,909 |
  | load with nothing changed | 1.06 s | 0 |
  | load after one edit (5 runs) | 1.09, 1.12, 1.16, 1.17, 1.19 s (curl: 1.09–1.19 s) | 1 |

  Budget: under 2 s. **Met**, with 0.8 s to spare. Of a rescan, `scan.Run` takes 0.64–0.84 s (measured in-process with an overlay Tree; 0.45 s of it is `assemble`, which runs over the whole tree by design); git's two `ls-files` and `status`, the Lstat of the 14,461 listed files, `projectView` and the 6.2 MB of JSON take the rest. Peak RSS over the run: 642 MB. Record the implementer's numbers in `acceptance.md`.

## Feature 11 (next): watch and live redraw

`zu serve -watch`, or watch by default (11 decides): a goroutine polls the size and mtime of the files the last rescan listed, plus `zu.policy.yaml` and every `go.mod`, every 500 ms, and re-lists through git every few seconds to see added files. On a change it runs the session's rescan once (debounced), keeps the View bytes behind a mutex or atomic pointer, and `/view.json` then serves the kept bytes instead of rescanning per request. `/events` is a Server-Sent Events stream (stdlib `http.Flusher`, same Host and `Sec-Fetch-Site` checks) that sends `event: view` with the View's SHA-256 whenever it changes, and a comment heartbeat; the page subscribes with `EventSource("events")` (CSP `connect-src 'self'` already allows it), refetches `view.json`, and redraws with the state from the URL hash, so pan, zoom, depth and selection survive (U1, A11). The budget stays 2 s from the write to the event. It may also re-read `-coverprofile` when its mtime changes (Deviation 10). About 4 tasks: the poller with a fake clock, the session's kept View and `/events`, the page's subscription and redraw, and a browser check that edits a file and sees the redraw without a reload, keeping the hash.

## Notes

- **Task count: 7**, within Quick mode.
- **Verification of this plan** (2026-09-24): `replay.py` applied every code block in task order to a fresh `git archive` of e45eb1d, with `npm ci` in `web` and `web/e2e`, and ran every step: see the Replay record below. The replayed tree was byte-identical to the implementation the diffs were cut from.
- **TDD:** every task writes its failing test first. Task 5's harness is red against Tasks 1–4 (the page does not fetch yet), and green only after Task 6.
- **Determinism:** the IR from a rescan is byte-identical to a cold scan's after an edit, an add and a delete (Task 1), and the served View is byte-identical to the one `zu scan -html` inlines (Task 4). Both follow from caching only extraction, whose output depends on the path and content alone, and running index, resolution and build over every file.
- **The model never authors the graph:** nothing here adds a node or an edge; the Cache only skips re-parsing unchanged content.
- **Security:** see Deviations 5 and 6. The attack surface is two GET routes on a loopback socket. The Host check is the DNS-rebinding defence; `Sec-Fetch-Site` stops other sites from triggering rescans; no route maps a path to a file; the only process started is still git.
- **Performance:** see Task 7. Memory: the Cache holds each file's facts (not its source) for the life of the server; on kubernetes the process peaks at 642 MB.
- **Stuck?** Stop and ask. Don't force through blockers.

## Replay record

2026-09-24: `replay.py` on this plan.md, applied to a fresh `git archive` of e45eb1d with `npm ci` in `web` and `web/e2e` (Go 1.24.5, Node 24.17.0, golangci-lint 1.64.8, playwright-core 1.63.0). Its output is verbatim below, with ANSI colour codes stripped. Each line gives the task, red or green, the exit code, the command, and the command's last output line. `replay.py` exited 0.

```text
ok   Task 1: `scan.Cache` re-parses only files whose  red   exit=1 go test ./internal/scan -run 'TestCache|TestRunWithoutACache'  | internal/scan/cache_test.go:80:39: st.Parsed undefined (type Stats has no field or method Parsed)
ok   Task 1: `scan.Cache` re-parses only files whose  green exit=0 go test -race ./internal/scan  | ok  	zu/internal/scan	2.159s
ok   Task 2: `export.LivePage` and `export.Marshal`   red   exit=1 go test ./internal/export  | internal/export/render_test.go:95:15: undefined: Marshal
ok   Task 2: `export.LivePage` and `export.Marshal`   green exit=0 go test ./internal/export ./internal/cli ./web  | ok  	zu/web	(cached)
ok   Task 3: `internal/serve`: loopback only, Host-ch red   exit=1 go test ./internal/serve  | internal/serve/serve_test.go:96:7: undefined: Handler
ok   Task 3: `internal/serve`: loopback only, Host-ch green exit=0 go test -race ./internal/serve  | ok  	zu/internal/serve	(cached)
ok   Task 4: `zu serve`                               red   exit=1 go test ./internal/cli -run Serve  | FAIL
ok   Task 4: `zu serve`                               green exit=0 go test -race ./internal/cli  | ok  	zu/internal/cli	6.498s
ok   Task 5: the browser harness serves a tree        green exit=0 make build  | [MISSING_NAME_OPTION_FOR_IIFE_EXPORT] If you do not supply "output.name", you may not be able to acce
ok   Task 5: the browser harness serves a tree        red   exit=1 cd web/e2e && npm run accept-serve  | Node.js v24.17.0
ok   Task 6: the page fetches its View                red   exit=1 cd web && npx vitest run src/data.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
ok   Task 6: the page fetches its View                green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  724ms (transform 52%, tests 23%, import 21%, worker 4%)
ok   Task 6: the page fetches its View                green exit=0 make build  | [MISSING_NAME_OPTION_FOR_IIFE_EXPORT] If you do not supply "output.name", you may not be able to acce
ok   Task 6: the page fetches its View                green exit=0 go test ./web  | ok  	zu/web	(cached)
ok   Task 6: the page fetches its View                green exit=0 cd web/e2e && npm run accept-serve  | zu serve: scanned in 37ms: 8 packages, 12 files, 1 parsed, 0 parse errors
ok   Task 6: the page fetches its View                green exit=0 cd web/e2e && npm run accept  | webkit: ok (39/39 checks)
ok   Task 7: README, gates and the kubernetes budget  green exit=0 test -z "$(gofmt -l cmd internal web/*.go)" && go vet ./... && go test -race ./... && golangci-lint run ./... && cd web && npx tsc --noEmit && npx vitest run  |              at least ~315ms faster with isolate: false — reuses workers across files instead of one per file
```

- The replayed tree was byte-identical to the implementation the diffs were cut from (`diff -rq`, excluding `node_modules`, `dist`, `bin`, `.git`, `test-results` and `.zu`).
- Task 5's red was also checked by hand. With Task 6's three web files put back to e45eb1d and the tree rebuilt, `accept-serve` fails on `locator.waitFor: Timeout 30000ms exceeded` while waiting for `.react-flow__node`, which is the intended reason.
- An earlier draft's Task 7 gate piped golangci-lint into `grep -q 'No issues found'`, and that gate failed. golangci-lint itself prints nothing and exits 0 when the code is clean; only the RTK wrapper hides its exit code. The gate now runs it bare.
- The Task 7 kubernetes measurement is not replayed: it needs the corpus and takes minutes.

## Progress

- [x] Task 1 · `scan.Cache`
- [x] Task 2 · `export.LivePage` and `Marshal`
- [x] Task 3 · `internal/serve`
- [x] Task 4 · `zu serve`
- [x] Task 5 · Browser harness (red)
- [x] Task 6 · The page fetches its View
- [x] Task 7 · README, gates, kubernetes budget
