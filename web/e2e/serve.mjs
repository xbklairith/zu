// Browser acceptance for zu serve (10 Task 6), its watch (13), -base (14) and
// a Screen whose Centre the watch deletes (17). Not part
// of make check: it needs browsers and a bin/zu built with the UI. Run from
// web/e2e after `make build`: npm run accept-serve
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
// benign is WebKit's one harmless page error, a known flake since 13 (14, A1):
// matched exactly, so any other ResizeObserver error still counts.
const benign = (e) => e.message === "ResizeObserver loop completed with undelivered notifications.";
const dir = mkdtempSync(join(tmpdir(), "zu-serve-"));
cpSync(join(here, "../../internal/scan/testdata/shop"), dir, { recursive: true });
// 14: the shop again, committed on main with feat checked out, for -base.
const changeDir = mkdtempSync(join(tmpdir(), "zu-serve-base-"));
cpSync(join(here, "../../internal/scan/testdata/shop"), changeDir, { recursive: true });
const git = (...a) => execFileSync("git", ["-c", "user.name=zu", "-c", "user.email=zu@example.com", ...a], { cwd: changeDir });
git("init", "-q", "-b", "main");
git("add", "-A");
git("commit", "-q", "-m", "base");
git("checkout", "-q", "-b", "feat");
const servers = [];
// Stopped and removed however the run ends.
process.on("exit", () => {
  for (const s of servers) s.kill();
  rmSync(dir, { recursive: true, force: true });
  rmSync(changeDir, { recursive: true, force: true });
});
let log = "";
async function start(...args) {
  const s = spawn(join(here, "../../bin/zu"), ["serve", ...args, "-addr", "127.0.0.1:0"], { stdio: ["ignore", "pipe", "pipe"] });
  servers.push(s);
  s.stderr.on("data", (d) => (log += d));
  return new Promise((ok, fail) => {
    s.stdout.once("data", (d) => ok(String(d).trim()));
    s.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
  });
}
const url = await start(dir, "-include", "./internal/store");
const changeURL = await start(changeDir, "-base", "main");

const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
const settle = (p) => p.waitForTimeout(900);
const selected = (p) => p.locator(".row.selected").textContent().catch(() => null);
const has = (p, id) => p.locator(`.react-flow__node[data-id="${id}"]`).count();
const view = "#f=example.com/shop/internal/store&s=example.com/shop/internal/store.Repo.Get";

async function run(name, b) {
  const out = {};
  const errors = [];
  let p = await b.newPage();
  const csp = (t) => /Content.Security|CSP|refused/i.test(t);
  p.on("console", (m) => csp(m.text()) && errors.push(m.text().slice(0, 160)));
  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
  // A view's URL opens that view: the page fetched its View and applied the hash.
  await p.goto(url + view);
  await drawn(p);
  await settle(p);
  out.selected = await selected(p);
  out.hash = await p.evaluate(() => decodeURIComponent(location.hash));
  // Session restore: reopening the URL, in a new page, restores the view.
  await p.close();
  p = await b.newPage();
  await p.goto(url + view);
  await drawn(p);
  await settle(p);
  out.reopened = await selected(p);
  // A package added to the tree is drawn on the next load.
  const id = `example.com/shop/internal/added${name}`;
  await p.goto(url + "#d=3");
  await p.reload();
  await drawn(p);
  await settle(p);
  const before = await has(p, id);
  mkdirSync(join(dir, "internal", `added${name}`));
  writeFileSync(join(dir, "internal", `added${name}`, "a.go"), `package added${name}\n`);
  await p.reload();
  await drawn(p);
  await settle(p);
  out.added = [before, await has(p, id)];
  await p.close();
  // 13: a saved file is drawn without a reload, in place: the hash, pan and
  // zoom stay. A file that does not parse keeps the drawing and says so.
  p = await b.newPage();
  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
  await p.goto(url + view);
  await drawn(p);
  await settle(p);
  await p.keyboard.press("/"); // a search centres its pick; a redraw must not centre it again
  await p.keyboard.type("Repo.Get");
  await p.keyboard.press("Enter");
  await settle(p);
  const pane = await p.locator(".react-flow").boundingBox();
  await p.mouse.move(pane.x + pane.width / 3, pane.y + pane.height / 3);
  await p.mouse.wheel(0, 300); // zoom out around the pointer: zoom and pan both change
  await settle(p);
  const frame = () => p.locator(".react-flow__viewport").getAttribute("style");
  const hash = () => p.evaluate(() => location.hash);
  const [frame0, hash0] = [await frame(), await hash()];
  const live = `example.com/shop/internal/store.Live${name}`;
  const file = join(dir, "internal", "store", `live${name}.go`);
  const node = (id) => p.locator(`.react-flow__node[data-id="${id}"]`).waitFor({ timeout: 15000 }).then(() => true, () => false);
  writeFileSync(file, `package store\n\nfunc Live${name}() {}\n`);
  const came = await node(live);
  await settle(p);
  out.live = [came, (await frame()) === frame0, (await hash()) === hash0];
  const notice = p.locator("#zu-live");
  writeFileSync(file, `package store\n\nfunc Live${name}( {}\n`);
  const said = await notice.waitFor({ timeout: 15000 }).then(() => notice.textContent(), () => "");
  out.broken = [said.includes(`live${name}.go`), await has(p, live), (await frame()) === frame0];
  writeFileSync(file, `package store\n\nfunc Live${name}() {}\n\nfunc Again${name}() {}\n`);
  out.fixed = [await node(`example.com/shop/internal/store.Again${name}`), await notice.count()];
  // 17: a Screen whose Centre a save deletes draws the tree again, with no page error.
  const gone = `example.com/shop/internal/store.Gone${name}`;
  const goneFile = join(dir, "internal", "store", `gone${name}.go`);
  writeFileSync(goneFile, `package store\n\nfunc Gone${name}() {}\n`);
  const appeared = await node(gone);
  await p.evaluate((h) => (location.hash = h), `#s=${encodeURIComponent(gone)}&c=${encodeURIComponent(gone)}`);
  const screen = await p.locator(`.screen .react-flow__node[data-id="${gone}"]`).waitFor({ timeout: 15000 }).then(() => true, () => false);
  rmSync(goneFile);
  const tree = await p.locator(".screen").waitFor({ state: "detached", timeout: 15000 })
    .then(() => p.locator(".react-flow__node").first().waitFor({ timeout: 15000 })).then(() => true, () => false);
  out.lost = [appeared && screen, tree, !(await hash()).includes("c=")];
  await p.close();
  // 13: a hidden page holds no stream, so a seventh page still loads,
  // though a browser opens at most six connections to one host.
  const ctx = await b.newContext();
  const tabs = [];
  for (let i = 0; i < 6; i++) {
    tabs.push(await ctx.newPage());
    await tabs[i].goto(url + view);
    await drawn(tabs[i]);
  }
  for (const t of tabs) {
    await t.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }
  const seventh = await ctx.newPage();
  out.tabs = await seventh.goto(url + view, { timeout: 15000 }).then(() => drawn(seventh)).then(() => true, () => false);
  await ctx.close();
  // 14: with -base the page draws the Change View against main, and a save
  // is drawn as a change, in place.
  p = await b.newPage();
  p.on("pageerror", (e) => benign(e) || errors.push("pageerror " + e.message.slice(0, 120)));
  const storePkg = "example.com/shop/internal/store";
  await p.goto(changeURL + `#f=${storePkg}`);
  await p.waitForSelector(".app", { timeout: 30000 });
  await settle(p);
  const changeHash = await hash();
  const grown = `${storePkg}.Change${name}`;
  writeFileSync(join(changeDir, "internal", "store", `change${name}.go`), `package store\n\nfunc Change${name}() {}\n`);
  const shown = await node(grown);
  await settle(p);
  out.change = [
    await p.locator(".header").innerText().then((t) => t.startsWith("Change View")),
    shown,
    await p.locator(`.react-flow__node[data-id="${grown}"] .node`).getAttribute("class").then((c) => c.split(" ").includes("st-added"), () => false),
    (await hash()) === changeHash,
  ];
  await p.close();
  out.errors = errors;
  return out;
}

const want = {
  selected: ".Get",
  hash: view,
  reopened: ".Get",
  added: [0, 1],
  live: [true, true, true],
  broken: [true, 1, true],
  fixed: [true, 0],
  lost: [true, true, true],
  tabs: true,
  change: [true, true, true, true],
  errors: [],
};

const channel = process.env.ZU_E2E_CHANNEL;
let failed = 0;
for (const [name, type, opts] of [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]]) {
  const b = await type.launch(opts);
  const got = await run(name, b).finally(() => b.close().catch(() => {}));
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
console.log(log.trim().split("\n").at(-1));
process.exit(failed ? 1 : 0);
