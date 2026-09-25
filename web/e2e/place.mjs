// Browser acceptance for open in place (15, U2). Not part of make check: it
// needs browsers. Run from web/e2e after `make build`: npm run accept-place.
// With page files as arguments (zu scan -html), it measures instead: every
// toggle of each page's first view, opened and closed again, in chromium,
// firefox and webkit, with what else moved and how long until it drew.
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const pages = process.argv.slice(2).map((f) => resolve(f));
const dir = mkdtempSync(join(tmpdir(), "zu-place-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

// town: place.test.ts's View, eighteen boxes under m, as a page.
function town() {
  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
  const marker = '<script id="zu-data" type="application/json">{}</script>';
  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
  const shop = JSON.parse(readFileSync(join(here, "../../internal/export/testdata/shop.view.golden.json"), "utf8"));
  const loc = { path: "x.go", line: 1 };
  const pkg = (id, extra = {}) => ({ id, kind: "package", module: "m", loc, ...extra });
  const imp = (from, to) => ({ from, to, kind: "imports", count: 1, loc });
  const box = (i) => `m/k${String(i % 18).padStart(2, "0")}`;
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 18; i++) {
    const b = box(i);
    if (i % 5 === 0) nodes.push(pkg(b, { decls: 2 }));
    for (let j = 0; j < 2 + (i % 3); j++) nodes.push(pkg(`${b}/s${j}`, { decls: ((i * 3 + j) % 7) + 1 }));
    if (i % 4 === 0) nodes.push(pkg(`${b}/s0/u`, { decls: 3 }), pkg(`${b}/s0/v`, { decls: 3 }));
    edges.push(imp(`${b}/s0`, `${box(i + 1)}/s1`), imp(`${b}/s1`, `${box(i * 7 + 3)}/s0`));
    if (i % 4 === 0) edges.push(imp(`${b}/s0/u`, `${box(i + 5)}/s0`), imp(`${box(i + 9)}/s1`, `${b}/s0/v`));
  }
  nodes.push(pkg("m/testdata/a", { demoted: "name" }), pkg("m/testdata/b", { demoted: "name" }), { id: "github.com/x/y", kind: "external", loc });
  edges.push(imp("m/k03/s0", "m/testdata/a"), imp("m/k02/s0", "github.com/x/y"), imp("m/k02/s1", "github.com/x/y"), imp("m/k01/s0", "m/k02/s0"));
  const v = { ...shop, modules: ["m"], sources: {}, nodes, edges };
  const f = join(dir, "town.html");
  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c"))));
  return f;
}

// drawing is every drawn node: its place on the canvas (React Flow's
// transform) and its size, by id. React Flow draws only the nodes on screen.
const drawing = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".react-flow__node")].map((e) =>
  [e.dataset.id, `${e.style.transform} ${e.offsetWidth}x${e.offsetHeight}`])));
const viewport = (p) => p.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform ?? "");
const toggles = (p) => p.evaluate(() => [...document.querySelectorAll(".react-flow__node .toggle")]
  .map((e) => e.closest(".react-flow__node").dataset.id).filter((id) => !id.includes("#")));

// flip clicks id's toggle and resolves once the page draws it the other way
// (its type flips between box and container) and a frame has passed: ms from
// the click. The page is watched for "Laying out…" meanwhile.
const flip = (p, id) => p.evaluate(async (id) => {
  const sel = `.react-flow__node[data-id="${CSS.escape(id)}"]`;
  const was = document.querySelector(sel).classList.contains("react-flow__node-container");
  let blank = false;
  const t0 = performance.now();
  document.querySelector(`${sel} .toggle`).click();
  await new Promise((done) => {
    const tick = () => {
      if (document.getElementById("zu-status")) blank = true;
      const n = document.querySelector(sel);
      if (n && n.classList.contains("react-flow__node-container") !== was) requestAnimationFrame(() => done());
      else requestAnimationFrame(tick);
    };
    tick();
  });
  return { ms: performance.now() - t0, blank };
}, id);

const settle = (p) => p.waitForTimeout(300);
const box = (d) => {
  const [, x, y, w, h] = /translate\(([-\d.]+)px, ([-\d.]+)px\) (\d+)x(\d+)/.exec(d).map(Number);
  return { x, y, w, h };
};

// wrong is how many nodes that must stay moved or resized: those above the
// box at the top that holds id, or left of it in its row.
function wrong(a, b, id) {
  const top = Object.keys(a).filter((k) => id === k || id.startsWith(k + "/")).map((k) => box(a[k])).sort((x, y) => y.w * y.h - x.w * x.h)[0];
  return Object.keys(a).filter((k) => {
    const n = box(a[k]);
    const stays = n.y + n.h <= top.y || (n.x + n.w <= top.x && n.y < top.y + top.h);
    return stays && k in b && a[k] !== b[k];
  }).length;
}

// moved is how many nodes outside id, drawn before and after, changed place or size.
const moved = (a, b, id) => Object.keys(a).filter((k) => k !== id && !k.startsWith(id + "/") && !k.startsWith(id + "#") && k in b && a[k] !== b[k]).length;

async function open(b, file) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  // WebKit's one benign notice, dropped by equality as 14's serve.mjs does (A1).
  p.on("pageerror", (e) => e.message === "ResizeObserver loop completed with undelivered notifications." || errors.push(e.message));
  await p.goto("file://" + file);
  await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
  await p.waitForTimeout(500);
  return { p, errors };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

async function measure(name, b) {
  for (const file of pages) {
    const { p } = await open(b, file);
    const first = await drawing(p);
    const rows = [];
    for (const id of await toggles(p)) {
      const o = await flip(p, id);
      await settle(p);
      const opened = await drawing(p);
      const c = await flip(p, id);
      await settle(p);
      rows.push({ open: o.ms, close: c.ms, moved: moved(first, opened, id), wrong: wrong(first, opened, id), restored: await drawing(p).then((d) => Object.keys(first).every((k) => d[k] === first[k])), blank: o.blank || c.blank });
    }
    const f = (k) => `${Math.round(median(rows.map((r) => r[k])))} / ${Math.round(Math.max(...rows.map((r) => r[k])))}`;
    console.log(`| ${basename(file)} | ${name} | ${rows.length} | ${f("open")} | ${f("close")} | ${f("moved")} | ${rows.filter((r) => r.wrong > 0).length} | ${rows.filter((r) => r.restored).length} | ${rows.filter((r) => r.blank).length} |`);
    await p.close();
  }
}

// accept: on town, opening m/k00/s0 (inside the open m/k00) moves nothing
// drawn above m/k00's row or left of m/k00 in it (place.test.ts proves the
// rest: what moves, moves aside by what the box grew). Closing it draws the
// first view again exactly, with no blank page between and the reader's pan
// and zoom kept, and so does closing it before it is laid out (B1).
async function accept(name, b, file) {
  const { p, errors } = await open(b, file);
  await p.mouse.move(700, 450);
  await p.mouse.wheel(0, -200); // zoom in: the view must keep it
  await p.waitForTimeout(400);
  const vp = await viewport(p);
  const first = await drawing(p);
  const o = await flip(p, "m/k00/s0");
  await settle(p);
  const opened = await drawing(p);
  const vpOpen = await viewport(p);
  const c = await flip(p, "m/k00/s0");
  await settle(p);
  const back = await drawing(p);
  // B1: open a box not opened before and close it again a task later, once
  // its layout has started and before its region is laid out (no wait). The
  // page must draw the hash: the first view, with the box closed.
  const fresh = await p.evaluate(() => [...document.querySelectorAll(".react-flow__node:not(.react-flow__node-container) .toggle")]
    .map((e) => e.closest(".react-flow__node").dataset.id).find((id) => !id.includes("#") && id !== "m/k00/s0"));
  await p.evaluate(async (id) => {
    const toggle = () => document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .toggle`).click();
    toggle();
    await new Promise((ok) => setTimeout(ok, 0));
    toggle();
  }, fresh);
  await settle(p);
  await settle(p);
  const raced = await drawing(p);
  const hashed = await p.evaluate(() => decodeURIComponent(location.hash));
  const k00 = box(first["m/k00"]);
  const aside = Object.keys(first).filter((k) => {
    const b = box(first[k]);
    return b.y + b.h <= k00.y || (b.x + b.w <= k00.x && b.y < k00.y + k00.h);
  });
  return {
    opened: opened["m/k00/s0/u"] !== undefined,
    others: aside.length >= 5 && aside.every((k) => first[k] === opened[k]),
    restored: Object.keys(first).every((k) => back[k] === first[k]), // WebKit may draw more of the edge of the screen
    kept: vp !== "" && vp === vpOpen && vp === (await viewport(p)),
    raced: fresh !== undefined && !hashed.includes(fresh) && Object.keys(first).every((k) => raced[k] === first[k]),
    blank: o.blank || c.blank,
    errors,
  };
}
const want = { opened: true, others: true, restored: true, kept: true, raced: true, blank: false, errors: [] };

const channel = process.env.ZU_E2E_CHANNEL;
const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
if (pages.length) {
  console.log("| page | engine | toggles | open ms (median / max) | close ms | others moved | toggles moving a box above or left | restored | blank |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const [name, type, opts] of engines) {
    const b = await type.launch(opts);
    await measure(name, b).finally(() => b.close().catch(() => {}));
  }
  process.exit(0);
}
const file = town();
let failed = 0;
for (const [name, type, opts] of engines) {
  const b = await type.launch(opts);
  const got = await accept(name, b, file).finally(() => b.close().catch(() => {}));
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
