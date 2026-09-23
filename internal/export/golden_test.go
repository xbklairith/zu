package export

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"
)

var update = flag.Bool("update", false, "rewrite golden files")

// TestProjectGolden pins the View the UI is developed and tested against
// (web/src/data.test.ts reads the same file).
func TestProjectGolden(t *testing.T) {
	doc := shopIR(t)
	p, err := ParsePattern("./internal/store", RootModule(doc))
	if err != nil {
		t.Fatal(err)
	}
	read := func(rel string) ([]byte, error) {
		return os.ReadFile(filepath.Join("../scan/testdata/shop", filepath.FromSlash(rel)))
	}
	v, err := Project(doc, []Pattern{p}, read)
	if err != nil {
		t.Fatal(err)
	}
	got, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	const golden = "testdata/shop.view.golden.json"
	if *update {
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("%v (run with -update to create)", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("View differs from %s (rerun with -update and review the diff)", golden)
	}
}
