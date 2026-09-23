package policy

import (
	"errors"
	"fmt"
	"io/fs"
	"path"
	"strings"
)

// Match reports whether a repo-relative slash path matches glob. A "**"
// segment matches zero or more whole segments; every other segment is a
// path.Match pattern, so "*" never crosses a slash.
func Match(glob, rel string) bool {
	return matchSegs(strings.Split(collapseGlob(glob), "/"), strings.Split(rel, "/"))
}

// matchSegs is dynamic programming over (glob segment, path segment), so it
// costs O(len(g) × len(p)) whatever the number of "**": a glob comes from an
// MR and must not be able to stall a scan.
func matchSegs(g, p []string) bool {
	// next[j] reports whether g[i+1:] matches p[j:].
	next := make([]bool, len(p)+1)
	next[len(p)] = true
	for i := len(g) - 1; i >= 0; i-- {
		cur := make([]bool, len(p)+1)
		for j := len(p); j >= 0; j-- {
			switch {
			case g[i] == "**": // zero segments, or one and still in **
				cur[j] = next[j] || (j < len(p) && cur[j+1])
			case j < len(p):
				ok, _ := path.Match(g[i], p[j])
				cur[j] = ok && next[j+1]
			}
		}
		next = cur
	}
	return next[0]
}

// Excluded reports whether the scan skips the file at rel. Test files are
// skipped whatever the Policy says; vendor and testdata directories are
// pruned by the scan itself.
func (p *Policy) Excluded(rel string) bool {
	for _, g := range p.Exclude {
		if Match(g, rel) {
			return true
		}
	}
	return false
}

// Load reads the Policy file through read (a tree's ReadFile). A missing
// file is the empty Policy: the Package Tree with no rules.
func Load(read func(rel string) ([]byte, error)) (*Policy, error) {
	data, err := read(FileName)
	if errors.Is(err, fs.ErrNotExist) {
		return &Policy{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("%s: %w", FileName, err)
	}
	return Parse(data)
}
