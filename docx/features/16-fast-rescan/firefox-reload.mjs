// Reproduces 08's Firefox reload crash without zu (16). A page starts a Web
// Worker from a blob: URL, as zu's page starts ELK's, and is reloaded as soon
// as it has loaded, as accept.mjs used to do. Three arms, N reloads each:
//   big-now    a 1.5 MB worker script (ELK's size), reloaded at once
//   big-after  the same, reloaded once the worker has answered
//   small-now  a 200-byte worker script, reloaded at once
// Only big-now crashes: Firefox kills the page when a reload lands while a
// large blob worker script is still loading.
// Usage, after `npm ci && npm run browsers` in web/e2e:
//   node docx/features/16-fast-rescan/firefox-reload.mjs [N]
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firefox } from "../../../web/e2e/node_modules/playwright-core/index.mjs";

const n = Number(process.argv[2] ?? 100);
const dir = mkdtempSync(join(tmpdir(), "zu-ff-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const page = (pad) => `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; worker-src blob:;">
<div id="s">start</div><script>
const src = "${pad}onmessage = () => { const a = []; const t = Date.now(); while (Date.now() - t < 300) a.push(new Array(1000).fill(Math.random())); postMessage(a.length); }";
const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
w.onmessage = (e) => { document.getElementById("s").textContent = "done " + e.data; };
w.postMessage(0);
</script>`;
writeFileSync(join(dir, "big.html"), page("/*" + "x".repeat(1_500_000) + "*/"));
writeFileSync(join(dir, "small.html"), page(""));

const b = await firefox.launch();
for (const [arm, file, wait] of [["big-now", "big.html", false], ["big-after", "big.html", true], ["small-now", "small.html", false]]) {
  let crashed = 0;
  for (let i = 0; i < n; i++) {
    const p = await b.newPage();
    const done = () => p.locator("#s", { hasText: "done" }).waitFor({ timeout: 15000 });
    try {
      await p.goto("file://" + join(dir, file));
      if (wait) await done();
      await p.reload();
      await done();
    } catch (e) {
      if (!/crash/i.test(String(e.message))) throw e;
      crashed++;
    }
    await p.close().catch(() => {});
  }
  console.log(`firefox ${b.version()} ${arm}: ${crashed}/${n} reloads crashed the page`);
}
await b.close().catch(() => {});
