package cli

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strings"

	"zu/internal/gitref"
	"zu/internal/ir"
	"zu/internal/scan"
)

// Seams for tests: how the command learns of Ctrl-C, and how it reads HEAD.
var (
	interruptContext = func() (context.Context, context.CancelFunc) {
		return signal.NotifyContext(context.Background(), os.Interrupt)
	}
	gitHead = gitref.Head
)

// runScan implements `zu scan [dir] [-out -|path] [-max-parse-errors N]`.
// Flags may come before or after dir.
func runScan(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("zu scan", flag.ContinueOnError)
	fs.SetOutput(stderr)
	out := fs.String("out", "", "write the IR to `path` instead of .zu/ir/ (- for stdout)")
	maxErrs := fs.Int("max-parse-errors", 0, "exit 2 when more than `N` files fail to parse")
	dir, err := parseWithDir(fs, args)
	if err != nil {
		if !errors.Is(err, flag.ErrHelp) {
			fmt.Fprintf(stderr, "zu scan: %v\n", err)
		}
		return ExitBadInvocation
	}
	if *maxErrs < 0 {
		fmt.Fprintln(stderr, "zu scan: -max-parse-errors must be >= 0")
		return ExitBadInvocation
	}

	ctx, stop := interruptContext()
	defer stop()
	doc, stats, err := scan.Run(ctx, scan.Options{Root: dir})
	if err != nil {
		fmt.Fprintf(stderr, "zu scan: %v\n", err)
		return ExitBadInvocation
	}
	doc.Ref.Commit, doc.Ref.Dirty = gitHead(ctx, dir)
	if err := ctx.Err(); err != nil {
		// An interrupted git looks like "no commit"; writing that would
		// mislabel the IR as the worktree.
		fmt.Fprintf(stderr, "zu scan: %v\n", err)
		return ExitBadInvocation
	}

	var buf bytes.Buffer
	if err := ir.Encode(&buf, doc); err != nil {
		fmt.Fprintf(stderr, "zu scan: %v\n", err)
		return ExitBadInvocation
	}
	target := *out
	switch target {
	case "-":
		_, err = stdout.Write(buf.Bytes())
	case "":
		target, err = writeDefault(dir, doc.Ref, buf.Bytes())
	default:
		err = writeAtomic(target, buf.Bytes())
	}
	if err != nil {
		fmt.Fprintf(stderr, "zu scan: write: %v\n", err)
		return ExitBadInvocation
	}

	fmt.Fprintf(stderr, "zu scan: %d packages, %d files, %d parse errors, %d unresolved calls, unsupported: %s%s\n",
		stats.Packages, stats.Files, stats.ParseErrors, stats.UnresolvedCalls,
		formatCounts(doc.Unsupported), wroteTo(target))
	if stats.ParseErrors > *maxErrs {
		return ExitParseFailure
	}
	return ExitOK
}

// parseWithDir parses flags on both sides of the one optional dir argument.
func parseWithDir(fs *flag.FlagSet, args []string) (string, error) {
	if err := fs.Parse(args); err != nil {
		return "", err
	}
	dir := "."
	if fs.NArg() > 0 {
		dir = fs.Arg(0)
		if err := fs.Parse(fs.Args()[1:]); err != nil {
			return "", err
		}
		if fs.NArg() > 0 {
			return "", fmt.Errorf("unexpected argument %q: scan takes one directory", fs.Arg(0))
		}
	}
	return dir, nil
}

// writeDefault writes to dir/.zu/ir/<name>.json and keeps .zu out of git.
func writeDefault(dir string, ref ir.Ref, data []byte) (string, error) {
	zu := filepath.Join(dir, ".zu")
	if err := os.MkdirAll(filepath.Join(zu, "ir"), 0o750); err != nil {
		return "", err
	}
	ignore := filepath.Join(zu, ".gitignore")
	if _, err := os.Stat(ignore); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(ignore, []byte("*\n"), 0o600); err != nil {
			return "", err
		}
	}
	target := filepath.Join(zu, "ir", irName(ref))
	return target, writeAtomic(target, data)
}

// irName is <commit12>.json, <commit12>-dirty.json, or worktree.json.
func irName(ref ir.Ref) string {
	if len(ref.Commit) < 12 {
		return "worktree.json"
	}
	name := ref.Commit[:12]
	if ref.Dirty {
		name += "-dirty"
	}
	return name + ".json"
}

// writeAtomic writes via a temp file in the target's directory and a rename,
// so readers never see a partial IR.
func writeAtomic(target string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(target), ".zu-ir-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), target)
}

func formatCounts(m map[string]int) string {
	if len(m) == 0 {
		return "none"
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = fmt.Sprintf("%s=%d", k, m[k])
	}
	return strings.Join(parts, " ")
}

func wroteTo(target string) string {
	if target == "-" {
		return ""
	}
	return " → " + target
}
