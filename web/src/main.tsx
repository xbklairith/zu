import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { fetchView, parseView, readEmbedded, type Loaded, type View } from "./data";
import { follow } from "./live";
import "./styles.css";

// loadView returns the View zu embedded, or the one zu serve sends with its
// text. The dev server, serving the bare template, falls back to the Go
// golden; the build drops that branch.
async function loadView(): Promise<Loaded | { view: View } | null> {
  const embedded = readEmbedded(document);
  if (embedded === "live") return fetchView();
  if (embedded || !import.meta.env.DEV) return embedded && { view: embedded };
  const golden = await import("../../internal/export/testdata/shop.view.golden.json");
  return { view: parseView(JSON.stringify(golden.default)) };
}

// Live is a page zu serve sent (13): it draws each newer View zu serve's watch
// builds, in place, and says what zu serve says over the drawing. Without a
// watch (-poll 0) /events answers 404 and the page stays as it loaded. A
// hidden page closes its stream and catches up when shown.
function Live({ first }: { first: Loaded }) {
  const [view, setView] = useState(first.view);
  const [notice, setNotice] = useState("");
  useEffect(
    () =>
      follow(
        () => new EventSource("events"),
        () => fetch("view.json?latest", { cache: "no-store" }),
        first,
        setView,
        setNotice,
        document,
      ),
    [first],
  );
  return (
    <>
      {notice && (
        <div className="live-notice" id="zu-live" role="status">
          {notice}
        </div>
      )}
      <App view={view} />
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
performance.mark("zu-parse-start");
let loaded: Awaited<ReturnType<typeof loadView>> = null;
let failed = "";
try {
  loaded = await loadView();
} catch (e) {
  failed = e instanceof Error ? e.message : String(e); // a View this page cannot read, or a failed rescan
}
performance.mark("zu-parse-end");
createRoot(root).render(
  <StrictMode>
    {failed ? (
      <p className="empty">{failed}</p>
    ) : loaded && "text" in loaded ? (
      <Live first={loaded} />
    ) : loaded ? (
      <App view={loaded.view} />
    ) : (
      <p className="empty">
        This page carries no zu data. Create one with <code>zu scan -html FILE</code>.
      </p>
    )}
  </StrictMode>,
);
