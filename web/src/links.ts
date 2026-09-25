// Host links: the View's templates filled for one file and line, and the
// Change View's places on the host's compare page, which zu computed (14).
// Only https results are returned, so a crafted View cannot become a script URL.
import type { View } from "./data";

type Links = View["links"];

const https = (url: unknown): string | null => (typeof url === "string" && url.startsWith("https://") ? url : null);

// linkFor is the source at head, or at base (14) for what the change removed.
export function linkFor(links: Links, path: string, line: number, side: "head" | "base" = "head"): string | null {
  const template = side === "base" ? links?.base : links?.blob;
  if (!template) return null;
  return https(
    template.replace("{path}", path.split("/").map(encodeURIComponent).join("/")).replace("{line}", String(line)),
  );
}

const own = (m: Record<string, string> | undefined, key: string) => (m && Object.hasOwn(m, key) ? m[key] : null);

// diffLink is a changed declaration's first changed line on the compare page.
export function diffLink(links: Links, id: string): string | null {
  return https(own(links?.nodes, id));
}

// fileDiffLink is one changed file's diff on the compare page.
export function fileDiffLink(links: Links, path: string): string | null {
  return https(own(links?.files, path));
}
