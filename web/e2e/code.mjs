// Browser acceptance for the Code panel (19): Go coloured, the lines behind
// a pointed-at call or embed lit, in the tree's panel and the Screen's, and
// zu serve without -include drawing every package, sending its source on
// demand, keeping the code where the reader left it across a watch redraw,
// showing a save the View does not show, and drawing a long file's lines
// around the marked one, or the lit one.
// Not part of make check: it needs browsers and a bin/zu built with the UI.
// Run from web/e2e after `make build`: npm run accept-code.
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const benign = (e) => e.message === "ResizeObserver loop completed with undelivered notifications."; // serve.mjs
const dir = mkdtempSync(join(tmpdir(), "zu-code-"));
const servers = [];
process.on("exit", () => {
  for (const s of servers) s.kill();
  rmSync(dir, { recursive: true, force: true });
});

// page writes the shop's View into the built page, as zu scan -html does.
const page = (() => {
  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
  const marker = '<script id="zu-data" type="application/json">{}</script>';
  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
  const v = readFileSync(join(here, "../../internal/export/testdata/shop.view.golden.json"), "utf8");
  const f = join(dir, "shop.html");
  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(JSON.parse(v)).replaceAll("<", "\\u003c"))));
  return "file://" + f;
})();

// served: zu serve on a copy of the shop, without -include. Outside git its
// watch rescans every file at its first poll, and a page drawn before then
// reads its files once more: the parts before serve() outlast that poll, so
// serve()'s page asks for store.go twice, not three times.
const shop = join(dir, "shop");
cpSync(join(here, "../../internal/scan/testdata/shop"), shop, { recursive: true });
let log = "";
const served = await new Promise((ok, fail) => {
  const s = spawn(join(here, "../../bin/zu"), ["serve", shop, "-addr", "127.0.0.1:0"], { stdio: ["ignore", "pipe", "pipe"] });
  servers.push(s);
  s.stderr.on("data", (d) => (log += d));
  s.stdout.once("data", (d) => ok(String(d).trim()));
  s.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
});

const S = "example.com/shop/internal/store";
const C = "example.com/shop/internal/checkout";
const enc = encodeURIComponent;

async function open(b, url) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
  const asked = [];
  p.on("request", (r) => r.url().includes("/source?") && asked.push(new URL(r.url()).search));
  await p.goto(url);
  return { p, errors, asked };
}
// code is what the panel's code shows: its marked line, the first token of
// that line and its class, the numbers of its lit lines, and the note over it.
const code = (p) => p.locator("aside.panel pre.source .hit").waitFor({ timeout: 30000 }).then(() => p.evaluate(() => {
  const hit = document.querySelector("aside.panel pre.source .hit");
  const first = hit.querySelector(".ln + span");
  return {
    hit: hit.textContent, first: [first?.textContent, first?.className],
    lit: [...document.querySelectorAll("aside.panel pre.source .lit .ln")].map((e) => e.textContent),
    note: document.querySelector("aside.panel .lit-note")?.textContent ?? null,
    kinds: ["kw", "com", "str"].map((c) => document.querySelectorAll(`aside.panel pre.source .${c}`).length > 0),
  };
}));
const row = (p, title, id) => p.locator("aside.panel section", { has: p.locator(`h3:text-matches("^${title}")`) }).locator("li", { hasText: id });
const settle = (p) => p.waitForTimeout(300);
const HINT = "Point at a call or embed to light the lines it is written on.";

// tree: the tree's panel for a method, coloured, its call lit by pointing and by focus.
async function tree(b) {
  const { p, errors } = await open(b, `${page}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
  const got = {};
  const first = await code(p);
  got.coloured = [first.hit.startsWith("43func (r *Repo) Get("), first.first, first.kinds, first.note];
  const aside = () => p.evaluate(() => document.querySelector("aside.panel").scrollTop);
  const before = await aside();
  await row(p, "Calls and embeds out", "Repo.check").hover();
  await settle(p);
  const pointed = await code(p);
  got.pointed = [pointed.lit, pointed.note, (await aside()) === before];
  await p.mouse.move(5, 5);
  await settle(p);
  got.left = (await code(p)).lit;
  await row(p, "Calls and embeds out", "Repo.check").locator("button").focus();
  await settle(p);
  got.focused = (await code(p)).lit;
  // Enter follows the row, which goes without a blur; back at Get, nothing
  // is pointed at, so nothing is lit.
  await p.keyboard.press("Enter");
  await p.locator("aside.panel pre.source .hit", { hasText: /^51func/ }).waitFor({ timeout: 30000 });
  await p.evaluate((h) => (location.hash = h), `#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
  await p.locator("aside.panel pre.source .hit", { hasText: /^43func/ }).waitFor({ timeout: 30000 });
  await settle(p);
  const back = await code(p);
  got.back = [back.lit, back.note];
  // A caller in another file: listed, nothing lit here.
  await p.goto(`${page}#f=${enc(S)}&s=${enc(`${S}.register`)}`);
  await code(p);
  await row(p, "Called or embedded by", `${S}.init`).hover();
  await settle(p);
  const other = await code(p);
  got.other = [other.lit, other.note];
  await p.close();
  return { got, errors };
}

// screen: the Screen's panel lights the lines behind the box pointed at, or
// focused, and behind its line.
async function screen(b) {
  const { p, errors } = await open(b, `${page}#s=${enc(`${S}.Repo`)}&c=${enc(`${S}.Repo`)}`);
  const got = {};
  const first = await code(p);
  const box = p.locator(`.screen .react-flow__node[data-id="${`down:${S}.Open`}"]`);
  await box.hover();
  await settle(p);
  const pointed = await code(p);
  await p.mouse.move(5, 5);
  await settle(p);
  const left = await code(p);
  await box.focus();
  await settle(p);
  const focused = await code(p);
  await p.evaluate(() => document.activeElement?.blur());
  await p.locator(`.screen .react-flow__edge[data-id="${`>down:${S}.Open`}"]`).hover();
  await settle(p);
  got.screen = [first.hit.startsWith("31type Repo struct"), pointed.lit, pointed.note, left.lit, focused.lit, (await code(p)).lit];
  await p.close();
  return { got, errors };
}

// serve: zu serve without -include draws every package's declarations and
// sends each file's source when its panel opens.
async function serve(b) {
  const { p, errors, asked } = await open(b, `${served}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
  const got = {};
  const first = await code(p);
  // 13: a save elsewhere redraws in place. The page reads store.go again, and
  // the code and the panel stay where the reader scrolled them: to the top.
  const scrolls = () => p.evaluate(() => [document.querySelector("aside.panel pre.source").scrollTop, document.querySelector("aside.panel").scrollTop]);
  const opened = await scrolls();
  await p.evaluate(() => {
    document.querySelector("aside.panel pre.source").scrollTop = 0;
    document.querySelector("aside.panel").scrollTop = 0;
  });
  const name = b.browserType().name(); // the engines share the copy
  writeFileSync(join(shop, "internal", "store", `kept${name}.go`), `package store\n\nfunc Kept${name}() {}\n`);
  await p.locator(`.react-flow__node[data-id="${S}.Kept${name}"]`).waitFor({ timeout: 15000 });
  await settle(p);
  got.kept = [opened[0] + opened[1] > 0, await scrolls()];
  await row(p, "Calls and embeds out", "Repo.check").hover();
  await settle(p);
  const pointed = await code(p);
  await p.goto(`${served}#f=${enc(C)}&s=${enc(`${C}.Total`)}`);
  const total = await code(p);
  got.served = [first.hit.startsWith("43func (r *Repo) Get("), first.first, pointed.lit, total.hit.startsWith("22func Total("), asked];
  await p.close();
  return { got, errors };
}

// saved: a save the View does not show, here a comment, publishes no View;
// the page reads the file again, and its code shows the save.
async function saved(b) {
  const { p, errors } = await open(b, `${served}#f=${enc(S)}&s=${enc(`${S}.Repo.Get`)}`);
  await code(p);
  const latest = [];
  p.on("request", (r) => r.url().includes("view.json?latest") && latest.push(r.url()));
  const name = b.browserType().name(); // the engines share the copy
  const f = join(shop, "internal", "store", "store.go");
  writeFileSync(f, readFileSync(f, "utf8").replace(/\to := r\.cache\[id\].*\n/, `\to := r.cache[id] // saved by ${name}\n`));
  const shown = await p.locator("aside.panel pre.source", { hasText: `saved by ${name}` }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  await p.close();
  return { got: { saved: [shown, latest.length] }, errors };
}

// longGo is a file longer than the panel draws (Code, CODE_LINES 5000), of
// 6010 lines: Long's body runs from line 3 to 6006, calling longB on line
// 6005; longB is on line 6009.
const longGo = (n) => `package store\n\nfunc Long${n}() {\n\tlongA${n}()\n${"\n".repeat(6000)}\tlongB${n}()\n}\n\nfunc longA${n}() {}\nfunc longB${n}() {}\n`;
// drawn is what the panel's code draws: how many lines, the first one's
// number, the marked line, the lit lines' numbers, and the note on which
// lines they are.
const drawn = (p) => p.evaluate(() => {
  const pre = document.querySelector("aside.panel pre.source");
  return {
    n: pre.children.length, first: pre.querySelector(".ln").textContent, hit: pre.querySelector(".hit")?.textContent ?? null,
    lit: [...pre.querySelectorAll(".lit .ln")].map((e) => e.textContent),
    note: document.querySelector("aside.panel .window-note")?.textContent ?? null,
  };
});

// long: of a long file the panel draws the lines around the marked one, and
// says which. Pointing at a call written past them moves them to it, and
// they stay when the pointer leaves.
async function long(b) {
  const { p, errors } = await open(b, `${served}#f=${enc(S)}`);
  const got = {};
  await p.locator(".react-flow__node").first().waitFor({ timeout: 15000 });
  const name = b.browserType().name(); // the engines share the copy
  writeFileSync(join(shop, "internal", "store", `long${name}.go`), longGo(name));
  await p.locator(`.react-flow__node[data-id="${S}.longB${name}"]`).waitFor({ timeout: 15000 });
  await p.goto(`${served}#f=${enc(S)}&s=${enc(`${S}.longB${name}`)}`);
  await p.locator("aside.panel pre.source .hit").waitFor({ timeout: 30000 });
  const end = await drawn(p);
  got.long = [end.n, end.first, end.hit.startsWith(`6009func longB${name}()`), end.note];
  await p.goto(`${served}#f=${enc(S)}&s=${enc(`${S}.Long${name}`)}`);
  await p.locator("aside.panel pre.source .hit", { hasText: new RegExp(`^3func Long${name}\\(`) }).waitFor({ timeout: 30000 });
  const top = await drawn(p);
  await row(p, "Calls and embeds out", `longB${name}`).hover();
  await settle(p);
  const pointed = await drawn(p);
  await p.mouse.move(5, 5);
  await settle(p);
  const left = await drawn(p);
  got.moved = [top.note, pointed.lit, pointed.note, left.lit, left.note];
  await p.close();
  return { got, errors };
}

const want = {
  coloured: [true, ["func", "kw"], [true, true, true], HINT],
  pointed: [["48"], "Line 48.", true],
  left: [],
  focused: ["48"],
  back: [[], HINT],
  other: [[], "In other files: internal/store/db_linux.go:7."],
  screen: [true, ["58"], "Line 58.", [], ["58"], ["58"]],
  served: [true, ["func", "kw"], ["48"], true, ["?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fstore%2Fstore.go", "?path=internal%2Fcheckout%2Fcheckout.go"]],
  kept: [true, [0, 0]],
  saved: [true, 0],
  long: [5000, "1011", true, "Lines 1011–6010 of 6010."],
  moved: ["Lines 1–5000 of 6010.", ["6005"], "Lines 1011–6010 of 6010.", [], "Lines 1011–6010 of 6010."],
  errors: [],
};
const channel = process.env.ZU_E2E_CHANNEL;
const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
let failed = 0;
for (const [name, type, opts] of engines) {
  const b = await type.launch(opts);
  const got = await (async () => {
    const parts = [await tree(b), await screen(b), await serve(b), await saved(b), await long(b)];
    return { ...Object.assign({}, ...parts.map((x) => x.got)), errors: parts.flatMap((x) => x.errors) };
  })().catch((e) => ({ errors: [String(e.message ?? e).split("\n")[0]] })).finally(() => b.close().catch(() => {}));
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
