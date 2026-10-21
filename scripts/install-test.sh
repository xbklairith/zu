#!/usr/bin/env bash
# Run the README's install line on fresh Linux images in Docker, from sh, bash,
# zsh and fish, and check the zu it installs; on macOS, run it here from zsh too.
# With a goreleaser dist/ (make release-snapshot) the line fetches
# scripts/install.sh and dist/ from a sidecar; with --release it runs as written,
# against the published release. The amd64 images run emulated on an arm64 host.
# Usage: scripts/install-test.sh [dist | --release]
set -euo pipefail
cd "$(dirname "$0")/.."
fail() { echo "install-test: $*" >&2; exit 1; }

line=$(grep -m1 -o 'curl -fsSL https://raw.githubusercontent.com/xbklairith/zu/v[^/]*/scripts/install.sh | sh' README.md) ||
  fail "README.md has no line 'curl -fsSL https://raw.githubusercontent.com/xbklairith/zu/v<version>/scripts/install.sh | sh'"
url=${line#curl -fsSL }
url=${url% | sh}
readme=${url#*/zu/v}
readme=${readme%%/*}
grep -qxF "  version=\${ZU_VERSION:-$readme}" scripts/install.sh ||
  fail "scripts/install.sh's default ZU_VERSION is not $readme, the version in README.md's line"

net='' envs=() hosturl=$url hostenvs=()
if [ "${1:-}" = --release ]; then
  version=$readme
  commit=$(git rev-parse "v$version^{commit}")
else
  d=$(cd "${1:-dist}" && pwd)
  name=$(grep -o 'zu_[^ ]*_version\.txt$' "$d/checksums.txt") || fail "no version record in $d/checksums.txt"
  version=${name#zu_}
  version=${version%_version.txt}
  rec=$d/$name
  [ -f "$rec" ] || rec=.zu/release/$name
  commit=$(sed -n 's/^commit //p' "$rec")
  srv=$(mktemp -d)
  net=zu-install-test-$$
  trap 'docker rm -f "$net-srv" >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; rm -rf "$srv"' EXIT
  cp "$d"/*.tar.gz "$d/checksums.txt" scripts/install.sh "$srv/"
  mkdir "$srv/bad" # every archive, against checksums that are all wrong
  cp "$d"/*.tar.gz "$srv/bad/"
  sed 's/^[0-9a-f]\{64\}/0000000000000000000000000000000000000000000000000000000000000000/' "$d/checksums.txt" >"$srv/bad/checksums.txt"
  # Copied in, not mounted: Docker Desktop shares neither $TMPDIR nor the scratch dirs.
  docker network create "$net" >/dev/null
  docker create --name "$net-srv" --network "$net" busybox:1.36 httpd -f -p 8000 -h /srv >/dev/null
  docker cp -q "$srv/." "$net-srv:/srv"
  docker start "$net-srv" >/dev/null
  url=http://$net-srv:8000/install.sh
  envs=(-e "ZU_VERSION=$version" -e "ZU_DOWNLOAD_URL=http://$net-srv:8000")
  hosturl=file://$PWD/scripts/install.sh
  hostenvs=("ZU_VERSION=$version" "ZU_DOWNLOAD_URL=file://$d")
fi
[ -n "$commit" ] || fail "no commit for $version"
cmd="curl -fsSL $url | sh"
apt='export DEBIAN_FRONTEND=noninteractive && apt-get update -qq && apt-get install -y -qq'
echo "install-test: zu $version ($commit), via: $cmd"

failed=0
# expect NAME OUTPUT CODE WANT: WANT "ok" is an exit 0 and the zu built from
# $commit; anything else is a failure that says WANT.
expect() {
  local name=$1 out=$2 code=$3 want=$4 why=
  if [ "$want" = ok ]; then
    [ "$code" -eq 0 ] || why="exit $code"
    grep -qx "zu version v$version" <<<"$out" || why="${why:+$why; }no 'zu version v$version'"
    grep -qx "commit $commit" <<<"$out" || why="${why:+$why; }no 'commit $commit'"
    grep -qx 'ui embedded' <<<"$out" || why="${why:+$why; }UI not embedded"
  else
    [ "$code" -ne 0 ] || why="exit 0, want a failure"
    grep -qF -- "$want" <<<"$out" || why="${why:+$why; }no '$want'"
  fi
  if [ -z "$why" ]; then
    echo "  ok    $name"
  else
    echo "  FAIL  $name: $why"
    tail -15 <<<"$out" | sed 's/^/        | /'
    failed=$((failed + 1))
  fi
}

# run NAME PLATFORM IMAGE PREP RUN WANT [docker run flags...]
run() {
  local name=$1 platform=$2 image=$3 prep=$4 cmdline=$5 want=$6 out code
  shift 6
  out=$(docker run --rm --platform "$platform" ${net:+--network "$net"} ${envs[@]+"${envs[@]}"} "$@" "$image" \
    sh -c "$prep && $cmdline" 2>&1) && code=0 || code=$?
  expect "$name" "$out" "$code" "$want"
}

a=linux/amd64
run "alpine, busybox ash, wget" $a alpine:3.20 true "wget -qO- $url | sh" ok
run "debian, dash" $a debian:stable-slim "$apt curl >/dev/null" "$cmd" ok
run "debian, bash" $a debian:stable-slim "$apt curl >/dev/null" "bash -c '$cmd'" ok
run "debian, zsh" $a debian:stable-slim "$apt curl zsh >/dev/null" "zsh -c '$cmd'" ok
run "debian, fish" $a debian:stable-slim "$apt curl fish >/dev/null" "fish -c '$cmd'" ok
su="su -w ZU_VERSION,ZU_DOWNLOAD_URL u -s /bin/sh -c"
run "ubuntu, a user, ZU_INSTALL_DIR" $a ubuntu:24.04 "$apt curl >/dev/null && useradd -m u" \
  "$su 'curl -fsSL $url | ZU_INSTALL_DIR=\$HOME/.local/bin sh'" ok
run "ubuntu, a user, sudo" $a ubuntu:24.04 \
  "$apt curl sudo >/dev/null && useradd -m u && echo 'u ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/u" "$su '$cmd'" ok
run "ubuntu, a user, no sudo" $a ubuntu:24.04 "$apt curl >/dev/null && useradd -m u" "$su '$cmd'" ZU_INSTALL_DIR
run "fedora, bash as sh" $a fedora:41 true "$cmd" ok
run "linux arm64, busybox" linux/arm64 busybox:1.36 true "wget -qO- $url | sh" "no zu release for linux arm64"
if [ -n "$net" ]; then
  run "debian, no curl or wget" $a debian:stable-slim true "sh -s" "needs curl or wget" -i <scripts/install.sh
  run "a wrong checksum" $a debian:stable-slim "$apt curl >/dev/null" "$cmd" "does not match checksums.txt" \
    -e "ZU_DOWNLOAD_URL=http://$net-srv:8000/bad"
fi
if [ "$(uname -s)" = Darwin ]; then
  dir=$(mktemp -d)
  out=$(env ${hostenvs[@]+"${hostenvs[@]}"} ZU_INSTALL_DIR="$dir/bin" zsh -c "curl -fsSL $hosturl | sh" 2>&1) && code=0 || code=$?
  expect "this Mac, zsh" "$out" "$code" ok
  rm -rf "$dir"
fi

[ "$failed" -eq 0 ] || fail "$failed case(s) failed"
echo "install-test: ok"
