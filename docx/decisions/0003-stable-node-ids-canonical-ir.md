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

Renaming a symbol shows as remove + add in the IR diff. The Change View pairs them
as a **Move** when exactly one removed and one added declaration of the same kind
share the same `shape` and draws that pair as one dashed arrow. The pairing lives in
the view; ids and the IR diff are unchanged (amended 2026-09-23, from the tool
comparison, C7). `hash` covers the declared name and receiver, so it cannot pair a
rename; each declaration node therefore also carries `shape`, its hash with its own
name and receiver type name blanked (amended 2026-09-24, feature 02 review). Moving a declaration between files in the same package is
not a change. Output ordering is part of the IR contract and must be tested.
