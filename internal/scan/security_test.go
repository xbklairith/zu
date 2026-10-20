package scan

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestIRHasNoAbsolutePaths(t *testing.T) {
	root := fixture(t, "shop")
	doc, _ := run(t, root, 0)
	out := encode(t, doc)
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	home, _ := os.UserHomeDir()
	for _, bad := range []string{root, resolved, home, os.TempDir()} {
		if bad != "" && bytes.Contains(out, []byte(bad)) {
			t.Fatalf("IR contains absolute path %q", bad)
		}
	}
	if host, err := os.Hostname(); err == nil && len(host) > 3 && bytes.Contains(out, []byte(host)) {
		t.Fatalf("IR contains host name %q", host)
	}
}

func TestSymlinksLeavingRootAreNotRead(t *testing.T) {
	root := fixture(t, "shop")
	before, _ := run(t, root, 0)

	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "leak.go"), []byte("package store\n\nfunc Leaked() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(outside, "pkg"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "pkg", "p.go"), []byte("package pkg\n\nfunc Outside() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for link, target := range map[string]string{
		"internal/store/leak.go": filepath.Join(outside, "leak.go"),
		"internal/outside":       filepath.Join(outside, "pkg"),
	} {
		if err := os.Symlink(target, filepath.Join(root, filepath.FromSlash(link))); err != nil {
			t.Skipf("symlinks unsupported: %v", err)
		}
	}
	after, _ := run(t, root, 0)
	if !bytes.Equal(encode(t, before), encode(t, after)) {
		t.Fatal("symlinks leaving the root changed the IR")
	}
}

// The Policy and the Baseline are read by name, not from Files: a planted
// link such as zu.policy.yaml -> ../secret.txt must not be followed out of
// the tree, and neither file may be read beyond MaxSmallFile.
func TestReadFileByNameStaysInTheTree(t *testing.T) {
	parent := t.TempDir()
	if err := os.WriteFile(filepath.Join(parent, "secret.txt"), []byte("SECRET\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(parent, "repo")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	for rel, body := range map[string]string{
		"go.mod":   "module example.com/m\n",
		"big.json": strings.Repeat("x", MaxSmallFile+1),
	} {
		if err := os.WriteFile(filepath.Join(root, rel), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for link, target := range map[string]string{
		"zu.policy.yaml": "../secret.txt", // leaves the tree
		"in.mod":         "go.mod",        // stays inside
	} {
		if err := os.Symlink(target, filepath.Join(root, link)); err != nil {
			t.Skipf("symlinks unsupported: %v", err)
		}
	}
	list, err := ListTree(root, []string{"go.mod"})
	if err != nil {
		t.Fatal(err)
	}
	for name, tr := range map[string]Tree{"dir": dirOf(t, root), "list": list} {
		if data, err := tr.ReadFile("zu.policy.yaml"); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("%s: ReadFile through an escaping link = %q, %v; want fs.ErrNotExist", name, data, err)
		}
		if data, err := ReadSmall(tr, "in.mod"); err != nil || !strings.HasPrefix(string(data), "module") {
			t.Errorf("%s: in-tree link = %q, %v", name, data, err)
		}
		if _, err := ReadSmall(tr, "big.json"); err == nil || !strings.Contains(err.Error(), "larger than") {
			t.Errorf("%s: ReadSmall past the cap: %v", name, err)
		}
	}
}

// A directory link is never followed (Tree), though a path through one
// reaches a file: git still lists what a directory held before it became a
// link, and zu serve reads files by such paths (19).
func TestDirectoryLinksAreNotFollowed(t *testing.T) {
	parent := t.TempDir()
	if err := os.MkdirAll(filepath.Join(parent, "outside"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(parent, "outside", "store.go"), []byte("package store // SECRET\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	root := tree(t, map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n"})
	if err := os.Mkdir(filepath.Join(root, "b"), 0o755); err != nil {
		t.Fatal(err)
	}
	for link, target := range map[string]string{
		"b/store": filepath.Join(parent, "outside"), // leaves the tree
		"alias":   "a",                              // stays inside
	} {
		if err := os.Symlink(target, filepath.Join(root, filepath.FromSlash(link))); err != nil {
			t.Skipf("symlinks unsupported: %v", err)
		}
	}
	through := []string{"b/store/store.go", "alias/a.go"}
	list, err := ListTree(root, append([]string{"a/a.go", "go.mod"}, through...))
	if err != nil {
		t.Fatal(err)
	}
	if files, errs, err := list.Files(); err != nil || len(errs) != 0 || !slices.Equal(files, []string{"a/a.go", "go.mod"}) {
		t.Errorf("Files = %v, %v, %v; want [a/a.go go.mod]", files, errs, err)
	}
	// filepath.Join puts an absolute path below the root, and the walk up
	// its directories ends there.
	if d := dirOf(t, root).(*dirTree); d.viaLink("/a", nil) || !d.viaLink("/b/store", nil) {
		t.Error(`viaLink("/a") or viaLink("/b/store") is wrong`)
	}
	for name, tr := range map[string]Tree{"dir": dirOf(t, root), "list": list} {
		for _, rel := range through {
			if data, err := tr.ReadFile(rel); !errors.Is(err, fs.ErrNotExist) {
				t.Errorf("%s: ReadFile(%s) = %q, %v; want fs.ErrNotExist", name, rel, data, err)
			}
		}
	}
}

// The open itself stays in the root, whatever readMax's checks saw before
// it: a directory swapped for a link out of the tree between the two is not
// followed (19). A file link inside the tree still opens.
func TestOpenStaysInTheRoot(t *testing.T) {
	parent := t.TempDir()
	if err := os.MkdirAll(filepath.Join(parent, "outside"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(parent, "outside", "a.go"), []byte("package a // SECRET\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	root := tree(t, map[string]string{"go.mod": "module example.com/m\n", "e/e.go": "package e\n"})
	for link, target := range map[string]string{
		"a":    filepath.Join(parent, "outside"),                      // leaves the tree, absolute
		"r":    filepath.Join("..", filepath.Base(parent), "outside"), // leaves the tree, relative
		"f.go": filepath.Join("e", "e.go"),                            // a file link inside
	} {
		if err := os.Symlink(target, filepath.Join(root, link)); err != nil {
			t.Skipf("symlinks unsupported: %v", err)
		}
	}
	if b, err := os.ReadFile(filepath.Join(root, "r", "a.go")); err != nil || !strings.Contains(string(b), "SECRET") {
		t.Fatalf("the relative link does not reach outside: %q, %v", b, err)
	}
	d := dirOf(t, root).(*dirTree)
	for _, rel := range []string{"a/a.go", "r/a.go"} {
		if f, err := d.open(rel); !errors.Is(err, fs.ErrNotExist) {
			if f != nil {
				f.Close()
			}
			t.Errorf("open(%s) = %v; want fs.ErrNotExist", rel, err)
		}
	}
	f, err := d.open("f.go")
	if err != nil {
		t.Fatalf("open(f.go) = %v", err)
	}
	f.Close()
}

// TestScanLinksNoNetworkCode guards REQ-042: the scanner cannot open a
// connection if no networking package is linked into it.
func TestScanLinksNoNetworkCode(t *testing.T) {
	gobin, err := exec.LookPath("go")
	if err != nil {
		t.Skip("go tool not available")
	}
	out, err := exec.Command(gobin, "list", "-deps", "zu/internal/scan", "zu/internal/ir", "zu/internal/gitref").Output()
	if err != nil {
		t.Fatal(err)
	}
	for _, dep := range strings.Fields(string(out)) {
		if dep == "net" || strings.HasPrefix(dep, "net/") || strings.HasPrefix(dep, "crypto/tls") {
			t.Fatalf("scanner depends on %s", dep)
		}
	}
}
