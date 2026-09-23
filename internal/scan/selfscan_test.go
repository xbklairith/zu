package scan

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestSelfScan scans zu's own repository: the real-world smoke test.
func TestSelfScan(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(filepath.Join(root, "go.mod")); err != nil || !strings.HasPrefix(string(b), "module zu\n") {
		t.Skip("not inside the zu repository")
	}
	doc, stats := run(t, root, 0)
	if stats.ParseErrors != 0 {
		t.Fatalf("parse errors: %+v", doc.ParseErrors)
	}
	for _, id := range []string{"zu/internal/scan.Run", "zu/internal/cli.runScan", "zu/cmd/zu.main"} {
		if node(doc, id) == nil {
			t.Errorf("missing node %s", id)
		}
	}
	found := false
	for _, e := range doc.Edges {
		if e.From == "zu/internal/cli.runScan" && e.To == "zu/internal/scan.Run" {
			found = true
		}
	}
	if !found {
		t.Error("missing call edge runScan → scan.Run")
	}
	if strings.Contains(string(encode(t, doc)), root) {
		t.Fatal("IR contains the absolute root")
	}
}
