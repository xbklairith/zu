// 19: the Code panel's text. zu colours Go in Go (export.Syntax, go/scanner);
// the page only cuts each line into those runs and draws them as React text,
// never as markup.
import { cmp } from "./cut";
import type { Loc, SourceFile, View } from "./data";

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

// centre is the line Code draws a file of n lines around (around): at, or
// the first lit line when the lines drawn around at do not hold it (0 is
// none lit).
export function centre(n: number, at: number, first: number): number {
  const [from, to] = around(n, at);
  return first === 0 || (first > from && first <= to) ? at : first;
}

// inline is a file the View carries (zu scan -html, zu serve -include), with
// its colour, or null.
export function inline(view: View, path: string): SourceFile | null {
  const text = view.sources[path];
  return text === undefined ? null : { path, text, syntax: view.syntax?.[path] ?? [] };
}

// behind is where the calls and embeds from an id from accepts to one to
// accepts are written: each edge's loc and more, by path and line, each once.
// A call or embed the change removed was written in base, whose lines the
// code (head's) does not show: it gives none.
export function behind(view: View, from: (id: string) => boolean, to: (id: string) => boolean): Loc[] {
  const out = new Map<string, Loc>();
  for (const e of view.edges) {
    if (e.kind === "imports" || e.status === "removed" || !from(e.from) || !to(e.to)) continue;
    for (const l of [e.loc, ...(e.more ?? [])]) out.set(`${l.path}\n${l.line}`, l);
  }
  return [...out.values()].sort((a, b) => cmp(a.path, b.path) || a.line - b.line);
}

const LIT_CAP = 8; // the places litNote lists of each, before "and N more"

// litNote says where the lit lines are, in the shown file (path) and in
// others; places is null while no call or embed is pointed at.
export function litNote(places: Loc[] | null, path: string): string {
  if (places === null) return "Point at a call or embed to light the lines it is written on.";
  if (places.length === 0) return "The change removed it: it has no line in head.";
  const list = (xs: string[]) =>
    xs.length > LIT_CAP ? `${xs.slice(0, LIT_CAP).join(", ")} and ${xs.length - LIT_CAP} more` : xs.join(", ");
  const here = places.filter((p) => p.path === path).map((p) => String(p.line));
  const there = places.filter((p) => p.path !== path).map((p) => `${p.path}:${p.line}`);
  const out = [
    here.length > 0 && `${here.length === 1 ? "Line" : "Lines"} ${list(here)}`,
    there.length > 0 && `${here.length > 0 ? "in" : "In"} other files: ${list(there)}`,
  ].filter(Boolean);
  return `${out.join("; ")}.`;
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
