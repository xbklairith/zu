package export

import (
	"testing"

	"zu/internal/ir"
)

func TestForRepo(t *testing.T) {
	const c = "90cb22a1b2c3d4e5f60718293a4b5c6d7e8f9012"
	clean := ir.Ref{Commit: c}
	cases := []struct {
		name, origin, tmpl string
		ref                ir.Ref
		prefix             string // git rev-parse --show-prefix of the scan root
		want               string // "" = no links
	}{
		{"github ssh", "git@github.com:xbklairith/zu.git", "", clean, "", "https://github.com/xbklairith/zu/blob/" + c + "/{path}#L{line}"},
		{"github https with token", "https://x-access-token:SECRET@github.com/o/r.git", "", clean, "", "https://github.com/o/r/blob/" + c + "/{path}#L{line}"},
		{"gitlab ssh url, subgroup", "ssh://git@gitlab.com/g/sub/r.git", "", clean, "", "https://gitlab.com/g/sub/r/-/blob/" + c + "/{path}#L{line}"},
		{"unknown host", "git@git.example.com:o/r.git", "", clean, "", ""},
		{"scanned from a subdirectory", "git@github.com:o/r.git", "", clean, "sub/dir/", "https://github.com/o/r/blob/" + c + "/sub/dir/{path}#L{line}"},
		{"template wins", "git@git.example.com:o/r.git", "https://git.example.com/o/r/src/{commit}/{path}#L{line}", clean, "", "https://git.example.com/o/r/src/" + c + "/{path}#L{line}"},
		{"dirty", "git@github.com:o/r.git", "", ir.Ref{Commit: c, Dirty: true}, "", ""},
		{"no commit", "git@github.com:o/r.git", "", ir.Ref{}, "", ""},
		{"no origin", "", "", clean, "", ""},
	}
	for _, tc := range cases {
		l, err := ForRepo(tc.origin, tc.ref, tc.tmpl, tc.prefix)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		got := ""
		if l != nil {
			got = l.Blob
		}
		if got != tc.want {
			t.Errorf("%s: blob = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestForRepoRejectsUnsafeTemplates(t *testing.T) {
	for _, tmpl := range []string{"http://h/{path}", "javascript:alert(1)//{path}", "https://h/no-path"} {
		if _, err := ForRepo("", ir.Ref{Commit: "abc"}, tmpl, ""); err == nil {
			t.Errorf("accepted -link-template %q", tmpl)
		}
	}
}

func TestCompareURL(t *testing.T) {
	b, h := ir.Ref{Commit: "bbbb"}, ir.Ref{Commit: "hhhh"}
	cases := []struct {
		name, origin string
		base, head   ir.Ref
		want         string
	}{
		{"github ssh", "git@github.com:o/r.git", b, h, "https://github.com/o/r/compare/bbbb...hhhh"},
		{"gitlab https with credentials", "https://u:secret@gitlab.com/g/r.git", b, h, "https://gitlab.com/g/r/-/compare/bbbb...hhhh"},
		{"dirty head", "git@github.com:o/r.git", b, ir.Ref{Commit: "hhhh", Dirty: true}, ""},
		{"no base commit", "git@github.com:o/r.git", ir.Ref{}, h, ""},
		{"unknown host", "git@example.com:o/r.git", b, h, ""},
	}
	for _, c := range cases {
		if got := CompareURL(c.origin, c.base, c.head); got != c.want {
			t.Errorf("%s: CompareURL = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestBaseBlob(t *testing.T) {
	b := ir.Ref{Commit: "bbbb"}
	cases := []struct{ name, origin, tmpl, want string }{
		{"github", "git@github.com:o/r.git", "", "https://github.com/o/r/blob/bbbb/{path}#L{line}"},
		{"template with {commit}", "", "https://h/o/r/src/{commit}/{path}#L{line}", "https://h/o/r/src/bbbb/{path}#L{line}"},
		{"template without {commit}", "", "https://h/o/r/src/main/{path}#L{line}", ""},
		{"unknown host", "git@example.com:o/r.git", "", ""},
	}
	for _, c := range cases {
		if got := BaseBlob(c.origin, b, c.tmpl); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}
