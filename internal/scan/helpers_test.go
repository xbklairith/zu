package scan

import (
	"os"
	"path/filepath"
	"testing"
)

// tree writes files (slash-separated relative path → content) under a fresh
// temp dir and returns the root.
func tree(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for rel, body := range files {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// dirOf is DirTree(root) for a root the test just created.
func dirOf(t *testing.T, root string) Tree {
	t.Helper()
	d, err := DirTree(root)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// walk lists root on disk, as scan.Run does for a DirTree.
func walk(root string) (*walkResult, error) {
	d, err := DirTree(root)
	if err != nil {
		return nil, err
	}
	return walkTree(d)
}
