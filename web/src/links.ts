// Host links: the View's templates filled for one file and line. Only https
// results are returned, so a crafted template cannot become a script URL.
import type { View } from "./data";

export function linkFor(links: View["links"], path: string, line: number): string | null {
  if (!links?.blob) return null;
  const url = links.blob
    .replace("{path}", path.split("/").map(encodeURIComponent).join("/"))
    .replace("{line}", String(line));
  return url.startsWith("https://") ? url : null;
}
