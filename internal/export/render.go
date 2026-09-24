package export

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
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
	data, err := Marshal(v)
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

// Marshal writes v in canonical order as the JSON Render inlines, which is
// also what zu serve sends (10).
func Marshal(v *View) ([]byte, error) {
	sortView(v)
	return json.Marshal(v)
}

// cspAttr opens the page's Content-Security-Policy, which web/vite.config.ts
// writes as the first element of <head>.
const cspAttr = `<meta http-equiv="Content-Security-Policy" content="`

// LivePage is the page zu serve sends (10): tmpl with the marker holding
// {"live":true}, which tells the page to fetch view.json, and its CSP
// allowing that fetch from the page's own origin and nowhere else. A header
// CSP could not do it: a page enforces its meta policy and a header policy
// both, so only the meta policy can grant the fetch.
func LivePage(tmpl []byte) ([]byte, error) {
	if n := bytes.Count(tmpl, []byte(marker)); n != 1 {
		return nil, fmt.Errorf("UI template has %d data markers, want 1", n)
	}
	if n := bytes.Count(tmpl, []byte(cspAttr)); n != 1 {
		return nil, fmt.Errorf("UI template has %d Content-Security-Policy elements, want 1", n)
	}
	if n := bytes.Count(tmpl, []byte("</head>")); n != 1 {
		return nil, fmt.Errorf("UI template has %d </head> tags, want 1", n)
	}
	live := strings.Replace(marker, "{}", `{"live":true}`, 1)
	page := bytes.Replace(tmpl, []byte(marker), []byte(live), 1)
	// An empty icon, so the browser asks the server for no /favicon.ico.
	page = bytes.Replace(page, []byte("</head>"), []byte(`<link rel="icon" href="data:,"></head>`), 1)
	return bytes.Replace(page, []byte(cspAttr), []byte(cspAttr+"connect-src 'self'; "), 1), nil
}
