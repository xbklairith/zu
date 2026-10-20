package cli

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"zu/internal/export"
	"zu/internal/gitref"
	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/scan"
	"zu/internal/serve"
)

// runServe implements `zu serve [dir] [-addr host:port] [-include pattern]…
// [-link-template url] [-coverprofile file] [-poll interval] [-base ref [-mr N]]`
// (10): the Project View of the working tree, on a loopback address, until
// interrupted, or with -base (14) the Change View zu diff ref -worktree
// -html writes. Every load of the page rescans the tree, parsing only the
// files whose content changed. Without -include the Project View draws
// every package's declarations, and the page reads their source on demand
// (19). Flags may come before or after dir. It writes nothing to disk.
func runServe(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("zu serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	addr := fs.String("addr", "", "listen on `host:port`, a loopback address (default "+serve.DefaultAddr+", or a free port when that is taken)")
	var o htmlOptions
	fs.Var(&o.include, "include", "draw only the declarations of packages matching `pattern`, their source inlined, as zu scan -html does (repeatable; ./ = root module); without it, every package's, up to "+strconv.Itoa(detailBudget)+" declarations")
	fs.StringVar(&o.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
	fs.StringVar(&o.cover, "coverprofile", "", "colour packages by CRAP from `file`, written by go test -coverprofile over this tree; read once, at start")
	poll := fs.Duration("poll", time.Second, "look for changes every `interval` and redraw the open page; 0: never")
	fs.Func("mr", "with -base, link diffs to merge request `N`'s page, not the compare page", o.setMR)
	base := fs.String("base", "", "show the Change View of the working tree against the merge-base of `ref` and HEAD, as zu diff ref -worktree -html")
	dir, err := parseWithDir(fs, args)
	if err != nil {
		if !errors.Is(err, flag.ErrHelp) {
			fmt.Fprintf(stderr, "zu serve: %v\n", err)
		}
		return ExitBadInvocation
	}
	bad := func(err error) int {
		fmt.Fprintf(stderr, "zu serve: %v\n", err)
		return ExitBadInvocation
	}
	if *poll < 0 || *poll > 0 && *poll < minPoll {
		return bad(fmt.Errorf("-poll %v: want 0 (off) or at least %v", *poll, minPoll))
	}
	ctx, stop := interruptContext()
	defer stop()
	if *base != "" {
		if len(o.include) > 0 {
			return bad(errors.New("-include does not apply with -base: the change decides what the page inlines"))
		}
		top, _, err := gitResolve(ctx, dir, *base)
		if err != nil {
			return bad(fmt.Errorf("-base: %w", err))
		}
		dir = top // the working tree zu diff -worktree reads
		if err := o.checkMR(ctx, top); err != nil {
			return bad(err)
		}
	} else if o.mr > 0 {
		return bad(errors.New("-mr needs -base: only a Change View links diffs"))
	}
	if err := o.load(); err != nil {
		return bad(err)
	}
	page, err := export.LivePage(o.tmpl)
	if err != nil {
		return bad(err)
	}
	ln, err := serve.Listen(*addr)
	if err != nil {
		return bad(fmt.Errorf("-addr: %w", err))
	}
	defer ln.Close()
	if *addr == "" && ln.Addr().String() != serve.DefaultAddr {
		fmt.Fprintf(stderr, "zu serve: %s is in use; serving on a free port\n", serve.DefaultAddr)
	}

	s := &session{dir: dir, base: *base, o: &o, cache: scan.NewCache(), stderr: stderr}
	first, _, err := s.view(ctx)
	if err != nil { // a tree zu cannot scan fails here, not in the page
		return bad(err)
	}
	var hub *serve.Hub
	if *poll > 0 {
		hub = serve.NewHub(first)
		s.hub = hub
	}
	srv := newServer(serve.Handler(page, serve.Views{Scan: s.view, Hub: hub, Source: s.source}))
	if hub != nil {
		srv.RegisterOnShutdown(hub.Close) // open streams end, so Shutdown need not wait them out
		wctx, stopWatch := context.WithCancel(ctx)
		var watching sync.WaitGroup
		watching.Add(1)
		go func() {
			defer watching.Done()
			s.watch(wctx, *poll)
		}()
		defer func() {
			stopWatch()
			watching.Wait()
		}()
	}
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ln) }()
	fmt.Fprintf(stdout, "http://%s/\n", ln.Addr())
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
		return ExitOK
	case err := <-done:
		return bad(err)
	}
}

// newServer bounds how long a client may take to send its headers and keep
// an idle connection open. It sets no WriteTimeout: one would cut 13's
// /events stream, which stays open while the page does.
func newServer(h http.Handler) *http.Server {
	return &http.Server{Handler: h, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
}

// detailBudget is the most declarations zu serve draws without -include
// (19): past it the page draws packages only, as a big View is slow to
// send, parse and lay out (kubernetes, at 107,196, would weigh 61 MB).
var detailBudget = 20000

// session is one zu serve: its options, and the Cache its rescans share.
type session struct {
	mu     sync.Mutex // one rescan at a time
	dir    string
	o      *htmlOptions
	cache  *scan.Cache
	stderr io.Writer
	// base is -base's ref (14); baseDoc, guarded by mu, is the IR of the
	// merge-base last scanned, under the Policy whose hash it carries.
	base    string
	baseDoc *ir.IR
	// scanning, when set, runs while a rescan holds mu (a test seam).
	scanning func()

	// The watch (13), guarded by mu. hub is nil with -poll 0.
	hub    *serve.Hub
	begun  bool            // the first scan ran: the fields below are set
	git    bool            // the tree is a git working tree
	seen   *gitref.Listing // what the first scan listed; nil outside git
	first  scan.Tree       // the first scan's tree, which knows each listed file's Stamp
	policy scan.Stamp      // the Policy's, taken before the first scan read it
	errs   map[string]bool // the paths with parse errors in the View hub holds
	commit string          // the commit of the View hub holds

	// scans counts page loads' scans; polledAt is scans when the watch
	// last began a poll. When they differ, a page load may have listed a
	// file the watch's listing lacks.
	scans, polledAt atomic.Int64

	// files is what /source sends (19): the files the last page load's
	// scan, or the watch's last rescan the page draws, declares a package,
	// type or function in. A rescan the watch keeps from the page changes
	// nothing: the page still draws what is declared there. overBudget,
	// guarded by mu, is set once zu serve has said the tree is past
	// detailBudget.
	files      atomic.Pointer[map[string]bool]
	overBudget bool
}

// every says whether the Project View draws every package's declarations
// (19): without -include, while doc, as the Policy draws it, holds at most
// detailBudget of them. The first time it is past, zu serve says so.
func (s *session) every(doc *ir.IR) bool {
	if len(s.o.include) > 0 {
		return false
	}
	n := 0
	for i := range doc.Nodes {
		if k := doc.Nodes[i].Kind; k == ir.KindType || k == ir.KindFunction {
			n++
		}
	}
	if n <= detailBudget {
		return true
	}
	if !s.overBudget {
		s.overBudget = true
		fmt.Fprintf(s.stderr, "zu serve: %d declarations, more than %d: the page draws packages only; -include picks the packages to draw\n", n, detailBudget)
	}
	return false
}

// source answers GET /source (19): the file at path in the tree as it is
// now, with its Syntax, if the last scan declares something in it; else
// fs.ErrNotExist. It takes no lock, so a rescan does not hold it up.
func (s *session) source(path string) ([]byte, error) {
	files := s.files.Load()
	if files == nil || !(*files)[path] || !filepath.IsLocal(filepath.FromSlash(path)) {
		return nil, fs.ErrNotExist
	}
	tree, err := scan.DirTree(s.dir)
	if err != nil {
		return nil, err
	}
	b, err := tree.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return json.Marshal(export.SourceFile{Path: path, Text: string(b), Syntax: export.Syntax(b)})
}

// declared is the files doc declares a package, type or function in.
func declared(doc *ir.IR) map[string]bool {
	out := map[string]bool{}
	for i := range doc.Nodes {
		if doc.Nodes[i].Kind == ir.KindExternal {
			continue
		}
		for _, l := range doc.Nodes[i].Locations {
			out[l.Path] = true
		}
	}
	return out
}

// view rescans the working tree under its Policy, as zu scan does, and
// returns the Project View JSON that zu scan -html would inline, and the
// generation of the watch's latest View (0 without a watch), read under mu:
// the View returned is at least that new. It reads and hashes every file,
// as a page load always has (10 Deviation 3).
func (s *session) view(ctx context.Context) ([]byte, uint64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.scanning != nil {
		s.scanning()
	}
	if !s.begun {
		fi, _ := os.Lstat(filepath.Join(s.dir, policy.FileName))
		s.policy = scan.StampOf(fi)
	}
	src, err := openSource(ctx, s.dir, "", false)
	if err != nil {
		return nil, 0, err
	}
	defer src.close()
	s.scans.Add(1)
	data, doc, err := s.build(ctx, src, false, "")
	if err != nil {
		return nil, 0, err
	}
	if !s.begun {
		s.begun, s.git, s.seen, s.first = true, src.listing != nil, src.listing, src.tree
		s.errs, s.commit = errPaths(doc), doc.Ref.Commit
	}
	files := declared(doc)
	// While a file does not parse the watch keeps its drawing (changed),
	// whose files pages still read: a page load adds its own to them.
	if old := s.files.Load(); old != nil && newParseErrors(s.errs, doc) != "" && doc.Ref.Commit == s.commit {
		maps.Copy(files, *old)
	}
	s.files.Store(&files)
	var gen uint64
	if s.hub != nil {
		_, gen, _ = s.hub.Latest()
	}
	return data, gen, nil
}

// build scans src under its Policy and returns the View JSON (viewOf) and the
// IR it came from. With trust the Cache trusts each file's Stamp (13's
// watch). HEAD is read beside the scan, off its path (10
// rescan-profile, fix 2). what prefixes the stderr line.
func (s *session) build(ctx context.Context, src *source, trust bool, what string) ([]byte, *ir.IR, error) {
	start := time.Now()
	pol, err := loadPolicy(src.tree)
	if err != nil {
		return nil, nil, err
	}
	type head struct {
		commit string
		dirty  bool
	}
	heads := make(chan head, 1)
	go func() {
		c, d := gitHead(ctx, src.root)
		heads <- head{c, d}
	}()
	doc, stats, err := scan.Run(ctx, scan.Options{Tree: src.tree, Exclude: pol.Excluded, PolicyHash: pol.Hash(), Cache: s.cache, TrustStamps: trust})
	h := <-heads
	if err != nil {
		return nil, nil, err
	}
	doc.Ref.Commit = h.commit
	doc.Ref.Dirty = h.commit != "" && (h.dirty || src.extra)
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	ir.Sort(doc) // as ir.Encode does before zu scan -html builds its View
	v, err := s.viewOf(ctx, src, doc, pol, stats.Measures)
	if err != nil {
		return nil, nil, err
	}
	data, err := export.Marshal(v)
	if err != nil {
		return nil, nil, err
	}
	fmt.Fprintf(s.stderr, "zu serve: %sscanned in %v: %d packages, %d files, %d parsed, %d parse errors\n",
		what, time.Since(start).Round(time.Millisecond), stats.Packages, stats.Files, stats.Parsed, stats.ParseErrors)
	return data, doc, nil
}
