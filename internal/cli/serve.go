package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"zu/internal/export"
	"zu/internal/ir"
	"zu/internal/scan"
	"zu/internal/serve"
)

// runServe implements `zu serve [dir] [-addr host:port] [-include pattern]…
// [-link-template url] [-coverprofile file]` (10): the Project View of the
// working tree, on a loopback address, until interrupted. Every load of the
// page rescans the tree, parsing only the files whose content changed.
// Flags may come before or after dir. It writes nothing to disk.
func runServe(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("zu serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	addr := fs.String("addr", "", "listen on `host:port`, a loopback address (default "+serve.DefaultAddr+", or a free port when that is taken)")
	var o htmlOptions
	fs.Var(&o.include, "include", "inline declarations and source of packages matching `pattern` (repeatable; ./ = root module)")
	fs.StringVar(&o.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
	fs.StringVar(&o.cover, "coverprofile", "", "colour packages by CRAP from `file`, written by go test -coverprofile over this tree; read once, at start")
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

	ctx, stop := interruptContext()
	defer stop()
	s := &session{dir: dir, o: &o, cache: scan.NewCache(), stderr: stderr}
	if _, err := s.view(ctx); err != nil { // a tree zu cannot scan fails here, not in the page
		return bad(err)
	}
	srv := newServer(serve.Handler(page, s.view))
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
// an idle connection open.
func newServer(h http.Handler) *http.Server {
	return &http.Server{Handler: h, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
}

// session is one zu serve: its options, and the Cache its rescans share.
type session struct {
	mu     sync.Mutex // one rescan at a time
	dir    string
	o      *htmlOptions
	cache  *scan.Cache
	stderr io.Writer
	// scanning, when set, runs while a rescan holds mu (a test seam).
	scanning func()
}

// view rescans the working tree under its Policy, as zu scan does, and
// returns the Project View JSON that zu scan -html would inline.
func (s *session) view(ctx context.Context) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.scanning != nil {
		s.scanning()
	}
	start := time.Now()
	src, err := openSource(ctx, s.dir, "", false)
	if err != nil {
		return nil, err
	}
	defer src.close()
	pol, err := loadPolicy(src.tree)
	if err != nil {
		return nil, err
	}
	doc, stats, err := scan.Run(ctx, scan.Options{Tree: src.tree, Exclude: pol.Excluded, PolicyHash: pol.Hash(), Cache: s.cache})
	if err != nil {
		return nil, err
	}
	doc.Ref.Commit, doc.Ref.Dirty = gitHead(ctx, src.root)
	doc.Ref.Dirty = doc.Ref.Commit != "" && (doc.Ref.Dirty || src.extra)
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	ir.Sort(doc) // as ir.Encode does before zu scan -html builds its View
	v, err := projectView(ctx, "serve", src, doc, pol, stats.Measures, s.o, s.stderr)
	if err != nil {
		return nil, err
	}
	data, err := export.Marshal(v)
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(s.stderr, "zu serve: scanned in %v: %d packages, %d files, %d parsed, %d parse errors\n",
		time.Since(start).Round(time.Millisecond), stats.Packages, stats.Files, stats.Parsed, stats.ParseErrors)
	return data, nil
}
