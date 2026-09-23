// Package scan parses a Go source tree into the IR. It reads only files
// through a Tree, runs no processes, and opens no network connections.
package scan

import (
	"context"
	"runtime"
	"sync"

	"zu/internal/ir"
)

// DefaultPolicyHash identifies the built-in empty Policy: the Package Tree
// with no Levels, Proposals or overrides (decision 0008).
var DefaultPolicyHash = "sha256:" + hashBytes([]byte("{}\n"))

// Options configure a scan.
type Options struct {
	Tree    Tree // what to scan: DirTree, or a commit read from git
	Workers int  // parallel parsers; 0 means GOMAXPROCS
}

// Stats summarise a scan for the one-line report.
type Stats struct {
	Packages        int
	Files           int // Go files parsed, excluding build-ignored ones
	ParseErrors     int
	UnresolvedCalls int
}

// Run scans opts.Tree. The result is unsorted; ir.Encode canonicalises it.
// It fails only when the tree is unusable or ctx is cancelled; unparseable
// files are recorded in the IR instead.
func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
	w, err := walkTree(opts.Tree)
	if err != nil {
		return nil, Stats{}, err
	}
	facts, err := extractAll(ctx, opts.Tree, w, opts.Workers)
	if err != nil {
		return nil, Stats{}, err
	}
	doc := assemble(w, facts)
	doc.Grouping = "tree"
	doc.PolicyHash = DefaultPolicyHash

	st := Stats{ParseErrors: len(doc.ParseErrors)}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindPackage {
			st.Packages++
		}
	}
	for _, f := range facts {
		if !f.Skip && f.Err == nil {
			st.Files++
		}
	}
	for _, c := range doc.UnresolvedCalls {
		st.UnresolvedCalls += c
	}
	return doc, st, nil
}

// extractAll parses every file in parallel. Each worker writes only its own
// slot, so the result order is the sorted file order regardless of timing.
func extractAll(ctx context.Context, t Tree, w *walkResult, workers int) ([]*fileFacts, error) {
	if workers <= 0 {
		workers = runtime.GOMAXPROCS(0)
	}
	facts := make([]*fileFacts, len(w.Files))
	next := make(chan int)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range next {
				facts[i] = extractFile(t, w.Files[i])
			}
		}()
	}
	var err error
feed:
	for i := range w.Files {
		select {
		case next <- i:
		case <-ctx.Done():
			err = ctx.Err()
			break feed
		}
	}
	close(next)
	wg.Wait()
	if err == nil {
		err = ctx.Err()
	}
	return facts, err
}
