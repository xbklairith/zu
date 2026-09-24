// First paint of exported pages (09 acceptance, performance budget "first
// paint of a 500-node graph under 3 s"). Run from web/e2e:
//   node paint.mjs '/abs/path/k8s.html#d=3&l=0' [more pages…]
// Opens each page (a hash picks the view) from file:// in Chromium, Firefox and
// WebKit and prints the boxes drawn and the timings, in ms after navigation
// start. Judge the budget on zu-drawn: first-contentful-paint is the header.
import { chromium, firefox, webkit } from "playwright-core";

const pages = process.argv.slice(2);
if (pages.length === 0) throw new Error("usage: node paint.mjs '/abs/path/page.html[#hash]'…");
console.log("| page | engine | header | notice | first-contentful-paint | zu-layout-end | zu-drawn |");
console.log("|---|---|---|---|---|---|---|");
for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
  const b = await type.launch();
  try {
    for (const f of pages) {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
      await p.goto("file://" + f);
      await p.waitForFunction(() => performance.getEntriesByName("zu-drawn").length > 0, null, { timeout: 60000 });
      const r = await p.evaluate(() => {
        const at = (n) => Math.round(performance.getEntriesByName(n)[0]?.startTime ?? NaN);
        // The header's count, not the DOM's: React Flow renders only what is on screen.
        const m = document.body.innerText.match(/\d+ boxes? at depth \d+( \([^)]*\))?/);
        const note = document.getElementById("zu-notice")?.innerText.split("\n")[0] ?? "";
        return [m ? m[0] : "?", note, at("first-contentful-paint"), at("zu-layout-end"), at("zu-drawn")];
      });
      console.log(`| ${f.split("/").pop()} | ${name} | ${r.join(" | ")} |`);
      await p.close();
    }
  } finally {
    await b.close();
  }
}
