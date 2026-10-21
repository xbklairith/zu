// Measures what external modules take of a Project View's canvas (21), in
// the page. Not a replay step. Usage, from a zu checkout with web/e2e's npm ci
// done:
//   node measure.mjs <checkout> <page.html>[@focus]...
// Each argument is a page and the box it opens at ("" or none: the page
// root). In each engine, at 1,400 × 900, it records:
//   zoom:   the first view's zoom (11: readable, never below its floor);
//   lines:  the lines the first view draws at rest;
//   layout: ms from the layout's start to its end (the page's own marks);
// and, in Chromium, after the Controls' fit button has drawn every node:
//   canvas: the width × height every node spans, in layout px;
//   boxes:  the project boxes drawn (not ovals, chips of the rail or its band);
//   body:   the width × height the project boxes span, in layout px;
//   adds:   the share of the canvas outside that span: what the externals add;
//   ext:    the share of the canvas's area the externals' own shapes take: each
//           oval (before 21), or the rail's band (21);
//   below:  how far the externals reach below the project boxes, in layout px.
// Page errors are reported in every engine.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [root, ...args] = process.argv.slice(2);
const require = createRequire(resolve(root, "web/e2e/package.json"));
const { chromium, firefox, webkit } = require("playwright-core");

const frames = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const zoomOf = (p) => p.evaluate(() => {
  const t = document.querySelector(".react-flow__viewport")?.style.transform ?? "";
  return Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? NaN);
});

for (const arg of args) {
  const at = arg.indexOf("@");
  const [file, focus] = at < 0 ? [arg, ""] : [arg.slice(0, at), arg.slice(at + 1)];
  const url = pathToFileURL(resolve(file)).href + (focus ? "#f=" + encodeURIComponent(focus) : "");
  const out = [];
  for (const [name, engine] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
    const b = await engine.launch();
    const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => performance.getEntriesByName("zu-layout-end").length > 0, null, { timeout: 120000 });
    await p.locator(".react-flow__node").first().waitFor();
    await frames(p);
    await p.waitForTimeout(300);
    const r = {
      zoom: (await zoomOf(p)).toFixed(3),
      lines: await p.locator(".react-flow__edge").count(),
      layout: await p.evaluate(() => Math.round(performance.getEntriesByName("zu-layout-end")[0].startTime
        - performance.getEntriesByName("zu-layout-start").at(-1).startTime)),
    };
    if (name === "chromium") {
      await p.locator(".react-flow__controls-fitview").click();
      await frames(p);
      await p.waitForTimeout(300);
      const z = await zoomOf(p);
      const g = await p.evaluate((z) => {
        const rects = [...document.querySelectorAll(".react-flow__node")].map((e) => {
          const r = e.getBoundingClientRect();
          const inner = e.firstElementChild;
          const ext = !!inner && (inner.classList.contains("oval") || inner.classList.contains("rail"));
          const chip = !!inner && inner.classList.contains("ext");
          return { x: r.x / z, y: r.y / z, w: r.width / z, h: r.height / z, ext, chip };
        });
        const span = (rs) => {
          const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
          const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
          return { w: x1 - x0, h: y1 - y0, y1 };
        };
        const all = span(rects);
        const body = rects.filter((r) => !r.ext && !r.chip);
        const own = span(body);
        const ext = rects.filter((r) => r.ext);
        const area = ext.reduce((a, r) => a + r.w * r.h, 0);
        return {
          canvas: `${Math.round(all.w)} × ${Math.round(all.h)}`,
          body: `${Math.round(own.w)} × ${Math.round(own.h)}`,
          adds: `${(100 * (1 - (own.w * own.h) / (all.w * all.h))).toFixed(1)}%`,
          boxes: body.length,
          ext: `${(100 * area / (all.w * all.h)).toFixed(1)}%`,
          below: body.length ? Math.round(all.y1 - own.y1) : 0,
        };
      }, z);
      Object.assign(r, g);
    }
    r.errors = errors.length ? errors.join(" | ") : "none";
    out.push(`${name}: ${Object.entries(r).map(([k, x]) => `${k} ${x}`).join("; ")}`);
    await b.close();
  }
  console.log(`${file.split("/").at(-1)} @${focus || "root"}\n  ${out.join("\n  ")}`);
}
