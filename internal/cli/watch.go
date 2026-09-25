package cli

import (
	"bytes"
	"context"
	"fmt"
	"path"
	"strings"
	"time"

	"zu/internal/gitref"
	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/scan"
	"zu/internal/watch"
)

// minPoll is the shortest -poll: one poll of kubernetes takes about 20 ms.
const minPoll = 100 * time.Millisecond

// gitMeta is a seam like gitHead: the git files a watch polls.
var gitMeta = gitref.Meta

// watch polls the working tree every interval until ctx ends, rescans once
// per change and pushes the result to the page (13). It starts from what
// the first scan listed, and the Stamp it saw of each file and the Policy. Outside git
// that scan kept neither: the first poll finds every file changed and
// rescans once.
func (s *session) watch(ctx context.Context, every time.Duration) {
	s.mu.Lock()
	start, first, pol := &watch.Listing{}, s.first, s.policy
	if s.seen != nil {
		start = &watch.Listing{Files: s.seen.Files, Extra: s.seen.Extra}
	}
	s.mu.Unlock()
	if start.Files == nil {
		if l, err := watch.Walk(s.dir); err == nil {
			start = l
		}
	}
	w := &watch.Watcher{
		Root:    s.dir,
		Meta:    func(ctx context.Context) []string { return gitMeta(ctx, s.dir) },
		Always:  []string{policy.FileName}, // read whether or not git ignores it
		Matters: rescanReads,
		List:    s.list,
		Kept: func(rel string) scan.Stamp {
			if st := scan.StampIn(first, rel); st != (scan.Stamp{}) || rel != policy.FileName {
				return st
			}
			return pol
		},
		Polling: s.polling,
		Every:   every,
		Quiet:   max(every/5, 50*time.Millisecond),
	}
	_ = w.Run(ctx, start, s.changed)
}

// polling notes that the watch begins a poll: a page load's scan after it
// may list what the watch's listing lacks.
func (s *session) polling() { s.polledAt.Store(s.scans.Load()) }

// rescanReads reports whether a rescan reads rel's content: a Go file other
// than a test, a go.mod, or the Policy.
func rescanReads(rel string) bool {
	name := path.Base(rel)
	return name == "go.mod" || rel == policy.FileName ||
		strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go")
}

// list lists the working tree as zu scan does.
func (s *session) list(ctx context.Context) (*watch.Listing, error) {
	if !s.git {
		return watch.Walk(s.dir)
	}
	g, err := gitWorktree(ctx, s.dir, false)
	if err != nil {
		return nil, err
	}
	if g == nil {
		return nil, fmt.Errorf("%s is no longer a git working tree", s.dir)
	}
	return &watch.Listing{Files: g.Files, Extra: g.Extra}, nil
}

// changed rescans after the watch saw a change and pushes the View, unless
// the rescan failed or, at the same commit, a file that parsed in the
// pushed View no longer does: then the page keeps its drawing and shows
// why. If a page load scanned since the watch began its poll, it lists the
// tree again first: the page may already draw a file l lacks.
func (s *session) changed(ctx context.Context, l *watch.Listing) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.scanning != nil {
		s.scanning()
	}
	var src *source
	var err error
	if s.git {
		if s.scans.Load() != s.polledAt.Load() {
			l, err = s.list(ctx)
		}
		var tree scan.Tree
		if err == nil {
			tree, err = scan.ListTree(s.dir, l.Files)
		}
		if err == nil {
			src = &source{tree: tree, root: s.dir, extra: l.Extra, err: func() error { return nil }, close: func() {}}
		}
	} else {
		src, err = openSource(ctx, s.dir, "", false) // outside git, as a page load does
	}
	var data []byte
	var doc *ir.IR
	if err == nil {
		defer src.close()
		data, doc, err = s.build(ctx, src, s.git, "watch: ")
	}
	switch {
	case ctx.Err() != nil:
		return
	case err != nil:
		fmt.Fprintf(s.stderr, "zu serve: watch: rescan failed: %v; the page keeps its drawing\n", err)
		s.hub.Notify("rescan failed: " + err.Error())
		return
	}
	if broken := newParseErrors(s.errs, doc); broken != "" && doc.Ref.Commit == s.commit {
		fmt.Fprintf(s.stderr, "zu serve: watch: %s; the page keeps its drawing\n", broken)
		s.hub.Notify(broken)
		return
	}
	s.errs, s.commit = errPaths(doc), doc.Ref.Commit
	if last, _, _ := s.hub.Latest(); bytes.Equal(last, data) {
		s.hub.Notify("")
		return
	}
	s.hub.Publish(data)
}

// errPaths is the set of paths with parse errors in doc.
func errPaths(doc *ir.IR) map[string]bool {
	m := map[string]bool{}
	for _, e := range doc.ParseErrors {
		m[e.Path] = true
	}
	return m
}

// newParseErrors describes doc's first parse error in a path had lacks, and
// how many more there are; "" when there is none.
func newParseErrors(had map[string]bool, doc *ir.IR) string {
	var fresh []ir.ParseError
	for _, e := range doc.ParseErrors {
		if !had[e.Path] {
			fresh = append(fresh, e)
		}
	}
	if len(fresh) == 0 {
		return ""
	}
	msg := fresh[0].Message
	if !strings.HasPrefix(msg, fresh[0].Path+":") {
		msg = fresh[0].Path + ": " + msg
	}
	if len(fresh) > 1 {
		msg += fmt.Sprintf(" (and %d more)", len(fresh)-1)
	}
	return msg
}
