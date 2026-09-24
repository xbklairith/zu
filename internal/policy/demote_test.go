package policy

import (
	"strings"
	"testing"
)

func TestDemotedByConventionalName(t *testing.T) {
	p := &Policy{}
	for _, tc := range []struct{ id, dir, want string }{
		{"m/test/e2e/x", "test/e2e/x", DemotedName},
		{"m/internal/htesting", "internal/htesting", DemotedName}, // *testing
		{"k8s.io/sample-apiserver", "staging/src/k8s.io/sample-apiserver", DemotedName},
		{"k8s.io/kubernetes/hack/tools/lint", "hack/tools/lint", DemotedName},
		{"m/examples/basic", "examples/basic", DemotedName},
		{"m/third_party/forked", "third_party/forked", DemotedName},
		{"m/pkg/contest", "pkg/contest", ""},        // a whole segment, not a substring
		{"golang.org/x/tools/go/ast", "go/ast", ""}, // the module path is not a directory
		{"m", ".", ""},
	} {
		if got := p.Demoted(tc.id, tc.dir, false); got != tc.want {
			t.Errorf("Demoted(%s, %s) = %q, want %q", tc.id, tc.dir, got, tc.want)
		}
	}
}

func TestDemotedGenerated(t *testing.T) {
	p := &Policy{}
	if got := p.Demoted("m/client/typed", "client/typed", true); got != DemotedGenerated {
		t.Errorf("a generated package = %q, want %q", got, DemotedGenerated)
	}
	if got := p.Demoted("m/test/gen", "test/gen", true); got != DemotedName {
		t.Errorf("a name wins over generated: %q", got)
	}
}

func TestDemotedByPolicyGlobs(t *testing.T) {
	p, err := Parse([]byte("demote: [\"**/docshelper\", \"!k8s.io/kubernetes/test\", \"!m/gen\"]\n"))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		id, dir   string
		generated bool
		want      string
	}{
		{"github.com/gohugoio/hugo/docshelper", "docshelper", false, DemotedName},
		{"github.com/gohugoio/hugo/docshelper/x", "docshelper/x", false, DemotedName}, // under a matched box
		{"k8s.io/kubernetes/test/utils", "test/utils", false, ""},                     // "!" keeps it
		{"k8s.io/kubernetes/test", "test", false, ""},
		{"m/gen", "gen", true, ""}, // "!" keeps a generated package too
		{"k8s.io/kubernetes/hack", "hack", false, DemotedName},
	} {
		if got := p.Demoted(tc.id, tc.dir, tc.generated); got != tc.want {
			t.Errorf("Demoted(%s) = %q, want %q", tc.id, got, tc.want)
		}
	}
}

func TestParseDemoteAndBudget(t *testing.T) {
	p, err := Parse([]byte("demote: [\"**/tools\", \"!m/tools\"]\nbudget: 20\n"))
	if err != nil || len(p.Demote) != 2 || p.Budget == nil || *p.Budget != 20 {
		t.Fatalf("parsed %+v, %v", p, err)
	}
	for _, tc := range []struct{ yaml, want string }{
		{"demote: [\"!\"]\n", "demote[0]"},
		{"demote: [\"a/[\"]\n", "demote[0]"},
		{"demote: [\"/a\"]\n", "demote[0]"},
		{"budget: 0\n", "budget"},
		{"budget: -3\n", "budget"},
		{"budget: 1000\n", "budget"},
		{"budget: many\n", "unmarshal"},
	} {
		if _, err := Parse([]byte(tc.yaml)); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("Parse(%q) = %v, want an error naming %s", tc.yaml, err, tc.want)
		}
	}
}

// 12: demote and budget only change what the first view draws, never the IR,
// a violation or a Baseline, so they stay out of the hash (ADR 0004 hashes the
// rules) and an existing Baseline stays valid.
func TestHashIgnoresDemoteAndBudget(t *testing.T) {
	hash := func(s string) string {
		t.Helper()
		p, err := Parse([]byte(s))
		if err != nil {
			t.Fatal(err)
		}
		return p.Hash()
	}
	if hash("budget: 15\n") != hash("") || hash("demote: [a, \"!b\"]\n") != hash("") {
		t.Error("budget and demote must not change the hash")
	}
	if p, _ := Parse([]byte("budget: 20\ndemote: [b, a]\n")); *p.Normalize().Budget != 20 || len(p.Normalize().Demote) != 2 {
		t.Error("Normalize keeps them for the View")
	}
}
