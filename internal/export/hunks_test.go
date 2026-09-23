package export

import (
	"fmt"
	"math/rand/v2"
	"reflect"
	"strings"
	"testing"
)

func lines(n int, f func(i int) string) string {
	var b strings.Builder
	for i := 1; i <= n; i++ {
		b.WriteString(f(i) + "\n")
	}
	return b.String()
}

func TestHunksIdenticalIsEmpty(t *testing.T) {
	if h := Hunks([]byte("a\nb\n"), []byte("a\nb\n")); len(h) != 0 {
		t.Errorf("identical files gave %v", h)
	}
}

func TestHunksAgainstEmpty(t *testing.T) {
	got := Hunks(nil, []byte("a\nb\n"))
	want := []Hunk{{BaseStart: 0, BaseLines: 0, HeadStart: 1, HeadLines: 2, Lines: []string{"+a", "+b"}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("added file = %+v, want %+v", got, want)
	}
	got = Hunks([]byte("a\nb\n"), nil)
	want = []Hunk{{BaseStart: 1, BaseLines: 2, HeadStart: 0, HeadLines: 0, Lines: []string{"-a", "-b"}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("removed file = %+v, want %+v", got, want)
	}
}

func TestHunksInsertWithThreeLinesOfContext(t *testing.T) {
	base := lines(10, func(i int) string { return fmt.Sprint(i) })
	head := strings.Replace(base, "5\n", "5\nnew\n", 1)
	got := Hunks([]byte(base), []byte(head))
	want := []Hunk{{BaseStart: 3, BaseLines: 6, HeadStart: 3, HeadLines: 7,
		Lines: []string{" 3", " 4", " 5", "+new", " 6", " 7", " 8"}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
}

func TestHunksDeleteAndReplace(t *testing.T) {
	got := Hunks([]byte("a\nb\nc\n"), []byte("a\nX\nc\n"))
	want := []Hunk{{BaseStart: 1, BaseLines: 3, HeadStart: 1, HeadLines: 3, Lines: []string{" a", "-b", "+X", " c"}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
}

func TestHunksMergeWhenContextsTouch(t *testing.T) {
	base := lines(30, func(i int) string { return fmt.Sprint(i) })
	near := strings.Replace(strings.Replace(base, "\n5\n", "\nfive\n", 1), "\n11\n", "\neleven\n", 1)
	if got := Hunks([]byte(base), []byte(near)); len(got) != 1 {
		t.Errorf("changes 6 lines apart gave %d hunks, want 1", len(got))
	}
	far := strings.Replace(strings.Replace(base, "\n5\n", "\nfive\n", 1), "\n20\n", "\ntwenty\n", 1)
	got := Hunks([]byte(base), []byte(far))
	if len(got) != 2 || got[1].BaseStart != 17 || got[1].HeadStart != 17 {
		t.Errorf("far changes = %+v, want 2 hunks, the second at 17", got)
	}
}

func TestHunksNoTrailingNewline(t *testing.T) {
	got := Hunks([]byte("a\nb"), []byte("a\nb\n"))
	if len(got) != 0 {
		t.Errorf("a missing final newline alone is not a line change: %+v", got)
	}
}

// apply rebuilds head from base and the hunks, checking each hunk's counts.
func apply(t *testing.T, base []string, hs []Hunk) []string {
	t.Helper()
	var out []string
	at := 0 // base lines consumed
	for _, h := range hs {
		first := h.BaseStart - 1
		if h.BaseLines == 0 {
			first = h.BaseStart
		}
		out = append(out, base[at:first]...)
		at = first
		var nb, nh int
		for _, l := range h.Lines {
			switch l[0] {
			case ' ':
				if base[at] != l[1:] {
					t.Fatalf("context %q does not match base line %d %q", l, at+1, base[at])
				}
				out = append(out, l[1:])
				at, nb, nh = at+1, nb+1, nh+1
			case '-':
				at, nb = at+1, nb+1
			case '+':
				out, nh = append(out, l[1:]), nh+1
			}
		}
		if nb != h.BaseLines || nh != h.HeadLines {
			t.Fatalf("hunk %+v counts %d/%d lines", h, nb, nh)
		}
	}
	return append(out, base[at:]...)
}

func TestHunksRebuildHead(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	word := func() string { return string(rune('a' + rng.IntN(4))) }
	for i := 0; i < 500; i++ {
		var base, head []string
		for j := rng.IntN(40); j > 0; j-- {
			base = append(base, word())
		}
		for _, l := range base {
			switch rng.IntN(6) {
			case 0: // drop
			case 1:
				head = append(head, word(), l)
			default:
				head = append(head, l)
			}
		}
		join := func(ls []string) []byte {
			if len(ls) == 0 {
				return nil
			}
			return []byte(strings.Join(ls, "\n") + "\n")
		}
		hs := Hunks(join(base), join(head))
		if got := apply(t, base, hs); !reflect.DeepEqual(got, head) && !(len(got) == 0 && len(head) == 0) {
			t.Fatalf("case %d: rebuilt %q, want %q (hunks %+v)", i, got, head, hs)
		}
	}
}
