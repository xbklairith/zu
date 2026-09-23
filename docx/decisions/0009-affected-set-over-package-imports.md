# 0009. The Affected Set is computed over package imports, not calls

- **Status:** accepted
- **Date:** 2026-09-24

## Context

The Structural Summary reports a blast-radius count (B4): everything that depends on
what a change touched. zu records dependencies at two grains. Import edges are
complete: every import in the source becomes an edge or a count. Call edges are drawn
only when certain (0002), so interface calls, calls through variables and `v.M()` never
appear. A reader of the count cannot tell which of the two it was built from.

## Decision

The Affected Set is the changed packages plus every package that imports one of them,
transitively, over the head IR's `imports` edges, each with its hop distance. The
blast-radius count is a package count.

## Alternatives considered

- **Declarations over calls and embeds.** Finer, but it undercounts by an amount that
  depends on how much code uses interfaces, and the summary cannot show the gap.
- **Both: packages for the count, declarations as detail.** More information, but two
  numbers that disagree on every MR invite the wrong one to be trusted.

## Consequences

The count is an over-approximation at package grain: a package that imports a changed
package but uses none of the changed declarations is still counted. CI gates or trend
charts built on the number depend on this definition, so moving to a finer grain later
is a breaking change to the Structural Summary.
