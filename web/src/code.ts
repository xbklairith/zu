// 19: the Code panel's text. zu colours Go in Go (export.Syntax, go/scanner);
// the page only cuts each line into those runs and draws them as React text,
// never as markup.
import type { SourceFile, View } from "./data";

// Seg is a run of one line's text, coloured by cls when zu coloured it.
export type Seg = { text: string; cls?: string };

// CLASS names export.Syntax's classes by number (internal/export/syntax.go).
const CLASS = ["", "kw", "com", "str", "num"];

// paint cuts each of lines into segments by its runs, runs[i] being
// lines[i]'s: [column, length, class] flat, in UTF-16 units as JavaScript
// strings count. A run behind an earlier one or of a class this page does not
// know draws nothing coloured; one past its line is cut to it.
export function paint(lines: string[], runs: number[][]): Seg[][] {
  return lines.map((line, i) => {
    const r = runs[i] ?? [];
    const out: Seg[] = [];
    let at = 0;
    for (let k = 0; k + 2 < r.length; k += 3) {
      const [col, cls] = [r[k], CLASS[r[k + 2]]];
      const end = Math.min(col + r[k + 1], line.length);
      if (col < at || end <= col || !cls) continue;
      if (col > at) out.push({ text: line.slice(at, col) });
      out.push({ text: line.slice(col, end), cls });
      at = end;
    }
    if (at < line.length || out.length === 0) out.push({ text: line.slice(at) });
    return out;
  });
}

// CODE_LINES is the most lines Code draws of a file. A longer one, most
// often generated, would take seconds to draw whole: Code draws the lines
// around the marked one, and says which.
export const CODE_LINES = 5000;

// around is the lines Code draws of a file of n, [from, to) counted from 0:
// every one when n is at most size, else size of them centred on line at
// (counted from 1) and held inside the file.
export function around(n: number, at: number, size = CODE_LINES): [number, number] {
  if (n <= size) return [0, n];
  const from = Math.min(Math.max(at - 1 - Math.floor(size / 2), 0), n - size);
  return [from, from + size];
}

// inline is a file the View carries (zu scan -html, zu serve -include), with
// its colour, or null.
export function inline(view: View, path: string): SourceFile | null {
  const text = view.sources[path];
  return text === undefined ? null : { path, text, syntax: view.syntax?.[path] ?? [] };
}

// Read gives a file zu serve sends on demand (19), or null.
export type Read = (path: string) => Promise<SourceFile | null>;

// reader reads each file once. The page makes one per View zu serve sends
// (main.tsx), so a file is read again after a save.
export function reader(get: Read): Read {
  const got = new Map<string, Promise<SourceFile | null>>();
  return (path) => {
    let p = got.get(path);
    if (!p) got.set(path, (p = get(path)));
    return p;
  };
}
