import { describe, expect, it } from "vitest";
import css from "./styles.css?raw";

// 08: the CRAP fills must keep text readable and stay apart for readers
// with red-green colour blindness (Deviation 9). Colours are read from the
// tokens, so a change to styles.css is checked here.
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
}
const light = tokens(css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)")));
const dark = { ...light, ...tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)")).split("\n}\n")[0]) };

type RGB = [number, number, number];
const linear = (hex: string): RGB =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(linear(a)), luminance(linear(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// Machado, Oliveira and Fernandes (2009), severity 1, on linear RGB.
const SIM: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};
function lab(c: RGB): RGB {
  const [r, g, b] = c.map((v) => Math.min(1, Math.max(0, v)));
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
// deltaE is CIE76 between a and b as a reader with vision v sees them.
function deltaE(a: string, b: string, v: string): number {
  const see = (hex: string) => lab(SIM[v].map((row) => row.reduce((s, k, i) => s + k * linear(hex)[i], 0)) as RGB);
  const [p, q] = [see(a), see(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const FILLS = ["crap-green", "crap-yellow", "crap-red"];

describe.each([["light", light], ["dark", dark]])("CRAP fills, %s", (_, t) => {
  it("keep node text at 4.5:1 and outlines at 3:1", () => {
    // --removed never sits on a fill: a removed node has no metrics (head
    // only), so it only needs 3:1 as the hidden-violation border (--pin).
    const low: string[] = [];
    for (const f of FILLS) {
      for (const [k, min] of [["fg", 4.5], ["muted", 4.5], ["added", 4.5], ["modified", 4.5], ["moved", 4.5], ["pin", 3], ["accent", 3]] as const) {
        if (contrast(t[f], t[k]) < min) low.push(`${k} on ${f} ${contrast(t[f], t[k]).toFixed(2)}`);
      }
    }
    expect(low).toEqual([]);
  });

  it("differ by ΔE 10 or more to normal, deuteranopic and protanopic vision", () => {
    const near: string[] = [];
    for (const v of Object.keys(SIM)) {
      for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
        const d = deltaE(t[FILLS[a]], t[FILLS[b]], v);
        if (d < 10) near.push(`${FILLS[a]}/${FILLS[b]} ${v} ${d.toFixed(1)}`);
      }
    }
    expect(near).toEqual([]);
  });
});
