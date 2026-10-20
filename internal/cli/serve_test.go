package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"zu/internal/export"
	"zu/internal/policy"
	"zu/internal/scan"
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

// statusOf is the status of GET url.
func statusOf(t *testing.T, url string) int {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

// 19: without -include zu serve draws every package's declarations, which
// zu scan -html leaves out, and inlines no source. The page reads a file
// from /source, which sends one only if the last scan declares something in
// it, from the tree as it is now.
func TestServeDrawsEveryDeclarationAndSendsItsSourceOnDemand(t *testing.T) {
	needGit(t)
	dir := repo(t, small)
	// A checkout, so each scan reads the files git lists (ListTree), as in
	// most trees zu serve is run on.
	git(t, dir, "init", "-q")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "base")
	url, _ := startServe(t, dir, "-poll", "0")
	v := fetch(t, url+"view.json")
	for _, want := range []string{`"id":"example.com/m/a.F"`, `"detail":true`, `"sources":{}`} {
		if !strings.Contains(v, want) {
			t.Errorf("View lacks %s: %s", want, v)
		}
	}
	if strings.Contains(v, `"syntax"`) {
		t.Errorf("View inlines syntax: %s", v)
	}
	var f export.SourceFile
	if err := json.Unmarshal([]byte(fetch(t, url+"source?path=a/a.go")), &f); err != nil {
		t.Fatal(err)
	}
	if want := small["a/a.go"]; f.Path != "a/a.go" || f.Text != want || !reflect.DeepEqual(f.Syntax, export.Syntax([]byte(want))) {
		t.Errorf("source = %+v", f)
	}
	for _, p := range []string{"go.mod", "web/app.ts", "../a/a.go", "/a/a.go", "./a/a.go", "a", "", "b/b.go"} {
		if code := statusOf(t, url+"source?path="+p); code != http.StatusNotFound {
			t.Errorf("%q: %d, want 404", p, code)
		}
	}
	writeFile(t, dir, "b/b.go", "package b\n\nfunc H() {}\n")
	if code := statusOf(t, url+"source?path=b/b.go"); code != http.StatusNotFound {
		t.Errorf("b/b.go before a scan lists it: %d", code)
	}
	fetch(t, url+"view.json")
	if code := statusOf(t, url+"source?path=b/b.go"); code != http.StatusOK {
		t.Errorf("b/b.go after: %d", code)
	}
	// a becomes a link out of the tree while the last scan declares a/a.go
	// and git still lists it: neither /source nor the rescan reads through it.
	outside := t.TempDir()
	writeFile(t, outside, "a.go", "package a // SECRET\n")
	if err := os.Rename(filepath.Join(dir, "a"), filepath.Join(t.TempDir(), "a")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "a")); err != nil {
		t.Fatal(err)
	}
	for _, when := range []string{"before", "after"} {
		if code := statusOf(t, url+"source?path=a/a.go"); code != http.StatusNotFound {
			t.Errorf("a/a.go through a link out of the tree, %s a rescan: %d, want 404", when, code)
		}
		if v := fetch(t, url+"view.json"); strings.Contains(v, "SECRET") || strings.Contains(v, "a/a.go") {
			t.Errorf("the rescan read a/a.go through the link: %s", v)
		}
	}
	noZu(t, dir)
}

// 19: past the budget the page draws packages only, as zu serve did before
// without -include, and zu serve says so once.
func TestServeOverTheDetailBudgetDrawsPackagesOnly(t *testing.T) {
	old := detailBudget
	detailBudget = 1
	t.Cleanup(func() { detailBudget = old }) // after startServe's, which stops zu serve
	url, stderr := startServe(t, repo(t, small), "-poll", "0")
	v := fetch(t, url+"view.json")
	if strings.Contains(v, "a.F") || strings.Contains(v, `"detail":true`) {
		t.Errorf("declarations past the budget: %s", v)
	}
	const note = "zu serve: 2 declarations, more than 1: the page draws packages only; -include picks the packages to draw\n"
	if n := strings.Count(stderr.String(), note); n != 1 {
		t.Errorf("note %d times in:\n%s", n, stderr.String())
	}
}

// 19: the budget counts the declarations the page would draw: a package the
// Policy omits counts for nothing.
func TestServeDetailBudgetCountsWhatThePolicyDraws(t *testing.T) {
	old := detailBudget
	detailBudget = 1
	t.Cleanup(func() { detailBudget = old })
	url, stderr := startServe(t, repo(t, map[string]string{
		"go.mod":        "module example.com/m\n",
		"a/a.go":        "package a\n\nfunc F() {}\n",
		"gen/gen.go":    "package gen\n\nfunc G() {}\n",
		policy.FileName: "omit: [example.com/m/gen]\n",
	}), "-poll", "0")
	if v := fetch(t, url+"view.json"); !strings.Contains(v, `"id":"example.com/m/a.F"`) {
		t.Errorf("a.F not drawn, though the Policy draws one declaration: %s", v)
	}
	if strings.Contains(stderr.String(), "more than") {
		t.Errorf("over the budget:\n%s", stderr.String())
	}
}

// Every load of the page rescans, parsing only the files that changed.
func TestServeRescansOnlyWhatChanged(t *testing.T) {
	dir := repo(t, small)
	url, stderr := startServe(t, dir, "-poll", "0") // no watch: every line is a page load's
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
		{[]string{"-poll", "-1s"}, "-poll -1s: want 0 (off) or at least 100ms"},
		{[]string{"-poll", "10ms"}, "-poll 10ms: want 0 (off) or at least 100ms"},
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

// A slow client cannot hold a connection open indefinitely (review, 2026-09-25).
func TestServeServerTimeouts(t *testing.T) {
	srv := newServer(http.NotFoundHandler())
	if srv.ReadHeaderTimeout != 10*time.Second || srv.IdleTimeout != 60*time.Second {
		t.Errorf("ReadHeaderTimeout %v, IdleTimeout %v; want 10s and 60s", srv.ReadHeaderTimeout, srv.IdleTimeout)
	}
}

// Concurrent requests for the View rescan one at a time (Deviation 2).
func TestServeRescansOneAtATime(t *testing.T) {
	var (
		mu           sync.Mutex
		active, most int
	)
	s := &session{dir: repo(t, small), o: &htmlOptions{}, cache: scan.NewCache(), stderr: io.Discard}
	s.scanning = func() {
		mu.Lock()
		active++
		most = max(most, active)
		mu.Unlock()
		time.Sleep(20 * time.Millisecond)
		mu.Lock()
		active--
		mu.Unlock()
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, _, err := s.view(context.Background()); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if most != 1 {
		t.Errorf("%d rescans ran at once; want 1", most)
	}
}
