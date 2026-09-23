import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { parseView, readEmbedded, type View } from "./data";
import "./styles.css";

// loadView returns the View zu embedded. The dev server, serving the bare
// template, falls back to the Go golden; the build drops that branch.
async function loadView(): Promise<View | null> {
  const embedded = readEmbedded(document);
  if (embedded || !import.meta.env.DEV) return embedded;
  const golden = await import("../../internal/export/testdata/shop.view.golden.json");
  return parseView(JSON.stringify(golden.default));
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
const view = await loadView();
createRoot(root).render(
  <StrictMode>
    {view ? (
      <App view={view} />
    ) : (
      <p className="empty">
        This page carries no zu data. Create one with <code>zu scan -html FILE</code>.
      </p>
    )}
  </StrictMode>,
);
