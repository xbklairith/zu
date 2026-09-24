package cli

import (
	"bytes"
	"maps"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// profileFor writes a coverprofile that runs F's one statement.
func profileFor(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "private-name.out")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

const smallProfile = "mode: set\nexample.com/m/a/a.go:3.10,3.17 1 1\n"

func TestScanHTMLDrawsCRAP(t *testing.T) {
	withUI(t)
	dir, out := repo(t, small), filepath.Join(t.TempDir(), "out.html")
	prof := profileFor(t, smallProfile)
	var stderr bytes.Buffer
	args := []string{"scan", dir, "-html", out, "-include", "./a", "-coverprofile", prof}
	if code := Run(args, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	s := readFile(t, out)
	want := `"metrics":{"packages":{"example.com/m/a":{"funcs":2,"crap":{"mu":1,"max":1,"sigma":0}}},` +
		`"funcs":{"example.com/m/a.F":{"cc":1,"stmts":1,"covered":1,"crap":1},"example.com/m/a.G":{"cc":1,"stmts":0,"covered":0,"crap":1}}}`
	if !strings.Contains(s, want) {
		t.Errorf("html lacks %s", want)
	}
	if strings.Contains(s, "private-name") {
		t.Error("the profile's path reached the page")
	}
	if !strings.Contains(stderr.String(), "zu scan: CRAP: coverage for 2 of 2 functions\n") ||
		strings.Contains(stderr.String(), "no function") || strings.Contains(stderr.String(), "uncommitted") {
		t.Errorf("stderr = %q", stderr.String())
	}
}

// A profile of another revision puts blocks where this tree has no code;
// zu cannot match revisions, so it says how many. A package-level literal
// is code, and a file the scan did not parse says nothing about the tree.
func TestScanCRAPReportsBlocksOutsideEveryFunction(t *testing.T) {
	withUI(t)
	files := maps.Clone(small)
	files["a/v.go"] = "package a\n\nvar V = func() int { return 1 }\n"
	dir, out := repo(t, files), filepath.Join(t.TempDir(), "out.html")
	prof := profileFor(t, smallProfile+"example.com/m/a/v.go:3.20,3.32 1 1\n"+
		"example.com/m/a/a.go:1.1,1.10 1 1\nexample.com/m/a/gone.go:3.1,3.9 2 0\n")
	var stderr bytes.Buffer
	if code := Run([]string{"scan", dir, "-html", out, "-coverprofile", prof}, &bytes.Buffer{}, &stderr); code != ExitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	if want := "zu scan: CRAP: 1 profile block matches no function: profile may be from another revision\n"; !strings.Contains(stderr.String(), want) {
		t.Errorf("stderr = %q, want %q", stderr.String(), want)
	}
}

// go test runs the working tree; -ref reads a commit. With uncommitted
// changes the two differ, and the profile's lines may not match the commit's.
func TestScanRefCRAPWarnsOfUncommittedChanges(t *testing.T) {
	withUI(t)
	needGit(t)
	dir, out := repo(t, small), filepath.Join(t.TempDir(), "out.html")
	git(t, dir, "init", "-q")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "-m", "one")
	writeFile(t, dir, "a/a.go", "package a\n\n// F runs G.\nfunc F() { G() }\n\nfunc G() {}\n")
	prof := profileFor(t, "mode: set\nexample.com/m/a/a.go:4.10,4.17 1 1\n") // go test on the working tree
	const want = "zu scan: CRAP: the working tree has uncommitted changes; if go test ran on them, drop -ref\n"
	for _, ref := range []bool{true, false} {
		args := []string{"scan", dir, "-html", out, "-coverprofile", prof, "-out", "-"}
		if ref {
			args = append(args, "-ref", "HEAD")
		}
		var stderr bytes.Buffer
		if code := Run(args, &bytes.Buffer{}, &stderr); code != ExitOK {
			t.Fatalf("%v: exit %d: %s", args, code, stderr.String())
		}
		if got := strings.Contains(stderr.String(), want); got != ref {
			t.Errorf("-ref %v: warned %v, stderr %q", ref, got, stderr.String())
		}
		// The commit has a blank line where the working tree has F's block.
		if got := strings.Contains(stderr.String(), "1 profile block matches no function"); got != ref {
			t.Errorf("-ref %v: unmatched block reported %v, stderr %q", ref, got, stderr.String())
		}
	}
}

func TestScanHTMLWithoutAProfileDrawsNoCRAP(t *testing.T) {
	withUI(t)
	dir, out := repo(t, small), filepath.Join(t.TempDir(), "out.html")
	if code := Run([]string{"scan", dir, "-html", out}, &bytes.Buffer{}, &bytes.Buffer{}); code != ExitOK {
		t.Fatalf("exit %d", code)
	}
	if strings.Contains(readFile(t, out), `"metrics"`) {
		t.Error("no profile, no overlay (A7: degrade silently)")
	}
}

func TestScanCoverprofileBadInvocationExitsBeforeScanning(t *testing.T) {
	withUI(t)
	good := profileFor(t, smallProfile)
	for args, want := range map[string]string{
		"-coverprofile " + good:                                           "-coverprofile needs -html",
		"-html x.html -coverprofile " + good + ".nosuch":                  "-coverprofile " + good + ".nosuch: no such file",
		"-html x.html -coverprofile " + t.TempDir():                       "not a regular file",
		"-html x.html -coverprofile " + profileFor(t, "x\n"):              "line 1: not a coverprofile",
		"-html x.html -coverprofile " + profileFor(t, "mode: set\nm 1\n"): "line 2:",
	} {
		dir := repo(t, small)
		var stderr bytes.Buffer
		if code := Run(append([]string{"scan", dir}, strings.Fields(args)...), &bytes.Buffer{}, &stderr); code != ExitBadInvocation {
			t.Errorf("%s: exit %d, want %d", args, code, ExitBadInvocation)
		}
		if !strings.Contains(stderr.String(), want) {
			t.Errorf("%s: stderr %q lacks %q", args, stderr.String(), want)
		}
		noZu(t, dir)
	}
}
