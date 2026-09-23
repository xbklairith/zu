# Glossary

Canonical terms for zu. Definitions only — how things are built lives in specs and ADRs.

## Policy

A committed, human-reviewed file (`zu.policy.yaml`) that orders boxes, ranks Levels,
collapses Foreign prefixes, overrides edge kinds, omits nodes or edges, and declares
Proposals. It never assigns packages to boxes that do not exist in the code. The only
place architectural judgement enters zu. A Model Provider may
propose changes to it, only ever as a patch a person accepts or rejects.

## Package Tree

The structure every Project View draws: each module path is a root, each further
import-path segment one nesting level, each package inside its nearest ancestor. It is
the code's own hierarchy, never an invented one. Replaces the retired *Ungrouped View*.

## Level

A rank the Policy gives to top-level Package Tree segments, listed inner first. A
dependency from a higher-ranked Level to a lower-ranked one is a violation.

## Foreign

An external module drawn as an oval outside the Package Tree. The Policy can collapse
several module paths under one prefix, or omit them.

## Proposal

A named regrouping of real packages, declared in the Policy and drawn only on request
under a "not instantiated in code" banner. A what-if, never the default picture.

## Baseline

The committed, sorted list of known violations (`zu.baseline.json`). `check` fails only
on violations not in it; entries are only ever removed.

## Affected Set

In a Change View, the changed packages plus every package that imports them, directly
or transitively, each with its hop distance. Computed over import edges, which are
always complete, not over calls, which are only drawn when certain. Its size is the
blast-radius count in the Structural Summary.

## Base

The merge-base commit of the base ref and the head: the left side of a Change View.
Not the base branch itself, whose newer commits are not part of the change.

## Change Status

How a node or edge differs between Base and head: *added*, *removed*, *modified*
(nodes only: its hash differs) or *unchanged*. A package dependency that is removed
in one direction and added in the other is *reversed*. The same words are used in
docs, output and JSON.

## Move

A removed and an added declaration with identical `hash`, shown as one moved node
rather than a removal plus an addition.

## Structural Summary

The Mode B output meant for a merge request: the packages a change touches, the
dependencies it adds or removes, the blast-radius count, and any structural rule it
newly violates, plus a small Mermaid diagram of the changed packages. It says "no
structural change" when a change has no Meaningful Change. zu writes it as text,
Markdown or JSON;
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

The Mode A picture: a repository's Package Tree, its Levels, and the direction of its
dependencies at one ref. Answers "how is this built?". Distinct from the Change
View, which answers "what did this change do to it?".

## Change View

The Mode B picture: the Project View of the head ref, compared against the merge-base.
Every package and dependency is marked added, removed, modified or unchanged. New rule
violations are called out, the Affected Set is outlined, Moves are dashed, and unchanged
neighbours one hop away are dimmed.

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
