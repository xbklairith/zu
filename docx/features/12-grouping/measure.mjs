// Measures a zu page's first view for 12's acceptance, at 1600 × 1000: the
// boxes drawn (not chips, containers or ovals) and the group chips, the rows
// of the top sibling set, the smallest text on screen (labels, stats lines,
// badges) in px, the axis's words, and the page's errors. One screenshot per
// engine, of the first view as it opens.
// Usage, from the repo root after `make build` and `npm ci` in web/e2e:
//   node docx/features/12-grouping/measure.mjs OUTDIR name=page.html ...
import { chromium, firefox, webkit } from "../../../web/e2e/node_modules/playwright-core/index.mjs";

const [dir, ...pages] = process.argv.slice(2);
const rows = [];
for (const [engine, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
  const b = await type.launch();
  for (const arg of pages) {
    const [name, file] = arg.split("=");
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    p.on("console", (m) => /Content.Security|CSP/i.test(m.text()) && errors.push(m.text().slice(0, 120)));
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
    await p.goto("file://" + file);
    await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
    await p.waitForTimeout(3000);
    const shot = `${dir}/${name}-${engine}.png`;
    await p.screenshot({ path: shot });
    const m = await p.evaluate(() => {
      const zoom = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a;
      const texts = [...document.querySelectorAll(".react-flow__node .label, .react-flow__node .stats, .react-flow__node .badge")];
      const px = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize) * zoom));
      // Rows of the top set: nodes inside no container, grouped by overlapping
      // vertical extent, as layout.ts rowsOf does (a wrapped rank counts per row).
      const nodes = [...document.querySelectorAll(".react-flow__node")].map((n) => ({ n, r: n.getBoundingClientRect() }));
      const boxes = nodes.filter((x) => x.n.classList.contains("react-flow__node-container"));
      const inside = (a, b) => a !== b && a.r.left >= b.r.left && a.r.right <= b.r.right && a.r.top >= b.r.top && a.r.bottom <= b.r.bottom;
      const top = nodes.filter((x) => !boxes.some((c) => inside(x, c))).sort((a, b) => a.r.top - b.r.top);
      let rows = 0;
      let bottom = -Infinity;
      for (const x of top) {
        if (x.r.top >= bottom) rows++;
        bottom = Math.max(bottom, x.r.bottom);
      }
      return {
        zoom: +zoom.toFixed(3), minPx: +px.toFixed(1), rows,
        boxes: document.querySelectorAll(".react-flow__node .node.box").length,
        chips: [...document.querySelectorAll(".react-flow__node .node.chip.group .label")].map((e) => e.textContent),
        axis: [...document.querySelectorAll(".axis .v")].map((e) => e.textContent).join(" / "),
        topRow: top.filter((x) => Math.abs(x.r.top - top[0].r.top) < 2).map((x) => x.n.getAttribute("data-id")),
        inner: nodes.filter((x) => boxes.some((c) => inside(x, c))).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left).map((x) => x.n.getAttribute("data-id").split("/").pop()),
      };
    });
    // Zoom out to the whole scene (the Controls button) to count every node.
    await p.locator(".react-flow__controls-fitview").click();
    await p.waitForTimeout(1500);
    m.total = await p.locator(".react-flow__node").count();
    rows.push({ engine, name, ...m, errors: errors.length, shot });
    await p.close();
  }
  await b.close();
}
for (const r of rows) console.log(JSON.stringify(r));
