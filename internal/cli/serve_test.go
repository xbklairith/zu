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
	"time"

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
			if _, err := s.view(context.Background()); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if most != 1 {
		t.Errorf("%d rescans ran at once; want 1", most)
	}
}
