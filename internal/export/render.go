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
