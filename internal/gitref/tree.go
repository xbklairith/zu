package gitref

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"slices"
	"strconv"
	"strings"
	"sync"

	"zu/internal/ir"
	"zu/internal/scan"
)

// Resolve returns the top level of the repository containing dir and the
// full id of the commit ref names. A ref starting with "-" is refused before
// git runs, so it can never be read as an option.
func Resolve(ctx context.Context, dir, ref string) (top, commit string, err error) {
	if ref == "" || strings.HasPrefix(ref, "-") {
		return "", "", fmt.Errorf("invalid ref %q", ref)
	}
	out, err := git(ctx, dir, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", "", fmt.Errorf("%s is not inside a git repository", dir)
	}
	top = strings.TrimSpace(out)
	out, err = git(ctx, top, "rev-parse", "--verify", "-q", "--end-of-options", ref+"^{commit}")
	if err != nil {
		if ctx.Err() != nil {
			return "", "", ctx.Err()
		}
		return "", "", fmt.Errorf("unknown commit %q", ref)
	}
	return top, strings.TrimSpace(out), nil
}

// Tree entry modes, as git ls-tree prints them.
const (
	modeFile = "100644"
	modeExec = "100755"
	modeLink = "120000"
)

// maxLinkHops bounds symlink chains, as the kernel does.
const maxLinkHops = 40

type entry struct{ mode, oid string }

// CommitTree is one commit read from git objects; it implements scan.Tree.
// Nothing is checked out and no clean or smudge filter runs: blobs come raw
// from one `git cat-file --batch` process. ReadFile is safe for concurrent
// use. Close ends the process.
type CommitTree struct {
	entries map[string]entry // every path in the commit, directories included

	mu     sync.Mutex // guards the pipe and err
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	err    error // first failure of the pipe; the tree is unusable after it
}

var _ scan.Tree = (*CommitTree)(nil)

// OpenCommit lists commit, in the repository at top, and starts the blob
// reader.
func OpenCommit(ctx context.Context, top, commit string) (*CommitTree, error) {
	out, err := git(ctx, top, "ls-tree", "-r", "-t", "-z", "--full-tree", commit)
	if err != nil {
		return nil, fmt.Errorf("list commit %s: %w", commit, err)
	}
	t := &CommitTree{entries: map[string]entry{}}
	for _, rec := range strings.Split(out, "\x00") {
		if rec == "" {
			continue
		}
		meta, p, ok := strings.Cut(rec, "\t")
		f := strings.Fields(meta)
		if !ok || len(f) != 3 {
			return nil, fmt.Errorf("list commit %s: unexpected entry %q", commit, rec)
		}
		t.entries[p] = entry{mode: f[0], oid: f[2]}
	}

	full := append(append([]string{"-C", top}, safeArgs...), "cat-file", "--batch")
	t.cmd = exec.CommandContext(ctx, "git", full...) // #nosec G204 -- fixed git subcommand
	t.cmd.Env = append(os.Environ(), "GIT_OPTIONAL_LOCKS=0")
	if t.stdin, err = t.cmd.StdinPipe(); err != nil {
		return nil, err
	}
	stdout, err := t.cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	t.stdout = bufio.NewReader(stdout)
	if err := t.cmd.Start(); err != nil {
		return nil, err
	}
	return t, nil
}

// Files lists the regular files and in-tree file symlinks outside pruned
// directories, in lexical order, exactly as scan.DirTree does on disk.
func (t *CommitTree) Files() ([]string, []ir.ParseError, error) {
	var files []string
	for p, e := range t.entries {
		if pruned(p) {
			continue
		}
		switch e.mode {
		case modeFile, modeExec:
		case modeLink:
			if _, ok := t.resolve(p); !ok {
				continue
			}
		default: // directories, submodules
			continue
		}
		files = append(files, p)
	}
	slices.Sort(files)
	return files, nil, t.Err()
}

// ReadFile returns the committed content of rel, following it if it is a
// symlink to a file inside the tree.
func (t *CommitTree) ReadFile(rel string) ([]byte, error) {
	target, ok := t.resolve(rel)
	if !ok {
		return nil, fmt.Errorf("%s: no such file in the commit", rel)
	}
	return t.blob(t.entries[target].oid)
}

// Err is the first failure of the blob reader, if any. A scan whose tree
// has an error must not be trusted.
func (t *CommitTree) Err() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.err
}

// Close ends the git process.
func (t *CommitTree) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.cmd == nil {
		return nil
	}
	_ = t.stdin.Close()
	err := t.cmd.Wait()
	t.cmd = nil
	return err
}

// pruned reports whether a directory on p's path is one the scanner skips.
func pruned(p string) bool {
	dirs := strings.Split(p, "/")
	return slices.ContainsFunc(dirs[:len(dirs)-1], scan.PrunedDir)
}

// resolve follows symlinks component by component, like
// filepath.EvalSymlinks, and returns the path of the regular file p leads
// to. It fails for anything else: a directory, a submodule, a missing or
// absolute target, a path leaving the tree, or a chain longer than
// maxLinkHops.
func (t *CommitTree) resolve(p string) (string, bool) {
	var cur []string // resolved components, free of links
	todo := strings.Split(p, "/")
	hops := 0
	for len(todo) > 0 {
		c := todo[0]
		todo = todo[1:]
		switch c {
		case "", ".":
			continue
		case "..":
			if len(cur) == 0 {
				return "", false
			}
			cur = cur[:len(cur)-1]
			continue
		}
		next := strings.Join(append(slices.Clip(cur), c), "/")
		e, ok := t.entries[next]
		if !ok {
			return "", false
		}
		if e.mode == modeLink {
			if hops++; hops > maxLinkHops {
				return "", false
			}
			target, err := t.blob(e.oid)
			if err != nil || path.IsAbs(string(target)) {
				return "", false
			}
			// Relative to the link's directory, which cur already is.
			todo = append(strings.Split(string(target), "/"), todo...)
			continue
		}
		cur = append(cur, c)
	}
	final := strings.Join(cur, "/")
	switch t.entries[final].mode {
	case modeFile, modeExec:
		return final, true
	}
	return "", false
}

// blob reads one object over the cat-file pipe.
func (t *CommitTree) blob(oid string) ([]byte, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.err != nil {
		return nil, t.err
	}
	if t.cmd == nil {
		return nil, errors.New("commit tree is closed")
	}
	b, err := t.readObject(oid)
	if err != nil {
		t.err = fmt.Errorf("read object %s: %w", oid, err)
		return nil, t.err
	}
	return b, nil
}

func (t *CommitTree) readObject(oid string) ([]byte, error) {
	if _, err := io.WriteString(t.stdin, oid+"\n"); err != nil {
		return nil, err
	}
	header, err := t.stdout.ReadString('\n')
	if err != nil {
		return nil, err
	}
	f := strings.Fields(header)
	if len(f) != 3 || f[0] != oid {
		return nil, fmt.Errorf("unexpected reply %q", strings.TrimSpace(header))
	}
	size, err := strconv.Atoi(f[2])
	if err != nil || size < 0 {
		return nil, fmt.Errorf("unexpected size in %q", strings.TrimSpace(header))
	}
	buf := make([]byte, size+1) // content plus the trailing newline
	if _, err := io.ReadFull(t.stdout, buf); err != nil {
		return nil, err
	}
	if buf[size] != '\n' {
		return nil, errors.New("object not newline-terminated")
	}
	return buf[:size], nil
}
