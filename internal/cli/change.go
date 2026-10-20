package cli

import (
	"context"
	"errors"
	"fmt"

	"zu/internal/diff"
	"zu/internal/export"
	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/scan"
)

// viewOf is the View a session serves for doc, head's IR, sorted: the
// Project View or, with -base (14), the Change View of doc against the
// merge-base of the base ref and HEAD, the one zu diff -worktree -html writes.
// The merge-base is found again on each rescan; its IR is scanned again
// only when the merge-base or head's Policy hash moved (ADR 0004).
func (s *session) viewOf(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures) (*export.View, error) {
	if s.base == "" {
		return projectView(ctx, "serve", src, doc, pol, ms, s.o, s.every, s.stderr)
	}
	if doc.Ref.Commit == "" {
		return nil, errors.New("-base: HEAD has no commit yet")
	}
	_, baseCommit, err := gitResolve(ctx, s.dir, s.base)
	if err != nil {
		return nil, err
	}
	mb, err := gitMergeBase(ctx, s.dir, baseCommit, doc.Ref.Commit)
	if err != nil {
		return nil, err
	}
	tree, err := openCommit(ctx, s.dir, mb) // for the base side of the hunks
	if err != nil {
		return nil, err
	}
	defer tree.Close()
	if s.baseDoc == nil || s.baseDoc.Ref.Commit != mb || s.baseDoc.PolicyHash != pol.Hash() {
		s.baseDoc = nil
		d, _, err := scanTree(ctx, tree, pol)
		if treeErr := tree.Err(); treeErr != nil {
			err = treeErr
		}
		if err != nil {
			return nil, fmt.Errorf("base %s: %w", mb[:min(12, len(mb))], err)
		}
		d.Ref = ir.Ref{Commit: mb}
		ir.Sort(d) // once, as head's IR is on each rescan: Compare then merges the two (16)
		s.baseDoc = d
	}
	delta := diff.Compare(s.baseDoc, doc)
	sum := diff.SummarizeDelta(s.baseDoc, doc, delta)
	if pol.Rules() {
		sum.Violations = diff.Violations(pol.Check(s.baseDoc), pol.Check(doc))
	}
	c := changeSides{top: s.dir, base: s.baseDoc, head: doc, baseTree: tree, headTree: src.tree, pol: pol, measures: ms, delta: delta}
	return changeView(ctx, "serve", c, sum, s.o, s.stderr)
}
