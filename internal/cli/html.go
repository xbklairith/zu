package cli

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"strings"

	"zu/internal/export"
	"zu/internal/gitref"
	"zu/internal/ir"
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
	tmpl     []byte // the UI page, loaded by prepare
}

// prepare checks everything that does not need the IR, so a bad invocation
// fails before a scan that can take minutes.
func (o *htmlOptions) prepare() error {
	switch {
	case o.path == "":
		if len(o.include) > 0 || o.linkTmpl != "" {
			return errors.New("-include and -link-template need -html")
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
	return nil
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
// ir.Encode), reading source through the tree the scan read.
func writeHTML(ctx context.Context, src *source, doc *ir.IR, o *htmlOptions, stderr io.Writer) error {
	root := export.RootModule(doc)
	pats := make([]export.Pattern, 0, len(o.include))
	for _, s := range o.include {
		p, err := export.ParsePattern(s, root)
		if err != nil {
			return err
		}
		pats = append(pats, p)
	}
	v, err := export.Project(doc, pats, src.tree.ReadFile)
	if err != nil {
		return err
	}
	v.Tool = version.Version
	prefix := "" // a -ref scan runs at the repository top
	if src.ref == nil {
		prefix = gitPrefix(ctx, src.root)
	}
	if v.Links, err = export.ForRepo(gitOrigin(ctx, src.root), doc.Ref, o.linkTmpl, prefix); err != nil {
		return err
	}
	var buf bytes.Buffer
	if err := export.Render(&buf, o.tmpl, v); err != nil {
		return err
	}
	if err := writeAtomic(o.path, buf.Bytes()); err != nil {
		return err
	}
	fmt.Fprintf(stderr, "zu scan: html → %s (%d source files inlined; share it only where that code may go)\n",
		o.path, len(v.Sources))
	return nil
}
