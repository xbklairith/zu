package policy

import (
	"errors"
	"io/fs"
	"strings"
	"testing"
	"time"
)

func TestMatch(t *testing.T) {
	for _, tc := range []struct {
		glob, rel string
		want      bool
	}{
		{"**/*.pb.go", "api/v1/user.pb.go", true},
		{"**/*.pb.go", "user.pb.go", true}, // ** matches zero segments
		{"**/*.pb.go", "api/v1/user.go", false},
		{"*.pb.go", "api/user.pb.go", false}, // * never crosses a slash
		{"gen/**", "gen/a/b.go", true},
		{"gen/**", "gen", true},
		{"gen/**", "general/b.go", false},
		{"**/zz_generated*.go", "pkg/apis/zz_generated.deepcopy.go", true},
		{"a/**/b/*.go", "a/x/y/b/c.go", true},
		{"a/**/b/*.go", "a/b/c.go", true},
		{"a/**/b/*.go", "a/b/x/c.go", false},
		{"a/**/**/b.go", "a/b.go", true}, // a run of ** is one **
		{"**", "any/depth/x.go", true},
	} {
		if got := Match(tc.glob, tc.rel); got != tc.want {
			t.Errorf("Match(%q, %q) = %v, want %v", tc.glob, tc.rel, got, tc.want)
		}
	}
}

// Matching must not be exponential in the number of "**": the backtracking
// matcher took about 550 ms per call for this glob and path.
func TestMatchIsPolynomialInStars(t *testing.T) {
	glob := strings.Repeat("**/", 8) + "nomatch.go"
	rel := strings.Repeat("d/", 24) + "x.go" // 25 segments
	start := time.Now()
	for range 20 {
		if Match(glob, rel) {
			t.Fatal("matched")
		}
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("20 matches took %v, want well under 1s", d)
	}
}

func TestExcluded(t *testing.T) {
	p, err := Parse([]byte("exclude: [\"**/*.pb.go\", \"third_party/**\"]\n"))
	if err != nil {
		t.Fatal(err)
	}
	for rel, want := range map[string]bool{
		"api/user.pb.go": true, "third_party/x/y.go": true, "api/user.go": false,
	} {
		if got := p.Excluded(rel); got != want {
			t.Errorf("Excluded(%q) = %v, want %v", rel, got, want)
		}
	}
}

func TestLoad(t *testing.T) {
	missing := func(string) ([]byte, error) { return nil, fs.ErrNotExist }
	p, err := Load(missing)
	if err != nil || p.Rules() || len(p.Exclude) > 0 {
		t.Fatalf("missing file: %+v, %v", p, err)
	}
	broken := func(string) ([]byte, error) { return nil, errors.New("disk on fire") }
	if _, err := Load(broken); err == nil {
		t.Error("a read error must not pass as no Policy")
	}
	bad := func(string) ([]byte, error) { return []byte("levls: []\n"), nil }
	if _, err := Load(bad); err == nil {
		t.Error("a malformed file must fail")
	}
	good := func(rel string) ([]byte, error) {
		if rel != FileName {
			t.Errorf("read %q, want %q", rel, FileName)
		}
		return []byte("cycles: true\n"), nil
	}
	if p, err := Load(good); err != nil || !p.Cycles {
		t.Fatalf("good file: %+v, %v", p, err)
	}
}
