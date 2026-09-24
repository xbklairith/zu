# 09 · Distribution (v0.1) — Plan

**Status:** APPROVED 2026-09-24 (scrutiny + advisor sign-off). Revised after scrutiny (M1–M4 and N1–N7, with the coordinator's rulings); replayed green on a clone of 2005ff1 with the prebuilt goreleaser v2.12.7. Drafted against `main` at 2005ff1, with 08 committed. M1 dropped `go install` from v0.1, so the module rename is deferred (see Deferred) and no task depends on 08's files.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is 08's script with one change: a fence may be three or more backticks. That lets the README and the user instructions, which contain fenced blocks of their own, be written whole. The script applies every code block to a fresh copy of `main`, task by task:

- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero, and every other step must exit 0. goreleaser needs a `.git` directory, so the copy is a clone, not a `git archive`:

```bash
S=$(mktemp -d) && git clone -q . "$S" && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci) \
  && python3 docx/features/09-distribution/replay.py docx/features/09-distribution/plan.md "$S"; rm -rf "$S"
```

The replay needs:

- Go, git, `patch`, Python 3, npm, Node and `golangci-lint`;
- Playwright's three browsers (`cd web/e2e && npm run browsers`) for Task 6;
- `goreleaser` v2.12.7 on `PATH`, as a prebuilt binary (Task 4).

Do not `go run` goreleaser: compiling it once filled the disk.

**Goal:** ship v0.1, meeting N1–N4 and the Licensing gate of `requirements-draft.md`. The channel is GitHub Releases. This plan amends decisions.md l.44 to: "GitHub Releases via goreleaser with checksums; `go install` after v0.1, once it can carry the UI (needs the module rename)."

- **N1 and N2:** one goreleaser run on one macOS host, with CGO off, builds darwin/arm64, darwin/amd64 and linux/amd64.
- **N3:** goreleaser's before-hook builds `web/dist`, which `web/embed.go` embeds. `zu version` prints `ui embedded`, and `scripts/release-verify.sh` fails if it doesn't.
- **N4:** the version record. `zu version` prints the app version, source commit, IR schema, Policy format, Go toolchain and UI state. A before-hook writes that output to `zu_<version>_version.txt`, and the release attaches the file. `checksums.txt` holds the sha256 of every archive and of the record.
- **Licensing:** `LICENSE` (Apache-2.0) is already at the root, and every archive carries it.

**Architecture:**
- **The binary is the source of truth for N4.** goreleaser can template the version and commit, but not `ir.SchemaVersion` or `policy.Format`, which are Go constants. So the release record is the output of `zu version`. A before-hook builds it with the release's own ldflags, after the UI build.
- **ldflags name the module through `go list -m`.** The Makefile uses `$(shell go list -m)`, goreleaser's builds use `{{ .ModulePath }}`, and the record's hook runs `go list -m`. `-X` on a symbol that doesn't exist is silently ignored and leaves the version at `dev`. So no build path hard-codes the module path, and the deferred rename can't break one. `release-verify.sh` fails on `dev`.
- **Builds without ldflags identify themselves.** A plain `go build`, or `go run`, gets no `-X` flags. For those, `internal/version` falls back to the build info the go command records: the module version (a pseudo-version for a checkout build since Go 1.24) and `vcs.revision`. A value set by `-X` always wins.

**Tech Stack:** goreleaser v2.12.7 (prebuilt; config `version: 2`), Go 1.24, bash, and `playwright-core` from `web/e2e` for Task 6. No new Go or npm dependency.

**Out of scope:**
- `go install` (deferred; see Deferred).
- Signing (cosign), SBOMs, notarization, a Homebrew tap, Windows, linux/arm64.
- Reproducible-binary claims. `-trimpath` and `mod_timestamp` help, but nothing here proves reproducibility.
- CI release workflows. A person runs the release from one host (Task 5).
- Incremental re-scan. It belongs to watch mode, after v1.

## Deviations and decisions

1. **Pushing the tag is the point of no return.** Once `v0.1.0` is pushed to the public repository, that commit's source is fetchable as the tag, and whoever fetched it keeps it. `release.draft: true` gates only the release page and its archives: goreleaser creates a draft, and a person reviews it, adds notes and publishes it (Task 5). Two checks are therefore explicit gates *before* the tag push, in Task 5: the rehearsal (`make check` and `make release-snapshot`) and real Safari.
2. **Real Safari is required before the tag push.** The Playwright harness (`web/e2e/accept.mjs`) opens every page from `file://` in Chromium, Firefox and WebKit. That covers 04's `file://` and Firefox items and 05's engine checks. It does not cover Safari itself. Safari is the default browser on the platform most readers will open the HTML on, and 05's troubleshooting names a failure specific to Safari: a `blob:` worker blocked under the CSP on `file://`. The check takes the author about five minutes, and the release is already manual. So 05's Safari instructions and 04's step 1 in Safari are a prerequisite in Task 5. There is no "not yet checked" branch. The visible-first-paint check (04 step 3) is not a gate, because Task 6 measures first paint mechanically.
3. **The output contract is linked, not copied.** `docx/features/03-diff-ci/output.md` is already written for users: usage, flags, exit codes, merge-base, JSON and Markdown. The README links it. A second copy in `docs/` would drift from the one the tests follow.
4. **Each performance budget maps to a measurement** (Task 6). The budgets are "targets, to be validated" (requirements l.262), so a miss goes into the release notes as a known limit and does not block the release.

   | Budget | Measured by | v0.1 |
   |---|---|---|
   | Cold scan of 100k LOC < 30 s | `scripts/bench-corpus.sh` on hugo (100k–1M LOC) and kubernetes (millions), plus a LOC count | already met: 0.37 s for hugo (01 `benchmarks.md`) and 3.7–9.3 s for kubernetes (02 `benchmarks.md`, 04 `acceptance.md`). Task 6 measures it again |
   | First paint, 500 nodes < 3 s | `paint.mjs`: the `zu-drawn` mark (never FCP, which marks the header) and the header's box count, from `file://` in three engines. The views are kubernetes `#d=3&l=0` (599 boxes), `#f=k8s.io%2Fkubernetes%2Fpkg&d=6&l=0` (857 boxes) and the default view with edges on (38 boxes, 175 edges) | measured. The plan's trial run is below |
   | Responsive at 2,000 nodes | nothing times an interaction near `DRAW_LIMIT` (2,000 nodes, 500 edges). 05 records collapse above it, at 257 boxes at most | **not measured** |
   | Incremental re-scan < 2 s | — | N/A: watch mode, after v1 |

   With edges on, no hash reaches 500 boxes. `DRAW_LIMIT` caps laid-out edges at 500, so every such view collapses, for example to 31 boxes for `pkg` at depth 2, with 1,711 edges. Drawing it anyway takes a button, not a hash. So the edges-on row is the default view. A 500-box view with edges on is not measured.

   Trial run while drafting: headless, on this Mac, kubernetes v1.37.0 export, `zu-drawn` in ms. It is not the acceptance record.

   | View | Chromium | Firefox | WebKit |
   |---|---|---|---|
   | default, 38 boxes, edges on | 944 | 1929 | 985 |
   | `#d=3&l=0`, 599 boxes | 1936 | 2570 | 1491 |
   | `#f=…pkg&d=6&l=0`, 857 boxes | 2265 | **3147** | 2598 |

   So the budget (500 nodes) is met in all three engines at 599 boxes. At 857 boxes, well past the budgeted size, Firefox takes over 3 s. If Task 6 confirms that, the release notes state it as a known limit beyond the budget, not as a missed budget.

## Deferred: the module rename (for `go install`, after v0.1)

`go install github.com/xbklairith/zu/cmd/zu@…` needs two things, and v0.1 has neither:
- the module named `github.com/xbklairith/zu`. The go command rejects `zu` with "module declares its path as: zu";
- a way to carry the UI. `web/dist/*` is gitignored, so a module zip has no page, and `-html` exits 3.

When `go install` returns:
- **The rewrite.** `go mod edit -module github.com/xbklairith/zu && perl -pi -e 's{(?<![\w./-])zu/(internal|cmd|web)(?=[/"\s.,\]])}{github.com/xbklairith/zu/$1}g' $(git ls-files -co --exclude-standard '*.go')`. Running it again changes nothing. The lookahead includes `,` and `]` for `order: [zu/internal, zu/cmd]` in `policy_test.go` (scrutiny N1).
- **The check.** `! git grep -nE '(^|[^[:alnum:]./-])zu/(internal|cmd|web)' -- '*.go'`. It must also see unquoted ids, not only `"zu/…`.
- **Commit the rename alone**, with a message that says so (scrutiny N2). A `zu diff` across it shows every package removed and re-added. Acceptance records written before it cite `zu/…` ids.
- **Also update:** CLAUDE.md's "module path is `zu`" rule, and `html.go`'s "build it with make build" message, so that it names releases.

## Contract

`zu version` output, one field per line, in this order:

```
zu version v0.1.0
commit 0123456789abcdef0123456789abcdef01234567
ir-schema 1
policy-format 1
go go1.24.5
ui embedded
```

The first four lines are unchanged. `ui` is `embedded` or `absent`. A release publishes this output as `zu_<version>_version.txt`, together with `checksums.txt` (sha256, format `<hex>  <file>`) over the three `zu_<version>_<os>_<arch>.tar.gz` archives and the record. Each archive holds `zu`, `LICENSE` and `README.md`.

### Task 1: `zu version` reports the Go toolchain and whether the UI is embedded

**Files:** `internal/cli/cli_test.go`, `internal/cli/cli.go`

- [x] **Step 1: failing tests.**

```diff
--- a/internal/cli/cli_test.go
+++ b/internal/cli/cli_test.go
@@ -2,6 +2,8 @@ package cli
 
 import (
 	"bytes"
+	"errors"
+	"runtime"
 	"strings"
 	"testing"
 
@@ -33,6 +35,30 @@ func TestVersionReportsAppCommitAndSchema(t *testing.T) {
 	}
 }
 
+// N3/N4: the record names the toolchain and says whether the UI is inside.
+func TestVersionReportsGoAndEmbeddedUI(t *testing.T) {
+	withUI(t)
+	code, out, _ := run("version")
+	if code != ExitOK {
+		t.Fatalf("exit = %d", code)
+	}
+	want := "policy-format " + policy.Format + "\ngo " + runtime.Version() + "\nui embedded\n"
+	if !strings.HasSuffix(out, want) {
+		t.Errorf("output %q does not end with %q", out, want)
+	}
+}
+
+// A build without web/dist/index.html (go test, a plain go build) says so.
+func TestVersionSaysWhenTheUIIsAbsent(t *testing.T) {
+	old := uiTemplate
+	uiTemplate = func() ([]byte, error) { return nil, errors.New("this zu was built without the UI") }
+	t.Cleanup(func() { uiTemplate = old })
+	code, out, _ := run("version")
+	if code != ExitOK || !strings.HasSuffix(out, "\nui absent\n") {
+		t.Errorf("exit = %d, output %q; want 0 and a last line \"ui absent\"", code, out)
+	}
+}
+
 func TestNoArgsIsBadInvocation(t *testing.T) {
 	code, out, errOut := run()
 	if code != ExitBadInvocation {
```

- [x] **Run:** `go test ./internal/cli -run 'TestVersion' -count=1` Expected: FAIL (no `go` or `ui` line).

- [x] **Step 2: implement.** `uiTemplate` is 04's seam over `builtTemplate`, which already fails when the page is missing or has no data marker.

```diff
--- a/internal/cli/cli.go
+++ b/internal/cli/cli.go
@@ -4,6 +4,7 @@ package cli
 import (
 	"fmt"
 	"io"
+	"runtime"
 
 	"zu/internal/ir"
 	"zu/internal/policy"
@@ -46,8 +47,12 @@ func Run(args []string, stdout, stderr io.Writer) int {
 		fmt.Fprint(stdout, usage)
 		return ExitOK
 	case cmd == "version":
-		fmt.Fprintf(stdout, "zu version %s\ncommit %s\nir-schema %s\npolicy-format %s\n",
-			version.Version, version.Commit, ir.SchemaVersion, policy.Format)
+		ui := "embedded"
+		if _, err := uiTemplate(); err != nil {
+			ui = "absent"
+		}
+		fmt.Fprintf(stdout, "zu version %s\ncommit %s\nir-schema %s\npolicy-format %s\ngo %s\nui %s\n",
+			version.Version, version.Commit, ir.SchemaVersion, policy.Format, runtime.Version(), ui)
 		return ExitOK
 	case cmd == "scan":
 		return runScan(args[1:], stdout, stderr)
```

The usage line `version   print application, commit, IR schema and Policy format versions` stays. It names the versions, and the two new lines are build facts.

- [x] **Run:** `go test ./internal/cli -count=1` Expected: PASS.

### Task 2: builds without ldflags fall back to the go command's build info

**Files:** `internal/version/version_test.go` (new), `internal/version/version.go`

- [x] **Step 1: failing test.**

<!-- file: internal/version/version_test.go -->
```go
package version

import (
	"runtime/debug"
	"testing"
)

func info(version string, settings ...string) *debug.BuildInfo {
	bi := &debug.BuildInfo{Main: debug.Module{Path: "github.com/xbklairith/zu", Version: version}}
	for i := 0; i+1 < len(settings); i += 2 {
		bi.Settings = append(bi.Settings, debug.BuildSetting{Key: settings[i], Value: settings[i+1]})
	}
	return bi
}

func TestFromBuildInfo(t *testing.T) {
	for _, tc := range []struct {
		name               string
		bi                 *debug.BuildInfo
		ok                 bool
		v, c, wantV, wantC string
	}{
		{"module version", info("v0.1.0"), true, "dev", "unknown", "v0.1.0", "unknown"},
		{"checkout build", info("(devel)", "vcs.revision", "abc123", "vcs.modified", "false"), true, "dev", "unknown", "dev", "abc123"},
		{"dirty checkout", info("(devel)", "vcs.revision", "abc123", "vcs.modified", "true"), true, "dev", "unknown", "dev", "abc123-dirty"},
		{"ldflags win", info("v0.0.9", "vcs.revision", "abc123"), true, "v0.1.0", "def456", "v0.1.0", "def456"},
		{"no build info", nil, false, "dev", "unknown", "dev", "unknown"},
		{"empty main version", info(""), true, "dev", "unknown", "dev", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			v, c := fromBuildInfo(tc.bi, tc.ok, tc.v, tc.c)
			if v != tc.wantV || c != tc.wantC {
				t.Errorf("got (%q, %q), want (%q, %q)", v, c, tc.wantV, tc.wantC)
			}
		})
	}
}
```

- [x] **Run:** `go test ./internal/version -count=1` Expected: FAIL (`fromBuildInfo` undefined).

- [x] **Step 2: implement.** A dirty checkout's commit gets `-dirty`, as `git describe --dirty` marks the Makefile's version, so a build is never labelled with a commit it doesn't match.

<!-- file: internal/version/version.go -->
```go
// Package version holds build identity, injected at link time:
//
//	go build -ldflags "-X $(go list -m)/internal/version.Version=v0.1.0 -X $(go list -m)/internal/version.Commit=$(git rev-parse HEAD)"
//
// A build without those flags (a plain go build or go run) falls back to what
// the go command recorded: the module version and the VCS revision.
package version

import "runtime/debug"

var (
	// Version is the application version.
	Version = "dev"
	// Commit is the source commit the binary was built from.
	Commit = "unknown"
)

func init() {
	bi, ok := debug.ReadBuildInfo()
	Version, Commit = fromBuildInfo(bi, ok, Version, Commit)
}

// fromBuildInfo fills the values the linker left at their defaults. Values
// set with -X always win.
func fromBuildInfo(bi *debug.BuildInfo, ok bool, version, commit string) (string, string) {
	if !ok || bi == nil {
		return version, commit
	}
	if version == "dev" && bi.Main.Version != "" && bi.Main.Version != "(devel)" {
		version = bi.Main.Version
	}
	if commit == "unknown" {
		var rev, modified string
		for _, s := range bi.Settings {
			switch s.Key {
			case "vcs.revision":
				rev = s.Value
			case "vcs.modified":
				modified = s.Value
			}
		}
		if rev != "" {
			commit = rev
			if modified == "true" {
				commit += "-dirty"
			}
		}
	}
	return version, commit
}
```

- [x] **Run:** `go test ./internal/version ./internal/cli -count=1` Expected: PASS.

### Task 3: README

**Files:** `README.md` (new)

<!-- file: README.md -->
````markdown
# zu

zu draws a Go repository's component topology as an interactive diagram, and any
change to it (an MR, a branch, your working tree) as a structural delta over that
diagram. It runs locally and offline: one binary, no runtime, no server, no
telemetry.

## Install

Download a release from [Releases](https://github.com/xbklairith/zu/releases). There are
builds for macOS arm64 and x86-64, and for Linux x86-64. This block picks the archive for
your machine, checks it against `checksums.txt`, and puts `zu` in `/usr/local/bin`:

```bash
(
  set -e
  V=0.1.0
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64) arch=amd64 ;;
    *) echo "no zu release for $(uname -m)" >&2; exit 1 ;;
  esac
  cd "$(mktemp -d)"
  base=https://github.com/xbklairith/zu/releases/download/v$V
  curl -fsSLO "$base/zu_${V}_${os}_${arch}.tar.gz"
  curl -fsSLO "$base/checksums.txt"
  shasum -a 256 -c checksums.txt --ignore-missing
  tar -xzf "zu_${V}_${os}_${arch}.tar.gz" zu
  sudo mv zu /usr/local/bin/
)
zu version
```

Checking `checksums.txt` proves the archive arrived intact. It does not prove who made
it: the checksums come from the same place as the archive, and releases are not signed.

**macOS:** the binary is not signed or notarized. If you downloaded the archive with a
browser, Gatekeeper refuses to run `zu` ("cannot be verified"). Clear the quarantine flag
once:

```bash
xattr -d com.apple.quarantine /usr/local/bin/zu
```

Each release also carries `zu_<version>_version.txt`, the output of that release's
`zu version`. It gives the app version, the commit the release binaries were built from,
the IR schema version, the Policy format version, the Go toolchain, and whether the UI is
embedded.

**From source.** Needs Go 1.24.5+ and Node 20+. `make build` writes `bin/zu`.

## Use

```bash
zu scan                       # write the IR for the working tree to .zu/ir/
zu scan -html zu.html         # also write a self-contained, offline HTML diagram
zu diff main                  # the Structural Summary of HEAD against main
zu diff main -format markdown # the same, for an MR comment
zu check                      # fail on Policy violations not in the Baseline
zu policy init                # write a suggested zu.policy.yaml
```

Open the HTML file straight from disk (`file://`); it loads nothing from the network.

## Output contract

- **`zu diff`** (text, Markdown and JSON `summaryVersion` "1", flags, the merge-base
  rule and CI use) is specified in
  [docx/features/03-diff-ci/output.md](docx/features/03-diff-ci/output.md).
- **The IR** that `zu scan` writes is JSON with `schemaVersion` "1". Its output is
  byte-identical for the same commit and Policy.
- **Exit codes**, for every command: `0` ok, `1` a structural rule is violated, `2` more
  parse failures than `-max-parse-errors` allows, `3` bad invocation or unreadable
  configuration.

## License

Apache-2.0. See [LICENSE](LICENSE).
````

- [x] **Run:** `test -s README.md && grep -q 'com.apple.quarantine' README.md && ! grep -q 'go install' README.md && grep -q 'docx/features/03-diff-ci/output.md' README.md && test -f docx/features/03-diff-ci/output.md` Expected: PASS.

### Task 4: goreleaser config, Makefile targets and the release check

**Files:** `.goreleaser.yaml` (new), `scripts/release-verify.sh` (new), `Makefile`, `.gitignore`

goreleaser is not a Go dependency and is never compiled here. Install the prebuilt v2.12.7 release tarball, checked against its `checksums.txt`; Task 5 step 1 has the commands. `GORELEASER` overrides the binary.

There is no red step. Without a config, `goreleaser check` validates its defaults and passes, and the Run steps after Step 3 are the test.

- [x] **Step 1: config.** The before-hooks run in order: the UI build (N3), then the version record built with the release's own ldflags. In v2.12, `before.hooks` are plain command strings, templated and run without a shell. So each hook that needs `cd` or a redirect is wrapped in `sh -c`. `{{ .ModulePath }}` is still empty when the before-hooks run (the first replay stamped the record `zu version dev` that way), so the record's hook asks `go list -m` itself. The record goes under `.zu/`, which is gitignored, because goreleaser cleans `dist/`.

<!-- file: .goreleaser.yaml -->
```yaml
# zu release: one host, CGO off, darwin arm64/amd64 + linux amd64 (N1, N2),
# UI embedded (N3), a version record and sha256 of every file (N4).
# Check with `make release-check`; try with `make release-snapshot`.
version: 2
project_name: zu

before:
  hooks:
    - sh -c 'cd web && npm ci --silent && npm run build'
    - >-
      sh -c 'mkdir -p .zu/release && CGO_ENABLED=0 go run -trimpath
      -ldflags "-X $(go list -m)/internal/version.Version=v{{ .Version }} -X $(go list -m)/internal/version.Commit={{ .FullCommit }}"
      ./cmd/zu version > .zu/release/zu_{{ .Version }}_version.txt'

builds:
  - id: zu
    main: ./cmd/zu
    binary: zu
    env: [CGO_ENABLED=0]
    flags: [-trimpath]
    ldflags:
      - -s -w -X {{ .ModulePath }}/internal/version.Version=v{{ .Version }} -X {{ .ModulePath }}/internal/version.Commit={{ .FullCommit }}
    mod_timestamp: "{{ .CommitTimestamp }}"
    goos: [darwin, linux]
    goarch: [arm64, amd64]
    ignore:
      - goos: linux
        goarch: arm64

archives:
  - formats: [tar.gz]
    name_template: "{{ .ProjectName }}_{{ .Version }}_{{ .Os }}_{{ .Arch }}"
    files: [LICENSE, README.md]

checksum:
  name_template: checksums.txt
  algorithm: sha256
  extra_files:
    - glob: .zu/release/zu_{{ .Version }}_version.txt

release:
  draft: true
  extra_files:
    - glob: .zu/release/zu_{{ .Version }}_version.txt

snapshot:
  version_template: "{{ incpatch .Version }}-snapshot"

changelog:
  use: git
  sort: asc
```

- [x] **Step 2: the check script.** It runs on any goreleaser `dist/`, snapshot or release. It runs the binary built for this host and inspects the others with `file`.

<!-- file: scripts/release-verify.sh -->
```bash
#!/usr/bin/env bash
# Check a goreleaser dist/ (snapshot or release) against N1–N4: every archive
# and the version record match checksums.txt; each binary is a static
# executable for its target; the one built for this host reports a stamped
# version and commit and an embedded UI, and agrees with the record.
# Usage: scripts/release-verify.sh [dist]
set -euo pipefail
cd "$(dirname "$0")/.."
d=${1:-dist}
fail() { echo "release-verify: $*" >&2; exit 1; }

name=$(grep -o 'zu_[^ ]*_version\.txt$' "$d/checksums.txt") || fail "no version record in checksums.txt"
rec=.zu/release/$name # goreleaser uploads the record from here; it never copies it into dist/
[ -f "$d/$name" ] || cp "$rec" "$d/$name"
(cd "$d" && shasum -a 256 -c checksums.txt) || fail "checksums do not match"
n=$(grep -c '\.tar\.gz$' "$d/checksums.txt")
[ "$n" -eq 3 ] || fail "want 3 archives in checksums.txt, got $n"

for want in darwin_arm64:'Mach-O 64-bit executable arm64' darwin_amd64:'Mach-O 64-bit executable x86_64' \
  linux_amd64:'ELF 64-bit LSB executable, x86-64.*statically linked'; do
  bin=$(ls "$d"/zu_"${want%%:*}"*/zu) || fail "no ${want%%:*} binary"
  file "$bin" | grep -Eq "${want#*:}" || fail "$(file "$bin")"
done

host=$(ls "$d"/zu_"$(go env GOOS)_$(go env GOARCH)"*/zu)
tmp=$(mktemp -d) && trap 'rm -rf "$tmp"' EXIT
cp "$host" "$tmp/zu" # a noexec dist/ still verifies
out=$("$tmp/zu" version)
echo "$out"
grep -q '^zu version v' <<<"$out" || fail "version not stamped"
grep -q '^zu version v' "$rec" || fail "record's version not stamped"
grep -Eq '^commit [0-9a-f]{40}$' <<<"$out" || fail "commit not stamped"
grep -qx 'ui embedded' <<<"$out" || fail "UI not embedded"
diff <(grep -v '^go ' <<<"$out") <(grep -v '^go ' "$rec") >/dev/null || fail "binary and record disagree"
echo "release-verify: ok ($n archives, $name)"
```

The `go` line is left out of the comparison: the record is built by `go run`, with the same toolchain, and the line would only differ if the toolchain changed between hooks.

- [x] **Step 3: Makefile.** The ldflags name the module through `go list -m`, so the deferred module rename can't silently turn them into no-ops.

```diff
--- a/Makefile
+++ b/Makefile
@@ -1,8 +1,10 @@
+MODULE  := $(shell go list -m)
 VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
 COMMIT  ?= $(shell git rev-parse --verify -q HEAD 2>/dev/null || echo unknown)
-LDFLAGS := -s -w -X zu/internal/version.Version=$(VERSION) -X zu/internal/version.Commit=$(COMMIT)
+LDFLAGS := -s -w -X $(MODULE)/internal/version.Version=$(VERSION) -X $(MODULE)/internal/version.Commit=$(COMMIT)
+GORELEASER ?= goreleaser
 
-.PHONY: build web test test-web lint fmt check clean
+.PHONY: build web test test-web lint fmt check clean release-check release-snapshot
 
 build: web ## Build the zu binary with the UI embedded
 	CGO_ENABLED=0 go build -trimpath -ldflags '$(LDFLAGS)' -o bin/zu ./cmd/zu
@@ -25,5 +27,11 @@ test-web: ## Run UI unit tests
 
 check: web lint test test-web ## Everything CI runs
 
+release-check: ## Validate .goreleaser.yaml
+	$(GORELEASER) check
+
+release-snapshot: ## Build every release archive into dist/ without publishing, then verify it
+	$(GORELEASER) release --snapshot --clean && scripts/release-verify.sh dist
+
 clean:
-	rm -rf bin web/dist/index.html
+	rm -rf bin dist .zu/release web/dist/index.html
```

`.gitignore` already has `/dist/` and `/.zu/`, so it doesn't change.

- [x] **Run:** `chmod +x scripts/release-verify.sh && make release-check` Expected: PASS.

- [x] **Run:** `d=$(mktemp -d) && go build -ldflags "-X $(go list -m)/internal/version.Version=v9.9.9" -o "$d/zu" ./cmd/zu && "$d/zu" version | grep -qx 'zu version v9.9.9'; r=$?; rm -rf "$d"; exit $r` Expected: PASS (the Makefile's form of `-X` reaches the variable).

- [x] **Run:** `make release-snapshot` Expected: PASS. This is three cross-builds plus `npm ci`, a few minutes. It ends with `release-verify: ok (3 archives, zu_<v>_version.txt)`.

- [x] **Run:** `rm -rf dist .zu/release` Expected: PASS.

- [x] **Run:** `gofmt -l cmd internal web/*.go | (! grep .) && go vet ./... && golangci-lint run ./... && go test ./... -count=1` Expected: PASS. Read the lint output, not only its exit code.

### Task 5: the release instructions only a person can carry out

**Files:** `docx/UserInstructions/09-first-release.md` (new)

<!-- file: docx/UserInstructions/09-first-release.md -->
````markdown
# Publish zu v0.1.0

## Overview

`make release-snapshot` builds and checks every release file locally. Publishing
takes steps only a person can do, because they need your GitHub credentials and your
judgement: the two gates below, the tag push, the goreleaser run, and pressing Publish.

**The tag push is the point of no return.** Once `v0.1.0` is on the public repository,
that commit's source is fetchable as the tag, and anyone who fetched it keeps it.
goreleaser creates the release as a **draft**, but the draft gates only the release
page and its archives, not the tag. So the rehearsal (step 3) and the Safari check
(step 4) must pass *before* step 5.

## Prerequisites

- [ ] 09 is committed on `main`, and `git status --short` prints nothing
- [ ] Safari, with Develop → Show Web Inspector enabled
- [ ] A GitHub token for goreleaser. Recommended: a fine-grained token scoped to
      `xbklairith/zu` with *Contents: read and write* only (GitHub → Settings →
      Developer settings → Fine-grained tokens). Otherwise `gh auth token`, whose
      scopes are broader
- [ ] The repository is public (GitHub → Settings → General → Danger Zone), so the
      release page and its archives can be downloaded without credentials

## Steps

1. Install goreleaser v2.12.7 from its prebuilt release. Don't build it with `go run`:
   the compile needs several GB of disk. Choose **one** of the two ways.

   **a. Release tarball (pinned).**

   ```bash
   (
     set -e
     V=2.12.7
     case "$(uname -m)" in arm64) a=arm64 ;; x86_64) a=x86_64 ;; *) echo "unsupported $(uname -m)" >&2; exit 1 ;; esac
     cd "$(mktemp -d)"
     base=https://github.com/goreleaser/goreleaser/releases/download/v$V
     curl -fsSLO "$base/goreleaser_Darwin_$a.tar.gz"
     curl -fsSLO "$base/checksums.txt"
     shasum -a 256 -c checksums.txt --ignore-missing
     tar -xzf "goreleaser_Darwin_$a.tar.gz" goreleaser
     sudo mv goreleaser /usr/local/bin/
   )
   goreleaser --version   # GitVersion: 2.12.7
   ```

   The checksum proves the download is intact, not who made it. For authenticity,
   goreleaser signs `checksums.txt` with cosign (`checksums.txt.sig` and
   `checksums.txt.pem` in the same release); check them with `cosign verify-blob`,
   following goreleaser's install docs. This plan doesn't require that.

   **b. Homebrew.** `brew install goreleaser` installs the latest release, not
   v2.12.7. Run `make release-check` afterwards. If the config no longer validates,
   use way a.

2. Stay in the repository root for the steps below.

3. **Gate 1: rehearse on a clean `main`.**

   ```bash
   git switch main && git pull --ff-only && git status --short   # prints nothing
   make check && make release-snapshot                            # ends "release-verify: ok (3 archives, …)"
   rm -rf dist .zu/release
   ```

   Stop here if either command fails.

4. **Gate 2: real Safari.** Run every step of
   `docx/UserInstructions/05-interaction-safari-check.md`, and step 1 of
   `docx/UserInstructions/04-html-export-browser-check.md` opened in Safari. Record
   the results in the 05 and 04 `acceptance.md`. Stop here if a page fails to draw or
   the console shows a CSP error.

5. Tag and release. The tag is the version: `v0.1.0` gives `zu version v0.1.0`.

   ```bash
   git tag -a v0.1.0 -m "zu v0.1.0"
   git push origin v0.1.0
   GITHUB_TOKEN=<your fine-grained token> goreleaser release --clean
   scripts/release-verify.sh dist
   ```

6. On GitHub → Releases, open the draft `v0.1.0`. Add at the top:
   - install: the README's Install block, and the macOS quarantine note;
   - known limits: any performance budget that 09's `acceptance.md` records as missed,
     any view past the budgeted size that exceeds 3 s (for example, first paint of the
     857-box kubernetes view in Firefox: "budget met at 500+; ~850 boxes exceeds 3 s in
     Firefox"), and that
     incremental re-scan isn't built (watch mode comes after v1); `serve` isn't built
     either.

   Then press **Publish release**.

## Verification

```bash
(
  cd "$(mktemp -d)"
  gh release download v0.1.0 -R xbklairith/zu
  shasum -a 256 -c checksums.txt
  cat zu_0.1.0_version.txt
)
git rev-parse 'v0.1.0^{commit}'
```

The record's `zu version` must be `v0.1.0`, its `commit` the `git rev-parse` output,
and its `ui` line `embedded`. Record the digests and the record in
`docx/features/09-distribution/acceptance.md` under "Release".

## Troubleshooting

- **`git is in a dirty state`:** goreleaser refuses a dirty tree for a real release.
  Commit or stash first. If the tag is already pushed, see the last entry.
- **`zu version dev` or `release-verify: version not stamped`:** an ldflag names a
  symbol that doesn't exist. Check that `go list -m` matches the module in `go.mod`.
- **`401 Bad credentials` or `403` from goreleaser:** the token lacks *Contents: read
  and write* on `xbklairith/zu`, or it has expired.
- **goreleaser failed after the tag push:** the tag stays. Fix the cause and run
  `goreleaser release --clean` again on the same tag. It replaces the draft's files.
- **A wrong commit was tagged and pushed:** the tag is already public (Overview). Don't
  move it. Delete the draft, fix forward on `main`, and release `v0.1.1`.
````

- [x] **Run:** `grep -q '^## Troubleshooting' docx/UserInstructions/09-first-release.md && ! grep -q 'go install' docx/UserInstructions/09-first-release.md` Expected: PASS.

### Task 6: acceptance

**Files:** `docx/features/09-distribution/acceptance.md` (new), `web/e2e/paint.mjs` (new)

- [ ] **Step 1: first paint in three engines, from `file://`.** A hash picks the view. The box count comes from the page's header, because React Flow renders only the nodes on screen (`onlyRenderVisibleElements`), so the DOM undercounts.

<!-- file: web/e2e/paint.mjs -->
```js
// First paint of exported pages (09 acceptance, performance budget "first
// paint of a 500-node graph under 3 s"). Run from web/e2e:
//   node paint.mjs '/abs/path/k8s.html#d=3&l=0' [more pages…]
// Opens each page (a hash picks the view) from file:// in Chromium, Firefox and
// WebKit and prints the boxes drawn and the timings, in ms after navigation
// start. Judge the budget on zu-drawn: first-contentful-paint is the header.
import { chromium, firefox, webkit } from "playwright-core";

const pages = process.argv.slice(2);
if (pages.length === 0) throw new Error("usage: node paint.mjs '/abs/path/page.html[#hash]'…");
console.log("| page | engine | header | notice | first-contentful-paint | zu-layout-end | zu-drawn |");
console.log("|---|---|---|---|---|---|---|");
for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
  const b = await type.launch();
  try {
    for (const f of pages) {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
      await p.goto("file://" + f);
      await p.waitForFunction(() => performance.getEntriesByName("zu-drawn").length > 0, null, { timeout: 60000 });
      const r = await p.evaluate(() => {
        const at = (n) => Math.round(performance.getEntriesByName(n)[0]?.startTime ?? NaN);
        // The header's count, not the DOM's: React Flow renders only what is on screen.
        const m = document.body.innerText.match(/\d+ boxes? at depth \d+( \([^)]*\))?/);
        const note = document.getElementById("zu-notice")?.innerText.split("\n")[0] ?? "";
        return [m ? m[0] : "?", note, at("first-contentful-paint"), at("zu-layout-end"), at("zu-drawn")];
      });
      console.log(`| ${f.split("/").pop()} | ${name} | ${r.join(" | ")} |`);
      await p.close();
    }
  } finally {
    await b.close();
  }
}
```

- [ ] **Run:** `d=$(mktemp -d) && (cd web && npm run build >/dev/null) && go build -o "$d/zu" ./cmd/zu && "$d/zu" scan internal/scan/testdata/shop -out "$d/shop.json" -html "$d/shop.html" 2>/dev/null && (cd web/e2e && node paint.mjs "$d/shop.html#d=2") | grep 'boxes at depth' >/dev/null; r=$?; rm -rf "$d"; exit $r` Expected: PASS (the script runs in all three engines and reads the header).

- [ ] **Step 2: measure and record.** Run these from the repository root after `make build`. They use the Test Corpus in `.zu/corpus/`, which `scripts/bench-corpus.sh` clones.

```bash
scripts/bench-corpus.sh | tee /tmp/zu-bench.md
for r in cobra@v1.10.2 hugo@v0.166.0 kubernetes@v1.37.0; do
  printf '%s ' $r; git -C .zu/corpus/$r ls-files -z '*.go' | (cd .zu/corpus/$r && xargs -0 cat) | wc -l
done
T=$(mktemp -d) && bin/zu scan .zu/corpus/kubernetes@v1.37.0 -out $T/k8s.json -html $T/k8s.html -max-parse-errors 1000000 \
  && (cd web/e2e && node paint.mjs "$T/k8s.html" "$T/k8s.html#d=3&l=0" "$T/k8s.html#f=k8s.io%2Fkubernetes%2Fpkg&d=6&l=0"); rm -rf $T
make release-snapshot && rm -rf dist .zu/release
```

`acceptance.md` records:

- the bench table and the LOC counts, against "cold scan of 100k LOC under 30 s";
- the paint table, judged on `zu-drawn` against "first paint of a 500-node graph under 3 s", for the views of at least 500 boxes. FCP is recorded but not judged;
- the release-snapshot output: the three `file` lines, the host binary's `zu version`, and `release-verify: ok`;
- Deviation 4's table, with each row marked met, missed, not measured, or N/A. Each miss is copied into Task 5's release-notes list of known limits;
- "Release": filled in by Task 5's verification.

## Notes

- No task touches 08's files. 08 is committed at 2005ff1.
- Since Go 1.24, a plain `go build` in a checkout stamps `Main.Version` with a pseudo-version. It then reports, for example, `zu version v0.0.0-20260924070551-03a075ca2c8c+dirty` and `commit 03a075c…-dirty`. With `web/dist/index.html` absent, it prints `ui absent` and `-html` exits 3 (checked on a replay clone). The `(devel)` case in Task 2's test covers older toolchains.
- A snapshot's archive digests differ between runs, as expected. The release doesn't claim reproducibility (Out of scope).
- The version record is built by `go run` in a hook, so its `go` line is the host toolchain, the same one goreleaser builds with.

## Progress

- [x] Task 1 · [x] Task 2 · [x] Task 3 · [x] Task 4 · [x] Task 5 · [ ] Task 6
