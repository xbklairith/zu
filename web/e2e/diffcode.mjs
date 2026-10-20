// Browser acceptance for Diff Code (20): in a Change View, a changed
// declaration's own diff first, numbered and coloured, in view when its
// panel opens, at its first change, before its file's hunks, coloured too,
// and a removed declaration's text at base, in zu diff -html's page and in zu
// serve -base.
// Not part of make check: it needs browsers and a bin/zu built with the UI.
// Run from web/e2e after `make build`: npm run accept-diff-code.
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const benign = (e) => e.message === "ResizeObserver loop completed with undelivered notifications."; // serve.mjs
const dir = mkdtempSync(join(tmpdir(), "zu-diffcode-"));
const servers = [];
process.on("exit", () => {
  for (const s of servers) s.kill();
  rmSync(dir, { recursive: true, force: true });
});

// page writes the shop's Change View into the built page, as zu diff -html does.
const page = (() => {
  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
  const marker = '<script id="zu-data" type="application/json">{}</script>';
  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
  const v = readFileSync(join(here, "../../internal/export/testdata/shop.change.golden.json"), "utf8");
  const f = join(dir, "change.html");
  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(JSON.parse(v)).replaceAll("<", "\\u003c"))));
  return "file://" + f;
})();

// served: zu serve -base main on a git copy of the shop whose branch makes
// the edits the Change View golden makes (internal/export change_test.go
// changeView), so both pages show the same, and changes Far, which only it
// has.
const repo = join(dir, "shop");
cpSync(join(here, "../../internal/scan/testdata/shop"), repo, { recursive: true });
// farGo is a function longer than its declaration diff's box shows, whose
// change is on its diff's rows 74 and 75.
const farGo = (n) => `package store\n\n// Far is longer than its diff's box.\nfunc Far() int {\n\tn := 0\n${"\tn++\n".repeat(70)}\tn += ${n}\n\treturn n\n}\n`;
writeFileSync(join(repo, "internal/store/far.go"), farGo(1));
const git = (...a) => execFileSync("git", ["-c", "user.name=zu", "-c", "user.email=zu@example.com", ...a], { cwd: repo });
git("init", "-q", "-b", "main");
git("add", "-A");
git("commit", "-q", "-m", "base");
git("checkout", "-q", "-b", "feat");
const edit = (rel, old, repl) => {
  const f = join(repo, rel);
  const s = readFileSync(f, "utf8");
  if (!s.includes(old)) throw new Error(`${rel} has no ${JSON.stringify(old)}`);
  writeFileSync(f, s.replace(old, repl));
};
edit("internal/money/money.go", "func Add(", "func Plus(");
edit("internal/checkout/checkout.go", "sum = Add(sum", "sum = Plus(sum");
edit("main.go", '"example.com/shop/internal/checkout"', '"example.com/shop/internal/checkout"\n\t"example.com/shop/internal/money"');
edit("main.go", "fmt.Println(checkout.Total(nil))", "fmt.Println(checkout.Total(nil), money.Zero)");
edit("internal/store/store.go", "\tr.hook()\n", "\tr.hook()\n\tr.hook()\n");
edit("internal/store/store.go", "// ReadWriter reads and writes orders.\ntype ReadWriter interface {\n\tReader\n\tPut(o Order) error\n}\n", "");
edit("internal/store/store.go", '\n\t"example.com/shop/internal/money"\n', "\n");
edit("internal/store/store.go", "Total money.Cents", "Total int64");
edit("internal/store/store.go", "\t_ = money.Add(o.Total, money.Zero)\n", "");
edit("internal/money/money.go", "package money\n", 'package money\n\nimport "example.com/shop/internal/store"\n\nvar _ store.Order\n');
edit("internal/store/register.go", "func register() { _ = dialect() }", "func register() {\n\t_ = dialect()\n}");
writeFileSync(join(repo, "internal/store/far.go"), farGo(2));
let log = "";
const served = await new Promise((ok, fail) => {
  const s = spawn(join(here, "../../bin/zu"), ["serve", repo, "-base", "main", "-addr", "127.0.0.1:0"], { stdio: ["ignore", "pipe", "pipe"] });
  servers.push(s);
  s.stderr.on("data", (d) => (log += d));
  s.stdout.once("data", (d) => ok(String(d).trim()));
  s.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
});

const S = "example.com/shop/internal/store";
const M = "example.com/shop/internal/money";
const enc = encodeURIComponent;

async function open(b, url) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
  await p.goto(url);
  return { p, errors };
}
// own is what the panel's declaration diffs show: each one's sides, its rows
// as "base|head marker", whether Go is coloured in it and in the file's
// hunks, the panel's section titles in order, and whether it draws the code
// at head.
const own = (p) => p.locator("aside.panel pre.hunk.decl").first().waitFor({ timeout: 10000 }).then(() => p.evaluate(() => {
  const pres = [...document.querySelectorAll("aside.panel pre.hunk.decl")];
  const row = (d) => {
    const [b, h] = d.querySelectorAll(".ln");
    return `${b.textContent}|${h.textContent}${d.textContent.slice(b.textContent.length + h.textContent.length)[0]}`;
  };
  return {
    at: [...document.querySelectorAll("aside.panel .decl-at")].map((e) => e.textContent),
    rows: pres.map((pre) => [...pre.children].map(row)),
    kw: [document.querySelector("aside.panel pre.hunk.decl .kw")?.textContent, document.querySelector("aside.panel pre.hunk:not(.decl) .kw")?.textContent],
    order: [...document.querySelectorAll("aside.panel section > h3")].map((h) => h.textContent.replace(/ \(\d+\)$/, "").replace(/ · on the host$/, "")),
    code: document.querySelector("aside.panel pre.source") !== null,
  };
}));
const settle = (p) => p.waitForTimeout(300);

// modified: Get's own diff first, then its file's hunks, then its rows and
// its code at head.
async function modified(b, url) {
  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
  const first = await own(p);
  await p.close();
  return { got: [first.at, first.rows, first.kw, first.order, first.code], errors };
}

// top: Get's panel opens at its top, its own diff in view. Only the code
// scrolls, to Get's line: drawn last, it is the panel's longest part.
async function top(b, url) {
  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
  await own(p);
  await p.locator("aside.panel pre.source .hit").waitFor({ timeout: 10000 });
  await settle(p);
  const got = await p.evaluate(() => {
    const [panel, diff, code] = ["aside.panel", "aside.panel pre.hunk.decl", "aside.panel pre.source"].map((s) => document.querySelector(s));
    const [a, d, c, h] = [panel, diff, code, code.querySelector(".hit")].map((e) => e.getBoundingClientRect());
    return [panel.scrollTop, d.top >= a.top && d.bottom <= a.bottom, code.scrollTop > 0 && h.top >= c.top && h.bottom <= c.bottom];
  });
  await p.close();
  return { got, errors };
}

// removed: ReadWriter's text at base, and no code. The tree draws no
// unchanged neighbour, so its panel lists no row (18).
async function removed(b, url) {
  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.ReadWriter`)}`);
  const first = await own(p);
  const rows = await p.locator("aside.panel li").count();
  await p.close();
  return { got: [first.at, first.rows, first.code, rows], errors };
}

// moved: a Move's diff is its source's text at base against its own.
async function moved(b, url) {
  const { p, errors } = await open(b, `${url}#f=${enc(M)}&s=${enc(`${M}.Plus`)}`);
  const first = await own(p);
  await p.close();
  return { got: [first.at, first.rows], errors };
}

// far (zu serve only): Far's diff opens scrolled to its change, which lies
// below the rows its box shows from its top; the panel stays at its top.
async function far(b, url) {
  const { p, errors } = await open(b, `${url}#f=${enc(S)}&s=${enc(`${S}.Far`)}`);
  await own(p);
  await settle(p);
  const got = await p.evaluate(() => {
    const [panel, diff] = ["aside.panel", "aside.panel pre.hunk.decl"].map((s) => document.querySelector(s));
    const d = diff.getBoundingClientRect();
    const seen = [...diff.querySelectorAll(".add, .del")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= d.top && r.bottom <= d.bottom;
    });
    return [panel.scrollTop, diff.scrollTop > 0, seen.length];
  });
  await p.close();
  return { got, errors };
}

const GET = ["base internal/store/store.go:42–49 → head internal/store/store.go:36–44"];
const GET_ROWS = [["42|36 ", "43|37 ", "44|38 ", "45|39 ", "46|40 ", "47|41 ", "|42+", "48|43 ", "49|44 "]];
const SECTIONS = ["Declaration diff", "Changes in internal/store/store.go", "Calls and embeds out", "Called or embedded by"];
const want = {
  modified: [GET, GET_ROWS, ["func", "type"], SECTIONS, true],
  top: [0, true, true],
  removed: [["base internal/store/store.go:18–22"], [["18|-", "19|-", "20|-", "21|-", "22|-"]], false, 0],
  moved: [["base internal/money/money.go:13–14 → head internal/money/money.go:17–18"], [["13|17 ", "14|-", "|18+"]]],
};
for (const k of Object.keys(want)) want[`served ${k}`] = want[k]; // zu serve -base: the branch's change
want["served far"] = [0, true, 2];
want.errors = [];
const parts = { modified, top, removed, moved };
// Each part on its own, so one that fails hides no other: on both pages,
// then far on zu serve's.
const runs = [...Object.entries(parts).flatMap(([k, run]) => [[k, run, page], [`served ${k}`, run, served]]), ["served far", far, served]];
const channel = process.env.ZU_E2E_CHANNEL;
const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
let failed = 0;
for (const [name, type, opts] of engines) {
  const b = await type.launch(opts);
  const got = { errors: [] };
  for (const [key, run, url] of runs) {
    const x = await run(b, url).catch((e) => ({ errors: [`${key}: ${String(e.message ?? e).split("\n")[0]}`] }));
    got[key] = x.got;
    got.errors.push(...x.errors);
  }
  await b.close().catch(() => {});
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
