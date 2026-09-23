package cli

import (
	"bytes"
	"strings"
	"testing"

	"zu/internal/ir"
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
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output %q missing %q", out, want)
		}
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

func TestPlannedCommandsReportNotImplemented(t *testing.T) {
	for _, cmd := range []string{"scan", "serve", "diff", "check", "policy"} {
		code, _, errOut := run(cmd)
		if code != ExitBadInvocation {
			t.Errorf("%s: exit = %d, want %d", cmd, code, ExitBadInvocation)
		}
		if !strings.Contains(errOut, cmd+": not implemented") {
			t.Errorf("%s: stderr %q missing not-implemented message", cmd, errOut)
		}
	}
}
