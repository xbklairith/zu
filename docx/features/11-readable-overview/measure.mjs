// Measures a zu page's default view (11 acceptance): the smallest label on
// screen in px, the lines drawn at rest, the boxes in the viewport of all
// the scene draws, and whether a minimap is shown. One screenshot per engine,
// and with name=page.html@label a second one hovering the box with that label,
// with the lines it draws counted.
// Usage, from the repo root after `make build` and `npm ci` in web/e2e:
//   node docx/features/11-readable-overview/measure.mjs OUTDIR name=page.html[@label] ...
import { chromium, firefox, webkit } from "../../../web/e2e/node_modules/playwright-core/index.mjs";

const [dir, ...pages] = process.argv.slice(2);
const rows = [];
for (const [engine, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
  const b = await type.launch();
  for (const arg of pages) {
    const [name, rest] = arg.split("=");
    const [file, hover] = rest.split("@");
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
      const pane = document.querySelector(".react-flow").getBoundingClientRect();
      const zoom = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a;
      const nodes = [...document.querySelectorAll(".react-flow__node")];
      const inView = nodes.filter((n) => {
        const r = n.getBoundingClientRect();
        return r.right > pane.left && r.left < pane.right && r.bottom > pane.top && r.top < pane.bottom;
      }).length;
      const px = Math.min(...nodes.map((n) => parseFloat(getComputedStyle(n.querySelector(".label") ?? n).fontSize) * zoom));
      return {
        zoom: +zoom.toFixed(3), labelPx: +px.toFixed(1), edges: document.querySelectorAll(".react-flow__edge").length, inView,
        note: document.querySelector("#zu-edges")?.textContent.trim() ?? "", against: document.querySelector("#zu-against")?.textContent.trim() ?? "", minimap: document.querySelectorAll(".react-flow__minimap").length,
        header: document.querySelector("header")?.innerText.split("\n")[0].slice(0, 100) ?? "",
      };
    });
    if (hover) {
      await p.locator(".react-flow__node", { has: p.locator(".label", { hasText: new RegExp(`^${hover}$`) }) }).first().hover();
      await p.waitForTimeout(800);
      m.hover = { box: hover, out: await p.locator(".react-flow__edge.dep-out").count(), in: await p.locator(".react-flow__edge.dep-in").count() };
      await p.screenshot({ path: `${dir}/${name}-hover-${engine}.png` });
      await p.mouse.move(1, 1);
    }
    // Zoom out to the whole scene (the Controls button) to count every box.
    await p.locator(".react-flow__controls-fitview").click();
    await p.waitForTimeout(1500);
    m.total = await p.locator(".react-flow__node").count();
    rows.push({ engine, name, ...m, errors: errors.length, shot });
    await p.close();
  }
  await b.close();
}
for (const r of rows) console.log(JSON.stringify(r));
