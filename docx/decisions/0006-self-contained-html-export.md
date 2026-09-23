# 0006. A self-contained HTML file is the primary deliverable, with source inlined

- **Status:** accepted
- **Date:** 2026-09-23

## Context

zu exists to make a project and a code change understandable through interactive
diagrams. The original plan served the UI from `zu serve` on localhost. But the person
who most needs the Change View — a reviewer — rarely has zu installed, and a CI job
has no browser. Whatever the reviewer opens must work without zu, without a server,
and without network.

## Decision

`zu scan -html` and `zu diff -html` write one self-contained HTML file: the UI bundle,
the IR, and the full source of every package included in the view, all inlined. The
same UI bundle later backs `zu serve` for live local use and watch mode. The file is
the unit that is shared, attached to CI, and opened by reviewers.

## Alternatives considered

- **`serve` only.** Live source and watch mode, but every viewer must install and run zu.
- **HTML file with links to the code host.** Small files, but needs network and a
  reachable host, and fails for private repos the reader cannot access.
- **Inline only the hunks of changed packages.** Small, but drill-down stops at the
  edge of the change — the surrounding code a reviewer needs is missing.

## Consequences

- The file *is* the source code: sharing it shares the code, with the same sensitivity
  as the repository. Documentation and CLI output must say so.
- File size grows with the view; large repos need a size budget and a stated fallback.
- The IR, UI and source must all be safe to inline: source is escaped, never rendered
  as markup, and the page makes no network requests.
- `serve` becomes an optional convenience, not a dependency of Mode A or Mode B.
