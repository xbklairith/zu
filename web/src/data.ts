// The View document written by internal/export (Go). Keys are the contract.
export type Loc = { path: string; line: number };
export type NodeKind = "package" | "type" | "function" | "external";
export type ViewNode = {
  id: string; kind: NodeKind; parent?: string; module?: string; exported?: boolean;
  typeKind?: string; generated?: boolean; loc: Loc; decls?: number; unresolved?: number;
  detail?: boolean; status?: string; movedFrom?: string; hop?: number;
};
export type ViewEdge = {
  from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
};
export type Ref = { commit: string; dirty: boolean };
export type Hunk = { baseStart: number; baseLines: number; headStart: number; headLines: number; lines: string[] };
export type View = {
  schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref; changed?: string[];
  modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
  links?: { blob: string; compare?: string };
  hunks?: Record<string, Hunk[]>;
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

// readEmbedded returns the View zu wrote into the page, or null for the bare template.
export function readEmbedded(doc: Document): View | null {
  const text = doc.getElementById("zu-data")?.textContent?.trim();
  return !text || text === "{}" ? null : parseView(text);
}
