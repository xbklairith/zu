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

- [ ] The commit to release is on `main`, and `git status --short` prints nothing
- [ ] Safari, with Develop → Show Web Inspector enabled
- [ ] Docker running: gate 1 and the verification run the README's install line in
      fresh Linux images
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
   scripts/install-test.sh                                        # ends "install-test: ok" (about 6 minutes)
   rm -rf dist .zu/release
   ```

   Stop here if any command fails. `install-test.sh` serves `dist/` and
   `scripts/install.sh` from a container, so it tests the installer this tag will carry
   before the tag exists.

4. **Gate 2: real Safari.** Run every step of
   `docx/UserInstructions/05-interaction-safari-check.md`, and step 1 of
   `docx/UserInstructions/04-html-export-browser-check.md` opened in Safari. Record
   the results in the 05 and 04 `acceptance.md`. Stop here if a page fails to draw or
   the console shows a CSP error.

5. Tag and release. The tag is the version: `v0.1.0` gives `zu version v0.1.0`. For a
   later release, first bump the version in the README's install line and in
   `scripts/install.sh`'s default `ZU_VERSION`; `scripts/install-test.sh` fails until they
   agree.

   ```bash
   git tag -a v0.1.0 -m "zu v0.1.0"
   git push origin v0.1.0
   GITHUB_TOKEN=<your fine-grained token> goreleaser release --clean
   scripts/release-verify.sh dist
   ```

6. On GitHub → Releases, open the draft `v0.1.0`. Add at the top:
   - install: the README's Install block, and the macOS quarantine note;
   - known limits: responsiveness at 2,000 nodes isn't measured (09's `acceptance.md`; no
     later feature measured it); the binaries are not signed; there are no builds for
     Linux arm64 or Windows. (`serve`, its watch and incremental rescans, which 09 listed
     as not built, came in 10, 13 and 16.)

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
scripts/install-test.sh --release   # the README's line as written; ends "install-test: ok"
```

The record's `zu version` must be `v0.1.0`, its `commit` the `git rev-parse` output,
and its `ui` line `embedded`. `install-test.sh --release` checks the same three lines
on every zu it installs. Record the digests, the record and the install-test output in
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
- **`install-test.sh --release`: `could not download …tar.gz` or `curl: (22) … 404`:**
  the release is still a draft, or the repository is private.
- **A wrong commit was tagged and pushed:** the tag is already public (Overview). Don't
  move it. Delete the draft, fix forward on `main`, and release `v0.1.1`.
