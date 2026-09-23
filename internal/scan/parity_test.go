package scan_test

import (
	"bytes"
	"context"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/gitref"
	"zu/internal/ir"
	"zu/internal/scan"
)

// parityRepo commits testdata/shop plus the cases where a disk walk and a
// commit listing could disagree: symlinks of every kind, a nested module, a
// malformed go.mod and an unparseable file.
func parityRepo(t *testing.T) (root, commit string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	for k, v := range map[string]string{
		"GIT_CONFIG_GLOBAL": os.DevNull, "GIT_CONFIG_NOSYSTEM": "1",
		"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
		"GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
	} {
		t.Setenv(k, v)
	}
	root = t.TempDir()
	src := filepath.Join("testdata", "shop")
	err := filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		if d.IsDir() {
			return os.MkdirAll(filepath.Join(root, rel), 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(root, rel), b, 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
	put := func(rel, body string) {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	link := func(rel, target string) {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(target, p); err != nil {
			t.Fatal(err)
		}
	}
	put("bad/bad.go", "package bad\n\nfunc {\n")
	put("sub/go.mod", "module example.com/sub\n")
	put("sub/s.go", "package sub\n\nfunc S() {}\n")
	put("broken/go.mod", "module\n")
	put("broken/b.go", "package broken\n")
	put("deep/x/d.go", "package x\n\nfunc D() {}\n")
	link("links/file.go", "../main.go")
	link("links/chain.go", "file.go")
	link("links/viadir.go", "../dx/d.go")
	link("dx", "deep/x")
	link("links/escape.go", "../../outside.go")
	link("links/dir", "../deep")
	link("links/dangling.go", "nope.go")
	link("links/abs.go", filepath.Join(root, "main.go")) // absolute, back into the checkout
	link("links/loop.go", "loop.go")

	git := func(args ...string) string {
		out, err := exec.Command("git", append([]string{"-C", root}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
		return strings.TrimSpace(string(out))
	}
	git("init", "-q")
	git("add", "-A")
	git("commit", "-q", "-m", "parity")
	return root, git("rev-parse", "HEAD")
}

func TestRefScanMatchesDiskScan(t *testing.T) {
	root, commit := parityRepo(t)
	ctx := context.Background()

	disk, err := scan.DirTree(root)
	if err != nil {
		t.Fatal(err)
	}
	top, id, err := gitref.Resolve(ctx, root, "HEAD")
	if err != nil || id != commit {
		t.Fatalf("Resolve = %s, %v", id, err)
	}
	ref, err := gitref.OpenCommit(ctx, top, commit)
	if err != nil {
		t.Fatal(err)
	}
	defer ref.Close()

	encode := func(tree scan.Tree) []byte {
		doc, _, err := scan.Run(ctx, scan.Options{Tree: tree})
		if err != nil {
			t.Fatal(err)
		}
		doc.Ref = ir.Ref{Commit: commit}
		var buf bytes.Buffer
		if err := ir.Encode(&buf, doc); err != nil {
			t.Fatal(err)
		}
		return buf.Bytes()
	}
	a, b := encode(disk), encode(ref)
	if err := ref.Err(); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		al, bl := strings.Split(string(a), "\n"), strings.Split(string(b), "\n")
		for i := range min(len(al), len(bl)) {
			if al[i] != bl[i] {
				t.Fatalf("disk and ref IRs differ at line %d:\ndisk: %s\nref:  %s", i+1, al[i], bl[i])
			}
		}
		t.Fatalf("disk IR has %d lines, ref IR %d", len(al), len(bl))
	}
	if !bytes.Contains(a, []byte(`"links/viadir.go"`)) {
		t.Error("fixture lost its link cases; parity proves nothing")
	}
}
