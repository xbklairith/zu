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
