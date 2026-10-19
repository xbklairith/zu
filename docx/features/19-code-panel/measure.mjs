// Measures zu serve without -include (19) on real trees: the View's size and
// how long /view.json takes, the page drawn, a declaration's code shown when
// its panel opens (read from /source), and a call's lines lit when its row is
// pointed at. Not a replay step. Usage, from a zu checkout with bin/zu built
// and web/e2e's npm ci done:
//   node measure.mjs <checkout> <tree>...
// The declaration is the function written furthest down its file (the
// highest loc.line) that calls or embeds another declaration, so its code
// scrolls the most and it has a row to point at: its first "Calls and
// embeds out". The longest file the View declares in is timed too, its
// furthest declaration opened, so the code drawn is the most. A checkout
// from before 19 draws no declaration, so only its View and drawing are
// timed.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [root, ...trees] = process.argv.slice(2);
const require = createRequire(root + "/web/e2e/package.json");
const { chromium, firefox, webkit } = require("playwright-core");
const RUNS = 3;

function serve(tree) {
  const s = spawn(root + "/bin/zu", ["serve", tree, "-addr", "127.0.0.1:0", "-poll", "0"], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  s.stderr.on("data", (d) => (log += d));
  return new Promise((ok, fail) => {
    s.stdout.once("data", (d) => ok({ url: String(d).trim(), stop: () => s.kill(), log: () => log }));
    s.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
  });
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

for (const tree of trees) {
  const s = await serve(tree);
  const views = [];
  let view;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const text = await (await fetch(s.url + "view.json", { cache: "no-store" })).text();
    views.push(performance.now() - t0);
    view = JSON.parse(text);
    view.bytes = Buffer.byteLength(text);
  }
  const decls = view.nodes.filter((n) => n.kind === "type" || n.kind === "function");
  const calls = new Set(view.edges.filter((e) => e.kind !== "imports").map((e) => e.from));
  const fn = decls.filter((n) => n.kind === "function" && calls.has(n.id)).sort((a, b) => b.loc.line - a.loc.line)[0];
  // longest: the file with the most lines that declares a drawn type or function.
  const paths = [...new Set(decls.map((n) => n.loc.path))].map((path) => [path, readFileSync(join(tree, path), "utf8").split("\n").length]);
  const longest = paths.sort((a, b) => b[1] - a[1])[0];
  const big = longest && { ...decls.filter((n) => n.loc.path === longest[0]).sort((a, b) => b.loc.line - a.loc.line)[0], lines: longest[1] };
  const sources = [];
  for (let i = 0; fn && i < RUNS; i++) {
    const t0 = performance.now();
    const r = await fetch(s.url + "source?path=" + encodeURIComponent(fn.loc.path), { cache: "no-store" });
    const body = await r.text();
    sources.push(performance.now() - t0);
    fn.bytes = Buffer.byteLength(body);
    fn.lines = JSON.parse(body).text.split("\n").length;
  }
  const bigs = [];
  for (let i = 0; big && i < RUNS; i++) {
    const t0 = performance.now();
    const body = await (await fetch(s.url + "source?path=" + encodeURIComponent(big.loc.path), { cache: "no-store" })).text();
    bigs.push(performance.now() - t0);
    big.bytes = Buffer.byteLength(body);
  }
  console.log(`${tree}: View ${(view.bytes / 1e6).toFixed(2)} MB, ${decls.length} declarations drawn, detail ${view.nodes.some((n) => n.detail)}; /view.json ${views.map(Math.round).join(", ")} ms`);
  if (fn) console.log(`  ${fn.id} at ${fn.loc.path}:${fn.loc.line}, of ${fn.lines} lines: /source ${(fn.bytes / 1e3).toFixed(0)} KB in ${sources.map(Math.round).join(", ")} ms`);
  if (big) console.log(`  longest: ${big.id} at ${big.loc.path}:${big.loc.line}, of ${big.lines} lines: /source ${(big.bytes / 1e3).toFixed(0)} KB in ${bigs.map(Math.round).join(", ")} ms`);
  if (s.log().trim()) console.log("  stderr: " + s.log().trim().split("\n").join(" | "));
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
    const b = await type.launch();
    const got = { drawn: [], page: [], code: [], lit: [], big: [], errors: [] };
    // shown is how long the panel of id takes to open on its code's marked
    // line, from the hash change, in the page.
    const shown = (p, id) => p.evaluate(async (id) => {
      const t = performance.now();
      location.hash = `#s=${encodeURIComponent(id)}`;
      await new Promise((res) => {
        const done = () => document.querySelector(`aside.panel pre.source .hit`);
        if (done()) return res();
        const o = new MutationObserver(() => done() && (o.disconnect(), res()));
        o.observe(document.body, { childList: true, subtree: true });
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t;
    }, id);
    for (let i = 0; i < RUNS; i++) {
      const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
      p.on("pageerror", (e) => got.errors.push(e.message.slice(0, 80)));
      const t0 = Date.now();
      await p.goto(s.url);
      await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
      got.drawn.push(Date.now() - t0);
      // page: from /view.json's last byte to the first box, without the rescan behind it.
      got.page.push(await p.evaluate(() => performance.now() - performance.getEntriesByType("resource").find((e) => e.name.endsWith("/view.json")).responseEnd));
      if (!fn) {
        await p.close();
        continue;
      }
      got.code.push(await shown(p, fn.id));
      const row = p.locator("aside.panel section", { has: p.locator('h3:text-matches("^Calls and embeds out")') }).locator("li").first();
      if (await row.count()) {
        const box = await row.boundingBox();
        got.lit.push(await p.evaluate(async ([x, y]) => {
          const t = performance.now();
          const lit = new Promise((res) => {
            const o = new MutationObserver(() => document.querySelector("aside.panel .lit-note")?.textContent?.match(/^(Line|In other)/) && (o.disconnect(), res()));
            o.observe(document.body, { childList: true, subtree: true, characterData: true });
          });
          document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
          await lit;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return performance.now() - t;
        }, [box.x + 4, box.y + box.height / 2]));
      }
      // The longest file last, on a page of its own, so nothing before it is drawn.
      await p.close();
      if (!big) continue;
      const q = await b.newPage({ viewport: { width: 1400, height: 900 } });
      q.on("pageerror", (e) => got.errors.push(e.message.slice(0, 80)));
      await q.goto(s.url);
      await q.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
      got.big.push(await shown(q, big.id));
      await q.close();
    }
    await b.close();
    const fmt = (xs) => (xs.length ? `${Math.round(median(xs))} (${xs.map(Math.round).join(", ")})` : "no row");
    console.log(`  ${name}: drawn ${fmt(got.drawn)} ms; page ${fmt(got.page)} ms; code ${fmt(got.code)} ms; lit ${fmt(got.lit)} ms; longest ${fmt(got.big)} ms; page errors ${got.errors.length ? got.errors.join(" | ") : "none"}`);
  }
  s.stop();
}
process.exit(0);
