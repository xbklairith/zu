# 0002. Syntax-first analysis: go/parser only, certain edges only

- **Status:** accepted
- **Date:** 2026-09-23

## Context

zu must parse a checkout offline, with no running build (A1), and parse two refs for
Mode B. Go offers two depths: syntax (`go/parser`) and full type information
(`go/packages` + `go/types`). Only the latter sees interface dispatch and every call.

## Decision

Edges come from `go/parser` alone. No `go` toolchain, module cache or network at
runtime; files at a git ref are parsed in memory. Imports are exact. A `calls` edge is
emitted only when statically certain — qualified calls through an import, calls to
same-package top-level functions, method calls on receivers declared in the package.
Everything else is omitted and counted in the IR.

## Alternatives considered

- **Type-checked (`go/packages`).** Precise call graph, but shells out to `go list`,
  needs dependencies in the module cache (fails offline on a fresh clone), and Mode B
  would need real checkouts of both refs.
- **Hybrid — upgrade when types are available.** The same commit yields different IRs
  on different machines, which breaks determinism unless every diff checks analysis level.

## Consequences

Call graphs are incomplete by design, and the IR says by how much. `implements` edges
are out of reach. A type-checked level can be added later behind the parser interface;
an IR must then record its analysis level and `diff` must refuse mismatched levels.
