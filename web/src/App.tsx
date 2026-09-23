import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import { changedSubgraph, nodeMark } from "./change";
import type { View } from "./data";
import { Header } from "./Header";
import { Panel } from "./Panel";
import { layout, scene, type Item, type Placed } from "./layout";
import { autoDepth, parentBox } from "./tree";

const PKG = "#pkg";

function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <span className="swatch st-added">added</span>
      <span className="swatch st-removed">removed</span>
      <span className="swatch st-modified">modified</span>
      <span className="swatch st-moved">moved</span>
      <span className="swatch affected">affected</span>
      <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
    </div>
  );
}

// ChangedList is U11: the changed packages in the Structural Summary's
// bottom-up order, exactly as zu diff wrote them.
function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => void }) {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const ids = view.changed ?? [];
  return (
    <nav className="changed" aria-label="Changed packages">
      <h2>Changed packages ({ids.length})</h2>
      <ol>
        {ids.map((id) => {
          const n = byId.get(id);
          return (
            <li key={id}>
              <button type="button" className={`link ${n ? nodeMark(n) : ""}`} title={id} onClick={() => onPick(id)}>
                {id}
              </button>
              {n?.status && <span className="muted"> {n.status}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function App({ view: whole }: { view: View }) {
  const change = whole.kind === "change";
  const [full, setFull] = useState(false);
  // The Change View opens on the changed subgraph (Q4); U10 toggles to all of it.
  const view = useMemo(() => (change && !full ? changedSubgraph(whole) : whole), [whole, change, full]);
  const [focus, setFocus] = useState("");
  const [selected, setSelected] = useState("");
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
  const depth = useMemo(() => autoDepth(view, focus), [view, focus]);
  const s = useMemo(() => scene(view, focus, depth), [view, focus, depth]);
  const [placed, setPlaced] = useState<{ focus: string; at: Map<string, Placed> } | null>(null);

  useEffect(() => {
    let live = true;
    performance.mark("zu-layout-start");
    layout(s.items, s.edges).then((at) => {
      performance.mark("zu-layout-end");
      if (live) setPlaced({ focus, at });
    });
    return () => {
      live = false;
    };
  }, [s, focus]);

  const go = (box: string) => {
    setFocus(box);
    setSelected("");
    setCenter(undefined);
  };
  const toggle = () => {
    setFull(!full);
    go("");
  };
  const pick = (id: string) => {
    setFocus("");
    setSelected(id);
    setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus !== "") go(parentBox(view, focus));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, focus]);

  const open = (item: Item) => {
    if (item.shape === "box" || item.shape === "container") go(item.id);
  };
  const leaves = s.items.filter((i) => i.shape === "box" || i.shape === "decl");
  const empty = s.items.length === 0 && focus !== "";
  const pkg = focus.endsWith(PKG) ? focus.slice(0, -PKG.length) : focus;

  return (
    <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
      <Header
        view={whole}
        focus={focus}
        boxes={leaves.length}
        depth={depth}
        onFocus={go}
        full={change ? full : undefined}
        onToggle={toggle}
      />
      {change && <ChangedList view={whole} onPick={pick} />}
      <main className="canvas">
        {change && <Legend />}
        {empty ? (
          <div className="empty">
            Declarations not included. Re-run with <code>-include {pkg}</code>
          </div>
        ) : placed && placed.focus === focus ? (
          <ReactFlowProvider key={focus}>
            <Canvas
              view={view}
              items={s.items}
              edges={s.edges}
              placed={placed.at}
              selected={selected}
              onSelect={setSelected}
              onOpen={open}
              center={center}
            />
          </ReactFlowProvider>
        ) : (
          <div className="empty">Laying out…</div>
        )}
      </main>
      {selected && (
        <Panel
          view={whole}
          shown={view}
          focus={focus}
          depth={depth}
          id={selected}
          onClose={() => setSelected("")}
        />
      )}
    </div>
  );
}
