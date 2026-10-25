// Browser acceptance for the Screen (17), and in a Change View (18). Not part
// of make check: it needs browsers. Run from web/e2e after `make build`: npm
// run accept-screen.
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "zu-screen-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

// page writes a View into the built page, as zu does.
function page(name, v) {
  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
  const marker = '<script id="zu-data" type="application/json">{}</script>';
  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
  const f = join(dir, name + ".html");
  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c"))));
  return f;
}
const golden = (name) => JSON.parse(readFileSync(join(here, `../../internal/export/testdata/${name}.golden.json`), "utf8"));
const shop = page("shop", golden("shop.view"));
const change = page("change", golden("shop.change"));
// many: m/core, imported by 30 packages, more than a row draws (ROW_CAP 24).
const many = (() => {
  const loc = { path: "x.go", line: 1 };
  const ids = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
  const nodes = ["m/core", ...ids].map((id) => ({ id, kind: "package", module: "m", loc }));
  const edges = ids.map((from) => ({ from, to: "m/core", kind: "imports", count: 1, loc }));
  return page("many", { ...golden("shop.view"), modules: ["m"], sources: {}, nodes, edges });
})();

const S = "example.com/shop/internal/store";
const C = "example.com/shop/internal/checkout";
const M = "example.com/shop/internal/money";
const A = "example.com/shop/internal/audit";
const ROOT = "example.com/shop";
const IN = "example.com/shop/internal";
const enc = encodeURIComponent;
// far: shop.change with internal/audit, which money imports unchanged, so
// it is in no Affected Set and the changed subgraph leaves it out; money.Plus
// calls its Check, a near declaration. And a Policy that checkout's import of
// store breaks, a new violation.
const far = (() => {
  const v = golden("shop.change");
  const loc = { path: "internal/audit/audit.go", line: 1 };
  v.nodes.push({ id: A, kind: "package", module: "example.com/shop", loc, decls: 1 });
  v.edges.push({ from: M, to: A, kind: "imports", count: 1, loc: { path: "internal/money/money.go", line: 3 } });
  v.near.nodes.push({ id: `${A}.Check`, kind: "function", parent: A, loc });
  v.near.edges.push({ from: `${M}.Plus`, to: `${A}.Check`, kind: "calls", count: 1, loc });
  v.policy = { hash: "sha256:far", levels: [[C], [S]] };
  for (const e of v.edges) if (e.kind === "imports" && e.from === C && e.to === S) e.violation = "levels";
  v.violations = { new: [{ rule: "levels", from: C, to: S }], fixed: [], known: 0 };
  v.links = { blob: "https://github.com/o/r/blob/h/{path}#L{line}", compare: "https://github.com/o/r/compare/b...h" };
  return page("far", v);
})();

// cycle: shop.change and a new cycle, which names Package Tree boxes (06),
// both its arcs, as cycles.go flags them: the root's imports of internal,
// money's the change's own, and checkout's and store's of the root, kept.
const cycle = (() => {
  const v = golden("shop.change");
  v.policy = { hash: "sha256:cycle", levels: [] };
  v.edges.push(
    { from: C, to: ROOT, kind: "imports", count: 1, loc: { path: "internal/checkout/checkout.go", line: 3 } },
    { from: S, to: ROOT, kind: "imports", count: 1, loc: { path: "internal/store/store.go", line: 3 } },
  );
  for (const e of v.edges) if (e.kind === "imports" && (e.from === ROOT || e.to === ROOT)) e.violation = "cycle";
  v.violations = { new: [{ rule: "cycle", from: ROOT, to: IN }, { rule: "cycle", from: IN, to: ROOT }], fixed: [], known: 0 };
  return page("cycle", v);
})();

async function open(b, file, hash) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  // WebKit's one benign notice, dropped by equality as 14's serve.mjs does (A1).
  p.on("pageerror", (e) => e.message === "ResizeObserver loop completed with undelivered notifications." || errors.push(e.message));
  await p.goto("file://" + file + hash);
  await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
  await p.waitForTimeout(300);
  return { p, errors };
}
const hash = (p) => p.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
const centre = (p) => p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("c"));
// drawn is the Screen's boxes by id, once the Screen of c is drawn (null: no Screen).
const drawn = async (p, c) => {
  await p.waitForFunction((c) => c === null
    ? !document.querySelector(".screen") && document.querySelector(".react-flow__node")
    : document.querySelector(`.screen .react-flow__node[data-id="${CSS.escape(c)}"]`), c, { timeout: 10000 });
  await p.waitForTimeout(150);
  return p.evaluate(() => [...document.querySelectorAll(".screen .react-flow__node")].map((e) => e.dataset.id).sort());
};
const entries = (p) => p.evaluate(() => history.length);
// centred says id's box is in the middle of the tree's canvas, as a search pick leaves it.
const centred = (p, id) => p.waitForFunction((id) => {
  const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
  const n = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
  return pane && n && Math.abs(n.x + n.width / 2 - pane.x - pane.width / 2) < 4 && Math.abs(n.y + n.height / 2 - pane.y - pane.height / 2) < 4;
}, id, { timeout: 5000 }).then(() => true, () => false);
const panel = (p) => p.locator("aside.panel code.id").textContent({ timeout: 1000 }).catch(() => null);
const lens = (p) => p.locator('[aria-label="Lens"] button');

// spill: the nodes whose text reaches past their bottom edge: a label, a
// stats, sub or facts line, role badges, a row. v0.1.1: React Flow's source
// handle took the code panel's .source style, which put it in the flow and
// pushed every node's text down by its height.
const spill = () => [...document.querySelectorAll(".react-flow__node")].filter((n) => [...n.querySelectorAll(".label, .stats, .sub, .facts, .badges, .member")]
  .some((t) => t.getBoundingClientRect().bottom > n.getBoundingClientRect().bottom + 0.5)).length;

async function walk(b) {
  const { p, errors } = await open(b, shop, `#s=${enc(S)}`);
  const got = {};
  const start = await entries(p);
  const enabled = await lens(p).isEnabled();
  await p.keyboard.press("s");
  got.enter = JSON.stringify(await drawn(p, S)) === JSON.stringify([S, "down:example.com/shop/internal/money", "down:github.com/lib/pq", `up:${C}`].sort())
    && (await centre(p)) === S && (await entries(p)) === start + 1;
  got.button = [enabled, await lens(p).getAttribute("aria-pressed")];
  got.spill = await p.evaluate(spill);
  // The Screen's Panel shows the Centre; closed, it stays closed until the Centre changes.
  const shown = await panel(p);
  await p.locator('aside.panel button[aria-label="Close panel"]').click();
  const closed = await panel(p);
  await p.click(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}`)}"]`);
  const at = await drawn(p, C);
  got.recentre = (await centre(p)) === C && at.includes("up:example.com/shop") && at.includes(`down:${S}`) && (await entries(p)) === start + 2;
  got.panel = [shown?.startsWith(S), closed, (await panel(p))?.startsWith(C)];
  await p.goBack();
  const back = await drawn(p, S);
  got.panel.push((await panel(p))?.startsWith(S)); // closed at S, shown again on the way back
  await p.goBack();
  await drawn(p, null);
  const tree = await hash(p);
  got.back = back.includes(`up:${C}`) && tree.c === undefined && tree.s === S && (await centred(p, S));
  await p.goForward();
  got.forward = (await drawn(p, S)).includes(`up:${C}`) && (await centre(p)) === S;
  // Enter on a focused box re-centres, and the keyboard goes on from the new Centre.
  await p.focus(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}`)}"]`);
  await p.keyboard.press("Enter");
  await drawn(p, C);
  got.keyboard = [await centre(p), await p.evaluate(() => document.activeElement?.getAttribute("data-id"))];
  // Word-start Jump: "RW" is ReadWriter's Read, Writer.
  await p.keyboard.press("/");
  await p.keyboard.type("RW");
  await p.keyboard.press("Enter");
  got.wordStart = (await drawn(p, `${S}.ReadWriter`)).includes(`down:${S}.Reader`);
  await p.keyboard.press("/");
  await p.keyboard.type("Repo");
  await p.keyboard.press("Enter");
  const repo = await drawn(p, `${S}.Repo`);
  const note = await p.locator("#zu-screen").innerText();
  got.honest = repo.includes(`down:${S}.Open`) && note.includes("1 call or embed out of it, with declarations in packages not included")
    && note.includes("4 unresolved calls");
  await p.keyboard.press("Escape");
  await drawn(p, null);
  const left = await hash(p);
  got.esc = left.c === undefined && left.s === `${S}.Repo` && (await centred(p, `${S}.Repo`));
  await p.close();
  return { got, errors };
}

async function rows(b) {
  const bare = await open(b, shop, "");
  const disabled = await lens(bare.p).isDisabled(); // nothing selected: no Centre
  await bare.p.close();
  const { p, errors } = await open(b, many, `#c=${enc("m/core")}`);
  const capped = await drawn(p, "m/core");
  const start = await entries(p);
  await p.click('.react-flow__node[data-id="up:#more"]');
  await p.waitForFunction(() => location.hash.includes("m=1"));
  const all = await drawn(p, "m/core");
  const every = p.locator('[aria-label="Lens"] input[type=checkbox]');
  const checked = await every.isChecked();
  await every.uncheck();
  await p.waitForFunction(() => !location.hash.includes("m=1"));
  const again = await drawn(p, "m/core");
  const same = (await entries(p)) === start;
  // Ticked from the keyboard, the checkbox keeps the focus; s still leaves the Screen.
  await every.focus();
  await p.keyboard.press("Space");
  await p.waitForFunction(() => location.hash.includes("m=1"));
  await drawn(p, "m/core");
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("type"));
  await p.keyboard.press("s");
  const left = await drawn(p, null).then(() => centre(p), () => "still on the Screen");
  const got = {
    more: capped.filter((id) => id.startsWith("up:m/")).length === 24 && capped.includes("up:#more")
      && all.filter((id) => id.startsWith("up:m/")).length === 30 && !all.includes("up:#more") && same
      && checked && JSON.stringify(again) === JSON.stringify(capped) && focused === "checkbox" && left === null,
    disabled,
  };
  await p.close();
  return { got, errors: [...bare.errors, ...errors] };
}

// changeView: the Screen in a Change View (18).
async function changeView(b) {
  const { p, errors } = await open(b, change, "");
  const got = {};
  const start = await entries(p);
  const at = () => p.locator('[aria-label="Walk the change"] .at').innerText({ timeout: 1000 }).catch(() => null);
  const onTree = await at();
  // n starts the walk from the tree at store, the first changed package bottom-up.
  await p.keyboard.press("n");
  const first = await drawn(p, S);
  got.walk = [
    JSON.stringify(first) === JSON.stringify([S, `down:${M}`, "down:github.com/lib/pq", `up:${C}`, `up:${M}`].sort()),
    (await entries(p)) === start + 1, onTree, await at(),
  ];
  // Each box's mark and line's status; the reversed import's ghost; the Centre's members.
  got.marks = await p.evaluate(({ S, M }) => {
    const box = (id) => document.querySelector(`.screen .react-flow__node[data-id="${CSS.escape(id)}"] .screen-box`);
    const line = (id) => document.querySelector(`.screen .react-flow__edge[data-id="${CSS.escape(id)}"]`);
    const has = (e, c) => !!e && e.classList.contains(c);
    return [
      has(box(S), "st-modified"), has(box(`up:${M}`), "st-modified"), has(line(`up:${M}>`), "edge-reversed"),
      line(`up:${M}>`)?.querySelector(".react-flow__edge-text")?.textContent ?? null,
      has(box(`down:${M}`), "ghost"), has(line(`>down:${M}`), "ghost"),
      [...(box(S)?.querySelectorAll(".member") ?? [])].map((e) => e.textContent),
    ];
  }, { S, M });
  got.affected = (await p.locator("#zu-screen").innerText()).includes("Affected Set: changed; 4 packages import it, directly or not.")
    && (await p.locator(".legend .swatch.ghost").count()) === 1;
  // n and p step along the walk, each a history entry, and Back walks back.
  await p.keyboard.press("n");
  const order = await drawn(p, `${S}.Order`);
  const second = await at();
  await p.keyboard.press("p");
  await drawn(p, S);
  await p.goBack();
  got.step = [order.includes(`up:${C}.Cart`), second, (await drawn(p, `${S}.Order`)).length > 0, (await entries(p)) === start + 3];
  // A near box re-centres, off the walk; leaving there selects its package.
  await p.click(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}.Cart`)}"]`);
  await drawn(p, `${C}.Cart`);
  got.near = [await at(), (await panel(p))?.startsWith(`${C}.Cart`)];
  await p.keyboard.press("Escape");
  await drawn(p, null);
  const left = await hash(p);
  got.leave = [left.c ?? null, left.s, await centred(p, C)];
  // On a Screen, a pick from the changed packages (U11) re-centres there, a step of the walk.
  await p.keyboard.press("n");
  await drawn(p, S);
  await p.click(`nav.changed button[title="${C}"]`);
  await drawn(p, C).catch(() => {}); // the values below say what was drawn instead
  got.list = [await centre(p), await at()];
  await p.close();
  // Leaving for a package the changed subgraph leaves out draws all of the View (U10).
  const f = await open(b, far, `#c=${enc(`${M}.Plus`)}`);
  await drawn(f.p, `${M}.Plus`);
  await f.p.click(`.react-flow__node[data-id="${CSS_ESCAPE(`down:${A}.Check`)}"]`);
  await drawn(f.p, `${A}.Check`);
  await f.p.keyboard.press("s");
  await drawn(f.p, null);
  got.full = [(await hash(f.p)).s, await f.p.locator(".app.subgraph").count(), await centred(f.p, A)];
  await f.p.close();
  // A new violation's importer is the walk's first step, its line red as the tree draws it.
  const r = await open(b, far, "");
  await r.p.keyboard.press("n");
  await drawn(r.p, C);
  got.red = await r.p.evaluate((S) => [
    document.querySelector(`.screen .react-flow__edge[data-id="${CSS.escape(`>down:${S}`)}"]`)?.classList.contains("pinned") ?? null,
    document.querySelectorAll(".screen .react-flow__edge.pinned").length,
    document.querySelector(".legend .swatch.violation")?.textContent ?? null,
  ], S);
  // The Screen's header keeps the change's link to the host.
  got.host = await r.p.evaluate(() => document.querySelector("header.header a[target=_blank]")?.getAttribute("href") ?? null);
  await r.p.close();
  // The walk starts at the importer of the import the change made on a new
  // cycle, and steps on to the changed packages, not to the arc back's
  // importers; on a Screen, an end in the Violations list re-centres on its
  // package in its arc's first import, the change's own first.
  const y = await open(b, cycle, "");
  const settled = async () => (await y.p.waitForTimeout(500), centre(y.p));
  got.cycle = [];
  for (let i = 0; i < 3; i++) {
    await y.p.keyboard.press("n");
    got.cycle.push(await settled());
  }
  for (const n of [1, 2]) {
    await y.p.click(`section.violations li:nth-child(${n}) button[title="${IN}"]`);
    got.cycle.push(await settled());
  }
  await y.p.close();
  return { got, errors: [...errors, ...f.errors, ...r.errors, ...y.errors] };
}

const CSS_ESCAPE = (s) => s.replace(/["\\]/g, "\\$&");
const want = {
  enter: true, button: [true, "true"], panel: [true, null, true, true], recentre: true, back: true, forward: true, keyboard: [C, C],
  wordStart: true, honest: true, spill: 0, esc: true, more: true, disabled: true, errors: [],
  walk: [true, true, "10 steps", "1 of 10"], marks: [true, true, true, "⇄", true, true, ["~ Order", "− ReadWriter", "~ Repo.Get", "~ Repo.check"]],
  affected: true, step: [true, "2 of 10", true, true], near: ["– of 10", true], leave: [null, C, true], full: [A, 0, true],
  red: [true, 1, "violates zu.policy.yaml (levels or cycle)"], list: [C, "7 of 10"], host: "https://github.com/o/r/compare/b...h",
  cycle: [ROOT, `${ROOT}.main`, S, M, C],
};
const channel = process.env.ZU_E2E_CHANNEL;
const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
let failed = 0;
for (const [name, type, opts] of engines) {
  const b = await type.launch(opts);
  const got = await (async () => {
    const parts = [await walk(b), await rows(b), await changeView(b)];
    return { ...Object.assign({}, ...parts.map((x) => x.got)), errors: parts.flatMap((x) => x.errors) };
  })().catch((e) => ({ errors: [String(e.message ?? e).split("\n")[0]] })).finally(() => b.close().catch(() => {}));
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
