// Measures zu serve's watch for 13's acceptance on a writable copy of a Go
// tree: the CPU an idle zu serve spends over 30 s, and write → drawn, the time
// from saving a file to its new function being on the page, in chromium.
// Each round renames the function in one file the page shows, so the edit
// path is measured: no new file, no relist. The file is removed at the end.
// Usage, from the repo root after `make build` and `npm ci` in web/e2e:
//   node docx/features/13-watch/measure.mjs TREE PKGDIR [POLL] [ROUNDS]
// e.g. TREE a copy of kubernetes, PKGDIR pkg/util/env, POLL 1s, ROUNDS 11.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "../../../web/e2e/node_modules/playwright-core/index.mjs";

const [tree, rel, poll = "1s", rounds = "11"] = process.argv.slice(2);
const bin = new URL("../../../bin/zu", import.meta.url).pathname;
const file = join(tree, rel, "zzwatch.go");
const name = rel.split("/").at(-1);
const mod = readFileSync(join(tree, "go.mod"), "utf8").match(/^module\s+(\S+)/m)[1];
const pkg = `${mod}/${rel}`;
writeFileSync(file, `package ${name}\n\nfunc Zz0() {}\n`);
const zu = spawn(bin, ["serve", tree, "-addr", "127.0.0.1:0", "-include", "./" + rel, "-poll", poll], {
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
zu.stderr.on("data", (d) => (log += d));
process.on("exit", () => {
  zu.kill();
  rmSync(file, { force: true });
});
const url = await new Promise((ok) => zu.stdout.once("data", (d) => ok(String(d).trim())));
const cpu = () => {
  const [m, s] = execFileSync("ps", ["-o", "time=", "-p", String(zu.pid)], { encoding: "utf8" }).trim().split(":");
  return Number(m) * 60 + Number(s);
};
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`${url}#f=${pkg}`);
await p.locator(`.react-flow__node[data-id="${pkg}.Zz0"]`).waitFor({ timeout: 120000 });
await p.waitForTimeout(3000);
const c0 = cpu();
await p.waitForTimeout(30000);
const idle = (cpu() - c0) / 30;
const times = [];
for (let i = 1; i <= Number(rounds); i++) {
  // The page notes when the node is in the DOM: Playwright's own polling
  // backs off to 500 ms and would round the times up.
  await p.evaluate((sel) => {
    window.zuSeen = new Promise((ok) => {
      const o = new MutationObserver(() => {
        if (document.querySelector(sel)) ok(Date.now(), o.disconnect());
      });
      o.observe(document.body, { subtree: true, childList: true });
    });
  }, `.react-flow__node[data-id="${pkg}.Zz${i}"]`);
  const t0 = Date.now();
  writeFileSync(file, `package ${name}\n\nfunc Zz${i}() {}\n`);
  times.push((await p.evaluate(() => window.zuSeen)) - t0);
  await p.waitForTimeout(1300 + 137 * i); // vary the write's phase against the poll
}
await b.close();
const s = [...times].sort((x, y) => x - y);
console.log(`poll ${poll}: idle ${(100 * idle).toFixed(1)}% of one core`);
console.log(`write → drawn ms: ${times.join(" ")} | min ${s[0]} median ${s[s.length >> 1]} max ${s.at(-1)}`);
// A rescan of a second or more prints as seconds ("1.023s"), not ms.
const scans = [...log.matchAll(/watch: scanned in ([\d.]+)(ms|s):/g)].map((m) => Math.round(Number(m[1]) * (m[2] === "s" ? 1000 : 1)));
console.log(`watch rescans ms: min ${Math.min(...scans)} max ${Math.max(...scans)} (${scans.length})`);
process.exit(0);
