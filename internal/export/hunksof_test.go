package export

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"zu/internal/scan"
)

// A file the scan listed may be gone by the time the Change View reads it (a
// checkout mid-rescan). It reads as empty, as a file absent from the listing
// does, rather than failing the view (16).
func TestHunksOfAFileDeletedAfterTheListing(t *testing.T) {
	src := []byte("package a\n\nfunc F() {}\n")
	tree := func() (string, scan.Tree) {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "a.go"), src, 0o644); err != nil {
			t.Fatal(err)
		}
		tr, err := scan.ListTree(dir, []string{"a.go"})
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := tr.Files(); err != nil { // the scan lists the tree
			t.Fatal(err)
		}
		return dir, tr
	}
	_, base := tree()
	dir, head := tree()
	if err := os.Remove(filepath.Join(dir, "a.go")); err != nil {
		t.Fatal(err)
	}
	got, err := hunksOf(map[string]bool{"a.go": true}, base, head)
	if err != nil {
		t.Fatalf("hunksOf: %v", err)
	}
	if want := Hunks(src, nil); !reflect.DeepEqual(got["a.go"], want) {
		t.Errorf("hunks of a.go = %+v, want %+v", got["a.go"], want)
	}
}
