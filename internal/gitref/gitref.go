// Package gitref reads git: the commit a working tree is at, and the files
// of any commit, straight from git objects. It is the only code in zu that
// runs a process, and it only ever runs git with fixed subcommands.
package gitref

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Head returns the full HEAD commit id of the repository containing dir and
// whether tracked files have uncommitted modifications. Untracked files do not
// count. Outside a repository, before the first commit, or without a git
// binary it returns ("", false): the scan still runs, it just has no commit.
func Head(ctx context.Context, dir string) (commit string, dirty bool) {
	out, err := git(ctx, dir, "rev-parse", "--verify", "-q", "HEAD")
	if err != nil {
		return "", false
	}
	commit = strings.TrimSpace(out)
	if commit == "" {
		return "", false
	}
	status, err := git(ctx, dir, "status", "--porcelain", "--untracked-files=no")
	if err != nil {
		return commit, false
	}
	return commit, strings.TrimSpace(status) != ""
}

// safeArgs keep a scanned repository's own config from running commands
// (core.fsmonitor) and keep git from rewriting .git/index on a read.
var safeArgs = []string{
	"-c", "core.fsmonitor=false",
	"-c", "core.untrackedCache=false",
	"--no-optional-locks",
}

func git(ctx context.Context, dir string, args ...string) (string, error) {
	full := append(append([]string{"-C", dir}, safeArgs...), args...)
	cmd := exec.CommandContext(ctx, "git", full...) // #nosec G204 -- fixed git subcommands
	cmd.Env = append(os.Environ(), "GIT_OPTIONAL_LOCKS=0")
	out, err := cmd.Output()
	return string(out), err
}

// Prefix returns dir's path inside its repository with a trailing slash
// ("" at the top level, or outside a repository): git rev-parse --show-prefix.
func Prefix(ctx context.Context, dir string) string {
	out, err := git(ctx, dir, "rev-parse", "--show-prefix")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// Origin returns the URL of the "origin" remote, or "" when there is none.
// It may carry credentials; callers must not copy it into output as-is.
func Origin(ctx context.Context, dir string) string {
	out, err := git(ctx, dir, "remote", "get-url", "origin")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// Meta returns the files in dir's git directory that change when HEAD moves
// or the index is written: HEAD, the index, packed-refs, and the ref HEAD
// names unless it is detached. A ref is in the common directory, which a
// linked worktree shares. zu serve's watch polls them (13). Outside a
// repository it returns nil.
func Meta(ctx context.Context, dir string) []string {
	out, err := git(ctx, dir, "rev-parse", "--absolute-git-dir", "--git-common-dir")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if err != nil || len(lines) != 2 {
		return nil
	}
	gd, common := lines[0], lines[1]
	if !filepath.IsAbs(common) { // relative to dir
		if common, err = filepath.EvalSymlinks(filepath.Join(dir, common)); err != nil {
			return nil
		}
	}
	m := []string{filepath.Join(gd, "HEAD"), filepath.Join(gd, "index"), filepath.Join(common, "packed-refs")}
	if ref, err := git(ctx, dir, "symbolic-ref", "-q", "HEAD"); err == nil {
		m = append(m, filepath.Join(common, filepath.FromSlash(strings.TrimSpace(ref))))
	}
	return m
}
