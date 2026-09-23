package export

import "strings"

// context is the number of unchanged lines kept around each change.
const context = 3

// Hunk is one region of a unified line diff. Each line carries its marker:
// " " unchanged, "-" only in base, "+" only in head. A side with no lines
// starts at the line before the hunk, as in unified diff (0 for an empty file).
type Hunk struct {
	BaseStart int      `json:"baseStart"`
	BaseLines int      `json:"baseLines"`
	HeadStart int      `json:"headStart"`
	HeadLines int      `json:"headLines"`
	Lines     []string `json:"lines"`
}

// Hunks diffs base against head line by line (Myers) and groups the changes
// into hunks with three lines of context. Equal files give no hunks.
func Hunks(base, head []byte) []Hunk {
	return group(edits(splitLines(base), splitLines(head)))
}

func splitLines(b []byte) []string {
	s := strings.TrimSuffix(string(b), "\n")
	if s == "" && len(b) <= 1 {
		return nil
	}
	return strings.Split(s, "\n")
}

// op is one step of an edit script: kind is ' ', '-' or '+'.
type op struct {
	kind byte
	text string
}

// edits returns a shortest edit script from a to b. The common prefix and
// suffix are trimmed before the Myers search, which keeps typical source
// edits cheap.
func edits(a, b []string) []op {
	pre := 0
	for pre < len(a) && pre < len(b) && a[pre] == b[pre] {
		pre++
	}
	suf := 0
	for suf < len(a)-pre && suf < len(b)-pre && a[len(a)-1-suf] == b[len(b)-1-suf] {
		suf++
	}
	out := make([]op, 0, len(a)+len(b))
	for _, s := range a[:pre] {
		out = append(out, op{' ', s})
	}
	out = append(out, myers(a[pre:len(a)-suf], b[pre:len(b)-suf])...)
	for _, s := range a[len(a)-suf:] {
		out = append(out, op{' ', s})
	}
	return out
}

// myers is the O(ND) greedy algorithm, recording each round's frontier so the
// path can be walked back. Within one change, deletions come before insertions.
func myers(a, b []string) []op {
	n, m := len(a), len(b)
	limit := n + m
	if limit == 0 {
		return nil
	}
	off := limit + 1
	v := make([]int, 2*limit+3)
	var trace [][]int
	for d := 0; d <= limit; d++ {
		trace = append(trace, append([]int(nil), v...))
		for k := -d; k <= d; k += 2 {
			var x int
			if k == -d || (k != d && v[off+k-1] < v[off+k+1]) {
				x = v[off+k+1]
			} else {
				x = v[off+k-1] + 1
			}
			y := x - k
			for x < n && y < m && a[x] == b[y] {
				x, y = x+1, y+1
			}
			v[off+k] = x
			if x >= n && y >= m {
				return backtrack(a, b, trace, off, d)
			}
		}
	}
	return nil // unreachable: d = n+m always reaches the end
}

func backtrack(a, b []string, trace [][]int, off, d int) []op {
	var rev []op
	x, y := len(a), len(b)
	for ; d > 0; d-- {
		v := trace[d]
		k := x - y
		var pk int
		if k == -d || (k != d && v[off+k-1] < v[off+k+1]) {
			pk = k + 1
		} else {
			pk = k - 1
		}
		px := v[off+pk]
		py := px - pk
		for x > px && y > py {
			x, y = x-1, y-1
			rev = append(rev, op{' ', a[x]})
		}
		if x == px {
			y--
			rev = append(rev, op{'+', b[y]})
		} else {
			x--
			rev = append(rev, op{'-', a[x]})
		}
	}
	for x > 0 {
		x, y = x-1, y-1
		rev = append(rev, op{' ', a[x]})
	}
	out := make([]op, len(rev))
	for i, o := range rev {
		out[len(rev)-1-i] = o
	}
	return out
}

// group cuts an edit script into hunks. Changes closer than twice the context
// share a hunk, as in diff -U3.
func group(ops []op) []Hunk {
	var hunks []Hunk
	for i := 0; i < len(ops); {
		if ops[i].kind == ' ' {
			i++
			continue
		}
		start := max(i-context, 0)
		end := i // one past the last change in this hunk
		for j := i; j < len(ops); j++ {
			if ops[j].kind != ' ' {
				if j-end > 2*context {
					break
				}
				end = j + 1
			}
		}
		stop := min(end+context, len(ops))
		hunks = append(hunks, hunkOf(ops, start, stop))
		i = end
	}
	return hunks
}

// hunkOf builds the hunk for ops[start:stop], numbering lines from the ops
// before it.
func hunkOf(ops []op, start, stop int) Hunk {
	var baseBefore, headBefore int
	for _, o := range ops[:start] {
		if o.kind != '+' {
			baseBefore++
		}
		if o.kind != '-' {
			headBefore++
		}
	}
	h := Hunk{Lines: make([]string, 0, stop-start)}
	for _, o := range ops[start:stop] {
		if o.kind != '+' {
			h.BaseLines++
		}
		if o.kind != '-' {
			h.HeadLines++
		}
		h.Lines = append(h.Lines, string(o.kind)+o.text)
	}
	h.BaseStart, h.HeadStart = baseBefore, headBefore
	if h.BaseLines > 0 {
		h.BaseStart++
	}
	if h.HeadLines > 0 {
		h.HeadStart++
	}
	return h
}
