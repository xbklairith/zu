package gitref

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// ErrNoMergeBase means the two commits share no history in this clone,
// usually because it is shallow.
var ErrNoMergeBase = errors.New("no merge-base: the clone lacks shared history; fetch full history (e.g. actions/checkout fetch-depth: 0, or git fetch --unshallow)")

// MergeBase is `git merge-base a b`: git's single pick, even for criss-cross
// histories. a and b must be commit ids (see Resolve), never options.
func MergeBase(ctx context.Context, top, a, b string) (string, error) {
	if strings.HasPrefix(a, "-") || strings.HasPrefix(b, "-") {
		return "", fmt.Errorf("invalid commit %q or %q", a, b)
	}
	out, err := git(ctx, top, "merge-base", a, b)
	var exit *exec.ExitError
	switch {
	case err == nil:
		return strings.TrimSpace(out), nil
	case ctx.Err() != nil:
		return "", ctx.Err()
	case errors.As(err, &exit) && exit.ExitCode() == 1 && strings.TrimSpace(out) == "":
		return "", ErrNoMergeBase
	}
	return "", fmt.Errorf("git merge-base: %w", err)
}
