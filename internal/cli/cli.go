// Package cli implements the zu command line: subcommand dispatch and exit codes.
package cli

import (
	"fmt"
	"io"
	"runtime"

	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/version"
)

// Exit codes, part of the CLI contract relied on by CI pipelines.
const (
	ExitOK            = 0 // success, no violations
	ExitViolation     = 1 // structural rule violated
	ExitParseFailure  = 2 // parse failures above the configured tolerance
	ExitBadInvocation = 3 // bad invocation or unreadable config
)

const usage = `usage: zu <command> [flags]

commands:
  scan      parse the checkout (or a commit, with -ref) and write the IR
  serve     serve the working tree's Project View on localhost; each page load rescans
  diff      summarise a change: head against its merge-base with base
  check     evaluate the Policy's rules; fail on violations not in the Baseline
  policy    init: write a suggested zu.policy.yaml (never overwrites)
  version   print application, commit, IR schema and Policy format versions
`

// Run executes the command line args (without the program name) and returns
// the process exit code.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprint(stderr, usage)
		return ExitBadInvocation
	}
	switch cmd := args[0]; {
	case cmd == "help" || cmd == "-h" || cmd == "--help":
		fmt.Fprint(stdout, usage)
		return ExitOK
	case cmd == "version":
		ui := "embedded"
		if _, err := uiTemplate(); err != nil {
			ui = "absent"
		}
		fmt.Fprintf(stdout, "zu version %s\ncommit %s\nir-schema %s\npolicy-format %s\ngo %s\nui %s\n",
			version.Version, version.Commit, ir.SchemaVersion, policy.Format, runtime.Version(), ui)
		return ExitOK
	case cmd == "scan":
		return runScan(args[1:], stdout, stderr)
	case cmd == "diff":
		return runDiff(args[1:], stdout, stderr)
	case cmd == "check":
		return runCheck(args[1:], stdout, stderr)
	case cmd == "policy":
		return runPolicy(args[1:], stdout, stderr)
	case cmd == "serve":
		return runServe(args[1:], stdout, stderr)
	default:
		fmt.Fprintf(stderr, "zu: unknown command %q\n\n%s", cmd, usage)
		return ExitBadInvocation
	}
}
