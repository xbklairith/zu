package cli

import (
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/policy"
)

func TestScanHTMLDrawsThePolicy(t *testing.T) {
	withUI(t)
	dir := layeredRepo(t)
	writeFile(t, dir, policy.FileName, layeredPolicy+"omit: [example.com/m/gone]\n")
	writeFile(t, dir, "gone/gone.go", "package gone\n")
	out := filepath.Join(t.TempDir(), "out.html")
	if code, _, errOut := run("scan", dir, "-html", out); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	s := readFile(t, out)
	for _, want := range []string{
		`"policy":{"hash":"sha256:`,
		`"id":"example.com/m/dom","kind":"package","module":"example.com/m"`,
		`"rank":0`,
		`"violation":"levels"`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %s", want)
		}
	}
	if strings.Contains(s, "example.com/m/gone") {
		t.Error("an omitted package is drawn")
	}
}

func TestDiffHTMLDrawsTheLensAndTheViolations(t *testing.T) {
	withUI(t)
	needGit(t)
	dir := repo(t, map[string]string{
		"go.mod":        "module example.com/m\n",
		"a/a.go":        "package a\n",
		"gone/gone.go":  "package gone\n",
		policy.FileName: "levels: [example.com/m/b, example.com/m/a]\nomit: [example.com/m/gone]\n",
	})
	git(t, dir, "init", "-q", "-b", "main")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "base")
	git(t, dir, "checkout", "-q", "-b", "feat")
	writeFile(t, dir, "b/b.go", "package b\n\nimport _ \"example.com/m/a\"\n")
	writeFile(t, dir, "gone/gone.go", "package gone\n\nfunc G() {}\n")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "add b")
	t.Chdir(dir)
	out := filepath.Join(t.TempDir(), "change.html")
	code, _, errOut := run("diff", "main", "-html", out)
	if code != ExitViolation {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	s := readFile(t, out)
	if !strings.Contains(s, `"violation":"levels"`) || strings.Contains(s, "example.com/m/gone") {
		t.Errorf("Change View: violation drawn %v, omitted package absent %v",
			strings.Contains(s, `"violation":"levels"`), !strings.Contains(s, "example.com/m/gone"))
	}
}
