// 19: the Code panel's text. zu colours Go in Go (export.Syntax, go/scanner);
// the page only cuts each line into those runs and draws them as React text,
// never as markup.
import { cmp } from "./cut";
import type { Hunk, Loc, SourceFile, View } from "./data";

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

// Place is where a call or embed is written: at head, or (base) at base, for
// one the change removed (20).
export type Place = Loc & { base?: true };

// behind is where the calls and embeds from an id from accepts to one to
// accepts are written: each edge's loc and more, by path and line, each once,
// head's first. A call or embed the change removed was written at base: its
// places are marked base (20).
export function behind(view: View, from: (id: string) => boolean, to: (id: string) => boolean): Place[] {
  const out = new Map<string, Place>();
  for (const e of view.edges) {
    if (e.kind === "imports" || !from(e.from) || !to(e.to)) continue;
    const base = e.status === "removed";
    for (const l of [e.loc, ...(e.more ?? [])]) out.set(`${base}\n${l.path}\n${l.line}`, base ? { ...l, base } : l);
  }
  return [...out.values()].sort((a, b) => Number(!!a.base) - Number(!!b.base) || cmp(a.path, b.path) || a.line - b.line);
}

// Span is the lines of a file at base a declaration diff draws (20).
export type Span = { path: string; first: number; last: number };

const LIT_CAP = 8; // the places litNote lists of each, before "and N more"

// litNote says where the lit lines are: at head in the shown file (path) and
// in others, at base in the spans drawn and elsewhere; places is null while
// no call or embed is pointed at.
export function litNote(places: Place[] | null, path?: string, spans: Span[] = []): string {
  if (places === null) return "Point at a call or embed to light the lines it is written on.";
  const list = (xs: string[]) =>
    xs.length > LIT_CAP ? `${xs.slice(0, LIT_CAP).join(", ")} and ${xs.length - LIT_CAP} more` : xs.join(", ");
  const drawn = (p: Place) =>
    p.base ? spans.some((s) => s.path === p.path && p.line >= s.first && p.line <= s.last) : p.path === path;
  const of = (base: boolean, here: boolean) =>
    places.filter((p) => !!p.base === base && drawn(p) === here).map((p) => (here ? String(p.line) : `${p.path}:${p.line}`));
  const parts = [
    [of(false, true), "Line", "Lines"],
    [of(true, true), "base line", "base lines"],
    [of(false, false), "in other files:", "in other files:"],
    [of(true, false), "at base:", "at base:"],
  ] as const;
  const out = parts.filter(([xs]) => xs.length > 0).map(([xs, one, many]) => `${xs.length === 1 ? one : many} ${list(xs)}`);
  if (out.length === 0) return "";
  const s = out.join("; ");
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

// Numbered is a diff line as a declaration diff draws it (20): its marker,
// its text, and its line at base (not on a "+" line) and at head (not on a
// "-" line).
export type Numbered = { mark: string; text: string; base?: number; head?: number };

export function numbered(h: Hunk): Numbered[] {
  let [b, hd] = [h.baseStart, h.headStart];
  return h.lines.map((l) => {
    const n: Numbered = { mark: l[0], text: l.slice(1) };
    if (n.mark !== "+") n.base = b++;
    if (n.mark !== "-") n.head = hd++;
    return n;
  });
}

// litRows is which rows of a declaration diff (basePath, headPath) places
// lights: a line at base by its base line, at head by its head line.
export function litRows(rows: Numbered[], basePath: string | undefined, headPath: string | undefined, places: Place[] | null): Set<number> {
  const on = new Set(places?.map((p) => `${!!p.base}\n${p.path}\n${p.line}`));
  const lit = (base: boolean, path: string | undefined, line: number | undefined) =>
    path !== undefined && line !== undefined && on.has(`${base}\n${path}\n${line}`);
  return new Set(rows.flatMap((r, i) => (lit(true, basePath, r.base) || lit(false, headPath, r.head) ? [i] : [])));
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
