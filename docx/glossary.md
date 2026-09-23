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

## Test Corpus

The pinned set of public Go repositories zu is measured against — one per size tier
(zu itself, spf13/cobra, gohugoio/hugo, kubernetes/kubernetes). Pinned to tags so
results repeat; fetched on demand, never committed.

## Project View

The Mode A picture: a repository's components, their layering, and the direction of
their dependencies at one ref. Answers "how is this built?". Distinct from the Change
View, which answers "what did this change do to it?".

## Change View

The Mode B picture: the Project View of the head ref with every component and
dependency marked added, removed, modified or unchanged, new rule violations called
out, and each affected component labelled with its hop distance from the change.

## HTML Export

A single self-contained HTML file holding a Project View or Change View together with
the UI, the IR and only the source worth reading: meaningfully changed files in a
Change View, explicitly included packages in a Project View. Opens in any browser with
no zu install, server or network. Carries the same sensitivity as the source it holds.

## Meaningful Change

A change to a declaration that survives formatting normalisation. Reformatting and
comment-only edits are not meaningful changes: they neither mark a component modified
nor pull source into an HTML Export.

## IR

The intermediate representation `zu scan` writes: every package, type and function of
a repository at one ref, the dependencies between them, and a source location for each.
The only thing any view reads. Same inputs, byte-identical IR.

## Certain Call

A call zu can attribute to one declaration from syntax alone: `pkg.F()` through an
import, `F()` within the same package, or `r.M()` on a method's own receiver. Only
certain calls become `calls` edges.

## Unresolved Call

Any other call into this repository's code — through a variable, field, interface or
function value. Never drawn; counted per package, so a view can say how much it is not
showing.
