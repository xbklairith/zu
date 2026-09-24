// Shorter labels (11): siblings drawn side by side often share a long path
// prefix (k8s.io/…, github.com/org/…). The full id stays in the box's title
// and in the Panel.

// shorten drops the leading path segments that every label of one sibling set
// shares, whole segments only: "k8s.io/api" and "k8s.io/apimachinery" draw as
// "api" and "apimachinery". It never empties a label, so it keeps at least the
// last segment of the shortest, and a label alone is kept whole: with nothing
// beside it, nothing tells the reader what was dropped.
export function shorten(labels: readonly string[]): string[] {
  if (labels.length < 2) return [...labels];
  const segs = labels.map((l) => l.split("/"));
  const most = Math.min(...segs.map((s) => s.length)) - 1;
  let k = 0;
  while (k < most && segs.every((s) => s[k] === segs[0][k])) k++;
  return segs.map((s) => s.slice(k).join("/"));
}
