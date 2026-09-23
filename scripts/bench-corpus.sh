#!/usr/bin/env bash
# Measure `zu scan` on the pinned Test Corpus (REQ-040, REQ-041).
# Clones shallowly into .zu/corpus/ on first use; prints one Markdown row per repo.
# Usage: scripts/bench-corpus.sh [name...]   (names: cobra hugo kubernetes; default all)
set -euo pipefail

cd "$(dirname "$0")/.."
repo() {
  case "$1" in
    cobra) echo "https://github.com/spf13/cobra.git v1.10.2" ;;
    hugo) echo "https://github.com/gohugoio/hugo.git v0.166.0" ;;
    kubernetes) echo "https://github.com/kubernetes/kubernetes.git v1.37.0" ;;
    *) echo "unknown corpus repo: $1" >&2; exit 3 ;;
  esac
}
now() { python3 -c 'import time; print(time.time())'; }
names=("$@")
[ ${#names[@]} -eq 0 ] && names=(cobra hugo kubernetes)

CGO_ENABLED=0 go build -trimpath -o bin/zu ./cmd/zu
mkdir -p .zu/corpus

case "$(uname)" in
  Darwin) timeflag=-l ;;
  *) timeflag=-v ;;
esac

echo "| repo | tag | wall s | max RSS MB | summary |"
echo "|---|---|---|---|---|"
for name in "${names[@]}"; do
  read -r url tag <<<"$(repo "$name")"
  dir=".zu/corpus/$name@$tag"
  if [ ! -d "$dir" ]; then
    git clone -q --depth 1 --branch "$tag" "$url" "$dir" 2>/dev/null
  fi
  log=".zu/corpus/$name.time.log"
  start=$(now)
  /usr/bin/time "$timeflag" bin/zu scan "$dir" -out ".zu/corpus/$name.json" -max-parse-errors 1000000 2>"$log" || true
  end=$(now)
  if [ "$(uname)" = Darwin ]; then
    rss=$(awk '/maximum resident set size/ {printf "%.0f", $1/1048576}' "$log")
  else
    rss=$(awk -F: '/Maximum resident set size/ {printf "%.0f", $2/1024}' "$log")
  fi
  wall=$(python3 -c "print(f'{$end-$start:.2f}')")
  summary=$(grep '^zu scan:' "$log" | sed 's/ → .*//; s/^zu scan: //')
  echo "| $name | $tag | $wall | $rss | $summary |"
done
