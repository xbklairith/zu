package cli

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"path/filepath"

	"zu/internal/policy"
	"zu/internal/scan"
)

// runCheck implements `zu check [dir] [-ref commit] [-update-baseline]
// [-max-parse-errors N]`: evaluate the Policy's rules and fail only on
// violations the Baseline does not know. Exit codes: 0 none new, 1 new
// violations, 2 parse failures (a file that does not parse hides its
// imports), 3 bad invocation or unusable Policy or Baseline.
func runCheck(args []string, stdout, stderr io.Writer) int {
	fset := flag.NewFlagSet("zu check", flag.ContinueOnError)
	fset.SetOutput(stderr)
	refName := fset.String("ref", "", "check `commit` from git objects instead of the working tree")
	update := fset.Bool("update-baseline", false, "write "+policy.BaselineFile+": remove fixed entries, or create it from every current violation")
	maxErrs := fset.Int("max-parse-errors", 0, "exit 2 when more than `N` files fail to parse")
	dir, err := parseWithDir(fset, args)
	if err != nil {
		if !errors.Is(err, flag.ErrHelp) {
			fmt.Fprintf(stderr, "zu check: %v\n", err)
		}
		return ExitBadInvocation
	}
	if *update && *refName != "" {
		fmt.Fprintln(stderr, "zu check: -update-baseline writes the working tree's Baseline; it cannot be used with -ref")
		return ExitBadInvocation
	}
	if *maxErrs < 0 {
		fmt.Fprintln(stderr, "zu check: -max-parse-errors must be >= 0")
		return ExitBadInvocation
	}

	ctx, stop := interruptContext()
	defer stop()
	src, err := openSource(ctx, dir, *refName, false)
	if err != nil {
		fmt.Fprintf(stderr, "zu check: %v\n", err)
		return ExitBadInvocation
	}
	defer src.close()
	doc, pol, stats, err := scanSource(ctx, src)
	if err == nil && !pol.Rules() {
		err = fmt.Errorf("%s has no rules: add levels or cycles: true", policy.FileName)
	}
	if err != nil {
		fmt.Fprintf(stderr, "zu check: %v\n", err)
		return ExitBadInvocation
	}
	// Before Validate: a file that does not parse can hide the package a
	// level names, and it always hides its own imports.
	if stats.ParseErrors > *maxErrs {
		fmt.Fprintf(stderr, "zu check: %d files failed to parse; their imports are not checked\n", stats.ParseErrors)
		return ExitParseFailure
	}
	err = pol.Validate(doc)
	var base *policy.Baseline
	if err == nil {
		base, err = readBaseline(func(rel string) ([]byte, error) { return scan.ReadSmall(src.tree, rel) })
	}
	if err != nil {
		fmt.Fprintf(stderr, "zu check: %v\n", err)
		return ExitBadInvocation
	}

	current := pol.Check(doc)
	hash := pol.Hash()
	if base.Stale(hash) {
		// Entries are only ever removed: accepting what a Policy change
		// brings means deleting the Baseline, in the MR, visibly.
		fmt.Fprintf(stderr, "zu check: Baseline was written under Policy %s; delete %s and re-run with -update-baseline to accept %d current violations\n",
			base.PolicyHash, policy.BaselineFile, len(current))
		return ExitBadInvocation
	}
	if *update {
		created := base == nil
		if base, err = base.Update(current, hash); err != nil {
			fmt.Fprintf(stderr, "zu check: %v\n", err)
			return ExitBadInvocation
		}
		var buf bytes.Buffer
		if err := base.Encode(&buf); err != nil {
			fmt.Fprintf(stderr, "zu check: %v\n", err)
			return ExitBadInvocation
		}
		if err := writeAtomic(filepath.Join(src.root, policy.BaselineFile), buf.Bytes()); err != nil {
			fmt.Fprintf(stderr, "zu check: write: %v\n", err)
			return ExitBadInvocation
		}
		if created {
			fmt.Fprintf(stderr, "zu check: created %s, accepting %d violations:\n", policy.BaselineFile, len(base.Violations))
			writeViolations(stderr, base.Violations)
		} else {
			fmt.Fprintf(stderr, "zu check: wrote %s (%d violations)\n", policy.BaselineFile, len(base.Violations))
		}
	}

	fresh, fixed := base.Split(current)
	writeViolations(stdout, fresh)
	fmt.Fprintf(stdout, "zu check: %d new, %d known, %d fixed\n", len(fresh), len(current)-len(fresh), len(fixed))
	if len(fixed) > 0 && !*update {
		fmt.Fprintf(stderr, "zu check: run zu check -update-baseline to drop %d fixed entries from %s\n", len(fixed), policy.BaselineFile)
	}
	if len(fresh) > 0 {
		fmt.Fprintf(stderr, "zu check: %d new violations; fix them, or delete %s and run zu check -update-baseline to accept every current one\n",
			len(fresh), policy.BaselineFile)
		return ExitViolation
	}
	return ExitOK
}

// readBaseline reads the Baseline through the tree; a missing file is nil.
func readBaseline(read func(string) ([]byte, error)) (*policy.Baseline, error) {
	data, err := read(policy.BaselineFile)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("%s: %w", policy.BaselineFile, err)
	}
	return policy.DecodeBaseline(data)
}

// writeViolations lists violations one per line, sorted as given.
func writeViolations(w io.Writer, vs []policy.Violation) {
	for _, v := range vs {
		fmt.Fprintf(w, "  %-6s  %s → %s\n", v.Rule, v.From, v.To)
	}
}
