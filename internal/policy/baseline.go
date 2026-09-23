package policy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"slices"
)

// BaselineFile is the committed list of known violations, at the repo root.
const BaselineFile = "zu.baseline.json"

// Baseline records the violations a team has accepted, under the Policy
// whose hash it names. check fails only on violations not in it.
type Baseline struct {
	Schema     string      `json:"schema"`
	PolicyHash string      `json:"policyHash"`
	Violations []Violation `json:"violations"`
}

// DecodeBaseline reads a Baseline strictly: unknown keys and another schema
// are errors.
func DecodeBaseline(data []byte) (*Baseline, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	b := &Baseline{}
	if err := dec.Decode(b); err != nil {
		return nil, fmt.Errorf("%s: %w", BaselineFile, err)
	}
	if b.Schema != "1" {
		return nil, fmt.Errorf("%s: schema %q, want \"1\"", BaselineFile, b.Schema)
	}
	return b, nil
}

// Encode writes b sorted and de-duplicated, two-space indented, with a
// trailing newline, so the committed file changes only when its content does.
func (b *Baseline) Encode(w io.Writer) error {
	out := Baseline{Schema: "1", PolicyHash: b.PolicyHash, Violations: sorted(b.Violations)}
	if out.Violations == nil {
		out.Violations = []Violation{}
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	return enc.Encode(out)
}

// Split separates current violations into those the Baseline does not know
// (fresh) and returns the Baseline entries no longer found (fixed). A nil
// Baseline knows nothing.
func (b *Baseline) Split(current []Violation) (fresh, fixed []Violation) {
	var known []Violation
	if b != nil {
		known = b.Violations
	}
	for _, v := range sorted(current) {
		if !slices.Contains(known, v) {
			fresh = append(fresh, v)
		}
	}
	for _, v := range sorted(known) {
		if !slices.Contains(current, v) {
			fixed = append(fixed, v)
		}
	}
	return fresh, fixed
}

// Stale reports whether b was written under a Policy other than the one
// whose hash is policyHash. A nil Baseline is never stale.
func (b *Baseline) Stale(policyHash string) bool {
	return b != nil && b.PolicyHash != policyHash
}

// Update is the Baseline -update-baseline writes. Entries are only ever
// removed: under the same Policy it drops the fixed ones. With no Baseline
// it records every current violation, which the caller lists. A stale
// Baseline is an error, because re-recording it would accept new
// violations unseen; it has to be deleted first.
func (b *Baseline) Update(current []Violation, policyHash string) (*Baseline, error) {
	if b == nil {
		return &Baseline{Schema: "1", PolicyHash: policyHash, Violations: sorted(current)}, nil
	}
	if b.Stale(policyHash) {
		return nil, fmt.Errorf("%s was written under Policy %s, not %s", BaselineFile, b.PolicyHash, policyHash)
	}
	var keep []Violation
	for _, v := range b.Violations {
		if slices.Contains(current, v) {
			keep = append(keep, v)
		}
	}
	return &Baseline{Schema: "1", PolicyHash: policyHash, Violations: sorted(keep)}, nil
}

func sorted(vs []Violation) []Violation {
	out := slices.Clone(vs)
	slices.SortFunc(out, Compare)
	return slices.Compact(out)
}
