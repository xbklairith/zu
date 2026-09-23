package web

import (
	"io/fs"
	"strings"
	"testing"
)

func TestAssetsIsRootedAtDist(t *testing.T) {
	assets, err := Assets()
	if err != nil {
		t.Fatalf("Assets() error: %v", err)
	}
	if _, err := fs.Stat(assets, ".gitkeep"); err != nil {
		t.Errorf("expected dist contents at FS root: %v", err)
	}
}

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
