package export

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// The Code panel's colour (19): each line's runs [column, length, class],
// columns and lengths in UTF-16 code units, as the page splits the text.
func TestSyntax(t *testing.T) {
	for _, c := range []struct {
		name, src string
		want      [][]int
	}{
		{"keywords, comments, literals", "package p\n\n// Add adds.\nfunc Add(a int) int { return a + 0x1F }\nvar s = \"x\" + 'y'\n", [][]int{
			{0, 7, tokKeyword},
			{},
			{0, 12, tokComment},
			{0, 4, tokKeyword, 22, 6, tokKeyword, 33, 4, tokNumber},
			{0, 3, tokKeyword, 8, 3, tokString, 14, 3, tokString},
			{},
		}},
		{"a token across lines gives a run on each", "var r = `a\nbc`\n/* x\n y */ func", [][]int{
			{0, 3, tokKeyword, 8, 2, tokString},
			{0, 3, tokString},
			{0, 4, tokComment},
			{0, 5, tokComment, 6, 4, tokKeyword},
		}},
		{"columns count UTF-16 units, as JavaScript does", "x := \"é😀\" // ไทย\nfunc", [][]int{
			{5, 5, tokString, 11, 6, tokComment},
			{0, 4, tokKeyword},
		}},
		{"a block comment that opens with a slash", "/*/ x */ func", [][]int{{0, 8, tokComment, 9, 4, tokKeyword}}},
		{"what does not parse still colours", "func (\n/* open", [][]int{
			{0, 4, tokKeyword},
			{0, 7, tokComment},
		}},
		{"a comment where a semicolon goes", "x++ // c\n", [][]int{{4, 4, tokComment}, {}}},
		{"empty", "", [][]int{{}}},
	} {
		if got := Syntax([]byte(c.src)); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s:\n got %v\nwant %v", c.name, got, c.want)
		}
	}
}

// A long line costs its length, not its length squared: counting each run's
// column from its line's start took 54 s for a 480 KB line of numbers.
func TestSyntaxIsLinearInLineLength(t *testing.T) {
	const n = 1 << 16
	src := []byte("var b = []byte{" + strings.Repeat("0x1f, ", n) + "}") // 384 KB on one line
	start := time.Now()
	runs := Syntax(src)[0]
	if d := time.Since(start); d > time.Second {
		t.Fatalf("a %d KB line took %v, want well under 1s", len(src)>>10, d)
	}
	if len(runs) != 3*(n+1) {
		t.Fatalf("%d runs, want %d", len(runs)/3, n+1)
	}
	if last := runs[len(runs)-3]; last != 15+6*(n-1) {
		t.Errorf("the last number at %d, want %d", last, 15+6*(n-1))
	}
}
