# zu

zu draws a Go repository's component topology as an interactive diagram, and any
change to it (an MR, a branch, your working tree) as a structural delta over that
diagram. It runs locally and offline: one binary, no runtime, no telemetry. The one
server, `zu serve`, listens on localhost only.

## Install

There are builds for macOS arm64 and x86-64, and for Linux x86-64. From any shell (bash,
zsh, fish, sh):

```sh
curl -fsSL https://raw.githubusercontent.com/xbklairith/zu/v0.1.0/scripts/install.sh | sh
```

The pipe runs [`scripts/install.sh`](scripts/install.sh) from the `v0.1.0` tag in `sh`. It
picks the [release](https://github.com/xbklairith/zu/releases) archive for your machine,
checks it against `checksums.txt`, puts `zu` in `/usr/local/bin` (asking for sudo if that
directory isn't yours), and runs `zu version`. To install without sudo, end the line with
`| ZU_INSTALL_DIR=$HOME/.local/bin sh` instead. To read the script before running it:

```sh
curl -fsSLO https://raw.githubusercontent.com/xbklairith/zu/v0.1.0/scripts/install.sh
less install.sh
sh install.sh
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
zu serve                      # serve the working tree's diagram at http://127.0.0.1:7433/
zu diff main                  # the Structural Summary of HEAD against main
zu diff main -format markdown # the same, for an MR comment
zu check                      # fail on Policy violations not in the Baseline
zu policy init                # write a suggested zu.policy.yaml
```

Open the HTML file straight from disk (`file://`); it loads nothing from the network.

`zu serve` draws the working tree and rescans it each time you load the page, parsing
only the files that changed. It listens on a loopback address only (`-addr`, default
127.0.0.1:7433, or a free port when that one is taken) and answers only requests
addressed to localhost. It writes nothing to disk. The URL carries the view you are
looking at, so reopening it restores that view. Stop it with Ctrl-C.

Another site's page cannot fetch the View (zu refuses cross-site requests for
`view.json`), but a link or redirect to `http://127.0.0.1:7433/` from anywhere opens
the page, which then fetches its View and so makes zu rescan once. Any 127.x.x.x
address counts as loopback, but macOS binds only 127.0.0.1 unless you alias another
(`sudo ifconfig lo0 alias 127.0.0.2`).

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
