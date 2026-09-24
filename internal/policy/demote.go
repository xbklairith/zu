package policy

import (
	"fmt"
	"path"
	"strings"
)

// Conventional is the built-in list of directory names (12, research R2)
// whose packages the first view sets aside: tests, test data, examples,
// samples and tooling, as Go and the community name them. A pattern is a
// path.Match pattern matched against each whole segment of a package's
// repo-relative directory.
var Conventional = []string{
	"testdata", "test", "tests", "*testing", "e2e", "example", "examples", "sample-*",
	"hack", "tools", "scripts", "third_party",
}

// Why a package is demoted (12): its name, or its generated files.
const (
	DemotedName      = "name"
	DemotedGenerated = "generated"
)

// MaxBudget is the largest budget a Policy may set.
const MaxBudget = 999

// Demoted says why the first view sets the package id aside, or "" when it
// does not (12). dir is the package's repo-relative directory, generated
// whether every declaration of it is in a file with the generated marker
// (the IR's per-declaration flag; export.Mark counts them).
//   - "name": a segment of dir is Conventional, or the Policy's demote globs
//     match id or a box above it;
//   - "generated": every declaration of it is generated;
//   - "": neither, or a "!glob" in demote matches id or a box above it. An
//     exception wins whatever its place in the list, so demote is a set.
//
// It never removes the package: the view counts it and can draw it.
func (p *Policy) Demoted(id, dir string, generated bool) string {
	var keep, name bool
	for _, g := range p.Demote {
		not := strings.HasPrefix(g, "!")
		if matchesBox(strings.TrimPrefix(g, "!"), id) {
			keep = keep || not
			name = name || !not
		}
	}
	if keep {
		return ""
	}
	for _, seg := range strings.Split(dir, "/") {
		for _, c := range Conventional {
			if ok, _ := path.Match(c, seg); ok {
				name = true
			}
		}
	}
	switch {
	case name:
		return DemotedName
	case generated:
		return DemotedGenerated
	}
	return ""
}

// matchesBox reports whether glob matches id or one of the boxes above it:
// "a", "a/b" and "a/b/c" for "a/b/c".
func matchesBox(glob, id string) bool {
	for i := 0; i <= len(id); i++ {
		if (i == len(id) || id[i] == '/') && Match(glob, id[:i]) {
			return true
		}
	}
	return false
}

// checkDemote accepts a glob over ids, or "!" and one: the exception.
func checkDemote(g string) error {
	glob := strings.TrimPrefix(g, "!")
	if glob == "" || strings.HasPrefix(glob, "/") {
		return fmt.Errorf("bad pattern %q: want an id glob such as **/tools, or !id to keep one", g)
	}
	return checkGlob(glob)
}
