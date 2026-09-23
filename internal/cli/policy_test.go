package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/policy"
)

func TestPolicyInitWritesLevelsThatHold(t *testing.T) {
	dir := repo(t, map[string]string{
		"go.mod":     "module example.com/m\n",
		"app/app.go": "package app\n",
		"dom/dom.go": "package dom\n\nimport _ \"example.com/m/app\"\n",
	})
	if code, _, errOut := run("policy", "init", dir); code != ExitOK || !strings.Contains(errOut, "2 levels") {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
	b, err := os.ReadFile(filepath.Join(dir, policy.FileName))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "- [\"example.com/m/app\"]\n  - [\"example.com/m/dom\"]") {
		t.Fatalf("levels not inner first:\n%s", b)
	}
	if code, out, errOut := run("check", dir); code != ExitOK || !strings.Contains(out, "0 new") {
		t.Fatalf("the suggestion must pass check: exit %d, %q %q", code, out, errOut)
	}
}

func TestPolicyInitNeverOverwrites(t *testing.T) {
	dir := repo(t, map[string]string{"go.mod": "module example.com/m\n", policy.FileName: "# mine\n"})
	code, _, errOut := run("policy", "init", dir)
	if code != ExitBadInvocation || !strings.Contains(errOut, "already exists") {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, policy.FileName)); string(b) != "# mine\n" {
		t.Fatalf("overwritten: %q", b)
	}
}

func TestPolicyNeedsASubcommand(t *testing.T) {
	for _, args := range [][]string{{"policy"}, {"policy", "suggest"}} {
		if code, _, errOut := run(args...); code != ExitBadInvocation || !strings.Contains(errOut, "zu policy init") {
			t.Errorf("%v: exit %d, stderr %q", args, code, errOut)
		}
	}
}
