import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { parseView } from "./data";
import { absolute, containerWidth, elkGraph, INSET, inOrder, layout, orderOf, positions, ROW_MAX, sizeOf, superseding, Superseded, textWidth, triangles, WRAP, WRAP_GAP, type Stoppable } from "./layout";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { decl, edge, pkgs, view } from "./testkit";

const v = parseView(JSON.stringify(golden));
const elk = new ELK();

describe("layout", () => {
  it("places every scene node the same way twice, relative to its container", async () => {
    const sc = scene(v, DEFAULT_STATE);
    const a = await layout(sc, elk);
    const b = await layout(sc, elk);
    expect([...a.keys()].sort()).toEqual(sc.nodes.map((n) => n.id));
    for (const p of a.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(a).toEqual(b);
    expect(a.get("example.com/shop/internal/store")?.parent).toBe("example.com/shop/internal");
    const abs = absolute(a, "example.com/shop/internal/store")!;
    const [s, i, m] = ["example.com/shop/internal/store", "example.com/shop/internal", "example.com/shop"].map((id) => a.get(id)!);
    expect(abs).toEqual({ x: s.x + i.x + m.x, y: s.y + i.y + m.y });
  });
  it("sizes come from text: box stats, method rows, container labels; no drawn edge", () => {
    const g = elkGraph(scene(v, DEFAULT_STATE));
    expect(g.layoutOptions?.["elk.spacing.nodeNode"]).toBe("24");
    expect(sizeOf({ id: "x", label: "gen", parent: "", shape: "box", dim: false, selected: false, methods: [] }).w).toBe(90);
    expect(sizeOf({ id: "x", label: "T", parent: "", shape: "decl", dim: false, selected: false, methods: ["Get", "Put"] }))
      .toEqual({ w: 90, h: 76 });
    expect(g.edges!.filter((e) => !e.id.includes("__rank:"))).toEqual([]);
  });
  it("measures text with the label font's glyph advances, the widest for any other glyph", () => {
    expect(textWidth("W")).toBe(12);
    expect(textWidth("iii")).toBeCloseTo(9.9);
    expect(textWidth("é")).toBe(12);
  });
  it("sizes a box so its label and stats line are never clipped (11)", () => {
    const box = { id: "x", parent: "", shape: "box" as const, dim: false, selected: false, methods: [] };
    // The longest stats line: 9,999 boxes either way, 99,999 packages.
    const stats = "uses 9999 · used by 9999 · 99999 pkgs";
    expect(sizeOf({ ...box, label: "gen", stats }).w).toBe(Math.ceil(textWidth(stats) + INSET));
    // No cap: a long label widens its box.
    const long = "staging/src/k8s.io/apimachinery/pkg/util/managedfields/internal";
    expect(sizeOf({ ...box, label: long }).w).toBe(Math.ceil(textWidth(long) + INSET));
    // The rank badge and the toggle take room from the label's line only.
    expect(sizeOf({ ...box, label: long, rank: 2, toggle: "expand", stats }).w).toBe(Math.ceil(textWidth(long) + INSET + 18 + 22));
    // A1: kubernetes' mount-utils, a short label over a longer stats line, is
    // as wide as the line, with or without the packages it would hold.
    for (const line of ["uses 1 · used by 1", "uses 1 · used by 1 · 12 pkgs"]) {
      expect(sizeOf({ ...box, label: "mount-utils", stats: line }).w).toBe(Math.max(90, Math.ceil(textWidth(line) + INSET)));
    }
  });
  it("triangles sit on the top and bottom edges, apex out (uml-viewer)", () => {
    expect(triangles(100, 40)).toEqual({ in: "50,-10.39 44,0 56,0", out: "44,40 56,40 50,50.39" });
  });
});

// 07: m/core is rank 0, m/api rank 1; m/core/u and m/x are unranked, which
// uml-viewer draws as level 0 (layout.clj place-classes l.293).
const levels = {
  ...view(
    [
      ...pkgs(["m/api/h"], "m", { rank: 1 }),
      ...pkgs(["m/core/a"], "m", { rank: 0 }),
      ...pkgs(["m/core/u", "m/x"], "m"),
    ],
    [edge("m/api/h", "m/core/a"), { ...edge("m/core/a", "m/api/h"), violation: "levels" as const }],
  ),
  policy: { hash: "sha256:p", levels: [["m/core"], ["m/api"]], order: ["m/x", "m/core"] },
};

describe("levels and order (07)", () => {
  it("draws level 0 at the bottom, inside containers too, whichever way edges point", async () => {
    const a = await layout(scene(levels, { ...DEFAULT_STATE, depth: 3 }), elk);
    const y = (id: string) => absolute(a, id)!.y;
    expect(y("m/api")).toBeLessThan(y("m/core"));
    expect(y("m/api/h")).toBeLessThan(y("m/core/a"));
    expect(y("m/core/u")).toBe(y("m/core/a")); // unranked: level 0
    expect(y("m/x")).toBeGreaterThan(y("m/api")); // unranked: level 0
    expect(absolute(a, "m/x")!.x).toBeLessThan(absolute(a, "m/core")!.x); // order: [m/x, m/core]
  });

  it("steps between ranks, and gives ELK no other edge", () => {
    const g = elkGraph(scene(levels, { ...DEFAULT_STATE, depth: 3 }));
    const m = g.children![0];
    expect(m.children!.map((c) => c.id)).toEqual(["m/x", "m/core", "m/api", "__rank:m:1"]);
    expect(g.edges!.map((e) => e.id)).toEqual(["__rank:m:1→m/x", "__rank:m:1→m/core", "m/api→__rank:m:1"]);
  });

  it("never places a higher rank below a lower one on zu's own layering", async () => {
    // zu's 06 acceptance layering at depth 3: eight siblings in zu/internal,
    // edges between most of them, some pointing up. ELK partitioning put
    // version (0) level with export (4); the steps must not.
    const ranks: Record<string, number> = { cli: 5, diff: 3, export: 4, gitref: 2, ir: 0, policy: 2, scan: 1, version: 0 };
    const ids = Object.keys(ranks).map((k) => `z/internal/${k}`);
    const zu = view(ids.map((id) => ({ ...pkgs([id], "z")[0], rank: ranks[id.slice(11)] })), [
      edge("z/internal/cli", "z/internal/export"), edge("z/internal/cli", "z/internal/version"),
      edge("z/internal/export", "z/internal/diff"), edge("z/internal/diff", "z/internal/policy"),
      edge("z/internal/policy", "z/internal/scan"), edge("z/internal/scan", "z/internal/ir"),
      edge("z/internal/gitref", "z/internal/ir"), { ...edge("z/internal/ir", "z/internal/cli"), violation: "levels" },
    ]);
    const a = await layout(scene(zu, { ...DEFAULT_STATE, depth: 3 }), elk);
    const y = (k: string) => absolute(a, `z/internal/${k}`)!.y;
    for (const p of Object.keys(ranks)) for (const q of Object.keys(ranks)) {
      if (ranks[p] > ranks[q]) expect(y(p), `${p} above ${q}`).toBeLessThan(y(q));
    }
    expect([...a.keys()].some((id) => id.startsWith("__rank"))).toBe(false);
  });

  it("ranks inside siblings of one rank, whichever way edges point", async () => {
    // m/a and m/b both roll up to rank 1, and each imports up into the other.
    const x = view(
      [...pkgs(["m/a/hi", "m/b/hi"], "m", { rank: 1 }), ...pkgs(["m/a/lo", "m/b/lo"], "m", { rank: 0 })],
      [{ ...edge("m/a/lo", "m/b/hi"), violation: "levels" }, { ...edge("m/b/lo", "m/a/hi"), violation: "levels" }],
    );
    const a = await layout(scene(x, { ...DEFAULT_STATE, depth: 3 }), elk);
    for (const p of ["m/a", "m/b"]) expect(absolute(a, `${p}/hi`)!.y, p).toBeLessThan(absolute(a, `${p}/lo`)!.y);
  });

  it("puts ordered siblings first in the input, in the Policy's order, then the rest by id", () => {
    const m = elkGraph(scene(levels, { ...DEFAULT_STATE, depth: 2 })).children![0];
    expect(m.children!.map((c) => c.id).filter((id) => !id.startsWith("__rank"))).toEqual(["m/x", "m/core", "m/api"]);
  });

  it("places ordered siblings first in their row, side by side from the row's left edge", async () => {
    // ELK alone placed these six unconnected siblings x, z, c, y, a, b.
    const ids = ["m/a", "m/b", "m/c", "m/x", "m/y", "m/z"];
    const six = { ...view(pkgs(ids, "m"), []), policy: { hash: "sha256:p", levels: [], order: ["m/z", "m/y", "m/x"] } };
    const sc = scene(six, { ...DEFAULT_STATE, depth: 2 });
    const elkOnly = positions(await elk.layout(elkGraph(sc)));
    const a = await layout(sc, elk);
    const row = [...ids].sort((p, q) => a.get(p)!.x - a.get(q)!.x);
    expect(row).toEqual(["m/z", "m/y", "m/x", "m/a", "m/b", "m/c"]);
    expect(new Set(ids.map((id) => a.get(id)!.y)).size).toBe(1);
    expect(a.get("m/z")!.x).toBe(Math.min(...ids.map((id) => elkOnly.get(id)!.x)));
    for (let i = 1; i < row.length; i++) {
      const [l, r] = [a.get(row[i - 1])!, a.get(row[i])!];
      expect(r.x - (l.x + l.w), row[i]).toBe(24); // elk.spacing.nodeNode
    }
    expect(inOrder(elkOnly, orderOf(scene(v, DEFAULT_STATE)))).toBe(elkOnly); // no order: ELK's placement
  });
});

// 11: without Levels, each sibling set is ranked from its own dependencies.
describe("architecture ranks (11)", () => {
  it("draws a dependency below what depends on it", async () => {
    // m/web → m/app → m/db, m/web → m/db, and m/tool alone: web over app
    // over db, tool with db at the bottom. m/app/x → m/app/y inside m/app.
    const x = view(pkgs(["m/web", "m/app/x", "m/app/y", "m/db", "m/tool"], "m"), [
      edge("m/web", "m/app/x"), edge("m/app/x", "m/db"), edge("m/web", "m/db"), edge("m/app/x", "m/app/y"),
    ]);
    const sc = scene(x, { ...DEFAULT_STATE, depth: 3 });
    expect(Object.fromEntries(sc.nodes.map((n) => [n.id, n.tier])))
      .toEqual({ m: 0, "m/app": 1, "m/app/x": 1, "m/app/y": 0, "m/db": 0, "m/tool": 0, "m/web": 2 });
    const a = await layout(sc, elk);
    const y = (id: string) => absolute(a, id)!.y;
    expect(y("m/web")).toBeLessThan(y("m/app"));
    expect(y("m/app/x")).toBeLessThan(y("m/app/y"));
    expect(y("m/app") + a.get("m/app")!.h).toBeLessThan(y("m/db"));
    expect(y("m/tool")).toBe(y("m/db"));
  });

  it("stacks ranks as rows over one centre, as wide as the widest row, not a staircase", async () => {
    // m/a → m/b → m/c over six leaves m/l0..m/l5 that m/c imports: hugo's
    // shape. ELK's default placement drew each rank right of the one below.
    const leaves = Array.from({ length: 6 }, (_, i) => `m/l${i}`);
    const x = view(pkgs(["m/a", "m/b", "m/c", ...leaves], "m"), [
      edge("m/a", "m/b"), edge("m/b", "m/c"), ...leaves.map((l) => edge("m/c", l)),
    ]);
    const a = await layout(scene(x, { ...DEFAULT_STATE, focus: "m" }), elk);
    const mid = (id: string) => a.get(id)!.x + a.get(id)!.w / 2;
    const row = leaves.map((l) => a.get(l)!);
    const left = Math.min(...row.map((r) => r.x));
    const right = Math.max(...row.map((r) => r.x + r.w));
    for (const id of ["m/a", "m/b", "m/c"]) expect(Math.abs(mid(id) - (left + right) / 2)).toBeLessThan(1);
    const all = [...a.values()];
    expect(Math.max(...all.map((r) => r.x + r.w)) - Math.min(...all.map((r) => r.x))).toBe(right - left);
    // Two ranks are one step layer apart, 12 px either side of it, however
    // many step edges fan out: kubernetes' 38 boxes were 1208 px high, 808 so.
    const gap = (hi: string, lo: string) => a.get(lo)!.y - (a.get(hi)!.y + a.get(hi)!.h);
    expect([gap("m/a", "m/b"), gap("m/c", "m/l0")]).toEqual([24, 24]);
  });

  it("wraps a rank wider than WRAP boxes into rows of WRAP, in order", async () => {
    // 25 types in one package, 90 px each: WRAP binds before ROW_MAX. (Boxes
    // carry a stats line, so ROW_MAX binds first for them: the next test.)
    const types = Array.from({ length: 25 }, (_, i) => `m/p.T${String(i).padStart(2, "0")}`);
    const x = view([...pkgs(["m/p"], "m"), ...types.map((t) => decl(t, "m/p"))]);
    const sc = scene(x, { ...DEFAULT_STATE, focus: "m/p" });
    expect(sc.decls).toBe(true);
    const a = await layout(sc, elk);
    const rows = new Map<number, string[]>();
    for (const t of types) rows.set(a.get(t)!.y, [...(rows.get(a.get(t)!.y) ?? []), t]);
    expect(WRAP).toBe(10);
    expect([...rows.values()].map((r) => r.length)).toEqual([10, 10, 5]);
    expect([...rows.values()].map((r) => r[0])).toEqual(["m/p.T00", "m/p.T10", "m/p.T20"]);
  });

  it("wraps a rank before its row grows wider than ROW_MAX, counting what containers hold", async () => {
    // m/top over 12 leaves with long names, then over three containers of
    // five such leaves each: no row may be wider than ROW_MAX.
    const long = (p: string, i: number) => `${p}/${"subsystem_".repeat(3)}${String(i).padStart(2, "0")}`;
    const leaves = Array.from({ length: 12 }, (_, i) => long("m", i));
    const inner = ["m/a", "m/b", "m/c"].flatMap((c) => Array.from({ length: 5 }, (_, i) => long(c, i)));
    const x = view(pkgs(["m/top", ...leaves, ...inner], "m"), leaves.map((l) => edge("m/top", l)));
    const a = await layout(scene(x, { ...DEFAULT_STATE, focus: "m", depth: 2 }), elk);
    const top = [...leaves, "m/a", "m/b", "m/c"].filter((id) => a.get(id)!.parent === undefined);
    const rows = new Map<number, string[]>();
    for (const id of top) rows.set(a.get(id)!.y, [...(rows.get(a.get(id)!.y) ?? []), id]);
    const width = (r: string[]) => Math.max(...r.map((id) => a.get(id)!.x + a.get(id)!.w)) - Math.min(...r.map((id) => a.get(id)!.x));
    expect(ROW_MAX).toBe(1280);
    expect(rows.size).toBeGreaterThan(3);
    // A rank's rows sit WRAP_GAP apart, closer than two ranks (24): they read as one.
    const ys = [...rows.keys()].sort((p, q) => p - q);
    const bottom = (y: number) => Math.max(...rows.get(y)!.map((id) => a.get(id)!.y + a.get(id)!.h));
    const topRow = a.get("m/top")!;
    expect(ys[0] - (topRow.y + topRow.h)).toBe(24);
    for (let i = 0; i + 1 < ys.length; i++) expect(ys[i + 1] - bottom(ys[i])).toBe(WRAP_GAP);
    for (const r of rows.values()) expect(width(r)).toBeLessThanOrEqual(ROW_MAX);
    // each row takes boxes while they fit: the next row's first would not.
    const sorted = [...rows].sort(([y1], [y2]) => y1 - y2).map(([, r]) => r);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const next = a.get(sorted[i + 1][0])!;
      if (sorted[i].length < WRAP) expect(width(sorted[i]) + 24 + next.w).toBeGreaterThan(ROW_MAX);
    }
  });

  it("widens a container to its label, and keeps it as short as its rows (11)", async () => {
    // One small leaf under a long name, beside a sibling: ELK's minimum size
    // was not met in width and added height instead.
    const x = view(pkgs(["m/controller_manager_and_scheduler_plugins/x", "m/y"], "m"));
    const sc = scene(x, { ...DEFAULT_STATE, focus: "m", depth: 2 });
    const c = sc.nodes.find((n) => n.id === "m/controller_manager_and_scheduler_plugins")!;
    const a = await layout(sc, elk);
    const box = a.get(c.id)!;
    expect(box.w).toBe(containerWidth(c));
    expect(box.h).toBe(24 + 40 + 12);
    const leaf = a.get("m/controller_manager_and_scheduler_plugins/x")!;
    expect(leaf.x + leaf.w / 2).toBeCloseTo(box.w / 2); // centred in it
    expect(elkGraph(sc).children!.find((n) => n.id === c.id)!.layoutOptions!["elk.nodeSize.minimum"]).toBeUndefined();
  });

  it("uses the Policy's ranks in a sibling set that has one, and tiers in the others", async () => {
    // m/api is rank 1 and m/core rank 0; m/util/lo and m/util/hi are
    // unranked, and hi imports lo.
    const x = {
      ...view([...pkgs(["m/api"], "m", { rank: 1 }), ...pkgs(["m/core"], "m", { rank: 0 }), ...pkgs(["m/util/hi", "m/util/lo"], "m")],
        [edge("m/core", "m/api"), edge("m/util/hi", "m/util/lo")]),
      policy: { hash: "sha256:p", levels: [["m/core"], ["m/api"]] },
    };
    const a = await layout(scene(x, { ...DEFAULT_STATE, depth: 3 }), elk);
    const y = (id: string) => absolute(a, id)!.y;
    expect(y("m/api")).toBeLessThan(y("m/core")); // the Policy wins over core → api
    expect(y("m/util")).toBe(y("m/core")); // unranked beside ranked: level 0
    expect(y("m/util/hi")).toBeLessThan(y("m/util/lo")); // no rank inside m/util: tiers
  });
});

// fake is an engine whose layouts finish when the test says so.
function fakes() {
  const made: { stopped: boolean; jobs: { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] }[] = [];
  const make = (): Stoppable => {
    const f = { stopped: false, jobs: [] as { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] };
    made.push(f);
    return {
      layout: () => new Promise((resolve, reject) => f.jobs.push({ resolve, reject })),
      terminateWorker: () => void (f.stopped = true),
    };
  };
  return { made, make };
}

describe("superseding", () => {
  it("a newer layout stops the running worker and starts a fresh one", async () => {
    const { made, make } = fakes();
    const e = superseding(make);
    const old = e.layout({ id: "a" });
    const now = e.layout({ id: "b" });
    await expect(old).rejects.toBeInstanceOf(Superseded);
    expect(made.map((f) => f.stopped)).toEqual([true, false]);
    made[1].jobs[0].resolve({ id: "b" });
    await expect(now).resolves.toEqual({ id: "b" });
    const next = e.layout({ id: "c" });
    expect(made).toHaveLength(2);
    made[1].jobs[1].resolve({ id: "c" });
    await expect(next).resolves.toEqual({ id: "c" });
  });
  it("a failed worker is replaced on the next layout", async () => {
    const { made, make } = fakes();
    const e = superseding(make);
    const bad = e.layout({ id: "a" });
    made[0].jobs[0].reject(new Error("layout worker failed: blocked"));
    await expect(bad).rejects.toThrow("blocked");
    void e.layout({ id: "b" });
    expect(made.map((f) => f.stopped)).toEqual([true, false]);
  });
});
