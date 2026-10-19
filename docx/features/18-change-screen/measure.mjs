// Times the walk through a Change View (18) on real pages, inside the page:
// from the key to the walk's "N of M" with a new Centre's box in the DOM (a
// MutationObserver), then two frames. Not a replay step. Usage, from a zu
// checkout with web/e2e's npm ci done:
//   node measure.mjs <checkout> <page.html>...
// It records, in each engine, the median and worst over the first STEPS steps:
//   walk:         the page's steps, from the toolbar;
//   enter:        n on the tree, to the first step's Screen;
//   step:         n on each of the next steps;
//   back:         the browser's Back over those steps;
//   Panel closed: the same steps, closing the Panel before each (it opens
//                 again on the new Centre, mounted rather than updated);
//   tree Panel:   on the tree, the Panel moving to those steps' Centres (a
//                 hash change), to compare with a step.
import { createRequire } from "node:module";

const STEPS = 12;
const [root, ...pages] = process.argv.slice(2);
const require = createRequire(root + "/web/e2e/package.json");
const { chromium, firefox, webkit } = require("playwright-core");

// timed acts in the page and returns [ms, the new Centre] once the walk reads
// want and the Centre's box is another than it was, and two frames later.
const timed = (p, act, want) => p.evaluate(async ([act, want]) => {
  const centre = () => document.querySelector(".screen .react-flow__node.selected")?.getAttribute("data-id") ?? null;
  const was = centre();
  const done = () => document.querySelector(".walk .at")?.textContent === want && centre() !== null && centre() !== was;
  const t0 = performance.now();
  const seen = new Promise((res) => {
    const o = new MutationObserver(() => {
      if (done()) { o.disconnect(); res(); }
    });
    o.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  });
  if (act.key) window.dispatchEvent(new KeyboardEvent("keydown", { key: act.key, bubbles: true }));
  if (act.back) history.back();
  await seen;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return [Math.round(performance.now() - t0), centre()];
}, [act, want]);
// panel times the tree's Panel moving to id.
const panel = (p, id) => p.evaluate(async (id) => {
  const t0 = performance.now();
  const seen = new Promise((res) => {
    const o = new MutationObserver(() => {
      if (document.querySelector("aside.panel code.id")?.textContent?.startsWith(id)) { o.disconnect(); res(); }
    });
    o.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  location.hash = "#s=" + encodeURIComponent(id);
  await seen;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return Math.round(performance.now() - t0);
}, id);
const settle = (p) => p.waitForTimeout(300);
const stat = (ms) => {
  const s = [...ms].sort((a, b) => a - b);
  return `${s[Math.floor(s.length / 2)]}/${s[s.length - 1]}`;
};

for (const f of pages) {
  console.log(`${f.split("/").pop()}: ms to drawn +2 frames, median/worst over the first ${STEPS} steps`);
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
    const b = await type.launch();
    const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("file://" + f);
    await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
    await p.waitForTimeout(2000);
    const of = Number((await p.locator(".walk .at").textContent()).split(" ")[0]);
    const steps = Math.min(STEPS, of - 1);
    const r = { walk: `${of} steps`, enter: (await timed(p, { key: "n" }, `1 of ${of}`))[0] };
    await settle(p);
    const step = [], back = [], closed = [], tree = [], centres = [];
    for (let i = 2; i <= steps + 1; i++) {
      const [ms, c] = await timed(p, { key: "n" }, `${i} of ${of}`);
      step.push(ms);
      centres.push(c);
      await settle(p);
    }
    for (let i = steps; i >= 1; i--) { back.push((await timed(p, { back: true }, `${i} of ${of}`))[0]); await settle(p); }
    const close = () => p.locator("aside.panel button").first().click({ timeout: 1000 }).catch(() => {});
    for (let i = 2; i <= steps + 1; i++) {
      await close();
      await settle(p);
      closed.push((await timed(p, { key: "n" }, `${i} of ${of}`))[0]);
      await settle(p);
    }
    await p.keyboard.press("Escape");
    await p.locator(".screen").waitFor({ state: "detached" });
    await p.waitForTimeout(2000);
    for (const c of centres) { tree.push(await panel(p, c)); await settle(p); }
    Object.assign(r, { step: stat(step), back: stat(back), "Panel closed": stat(closed), "tree Panel": stat(tree), errors: errors.length });
    console.log(`  ${name}: ${Object.entries(r).map(([k, x]) => `${k} ${x}`).join("; ")}`);
    await b.close();
  }
}
