// Browser acceptance for the built page (05 Task 13). Not part of make check:
// it needs browsers. Run from web/e2e after `make build`:
//   npm install && npm run browsers && npm run accept
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const write = (name, html) => writeFileSync(join(dir, name), html);
const shop = golden("shop.view.golden.json");
const change = golden("shop.change.golden.json");
const loc = { path: "x.go", line: 1 };
const pkg = (id, module) => ({ id, kind: "package", module, loc });
const imp = (from, to) => ({ from, to, kind: "imports", count: 1, loc });
write("with.html", page(shop));
write("without.html", page(shop).replace(" worker-src blob:;", ""));
write("change.html", page(change));
// Two unchanged packages outside the changed subgraph (openFull).
const far = ["example.com/shop/far/a", "example.com/shop/far/b"];
write("far.html", page({ ...change, nodes: [...change.nodes, ...far.map((id) => pkg(id, "example.com/shop"))], edges: [...change.edges, imp(far[0], far[1])] }));
// 121 packages and 720 imports: over DRAW_LIMIT at depth 4, under it at depth 2.
const ids = [];
for (let g = 0; g < 24; g++) for (let i = 0; i < 5; i++) ids.push(`m/g${String(g).padStart(2, "0")}/p${i}`);
const edges = ids.flatMap((id, n) => [1, 2, 3, 4, 5, 6].map((k) => imp(id, ids[(n + 5 * k) % ids.length])));
write("big.html", page({ ...shop, modules: ["m"], nodes: [pkg("m", "m"), ...ids.map((id) => pkg(id, "m"))], edges, sources: {} }));
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

const base = "file://" + dir + "/";
const vp = (p) => p.locator(".react-flow__viewport").getAttribute("style");
const settle = (p) => p.waitForTimeout(900);
const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
const hash = (p) => p.evaluate(() => decodeURIComponent(location.hash));

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
  await p.getByLabel("hide edges").check();
  await settle(p);
  out.hideEdges = [(await hash(p)).includes("l=0"), await p.locator(".react-flow__edge").count(), await p.locator(".node .marks polygon").count()];
  out.notice = await p.locator("#zu-notice").count();
  await p.close();
  // Change View
  p = await b.newPage();
  await p.goto(base + "change.html");
  await drawn(p);
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
  await p.goto(base + "big.html#d=4");
  await drawn(p);
  out.collapsed = await p.locator("#zu-notice").innerText().then((t) => t.split("Draw")[0].trim());
  out.header = await p.locator("header").innerText().then((t) => /depth \d+[^.]*/.exec(t)?.[0] ?? "");
  await p.getByRole("button", { name: "Hide edges" }).click();
  await settle(p);
  out.hidden = [await hash(p), await p.locator("#zu-notice").count()];
  await p.goto(base + "big.html#d=4");
  await p.locator("#zu-notice").waitFor();
  await p.getByRole("button", { name: "Draw depth 4 anyway" }).click();
  out.anyway = await p.locator("#zu-notice").count();
  await p.close();
  // 07: the Policy View.
  p = await b.newPage();
  const at = async (h) => {
    await p.goto(base + "policy.html" + h);
    await p.reload();
    await drawn(p);
    await settle(p);
  };
  const nodes = () => p.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map((n) => {
    const r = n.getBoundingClientRect();
    return { id: n.getAttribute("data-id"), x: r.x, y: r.y, rank: n.querySelector(".rank")?.textContent ?? null, red: !!n.querySelector(".hides-violation") };
  }));
  const reds = async () => (await nodes()).filter((n) => n.red).map((n) => n.id);
  await at("#d=3");
  out.ranks = (await nodes()).filter((n) => n.rank !== null).sort((a, b) => a.y - b.y || a.x - b.x).map((n) => `${n.id} ${n.rank}`);
  await at("#d=2");
  out.redBox = [`d=2: ${(await reds()).join(" ")}`];
  for (const st of ["full", "arrows", "triangles", "elements", "classes"]) {
    await at(`#d=3&x=${st}`);
    out.redBox.push(`${st}: ${(await reds()).join(" ")}`);
  }
  await at("#d=2&s=m%2Finternal");
  out.panel = await p.locator(".hidden-violations").innerText().then((t) => t.split("\n").slice(0, 2)).catch(() => null);
  await at("");
  await p.getByLabel(/^proposal/).selectOption("Hexagon");
  await settle(p);
  const banner = () => p.locator(".proposal-banner").innerText().catch(() => null);
  out.proposal = [await hash(p), await banner(), await p.locator(".legend .violation").innerText()];
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
  out.errors = errors;
  return out;
}

const want = {
  nodes: 10,
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
  collapsed: "Collapsed to depth 2: depth 4 has 720 edges",
  header: "depth 2 (collapsed from 4)",
  hidden: ["#d=4&l=0", 0],
  anyway: 0,
  blocked: "Layout failed: layout worker failed: blocked",
  errors: [],
  // 07
  ranks: ["m 2", "m/cmd 2", "m/internal 1", "m/internal/cli 1", "m/internal/ir 0"],
  redBox: ["d=2: m/internal", "full: ", "arrows: m/internal", "triangles: m/internal", "elements: m/internal", "classes: m/internal"],
  panel: ["Violations inside (1)", "levels m/internal/ir/bad → m/internal/cli"],
  proposal: ["#p=Hexagon", "PROPOSAL — not instantiated in code: Hexagon", "violates Proposal Hexagon's layers; a red box holds one"],
  proposalReload: "PROPOSAL — not instantiated in code: Hexagon",
  proposalNone: ["", 0],
  order: "m/z m/y m/x m#pkg m/a m/b m/c",
  orderCentred: true,
  violations: ["New violations (1)", "levels example.com/shop/internal/store → example.com/shop/internal/money", "", "0 fixed, 2 pre-existing"],
  changeNoProposal: [0, 0],
};

const channel = process.env.ZU_E2E_CHANNEL;
let failed = 0;
for (const [name, type, opts] of [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]]) {
  const b = await type.launch(opts);
  const got = await run(b).finally(() => b.close());
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
