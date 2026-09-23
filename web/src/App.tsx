import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import { changedSubgraph, nodeMark } from "./change";
import { parentBox } from "./cut";
import type { View } from "./data";
import { pageEngine } from "./engine";
import { Header } from "./Header";
import { keyAction } from "./keys";
import { elkGraph, positions, Superseded, type Placed } from "./layout";
import { Panel } from "./Panel";
import { openFull, scene, type SceneNode } from "./scene";
import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
import { useViewState } from "./useViewState";

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
  const [state, update] = useViewState(whole);
  // The Change View opens on the changed subgraph (Q4); U10 toggles to all of
  // it. A link whose focus lies outside the subgraph opens all of it, at that
  // focus: from the start, and on a later hashchange.
  const [full, setFull] = useState(() => change && openFull(changedSubgraph(whole), state.focus));
  const view = useMemo(() => (change && !full ? changedSubgraph(whole) : whole), [whole, change, full]);
  useEffect(() => {
    if (change && !full && openFull(view, state.focus)) setFull(true);
  }, [change, full, view, state.focus]);
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
  const sc = useMemo(() => scene(view, state), [view, state]);

  // One engine for the page's life; a layout runs only when its ELK input
  // changes, so selecting and dimming never lay out again.
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
    update((s) => drill(s, box));
    setCenter(undefined);
  };
  const flip = () => {
    setFull(!full);
    go("");
  };
  // A pick from the changed list (U11) shows the page root with it selected and centred.
  const pick = (id: string) => {
    update((s) => ({ ...drill(s, ""), selected: id }));
    setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction(e.key, {
        searchOpen: false,
        selected: state.selected !== null,
        atRoot: state.focus === "",
        typing: e.target instanceof HTMLInputElement,
        mod: e.metaKey || e.ctrlKey || e.altKey,
      });
      if (a === "clearSelection") update((s) => select(s, null));
      else if (a === "up") update((s) => up(s, parentBox(view, s.focus)));
      else if (a === "declutter") update((s) => ({ ...s, stage: nextStage(s.stage) }));
      else if (a === "deeper") update((s) => deeper(s, sc.depth));
      else if (a === "shallower") update((s) => shallower(s, sc.depth));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, state, sc.depth, update]);

  const open = (n: SceneNode) => {
    if (n.shape === "box" || n.shape === "container") go(n.id);
  };
  const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
  const pkg = state.focus.endsWith(PKG) ? state.focus.slice(0, -PKG.length) : state.focus;

  return (
    <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
      <Header
        view={whole}
        focus={state.focus}
        boxes={boxes}
        depth={sc.depth}
        auto={state.depth === null}
        onFocus={go}
        full={change ? full : undefined}
        onToggle={flip}
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
          <ReactFlowProvider key={`${state.focus}\n${sc.depth}`}>
            <Canvas
              view={view}
              sc={sc}
              placed={placed.at}
              onSelect={(id) => update((s) => select(s, id))}
              onOpen={open}
              onToggle={(id) => update((s) => toggle(s, id))}
              center={center}
            />
          </ReactFlowProvider>
        ) : (
          <div className="empty" id="zu-status">
            Laying out…
          </div>
        )}
      </main>
      {state.selected && (
        <Panel
          view={whole}
          shown={view}
          focus={state.focus}
          depth={sc.depth}
          id={state.selected}
          onClose={() => update((s) => select(s, null))}
        />
      )}
    </div>
  );
}
