// Browser acceptance for the Screen (17). Not part of make check: it needs
// browsers. Run from web/e2e after `make build`: npm run accept-screen.
// ZU_E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "zu-screen-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

// page writes a View into the built page, as zu does.
function page(name, v) {
  const tmpl = readFileSync(join(here, "../dist/index.html"), "utf8");
  const marker = '<script id="zu-data" type="application/json">{}</script>';
  if (tmpl.split(marker).length !== 2) throw new Error("run make build first: dist/index.html has no data marker");
  const f = join(dir, name + ".html");
  writeFileSync(f, tmpl.replace(marker, marker.replace("{}", () => JSON.stringify(v).replaceAll("<", "\\u003c"))));
  return f;
}
const golden = (name) => JSON.parse(readFileSync(join(here, `../../internal/export/testdata/${name}.golden.json`), "utf8"));
const shop = page("shop", golden("shop.view"));
const change = page("change", golden("shop.change"));
// many: m/core, imported by 30 packages, more than a row draws (ROW_CAP 24).
const many = (() => {
  const loc = { path: "x.go", line: 1 };
  const ids = Array.from({ length: 30 }, (_, i) => `m/p${String(i).padStart(2, "0")}`);
  const nodes = ["m/core", ...ids].map((id) => ({ id, kind: "package", module: "m", loc }));
  const edges = ids.map((from) => ({ from, to: "m/core", kind: "imports", count: 1, loc }));
  return page("many", { ...golden("shop.view"), modules: ["m"], sources: {}, nodes, edges });
})();

const S = "example.com/shop/internal/store";
const C = "example.com/shop/internal/checkout";
const enc = encodeURIComponent;

async function open(b, file, hash) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  // WebKit's one benign notice, dropped by equality as 14's serve.mjs does (A1).
  p.on("pageerror", (e) => e.message === "ResizeObserver loop completed with undelivered notifications." || errors.push(e.message));
  await p.goto("file://" + file + hash);
  await p.locator(".react-flow__node").first().waitFor({ timeout: 120000 });
  await p.waitForTimeout(300);
  return { p, errors };
}
const hash = (p) => p.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
const centre = (p) => p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("c"));
// drawn is the Screen's boxes by id, once the Screen of c is drawn (null: no Screen).
const drawn = async (p, c) => {
  await p.waitForFunction((c) => c === null
    ? !document.querySelector(".screen") && document.querySelector(".react-flow__node")
    : document.querySelector(`.screen .react-flow__node[data-id="${CSS.escape(c)}"]`), c, { timeout: 10000 });
  await p.waitForTimeout(150);
  return p.evaluate(() => [...document.querySelectorAll(".screen .react-flow__node")].map((e) => e.dataset.id).sort());
};
const entries = (p) => p.evaluate(() => history.length);
// centred says id's box is in the middle of the tree's canvas, as a search pick leaves it.
const centred = (p, id) => p.waitForFunction((id) => {
  const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
  const n = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
  return pane && n && Math.abs(n.x + n.width / 2 - pane.x - pane.width / 2) < 4 && Math.abs(n.y + n.height / 2 - pane.y - pane.height / 2) < 4;
}, id, { timeout: 5000 }).then(() => true, () => false);
const panel = (p) => p.locator("aside.panel code.id").textContent({ timeout: 1000 }).catch(() => null);
const lens = (p) => p.locator('[aria-label="Lens"] button');

async function walk(b) {
  const { p, errors } = await open(b, shop, `#s=${enc(S)}`);
  const got = {};
  const start = await entries(p);
  const enabled = await lens(p).isEnabled();
  await p.keyboard.press("s");
  got.enter = JSON.stringify(await drawn(p, S)) === JSON.stringify([S, "down:example.com/shop/internal/money", "down:github.com/lib/pq", `up:${C}`].sort())
    && (await centre(p)) === S && (await entries(p)) === start + 1;
  got.button = [enabled, await lens(p).getAttribute("aria-pressed")];
  // The Screen's Panel shows the Centre; closed, it stays closed until the Centre changes.
  const shown = await panel(p);
  await p.locator('aside.panel button[aria-label="Close panel"]').click();
  const closed = await panel(p);
  await p.click(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}`)}"]`);
  const at = await drawn(p, C);
  got.recentre = (await centre(p)) === C && at.includes("up:example.com/shop") && at.includes(`down:${S}`) && (await entries(p)) === start + 2;
  got.panel = [shown?.startsWith(S), closed, (await panel(p))?.startsWith(C)];
  await p.goBack();
  const back = await drawn(p, S);
  await p.goBack();
  await drawn(p, null);
  const tree = await hash(p);
  got.back = back.includes(`up:${C}`) && tree.c === undefined && tree.s === S && (await centred(p, S));
  await p.goForward();
  got.forward = (await drawn(p, S)).includes(`up:${C}`) && (await centre(p)) === S;
  // Enter on a focused box re-centres, and the keyboard goes on from the new Centre.
  await p.focus(`.react-flow__node[data-id="${CSS_ESCAPE(`up:${C}`)}"]`);
  await p.keyboard.press("Enter");
  await drawn(p, C);
  got.keyboard = [await centre(p), await p.evaluate(() => document.activeElement?.getAttribute("data-id"))];
  // Word-start Jump: "RW" is ReadWriter's Read, Writer.
  await p.keyboard.press("/");
  await p.keyboard.type("RW");
  await p.keyboard.press("Enter");
  got.wordStart = (await drawn(p, `${S}.ReadWriter`)).includes(`down:${S}.Reader`);
  await p.keyboard.press("/");
  await p.keyboard.type("Repo");
  await p.keyboard.press("Enter");
  const repo = await drawn(p, `${S}.Repo`);
  const note = await p.locator("#zu-screen").innerText();
  got.honest = repo.includes(`down:${S}.Open`) && note.includes("1 call or embed out of it, with declarations in packages not included")
    && note.includes("4 unresolved calls");
  await p.keyboard.press("Escape");
  await drawn(p, null);
  const left = await hash(p);
  got.esc = left.c === undefined && left.s === `${S}.Repo` && (await centred(p, `${S}.Repo`));
  await p.close();
  return { got, errors };
}

async function rows(b) {
  const bare = await open(b, shop, "");
  const disabled = await lens(bare.p).isDisabled(); // nothing selected: no Centre
  await bare.p.close();
  const { p, errors } = await open(b, many, `#c=${enc("m/core")}`);
  const capped = await drawn(p, "m/core");
  const start = await entries(p);
  await p.click('.react-flow__node[data-id="up:#more"]');
  await p.waitForFunction(() => location.hash.includes("m=1"));
  const all = await drawn(p, "m/core");
  const every = p.locator('[aria-label="Lens"] input[type=checkbox]');
  const checked = await every.isChecked();
  await every.uncheck();
  await p.waitForFunction(() => !location.hash.includes("m=1"));
  const again = await drawn(p, "m/core");
  const same = (await entries(p)) === start;
  // Ticked from the keyboard, the checkbox keeps the focus; s still leaves the Screen.
  await every.focus();
  await p.keyboard.press("Space");
  await p.waitForFunction(() => location.hash.includes("m=1"));
  await drawn(p, "m/core");
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("type"));
  await p.keyboard.press("s");
  const left = await drawn(p, null).then(() => centre(p), () => "still on the Screen");
  const got = {
    more: capped.filter((id) => id.startsWith("up:m/")).length === 24 && capped.includes("up:#more")
      && all.filter((id) => id.startsWith("up:m/")).length === 30 && !all.includes("up:#more") && same
      && checked && JSON.stringify(again) === JSON.stringify(capped) && focused === "checkbox" && left === null,
    disabled,
  };
  await p.close();
  return { got, errors: [...bare.errors, ...errors] };
}

async function changeView(b) {
  const { p, errors } = await open(b, change, `#s=${enc(S)}`);
  await p.keyboard.press("s");
  await p.waitForTimeout(500);
  const pressed = (await centre(p)) === null && !(await p.locator(".screen").count());
  await p.close();
  const linked = await open(b, change, `#c=${enc(S)}`);
  const ignored = (await centre(linked.p)) === null && !(await linked.p.locator(".screen").count());
  await linked.p.close();
  return { got: { change: pressed && ignored }, errors: [...errors, ...linked.errors] };
}

const CSS_ESCAPE = (s) => s.replace(/["\\]/g, "\\$&");
const want = {
  enter: true, button: [true, "true"], panel: [true, null, true], recentre: true, back: true, forward: true, keyboard: [C, C],
  wordStart: true, honest: true, esc: true, more: true, disabled: true, change: true, errors: [],
};
const channel = process.env.ZU_E2E_CHANNEL;
const engines = [["chromium", chromium, channel ? { channel } : {}], ["firefox", firefox, {}], ["webkit", webkit, {}]];
let failed = 0;
for (const [name, type, opts] of engines) {
  const b = await type.launch(opts);
  const got = await (async () => {
    const parts = [await walk(b), await rows(b), await changeView(b)];
    return { ...Object.assign({}, ...parts.map((x) => x.got)), errors: parts.flatMap((x) => x.errors) };
  })().catch((e) => ({ errors: [String(e.message ?? e).split("\n")[0]] })).finally(() => b.close().catch(() => {}));
  const bad = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  for (const k of bad) console.log(`${name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(want[k])}`);
  console.log(`${name}: ${bad.length ? "FAIL" : "ok"} (${Object.keys(want).length - bad.length}/${Object.keys(want).length} checks)`);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
