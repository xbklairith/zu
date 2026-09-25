package cli

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"

	"zu/internal/diff"
	"zu/internal/gitref"
	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/scan"
)

// scanTree is a seam for tests: how zu scans one tree under a Policy, which
// decides the files skipped and the hash the IR records.
var scanTree = func(ctx context.Context, tree scan.Tree, pol *policy.Policy) (*ir.IR, scan.Stats, error) {
	return scan.Run(ctx, scan.Options{Tree: tree, Exclude: pol.Excluded, PolicyHash: pol.Hash()})
}

// loadPolicy reads the Policy file at the root of tree, capped at
// scan.MaxSmallFile. A missing file is the empty Policy.
func loadPolicy(tree scan.Tree) (*policy.Policy, error) {
	return policy.Load(func(rel string) ([]byte, error) { return scan.ReadSmall(tree, rel) })
}

// runDiff implements `zu diff <base> [head] [-format text|markdown|json]
// [-worktree [-include-ignored]] [-max-parse-errors N] [-html file
// [-link-template T | -mr N] [-coverprofile file]]`: the Structural Summary of head
// against the merge-base of base and head, and optionally the Change View
// export.
// Exit 2 when head fails to parse, else 1 when the change adds violations
// of the Policy's rules, else 0.
func runDiff(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("zu diff", flag.ContinueOnError)
	fs.SetOutput(stderr)
	format := fs.String("format", "text", "output `format`: text, markdown or json")
	worktree := fs.Bool("worktree", false, "compare the working tree (the files the next commit would contain) instead of HEAD")
	withIgnored := fs.Bool("include-ignored", false, "with -worktree, also read files git ignores")
	maxErrs := fs.Int("max-parse-errors", 0, "exit 2 when head has more than `N` files that fail to parse")
	var hopts htmlOptions
	fs.StringVar(&hopts.path, "html", "", "also write a self-contained HTML Change View to `file`")
	fs.StringVar(&hopts.linkTmpl, "link-template", "", "with -html, link source to `url` with {commit}, {path} and {line}")
	fs.Var(&hopts.include, "include", "not accepted: the change decides what -html inlines")
	fs.Func("mr", "with -html, link diffs to merge request `N`'s page, not the compare page", hopts.setMR)
	fs.StringVar(&hopts.cover, "coverprofile", "", "with -html, colour head's packages by CRAP from `file`, written by go test -coverprofile over head")
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
	case len(hopts.include) > 0:
		return bad("-include does not apply: the change decides what -html inlines")
	}
	if err := hopts.prepare(); err != nil {
		return bad("%v", err)
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
	if err := hopts.checkMR(ctx, top); err != nil {
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

	// Head's Policy governs both sides (ADR 0004): scan head under its own
	// Policy file, then base under the same one, so a change to the Policy
	// never shows up as a change to the code. One side at a time, so peak
	// memory is two IRs, not two scans. The trees stay open while -html
	// needs to read changed files.
	head, err := openHead(ctx, top, headCommit, *worktree, *withIgnored)
	if err != nil {
		return bad("head: %v", err)
	}
	defer head.close()
	headDoc, pol, headStats, err := scanSource(ctx, head)
	if err != nil {
		return bad("head: %v", err)
	}
	headDoc.Ref = *head.ref
	baseDoc, baseTree, err := scanCommit(ctx, top, mb, pol)
	if err != nil {
		return bad("base %s: %v", mb[:min(12, len(mb))], err)
	}
	defer baseTree.Close()
	if hopts.path == "" {
		_ = baseTree.Close()
	}
	baseDoc.Ref = ir.Ref{Commit: mb}
	if err := ctx.Err(); err != nil {
		return bad("%v", err)
	}
	// check enforces this; a diff must not fail an MR that deletes or
	// renames a package a level names.
	if err := pol.Validate(headDoc); err != nil {
		fmt.Fprintf(stderr, "zu diff: warning: %v (zu check fails on it)\n", err)
	}

	delta := diff.Compare(baseDoc, headDoc)
	s := diff.SummarizeDelta(baseDoc, headDoc, delta)
	if pol.Rules() {
		s.Violations = diff.Violations(pol.Check(baseDoc), pol.Check(headDoc))
	}
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
	if hopts.path != "" {
		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree, pol: pol, measures: headStats.Measures, delta: delta}
		if err := writeChangeHTML(ctx, c, s, &hopts, stderr); err != nil {
			return bad("html: %v", err)
		}
	}
	// Base's parse errors already exist on the base branch (B7): reported,
	// never failing the MR.
	if len(headDoc.ParseErrors) > *maxErrs {
		return ExitParseFailure
	}
	if s.Violations != nil && len(s.Violations.New) > 0 {
		fmt.Fprintf(stderr, "zu diff: %d new violations of %s (B9)\n", len(s.Violations.New), policy.FileName)
		return ExitViolation
	}
	return ExitOK
}

// scanCommit scans one commit from git objects under pol. On success the
// tree is left open for reading files, and the caller closes it.
func scanCommit(ctx context.Context, top, commit string, pol *policy.Policy) (*ir.IR, *gitref.CommitTree, error) {
	tree, err := openCommit(ctx, top, commit)
	if err != nil {
		return nil, nil, err
	}
	doc, _, err := scanTree(ctx, tree, pol)
	if treeErr := tree.Err(); treeErr != nil {
		err = treeErr // the cause; a scan error would only be its symptom
	}
	if err != nil {
		_ = tree.Close()
		return nil, nil, err
	}
	return doc, tree, nil
}

// openHead opens head's side: the commit or, with worktree, the files the
// next commit would contain, labelled as zu scan labels them.
func openHead(ctx context.Context, top, commit string, worktree, withIgnored bool) (*source, error) {
	if !worktree {
		tree, err := openCommit(ctx, top, commit)
		if err != nil {
			return nil, err
		}
		return &source{
			tree: tree, root: top, ref: &ir.Ref{Commit: commit},
			err: tree.Err, close: func() { _ = tree.Close() },
		}, nil
	}
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
	_, modified := gitHead(ctx, top)
	return &source{
		tree: tree, root: top, ref: &ir.Ref{Commit: commit, Dirty: modified || l.Extra},
		err: func() error { return nil }, close: func() {},
	}, nil
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
