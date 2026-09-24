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
