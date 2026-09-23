package diff

import (
	"bytes"
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"zu/internal/policy"
)

var (
	known = policy.Violation{Rule: policy.RuleLevels, From: "m/a", To: "m/b"}
	fresh = policy.Violation{Rule: policy.RuleCycle, From: "m/c", To: "m/d"}
	gone  = policy.Violation{Rule: policy.RuleLevels, From: "m/e", To: "m/f"}
)

func TestViolationsNewAreInHeadOnly(t *testing.T) {
	d := Violations([]policy.Violation{known, gone}, []policy.Violation{fresh, known})
	if !slices.Equal(d.New, []policy.Violation{fresh}) || !slices.Equal(d.Fixed, []policy.Violation{gone}) || d.Known != 1 {
		t.Fatalf("Violations = %+v", d)
	}
	if e := Violations(nil, nil); e.New == nil || e.Fixed == nil {
		t.Error("empty lists encode as [], not null")
	}
}

func TestRenderPutsNewViolationsFirst(t *testing.T) {
	base, head := shopPair(t)
	s := Summarize(base, head)
	s.Violations = Violations([]policy.Violation{known}, []policy.Violation{known, fresh})
	for _, md := range []bool{false, true} {
		out := render(t, s, md)
		v, p := strings.Index(out, "New violations"), strings.Index(out, "Packages")
		if md {
			p = strings.Index(out, "| Package |")
		}
		if v < 0 || p < 0 || v > p {
			t.Fatalf("md=%v: new violations must come before the packages:\n%s", md, out)
		}
		if !strings.Contains(out, "m/c") || strings.Contains(out, "m/a → m/b") || strings.Contains(out, "`m/a` → `m/b`") {
			t.Errorf("md=%v: only new violations are listed:\n%s", md, out)
		}
		if !strings.Contains(out, "1 pre-existing") {
			t.Errorf("md=%v: pre-existing count missing:\n%s", md, out)
		}
	}
	var buf bytes.Buffer
	if err := WriteJSON(&buf, s); err != nil {
		t.Fatal(err)
	}
	var back struct {
		Violations *ViolationDelta `json:"violations"`
	}
	if err := json.Unmarshal(buf.Bytes(), &back); err != nil || back.Violations == nil || len(back.Violations.New) != 1 {
		t.Fatalf("JSON violations = %+v, %v", back.Violations, err)
	}
}

func TestNoPolicyRulesNoViolationsSection(t *testing.T) {
	base, head := shopPair(t)
	s := Summarize(base, head)
	var buf bytes.Buffer
	if err := WriteJSON(&buf, s); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(buf.String(), `"violations"`) || strings.Contains(render(t, s, false), "violations") {
		t.Fatal("without rules the summary is exactly 03's")
	}
}
