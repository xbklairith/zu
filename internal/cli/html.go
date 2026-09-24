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
	uiTemplate = builtTemplate
	gitOrigin  = gitref.Origin
	gitPrefix  = gitref.Prefix
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
	root := export.RootModule(doc)
	pats := make([]export.Pattern, 0, len(o.include))
	for _, s := range o.include {
		p, err := export.ParsePattern(s, root)
		if err != nil {
			return err
		}
		pats = append(pats, p)
	}
	v, err := export.Project(pol.Apply(doc), pats, src.tree.ReadFile)
	if err != nil {
		return err
	}
	export.Mark(v, pol, doc)
	addMetrics("scan", v, ms, o, stderr)
	if src.ref != nil {
		warnUncommitted(ctx, "scan", src.root, "drop -ref", o, stderr)
	}
	v.Tool = version.Version
	prefix := "" // a -ref scan runs at the repository top
	if src.ref == nil {
		prefix = gitPrefix(ctx, src.root)
	}
	if v.Links, err = export.ForRepo(gitOrigin(ctx, src.root), doc.Ref, o.linkTmpl, prefix); err != nil {
		return err
	}
	return renderView("scan", v, o, stderr)
}

// changeSides are the two scanned sides of zu diff, trees still open.
type changeSides struct {
	top                string
	base, head         *ir.IR
	baseTree, headTree scan.Tree
	pol                *policy.Policy // head's, which the hash check proved is base's
}

// writeChangeHTML writes the Change View export of base → head. Links point at
// head, and at the host's compare page when both sides are clean commits.
func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) error {
	base, head := c.base, c.head
	violations := sum.Violations
	if c.pol.Lens() {
		// The View draws both sides as the Policy does, so its changed list
		// must come from the same IRs; the printed Summary stays whole.
		base, head = c.pol.Apply(base), c.pol.Apply(head)
		sum = diff.Summarize(base, head)
	}
	v, err := export.Change(base, head, diff.Compare(base, head), sum, c.baseTree, c.headTree)
	if err != nil {
		return err
	}
	export.Mark(v, c.pol, c.head)
	v.Violations = violations
	for _, t := range []scan.Tree{c.baseTree, c.headTree} {
		if ct, ok := t.(*gitref.CommitTree); ok && ct.Err() != nil {
			return ct.Err()
		}
	}
	v.Tool = version.Version
	origin := gitOrigin(ctx, c.top) // diff always runs at the repository top
	if v.Links, err = export.ForRepo(origin, c.head.Ref, o.linkTmpl, ""); err != nil {
		return err
	}
	if cmp := export.CompareURL(origin, c.base.Ref, c.head.Ref); cmp != "" {
		if v.Links == nil {
			v.Links = &export.Links{}
		}
		v.Links.Compare = cmp
	}
	return renderView("diff", v, o, stderr)
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
