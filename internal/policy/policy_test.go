package policy

import (
	"strings"
	"testing"

	"zu/internal/scan"
)

const full = `# zu's own Policy, abridged
exclude: ["**/*.pb.go", "web/node_modules/**"]
order: [zu/internal, zu/cmd]
levels:
  - [zu/internal/ir, zu/internal/version]
  - zu/internal/scan
  - [zu/internal/cli]
cycles: true
foreign: [github.com/aws]
omit: [zu/internal/scan/testdata]
omit-edges:
  - {from: zu/internal/cli, to: zu/internal/version}
edge-kinds:
  - {from: zu/internal/scan, to: zu/internal/cli, kind: association}
proposals:
  - name: Clean
    layers:
      - {name: Domain, members: [zu/internal/ir]}
      - {name: Adapters, members: [zu/internal/cli, zu/internal/gitref]}
`

func TestParseReadsEveryKey(t *testing.T) {
	p, err := Parse([]byte(full))
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Exclude) != 2 || len(p.Order) != 2 || !p.Cycles || len(p.Foreign) != 1 ||
		len(p.Omit) != 1 || len(p.OmitEdges) != 1 || len(p.EdgeKinds) != 1 || len(p.Proposals) != 1 {
		t.Fatalf("parsed %+v", p)
	}
	if got := len(p.Levels); got != 3 || len(p.Levels[0]) != 2 || p.Levels[1][0] != "zu/internal/scan" {
		t.Fatalf("levels = %v", p.Levels)
	}
	if !p.Rules() {
		t.Error("levels and cycles are rules")
	}
}

func TestParseRejects(t *testing.T) {
	for _, tc := range []struct{ name, yaml, want string }{
		{"unknown key", "layers: [a]\n", "field layers not found"},
		{"id in two levels", "levels: [a, [b, a]]\n", `"a" is already in levels[0]`},
		{"empty level", "levels: [[]]\n", "empty level"},
		{"bad id", "omit: [\"a b\"]\n", `bad id "a b"`},
		{"trailing slash", "order: [a/]\n", `bad id "a/"`},
		{"kind", "edge-kinds: [{from: a, to: b, kind: uses}]\n", `kind "uses"`},
		{"glob", "exclude: [\"a/[\"]\n", "exclude[0]"},
		{"level shape", "levels: [{a: b}]\n", "a level is an id or a list"},
		{"proposal name", "proposals: [{layers: [{name: x, members: [a]}]}]\n", "unique name"},
		{"proposal layers", "proposals: [{name: p, layers: []}]\n", "no layers"},
		{"second document", "cycles: true\n---\nlevels: [a]\n", "second"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse([]byte(tc.yaml))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want it to contain %q", err, tc.want)
			}
			if !strings.HasPrefix(err.Error(), FileName+": ") {
				t.Errorf("err %q does not name the file", err)
			}
		})
	}
}

func TestEmptyPolicyIsTheDefault(t *testing.T) {
	for _, src := range []string{"", "# nothing yet\n", "{}\n"} {
		p, err := Parse([]byte(src))
		if err != nil {
			t.Fatal(err)
		}
		if got := p.Hash(); got != scan.DefaultPolicyHash {
			t.Errorf("Hash(%q) = %s, want scan.DefaultPolicyHash %s", src, got, scan.DefaultPolicyHash)
		}
		if p.Rules() {
			t.Errorf("%q has rules", src)
		}
	}
}

func TestHashIgnoresFormAndCatchesMeaning(t *testing.T) {
	base := "levels: [[a, b], c]\nomit: [x, y]\n"
	hash := func(s string) string {
		t.Helper()
		p, err := Parse([]byte(s))
		if err != nil {
			t.Fatal(err)
		}
		return p.Hash()
	}
	want := hash(base)
	for _, same := range []string{
		"# a comment\nomit: [y, x, x]\nlevels:\n  - [b, a]\n  - [c]\n", // comments, key order, set order, duplicates
	} {
		if got := hash(same); got != want {
			t.Errorf("%q hashes differently from %q", same, base)
		}
	}
	if hash("exclude: [\"a/**/**/b\"]\n") != hash("exclude: [\"a/**/b\"]\n") {
		t.Error("a run of ** must hash like one **")
	}
	for _, other := range []string{
		"levels: [c, [a, b]]\nomit: [x, y]\n", // level order is meaning
		"levels: [[a, b], c]\nomit: [x]\n",
		"levels: [[a, b], c]\nomit: [x, y]\ncycles: true\n",
	} {
		if got := hash(other); got == want {
			t.Errorf("%q hashes like %q", other, base)
		}
	}
}
