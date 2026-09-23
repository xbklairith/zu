# 0004. Policy hash over parsed rules; diff groups both refs with head's policy

- **Status:** accepted
- **Date:** 2026-09-23

## Context

Grouping comes from the Policy, and a diff between IRs grouped by different policies
is mostly regrouping noise. The draft makes a `policyHash` mismatch undiffable. Two
questions follow: what the hash covers, and which policy a two-ref diff uses when
the Policy file itself exists at both refs.

## Decision

`policyHash` is computed over the normalised, parsed rules — not the file's bytes —
so editing a comment or reordering keys does not change it. The built-in default
grouping (the Package Tree with an empty Policy, see 0008) has a hash too. `diff` groups both refs with the head ref's
Policy; if the change modifies the Policy's rules, zu reports the mismatch and stops.

## Alternatives considered

- **Hash raw bytes.** Trivial, but a whitespace edit makes two IRs undiffable.
- **Each ref uses its own Policy.** Faithful to history, but any Policy edit in the MR
  turns the structural diff into a regrouping diff.

## Consequences

An MR that changes the Policy cannot get a structural diff in the same run — it must
be reviewed as a Policy change. Normalisation rules become part of the Policy format
and need tests.
