package gitref

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// Listing is the set of files a working-tree scan reads.
type Listing struct {
	// Files are slash paths relative to the listed directory, sorted: the
	// files the next commit would contain (tracked and untracked, not
	// ignored), plus ignored files when asked. Tracked files deleted from
	// disk are left out.
	Files []string
	// Extra is true when Files holds an untracked or ignored file outside
	// the directories the scanner prunes: the scan then differs from HEAD
	// even if no tracked file is modified.
	Extra bool
}

// WorktreeFiles lists the files under dir that a scan of the working tree
// reads. It returns nil, nil outside a git work tree or without git: the
// caller then scans the directory as it is.
func WorktreeFiles(ctx context.Context, dir string, includeIgnored bool) (*Listing, error) {
	if out, err := git(ctx, dir, "rev-parse", "--is-inside-work-tree"); err != nil || strings.TrimSpace(out) != "true" {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, nil
	}
	tracked, err := lsFiles(ctx, dir, "--cached")
	if err != nil {
		return nil, err
	}
	others, err := lsFiles(ctx, dir, "--others", "--exclude-standard")
	if err != nil {
		return nil, err
	}
	if includeIgnored {
		ignored, err := lsFiles(ctx, dir, "--others", "--ignored", "--exclude-standard")
		if err != nil {
			return nil, err
		}
		others = append(others, ignored...)
	}
	l := &Listing{}
	present := func(p string) bool {
		// Nested repositories are listed as "d/"; deleted tracked files fail
		// Lstat.
		if strings.HasSuffix(p, "/") {
			return false
		}
		_, err := os.Lstat(filepath.Join(dir, filepath.FromSlash(p)))
		return err == nil
	}
	for _, p := range tracked {
		if present(p) {
			l.Files = append(l.Files, p)
		}
	}
	for _, p := range others {
		if present(p) {
			l.Files = append(l.Files, p)
			l.Extra = l.Extra || !pruned(p)
		}
	}
	slices.Sort(l.Files)
	l.Files = slices.Compact(l.Files)
	return l, nil
}

// lsFiles runs git ls-files in dir; paths come back relative to dir.
func lsFiles(ctx context.Context, dir string, args ...string) ([]string, error) {
	out, err := git(ctx, dir, append([]string{"ls-files", "-z"}, args...)...)
	if err != nil {
		return nil, err
	}
	var paths []string
	for _, p := range strings.Split(out, "\x00") {
		if p != "" {
			paths = append(paths, p)
		}
	}
	return paths, nil
}
