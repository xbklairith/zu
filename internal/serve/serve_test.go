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
