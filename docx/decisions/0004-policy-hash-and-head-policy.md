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

**Amended 2026-09-24 (feature 06):** `diff` reads the Policy once, from head (the working tree under `-worktree`), and applies it to both scans, so both IRs carry head's hash and there is no mismatch to stop on. An MR that adds or edits the Policy gets a structural diff under head's rules; a new violation is one present in head and absent in base, both under head's rules. The stop-on-mismatch clause guarded against regrouping noise, and 0008 removed Policy grouping; scanning base under head's `exclude` globs keeps a newly excluded directory from showing as removed. `zu scan -ref X` still uses X's own Policy, and the hash stays in the IR for `check` against the Baseline.
