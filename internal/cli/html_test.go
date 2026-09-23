package cli

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// withUI points the uiTemplate seam at the export package's fixture template.
func withUI(t *testing.T) {
	t.Helper()
	tmpl, err := os.ReadFile("../export/testdata/template.html")
	if err != nil {
		t.Fatal(err)
	}
	old := uiTemplate
	uiTemplate = func() ([]byte, error) { return tmpl, nil }
	t.Cleanup(func() { uiTemplate = old })
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func noZu(t *testing.T, dir string) {
	t.Helper()
	if _, err := os.Stat(filepath.Join(dir, ".zu")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("%s/.zu exists after a bad invocation (err=%v)", dir, err)
	}
}

func TestScanHTMLWritesTheViewAndTheIR(t *testing.T) {
	withUI(t)
	dir, out := repo(t, small), filepath.Join(t.TempDir(), "out.html")
	var stderr bytes.Buffer
	if code := Run([]string{"scan", dir, "-html", out, "-include", "./a"}, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	s := readFile(t, out)
	for _, want := range []string{`"id":"example.com/m/a.F"`, `"a/a.go":`} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %s", want)
		}
	}
	if !strings.Contains(stderr.String(), "html → "+out+" (1 source files inlined") {
		t.Errorf("stderr = %q", stderr.String())
	}
	if m, _ := filepath.Glob(filepath.Join(dir, ".zu", "ir", "*.json")); len(m) != 1 {
		t.Errorf("IR files = %v, want one", m)
	}
}

func TestScanHTMLRefInlinesTheCommit(t *testing.T) {
	needGit(t)
	withUI(t)
	dir := repo(t, small)
	git(t, dir, "init", "-q")
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-qm", "c")
	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
	commit := git(t, dir, "rev-parse", "HEAD")
	f, err := os.OpenFile(filepath.Join(dir, "a", "a.go"), os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString("// WORKTREE-EDIT\n")
	f.Close()

	out := filepath.Join(t.TempDir(), "out.html")
	var stderr bytes.Buffer
	if code := Run([]string{"scan", dir, "-ref", "HEAD", "-html", out, "-include", "./a"}, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	s := readFile(t, out)
	if strings.Contains(s, "WORKTREE-EDIT") {
		t.Error("-ref export inlined the working tree")
	}
	if want := "https://github.com/o/r/blob/" + commit + "/{path}#L{line}"; !strings.Contains(s, want) {
		t.Errorf("html lacks link template %s", want)
	}
}

func TestScanHTMLBadInvocationExitsBeforeScanning(t *testing.T) {
	withUI(t)
	for _, args := range [][]string{
		{"-include", "./a"},
		{"-link-template", "https://h/{path}"},
		{"-html", "-"},
		{"-html", "x.html", "-include", "/x"},
		{"-html", "x.html", "-link-template", "http://h/{path}"},
	} {
		dir := repo(t, small)
		var stderr bytes.Buffer
		if code := Run(append([]string{"scan", dir}, args...), &bytes.Buffer{}, &stderr); code != ExitBadInvocation {
			t.Errorf("%v: exit %d, want %d", args, code, ExitBadInvocation)
		}
		noZu(t, dir)
	}
}

func TestScanHTMLIncludeMatchingNothing(t *testing.T) {
	withUI(t)
	dir := repo(t, small)
	var stderr bytes.Buffer
	code := Run([]string{"scan", dir, "-html", filepath.Join(t.TempDir(), "o.html"), "-include", "./nosuch/..."},
		&bytes.Buffer{}, &stderr)
	if code != ExitBadInvocation || !strings.Contains(stderr.String(), "./nosuch/...") {
		t.Errorf("exit %d, stderr %q", code, stderr.String())
	}
}

func TestScanHTMLWithoutTheUI(t *testing.T) {
	old := uiTemplate
	uiTemplate = func() ([]byte, error) {
		return nil, errors.New("this zu was built without the UI; build it with make build")
	}
	t.Cleanup(func() { uiTemplate = old })
	dir := repo(t, small)
	var stderr bytes.Buffer
	code := Run([]string{"scan", dir, "-html", filepath.Join(t.TempDir(), "o.html")}, &bytes.Buffer{}, &stderr)
	if code != ExitBadInvocation || !strings.Contains(stderr.String(), "make build") {
		t.Errorf("exit %d, stderr %q", code, stderr.String())
	}
	noZu(t, dir)
}

func TestScanHTMLDropsOriginCredentials(t *testing.T) {
	needGit(t)
	withUI(t)
	dir := repo(t, small)
	git(t, dir, "init", "-q")
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-qm", "c")
	git(t, dir, "remote", "add", "origin", "https://user:pw@github.com/o/r.git")
	// -out - keeps .zu out of the working tree, so HEAD stays clean and links appear.
	out := filepath.Join(t.TempDir(), "out.html")
	var stderr bytes.Buffer
	if code := Run([]string{"scan", dir, "-out", "-", "-html", out}, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	s := readFile(t, out)
	if !strings.Contains(s, "https://github.com/o/r/blob/") || strings.Contains(s, "pw@") {
		t.Errorf("links wrong or leak credentials: %s", s[strings.Index(s, `"links"`):])
	}
}

func TestScanHTMLFromASubdirectoryPrefixesLinks(t *testing.T) {
	needGit(t)
	withUI(t)
	top := repo(t, map[string]string{
		"svc/go.mod": "module example.com/svc\n",
		"svc/a/a.go": "package a\n\nfunc F() {}\n",
	})
	git(t, top, "init", "-q")
	git(t, top, "add", ".")
	git(t, top, "commit", "-qm", "c")
	git(t, top, "remote", "add", "origin", "git@github.com:o/r.git")
	commit := git(t, top, "rev-parse", "HEAD")
	out := filepath.Join(t.TempDir(), "out.html")
	var stderr bytes.Buffer
	if code := Run([]string{"scan", filepath.Join(top, "svc"), "-out", "-", "-html", out}, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	if want := "/blob/" + commit + "/svc/{path}"; !strings.Contains(readFile(t, out), want) {
		t.Errorf("html lacks %s", want)
	}
}
