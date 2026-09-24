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
