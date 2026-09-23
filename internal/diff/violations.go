package diff

import (
	"fmt"
	"strings"

	"zu/internal/policy"
)

// ViolationDelta is how a change moved the Policy's violations (B7): New are
// in head and not in base, Fixed in base and not in head, Known in both.
type ViolationDelta struct {
	New   []policy.Violation `json:"new"`
	Fixed []policy.Violation `json:"fixed"`
	Known int                `json:"known"`
}

// Violations compares base's and head's violations, both evaluated under
// head's Policy (ADR 0004).
func Violations(base, head []policy.Violation) *ViolationDelta {
	fresh, fixed := (&policy.Baseline{Violations: base}).Split(head)
	return &ViolationDelta{New: orEmpty(fresh), Fixed: orEmpty(fixed), Known: len(head) - len(fresh)}
}

// violationsBlock is the section every format writes first (decisions:
// "new violations first"), with at most items new violations listed.
func violationsBlock(d *ViolationDelta, md bool, items int) string {
	var b strings.Builder
	tail := fmt.Sprintf("%d fixed, %d pre-existing", len(d.Fixed), d.Known)
	if len(d.New) == 0 {
		b.WriteString("No new violations · " + tail + "\n")
		return b.String()
	}
	if md {
		fmt.Fprintf(&b, "**New violations (%d)**\n\n", len(d.New))
	} else {
		fmt.Fprintf(&b, "New violations (%d):\n", len(d.New))
	}
	for _, v := range d.New[:min(items, len(d.New))] {
		if md {
			fmt.Fprintf(&b, "- %s `%s` → `%s`\n", v.Rule, v.From, v.To)
		} else {
			fmt.Fprintf(&b, "  %-6s  %s → %s\n", v.Rule, v.From, v.To)
		}
	}
	more(&b, len(d.New)-items)
	if md {
		b.WriteString("\n")
	}
	b.WriteString(tail + "\n")
	return b.String()
}

func newCount(s *Summary) int {
	if s.Violations == nil {
		return 0
	}
	return len(s.Violations.New)
}
