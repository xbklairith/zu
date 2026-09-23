# 0001. Ungrouped View plus `policy init`, not automatic clustering

- **Status:** accepted
- **Date:** 2026-09-23

## Context

Mode A must not "mirror the folder tree and call it an architecture". But a repository
nobody has configured has no Policy, and in Go the default grouping — one component
per package — *is* the folder tree. Something must decide what a first run shows,
and whatever it is must be deterministic: Mode B diffs two IRs, so a grouping that
shifts between commits turns every diff into noise.

## Decision

With no Policy, zu shows the Ungrouped View: one component per package, labelled
as ungrouped, with a banner pointing to `zu policy init`. `policy init` suggests a
starting Policy from the repository's structure; a person edits and commits it.

## Alternatives considered

- **Auto-cluster the import graph** (community detection). Looks like architecture
  on first run, but a single new import can move packages between clusters, so the
  same logical change produces different groupings on base and head. Breaks the
  determinism Mode B depends on.
- **Refuse to render until a Policy exists.** Honest, but puts friction on the very
  first run — the moment the tool has to earn a second look.

## Consequences

First runs are honest but visually flat on large repos; the value of zu grows with
the Policy, so `policy init` quality matters. Revisit if a clustering algorithm can
be shown stable under small import changes (e.g. anchored to committed seeds).
