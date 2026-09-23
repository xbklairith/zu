#!/usr/bin/env bash
# Measure `zu scan` on the pinned Test Corpus (REQ-040, REQ-041), from disk and
# from git objects (`-ref HEAD`, feature 02), and check the two IRs are identical.
# Then time `zu diff HEAD~50` (feature 03), deepening the clone to reach it.
# Clones shallowly into .zu/corpus/ on first use; prints Markdown rows per repo.
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

echo "| repo | tag | mode | wall s | max RSS MB | summary |"
echo "|---|---|---|---|---|---|"
measure() { # name tag mode dir [scan flags...]
  local name=$1 tag=$2 mode=$3 dir=$4
  shift 4
  local log=".zu/corpus/$name.$mode.time.log" start end rss wall summary
  start=$(now)
  /usr/bin/time "$timeflag" bin/zu scan "$@" "$dir" -out ".zu/corpus/$name.$mode.json" -max-parse-errors 1000000 2>"$log" || true
  end=$(now)
  if [ "$(uname)" = Darwin ]; then
    rss=$(awk '/maximum resident set size/ {printf "%.0f", $1/1048576}' "$log")
  else
    rss=$(awk -F: '/Maximum resident set size/ {printf "%.0f", $2/1024}' "$log")
  fi
  wall=$(python3 -c "print(f'{$end-$start:.2f}')")
  summary=$(grep '^zu scan:' "$log" | sed 's/ → .*//; s/^zu scan: //')
  echo "| $name | $tag | $mode | $wall | $rss | $summary |"
}
measure_diff() { # name tag dir
  local name=$1 tag=$2 dir=$3
  local log=".zu/corpus/$name.diff.time.log" start end rss wall summary
  git -C "$dir" fetch -q --deepen 60 origin "refs/tags/$tag" 2>/dev/null || git -C "$dir" fetch -q --deepen 60 2>/dev/null
  start=$(now)
  (cd "$dir" && /usr/bin/time "$timeflag" "$OLDPWD/bin/zu" diff HEAD~50 -format json -max-parse-errors 1000000 \
    >"$OLDPWD/.zu/corpus/$name.diff.json") 2>"$log" || true
  end=$(now)
  if [ "$(uname)" = Darwin ]; then
    rss=$(awk '/maximum resident set size/ {printf "%.0f", $1/1048576}' "$log")
  else
    rss=$(awk -F: '/Maximum resident set size/ {printf "%.0f", $2/1024}' "$log")
  fi
  wall=$(python3 -c "print(f'{$end - $start:.2f}')")
  summary=$(grep '^zu diff:' "$log" | sed 's/^zu diff: //' || true)
  [ -n "$summary" ] || summary="FAILED: $(grep -v resident "$log" | head -1)"
  echo "| $name | $tag~50..$tag | diff | $wall | $rss | $summary |"
}
parity=()
for name in "${names[@]}"; do
  read -r url tag <<<"$(repo "$name")"
  dir=".zu/corpus/$name@$tag"
  if [ ! -d "$dir" ]; then
    git clone -q --depth 1 --branch "$tag" "$url" "$dir" 2>/dev/null
  fi
  measure "$name" "$tag" disk "$dir"
  measure "$name" "$tag" ref "$dir" -ref HEAD
  if cmp -s ".zu/corpus/$name.disk.json" ".zu/corpus/$name.ref.json"; then
    parity+=("$name: identical")
  else
    parity+=("$name: DIFFERENT")
  fi
  measure_diff "$name" "$tag" "$dir"
done
echo
printf 'disk vs ref IR: %s\n' "${parity[@]}"
