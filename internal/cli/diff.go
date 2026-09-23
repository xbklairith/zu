package cli

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"

	"zu/internal/diff"
	"zu/internal/ir"
	"zu/internal/scan"
)

// scanTree is a seam for tests: how zu diff scans one side.
var scanTree = func(ctx context.Context, tree scan.Tree) (*ir.IR, scan.Stats, error) {
	return scan.Run(ctx, scan.Options{Tree: tree})
}

// runDiff implements `zu diff <base> [head] [-format text|markdown|json]
// [-worktree [-include-ignored]] [-max-parse-errors N]`: the Structural
// Summary of head against the merge-base of base and head.
func runDiff(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("zu diff", flag.ContinueOnError)
	fs.SetOutput(stderr)
	format := fs.String("format", "text", "output `format`: text, markdown or json")
	worktree := fs.Bool("worktree", false, "compare the working tree (the files the next commit would contain) instead of HEAD")
	withIgnored := fs.Bool("include-ignored", false, "with -worktree, also read files git ignores")
	maxErrs := fs.Int("max-parse-errors", 0, "exit 2 when head has more than `N` files that fail to parse")
	refs, err := parsePositional(fs, args)
	bad := func(format string, a ...any) int {
		fmt.Fprintf(stderr, "zu diff: "+format+"\n", a...)
		return ExitBadInvocation
	}
	switch {
	case errors.Is(err, flag.ErrHelp):
		return ExitBadInvocation
	case err != nil:
		return bad("%v", err)
	case len(refs) == 0 || len(refs) > 2:
		return bad("want <base> [head], got %d refs", len(refs))
	case *format != "text" && *format != "markdown" && *format != "json":
		return bad("unknown -format %q: want text, markdown or json", *format)
	case *maxErrs < 0:
		return bad("-max-parse-errors must be >= 0")
	case *withIgnored && !*worktree:
		return bad("-include-ignored applies only with -worktree")
	case *worktree && len(refs) == 2:
		return bad("-worktree compares the working tree; it takes no head ref")
	}
	headName := "HEAD"
	if len(refs) == 2 {
		headName = refs[1]
	}

	ctx, stop := interruptContext()
	defer stop()
	top, baseCommit, err := gitResolve(ctx, ".", refs[0])
	if err != nil {
		return bad("%v", err)
	}
	_, headCommit, err := gitResolve(ctx, top, headName)
	if err != nil {
		return bad("%v", err)
	}
	mb, err := gitMergeBase(ctx, top, baseCommit, headCommit)
	if err != nil {
		return bad("%v", err)
	}

	// One side at a time, so peak memory is two IRs, not two scans.
	baseDoc, err := scanCommit(ctx, top, mb)
	if err != nil {
		return bad("base %s: %v", mb[:min(12, len(mb))], err)
	}
	baseDoc.Ref = ir.Ref{Commit: mb}
	var headDoc *ir.IR
	if *worktree {
		headDoc, err = scanWorktree(ctx, top, headCommit, *withIgnored)
	} else {
		headDoc, err = scanCommit(ctx, top, headCommit)
		if err == nil {
			headDoc.Ref = ir.Ref{Commit: headCommit}
		}
	}
	if err != nil {
		return bad("head: %v", err)
	}
	if err := ctx.Err(); err != nil {
		return bad("%v", err)
	}
	if baseDoc.PolicyHash != headDoc.PolicyHash {
		return bad("policy changed between base and head; diff uses head's policy once the Policy feature lands")
	}

	s := diff.Summarize(baseDoc, headDoc)
	var buf bytes.Buffer
	switch *format {
	case "markdown":
		err = diff.WriteMarkdown(&buf, s)
	case "json":
		err = diff.WriteJSON(&buf, s)
	default:
		err = diff.WriteText(&buf, s)
	}
	if err == nil {
		_, err = stdout.Write(buf.Bytes())
	}
	if err != nil {
		return bad("write: %v", err)
	}
	fmt.Fprintf(stderr, "zu diff: %d packages changed, %d affected, parse errors base=%d head=%d\n",
		len(s.Packages), len(s.Affected), len(baseDoc.ParseErrors), len(headDoc.ParseErrors))
	// Base's parse errors already exist on the base branch (B7): reported,
	// never failing the MR.
	if len(headDoc.ParseErrors) > *maxErrs {
		return ExitParseFailure
	}
	return ExitOK
}

// scanCommit scans one commit from git objects.
func scanCommit(ctx context.Context, top, commit string) (*ir.IR, error) {
	tree, err := openCommit(ctx, top, commit)
	if err != nil {
		return nil, err
	}
	defer tree.Close()
	doc, _, err := scanTree(ctx, tree)
	if treeErr := tree.Err(); treeErr != nil {
		err = treeErr // the cause; a scan error would only be its symptom
	}
	return doc, err
}

// scanWorktree scans the files the next commit would contain, labelled as
// zu scan labels them.
func scanWorktree(ctx context.Context, top, head string, withIgnored bool) (*ir.IR, error) {
	l, err := gitWorktree(ctx, top, withIgnored)
	if err != nil {
		return nil, err
	}
	if l == nil {
		return nil, fmt.Errorf("%s is not a git working tree", top)
	}
	tree, err := scan.ListTree(top, l.Files)
	if err != nil {
		return nil, err
	}
	doc, _, err := scanTree(ctx, tree)
	if err != nil {
		return nil, err
	}
	_, modified := gitHead(ctx, top)
	doc.Ref = ir.Ref{Commit: head, Dirty: modified || l.Extra}
	return doc, nil
}

// parsePositional parses flags anywhere among the positional arguments.
func parsePositional(fs *flag.FlagSet, args []string) ([]string, error) {
	var pos []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		rest := fs.Args()
		if len(rest) == 0 {
			return pos, nil
		}
		pos = append(pos, rest[0])
		args = rest[1:]
	}
}
