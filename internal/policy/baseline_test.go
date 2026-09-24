package policy

import (
	"bytes"
	"slices"
	"strings"
	"testing"
)

var (
	vA = Violation{RuleLevels, "m/a", "m/b"}
	vB = Violation{RuleCycle, "m/c", "m/d"}
	vC = Violation{RuleLevels, "m/e", "m/f"}
)

func TestBaselineRoundTripsSorted(t *testing.T) {
	b := &Baseline{PolicyHash: "sha256:p", Violations: []Violation{vC, vA, vB, vA}}
	var buf bytes.Buffer
	if err := b.Encode(&buf); err != nil {
		t.Fatal(err)
	}
	want := `{
  "schema": "1",
  "policyHash": "sha256:p",
  "violations": [
    {
      "rule": "levels",
      "from": "m/a",
      "to": "m/b"
    },
    {
      "rule": "levels",
      "from": "m/e",
      "to": "m/f"
    },
    {
      "rule": "cycle",
      "from": "m/c",
      "to": "m/d"
    }
  ]
}
`
	if buf.String() != want {
		t.Fatalf("Encode =\n%s\nwant\n%s", buf.String(), want)
	}
	back, err := DecodeBaseline(buf.Bytes())
	if err != nil || back.PolicyHash != "sha256:p" || !slices.Equal(back.Violations, []Violation{vA, vC, vB}) {
		t.Fatalf("DecodeBaseline = %+v, %v", back, err)
	}
	var empty bytes.Buffer
	if err := (&Baseline{PolicyHash: "sha256:p"}).Encode(&empty); err != nil || !strings.Contains(empty.String(), `"violations": []`) {
		t.Fatalf("an empty Baseline lists [], got %s", empty.String())
	}
}

func TestDecodeBaselineRejects(t *testing.T) {
	for _, src := range []string{`{"schema":"2","policyHash":"x","violations":[]}`, `{"schema":"1","extra":1}`, `not json`} {
		if _, err := DecodeBaseline([]byte(src)); err == nil || !strings.HasPrefix(err.Error(), BaselineFile+": ") {
			t.Errorf("DecodeBaseline(%s) = %v, want an error naming the file", src, err)
		}
	}
}

func TestSplitAndUpdate(t *testing.T) {
	base := &Baseline{PolicyHash: "sha256:p", Violations: []Violation{vA, vB}}
	fresh, fixed := base.Split([]Violation{vA, vC})
	if !slices.Equal(fresh, []Violation{vC}) || !slices.Equal(fixed, []Violation{vB}) {
		t.Fatalf("Split = %v, %v", fresh, fixed)
	}
	if u, err := base.Update([]Violation{vA, vC}, "sha256:p"); err != nil || !slices.Equal(u.Violations, []Violation{vA}) {
		t.Errorf("Update only removes fixed entries, got %v, %v", u, err)
	}
	var none *Baseline
	if u, err := none.Update([]Violation{vC, vA}, "sha256:p"); err != nil || !slices.Equal(u.Violations, []Violation{vA, vC}) || u.PolicyHash != "sha256:p" {
		t.Errorf("no Baseline: Update records everything, got %+v, %v", u, err)
	}
	if !base.Stale("sha256:q") || base.Stale("sha256:p") || none.Stale("sha256:q") {
		t.Error("Stale compares the recorded Policy hash; no Baseline is never stale")
	}
	if u, err := base.Update([]Violation{vC}, "sha256:q"); err == nil || !strings.Contains(err.Error(), "sha256:p") {
		t.Errorf("stale Baseline: Update must refuse, got %v, %v", u, err)
	}
	if fresh, _ := none.Split([]Violation{vA}); !slices.Equal(fresh, []Violation{vA}) {
		t.Errorf("no Baseline: everything is new, got %v", fresh)
	}
}
