# `zu diff` output contract

`zu diff` prints the **Structural Summary** of a change: head compared with the
merge-base of base and head. This page is the contract that CI jobs and other tools
can rely on. zu never calls a code-host API and ships no CI configuration; the
snippets below are descriptions to adapt.

## Usage

```
zu diff <base> [head] [-format text|markdown|json] [-worktree [-include-ignored]] [-max-parse-errors N]
```

Flags may come before or after the refs.

| Flag | Meaning |
|---|---|
| `<base>` | the branch or commit the change is measured against, usually the MR's target branch |
| `[head]` | the change; defaults to `HEAD` |
| `-format` | `text` (default, for a terminal), `markdown` (for an MR comment), `json` (for tools) |
| `-worktree` | compare the working tree instead of `HEAD`: the files the next commit would contain (tracked plus untracked, not ignored). Takes no `head` |
| `-include-ignored` | with `-worktree`, also read files git ignores |
| `-max-parse-errors N` | exit 2 when head has more than N files that fail to parse (default 0) |

Both sides are scanned from the repository top level, whatever the current
directory, so running from a subdirectory gives the same output. Nothing is written
to `.zu/`; the summary goes to stdout and one status line to stderr:

```
zu diff: <n> packages changed, <m> affected, parse errors base=<a> head=<b>
```

## Exit codes

| Code | When |
|---|---|
| 0 | the summary was printed, whatever it contains |
| 1 | reserved for new rule violations (the Policy feature) |
| 2 | the summary was printed, but head has more parse errors than `-max-parse-errors`. Base's parse errors already exist on the base branch: they are reported and never fail the MR |
| 3 | bad invocation: unknown or option-like ref, not a git repository, bad flag or format, `-include-ignored` without `-worktree`, `-worktree` with a head ref, no merge-base, changed policy, or Ctrl-C. Nothing is printed on stdout |

## The merge-base requirement

The base side is `git merge-base <base> <head>`, never the tip of base, so changes
that landed on the base branch after the fork do not show up as the MR's. A shallow
clone may hold no common ancestor. zu then exits 3 with:

```
no merge-base: the clone lacks shared history; fetch full history (e.g. actions/checkout fetch-depth: 0, or git fetch --unshallow)
```

It never falls back to comparing against the tip of base.

In CI, check out with full history (GitHub Actions: `actions/checkout` with
`fetch-depth: 0`; GitLab CI: `GIT_DEPTH: 0`), fetch the target branch, and run
`zu diff origin/<target> -format markdown > summary.md`. Post `summary.md` as the MR
comment with the host's own tooling. Use `-format json` to gate on a count, for
example on `len(affected)`.

## Not compared

Printed as the last line of every format:

> Not compared: go.mod changes (dependency versions, go and toolchain lines) and other
> languages' toolchain and dependency files.

## JSON (`summaryVersion` "1")

Two-space indentation, a trailing newline, fields in this order. Empty collections are
`[]` or `{}`, never `null`. For the same two commits (and a clean or identical working
tree) the output is byte-identical.

```json
{
  "summaryVersion": "1",
  "base": {"commit": "<merge-base id>", "dirty": false},
  "head": {"commit": "<head id>", "dirty": false},
  "changed": true,
  "packages": [
    {"id": "example.com/shop/internal/store", "status": "modified",
     "added": 0, "modified": 3, "removed": 1, "hops": 0}
  ],
  "imports": [
    {"from": "example.com/shop", "to": "example.com/shop/internal/money",
     "kind": "imports", "status": "added"}
  ],
  "edgeCounts": {"calls": {"added": 0, "removed": 2}, "embeds": {"added": 0, "removed": 1}},
  "moves": [
    {"from": "example.com/shop/internal/money.Add", "to": "example.com/shop/internal/money.Plus",
     "kind": "function"}
  ],
  "affected": [{"package": "example.com/shop/tools/gen", "hops": 1}],
  "nodes": [{"id": "example.com/shop/internal/store.ReadWriter", "kind": "type", "status": "removed"}],
  "parseErrors": {"base": [], "head": [{"path": "a/bad.go", "message": "…"}]},
  "notCompared": "Not compared: …"
}
```

| Field | Meaning |
|---|---|
| `summaryVersion` | `"1"`. A tool should refuse a version it does not know |
| `base`, `head` | the IR refs compared. `base.commit` is the merge-base. `head.dirty` is true under `-worktree` when a tracked file is modified or an untracked (or included ignored) file is read |
| `changed` | false when nothing below differs |
| `packages` | one row per changed package, in reading order: bottom-up by imports (leaves first; one import cycle shares a rank), then by id. `status` is `added`, `modified` or `removed`; `added`/`modified`/`removed` count the package's declarations (types and functions, methods included) with that status, Moves excluded; `hops` is 0 |
| `imports` | changed import edges, sorted by (from, to). `status` is `added`, `removed` or `reversed`; a reversed pair (`a→b` removed, `b→a` added) is one entry in head's direction |
| `edgeCounts` | added and removed `calls` and `embeds` edges, as counts only |
| `moves` | declarations renamed or moved, sorted by `from` (ADR 0003): one removed and one added declaration of the same kind with equal `shape`, the only such pair, keeping its package or its name. Neither id appears in `nodes` or the counts |
| `affected` | the Affected Set (ADR 0009): the changed packages at hop 0 plus every package that transitively imports one, over head's imports, with its shortest hop distance; sorted by (hops, package). Its length is the blast-radius count, a package count |
| `nodes` | every node change (packages, declarations and external modules), sorted by id. A package whose only change is outside its declarations (a `const`, a `var`, an import) is `modified` with zero declaration counts |
| `parseErrors` | each side's files that failed to parse |
| `notCompared` | the sentence above |

Statuses follow the glossary's *Change Status*: a node present only in head is
`added`, only in base `removed`, in both with a different `hash` `modified`.
External modules have no hash, so they are only ever added or removed. Edges are matched
by (from, to, kind); an edge whose only difference is its source location is not a
change.

## Markdown

For an MR comment, at most 65,536 bytes. Sections, in order:

1. `### zu · structural change`
2. `base <12> (merge-base) → head <12>`, with ` (worktree)` after head when it is dirty
3. the counts line: packages, declarations `+added ~modified −removed`, dependency changes, moves
4. the package table: `Package | Change | + ~ − | Hops`, ids in code spans with `|` escaped
5. **Dependencies**: `+`, `−` and `⇄ … (reversed)` lines
6. **Moves**
7. `Affected: N packages (c changed, k at 1 hop, …)`, N being the whole Affected Set
8. `Calls: +a −r · Embeds: +a −r`
9. a Mermaid `flowchart BT` of the changed packages plus their direct importers
   (dimmed with `classDef dim`) and head's imports between them. Node ids are
   generated (`n1`, `n2`, … in row order) and labels quoted, so no package id can
   break it. Above 30 packages it is replaced by
   `_Diagram omitted: N packages (limit 30)._`
10. `Parse errors: base a, head b`
11. the not-compared footer

When the whole comment would exceed the budget, the package table is cut first, then
the lists, each ending with `…and N more`. The counts, the Affected line and the
footer are always kept. With no change, sections 3–9 are replaced by
`no structural change`.

## Text

The same content as Markdown without the table markup and the diagram, for a terminal.
