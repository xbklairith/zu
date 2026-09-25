// Browser acceptance for zu serve (10 Task 6) and its watch (13). Not part
// of make check: it needs browsers and a bin/zu built with the UI. Run from
// web/e2e after `make build`: npm run accept-serve
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "zu-serve-"));
cpSync(join(here, "../../internal/scan/testdata/shop"), dir, { recursive: true });
const server = spawn(join(here, "../../bin/zu"), ["serve", dir, "-addr", "127.0.0.1:0", "-include", "./internal/store"], {
  stdio: ["ignore", "pipe", "pipe"],
});
// Stopped and removed however the run ends.
process.on("exit", () => {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
});
let log = "";
server.stderr.on("data", (d) => (log += d));
const url = await new Promise((ok, fail) => {
  server.stdout.once("data", (d) => ok(String(d).trim()));
  server.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
});

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
  p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
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
  p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
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
  tabs: true,
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
