// Browser acceptance for the built page (05 Task 13). Not part of make check:
// it needs browsers. Run from web/e2e after `make build`:
//   npm install && npm run browsers && npm run accept
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
const golden = (f) => JSON.parse(readFileSync(join(here, "../../internal/export/testdata", f), "utf8"));
const marker = '<script id="zu-data" type="application/json">{}</script>';
if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
// As export.Render: the View as JSON in the marker, "<" escaped.
const page = (v) => tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c")));

const dir = mkdtempSync(join(tmpdir(), "zu-e2e-"));
// Removed however the run ends: pass, failed checks, a second crash or an uncaught error.
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const write = (name, html) => writeFileSync(join(dir, name), html);
const shop = golden("shop.view.golden.json");
const change = golden("shop.change.golden.json");
const loc = { path: "x.go", line: 1 };
const pkg = (id, module) => ({ id, kind: "package", module, loc });
const imp = (from, to) => ({ from, to, kind: "imports", count: 1, loc });
write("with.html", page(shop));
write("without.html", page(shop).replace(" worker-src blob:;", ""));
write("change.html", page(change));
// 14: the Change View's host links, as zu diff -html writes them on GitHub.
const gh = "https://github.com/o/r";
const onHost = `${gh}/compare/${change.base.commit}...${change.head.commit}#diff-b26d414d0eb20deebca0d2b785bd3e1090aa1a7a182e7dc30640d68c53cb40da`;
write("links.html", page({
  ...change,
  links: {
    blob: `${gh}/blob/${change.head.commit}/{path}#L{line}`, base: `${gh}/blob/${change.base.commit}/{path}#L{line}`,
    compare: onHost.split("#")[0], files: { "internal/store/store.go": onHost },
    nodes: { "example.com/shop/internal/store.Repo.Get": onHost + "R42", "example.com/shop/internal/store.ReadWriter": onHost + "L19" },
  },
}));
// Two unchanged packages outside the changed subgraph (openFull).
const far = ["example.com/shop/far/a", "example.com/shop/far/b"];
write("far.html", page({ ...change, nodes: [...change.nodes, ...far.map((id) => pkg(id, "example.com/shop"))], edges: [...change.edges, imp(far[0], far[1])] }));
// 121 packages and 720 imports: over DRAW_LIMIT at depth 4, under it at depth 2.
const ids = [];
for (let g = 0; g < 24; g++) for (let i = 0; i < 5; i++) ids.push(`m/g${String(g).padStart(2, "0")}/p${i}`);
const edges = ids.flatMap((id, n) => [1, 2, 3, 4, 5, 6].map((k) => imp(id, ids[(n + 5 * k) % ids.length])));
write("big.html", page({ ...shop, modules: ["m"], nodes: [pkg("m", "m"), ...ids.map((id) => pkg(id, "m"))], edges, sources: {} }));
// 11: big.html's 144 lines at depth 1 with one violation (m/g00 → m/g01), and
// as a Change View with one added import (m/g02 → m/g03): auto draws those at rest.
const bigNodes = [pkg("m", "m"), ...ids.map((id) => pkg(id, "m"))];
const one = (from, to, extra) => edges.map((e) => (e.from === from && e.to === to ? { ...e, ...extra } : e));
write("bigpolicy.html", page({ ...shop, modules: ["m"], nodes: bigNodes, edges: one("m/g00/p0", "m/g01/p0", { violation: "levels" }), sources: {}, policy: { hash: "sha256:e2e", levels: [] } }));
write("bigchange.html", page({
  ...change, modules: ["m"], sources: {}, hunks: {}, changed: ["m/g02/p0"],
  nodes: bigNodes.map((n) => (n.id === "m/g02/p0" ? { ...n, status: "modified" } : n)),
  edges: one("m/g02/p0", "m/g03/p0", { status: "added" }),
}));
// 11: 150 unconnected packages of rank 0 with long names, many decls and
// unresolved calls, and one longer name still: rows must wrap to the screen,
// no box may clip its text, and the rank is taller than the screen, so a
// minimap shows. Over the 60-box budget, it is opened at d=2.
const wide = [...Array.from({ length: 150 }, (_, i) => `m/pkg/controller_manager_${String(i).padStart(3, "0")}`), "m/pkg/a_package_name_longer_than_the_280_px_boxes_used_to_allow"];
write("wide.html", page({ ...shop, modules: ["m"], sources: {}, edges: [], nodes: [pkg("m", "m"), ...wide.map((id) => ({ ...pkg(id, "m"), decls: 123456, unresolved: 99 }))] }));
// 07: a Policy View, as export.Mark writes it. Ranks: cmd 2, cli 1, ir and
// ir/bad 0, util unranked; one levels violation, ir/bad → cli, which no line
// draws once m/internal is closed.
const ranked = [["m/cmd", 2], ["m/internal/cli", 1], ["m/internal/ir", 0], ["m/internal/ir/bad", 0], ["m/util"]];
const hexagon = {
  name: "Hexagon",
  layers: [{ name: "Domain", members: ["m/internal/ir"] }, { name: "Entry", members: ["m/internal/cli", "m/cmd"] }],
  ranks: { "m/cmd": 1, "m/internal/cli": 1, "m/internal/ir": 0, "m/internal/ir/bad": 0 },
  violations: [{ from: "m/internal/ir/bad", to: "m/internal/cli" }],
};
const policy = { hash: "sha256:e2e", levels: [["m/internal/ir"], ["m/internal/cli"], ["m/cmd"]], proposals: [hexagon] };
write("policy.html", page({
  ...shop, modules: ["m"], sources: {}, policy,
  nodes: [pkg("m", "m"), ...ranked.map(([id, rank]) => ({ ...pkg(id, "m"), ...(rank === undefined ? {} : { rank }) }))],
  edges: [imp("m/cmd", "m/internal/cli"), imp("m/internal/cli", "m/internal/ir"), { ...imp("m/internal/ir/bad", "m/internal/cli"), violation: "levels" }, imp("m/cmd", "m/util")],
}));
// Six unconnected siblings that ELK alone places x, z, c, y, a, b; order asks z, y, x first.
const six = ["m/a", "m/b", "m/c", "m/x", "m/y", "m/z"];
write("order.html", page({ ...shop, modules: ["m"], sources: {}, nodes: [pkg("m", "m"), ...six.map((id) => pkg(id, "m"))], edges: [], policy: { hash: "sha256:e2e", levels: [], order: ["m/z", "m/y", "m/x"] } }));
// A Change View with zu diff's violation delta, and a Proposal it must not draw.
write("violations.html", page({
  ...change, policy: { hash: "sha256:e2e", levels: [], proposals: [{ ...hexagon, ranks: {}, violations: [] }] },
  violations: { new: [{ rule: "levels", from: "example.com/shop/internal/store", to: "example.com/shop/internal/money" }], fixed: [], known: 2 },
}));
// 08: CRAP as export.AddMetrics writes it. m/cmd μ+σ 2 (green), m/internal/cli
// 10 (yellow) with one function, Run, m/internal/ir measured without coverage
// data (red, "?"), m/util and m/internal/ir/bad unmeasured.
const metrics = {
  packages: {
    "m/cmd": { funcs: 1, crap: { mu: 2, max: 2, sigma: 0 } },
    "m/internal/cli": { funcs: 3, missing: 1, crap: { mu: 9, max: 12, sigma: 1 } },
    "m/internal/ir": { funcs: 2, missing: 2 },
  },
  funcs: { "m/internal/cli.Run": { cc: 4, stmts: 8, covered: 4, crap: 6 } },
};
write("crap.html", page({
  ...shop, modules: ["m"], sources: {}, metrics,
  nodes: [
    pkg("m", "m"), ...ranked.map(([id]) => ({ ...pkg(id, "m"), ...(id === "m/internal/cli" ? { detail: true } : {}) })),
    { id: "m/internal/cli.Run", kind: "function", parent: "m/internal/cli", exported: true, loc },
  ],
  edges: [imp("m/cmd", "m/internal/cli"), imp("m/internal/cli", "m/internal/ir"), imp("m/cmd", "m/util")],
}));
// The shop Change View with its four modified packages measured, and one
// unchanged package without coverage data that the changed subgraph leaves
// out: the internal box's badge and panel must both leave it out.
const hidden = "example.com/shop/internal/far";
const store = "example.com/shop/internal/store";
write("crap-change.html", page({
  ...change,
  nodes: [...change.nodes, pkg(hidden, "example.com/shop")],
  metrics: {
    packages: {
      "example.com/shop": { funcs: 1, crap: { mu: 1, max: 1, sigma: 0 } },
      "example.com/shop/internal/checkout": { funcs: 1, crap: { mu: 3, max: 3, sigma: 0 } },
      "example.com/shop/internal/money": { funcs: 2, crap: { mu: 4, max: 5, sigma: 1 } },
      [store]: { funcs: 5, crap: { mu: 30, max: 50, sigma: 5 } },
      [hidden]: { funcs: 1, missing: 1 },
    },
    funcs: {},
  },
}));
// 12 (A2): a root module k with three modules nested under it, as kubernetes
// has its staging modules. 75 boxes at depth 2 keep the auto depth at 1, so
// the page root opens k in place (R5); with.html is too small for that.
const at = (id, path) => ({ ...pkg(id, id.split("/")[0]), loc: { path, line: 1 } });
const staged = [0, 1, 2].flatMap((m) => Array.from({ length: 25 }, (_, j) => at(`s${m}/p${j}`, `staging/src/s${m}/p${j}/x.go`)));
write("rooted.html", page({
  ...shop, modules: ["k", "s0", "s1", "s2"], sources: {},
  nodes: [at("k/cmd", "cmd/main.go"), at("k/pkg/a", "pkg/a/a.go"), at("k/pkg/b", "pkg/b/b.go"), ...staged],
  edges: [imp("k/cmd", "k/pkg/a"), imp("k/pkg/a", "s0/p0"), imp("s1/p0", "s0/p0")],
}));
// 12: big.html's 24 groups, two testdata packages and a generated one, and a
// Policy budget of 12; m/g00/p0 imports one testdata package.
const noise = [["m/testdata/a", "name"], ["m/testdata/b", "name"], ["m/zz_generated", "generated"]];
write("grouped.html", page({
  ...shop, modules: ["m"], sources: {}, policy: { hash: "sha256:e2e", levels: [], budget: 12 },
  nodes: [...bigNodes, ...noise.map(([id, demoted]) => ({ ...pkg(id, "m"), demoted }))],
  edges: [...edges, imp("m/g00/p0", "m/testdata/a")],
}));
// 12: a chain of nine, c8 a program: nine ranks drawn in seven rows.
const chain = Array.from({ length: 9 }, (_, i) => `m/c${i}`);
write("chain.html", page({
  ...shop, modules: ["m"], sources: {}, edges: chain.slice(1).map((id, i) => imp(id, chain[i])),
  nodes: chain.map((id) => ({ ...pkg(id, "m"), ...(id === "m/c8" ? { main: true } : {}) })),
}));

const base = "file://" + dir + "/";
const vp = (p) => p.locator(".react-flow__viewport").getAttribute("style");
const settle = (p) => p.waitForTimeout(900);
const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
// Firefox (Playwright's 155.0) crashes the page on a reload while the page's
// 1.5 MB blob worker (ELK) is still loading: 177 of 300 reloads of a page with
// no zu code but such a worker crashed, none of 150 once the worker had
// answered (16). A reload waits for the worker's first answer (a drawing, or
// a status other than "Laying out…"), or for a state that lays nothing out
// and so starts no worker ("Declarations not included").
const loaded = (p) => p.waitForFunction(() => document.querySelector(".react-flow__node, main .empty:not(#zu-status)") ||
  /^(?!Laying out)./.test(document.getElementById("zu-status")?.textContent ?? ""), null, { timeout: 30000 });
const hash = (p) => p.evaluate(() => decodeURIComponent(location.hash));
// spill: the nodes whose text reaches past their bottom edge: a label, a
// stats, sub or facts line, role badges, a row. v0.1.1: React Flow's source
// handle took the code panel's .source style, which put it in the flow and
// pushed every node's text down by its height.
const spill = () => [...document.querySelectorAll(".react-flow__node")].filter((n) => [...n.querySelectorAll(".label, .stats, .sub, .facts, .badges, .member")]
  .some((t) => t.getBoundingClientRect().bottom > n.getBoundingClientRect().bottom + 0.5)).length;
async function run(b) {
  const out = {};
  // Project View
  let p = await b.newPage();
  const errors = [];
  p.on("console", (m) => /Content.Security|CSP/i.test(m.text()) && errors.push(m.text().slice(0, 120)));
  p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
  await p.goto(base + "with.html");
  await drawn(p);
  await settle(p);
  out.nodes = await p.locator(".react-flow__node").count();
  out.spill = await p.evaluate(spill);
  const v0 = await vp(p);
  await p.keyboard.press("/");
  await p.keyboard.type("Repo.Get");
  await p.keyboard.press("Enter");
  await settle(p);
  out.search = await hash(p);
  out.row = await p.locator(".row.selected").textContent().catch(() => null);
  const v1 = await vp(p);
  out.centred = v1 !== v0;
  await p.keyboard.press("f");
  await settle(p);
  out.fit = (await vp(p)) !== v1;
  const stages = [];
  for (let i = 0; i < 5; i++) {
    await p.keyboard.press("d");
    await p.waitForTimeout(200);
    stages.push(await p.locator(".toolbar button[title^='Next declutter']").textContent());
  }
  out.stages = stages.join(" > ");
  await p.keyboard.press("d");
  await p.reload();
  await drawn(p);
  out.afterReload = await p.locator(".toolbar button[title^='Next declutter']").textContent();
  await p.getByLabel(/^edges/).selectOption("off");
  await settle(p);
  out.hideEdges = [(await hash(p)).includes("l=0"), await p.locator(".react-flow__edge").count(), await p.locator(".node .marks polygon").count()];
  out.notice = await p.locator("#zu-notice").count();
  await p.close();
  // Change View
  p = await b.newPage();
  await p.goto(base + "change.html");
  await drawn(p);
  await settle(p);
  // 11: the first view keeps labels readable, so part of it may need a pan;
  // React Flow draws only what is on screen. Zoom out to count all of it.
  await p.locator(".react-flow__controls-fitview").click();
  await settle(p);
  out.change = await p.locator(".react-flow__node").count();
  out.chips = await p.locator(".node.chip").allTextContents();
  const c0 = await vp(p);
  await p.locator("nav.changed button", { hasText: "internal/store" }).first().click();
  await settle(p);
  out.pickCentred = (await vp(p)) !== c0;
  out.picked = await p.locator(".node.selected .label").first().textContent().catch(() => null);
  // A link outside the changed subgraph opens the whole View there.
  await p.goto(base + "far.html#f=example.com/shop/far");
  await drawn(p);
  out.far = [await p.locator(".app.subgraph").count(), await p.locator(".react-flow__node").count()];
  await p.close();
  // A view over the limit collapses and says so (Deviation 8).
  p = await b.newPage();
  await p.goto(base + "big.html#d=4&l=1");
  await drawn(p);
  out.collapsed = await p.locator("#zu-notice").innerText().then((t) => t.split("Draw")[0].trim());
  out.header = await p.locator("header").innerText().then((t) => /depth \d+[^.]*/.exec(t)?.[0] ?? "");
  await p.getByRole("button", { name: "Hide edges" }).click();
  await settle(p);
  out.hidden = [await hash(p), await p.locator("#zu-notice").count()];
  await p.goto(base + "big.html#d=4&l=1");
  await p.locator("#zu-notice").waitFor();
  await p.getByRole("button", { name: "Draw depth 4 anyway" }).click();
  out.anyway = await p.locator("#zu-notice").count();
  // 11: 24 boxes and their dependencies, edges on auto. No line at rest, and
  // a note says how many; hovering a box draws its own, out solid and in
  // dashed; labels are at least 11px on screen, and the part a pan reaches is
  // in a minimap. A reload shows the page as
  // it opens.
  await p.goto(base + "big.html#d=1");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  const edgeCount = () => p.locator(".react-flow__edge").count();
  const note = await p.locator("#zu-edges").textContent().then((t) => t.trim()).catch(() => null);
  const rest = await edgeCount();
  const px = await p.evaluate(() => {
    const z = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a;
    const l = document.querySelector(".react-flow__node .label") ?? document.querySelector(".react-flow__node");
    return parseFloat(getComputedStyle(l).fontSize) * z >= 11;
  });
  await p.locator(".react-flow__node[data-id='m/g00']").hover();
  await settle(p);
  const dirs = await p.evaluate(() => ["dep-out", "dep-in"].map((c) => document.querySelectorAll(`.react-flow__edge.${c}`).length > 0));
  await p.mouse.move(1, 1);
  await settle(p);
  out.overview = [note, rest, px, ...dirs, await edgeCount(), await p.locator(".react-flow__minimap").count()];
  // 11: the axis names the rows, and at rest 3 boxes are marked most used.
  // 11: selecting a box draws as many lines out and in as its stats line
  // says, in dotted (not a removed edge's 6 4 dash); Enter on a focused box
  // selects it too.
  const lines = async (id) => {
    const stats = await p.locator(`.react-flow__node[data-id='${id}'] .stats`).textContent();
    const [, uses, usedBy] = /uses (\d+) · used by (\d+)/.exec(stats);
    const [outs, ins] = [await p.locator(".react-flow__edge.dep-out").count(), await p.locator(".react-flow__edge.dep-in").count()];
    return [+uses === outs && +usedBy === ins, outs, ins];
  };
  await p.locator(".react-flow__node[data-id='m/g00']").click();
  await settle(p);
  const dash = await p.evaluate(() => getComputedStyle(document.querySelector(".react-flow__edge.dep-in path")).strokeDasharray.replace(/px/g, "").replace(/,\s*/g, " "));
  out.selectLines = [...(await lines("m/g00")), dash];
  await p.keyboard.press("Escape");
  await settle(p);
  await p.mouse.move(1, 1); // no hover: only the selection draws lines
  await settle(p);
  const none = await p.locator(".node.selected").count();
  await p.locator(".react-flow__node[data-id='m/g00']").focus();
  await p.keyboard.press("Enter");
  await settle(p);
  out.keyboard = [none, await p.locator(".react-flow__node[data-id='m/g00'] .node.selected").count(), ...(await lines("m/g00"))];
  await p.keyboard.press("Escape");
  await settle(p);
  out.reading = [
    await p.locator(".axis > span").allTextContents().then((t) => t.map((x) => x.replace(/\s+/g, " ").trim())),
    await p.locator(".react-flow__node .node.hub").count(),
    await p.locator(".legend .hub").textContent().catch(() => null),
    await p.locator("#zu-against").textContent({ timeout: 5000 }).catch(() => null),
  ];
  await p.close();
  // 11: the first view at 1600 × 1000: no label or stats line is clipped,
  // every box (not container) of the top 3 rows is whole on the canvas and clear of the
  // minimap, and the minimap's button hides it and shows it again.
  // A3: this is a test of wrapping, clipping and the minimap, not a realistic
  // first view. The hash forces d=2 (151 boxes, past the 60-box budget) so the
  // scene is taller than the screen and the minimap appears.
  p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto(base + "wide.html#d=2");
  await drawn(p);
  await settle(p);
  const firstView = () => p.evaluate(() => {
    const clipped = [...document.querySelectorAll(".react-flow__node .label, .react-flow__node .stats")].filter((e) => e.scrollWidth > e.clientWidth).length;
    const pane = document.querySelector(".react-flow").getBoundingClientRect();
    const map = document.querySelector(".react-flow__minimap")?.getBoundingClientRect();
    const boxes = [...document.querySelectorAll(".react-flow__node:not(.react-flow__node-container)")].map((e) => e.getBoundingClientRect());
    const tops = [...new Set(boxes.map((r) => Math.round(r.top)))].sort((a, b) => a - b).slice(0, 3);
    const top3 = boxes.filter((r) => tops.includes(Math.round(r.top)));
    const whole = (r) => r.left >= pane.left && r.right <= pane.right && r.top >= pane.top && r.bottom <= pane.bottom;
    const under = (r) => map && r.left < map.right && r.right > map.left && r.top < map.bottom && r.bottom > map.top;
    return [clipped, tops.length, top3.filter((r) => !whole(r) || under(r)).length];
  });
  const shown = await firstView();
  const maps = [];
  for (let i = 0; i < 2; i++) {
    await p.locator(".zu-map").click({ timeout: 5000 }).catch(() => {}); // no button: the counts say so
    maps.push(await p.locator(".react-flow__minimap").count());
  }
  out.firstView = [...shown, ...maps];
  await p.close();
  // 11: in a window under 900 px the minimap starts hidden; its button shows it.
  p = await b.newPage({ viewport: { width: 800, height: 900 } });
  await p.goto(base + "wide.html#d=2");
  await drawn(p);
  await settle(p);
  const narrow = [await p.locator(".react-flow__minimap").count()];
  await p.locator(".zu-map").click({ timeout: 5000 }).catch(() => {});
  narrow.push(await p.locator(".react-flow__minimap").count());
  out.narrowMap = narrow;
  // 11: in auto, over 40 lines, a violation and a changed import still draw at rest.
  await p.goto(base + "bigpolicy.html#d=1");
  await drawn(p);
  await settle(p);
  out.policyRest = [await p.locator(".react-flow__edge").count(), await p.locator(".react-flow__edge.pinned").count()];
  // The full project: 25 boxes, 144 lines, one of them carrying the added import.
  await p.goto(base + "bigchange.html");
  await drawn(p);
  await p.getByRole("button", { name: "Show full project" }).click({ timeout: 5000 }).catch(() => {});
  await settle(p);
  out.changeRest = [
    await p.locator("header").innerText().then((t) => /\d+ boxes at depth \d+(, \d+ boxes folded)?/.exec(t)?.[0] ?? ""),
    await p.locator(".react-flow__edge").count(),
    await p.locator(".react-flow__edge.edge-mixed, .react-flow__edge.edge-added").count(),
  ];
  await p.close();
  // 07: the Policy View.
  p = await b.newPage();
  const at = async (h) => {
    await p.goto(base + "policy.html" + h);
    await loaded(p);
    await p.reload();
    await drawn(p);
    await settle(p);
  };
  const nodes = () => p.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map((n) => {
    const r = n.getBoundingClientRect();
    return { id: n.getAttribute("data-id"), x: r.x, y: r.y, rank: n.querySelector(".rank")?.textContent ?? null, red: !!n.querySelector(".hides-violation") };
  }));
  const reds = async () => (await nodes()).filter((n) => n.red).map((n) => n.id);
  // 11: policy.html opens at m (home), so depth N here is depth N + 1 below the root.
  await at("#d=2");
  out.ranks = (await nodes()).filter((n) => n.rank !== null).sort((a, b) => a.y - b.y || a.x - b.x).map((n) => `${n.id} ${n.rank}`);
  await at("#d=1");
  out.redBox = [`d=1: ${(await reds()).join(" ")}`];
  // 11: below m the leaves sit in one container (m/internal), so 05's arrows
  // equals full and classes only hides rows: the violation stays a red line
  // or red triangles, not a red box. Each stage lists red boxes, then the
  // number of red lines and of red triangles.
  const redMarks = () => p.evaluate(() => [".react-flow__edge.pinned", "polygon.pinned"].map((q) => document.querySelectorAll(q).length).join(" "));
  for (const st of ["full", "arrows", "triangles", "elements", "classes"]) {
    await at(`#d=2&x=${st}`);
    out.redBox.push(`${st}: ${(await reds()).join(" ")} / ${await redMarks()}`);
  }
  await at("#d=1&s=m%2Finternal");
  out.panel = await p.locator(".hidden-violations").innerText().then((t) => t.split("\n").slice(0, 2)).catch(() => null);
  await at("");
  await p.getByLabel(/^proposal/).selectOption("Hexagon");
  await settle(p);
  const banner = () => p.locator(".proposal-banner").innerText().catch(() => null);
  out.proposal = [await hash(p), await banner(), await p.locator(".legend .violation").innerText()];
  // v0.1.1: the banner is a row of its own, so it covers neither the legend
  // nor a box (07 drew it over both): the boxes and the legend it meets.
  out.bannerClear = await p.evaluate(() => {
    const r = document.querySelector(".proposal-banner").getBoundingClientRect();
    const meets = (e) => {
      const q = e.getBoundingClientRect();
      return r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom;
    };
    return [...document.querySelectorAll(".legend, .react-flow__node")].filter(meets).length;
  });
  await p.reload();
  await drawn(p);
  await settle(p);
  out.proposalReload = await banner();
  await p.getByLabel(/^proposal/).selectOption("");
  await settle(p);
  out.proposalNone = [await hash(p), await p.locator(".proposal-banner").count()];
  await p.goto(base + "order.html#d=2");
  await drawn(p);
  await settle(p);
  out.order = (await nodes()).filter((n) => n.id !== "m").sort((a, b) => a.x - b.x).map((n) => n.id).join(" ");
  // Search centres from the positions after inOrder: m/z is re-placed first in its row.
  await p.keyboard.press("/");
  await p.keyboard.type("m/z");
  await p.keyboard.press("Enter");
  await settle(p);
  out.orderCentred = await p.evaluate(() => {
    const n = document.querySelector('.react-flow__node[data-id="m/z"]')?.getBoundingClientRect();
    const c = document.querySelector(".flow")?.getBoundingClientRect();
    if (!n || !c) return "missing";
    const dx = n.x + n.width / 2 - (c.x + c.width / 2);
    const dy = n.y + n.height / 2 - (c.y + c.height / 2);
    return Math.abs(dx) <= 2 && Math.abs(dy) <= 2 ? true : `off by ${Math.round(dx)}, ${Math.round(dy)}`;
  });
  // 08: the CRAP overlay.
  const craps = () => p.evaluate(() => [...document.querySelectorAll(".react-flow__node")].flatMap((n) => {
    const box = n.querySelector(".node");
    const band = /crap-(\w+)/.exec(box?.className ?? "")?.[1];
    return band ? [`${n.getAttribute("data-id")} ${band} ${n.querySelector(".crap")?.textContent}`] : [];
  }).sort());
  out.crap = [];
  for (const d of [1, 2]) {
    await p.goto(base + `crap.html#d=${d}`);
    await loaded(p);
    await p.reload();
    await drawn(p);
    await settle(p);
    out.crap.push(await craps());
    // A container's badge overlaps none of the boxes inside it.
    out.crapBadgeClear = await p.evaluate(() => {
      const rect = (e) => e.getBoundingClientRect();
      const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const nodes = [...document.querySelectorAll(".react-flow__node")];
      return nodes.flatMap((n) => {
        const badge = n.querySelector(".node.container > .crap");
        const id = n.getAttribute("data-id");
        if (!badge) return [];
        return nodes.filter((c) => c.getAttribute("data-id").startsWith(id + "/") && meets(rect(badge), rect(c)))
          .map((c) => `${id} badge over ${c.getAttribute("data-id")}`);
      });
    }).then((xs) => [...(out.crapBadgeClear ?? []), ...xs]);
  }
  // At depth 2 below m: green, yellow, red and unmeasured are four different fills.
  out.crapFills = await p.evaluate(() => new Set(["m/cmd", "m/internal/cli", "m/internal/ir", "m/util"].map((id) =>
    getComputedStyle(document.querySelector(`.react-flow__node[data-id="${id}"] .node`)).backgroundColor)).size);
  out.crapLegend = await p.locator(".legend").innerText().then((t) => t.split("\n").filter((l) => /CRAP|≤|>/.test(l)));
  await p.goto(base + "crap.html#d=3&s=m%2Finternal%2Fcli");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.crapPanel = await p.locator(".crap-facts").innerText().then((t) => t.split("\n").filter(Boolean)).catch(() => null);
  await p.goto(base + "crap.html#f=m%2Finternal%2Fcli&s=m%2Finternal%2Fcli.Run");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.crapFunc = [
    await p.locator('.react-flow__node[data-id="m/internal/cli.Run"] .crap').textContent().catch(() => null),
    await p.locator(".crap-facts").innerText().catch(() => null),
  ];
  // The Change View: a modified package's fill and change border show
  // together, and a box's badge and panel agree.
  await p.goto(base + "crap-change.html#d=3");
  await drawn(p);
  await settle(p);
  out.crapChange = await p.locator(`.react-flow__node[data-id="${store}"] .node`).getAttribute("class")
    .then((c) => ["crap-red", "st-modified"].map((k) => c.split(" ").includes(k)));
  await p.goto(base + "crap-change.html#d=2&s=example.com%2Fshop%2Finternal");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.crapChangeBox = [
    await p.locator('.react-flow__node[data-id="example.com/shop/internal"] .crap').first().textContent(),
    await p.locator(".crap-facts").innerText().catch(() => null),
  ];
  await p.goto(base + "with.html");
  await drawn(p);
  await settle(p);
  out.noCrap = [await p.locator(".node .crap").count(), await p.locator(".legend .crap-green").count()];
  await p.goto(base + "violations.html#p=Hexagon");
  await drawn(p);
  await settle(p);
  out.violations = await p.locator("nav.changed .violations").innerText().then((t) => t.split("\n"));
  out.changeNoProposal = [await p.locator(".proposal-banner").count(), await p.getByLabel(/^proposal/).count()];
  await p.close();
  // Worker blocked by the CSP
  p = await b.newPage();
  await p.goto(base + "without.html");
  await p.locator("#zu-status", { hasText: "Layout failed" }).waitFor({ timeout: 15000 }).catch(() => {});
  out.blocked = await p.locator("#zu-status").textContent().catch(() => null);
  await p.close();
  // 12: the first view's grouping, at 1600 × 1000.
  p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const rows = () => p.evaluate(() => {
    const top = [...document.querySelectorAll(".react-flow__node")].filter((n) => !n.querySelector(".node.container") && !n.closest(".react-flow__node-container"));
    return new Set(top.map((n) => Math.round(n.getBoundingClientRect().top))).size;
  });
  const boxCount = () => p.locator(".react-flow__node .node.box").count();
  await p.goto(base + "big.html");
  await drawn(p);
  await settle(p);
  await p.locator(".react-flow__controls-fitview").click();
  await settle(p);
  const chips = await p.locator(".node.chip.group .label").allTextContents();
  out.fold = [await boxCount(), chips.length > 0 && chips.every((t) => /^\+\d+ more$/.test(t)), (await rows()) <= 7,
    await p.locator("header").innerText().then((t) => /\d+ boxes folded/.exec(t)?.[0] ?? "")];
  await p.locator(".react-flow__node:has(.node.chip.group)").first().click(); // 12 (N4): one click opens a group
  await settle(p);
  out.foldOpen = [(await hash(p)).includes("t=m#more"), await p.locator(".node.chip.group .label").first().textContent().then((t) => /^fold \d+$/.test(t))];
  await p.goto(base + "grouped.html");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  await p.locator(".react-flow__controls-fitview").click();
  await settle(p);
  const strip = p.locator(".react-flow__node[data-id='m#demoted']");
  out.strip = [await boxCount(), await strip.locator(".label").textContent(), await strip.locator(".node").getAttribute("title")];
  await strip.click();
  await settle(p);
  out.stripOpen = [await hash(p), await p.locator(".react-flow__node[data-id='m/testdata'] .node.demoted").count()];
  await p.goto(base + "chain.html");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.rowCap = [await rows(),
    await p.locator(".axis .entry").textContent().catch(() => null), await p.locator(".react-flow__node[data-id='m/c8'] .badge").allTextContents()];
  // with.html: example.com/shop sits at the repository root with a nested
  // module, so the page root opens it in place; Esc from inside it comes back.
  await p.goto(base + "with.html");
  await drawn(p);
  await settle(p);
  const shopOpen = await p.locator(".react-flow__node-container[data-id='example.com/shop']").count();
  await p.goto(base + "with.html#f=example.com/shop/internal");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  await p.keyboard.press("Escape");
  await settle(p);
  out.rootOpen = [shopOpen, await hash(p)];
  // 12 (A2): closing the root module writes its own token, a literal "#" inside
  // the hash value; a reload keeps it closed. An old link's t=<root module>
  // still opens it in place (N10).
  const kOpen = () => p.locator(".react-flow__node-container[data-id='k']").count();
  await p.goto(base + "rooted.html");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  const opened = await kOpen();
  await p.locator(".react-flow__node-container[data-id='k'] .toggle").first().click();
  await settle(p);
  const closedHash = await p.evaluate(() => location.hash);
  await p.reload();
  await drawn(p);
  await settle(p);
  const closedAfter = [await kOpen(), await p.locator(".react-flow__node[data-id='k']").count(), await p.evaluate(() => location.hash)];
  await p.goto(base + "rooted.html#t=k");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.rootClosed = [opened, closedHash, ...closedAfter, await kOpen()];
  await p.close();
  // 12 (N4): at 1280 × 720 the Panel opens over the canvas after a click, so
  // a group opens on one click, not a double-click.
  p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(base + "big.html");
  await drawn(p);
  await settle(p);
  await p.locator(".react-flow__controls-fitview").click();
  await settle(p);
  await p.locator(".react-flow__node:has(.node.chip.group)").first().click();
  await settle(p);
  out.foldNarrow = [(await hash(p)).includes("t=m#more"), await p.locator(".node.chip.group .label").first().textContent()];
  await p.close();
  // 14: a changed declaration links to its line on the compare page and its
  // file's diff there; a removed one to its source at base.
  p = await b.newPage();
  const linked = "links.html#f=example.com/shop/internal/store&s=example.com/shop/internal/store.";
  // Each href with the host, the commits and the path's hash shortened.
  const hrefs = () => p.locator(".panel a").evaluateAll((as) => as.map((a) => a.getAttribute("href")
    .replace("https://github.com/o/r", "").replace(/b{40}/, "B").replace(/h{40}/, "H").replace(/diff-(.{8}).{56}/, "diff-$1")));
  await p.goto(base + linked + "Repo.Get");
  await drawn(p);
  await settle(p);
  const get = await hrefs();
  out.diffTitle = await p.locator(".panel a.diff-link", { hasText: "Diff on the host" }).getAttribute("title"); // 14b
  await p.goto(base + linked + "ReadWriter");
  await loaded(p);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.links = [get, await hrefs()];
  await p.close();
  out.errors = errors;
  return out;
}

const want = {
  nodes: 10,
  spill: 0,
  search: "#f=example.com/shop/internal/store&s=example.com/shop/internal/store.Repo.Get",
  row: ".Get",
  centred: true,
  fit: true,
  stages: "Declutter arrows > Remove arrows > Declutter elements > Declutter classes > Declutter none",
  afterReload: "Declutter arrows",
  hideEdges: [true, 1, 8],
  notice: 0,
  change: 19,
  chips: ["+4 unchanged", "+2 unchanged", "+10 unchanged"],
  pickCentred: true,
  picked: "store",
  far: [0, 2],
  // 11: the page opens at m (home); depth 1 below m is depth 2 below the root.
  collapsed: "Collapsed to depth 1: depth 4 has 720 edges",
  header: "depth 1 (collapsed from 4)",
  hidden: ["#d=4&l=0", 0],
  anyway: 0,
  blocked: "Layout failed: layout worker failed: blocked",
  links: [
    ["/blob/H/internal/store/store.go#L37", "/compare/B...H#diff-b26d414dR42", "/compare/B...H#diff-b26d414d"],
    ["/blob/B/internal/store/store.go#L19", "/compare/B...H#diff-b26d414dL19", "/compare/B...H#diff-b26d414d"],
  ],
  diffTitle: "Opens the diff at this line. Some browsers open it at the top; View at always lands on the declaration.",
  errors: [],
  // 07
  ranks: ["m/cmd 2", "m/internal 1", "m/internal/cli 1", "m/internal/ir 0"],
  // 12: 24 boxes in at most seven rows fit the first view: no minimap.
  overview: ["144 dependencies hidden; select or hover a box to see its own.", 0, true, true, true, 0, 0],
  firstView: [0, 3, 0, 0, 1],
  // big.html's 24 groups form a ring, each using the next 6: in any row order the
  // arcs that wrap round run against it, 1 + 2 + … + 6 = 21 at the least.
  reading: [["uses↓", "depends on nothing here"], 3, "thick border: the 3 most used", " 21 dependencies run against the order."],
  selectLines: [true, 6, 6, "2 3"],
  keyboard: [0, 1, true, 6, 6],
  narrowMap: [0, 1],
  policyRest: [1, 1],
  // 12: the full project at the auto depth folds to the budget; m/g02, changed, shows.
  changeRest: ["15 boxes at depth 2, 10 boxes folded", 1, 1],
  redBox: ["d=1: m/internal", "full:  / 1 0", "arrows:  / 1 0", "triangles:  / 0 2", "elements:  / 1 0", "classes:  / 1 0"],
  panel: ["Violations inside (1)", "levels m/internal/ir/bad → m/internal/cli"],
  proposal: ["#p=Hexagon", "PROPOSAL — not instantiated in code: Hexagon", "violates Proposal Hexagon's layers; a red box holds one"],
  bannerClear: 0,
  proposalReload: "PROPOSAL — not instantiated in code: Hexagon",
  proposalNone: ["", 0],
  order: "m/z m/y m/x m#pkg m/a m/b m/c",
  orderCentred: true,
  violations: ["New violations (1)", "levels example.com/shop/internal/store → example.com/shop/internal/money", "", "0 fixed, 2 pre-existing"],
  changeNoProposal: [0, 0],
  // 08
  crap: [
    ["m/cmd green 2 low", "m/internal red ? high"],
    ["m/cmd green 2 low", "m/internal red ? high", "m/internal/cli yellow 10 mid", "m/internal/ir red ? high"],
  ],
  crapBadgeClear: [],
  crapFills: 4,
  crapLegend: ["CRAP μ+σ ≤ 8 low", "≤ 12 mid", "> 12 high · ? no coverage data"],
  crapPanel: ["CRAP μ 9 · max 12 · σ 1 · μ+σ 10, grade 7.8 of 10", "1 of 3 functions without coverage data", "Highest CRAP", "m/internal/cli.Run 6"],
  crapFunc: ["6 low", "Complexity 4 · 4 of 8 statements covered (50%) · CRAP 6"],
  crapChange: [true, true],
  crapChangeBox: ["35 high", "Worst CRAP μ+σ among drawn: 35, grade 1.0 of 10"],
  noCrap: [0, 0],
  // 12
  fold: [15, true, true, "10 boxes folded"],
  foldOpen: [true, true],
  strip: [12, "3 tests, tools & generated · used by 1", "2 tests & tools · 1 generated"], // the kinds apart in the tooltip
  stripOpen: ["#t=m#demoted&s=m#demoted", 1], // one click opens it and selects it
  rowCap: [7, "entry points", ["cmd"]], // a merged row draws no rule between its ranks
  rootOpen: [1, "#s=example.com/shop/internal"], // up to the page root, the box left selected
  foldNarrow: [true, "fold 10"],
  // open at first; closed: its token in the hash, a box after a reload, the hash unchanged; an old t= opens it
  rootClosed: [1, "#t=k%23closed", 0, 1, "#t=k%23closed", 1],
};

const channel = process.env.ZU_E2E_CHANNEL;
// A page that crashes (Firefox, on reload, 2 of 8 runs while 08 was drafted)
// reruns that engine once in a fresh browser and is logged; a second crash fails.
async function attempt(type, opts) {
  const b = await type.launch(opts);
  return run(b).finally(() => b.close().catch(() => {})); // a crashed browser may not close cleanly
}
let failed = 0;
for (const [name, type, opts] of [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]]) {
  const got = await attempt(type, opts).catch(async (e) => {
    if (!/Page crashed/i.test(String(e?.message))) throw e;
    console.log(`${name}: page crashed, rerunning once: ${String(e.message).split("\n")[0]}`);
    return attempt(type, opts);
  });
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
