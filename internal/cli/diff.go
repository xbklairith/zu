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
	"zu/internal/scan"
)

// scanTree is a seam for tests: how zu diff scans one side.
var scanTree = func(ctx context.Context, tree scan.Tree) (*ir.IR, scan.Stats, error) {
	return scan.Run(ctx, scan.Options{Tree: tree})
}

// runDiff implements `zu diff <base> [head] [-format text|markdown|json]
// [-worktree [-include-ignored]] [-max-parse-errors N] [-html file
// [-link-template T]]`: the Structural Summary of head against the
// merge-base of base and head, and optionally the Change View export.
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
	_, headCommit, err := gitResolve(ctx, top, headName)
	if err != nil {
		return bad("%v", err)
	}
	mb, err := gitMergeBase(ctx, top, baseCommit, headCommit)
	if err != nil {
		return bad("%v", err)
	}

	// One side at a time, so peak memory is two IRs, not two scans.
	// The trees stay open while -html needs to read changed files.
	baseDoc, baseTree, err := scanCommit(ctx, top, mb)
	if err != nil {
		return bad("base %s: %v", mb[:min(12, len(mb))], err)
	}
	defer baseTree.Close()
	if hopts.path == "" {
		_ = baseTree.Close()
	}
	baseDoc.Ref = ir.Ref{Commit: mb}
	var headDoc *ir.IR
	var headTree scan.Tree
	if *worktree {
		headDoc, headTree, err = scanWorktree(ctx, top, headCommit, *withIgnored)
	} else {
		var t *gitref.CommitTree
		headDoc, t, err = scanCommit(ctx, top, headCommit)
		if err == nil {
			defer t.Close()
			headDoc.Ref, headTree = ir.Ref{Commit: headCommit}, t
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
	if hopts.path != "" {
		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: headTree}
		if err := writeChangeHTML(ctx, c, s, &hopts, stderr); err != nil {
			return bad("html: %v", err)
		}
	}
	// Base's parse errors already exist on the base branch (B7): reported,
	// never failing the MR.
	if len(headDoc.ParseErrors) > *maxErrs {
		return ExitParseFailure
	}
	return ExitOK
}

// scanCommit scans one commit from git objects. On success the tree is left
// open for reading files, and the caller closes it.
func scanCommit(ctx context.Context, top, commit string) (*ir.IR, *gitref.CommitTree, error) {
	tree, err := openCommit(ctx, top, commit)
	if err != nil {
		return nil, nil, err
	}
	doc, _, err := scanTree(ctx, tree)
	if treeErr := tree.Err(); treeErr != nil {
		err = treeErr // the cause; a scan error would only be its symptom
	}
	if err != nil {
		_ = tree.Close()
		return nil, nil, err
	}
	return doc, tree, nil
}

// scanWorktree scans the files the next commit would contain, labelled as
// zu scan labels them.
func scanWorktree(ctx context.Context, top, head string, withIgnored bool) (*ir.IR, scan.Tree, error) {
	l, err := gitWorktree(ctx, top, withIgnored)
	if err != nil {
		return nil, nil, err
	}
	if l == nil {
		return nil, nil, fmt.Errorf("%s is not a git working tree", top)
	}
	tree, err := scan.ListTree(top, l.Files)
	if err != nil {
		return nil, nil, err
	}
	doc, _, err := scanTree(ctx, tree)
	if err != nil {
		return nil, nil, err
	}
	_, modified := gitHead(ctx, top)
	doc.Ref = ir.Ref{Commit: head, Dirty: modified || l.Extra}
	return doc, tree, nil
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
