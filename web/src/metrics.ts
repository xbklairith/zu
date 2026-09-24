// 08: the CRAP overlay. zu writes each package's μ, max and σ over its
// functions' CRAP (internal/export AddMetrics); the page grades μ+σ as
// uml-viewer does (config.clj at 79cc1ef) and rolls a box up to the worst
// package under it.
import { index } from "./cut";
import type { View } from "./data";

// config.clj crap-thresholds, l.3–7: μ+σ, lower is better.
export const CRAP_STOPS = { green: 8, yellow: 12, red: 20 } as const;
export type Band = "green" | "yellow" | "red";

// Risk is μ+σ; null means measured but without coverage data.
export type Risk = number | null;

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  x0 === x1 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);

// crapGrade is config.clj crap-grade (l.63): μ+σ on 1–10, 10 best, through
// `along` (l.48); missing data is the worst grade, 1.
export function crapGrade(risk: Risk): number {
  if (risk === null) return 1;
  const { green, yellow, red } = CRAP_STOPS;
  if (risk <= green) return 10;
  if (risk <= yellow) return lerp(risk, green, yellow, 10, 5.5);
  if (risk <= red) return lerp(risk, yellow, red, 5.5, 1);
  return 1;
}

// crapBand is config.clj crap-band (l.19): missing counts as red.
export function crapBand(risk: Risk): Band {
  if (risk === null) return "red";
  return risk <= CRAP_STOPS.green ? "green" : risk <= CRAP_STOPS.yellow ? "yellow" : "red";
}

// BAND_WORD names each band as a risk, for the badge and the legend.
export const BAND_WORD: Record<Band, string> = { green: "low", yellow: "mid", red: "high" };

// crapLabel is a badge's text: μ+σ (or "?" for no coverage data) and its
// band in words, so colour is never the only sign.
export const crapLabel = (risk: Risk) => `${risk ?? "?"} ${BAND_WORD[crapBand(risk)]}`;

const round1 = (x: number) => Math.round(x * 10) / 10;

// worse is config.clj worse-crap (l.99): no data beats any number.
const worse = (a: Risk | undefined, b: Risk): Risk =>
  a === undefined ? b : a === null || b === null ? null : Math.max(a, b);

// packageRisk is a package's own μ+σ: null without coverage data, undefined
// when it has no functions to measure.
export function packageRisk(view: View, id: string): Risk | undefined {
  const pm = view.metrics?.packages[id];
  if (!pm) return undefined;
  return pm.crap ? round1(pm.crap.mu + pm.crap.sigma) : null;
}

const rolled = new WeakMap<View, Map<string, Risk>>();

// rolledCrap is every measured package's μ+σ and every box's worst among
// the packages under it (hierarchy.clj rolled-crap, l.88). A package with
// no functions has nothing to measure and is left out (Deviation 3).
export function rolledCrap(view: View): Map<string, Risk> {
  const hit = rolled.get(view);
  if (hit) return hit;
  const out = new Map<string, Risk>();
  const { parent, pkgs } = index(view);
  for (const p of pkgs) {
    const r = packageRisk(view, p.id);
    if (r === undefined) continue;
    for (let b = p.id; b !== ""; b = parent.get(b) ?? "") out.set(b, worse(out.get(b), r));
  }
  rolled.set(view, out);
  return out;
}
