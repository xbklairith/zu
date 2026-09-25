package gitref

import (
	"bufio"
	"context"
	"fmt"
	"strconv"
	"strings"
)

// FileDiff is one Go file of `git diff -M` between two commits, as a host's
// compare page lists it: Path is head's path ("" when the change deleted the
// file), OldPath base's ("" when it added the file).
type FileDiff struct {
	Path, OldPath string
	Hunks         []Hunk
}

// Hunk is one @@ block: its line ranges on each side and its lines, each
// prefixed " ", "-" or "+".
type Hunk struct {
	BaseStart, BaseLines, HeadStart, HeadLines int
	Lines                                      []string
}

// diffArgs pin what a user's config could change, so the hunks are git's
// defaults: the ones a host computes for its compare page.
var diffArgs = []string{
	"-c", "core.quotePath=false",
	"diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-relative",
	"-M", "-U3", "--inter-hunk-context=0", "--diff-algorithm=myers", "--indent-heuristic",
	"--src-prefix=a/", "--dst-prefix=b/",
}

// Diff is `git diff -M -U3 base head -- '*.go'`, read from git objects. base
// and head must be commit ids (see Resolve), never options.
func Diff(ctx context.Context, top, base, head string) ([]FileDiff, error) {
	if strings.HasPrefix(base, "-") || strings.HasPrefix(head, "-") {
		return nil, fmt.Errorf("invalid commit %q or %q", base, head)
	}
	out, err := git(ctx, top, append(diffArgs, base, head, "--", "*.go")...)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("git diff: %w", err)
	}
	return parseDiff(out)
}

// parseDiff reads unified diff output: a "diff --git" line opens each file,
// headers name its sides, and each @@ hunk's body is read by its counts.
func parseDiff(out string) ([]FileDiff, error) {
	var files []FileDiff
	sc := bufio.NewScanner(strings.NewReader(out))
	sc.Buffer(make([]byte, 0, 64*1024), 64*1024*1024)
	var f *FileDiff
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.HasPrefix(line, "diff --git "):
			files = append(files, FileDiff{})
			f = &files[len(files)-1]
			f.OldPath, f.Path = headerPaths(line[len("diff --git "):])
		case f == nil:
			return nil, fmt.Errorf("git diff: unexpected line %q", line)
		case strings.HasPrefix(line, "new file mode "):
			f.OldPath = ""
		case strings.HasPrefix(line, "deleted file mode "):
			f.Path = ""
		case strings.HasPrefix(line, "rename from "):
			f.OldPath = unquote(line[len("rename from "):])
		case strings.HasPrefix(line, "rename to "):
			f.Path = unquote(line[len("rename to "):])
		case strings.HasPrefix(line, "--- "):
			f.OldPath = side(line[len("--- "):], "a/")
		case strings.HasPrefix(line, "+++ "):
			f.Path = side(line[len("+++ "):], "b/")
		case strings.HasPrefix(line, "@@ "):
			h, err := hunkHeader(line)
			if err != nil {
				return nil, err
			}
			for base, head := h.BaseLines, h.HeadLines; base > 0 || head > 0; {
				if !sc.Scan() {
					return nil, fmt.Errorf("git diff: hunk %q cut short", line)
				}
				l := sc.Text()
				if strings.HasPrefix(l, `\`) { // "\ No newline at end of file"
					continue
				}
				switch {
				case strings.HasPrefix(l, "-"):
					base--
				case strings.HasPrefix(l, "+"):
					head--
				default:
					base--
					head--
				}
				h.Lines = append(h.Lines, l)
			}
			f.Hunks = append(f.Hunks, h)
		}
	}
	return files, sc.Err()
}

// headerPaths splits `a/P b/Q` from a "diff --git" line. Unquoted paths may
// hold spaces, so it relies on a/P and b/P being equal when the header is
// all there is (a mode change); renames and edits name their sides again.
func headerPaths(s string) (oldPath, path string) {
	if strings.HasPrefix(s, `"`) {
		if q, err := strconv.QuotedPrefix(s); err == nil {
			return strings.TrimPrefix(unquote(q), "a/"), strings.TrimPrefix(unquote(strings.TrimSpace(s[len(q):])), "b/")
		}
	}
	if n := len(s); n%2 == 1 && s[n/2] == ' ' && strings.HasPrefix(s, "a/") && s[n/2+1:n/2+3] == "b/" && s[2:n/2] == s[n/2+3:] {
		return s[2 : n/2], s[2 : n/2]
	}
	return "", ""
}

// side reads a "---" or "+++" path: /dev/null is no path.
func side(s, prefix string) string {
	s = strings.TrimSuffix(s, "\t")
	if s == "/dev/null" {
		return ""
	}
	return strings.TrimPrefix(unquote(s), prefix)
}

// unquote undoes git's C-style quoting of a path with unusual characters.
func unquote(s string) string {
	if strings.HasPrefix(s, `"`) {
		if u, err := strconv.Unquote(s); err == nil {
			return u
		}
	}
	return s
}

// hunkHeader reads "@@ -a[,b] +c[,d] @@": a count left out is 1.
func hunkHeader(line string) (Hunk, error) {
	var h Hunk
	f := strings.Fields(line)
	if len(f) < 4 || !strings.HasPrefix(f[1], "-") || !strings.HasPrefix(f[2], "+") {
		return h, fmt.Errorf("git diff: bad hunk header %q", line)
	}
	var err1, err2 error
	h.BaseStart, h.BaseLines, err1 = rng(f[1][1:])
	h.HeadStart, h.HeadLines, err2 = rng(f[2][1:])
	if err1 != nil || err2 != nil {
		return h, fmt.Errorf("git diff: bad hunk header %q", line)
	}
	return h, nil
}

func rng(s string) (start, n int, err error) {
	a, b, ok := strings.Cut(s, ",")
	if start, err = strconv.Atoi(a); err != nil {
		return 0, 0, err
	}
	if !ok {
		return start, 1, nil
	}
	n, err = strconv.Atoi(b)
	return start, n, err
}

// CommitCount is `git rev-list --count base..head`: how many commits a host's
// compare of the two lists. base and head must be commit ids, never options.
func CommitCount(ctx context.Context, top, base, head string) (int, error) {
	if strings.HasPrefix(base, "-") || strings.HasPrefix(head, "-") {
		return 0, fmt.Errorf("invalid commit %q or %q", base, head)
	}
	out, err := git(ctx, top, "rev-list", "--count", "--end-of-options", base+".."+head)
	if err != nil {
		if ctx.Err() != nil {
			return 0, ctx.Err()
		}
		return 0, fmt.Errorf("git rev-list: %w", err)
	}
	return strconv.Atoi(strings.TrimSpace(out))
}

// OnRemote is whether a remote-tracking ref contains commit: what the host
// has, as far as this clone knows. It reads local refs only; zu never
// fetches.
func OnRemote(ctx context.Context, top, commit string) bool {
	if commit == "" || strings.HasPrefix(commit, "-") {
		return false
	}
	out, err := git(ctx, top, "for-each-ref", "--count=1", "--format=%(refname)", "--contains", commit, "refs/remotes")
	return err == nil && strings.TrimSpace(out) != ""
}
