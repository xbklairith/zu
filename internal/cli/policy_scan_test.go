package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/policy"
	"zu/internal/scan"
)

func TestScanReadsThePolicyFile(t *testing.T) {
	dir := repo(t, map[string]string{
		"go.mod":         "module example.com/m\n",
		"a/a.go":         "package a\n",
		"gen/gen.pb.go":  "package gen\n",
		"zu.policy.yaml": "exclude: [\"**/*.pb.go\"]\ncycles: true\n",
	})
	if code, _, errOut := run("scan", dir); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	doc := readIR(t, filepath.Join(dir, ".zu", "ir", "worktree.json"))
	for _, n := range doc.Nodes {
		if n.ID == "example.com/m/gen" {
			t.Error("excluded gen/gen.pb.go was scanned")
		}
	}
	if doc.PolicyHash == scan.DefaultPolicyHash || !strings.HasPrefix(doc.PolicyHash, "sha256:") {
		t.Errorf("PolicyHash = %q, want the file's hash", doc.PolicyHash)
	}
}

func TestScanRejectsABadPolicyFile(t *testing.T) {
	dir := repo(t, map[string]string{
		"go.mod":         "module example.com/m\n",
		"a/a.go":         "package a\n",
		"zu.policy.yaml": "levles: [a]\n",
	})
	code, out, errOut := run("scan", dir)
	if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, "zu.policy.yaml") || !strings.Contains(errOut, "levles") {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
	}
}

// A Policy file that links out of the repository is not read: the scan
// runs as if there were none, and nothing of the target reaches stderr.
func TestScanDoesNotFollowAPolicyLinkOutOfTheRepo(t *testing.T) {
	dir := repo(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"a/a.go": "package a\n",
	})
	if err := os.WriteFile(filepath.Join(filepath.Dir(dir), "secret.txt"), []byte("SECRET_TOKEN\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../secret.txt", filepath.Join(dir, policy.FileName)); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}
	code, _, errOut := run("scan", dir)
	if code != ExitOK || strings.Contains(errOut, "SECRET") {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
	if doc := readIR(t, filepath.Join(dir, ".zu", "ir", "worktree.json")); doc.PolicyHash != scan.DefaultPolicyHash {
		t.Errorf("PolicyHash = %q, want the default: the link is not a Policy", doc.PolicyHash)
	}
}
