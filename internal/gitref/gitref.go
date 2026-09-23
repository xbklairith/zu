// Package gitref reads the commit a working tree is at. It is the only code in
// zu that runs a process, and it only ever runs git with fixed arguments.
package gitref

import (
	"context"
	"os/exec"
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

func git(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...) // #nosec G204 -- fixed git subcommands
	out, err := cmd.Output()
	return string(out), err
}
