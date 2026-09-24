// Browser acceptance for zu serve (10 Task 6). Not part of make check: it
// needs browsers and a bin/zu built with the UI. Run from web/e2e after
// `make build`: npm run accept-serve
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
  // Firefox's own favicon loader asks for /favicon.ico, which img-src data:
  // refuses; the page makes no such request.
  const csp = (t) => /Content.Security|CSP|refused/i.test(t) && !/FaviconLoader/.test(t);
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
  out.errors = errors;
  return out;
}

const want = {
  selected: ".Get",
  hash: view,
  reopened: ".Get",
  added: [0, 1],
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
