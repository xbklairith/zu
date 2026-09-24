// Package cover reads the profile go test -coverprofile writes (08). The
// profile is data: its file keys are matched against package ids and never
// opened, and only per-function numbers derived from it leave zu.
package cover

import (
	"bufio"
	"cmp"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"
)

// maxLine bounds one profile line; a real one is under 200 bytes.
const maxLine = 64 << 10

// Pos is a line and a byte column, both 1-based; the column is 0 in code
// under a //line directive.
type Pos struct{ Line, Col int }

// Block is one statement block: its range, its statement count, and whether
// any test run executed it.
type Block struct {
	Start, End Pos
	Stmts      int
	Hit        bool
}

// Profile maps a file key, the package import path plus "/" plus the file
// name, to its blocks sorted by start. A block repeated by several test
// binaries appears once, hit when any repeat was.
type Profile map[string][]Block

// Parse reads a coverprofile of any mode, with either line ending. It keeps
// no line longer than 64 KiB and reports the first malformed line by number.
func Parse(r io.Reader) (Profile, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 4096), maxLine)
	type key struct {
		file       string
		start, end Pos
	}
	seen := map[key]int{} // → index in p[file]
	p := Profile{}
	mode := ""
	n := 0
	for sc.Scan() {
		n++
		line := sc.Text()
		if m, ok := strings.CutPrefix(line, "mode: "); ok {
			switch {
			case n == 1 && (m == "set" || m == "count" || m == "atomic"):
				mode = m
				continue
			case n > 1 && m == mode:
				continue // profiles joined end to end
			case n > 1:
				return nil, fmt.Errorf("line %d: mode %.20q after mode %s", n, m, mode) // at most 20 runes of it
			}
		}
		if n == 1 {
			return nil, errors.New("line 1: not a coverprofile: want mode: set, count or atomic")
		}
		file, b, ok := parseBlock(line)
		if !ok {
			return nil, fmt.Errorf("line %d: want file:line.col,line.col statements count", n)
		}
		k := key{file, b.Start, b.End}
		if i, dup := seen[k]; dup {
			p[file][i].Hit = p[file][i].Hit || b.Hit
			continue
		}
		seen[k] = len(p[file])
		p[file] = append(p[file], b)
	}
	if err := sc.Err(); errors.Is(err, bufio.ErrTooLong) {
		return nil, fmt.Errorf("line %d: longer than 64 KiB", n+1)
	} else if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, errors.New("line 1: not a coverprofile: want mode: set, count or atomic")
	}
	for _, bs := range p {
		slices.SortFunc(bs, func(a, b Block) int { return cmpPos(a.Start, b.Start) })
	}
	return p, nil
}

// parseBlock parses "file:l.c,l.c stmts count".
func parseBlock(line string) (string, Block, bool) {
	f := strings.Fields(line)
	if len(f) != 3 {
		return "", Block{}, false
	}
	at := strings.LastIndexByte(f[0], ':')
	if at <= 0 {
		return "", Block{}, false
	}
	from, to, ok := strings.Cut(f[0][at+1:], ",")
	if !ok {
		return "", Block{}, false
	}
	var b Block
	var count int
	ok = parsePos(from, &b.Start) && parsePos(to, &b.End) &&
		parseCount(f[1], &b.Stmts) && parseCount(f[2], &count)
	b.Hit = count > 0
	return f[0][:at], b, ok
}

func parsePos(s string, p *Pos) bool {
	l, c, ok := strings.Cut(s, ".")
	return ok && parseCount(l, &p.Line) && parseCount(c, &p.Col)
}

func parseCount(s string, n *int) bool {
	v, err := strconv.Atoi(s)
	*n = v
	return err == nil && v >= 0
}

func cmpPos(a, b Pos) int { return cmp.Or(cmp.Compare(a.Line, b.Line), cmp.Compare(a.Col, b.Col)) }
