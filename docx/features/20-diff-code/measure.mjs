// Measures Diff Code (20) on real changes: zu diff -html's time (the median
// of three runs) and page, what the page inlines for it, and in each engine
// the page drawn, the panel of the declaration with the longest declaration
// diff opened, a call's lines lit from its row, and the panel of the package
// with the most hunk lines opened, its hunks coloured. A wait in the page
// past a minute is recorded as an error. Not a replay step. Usage, from a zu
// checkout with bin/zu built and web/e2e's npm ci done:
//   node measure.mjs <checkout> <out dir> <repo>:<base> ...
// Each <repo> is a git checkout, measured from <base> to its HEAD. A
// checkout from before 20 has no declaration diff: only its page, its
// declaration's panel (its hunks) and the package are timed.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [root, out, ...changes] = process.argv.slice(2);
const require = createRequire(root + "/web/e2e/package.json");
const { chromium, firefox, webkit } = require("playwright-core");
const RUNS = 3;
const LIMIT = 60000; // ms: a wait in the page past this is recorded as an error, not waited out
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (xs) => (xs.length ? `${Math.round(median(xs))} (${xs.map(Math.round).join(", ")})` : "-");
const dir = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

for (const change of changes) {
  const [repo, base] = change.split(":");
  const page = join(out, `${repo.split("/").pop()}-${base.replaceAll("/", "_")}.html`);
  const secs = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    execFileSync(root + "/bin/zu", ["diff", "-html", page, base, "HEAD"], { cwd: repo, stdio: ["ignore", "ignore", "pipe"] });
    secs.push((performance.now() - t0) / 1000);
  }
  const html = readFileSync(page, "utf8");
  const json = html.slice(html.indexOf(">", html.indexOf('id="zu-data"')) + 1, html.indexOf("</script>", html.indexOf('id="zu-data"')));
  const view = JSON.parse(json);
  const bytes = (x) => Buffer.byteLength(JSON.stringify(x ?? {}));
  const lines = (hs) => hs.reduce((n, h) => n + h.lines.length, 0);
  // decl: the declaration with the longest declaration diff, else (before 20)
  // the changed declaration whose file has the most hunk lines.
  const dd = Object.entries(view.declDiffs ?? {}).map(([id, ds]) => [id, lines(ds)]).sort((a, b) => b[1] - a[1])[0];
  const hunks = view.hunks ?? {};
  const changed = view.nodes.filter((n) => (n.kind === "type" || n.kind === "function") && (n.status || n.movedFrom));
  const decl = dd?.[0] ?? changed.sort((a, b) => lines(hunks[b.loc.path] ?? []) - lines(hunks[a.loc.path] ?? []))[0]?.id;
  // pkg: the package whose directory's hunks have the most lines.
  const pkgs = view.nodes.filter((n) => n.kind === "package" && n.detail);
  const pkgLines = (n) => Object.entries(hunks).filter(([p]) => dir(p) === dir(n.loc.path)).reduce((s, [, hs]) => s + lines(hs), 0);
  const pkg = pkgs.sort((a, b) => pkgLines(b) - pkgLines(a))[0];
  console.log(`${repo} ${base}..HEAD: zu diff -html ${median(secs).toFixed(2)} s (${secs.map((x) => x.toFixed(2)).join(", ")}), ${(statSync(page).size / 1e6).toFixed(2)} MB` +
    ` (sources ${(bytes(view.sources) / 1e6).toFixed(2)}, hunks ${(bytes(view.hunks) / 1e6).toFixed(2)}, declDiffs ${(bytes(view.declDiffs) / 1e6).toFixed(2)} MB)`);
  console.log(`  declaration ${decl}${dd ? `: declaration diff of ${dd[1]} lines` : ""}; package ${pkg?.id}: ${pkg ? pkgLines(pkg) : 0} hunk lines`);
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
    const b = await type.launch();
    const got = { drawn: [], decl: [], lit: [], pkg: [], errors: [] };
    // shown is how long the panel of id takes to draw its first hunk, from
    // the hash change.
    const shown = (p, id) => p.evaluate(async ([id, limit]) => {
      const t = performance.now();
      location.hash = `#s=${encodeURIComponent(id)}`;
      await new Promise((res, rej) => {
        const done = () => document.querySelector("aside.panel pre.hunk");
        if (done()) return res();
        const o = new MutationObserver(() => done() && (o.disconnect(), res()));
        o.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => (o.disconnect(), rej(new Error(`no hunk after ${limit} ms`))), limit);
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t;
    }, [id, LIMIT]);
    // timed records a time, or what kept it from being taken.
    const timed = async (xs, what, run) => {
      try {
        xs.push(await run());
      } catch (e) {
        got.errors.push(`${what}: ${String(e.message ?? e).split("\n")[0].slice(0, 80)}`);
      }
    };
    for (let i = 0; i < RUNS; i++) {
      const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
      p.on("pageerror", (e) => got.errors.push(e.message.slice(0, 80)));
      const t1 = Date.now();
      await p.goto("file://" + page);
      await p.locator(".react-flow__node").first().waitFor({ timeout: 300000 });
      got.drawn.push(Date.now() - t1);
      if (decl) {
        await timed(got.decl, "declaration", () => shown(p, decl));
        const row = p.locator("aside.panel section", { has: p.locator('h3:text-matches("^Calls and embeds out")') }).locator("li").first();
        if (dd && (await row.count())) {
          // The row may sit below the panel's fold, under a long diff and
          // hunks: scrolled to first, so the pointer lands on it.
          await row.scrollIntoViewIfNeeded();
          const box = await row.boundingBox();
          await timed(got.lit, "lit", () => p.evaluate(async ([x, y, limit]) => {
            const at = document.elementFromPoint(x, y);
            if (!at?.closest("aside.panel li")) throw new Error(`the pointer lands on ${at?.tagName ?? "nothing"}, not the row`);
            const t = performance.now();
            const lit = new Promise((res, rej) => {
              const o = new MutationObserver(() => document.querySelector("aside.panel .lit-note")?.textContent?.match(/^(Line|Base|In other|At base)/) && (o.disconnect(), res()));
              o.observe(document.body, { childList: true, subtree: true, characterData: true });
              setTimeout(() => (o.disconnect(), rej(new Error(`no note after ${limit} ms`))), limit);
            });
            at.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
            await lit;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return performance.now() - t;
          }, [box.x + 4, box.y + box.height / 2, LIMIT]));
        }
      }
      await p.close();
      // The package on a page of its own, so nothing before it is drawn.
      if (!pkg) continue;
      const q = await b.newPage({ viewport: { width: 1400, height: 900 } });
      q.on("pageerror", (e) => got.errors.push(e.message.slice(0, 80)));
      await q.goto("file://" + page);
      await q.locator(".react-flow__node").first().waitFor({ timeout: 300000 });
      await timed(got.pkg, "package", () => shown(q, pkg.id));
      await q.close();
    }
    await b.close();
    console.log(`  ${name}: drawn ${fmt(got.drawn)} ms; declaration ${fmt(got.decl)} ms; lit ${fmt(got.lit)} ms; package ${fmt(got.pkg)} ms; page errors ${got.errors.length ? got.errors.join(" | ") : "none"}`);
  }
}
process.exit(0);
