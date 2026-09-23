import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import { changedSubgraph, nodeMark } from "./change";
import { parentBox } from "./cut";
import type { View } from "./data";
import { pageEngine } from "./engine";
import { Header } from "./Header";
import { elkGraph, positions, Superseded, type Placed } from "./layout";
import { Panel } from "./Panel";
import { scene, type SceneNode } from "./scene";
import { DEFAULT_STATE } from "./state";

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
  const [selected, setSelected] = useState<string | null>(null);
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
  const sc = useMemo(() => scene(view, { ...DEFAULT_STATE, focus, selected }), [view, focus, selected]);

  // One engine for the page's life; a layout runs only when its ELK input changes.
  const engine = useMemo(pageEngine, []);
  useEffect(() => () => engine.dispose(), [engine]);
  const graph = useMemo(() => JSON.stringify(elkGraph(sc)), [sc]);
  const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    performance.mark("zu-layout-start");
    engine.layout(JSON.parse(graph)).then(
      (out) => {
        performance.mark("zu-layout-end");
        setFailed(null);
        setPlaced({ graph, at: positions(out) });
      },
      (e: Error) => {
        if (!(e instanceof Superseded)) setFailed(e.message);
      },
    );
  }, [engine, graph]);

  const go = (box: string) => {
    setFocus(box);
    setSelected(null);
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

  const open = (n: SceneNode) => {
    if (n.shape === "box" || n.shape === "container") go(n.id);
  };
  const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
  const pkg = focus.endsWith(PKG) ? focus.slice(0, -PKG.length) : focus;

  return (
    <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
      <Header
        view={whole}
        focus={focus}
        boxes={boxes}
        depth={sc.depth}
        onFocus={go}
        full={change ? full : undefined}
        onToggle={toggle}
      />
      {change && <ChangedList view={whole} onPick={pick} />}
      <main className="canvas">
        {change && <Legend />}
        {sc.noDetail ? (
          <div className="empty">
            Declarations not included. Re-run with <code>-include {pkg}</code>
          </div>
        ) : failed !== null ? (
          <div className="empty" id="zu-status">
            Layout failed: {failed}
          </div>
        ) : placed && placed.graph === graph ? (
          <ReactFlowProvider key={focus}>
            <Canvas view={view} sc={sc} placed={placed.at} onSelect={setSelected} onOpen={open} center={center} />
          </ReactFlowProvider>
        ) : (
          <div className="empty" id="zu-status">
            Laying out…
          </div>
        )}
      </main>
      {selected && (
        <Panel
          view={whole}
          shown={view}
          focus={focus}
          depth={sc.depth}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
