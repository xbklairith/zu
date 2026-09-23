package scan

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestListTreeFiles(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod":        "module example.com/m\n",
		"a/a.go":        "package a\n",
		"vendor/v.go":   "package v\n",
		".hidden/h.go":  "package h\n",
		"locked/l.go":   "package locked\n",
		"notlisted.go":  "package m\n",
		"sub/d/keep.go": "package d\n",
	})
	for rel, target := range map[string]string{
		"b/link.go": "../a/a.go",  // in-tree file
		"b/out.go":  "../../x.go", // leaves the tree
		"b/dir":     "../a",       // directory
	} {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(target, p); err != nil {
			t.Fatal(err)
		}
	}
	listed := []string{
		"sub/d/keep.go", "go.mod", "a/a.go", "a/a.go", // unsorted, duplicated
		"vendor/v.go", ".hidden/h.go", // pruned
		"b/link.go", "b/out.go", "b/dir",
		"gone.go", // deleted since listing
		"locked/l.go",
	}
	if err := os.Chmod(filepath.Join(root, "locked"), 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(filepath.Join(root, "locked"), 0o755) })

	lt, err := ListTree(root, listed)
	if err != nil {
		t.Fatal(err)
	}
	files, errs, err := lt.Files()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"a/a.go", "b/link.go", "go.mod", "sub/d/keep.go"}
	if os.Geteuid() == 0 { // root reads through mode 0
		want = []string{"a/a.go", "b/link.go", "go.mod", "locked/l.go", "sub/d/keep.go"}
	} else if len(errs) != 1 || errs[0].Path != "locked/l.go" {
		t.Errorf("errs = %v, want one for locked/l.go", errs)
	}
	if !slices.Equal(files, want) {
		t.Fatalf("Files = %v\nwant    %v", files, want)
	}
	if b, err := lt.ReadFile("b/link.go"); err != nil || string(b) != "package a\n" {
		t.Errorf("ReadFile(b/link.go) = %q, %v", b, err)
	}
}

func TestListTreeMatchesDirTree(t *testing.T) {
	root := filepath.Join("testdata", "shop")
	disk := dirOf(t, root)
	files, _, err := disk.Files()
	if err != nil {
		t.Fatal(err)
	}
	lt, err := ListTree(root, files)
	if err != nil {
		t.Fatal(err)
	}
	got, errs, err := lt.Files()
	if err != nil || len(errs) != 0 || !slices.Equal(got, files) {
		t.Fatalf("Files = %v, %v, %v\nwant %v", got, errs, err, files)
	}
}

func TestListTreeRootMustBeADirectory(t *testing.T) {
	if _, err := ListTree(filepath.Join(t.TempDir(), "nope"), nil); err == nil {
		t.Error("ListTree of a missing root must fail")
	}
}
