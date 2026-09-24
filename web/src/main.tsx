import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { fetchView, parseView, readEmbedded, type View } from "./data";
import "./styles.css";

// loadView returns the View zu embedded, or the one zu serve sends. The dev
// server, serving the bare template, falls back to the Go golden; the build
// drops that branch.
async function loadView(): Promise<View | null> {
  const embedded = readEmbedded(document);
  if (embedded === "live") return fetchView();
  if (embedded || !import.meta.env.DEV) return embedded;
  const golden = await import("../../internal/export/testdata/shop.view.golden.json");
  return parseView(JSON.stringify(golden.default));
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
performance.mark("zu-parse-start");
let view: View | null = null;
let failed = "";
try {
  view = await loadView();
} catch (e) {
  failed = e instanceof Error ? e.message : String(e); // a View this page cannot read, or a failed rescan
}
performance.mark("zu-parse-end");
createRoot(root).render(
  <StrictMode>
    {failed ? (
      <p className="empty">{failed}</p>
    ) : view ? (
      <App view={view} />
    ) : (
      <p className="empty">
        This page carries no zu data. Create one with <code>zu scan -html FILE</code>.
      </p>
    )}
  </StrictMode>,
);
