package cli

import (
	"bytes"
	"errors"
	"runtime"
	"strings"
	"testing"

	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/version"
)

func run(args ...string) (code int, stdout, stderr string) {
	var out, errOut bytes.Buffer
	code = Run(args, &out, &errOut)
	return code, out.String(), errOut.String()
}

func TestVersionReportsAppCommitAndSchema(t *testing.T) {
	code, out, _ := run("version")
	if code != ExitOK {
		t.Fatalf("exit = %d, want %d", code, ExitOK)
	}
	for _, want := range []string{
		"version " + version.Version,
		"commit " + version.Commit,
		"ir-schema " + ir.SchemaVersion,
		"policy-format " + policy.Format,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output %q missing %q", out, want)
		}
	}
}

// N3/N4: the record names the toolchain and says whether the UI is inside.
func TestVersionReportsGoAndEmbeddedUI(t *testing.T) {
	withUI(t)
	code, out, _ := run("version")
	if code != ExitOK {
		t.Fatalf("exit = %d", code)
	}
	want := "policy-format " + policy.Format + "\ngo " + runtime.Version() + "\nui embedded\n"
	if !strings.HasSuffix(out, want) {
		t.Errorf("output %q does not end with %q", out, want)
	}
}

// A build without web/dist/index.html (go test, a plain go build) says so.
func TestVersionSaysWhenTheUIIsAbsent(t *testing.T) {
	old := uiTemplate
	uiTemplate = func() ([]byte, error) { return nil, errors.New("this zu was built without the UI") }
	t.Cleanup(func() { uiTemplate = old })
	code, out, _ := run("version")
	if code != ExitOK || !strings.HasSuffix(out, "\nui absent\n") {
		t.Errorf("exit = %d, output %q; want 0 and a last line \"ui absent\"", code, out)
	}
}

func TestNoArgsIsBadInvocation(t *testing.T) {
	code, out, errOut := run()
	if code != ExitBadInvocation {
		t.Fatalf("exit = %d, want %d", code, ExitBadInvocation)
	}
	if out != "" {
		t.Errorf("stdout = %q, want empty", out)
	}
	if !strings.Contains(errOut, "usage:") {
		t.Errorf("stderr %q missing usage", errOut)
	}
}

func TestHelpPrintsUsageToStdout(t *testing.T) {
	for _, arg := range []string{"help", "-h", "--help"} {
		code, out, _ := run(arg)
		if code != ExitOK {
			t.Errorf("%s: exit = %d, want %d", arg, code, ExitOK)
		}
		if !strings.Contains(out, "usage:") {
			t.Errorf("%s: stdout %q missing usage", arg, out)
		}
	}
}

func TestUnknownCommandIsBadInvocation(t *testing.T) {
	code, _, errOut := run("frobnicate")
	if code != ExitBadInvocation {
		t.Fatalf("exit = %d, want %d", code, ExitBadInvocation)
	}
	if !strings.Contains(errOut, `unknown command "frobnicate"`) {
		t.Errorf("stderr %q missing unknown-command message", errOut)
	}
}
