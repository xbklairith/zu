package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zu/internal/policy"
	"zu/internal/scan"
)

const layeredPolicy = "levels: [example.com/m/dom, example.com/m/app]\n"

// layeredRepo has one Levels violation: dom (inner) imports app (outer).
func layeredRepo(t *testing.T) string {
	return repo(t, map[string]string{
		"go.mod":        "module example.com/m\n",
		"app/app.go":    "package app\n\nfunc A() {}\n",
		"dom/dom.go":    "package dom\n\nimport \"example.com/m/app\"\n\nfunc D() { app.A() }\n",
		policy.FileName: layeredPolicy,
	})
}

func baselineOf(t *testing.T, dir string) *policy.Baseline {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, policy.BaselineFile))
	if err != nil {
		t.Fatal(err)
	}
	base, err := policy.DecodeBaseline(b)
	if err != nil {
		t.Fatal(err)
	}
	return base
}

func TestCheckFailsOnlyOnNewViolations(t *testing.T) {
	dir := layeredRepo(t)
	code, out, errOut := run("check", dir)
	if code != ExitViolation || !strings.Contains(out, "levels  example.com/m/dom → example.com/m/app") {
		t.Fatalf("no Baseline: exit %d, stdout %q, stderr %q", code, out, errOut)
	}
	if !strings.Contains(errOut, "-update-baseline") {
		t.Errorf("stderr %q does not say how to accept them", errOut)
	}

	if code, _, errOut := run("check", "-update-baseline", dir); code != ExitOK || !strings.Contains(errOut, "accepting 1 violations:\n  levels  example.com/m/dom → example.com/m/app") {
		t.Fatalf("-update-baseline creates the Baseline and lists what it accepts: exit %d, stderr %q", code, errOut)
	}
	if b := baselineOf(t, dir); len(b.Violations) != 1 || b.Violations[0].From != "example.com/m/dom" {
		t.Fatalf("Baseline = %+v", b)
	}
	if code, out, _ := run("check", dir); code != ExitOK || !strings.Contains(out, "0 new, 1 known") {
		t.Fatalf("known violation: exit %d, stdout %q", code, out)
	}

	writeFile(t, dir, "dom/sub/sub.go", "package sub\n\nimport _ \"example.com/m/app\"\n")
	code, out, _ = run("check", dir)
	if code != ExitViolation || !strings.Contains(out, "dom/sub → example.com/m/app") || strings.Contains(out, "m/dom → ") {
		t.Fatalf("a new violation alone is listed: exit %d, stdout %q", code, out)
	}
	if code, _, _ := run("check", "-update-baseline", dir); code != ExitViolation {
		t.Error("-update-baseline under the same Policy never accepts a new violation")
	}
}

func TestCheckUpdateBaselineRemovesFixed(t *testing.T) {
	dir := layeredRepo(t)
	run("check", "-update-baseline", dir)
	writeFile(t, dir, "dom/dom.go", "package dom\n")
	code, out, _ := run("check", dir)
	if code != ExitOK || !strings.Contains(out, "1 fixed") {
		t.Fatalf("fixed: exit %d, stdout %q", code, out)
	}
	run("check", "-update-baseline", dir)
	if b := baselineOf(t, dir); len(b.Violations) != 0 {
		t.Fatalf("fixed entry kept: %+v", b)
	}
}

// A Baseline written under another Policy stops check, with or without
// -update-baseline, even when the edit changes no rule: entries are only
// ever removed, so a Policy edit cannot slip a new violation in.
func TestCheckStaleBaselineStops(t *testing.T) {
	dir := layeredRepo(t)
	run("check", "-update-baseline", dir)
	before := baselineOf(t, dir)
	writeFile(t, dir, "dom/sub/sub.go", "package sub\n\nimport _ \"example.com/m/app\"\n")
	writeFile(t, dir, policy.FileName, layeredPolicy+"order: [example.com/m/dom]\n")
	for _, args := range [][]string{{"check", dir}, {"check", "-update-baseline", dir}} {
		code, _, errOut := run(args...)
		if code != ExitBadInvocation || !strings.Contains(errOut, "delete "+policy.BaselineFile) || !strings.Contains(errOut, "accept 2 current violations") {
			t.Fatalf("%v: exit %d, stderr %q", args, code, errOut)
		}
	}
	if after := baselineOf(t, dir); after.PolicyHash != before.PolicyHash || len(after.Violations) != 1 {
		t.Fatalf("a stale Baseline was rewritten: %+v", after)
	}
	if err := os.Remove(filepath.Join(dir, policy.BaselineFile)); err != nil {
		t.Fatal(err)
	}
	if code, _, errOut := run("check", "-update-baseline", dir); code != ExitOK || !strings.Contains(errOut, "accepting 2 violations") {
		t.Fatalf("re-created: exit %d, stderr %q", code, errOut)
	}
}

func TestCheckBadInvocations(t *testing.T) {
	for name, tc := range map[string]struct {
		files map[string]string
		args  []string
		want  string
	}{
		"no rules":     {map[string]string{"go.mod": "module example.com/m\n", policy.FileName: "foreign: [x.io]\n"}, nil, "no rules"},
		"no Policy":    {map[string]string{"go.mod": "module example.com/m\n"}, nil, "no rules"},
		"level typo":   {map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n", policy.FileName: "levels: [example.com/m/b]\n"}, nil, "matches no package"},
		"ref + update": {map[string]string{"go.mod": "module example.com/m\n"}, []string{"-ref", "HEAD", "-update-baseline"}, "-update-baseline"},
		"bad Baseline": {map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n", policy.FileName: "cycles: true\n", policy.BaselineFile: "{}"}, nil, policy.BaselineFile},
		"big Baseline": {map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n", policy.FileName: "cycles: true\n", policy.BaselineFile: strings.Repeat(" ", scan.MaxSmallFile+1)}, nil, "larger than"},
	} {
		t.Run(name, func(t *testing.T) {
			dir := repo(t, tc.files)
			code, _, errOut := run(append([]string{"check", dir}, tc.args...)...)
			if code != ExitBadInvocation || !strings.Contains(errOut, tc.want) {
				t.Fatalf("exit %d, stderr %q, want 3 and %q", code, errOut, tc.want)
			}
		})
	}
}

func TestCheckParseFailureWins(t *testing.T) {
	dir := layeredRepo(t)
	writeFile(t, dir, "bad/bad.go", "package bad\n\nfunc {\n")
	if code, _, _ := run("check", dir); code != ExitParseFailure {
		t.Fatalf("exit %d, want %d: a file that does not parse hides its imports", code, ExitParseFailure)
	}
}
