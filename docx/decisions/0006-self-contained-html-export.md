# 0006. A self-contained HTML file is the primary deliverable, carrying only code worth reading

- **Status:** accepted
- **Date:** 2026-09-23 (source scope narrowed the same day, before any implementation)

## Context

zu exists to make a project and a code change understandable through interactive
diagrams. The original plan served the UI from `zu serve` on localhost. But the person
who most needs the Change View — a reviewer — rarely has zu installed, and a CI job
has no browser. Whatever the reviewer opens must work without zu, without a server,
and without network.

## Decision

`zu scan -html` and `zu diff -html` write one self-contained HTML file: the UI bundle,
the IR, and only the source worth reading, all inlined:

- **Change View:** full source at head of every file with a meaningful change, plus
  its hunks. A change is meaningful only if the declaration differs after formatting
  normalisation — `gofmt`-only and comment-only edits do not count. Unchanged
  neighbours appear in the diagram without source.
- **Project View:** no source by default; `-include <package glob>` adds the packages
  of interest. The
same UI bundle later backs `zu serve` for live local use and watch mode. The file is
the unit that is shared, attached to CI, and opened by reviewers.

## Alternatives considered

- **`serve` only.** Live source and watch mode, but every viewer must install and run zu.
- **HTML file with links to the code host.** Small files, but needs network and a
  reachable host, and fails for private repos the reader cannot access.
- **Inline all source of every visible package.** Fully browsable offline, but a large
  repository produces files of hundreds of megabytes, and most of that code is not
  what the reader came for.
- **Inline only hunks.** Smallest, but a hunk without its surrounding file is hard to
  read.

## Consequences

- The file contains source: sharing it shares that code, with the same sensitivity as
  the repository. Documentation and CLI output must say so.
- File size tracks the size of the change, not of the repository, so no size budget
  is needed for the Change View.
- "Meaningful change" is defined once, by the IR's normalised declaration hash, and
  shared by colouring and source inclusion.
- The IR, UI and source must all be safe to inline: source is escaped, never rendered
  as markup, and the page makes no network requests.
- `serve` becomes an optional convenience, not a dependency of Mode A or Mode B.
