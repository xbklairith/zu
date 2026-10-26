# 09 · Distribution (v0.1) — acceptance

Measured 2026-09-24 on an Apple M2 (16 GB), macOS, Go 1.24.5, Node 24.17.0, at
`9280308` (Tasks 1–5). goreleaser is the prebuilt v2.12.7
(`goreleaser_Darwin_arm64.tar.gz: OK` against its release's `checksums.txt`),
run from a scratch directory through `PATH`, never through `go run`.

## Gates

- `make check` exit 0: `go vet`, `go test ./...`, golangci-lint ("No issues found"),
  `tsc`, and 135 vitest tests.
- Task 4's steps, all green: `make release-check`; the Makefile's `-X
  $(go list -m)/…` form reaches `version.Version` (`zu version v9.9.9`);
  `make release-snapshot`; gofmt, `go vet`, golangci-lint and `go test ./...`.

## Release snapshot (`goreleaser release --snapshot --clean`, then `scripts/release-verify.sh dist`)

```
dist/zu_darwin_amd64_v1/zu: Mach-O 64-bit executable x86_64
dist/zu_darwin_arm64_v8.0/zu: Mach-O 64-bit executable arm64
dist/zu_linux_amd64_v1/zu: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, BuildID[sha1]=f964b5c2…, stripped
```

```
zu_0.0.1-snapshot_darwin_amd64.tar.gz: OK
zu_0.0.1-snapshot_darwin_arm64.tar.gz: OK
zu_0.0.1-snapshot_linux_amd64.tar.gz: OK
zu_0.0.1-snapshot_version.txt: OK
zu version v0.0.1-snapshot
commit 9280308e200d68bf806fda3fe535b20a81c78109
ir-schema 1
policy-format 1
go go1.24.5
ui embedded
release-verify: ok (3 archives, zu_0.0.1-snapshot_version.txt)
```

The host binary and the record agree, the UI is embedded (N3), and all three
archives and the record are in `checksums.txt` (N4). One host, CGO off, three
targets (N1, N2).

## Performance budgets

### Cold scan: `scripts/bench-corpus.sh`

| repo | tag | mode | wall s | max RSS MB | summary |
|---|---|---|---|---|---|
| cobra | v1.10.2 | disk | 0.54 | 14 | 2 packages, 19 files, 0 parse errors |
| cobra | v1.10.2 | ref | 0.16 | 15 | same |
| cobra | v1.10.2~50..v1.10.2 | diff | 0.23 | 15 | 2 packages changed, 2 affected |
| hugo | v0.166.0 | disk | 0.74 | 68 | 193 packages, 522 files, 0 parse errors |
| hugo | v0.166.0 | ref | 0.36 | 67 | same |
| hugo | v0.166.0~50..v0.166.0 | diff | 0.51 | 56 | 35 packages changed, 144 affected |
| kubernetes | v1.37.0 | disk | 4.40 | 904 | 2963 packages, 9909 files, 0 parse errors |
| kubernetes | v1.37.0 | ref | 3.91 | 1019 | same |
| kubernetes | v1.37.0~50..v1.37.0 | diff | 5.68 | 783 | 52 packages changed, 1543 affected |

Disk and ref IRs are identical for all three repos.

Lines of Go (`git ls-files '*.go'`, all lines): cobra 16,656; hugo 229,795;
kubernetes 5,353,527. hugo is 2.3× the budget's 100k LOC and scans cold in
0.74 s; kubernetes is 53× and scans in 4.40 s.

### First paint: `web/e2e/paint.mjs`, kubernetes v1.37.0 export, headless, `file://`

In ms after navigation start. Judged on `zu-drawn`, FCP recorded only.

| view | engine | header | FCP | zu-layout-end | zu-drawn |
|---|---|---|---|---|---|
| default, edges on | chromium | 38 boxes at depth 1 | 188 | 466 | 540 |
| `#d=3&l=0` | chromium | 599 boxes at depth 3 | 140 | 330 | **887** |
| `#f=…pkg&d=6&l=0` | chromium | 857 boxes at depth 6 | 136 | 382 | **1077** |
| default, edges on | firefox | 38 boxes at depth 1 | 260 | 750 | 854 |
| `#d=3&l=0` | firefox | 599 boxes at depth 3 | 190 | 609 | **1391** |
| `#f=…pkg&d=6&l=0` | firefox | 857 boxes at depth 6 | 178 | 577 | **1470** |
| default, edges on | webkit | 38 boxes at depth 1 | 226 | 712 | 836 |
| `#d=3&l=0` | webkit | 599 boxes at depth 3 | 145 | 449 | **1066** |
| `#f=…pkg&d=6&l=0` | webkit | 857 boxes at depth 6 | 134 | 466 | **1196** |

No notice was shown: every view was drawn as asked. Both views of 500 or more
boxes are drawn in under 1.5 s in every engine. The plan's trial run gave
3,147 ms for the 857-box view in Firefox; here it is 1,470 ms, so the "known limit
beyond the budget" the plan anticipated does not appear in this run.

### Deviation 4's table

| Budget | v0.1 |
|---|---|
| Cold scan of 100k LOC < 30 s | **met**: hugo (230k LOC) 0.74 s, kubernetes (5.35M LOC) 4.40 s |
| First paint, 500 nodes < 3 s | **met**: 599 boxes in 887–1,391 ms, 857 boxes in 1,077–1,470 ms, three engines |
| Responsive at 2,000 nodes | **not measured** |
| Incremental re-scan < 2 s | **N/A**: watch mode, after v1 |

No budget was missed, so Task 5's list of known limits gains no miss. It keeps
"responsive at 2,000 nodes not measured", incremental re-scan, and `serve`.

## Release

v0.1.0, published 2026-10-21 (https://github.com/xbklairith/zu/releases/tag/v0.1.0),
following `docx/UserInstructions/09-first-release.md`, at the user's word "release".
Gate 1 on the clean `main` at `f459e85`: `make check` exit 0 at `065e4e5` (same Go
and web code), `make release-snapshot` ending `release-verify: ok (3 archives, …)`,
and `scripts/install-test.sh` 13/13. Gate 2 (real Safari: the 05 checks and 04 step 1)
was not run; the user asked to release without it, so it is still owed. The tag
`v0.1.0` (annotated) points at `f459e85913edefc729ee0af1492c6331df3ce1ca`.
goreleaser v2.12.7 made the draft; `scripts/release-verify.sh dist` said
`release-verify: ok (3 archives, zu_0.1.0_version.txt)`. The draft's notes were
replaced with the install line, the macOS quarantine note and the known limits, then
it was published.

`gh release download v0.1.0`, then `shasum -a 256 -c checksums.txt`:

```
fc856a59c5e419477d4a24fd7803087864c9a105d2161493552a5ea95c8803ff  zu_0.1.0_darwin_amd64.tar.gz
0968447fe8a522dd2fe7a9f453b411bab766a7e6f5a6ac1b284f3cbd8b0b67b2  zu_0.1.0_darwin_arm64.tar.gz
8da5df77f64bcd3d7dc497970df729a08e41b6df3597c12ae1edd23938526f7f  zu_0.1.0_linux_amd64.tar.gz
ffa8eceb83902754ec85921b414db49031ea636cf8df03c92f1244be9029cf0a  zu_0.1.0_version.txt
```

All four `OK`. The record, whose commit is `git rev-parse 'v0.1.0^{commit}'`:

```
zu version v0.1.0
commit f459e85913edefc729ee0af1492c6331df3ce1ca
ir-schema 1
policy-format 1
go go1.24.5
ui embedded
```

`scripts/install-test.sh --release`, the README's line as written:

```
install-test: zu 0.1.0 (f459e85913edefc729ee0af1492c6331df3ce1ca), via: curl -fsSL https://raw.githubusercontent.com/xbklairith/zu/v0.1.0/scripts/install.sh | sh
  ok    alpine, busybox ash, wget
  ok    debian, dash
  ok    debian, bash
  ok    debian, zsh
  ok    debian, fish
  ok    ubuntu, a user, ZU_INSTALL_DIR
  ok    ubuntu, a user, sudo
  ok    ubuntu, a user, no sudo
  ok    fedora, bash as sh
  ok    linux arm64, busybox
  ok    this Mac, zsh
install-test: ok
```

The two cases that need a doctored download (no curl or wget; a wrong checksum) run
only against a local `dist/`, where they passed in gate 1.

### v0.1.1

v0.1.1, published 2026-10-27 (https://github.com/xbklairith/zu/releases/tag/v0.1.1), at
the user's yes to "release v0.1.1". It is a fix release cut from the maintenance branch
`release/0.1`, which starts at `v0.1.0` and is not merged into `main`. It carries two
CSS fixes, each with a browser check that failed first: the Proposal banner gets a row
of its own (`71b17e0`; `main` has it as `1b3c8f6`), and the code pane's style is scoped
to `pre.source` (`838f86b`; `main` gets it from 21's build). `fc7ece8` bumps the
README's line and `install.sh`'s default to v0.1.1. The IR schema and the Policy format
are unchanged.

The procedure's "clean `main`" was `release/0.1` here. Gate 1 at `fc7ece8`: `make check`
exit 0 (lint printed nothing), `make release-check`, `make release-snapshot` ending
`release-verify: ok (3 archives, zu_0.1.1-snapshot_version.txt)`, and
`scripts/install-test.sh` 13/13. With both fixes, at `838f86b`, `accept.mjs`,
`screen.mjs`, `code.mjs`, `diffcode.mjs`, `place.mjs` and `serve.mjs` passed 59, 25, 13,
17, 9 and 11 checks in Chromium, Firefox and WebKit. Gate 2 (real Safari) was not run, as
for v0.1.0, and is still owed. The tag `v0.1.1` (annotated) points at
`fc7ece890866c3d246b86a5e6c9bbc4eb000105c`. goreleaser v2.12.7 made the draft;
`scripts/release-verify.sh dist` said `release-verify: ok (3 archives,
zu_0.1.1_version.txt)`. The draft's notes were replaced with the two fixes, the install
line, the macOS quarantine note and the known limits, then it was published.

`gh release download v0.1.1`, then `shasum -a 256 -c checksums.txt`:

```
368f093d0fb6ed14d4e9e8271c47a670d80d352b1b1a9d5c2e059f4a5a2d9b2f  zu_0.1.1_darwin_amd64.tar.gz
1af020f00c0f684cb4bc716394fb784a45698ebe2b895c9acdc0038a9ea3af89  zu_0.1.1_darwin_arm64.tar.gz
215051241a0a3ff1f5ce64e30d15d9f1779eaaaee6c29d0c5977af6011137de8  zu_0.1.1_linux_amd64.tar.gz
4f71d75de1bbc31e8c705d625c3557deea6c158167a9a80671b2d3598e59c29e  zu_0.1.1_version.txt
```

All four `OK`. The record, whose commit is `git rev-parse 'v0.1.1^{commit}'`:

```
zu version v0.1.1
commit fc7ece890866c3d246b86a5e6c9bbc4eb000105c
ir-schema 1
policy-format 1
go go1.24.5
ui embedded
```

`scripts/install-test.sh --release`, the README's line as written:

```
install-test: zu 0.1.1 (fc7ece890866c3d246b86a5e6c9bbc4eb000105c), via: curl -fsSL https://raw.githubusercontent.com/xbklairith/zu/v0.1.1/scripts/install.sh | sh
  ok    alpine, busybox ash, wget
  ok    debian, dash
  ok    debian, bash
  ok    debian, zsh
  ok    debian, fish
  ok    ubuntu, a user, ZU_INSTALL_DIR
  ok    ubuntu, a user, sudo
  ok    ubuntu, a user, no sudo
  ok    fedora, bash as sh
  ok    linux arm64, busybox
  ok    this Mac, zsh
install-test: ok
```

`main`'s README line and `install.sh` default were bumped to v0.1.1 in the commit that
records this, and are byte-identical to the tag's.
