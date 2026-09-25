// Measures zu serve -base for 14's acceptance on a writable copy of a Go
// tree, as 13's measure.mjs measures the Project View: start (spawn → URL,
// which scans head and the merge-base), first drawn, write → drawn in
// chromium, the watch's rescans and the resident memory at the end. Each
// round renames the function in one file of a package the page shows.
// MODE dirty leaves each write uncommitted: head is dirty, so no host diff
// is read. MODE clean commits each write and points a remote-tracking ref
// at it, as a push and fetch would, so head is clean and on the "host":
// git diff runs and DiffLinks places each link, and a round also times
// write → a view.json whose Zz node has its compare-page link. The copy's
// own history takes those commits; use a copy you delete after.
// Usage, from the repo root after `make build` and `npm ci` in web/e2e:
//   node docx/features/14-review-links/measure.mjs TREE PKGDIR BASE MODE [POLL] [ROUNDS]
// e.g. TREE a cp -cRp copy of kubernetes, PKGDIR pkg/util/env, BASE the
// full sha of HEAD~50 (a relative ref would move with each commit, and
// the base would be rescanned every round), MODE clean.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "../../../web/e2e/node_modules/playwright-core/index.mjs";

const [tree, rel, base, mode, poll = "1s", rounds = "11"] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(base ?? "") || !["dirty", "clean"].includes(mode)) {
  console.error("usage: measure.mjs TREE PKGDIR BASE-SHA dirty|clean [POLL] [ROUNDS]");
  process.exit(3);
}
const bin = new URL("../../../bin/zu", import.meta.url).pathname;
const file = join(tree, rel, "zzwatch.go");
const name = rel.split("/").at(-1);
const mod = readFileSync(join(tree, "go.mod"), "utf8").match(/^module\s+(\S+)/m)[1];
const pkg = `${mod}/${rel}`;
const git = (...a) => execFileSync("git", ["-C", tree, "-c", "user.name=zu", "-c", "user.email=zu@example.com", ...a]);
let zu;
let log = "";
// Stopped however the run ends: finished, failed, timed out or interrupted.
process.on("exit", () => {
  zu?.kill();
  if (mode === "dirty") rmSync(file, { force: true });
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
const fail = (why) => {
  console.error(`measure: ${why}\n${log.slice(-2000)}`);
  process.exit(2);
};
setTimeout(() => fail("timed out after 15 min"), 15 * 60 * 1000).unref();
const within = (ms, what, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms} ms`)), ms))]);

function save(i) {
  writeFileSync(file, `package ${name}\n\nfunc Zz${i}() {}\n`);
  if (mode === "clean") {
    git("add", "--", join(rel, "zzwatch.go"));
    git("commit", "-q", "--no-verify", "-m", `zz ${i}`);
    git("update-ref", "refs/remotes/origin/zu-measure", "HEAD"); // "pushed and fetched"
  }
}

try {
  save(0);
  const t0 = Date.now();
  zu = spawn(bin, ["serve", tree, "-addr", "127.0.0.1:0", "-base", base, "-poll", poll], { stdio: ["ignore", "pipe", "pipe"] });
  zu.stderr.on("data", (d) => (log += d));
  const url = await within(
    120000,
    "zu serve start",
    new Promise((ok, no) => {
      zu.stdout.once("data", (d) => ok(String(d).trim()));
      zu.once("exit", (code) => no(new Error(`zu serve exited ${code}`)));
    }),
  );
  const started = Date.now() - t0;
  // ?latest is the watch's last View, read without a scan of its own.
  const view = async () => (await within(60000, "view.json", fetch(url + "view.json?latest"))).text();
  const linked = (json, i) => JSON.parse(json).links?.nodes?.[`${pkg}.Zz${i}`] !== undefined;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const t1 = Date.now();
  await p.goto(`${url}#f=${pkg}`);
  await p.locator(`.react-flow__node[data-id="${pkg}.Zz0"]`).waitFor({ timeout: 120000 });
  const drawn = Date.now() - t1;
  const first = await view();
  if (mode === "clean" && !linked(first, 0)) fail("clean head, yet Zz0 has no host link");
  await p.waitForTimeout(3000);
  const times = [];
  const linkTimes = [];
  for (let i = 1; i <= Number(rounds); i++) {
    await p.evaluate((sel) => {
      window.zuSeen = new Promise((ok) => {
        const o = new MutationObserver(() => {
          if (document.querySelector(sel)) ok(Date.now(), o.disconnect());
        });
        o.observe(document.body, { subtree: true, childList: true });
      });
    }, `.react-flow__node[data-id="${pkg}.Zz${i}"]`);
    const w = Date.now();
    save(i);
    times.push((await within(60000, `round ${i} drawn`, p.evaluate(() => window.zuSeen))) - w);
    if (mode === "clean") {
      for (;;) {
        if (linked(await view(), i)) break;
        if (Date.now() - w > 60000) fail(`round ${i}: no host link for Zz${i} in 60 s`);
        await p.waitForTimeout(250);
      }
      linkTimes.push(Date.now() - w);
    }
    await p.waitForTimeout(1300 + 137 * i); // vary the write's phase against the poll
  }
  await b.close();
  const rss = Number(execFileSync("ps", ["-o", "rss=", "-p", String(zu.pid)], { encoding: "utf8" }).trim()) / 1024;
  const stats = (xs) => {
    const s = [...xs].sort((x, y) => x - y);
    return `${xs.join(" ")} | min ${s[0]} median ${s[s.length >> 1]} max ${s.at(-1)}`;
  };
  console.log(`${mode}: start ${started} ms (URL printed) · first drawn ${drawn} ms · view.json ${(first.length / 1e6).toFixed(1)} MB · RSS ${rss.toFixed(0)} MB`);
  console.log(`write → drawn ms: ${stats(times)}`);
  if (mode === "clean") console.log(`write → view.json links it ms: ${stats(linkTimes)}`);
  const scans = [...log.matchAll(/watch: scanned in ([\d.]+)(ms|s):/g)].map((m) => Math.round(Number(m[1]) * (m[2] === "s" ? 1000 : 1)));
  console.log(`watch rescans ms: min ${Math.min(...scans)} max ${Math.max(...scans)} (${scans.length})`);
  console.log(process.env.ZU_LOG ? log : log.split("\n")[0]);
  process.exit(0);
} catch (e) {
  fail(e.message);
}
