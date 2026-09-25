package serve

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func liveServer(t *testing.T, hub *Hub) (*httptest.Server, *int) {
	t.Helper()
	builds := 0
	srv := httptest.NewServer(Handler([]byte("PAGE"), Views{
		Scan: func(context.Context) ([]byte, uint64, error) { builds++; return []byte(`{"scanned":true}`), 5, nil },
		Hub:  hub,
	}))
	t.Cleanup(srv.Close)
	return srv, &builds
}

func request(t *testing.T, url string, hdr map[string]string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

// events reads the stream's events as "name data" lines.
func events(t *testing.T, body io.Reader) <-chan string {
	t.Helper()
	out := make(chan string, 16)
	go func() {
		defer close(out)
		sc := bufio.NewScanner(body)
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

func expect(t *testing.T, got <-chan string, want string) {
	t.Helper()
	select {
	case e, ok := <-got:
		if !ok {
			t.Fatalf("the stream ended; want %q", want)
		}
		if e != want {
			t.Fatalf("event %q, want %q", e, want)
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("no event; want %q", want)
	}
}

// GET /events streams the latest View's generation, at once and on each
// change, and the notice, one line; closing the Hub ends the stream.
func TestEventsStreamTheLatestGeneration(t *testing.T) {
	hub := NewHub([]byte(`{"v":1}`))
	srv, builds := liveServer(t, hub)
	resp := request(t, srv.URL+"/events", map[string]string{"Sec-Fetch-Site": "same-origin"})
	defer resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "text/event-stream" || resp.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("/events = %d %q", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	got := events(t, resp.Body)
	expect(t, got, "view 1")
	expect(t, got, "notice ")
	hub.Notify("a.go:3:1: expected '}'\nfound EOF")
	expect(t, got, "notice a.go:3:1: expected '}' found EOF")
	hub.Publish([]byte(`{"v":2}`))
	expect(t, got, "view 2")
	expect(t, got, "notice ")
	hub.Close()
	if e, ok := <-got; ok {
		t.Errorf("after Close: %q, want the stream to end", e)
	}
	if *builds != 0 {
		t.Errorf("%d rescans", *builds)
	}
}

// GET /view.json?latest answers the Hub's View and generation without a
// rescan; a plain GET /view.json rescans, as in 10, and says the generation
// Scan read under the lock the watch publishes under (13, scrutiny M1).
func TestViewLatestAnswersWithoutARescan(t *testing.T) {
	hub := NewHub([]byte(`{"v":1}`))
	hub.Publish([]byte(`{"v":2}`))
	srv, builds := liveServer(t, hub)
	for path, want := range map[string][2]string{"/view.json?latest": {`{"v":2}`, "2"}, "/view.json": {`{"scanned":true}`, "5"}} {
		resp := request(t, srv.URL+path, nil)
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if string(body) != want[0] || resp.Header.Get("Zu-Generation") != want[1] || resp.Header.Get("Content-Type") != "application/json" {
			t.Errorf("%s = %s, generation %q", path, body, resp.Header.Get("Zu-Generation"))
		}
	}
	if *builds != 1 {
		t.Errorf("%d rescans, want 1", *builds)
	}
}

// Another site's page may not read the stream, nor hold a connection
// open, and without a Hub (zu serve -poll 0) there is none.
func TestEventsOnlyForItsOwnPage(t *testing.T) {
	srv, _ := liveServer(t, NewHub(nil))
	for site, want := range map[string]int{"same-site": 403, "cross-site": 403} {
		resp := request(t, srv.URL+"/events", map[string]string{"Sec-Fetch-Site": site})
		resp.Body.Close()
		if resp.StatusCode != want {
			t.Errorf("Sec-Fetch-Site %q: %d, want %d", site, resp.StatusCode, want)
		}
	}
	none, _ := liveServer(t, nil)
	for _, path := range []string{"/events", "/view.json?latest"} {
		resp := request(t, none.URL+path, nil)
		resp.Body.Close()
		if want := map[string]int{"/events": 404, "/view.json?latest": 200}[path]; resp.StatusCode != want {
			t.Errorf("no Hub, %s: %d, want %d", path, resp.StatusCode, want)
		}
	}
}
