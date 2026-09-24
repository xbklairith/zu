// probe.mjs times `scene` over exported Views, as 11's probe did (B1).
// Usage: node probe.mjs <web dir> <name>=<export.html> ...
// It bundles <web dir>/src/scene.ts with that tree's rolldown, reads each
// page's zu-data View, and prints six runs of scene at the page root (auto
// depth, home) and at depth 2 and 4. Each series parses the View afresh, so
// its first run pays for the per-View memos (index, boxStats, rollup).
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [web, ...pages] = process.argv.slice(2);
if (!web || pages.length === 0) {
  console.error("usage: node probe.mjs <web dir> <name>=<export.html> ...");
  process.exit(3);
}
const req = createRequire(join(resolve(web), "package.json"));
const { build } = await import(pathToFileURL(req.resolve("rolldown")).href);
const out = mkdtempSync(join(tmpdir(), "zu-probe-"));
try {
  const entry = join(out, "entry.ts");
  const src = resolve(web, "src");
  const fs = await import("node:fs");
  fs.writeFileSync(entry, `export { scene } from ${JSON.stringify(join(src, "scene.ts"))};\nexport { DEFAULT_STATE } from ${JSON.stringify(join(src, "state.ts"))};\nexport { parseView } from ${JSON.stringify(join(src, "data.ts"))};\n`);
  await build({ input: entry, platform: "node", logLevel: "silent", output: { file: join(out, "scene.mjs"), format: "esm" } });
  const { scene, DEFAULT_STATE, parseView } = await import(pathToFileURL(join(out, "scene.mjs")).href);
  const series = [
    ["auto", {}],
    ["d=2", { depth: 2 }],
    ["d=4", { depth: 4 }],
  ];
  for (const arg of pages) {
    const [name, file] = arg.split("=");
    const html = readFileSync(file, "utf8");
    const m = html.match(/<script id="zu-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error(`${file}: no zu-data`);
    for (const [label, s] of series) {
      const view = parseView(m[1]);
      const ms = [];
      let nodes = 0;
      for (let i = 0; i < 6; i++) {
        const t = performance.now();
        const sc = scene(view, { ...DEFAULT_STATE, ...s }, { home: true });
        ms.push(performance.now() - t);
        nodes = sc.nodes.length;
      }
      const r = ms.map((x) => Math.round(x));
      console.log(`${name} ${label} (${nodes} nodes): ${r.join(" ")} ms; range ${Math.min(...r)}–${Math.max(...r)}`);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
