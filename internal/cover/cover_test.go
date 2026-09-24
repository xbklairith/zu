package cover

import (
	"reflect"
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	// Two test binaries covering one file (-coverpkg) repeat its blocks; a
	// block counts as covered when any repeat of it ran. Code under a
	// //line directive is keyed by the directive's file, column 0.
	in := `mode: set
ex.com/m/b/b.go:3.14,3.26 1 0
ex.com/m/g/gen.y:200.0,201.0 2 1
ex.com/m/a/a.go:7.2,7.10 1 0
ex.com/m/a/a.go:3.19,4.11 1 1
ex.com/m/a/a.go:4.11,6.3 1 0
mode: set
ex.com/m/a/a.go:4.11,6.3 1 1
`
	p, err := Parse(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	want := Profile{
		"ex.com/m/a/a.go": {
			{Start: Pos{3, 19}, End: Pos{4, 11}, Stmts: 1, Hit: true},
			{Start: Pos{4, 11}, End: Pos{6, 3}, Stmts: 1, Hit: true},
			{Start: Pos{7, 2}, End: Pos{7, 10}, Stmts: 1},
		},
		"ex.com/m/b/b.go":  {{Start: Pos{3, 14}, End: Pos{3, 26}, Stmts: 1}},
		"ex.com/m/g/gen.y": {{Start: Pos{200, 0}, End: Pos{201, 0}, Stmts: 2, Hit: true}},
	}
	if !reflect.DeepEqual(p, want) {
		t.Fatalf("Parse =\n%+v\nwant\n%+v", p, want)
	}
	// A profile saved with Windows line endings reads the same.
	crlf, err := Parse(strings.NewReader(strings.ReplaceAll(in, "\n", "\r\n")))
	if err != nil || !reflect.DeepEqual(crlf, want) {
		t.Errorf("CRLF: Parse = %+v, %v", crlf, err)
	}
}

func TestParseRejects(t *testing.T) {
	long := "mode: set\nm/a.go:1.1,1.2 1 " + strings.Repeat("1", 70<<10) + "\n"
	cases := map[string]string{
		"":                                 "line 1: not a coverprofile: want mode: set, count or atomic",
		"hello\n":                          "line 1: not a coverprofile: want mode: set, count or atomic",
		"mode: set\nm/a.go:1.1,1.2 1\n":    "line 2: want file:line.col,line.col statements count",
		"mode: set\nm/a.go 1 1\n":          "line 2: want file:line.col,line.col statements count",
		"mode: set\nm/a.go:1.1,1.x 1 1\n":  "line 2: want file:line.col,line.col statements count",
		"mode: set\nm/a.go:1.1,1.2 -1 1\n": "line 2: want file:line.col,line.col statements count",
		"mode: set\nmode: count\n":         `line 2: mode "count" after mode set`,
		"mode: set\nmode: " + strings.Repeat("x", 100): `line 2: mode "xxxxxxxxxxxxxxxxxxxx" after mode set`,
		long:                                "line 2: longer than 64 KiB",
		"mode: set\nm/a.go:1.1,1.2 1 1\n\n": "line 3: want file:line.col,line.col statements count",
	}
	for in, want := range cases {
		_, err := Parse(strings.NewReader(in))
		if err == nil || err.Error() != want {
			t.Errorf("Parse(%.40q) = %v, want %q", in, err, want)
		}
	}
}
