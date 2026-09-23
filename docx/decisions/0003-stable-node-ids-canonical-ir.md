# 0003. Node ids from source identity; canonically ordered IR

- **Status:** accepted
- **Date:** 2026-09-23

## Context

Mode B diffs two IRs. If ids or ordering vary between runs, a diff reports noise as
change. Line numbers move in almost every MR; Go's `encoding/json` sorts map keys but
not slices, and a parallel parser emits in nondeterministic order.

## Decision

Node ids derive from import path plus declared name (`example.com/svc/store.Repo.Get`),
never from file path, line, or render order. Nodes and edges are sorted explicitly
before writing; `schemaVersion` is the first field. Same commit and policy produce a
byte-identical IR.

## Alternatives considered

- **Ids from path + line.** Simple and always unique, but every edit above a declaration
  renames it, so Mode B sees remove + add instead of modify.
- **Ids from a content hash.** Stable across moves, but any edit renames the node —
  "modified" becomes impossible to detect.

## Consequences

Renaming a symbol shows as remove + add; rename detection, if wanted, is a diff
heuristic layered on top. Moving a declaration between files in the same package is
not a change. Output ordering is part of the IR contract and must be tested.
