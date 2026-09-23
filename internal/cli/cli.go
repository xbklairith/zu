// Package cli implements the zu command line: subcommand dispatch and exit codes.
package cli

import (
	"fmt"
	"io"

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
  serve     scan if needed, then serve the local web UI
  diff      summarise a change: head against its merge-base with base
  check     evaluate the Policy's rules; fail on violations not in the Baseline
  policy    init: write a suggested zu.policy.yaml (never overwrites)
  version   print application, commit, IR schema and Policy format versions
`

// planned lists commands that are part of the CLI surface but not built yet.
var planned = map[string]bool{
	"serve": true,
}

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
		fmt.Fprintf(stdout, "zu version %s\ncommit %s\nir-schema %s\npolicy-format %s\n",
			version.Version, version.Commit, ir.SchemaVersion, policy.Format)
		return ExitOK
	case cmd == "scan":
		return runScan(args[1:], stdout, stderr)
	case cmd == "diff":
		return runDiff(args[1:], stdout, stderr)
	case cmd == "check":
		return runCheck(args[1:], stdout, stderr)
	case cmd == "policy":
		return runPolicy(args[1:], stdout, stderr)
	case planned[cmd]:
		fmt.Fprintf(stderr, "zu %s: not implemented\n", cmd)
		return ExitBadInvocation
	default:
		fmt.Fprintf(stderr, "zu: unknown command %q\n\n%s", cmd, usage)
		return ExitBadInvocation
	}
}
