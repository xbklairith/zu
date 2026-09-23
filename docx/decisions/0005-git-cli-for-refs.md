# 0005. Read git refs through the git CLI, not go-git

- **Status:** accepted
- **Date:** 2026-09-23

## Context

Mode B reads files at two refs without a second checkout. The draft's N1 asks for one
executable with no runtime; a pure-Go git library would honour that most strictly.

## Decision

Shell out to `git merge-base`, `git ls-tree -r` and `git cat-file --batch`, behind a
small `RefReader` interface that tests fake. Mode A on a working tree needs no git.

## Alternatives considered

- **go-git.** No external binary, but slower on large packfiles, lags git on partial
  clones, sparse checkouts and SHA-256 repositories, and adds a large dependency tree.

## Consequences

`zu diff` requires `git` on PATH — present on every dev machine and CI image. The
interface keeps a go-git adapter possible if a git-less environment ever matters.
