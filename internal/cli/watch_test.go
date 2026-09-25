package cli

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"zu/internal/scan"
	"zu/internal/serve"
)

// stream opens zu serve's /events and returns its events as "name data".
func stream(t *testing.T, url string) <-chan string {
	t.Helper()
	resp, err := http.Get(url + "events")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("/events: %d", resp.StatusCode)
	}
	t.Cleanup(func() { resp.Body.Close() })
	out := make(chan string, 16)
	go func() {
		defer close(out)
		sc := bufio.NewScanner(resp.Body)
		var name string
		for sc.Scan() {
			switch line := sc.Text(); {
			case strings.HasPrefix(line, "event: "):
				name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				out <- name + " " + strings.TrimPrefix(line, "data: ")
			}
		}
	}()
	return out
}

// await returns the next event that is not an empty notice.
func await(t *testing.T, events <-chan string) string {
	t.Helper()
	for {
		select {
		case e, ok := <-events:
			if !ok {
				t.Fatal("the stream ended")
			}
			if e != "notice " {
				return e
			}
		case <-time.After(10 * time.Second):
			t.Fatal("no event")
		}
	}
}

func latest(t *testing.T, url string) string {
	t.Helper()
	resp, err := http.Get(url + "view.json?latest")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// zu serve watches the working tree: a change is rescanned once and pushed
// as a new generation, without a page load, in a git repository and out of
// one. In git, a commit that changes no file is a change too: the View's
// commit moves.
func TestServeWatchPushesAChange(t *testing.T) {
	for _, inGit := range []bool{false, true} {
		dir := repo(t, small)
		if inGit {
			needGit(t)
			git(t, dir, "init", "-q")
			git(t, dir, "add", "-A")
			git(t, dir, "commit", "-q", "-m", "one")
		}
		url, stderr := startServe(t, dir, "-poll", "100ms")
		events := stream(t, url)
		if e := await(t, events); e != "view 1" {
			t.Fatalf("git %v, on connect: %q", inGit, e)
		}
		writeFile(t, dir, "c/c.go", "package c\n")
		if e := await(t, events); e != "view 2" {
			t.Fatalf("git %v, after an add: %q", inGit, e)
		}
		if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/c"`) {
			t.Errorf("git %v: the latest View lacks c: %.300s", inGit, v)
		}
		// A directory made empty, then a file saved in it a while later
		// (scrutiny B1).
		if err := os.MkdirAll(filepath.Join(dir, "d", "e"), 0o755); err != nil {
			t.Fatal(err)
		}
		time.Sleep(500 * time.Millisecond)
		writeFile(t, dir, "d/e/e.go", "package e\n")
		if e := await(t, events); e != "view 3" {
			t.Fatalf("git %v, after an add in a new directory: %q", inGit, e)
		}
		if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/d/e"`) {
			t.Errorf("git %v: the latest View lacks d/e: %.300s", inGit, v)
		}
		if inGit {
			head := git(t, dir, "rev-parse", "HEAD")
			git(t, dir, "add", "-A")
			git(t, dir, "commit", "-q", "-m", "add c")
			if e := await(t, events); e != "view 4" {
				t.Fatalf("after a commit: %q", e)
			}
			if v := latest(t, url); strings.Contains(v, head) || !strings.Contains(v, git(t, dir, "rev-parse", "HEAD")) {
				t.Errorf("the latest View is not at the new commit: %.300s", v)
			}
		}
		if !strings.Contains(stderr.String(), "zu serve: watch: scanned in ") {
			t.Errorf("stderr: %s", stderr.String())
		}
	}
}

// While a changed file does not parse, zu serve keeps the last View and
// says why; once it parses again, the change is pushed. A parse error the
// last View already had does not hold anything back, and neither does one
// at a new commit: the View must say what was committed.
func TestServeWatchKeepsTheViewWhileAFileDoesNotParse(t *testing.T) {
	needGit(t)
	dir := repo(t, map[string]string{
		"go.mod": "module example.com/m\n", "a/a.go": "package a\n", "old/bad.go": "package old\n\nfunc {\n",
	})
	git(t, dir, "init", "-q")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "one")
	url, stderr := startServe(t, dir, "-poll", "100ms")
	events := stream(t, url)
	await(t, events)
	before := latest(t, url)
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F( {\n")
	if e := await(t, events); !strings.HasPrefix(e, "notice a/a.go:") {
		t.Fatalf("a broken file: %q", e)
	}
	if latest(t, url) != before {
		t.Error("the View changed while a/a.go did not parse")
	}
	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() {}\n")
	if e := await(t, events); e != "view 2" {
		t.Fatalf("fixed: %q", e)
	}
	if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/a","kind":"package","module":"example.com/m","loc":{"path":"a/a.go","line":1},"decls":1}`) {
		t.Errorf("the fixed View lacks a.F: %.300s", v)
	}
	if !strings.Contains(stderr.String(), "a/a.go:3:") || !strings.Contains(stderr.String(), "the page keeps its drawing") {
		t.Errorf("stderr: %s", stderr.String())
	}

	writeFile(t, dir, "b/b.go", "package b\n\nfunc {\n")
	if e := await(t, events); !strings.HasPrefix(e, "notice b/b.go:") {
		t.Fatalf("another broken file: %q", e)
	}
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "broken b")
	if e := await(t, events); e != "view 3" {
		t.Fatalf("the broken file committed: %q", e)
	}
	if v := latest(t, url); !strings.Contains(v, git(t, dir, "rev-parse", "HEAD")) {
		t.Errorf("the View is not at the new commit: %.300s", v)
	}
}

// A rescan that fails, here on a Policy that does not load, keeps the last
// View too. The Policy is watched though git ignores it.
func TestServeWatchKeepsTheViewWhenARescanFails(t *testing.T) {
	needGit(t)
	dir := repo(t, small)
	writeFile(t, dir, ".gitignore", "zu.policy.yaml\n")
	git(t, dir, "init", "-q")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "one")
	url, stderr := startServe(t, dir, "-poll", "100ms")
	events := stream(t, url)
	await(t, events)
	writeFile(t, dir, "zu.policy.yaml", "levels: [\n")
	if e := await(t, events); !strings.HasPrefix(e, "notice rescan failed: ") {
		t.Fatalf("a bad Policy: %q; %s", e, stderr.String())
	}
	writeFile(t, dir, "zu.policy.yaml", "levels: []\n")
	select { // the notice clears; the View may be unchanged
	case e := <-events:
		if e != "notice " && e != "view 2" {
			t.Fatalf("a good Policy again: %q", e)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the notice stayed")
	}
}

// watchSession is zu serve's session over dir after its first scan, with a
// Hub, as runServe makes it, but no watch running: a test drives it.
func watchSession(t *testing.T, dir string) *session {
	t.Helper()
	withUI(t)
	o := &htmlOptions{}
	if err := o.load(); err != nil {
		t.Fatal(err)
	}
	s := &session{dir: dir, o: o, cache: scan.NewCache(), stderr: io.Discard}
	first, _, err := s.view(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	s.hub = serve.NewHub(first)
	return s
}

func committed(t *testing.T) string {
	t.Helper()
	needGit(t)
	dir := repo(t, small)
	git(t, dir, "init", "-q")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "one")
	return dir
}

// A page load that waits for a watch's rescan says the generation that
// rescan published: the generation is read under the session's lock, so
// the page never draws a View newer than it thinks (13, scrutiny M1).
func TestServePageLoadReadsTheGenerationUnderTheLock(t *testing.T) {
	dir := committed(t)
	s := watchSession(t, dir)
	writeFile(t, dir, "c/c.go", "package c\n")
	l, err := s.list(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	inside, release := make(chan struct{}), make(chan struct{})
	s.scanning = func() {
		s.scanning = nil // the page load's own scan does not wait
		close(inside)
		<-release
	}
	go s.changed(context.Background(), l)
	<-inside // the rescan holds the lock
	srv := httptest.NewServer(serve.Handler([]byte("PAGE"), serve.Views{Scan: s.view, Hub: s.hub}))
	defer srv.Close()
	gen := make(chan string, 1)
	go func() {
		resp, err := http.Get(srv.URL + "/view.json")
		if err != nil {
			gen <- err.Error()
			return
		}
		resp.Body.Close()
		gen <- resp.Header.Get("Zu-Generation")
	}()
	time.Sleep(200 * time.Millisecond) // the page load waits for the lock
	close(release)
	if g := <-gen; g != "2" {
		t.Errorf("Zu-Generation %q, want 2: the View the page got is at least the rescan's", g)
	}
}

// A page load that listed a file the watch's listing lacks makes the watch
// list again before it rescans, so the View it publishes never drops a file
// the page already drew (13, scrutiny M1).
func TestServeWatchListsAgainAfterAPageLoad(t *testing.T) {
	dir := committed(t)
	s := watchSession(t, dir)
	s.polling() // the watch polls, then lists
	l, err := s.list(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, dir, "c/c.go", "package c\n")
	if _, _, err := s.view(context.Background()); err != nil { // a page load draws c
		t.Fatal(err)
	}
	s.changed(context.Background(), l)
	if v, _, _ := s.hub.Latest(); !strings.Contains(string(v), `"id":"example.com/m/c"`) {
		t.Errorf("the watch published a View without c: %.300s", v)
	}
}
