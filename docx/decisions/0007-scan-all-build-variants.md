# 0007. Scan every build variant; merge duplicate declarations

- **Status:** accepted
- **Date:** 2026-09-23

## Context

Go selects source files by build constraints (`//go:build linux`, `_windows.go`
suffixes, custom tags) at compile time. A scan that evaluates them for the machine it
runs on produces a different IR on a Mac and on a Linux CI runner — breaking the
byte-identical output that Mode B relies on ([0003](0003-stable-node-ids-canonical-ir.md)).

## Decision

Parse every `.go` file regardless of build constraints, except files constrained by
`//go:build ignore`. Declarations that share an id across variants — the same function
in `sys_linux.go` and `sys_windows.go`, or several `init` functions — merge into one
node carrying every location, with its hash computed over the declarations in path order.

## Alternatives considered

- **Evaluate for the host platform.** Matches `go build` exactly, but the IR depends on
  who runs the scan.
- **Evaluate for a fixed target (linux/amd64).** Deterministic, but silently drops
  darwin- and windows-only code from the picture.

## Consequences

The IR describes the union of all platforms, which no single build compiles — a node
may have several locations, and platform-only edges appear alongside the rest. A
change to a single platform variant still changes the merged node's hash. Supporting
per-platform views later means recording each location's constraint, not re-scanning.
