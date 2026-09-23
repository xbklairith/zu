# Glossary

Canonical terms for zu. Definitions only — how things are built lives in specs and ADRs.

## Policy

A committed, human-reviewed file that assigns packages to Components and declares
layering rules. The only place grouping judgement enters zu. A Model Provider may
propose changes to it, only ever as a patch a person accepts or rejects.

## Ungrouped View

What zu shows for a repository that has no Policy: one component per Go package,
explicitly labelled as ungrouped, with a pointer to `zu policy init`. It is an honest
fallback, not an architecture — zu never presents the folder tree as one.

## Structural Summary

The Mode B output meant for a merge request: the components a change touches, the
dependencies it adds or removes, and any structural rule it newly violates, plus a
small Mermaid diagram of the changed components. zu writes it as Markdown and JSON;
posting it to the MR is the CI pipeline's job, not zu's.

## Model Provider

An optional, explicitly configured language model. It may propose Policy patches and
write prose (architecture narrative, change summary). It never produces a node, an
edge, or a file path that reaches the diagram.
