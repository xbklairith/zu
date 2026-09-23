# 0008. Package Tree by default; the Policy ranks and proposes, never invents boxes

- **Status:** accepted
- **Date:** 2026-09-23
- **Supersedes:** [0001](0001-ungrouped-view-over-auto-clustering.md)

## Context

0001 made the first-run view a flat Ungrouped View and gave the Policy the job of
assigning packages to named components. Comparing zu with uml-viewer (unclebob,
commit 79cc1ef) showed another stance that fits zu's rule "the model never authors
the graph" better: *"Do not invent layers. The tree is the namespaces."* In Go the
import-path hierarchy is that tree. It is deterministic, needs no configuration, and
nests to any depth (A3). A Policy that maps packages to invented boxes puts things
on the real diagram that do not exist in the code.

## Decision

- With or without a Policy, the Project View is the **Package Tree**: each module
  path is a root. Each further import-path segment is one nesting level. A package
  is drawn inside its nearest ancestor segment. Double-click drills in; Esc goes up.
- The Policy never assigns packages to components. It only orders boxes, ranks
  top-level segments into **Levels** (uml-viewer's `:levels`, listed inner first:
  a dependency from a higher-ranked level to a lower-ranked one is a violation,
  same rank is allowed, foreign or unranked ends are not compared), collapses
  **Foreign** module prefixes, overrides edge kinds, omits nodes or edges, and
  declares **Proposals**.
- A Proposal is a named regrouping of real packages. It is drawn only on request,
  under a "PROPOSAL, not instantiated in code" banner, and violations are
  re-evaluated for it.
- The tree is derived from node ids when a view is drawn. The IR records
  `grouping: "tree"` and adds no synthetic segment nodes.

## Alternatives considered

- **Keep 0001 (flat view + component-assigning Policy).** Gives first runs a
  flat picture on large repos. Components that don't exist in code sit on the
  main diagram.
- **Auto-cluster the import graph.** Rejected in 0001 for instability under small
  changes; still rejected.
- **Store segment nodes in the IR.** The tree is a pure function of the ids, so
  storing it would duplicate data, and every diff would carry it.

## Consequences

First runs show real structure with no Policy. The draft's warning against "mirror the
folder tree" is answered by making the tree explicit, not by hiding it: judgement lives
in Levels and Proposals, which are visibly separate from the code. `zu policy init`
becomes a Levels suggestion, not a component map. Repos with a flat package layout get
a flat tree. Proposals are the answer for them.
