#!/bin/sh
# Install zu from a GitHub release: pick the archive for this machine, check it
# against the release's checksums.txt, put zu in /usr/local/bin (with sudo if
# that directory isn't writable), and run zu version. POSIX sh, so the README's
# `curl -fsSL …/install.sh | sh` works whatever shell it is pasted into.
# Environment: ZU_VERSION (0.1.1), ZU_INSTALL_DIR (/usr/local/bin), and
# ZU_DOWNLOAD_URL (the release's download URL; scripts/install-test.sh points
# it at a local dist/).
set -eu

die() {
  echo "zu install: $*" >&2
  exit 1
}

# Everything runs from main, so a download cut short runs nothing.
main() {
  version=${ZU_VERSION:-0.1.1}
  version=${version#v}
  base=${ZU_DOWNLOAD_URL:-https://github.com/xbklairith/zu/releases/download/v$version}
  dir=${ZU_INSTALL_DIR:-/usr/local/bin}

  case $(uname -s) in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) die "no zu release for $(uname -s)" ;;
  esac
  case $(uname -m) in
    arm64 | aarch64) arch=arm64 ;;
    x86_64 | amd64) arch=amd64 ;;
    *) die "no zu release for $(uname -m)" ;;
  esac
  [ "$os/$arch" != linux/arm64 ] || die "no zu release for linux arm64; build it from source (see the README)"

  if command -v curl >/dev/null 2>&1; then
    fetch() { curl -fsSL -o "$2" "$1"; }
  elif command -v wget >/dev/null 2>&1; then
    fetch() { wget -qO "$2" "$1"; }
  else
    die "zu's installer needs curl or wget"
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256() { sha256sum "$1"; }
  elif command -v shasum >/dev/null 2>&1; then
    sha256() { shasum -a 256 "$1"; }
  else
    die "zu's installer needs sha256sum or shasum"
  fi
  command -v tar >/dev/null 2>&1 || die "zu's installer needs tar"

  archive=zu_${version}_${os}_${arch}.tar.gz
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  fetch "$base/$archive" "$tmp/$archive" || die "could not download $base/$archive"
  fetch "$base/checksums.txt" "$tmp/checksums.txt" || die "could not download $base/checksums.txt"
  # Only the archive's own line: busybox sha256sum has no --ignore-missing.
  want=$(awk -v f="$archive" '$2 == f { print $1 }' "$tmp/checksums.txt")
  [ -n "$want" ] || die "checksums.txt has no line for $archive"
  got=$(sha256 "$tmp/$archive" | awk '{ print $1 }')
  [ "$got" = "$want" ] || die "$archive does not match checksums.txt"
  (cd "$tmp" && tar -xzf "$archive" zu)
  chmod 755 "$tmp/zu"

  if mkdir -p "$dir" 2>/dev/null && [ -w "$dir" ]; then
    mv "$tmp/zu" "$dir/zu"
  elif command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p "$dir"
    sudo mv "$tmp/zu" "$dir/zu"
  else
    die "cannot write to $dir; set ZU_INSTALL_DIR to a directory you own, such as \$HOME/.local/bin"
  fi
  "$dir/zu" version
  case :$PATH: in
    *:"$dir":*) ;;
    *) echo "zu install: $dir is not on your PATH" >&2 ;;
  esac
}

main "$@"
