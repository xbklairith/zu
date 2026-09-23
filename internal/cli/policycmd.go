package cli

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"

	"zu/internal/policy"
)

// runPolicy implements `zu policy init [dir]`: write a suggested
// zu.policy.yaml at dir. It never overwrites an existing file.
func runPolicy(args []string, _, stderr io.Writer) int {
	if len(args) == 0 || args[0] != "init" {
		fmt.Fprintln(stderr, "usage: zu policy init [dir]")
		return ExitBadInvocation
	}
	fset := flag.NewFlagSet("zu policy init", flag.ContinueOnError)
	fset.SetOutput(stderr)
	dir, err := parseWithDir(fset, args[1:])
	if err != nil {
		if !errors.Is(err, flag.ErrHelp) {
			fmt.Fprintf(stderr, "zu policy init: %v\n", err)
		}
		return ExitBadInvocation
	}
	target := filepath.Join(dir, policy.FileName)
	if _, err := os.Lstat(target); !errors.Is(err, fs.ErrNotExist) {
		fmt.Fprintf(stderr, "zu policy init: %s already exists; zu never overwrites it\n", target)
		return ExitBadInvocation
	}

	ctx, stop := interruptContext()
	defer stop()
	src, err := openSource(ctx, dir, "", false)
	if err != nil {
		fmt.Fprintf(stderr, "zu policy init: %v\n", err)
		return ExitBadInvocation
	}
	defer src.close()
	doc, _, _, err := scanSource(ctx, src)
	if err != nil {
		fmt.Fprintf(stderr, "zu policy init: %v\n", err)
		return ExitBadInvocation
	}
	commit, dirty := gitHead(ctx, dir)
	if dirty {
		commit = "" // the working tree, not the commit
	}
	levels := policy.Suggest(doc)
	// O_EXCL: a file created since the check above is still never replaced.
	f, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644) // #nosec G304 -- the user's own directory
	if err == nil {
		_, err = f.Write(policy.InitFile(levels, commit))
		err = errors.Join(err, f.Close())
	}
	if err != nil {
		fmt.Fprintf(stderr, "zu policy init: write: %v\n", err)
		return ExitBadInvocation
	}
	boxes := 0
	for _, l := range levels {
		boxes += len(l)
	}
	fmt.Fprintf(stderr, "zu policy init: wrote %s (%d levels, %d boxes)\n", target, len(levels), boxes)
	return ExitOK
}
