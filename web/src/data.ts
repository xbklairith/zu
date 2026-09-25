// The View document written by internal/export (Go). Keys are the contract.
export type Loc = { path: string; line: number };
export type NodeKind = "package" | "type" | "function" | "external";
export type ViewNode = {
  id: string; kind: NodeKind; parent?: string; module?: string; exported?: boolean;
  typeKind?: string; generated?: boolean; loc: Loc; decls?: number; unresolved?: number;
  detail?: boolean; status?: string; movedFrom?: string; hop?: number;
  rank?: number; // 06: the package's Policy Level, 0 = innermost
  main?: boolean; // 12: package main, a program's entry
  genDecls?: number; // 12: packages: declarations in generated files
  demoted?: "name" | "generated"; // 12: set aside in the first view (policy.Demoted)
};
export type ViewEdge = {
  from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
  violation?: Violation["rule"]; // 06: the Policy rule this import breaks
};
export type Ref = { commit: string; dirty: boolean };
export type Hunk = { baseStart: number; baseLines: number; headStart: number; headLines: number; lines: string[] };
export type Violation = { rule: "levels" | "cycle"; from: string; to: string };
// Proposal is one of the Policy's Proposals as internal/export writes it (07):
// layers inner first, the ids it omits, each ranked package's layer and the
// package imports that break its layering.
export type Proposal = {
  name: string; layers: { name: string; members: string[] }[]; omit?: string[];
  ranks: Record<string, number>; violations: { from: string; to: string }[];
};
// Metrics is the CRAP overlay (08). A package without `crap` has functions
// but no coverage data; a function without `crap` has no coverage data.
export type Metrics = {
  packages: Record<string, { funcs: number; missing?: number; crap?: { mu: number; max: number; sigma: number } }>;
  funcs: Record<string, { cc: number; stmts: number; covered: number; crap?: number }>;
};
export type View = {
  schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref; changed?: string[];
  modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
  links?: { blob: string; compare?: string };
  hunks?: Record<string, Hunk[]>;
  // 06: only when the Policy has rules; 07: or an order or Proposals.
  policy?: { hash: string; levels: string[][]; order?: string[]; proposals?: Proposal[]; budget?: number };
  violations?: { new: Violation[]; fixed: Violation[]; known: number }; // 07: Change View only
  metrics?: Metrics; // 08: only when zu was given -coverprofile
  // 07, never written by zu: the box tree a Proposal draws (proposal.ts). cut.ts
  // index reads parent instead of package ids, and scene.ts labels from label.
  regroup?: { parent: Record<string, string>; label: Record<string, string> };
  honesty: {
    parseErrors: { path: string; message: string }[]; unresolvedCalls: number;
    unresolvedImports: number; unsupported: Record<string, number>;
  };
};

export const SCHEMA = "1";

export function parseView(text: string): View {
  const v = JSON.parse(text);
  if (v?.schema !== SCHEMA) {
    throw new Error(`zu view schema ${v?.schema ?? "missing"}; this page reads schema ${SCHEMA}`);
  }
  return v as View;
}

// LIVE is what zu serve writes into the page (10): the View is at view.json.
const LIVE = '{"live":true}';

// readEmbedded returns the View zu wrote into the page, "live" when zu serve
// sent the page, or null for the bare template.
export function readEmbedded(doc: Document): View | "live" | null {
  const text = doc.getElementById("zu-data")?.textContent?.trim();
  if (!text || text === "{}") return null;
  return text === LIVE ? "live" : parseView(text);
}

// fetchView asks zu serve for the View, from the origin that sent the page
// (the CSP allows no other). Each request rescans the working tree. The text
// and the generation zu serve's watch had published come too (13, live.ts):
// the page draws only a later generation, and only when its text differs.
export async function fetchView(get: typeof fetch = fetch): Promise<Loaded> {
  const r = await get("view.json", { cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`zu serve: ${text.trim() || r.status}`);
  return { view: parseView(text), text, gen: Number(r.headers.get("Zu-Generation")) || 0 };
}

// Loaded is a View zu serve sent, with its text and generation (0 without a watch).
export type Loaded = { view: View; text: string; gen: number };
