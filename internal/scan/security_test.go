package scan

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
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
