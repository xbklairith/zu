package cli

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"

	"zu/internal/cover"
	"zu/internal/diff"
	"zu/internal/export"
	"zu/internal/gitref"
	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/scan"
	"zu/internal/version"
	"zu/web"
)

// Seams for tests: the built UI page and the repository facts links need.
var (
	uiTemplate  = builtTemplate
	gitOrigin   = gitref.Origin
	gitPrefix   = gitref.Prefix
	gitDiff     = gitref.Diff
	gitOnRemote = gitref.OnRemote
)

// listFlag collects a repeatable flag.
type listFlag []string

func (l *listFlag) String() string     { return strings.Join(*l, ",") }
func (l *listFlag) Set(s string) error { *l = append(*l, s); return nil }

type htmlOptions struct {
	path     string
	include  listFlag
	linkTmpl string
	cover    string        // -coverprofile (08)
	tmpl     []byte        // the UI page, loaded by prepare
	profile  cover.Profile // read by prepare; nil without -coverprofile
}

// prepare checks everything that does not need the IR, so a bad invocation
// fails before a scan that can take minutes.
func (o *htmlOptions) prepare() error {
	switch {
	case o.path == "":
		if len(o.include) > 0 || o.linkTmpl != "" {
			return errors.New("-include and -link-template need -html")
		}
		if o.cover != "" {
			return errors.New("-coverprofile needs -html")
		}
		return nil
	case o.path == "-":
		return errors.New("-html needs a file path")
	}
	return o.load()
}

// load checks the patterns and the link template, and loads the UI page and
// the coverprofile: everything a View needs besides the scan.
func (o *htmlOptions) load() error {
	for _, s := range o.include {
		if _, err := export.ParsePattern(s, "root.invalid"); err != nil { // syntax only
			return err
		}
	}
	if _, err := export.ForRepo("", ir.Ref{}, o.linkTmpl, ""); err != nil { // validates the template
		return err
	}
	tmpl, err := uiTemplate()
	if err != nil {
		return fmt.Errorf("html: %w", err)
	}
	o.tmpl = tmpl
	if o.cover != "" {
		if o.profile, err = readProfile(o.cover); err != nil {
			return fmt.Errorf("-coverprofile %s: %w", o.cover, err)
		}
	}
	return nil
}

// readProfile reads the coverprofile the user named. Like -out it may be
// anywhere. It must be a regular file, checked before it is opened: opening
// a FIFO blocks until something writes to it, and a device never ends.
func readProfile(name string) (cover.Profile, error) {
	fi, err := os.Stat(name)
	if err != nil {
		return nil, pathless(err)
	}
	if !fi.Mode().IsRegular() {
		return nil, errors.New("not a regular file")
	}
	f, err := os.Open(name)
	if err != nil {
		return nil, pathless(err)
	}
	defer f.Close()
	if fi, err = f.Stat(); err != nil {
		return nil, err
	}
	if !fi.Mode().IsRegular() { // replaced since the Stat
		return nil, errors.New("not a regular file")
	}
	return cover.Parse(f)
}

// pathless drops the path from an *fs.PathError: the message names it once.
func pathless(err error) error {
	var pe *fs.PathError
	if errors.As(err, &pe) {
		return pe.Err
	}
	return err
}

// addMetrics draws CRAP when prepare read a profile, and says how much of
// the scan it covers: a profile from another tree covers little, and one
// from another revision puts blocks where no function is.
func addMetrics(cmd string, v *export.View, ms scan.Measures, o *htmlOptions, stderr io.Writer) {
	if o.profile == nil {
		return
	}
	unmatched := export.AddMetrics(v, ms, o.profile)
	funcs, missing := 0, 0
	for _, p := range v.Metrics.Packages {
		funcs, missing = funcs+p.Funcs, missing+p.Missing
	}
	fmt.Fprintf(stderr, "zu %s: CRAP: coverage for %d of %d functions\n", cmd, funcs-missing, funcs)
	switch {
	case unmatched == 1:
		fmt.Fprintf(stderr, "zu %s: CRAP: 1 profile block matches no function: profile may be from another revision\n", cmd)
	case unmatched > 1:
		fmt.Fprintf(stderr, "zu %s: CRAP: %d profile blocks match no function: profile may be from another revision\n", cmd, unmatched)
	}
}

// warnUncommitted says when the profile is matched to a commit while the
// working tree, where go test runs, has uncommitted changes.
func warnUncommitted(ctx context.Context, cmd, top, fix string, o *htmlOptions, stderr io.Writer) {
	if o.profile == nil {
		return
	}
	if _, dirty := gitHead(ctx, top); dirty {
		fmt.Fprintf(stderr, "zu %s: CRAP: the working tree has uncommitted changes; if go test ran on them, %s\n", cmd, fix)
	}
}

func builtTemplate() ([]byte, error) {
	assets, err := web.Assets()
	if err != nil {
		return nil, err
	}
	b, err := fs.ReadFile(assets, "index.html")
	if errors.Is(err, fs.ErrNotExist) || err == nil && !export.HasMarker(b) {
		return nil, errors.New("this zu was built without the UI; build it with make build")
	}
	return b, err
}

// writeHTML writes the Project View export of doc (already sorted by
// ir.Encode) as the Policy draws it, reading source through the tree the
// scan read.
func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, stderr io.Writer) error {
	v, err := projectView(ctx, "scan", src, doc, pol, ms, o, stderr)
	if err != nil {
		return err
	}
	return renderView("scan", v, o, stderr)
}

// projectView builds the Project View of doc, which must be sorted, for zu
// scan -html and zu serve alike.
func projectView(ctx context.Context, cmd string, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures, o *htmlOptions, stderr io.Writer) (*export.View, error) {
	root := export.RootModule(doc)
	pats := make([]export.Pattern, 0, len(o.include))
	for _, s := range o.include {
		p, err := export.ParsePattern(s, root)
		if err != nil {
			return nil, err
		}
		pats = append(pats, p)
	}
	v, err := export.Project(pol.Apply(doc), pats, src.tree.ReadFile)
	if err != nil {
		return nil, err
	}
	export.Mark(v, pol, doc)
	addMetrics(cmd, v, ms, o, stderr)
	if src.ref != nil {
		warnUncommitted(ctx, cmd, src.root, "drop -ref", o, stderr)
	}
	v.Tool = version.Version
	prefix := "" // a -ref scan runs at the repository top
	if src.ref == nil {
		prefix = gitPrefix(ctx, src.root)
	}
	if v.Links, err = export.ForRepo(gitOrigin(ctx, src.root), doc.Ref, o.linkTmpl, prefix); err != nil {
		return nil, err
	}
	return v, nil
}

// changeSides are the two scanned sides of zu diff, trees still open.
type changeSides struct {
	top                string
	base, head         *ir.IR
	baseTree, headTree scan.Tree
	pol                *policy.Policy // head's, which the hash check proved is base's
	measures           scan.Measures  // head's (08)
	delta              diff.Delta     // diff.Compare(base, head), computed once (14)
}

// writeChangeHTML writes the Change View export of base → head.
func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) error {
	v, err := changeView(ctx, "diff", c, sum, o, stderr)
	if err != nil {
		return err
	}
	return renderView("diff", v, o, stderr)
}

// changeView builds the Change View of base → head, for zu diff -html and
// zu serve -base alike. Links point at head, and, when both sides are clean
// commits, at the host's compare page: each changed file and declaration at
// its place there (14). The base side always links to the base commit.
func changeView(ctx context.Context, cmd string, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) (*export.View, error) {
	base, head, d := c.base, c.head, c.delta
	violations := sum.Violations
	if c.pol.Lens() {
		// The View draws both sides as the Policy does, so its changed list
		// must come from the same IRs; the printed Summary stays whole.
		base, head = c.pol.Apply(base), c.pol.Apply(head)
		d = diff.Compare(base, head)
		sum = diff.SummarizeDelta(base, head, d)
	}
	v, err := export.Change(base, head, d, sum, c.baseTree, c.headTree)
	if err != nil {
		return nil, err
	}
	export.Mark(v, c.pol, c.head)
	addMetrics(cmd, v, c.measures, o, stderr)
	if _, commit := c.headTree.(*gitref.CommitTree); commit {
		warnUncommitted(ctx, cmd, c.top, "add -worktree", o, stderr)
	}
	v.Violations = violations
	for _, t := range []scan.Tree{c.baseTree, c.headTree} {
		if ct, ok := t.(*gitref.CommitTree); ok && ct.Err() != nil {
			return nil, ct.Err()
		}
	}
	v.Tool = version.Version
	origin := gitOrigin(ctx, c.top) // both sides are scanned at the repository top
	baseRef, headRef := c.base.Ref, c.head.Ref
	if o.linkTmpl == "" && export.Hosted(origin) {
		// The host shows only what was pushed: a commit no remote-tracking
		// ref holds gets no host link yet (14). -link-template is trusted.
		baseRef, headRef = onHost(ctx, cmd, c.top, baseRef, stderr), onHost(ctx, cmd, c.top, headRef, stderr)
	}
	if v.Links, err = export.ForRepo(origin, headRef, o.linkTmpl, ""); err != nil {
		return nil, err
	}
	if cmp := export.CompareURL(origin, baseRef, headRef); cmp != "" {
		if v.Links == nil {
			v.Links = &export.Links{}
		}
		v.Links.Compare = cmp
		// Link lines come from git's own diff of the two commits, the one
		// the compare page shows, not from zu's hunks (14).
		files, err := gitDiff(ctx, c.top, baseRef.Commit, headRef.Commit)
		switch {
		case err == nil:
			export.DiffLinks(v, origin, hostFiles(files), c.measures)
		case ctx.Err() != nil:
			return nil, ctx.Err()
		default:
			// The View does not depend on git diff: without it, each
			// changed declaration links to its file's diff.
			fmt.Fprintf(stderr, "zu %s: note: git diff failed (%v); host links point at each file's diff\n", cmd, err)
			export.DiffLinks(v, origin, fileOnly(v), c.measures)
		}
	}
	if b := export.BaseBlob(origin, baseRef, o.linkTmpl); b != "" {
		if v.Links == nil {
			v.Links = &export.Links{}
		}
		v.Links.Base = b
	}
	return v, nil
}

// onHost is r, or no commit when r is a clean commit that no remote-tracking
// ref holds; zu diff says why its links are missing.
func onHost(ctx context.Context, cmd, top string, r ir.Ref, stderr io.Writer) ir.Ref {
	if r.Commit == "" || r.Dirty || gitOnRemote(ctx, top, r.Commit) {
		return r
	}
	if cmd == "diff" {
		fmt.Fprintf(stderr, "zu diff: note: %s is on no remote-tracking ref; its host links are left out until it is pushed and fetched\n", r.Commit[:min(12, len(r.Commit))])
	}
	return ir.Ref{}
}

// fileOnly is one HostFile without hunks for each file the View has hunks
// for, so DiffLinks gives files and declarations their file anchor only.
func fileOnly(v *export.View) []export.HostFile {
	out := make([]export.HostFile, 0, len(v.Hunks))
	for p := range v.Hunks {
		out = append(out, export.HostFile{Path: p, OldPath: p})
	}
	return out
}

// hostFiles converts git's per-file diff for export.
func hostFiles(files []gitref.FileDiff) []export.HostFile {
	out := make([]export.HostFile, len(files))
	for i, f := range files {
		hs := make([]export.Hunk, len(f.Hunks))
		for j, h := range f.Hunks {
			hs[j] = export.Hunk{BaseStart: h.BaseStart, BaseLines: h.BaseLines, HeadStart: h.HeadStart, HeadLines: h.HeadLines, Lines: h.Lines}
		}
		out[i] = export.HostFile{Path: f.Path, OldPath: f.OldPath, Hunks: hs}
	}
	return out
}

// renderView writes v into the UI page at o.path and says what it inlined.
func renderView(cmd string, v *export.View, o *htmlOptions, stderr io.Writer) error {
	var buf bytes.Buffer
	if err := export.Render(&buf, o.tmpl, v); err != nil {
		return err
	}
	if err := writeAtomic(o.path, buf.Bytes()); err != nil {
		return err
	}
	fmt.Fprintf(stderr, "zu %s: html → %s (%d source files inlined; share it only where that code may go)\n",
		cmd, o.path, len(v.Sources))
	return nil
}
