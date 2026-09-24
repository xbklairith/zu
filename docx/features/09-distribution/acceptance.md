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

Pending, by a person: `docx/UserInstructions/09-first-release.md`. Gate 2
(real Safari: the 05 checks and 04 step 1) has not been run. The tag has not been
pushed and nothing has been published.
