// Times the Screen (17) on real pages, inside the page: from the key or click
// to the new Centre's box in the DOM (a MutationObserver), then two frames.
// Not a replay step. Usage, from a zu checkout with web/e2e's npm ci done:
//   node measure.mjs <checkout> <page.html>...
// For each page, its Centre is the package the most packages import. It
// records, in each engine:
//   enter:       s on the tree with that package selected;
//   re-centre:   a click on each of the first three boxes above (the
//                heaviest importers), with Back between them;
//   no Panel:    the same three after closing the Screen's Panel;
//   every box:   the "every box" checkbox;
//   tree Panel:  on the tree, the Panel moving off the Centre to those three
//                (a hash change), to compare with re-centre;
//   page errors: any the page threw.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [root, ...pages] = process.argv.slice(2);
const require = createRequire(resolve(root, "web/e2e/package.json"));
const { chromium, firefox, webkit } = require("playwright-core");

const viewOf = (f) => JSON.parse(/<script id="zu-data" type="application\/json">(.*?)<\/script>/s.exec(readFileSync(f, "utf8"))[1]);
const enc = encodeURIComponent;

// timed runs act in the page and returns ms until sel matches more than
// over elements, and until two frames later.
const timed = (p, act, sel, over = 0) => p.evaluate(async ([act, sel, over]) => {
  const t0 = performance.now();
  const seen = new Promise((res) => {
    const o = new MutationObserver(() => {
      if (document.querySelectorAll(sel).length > over) { o.disconnect(); res(performance.now() - t0); }
    });
    o.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  if (act.key) window.dispatchEvent(new KeyboardEvent("keydown", { key: act.key, bubbles: true }));
  if (act.click) document.querySelector(act.click).click();
  if (act.hash) location.hash = act.hash;
  const ms = await seen;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return `${Math.round(ms)}/${Math.round(performance.now() - t0)}`;
}, [act, sel, over]);
const node = (id) => `.screen .react-flow__node[data-id="${id.replace(/["\\]/g, "\\$&")}"]`;
const settle = (p) => p.waitForTimeout(500);

for (const f of pages) {
  const v = viewOf(f);
  const by = new Map();
  for (const e of v.edges) if (e.kind === "imports") by.set(e.to, (by.get(e.to) ?? 0) + 1);
  const [c, n] = [...by].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  console.log(`${f.split("/").pop()}: ${v.nodes.length} nodes, ${v.edges.length} edges; Centre ${c} (${n} importers). ms to drawn/+2 frames`);
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
    const b = await type.launch();
    const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 80)));
    await p.goto("file://" + f + "#s=" + enc(c));
    await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
    await p.waitForTimeout(2000);
    const r = { enter: await timed(p, { key: "s" }, node(c)) };
    await settle(p);
    const ups = await p.evaluate(() => [...document.querySelectorAll(".screen .react-flow__node")]
      .map((e) => e.dataset.id).filter((id) => id.startsWith("up:") && id !== "up:#more").slice(0, 3));
    for (const [label, close] of [["re-centre", false], ["no Panel", true]]) {
      const ms = [];
      for (const id of ups) {
        if (close) await p.locator("aside.panel button").first().click({ timeout: 1000 }).catch(() => {});
        await settle(p);
        ms.push(await timed(p, { click: `.react-flow__node[data-id="${id}"]` }, node(id.slice(3))));
        await p.goBack();
        await p.locator(node(c)).waitFor();
        await settle(p);
      }
      r[label] = ms.join(" ");
    }
    const capped = await p.locator(".screen .react-flow__node").count();
    const all = await timed(p, { click: ".bar input[type=checkbox]" }, ".screen .react-flow__node", capped);
    r["every box"] = `${all} (${await p.locator(".screen .react-flow__node").count()} boxes)`;
    await p.keyboard.press("s");
    await p.locator(".screen").waitFor({ state: "detached" });
    await p.waitForTimeout(2000);
    const tree = [];
    for (const id of ups) {
      const to = id.slice(3);
      tree.push(await p.evaluate(async ([to, c]) => {
        const t0 = performance.now();
        const seen = new Promise((res) => {
          const o = new MutationObserver(() => {
            if (document.querySelector("aside.panel code.id")?.textContent?.startsWith(to)) { o.disconnect(); res(Math.round(performance.now() - t0)); }
          });
          o.observe(document.body, { childList: true, subtree: true, characterData: true });
        });
        location.hash = "#s=" + encodeURIComponent(to);
        const ms = await seen;
        location.hash = "#s=" + encodeURIComponent(c);
        return ms;
      }, [to, c]));
      await p.waitForTimeout(2000);
    }
    r["tree Panel"] = tree.join(" ");
    r["page errors"] = errors.length ? errors.join(" | ") : "none";
    console.log(`  ${name}: ${Object.entries(r).map(([k, x]) => `${k} ${x}`).join("; ")}`);
    await b.close();
  }
}
