// Measures zu serve's rescans for 16 on a writable copy of a Go tree, as
// 13's and 14's measure.mjs do: start (spawn → URL), first drawn, write →
// drawn in chromium, every watch rescan and every page-load scan zu reports,
// and the resident memory at the end. Each round writes one new function
// into PKGDIR/zzwatch.go. BASE "-" serves the Project View; a full sha
// serves the Change View against it. MODE dirty leaves each write
// uncommitted; MODE clean commits it and points a remote-tracking ref at it,
// as a push and fetch would, and passes -mr 1 so zu reads git's diff and
// places each link (a GitHub compare of more than 20 commits gets no line
// links without -mr, 14b). The copy's own history takes those commits; use
// a copy you delete after. With BASE "-", PKGDIR must be a package small
// enough that the Project View draws its declarations when it is the focus
// (pkg/util/env, not pkg/kubelet, whose own declarations stay folded).
// PKGDIR's import path comes from the nearest go.mod above it, so a staging
// package works (staging/src/k8s.io/apimachinery/pkg/util/sets, 347
// importers). With NEWPKG=1 each round instead adds a new package,
// PKGDIR/zznewN, which nothing imports: from 16's Task 7 on, a rescan
// assembles that package alone (before it, every package). With NEWPKG=1
// or WAIT=scan, rounds wait for the watch's rescan rather than for a
// drawing, and print no write → drawn: WAIT=scan serves a package whose
// declarations the Project View leaves folded (util/sets). Each run checks
// it saw one watch rescan per round.
// Usage, from the repo root after `make build` and `npm ci` in web/e2e:
//   [NEWPKG=1] [WAIT=scan] node docx/features/16-fast-rescan/measure.mjs TREE PKGDIR BASE|- dirty|clean [POLL] [ROUNDS]
import { execFileSync, spawn } from "node:child_process";
import { loadavg } from "node:os";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { chromium } from "../../../web/e2e/node_modules/playwright-core/index.mjs";

// --selftest checks ms() alone.
if (process.argv[2] === "--selftest") {
  for (const [d, want] of [["850ms", 850], ["1.023s", 1023], ["1m2.5s", 62500], ["0s", 0], ["2s", 2000]]) {
    if (ms(d) !== want) (console.error(`ms(${d}) = ${ms(d)}, want ${want}`), process.exit(1));
  }
  for (const [xs, want] of [[[3, 1, 2], 2], [[4, 1, 3, 2], 2.5], [[7], 7]]) {
    if (median(xs) !== want) (console.error(`median(${xs}) = ${median(xs)}, want ${want}`), process.exit(1));
  }
  console.log("ms, median: ok");
  process.exit(0);
}

const [tree, rel, base, mode, poll = "1s", rounds = "11"] = process.argv.slice(2);
if (!(base === "-" || /^[0-9a-f]{40}$/.test(base ?? "")) || !["dirty", "clean"].includes(mode)) {
  console.error("usage: measure.mjs TREE PKGDIR BASE-SHA|- dirty|clean [POLL] [ROUNDS]");
  process.exit(3);
}
const bin = new URL("../../../bin/zu", import.meta.url).pathname;
const newpkg = process.env.NEWPKG === "1";
const byScan = newpkg || process.env.WAIT === "scan";
const file = join(tree, rel, "zzwatch.go");
const name = rel.split("/").at(-1);
let modDir = join(tree, rel);
while (!existsSync(join(modDir, "go.mod"))) modDir = dirname(modDir);
const mod = readFileSync(join(modDir, "go.mod"), "utf8").match(/^module\s+(\S+)/m)[1];
const pkg = [mod, relative(modDir, join(tree, rel))].filter(Boolean).join("/");
const added = []; // NEWPKG's package directories, relative to tree
const git = (...a) => execFileSync("git", ["-C", tree, "-c", "user.name=zu", "-c", "user.email=zu@example.com", ...a]);
let zu;
let log = "";
process.on("exit", () => {
  zu?.kill();
  if (mode === "dirty") rmSync(file, { force: true });
  if (mode === "dirty") for (const d of added) rmSync(join(tree, d), { recursive: true, force: true });
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
const fail = (why) => {
  console.error(`measure: ${why}\n${log.slice(-2000)}`);
  process.exit(2);
};
setTimeout(() => fail("timed out after 15 min"), 15 * 60 * 1000).unref();
const within = (ms, what, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms} ms`)), ms))]);

// ms parses a Go time.Duration as zu prints it, rounded to the millisecond:
// "850ms", "1.023s", "1m2.5s", "0s".
export function ms(d) {
  const re = /(\d+(?:\.\d+)?)(h|m(?!s)|s|ms|µs|us|ns)/gy;
  const unit = { h: 3600e3, m: 60e3, s: 1e3, ms: 1, µs: 1e-3, us: 1e-3, ns: 1e-6 };
  let total = 0;
  let m;
  let end = 0;
  while ((m = re.exec(d))) {
    total += Number(m[1]) * unit[m[2]];
    end = re.lastIndex;
  }
  if (end === 0 || end !== d.length) throw new Error(`not a duration: ${d}`);
  return Math.round(total);
}
// median is the middle value, or the mean of the two middle values.
export function median(xs) {
  const s = [...xs].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
// scans are the durations zu serve printed, the watch's ("watch: scanned
// in") or a page load's ("zu serve: scanned in").
const scans = (watch) =>
  [...log.matchAll(/zu serve: (watch: )?scanned in (\S+):/g)].filter((m) => Boolean(m[1]) === watch).map((m) => ms(m[2]));

function save(i) {
  let path = join(rel, "zzwatch.go");
  if (newpkg && i > 0) {
    path = join(rel, `zznew${i}`, "zz.go");
    added.push(dirname(path));
    mkdirSync(join(tree, dirname(path)), { recursive: true });
    writeFileSync(join(tree, path), `package zznew${i}\n\n// run ${process.pid}\nfunc Zz() {}\n`);
  } else {
    writeFileSync(file, `package ${name}\n\n// run ${process.pid}\nfunc Zz${i}() {}\n`); // the pid: a clean run commits even when an earlier run left Zz0
  }
  if (mode === "clean") {
    git("add", "--", path);
    git("commit", "-q", "--no-verify", "-m", `zz ${i}`);
    git("update-ref", "refs/remotes/origin/zu-measure", "HEAD");
  }
}

try {
  const load = loadavg().map((x) => x.toFixed(2)).join(" / ");
  save(0);
  const args = ["serve", tree, "-addr", "127.0.0.1:0", "-poll", poll];
  if (base !== "-") args.push("-base", base);
  if (base !== "-" && mode === "clean") args.push("-mr", "1");
  if (base === "-") args.push("-include", pkg); // an import path: "./" would mean the root module only
  const t0 = Date.now();
  zu = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
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
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const t1 = Date.now();
  await p.goto(`${url}#f=${pkg}`);
  await p.locator(byScan ? ".react-flow__node" : `.react-flow__node[data-id="${pkg}.Zz0"]`).first().waitFor({ timeout: 120000 });
  const drawn = Date.now() - t1;
  await p.waitForTimeout(3000);
  const times = [];
  const settled = scans(true).length;
  for (let i = 1; i <= Number(rounds); i++) {
    if (byScan) {
      save(i);
      const until = Date.now() + 60000;
      while (scans(true).length < settled + i) {
        if (Date.now() > until) throw new Error(`round ${i}: no watch rescan in 60 s`);
        await p.waitForTimeout(50);
      }
      await p.waitForTimeout(1300 + 137 * i);
      continue;
    }
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
    await p.waitForTimeout(1300 + 137 * i); // vary the write's phase against the poll
  }
  await b.close();
  const rss = Number(execFileSync("ps", ["-o", "rss=", "-p", String(zu.pid)], { encoding: "utf8" }).trim()) / 1024;
  const stats = (xs) => {
    const s = [...xs].sort((x, y) => x - y);
    return `${xs.join(" ")} | min ${s[0]} median ${median(xs)} max ${s.at(-1)}`;
  };
  // One watch rescan per round: a save and its commit that straddle two polls
  // give a second, cheaper rescan (HEAD only), which pulls the median down.
  const watch = scans(true);
  if (watch.length !== Number(rounds)) console.log(`measure: WARNING ${watch.length} watch rescans for ${rounds} rounds`);
  console.log(`${base === "-" ? "project" : "change"} ${mode}: load ${load} · start ${started} ms · first drawn ${drawn} ms · RSS ${rss.toFixed(0)} MB`);
  console.log(`page-load scans ms: ${scans(false).join(" ")}`);
  console.log(`watch rescans ms (${watch.length} for ${rounds} rounds): ${stats(watch)}`);
  if (!byScan) console.log(`write → drawn ms: ${stats(times)}`);
  process.exit(0);
} catch (e) {
  fail(e.message);
}
