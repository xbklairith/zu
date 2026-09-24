import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import { changedSubgraph, nodeMark } from "./change";
import { home, upTo } from "./cut";
import type { View } from "./data";
import { pageEngine } from "./engine";
import { Header } from "./Header";
import { redLegend, violationsNote } from "./headline";
import { keyAction } from "./keys";
import { elkGraph, inOrder, orderOf, positions, Superseded, type Placed } from "./layout";
import { Panel } from "./Panel";
import { pinFor } from "./policy";
import { PROPOSAL_NOTICE, proposalView } from "./proposal";
import { reveal } from "./search";
import { SearchBox } from "./SearchBox";
import { DRAW_LIMIT, fitDepth, openFull, scene, type SceneNode } from "./scene";
import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
import { Toolbar } from "./Toolbar";
import { useViewState } from "./useViewState";

const PKG = "#pkg";

type LegendProps = {
  change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null;
  onDemand: boolean; // 11: lines show for a selected or hovered box
};

function Legend({ change, policy, ranks, crap, proposal, onDemand }: LegendProps) {
  return (
    <div className="legend" aria-label="Legend">
      {onDemand && <span className="dirs">a box's lines: solid, it depends on · dashed, depends on it</span>}
      {change && (
        <>
          <span className="swatch st-added">added</span>
          <span className="swatch st-removed">removed</span>
          <span className="swatch st-modified">modified</span>
          <span className="swatch st-moved">moved</span>
          <span className="swatch affected">affected</span>
          <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
        </>
      )}
      {policy && <span className="swatch violation">{redLegend(proposal)}</span>}
      {ranks && <span>n: Level, 0 = innermost, drawn at the bottom</span>}
      {crap && (
        <>
          <span className="swatch crap-green">CRAP μ+σ ≤ 8 low</span>
          <span className="swatch crap-yellow">≤ 12 mid</span>
          <span className="swatch crap-red">&gt; 12 high · ? no coverage data</span>
        </>
      )}
    </div>
  );
}

// Violations is 07's section of the Change View, first as in zu diff
// (decisions.md, "new violations first"): each new one links to its importer.
function Violations({ d, onPick }: { d: NonNullable<View["violations"]>; onPick: (id: string) => void }) {
  const note = violationsNote(d);
  return (
    <section className="violations" aria-label="Violations">
      <h2>{note.heading}</h2>
      {d.new.length > 0 && (
        <ol>
          {d.new.map((x) => (
            <li key={`${x.rule}\n${x.from}\n${x.to}`}>
              <span className="muted">{x.rule} </span>
              <button type="button" className="link" title={x.from} onClick={() => onPick(x.from)}>
                {x.from}
              </button>
              {" → "}
              <button type="button" className="link" title={x.to} onClick={() => onPick(x.to)}>
                {x.to}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">{note.tail}</p>
    </section>
  );
}

// ChangedList is U11: the changed packages in the Structural Summary's
// bottom-up order, exactly as zu diff wrote them, after the violations (07).
function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => void }) {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const ids = view.changed ?? [];
  return (
    <nav className="changed" aria-label="Changed packages">
      {view.violations && <Violations d={view.violations} onPick={onPick} />}
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
  // 07: a chosen Proposal replaces the Package Tree everywhere a tree is read.
  // A Change View never has one (knownIds): its violations are zu diff's.
  const proposed = useMemo(
    () => (change || state.proposal === null ? whole : proposalView(whole, state.proposal)),
    [whole, change, state.proposal],
  );
  // The Change View opens on the changed subgraph (Q4); U10 toggles to all of
  // it. A link whose focus lies outside the subgraph opens all of it, at that
  // focus: from the start, and on a later hashchange.
  const [full, setFull] = useState(() => change && openFull(changedSubgraph(whole), state.focus));
  const view = useMemo(() => (change && !full ? changedSubgraph(whole) : proposed), [whole, proposed, change, full]);
  const homeBox = useMemo(() => home(view), [view]); // 11: what the page root draws
  useEffect(() => {
    if (change && !full && openFull(view, state.focus)) setFull(true);
  }, [change, full, view, state.focus]);
  const [center, setCenter] = useState<{ id: string; seq: number } | undefined>(undefined);
  const searchBox = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fit, setFit] = useState(0);
  const pin = useMemo(() => pinFor(whole), [whole]); // 06: violations stay red
  const requested = useMemo(() => scene(view, state, { pin, home: true }), [view, state, pin]);
  // A view over DRAW_LIMIT draws the deepest depth that fits and says so; only
  // when even depth 1 is too big does the reader choose (Deviation 8).
  // "Draw depth M anyway" holds for this graph only.
  const wanted = useMemo(() => JSON.stringify(elkGraph(requested)), [requested]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const fitted = useMemo(() => {
    if (confirmed === wanted) return requested;
    const d = fitDepth(requested, (depth) => scene(view, { ...state, depth }, { pin, home: true }));
    return d === null ? null : d === requested.depth ? requested : scene(view, { ...state, depth: d }, { pin, home: true });
  }, [confirmed, wanted, requested, view, state, pin]);
  const sc = fitted ?? requested;
  const ask = fitted === null;
  // A selected bundle edge lives here, not in the hash: its id changes with depth.
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const edge = sc.edges.find((e) => e.id === edgeId) ?? null;
  const choose = (id: string | null) => {
    setEdgeId(null);
    update((s) => select(s, id));
  };
  // jump draws, selects and centres id (U5, A9), leaving the changed subgraph
  // when id is outside it.
  const jump = (id: string) => {
    setEdgeId(null);
    if (change && !full && !view.nodes.some((n) => n.id === id)) setFull(true);
    update((s) => reveal(proposed, id, s));
    setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
  };

  // One engine for the page's life; a layout runs only when its ELK input
  // changes, so selecting and dimming never lay out again.
  const engine = useMemo(pageEngine, []);
  useEffect(() => () => engine.dispose(), [engine]);
  const graph = useMemo(() => JSON.stringify(elkGraph(sc)), [sc]);
  // The Policy's order is a property of the nodes in graph, so a layout of
  // graph may read the order of any scene that produced it.
  const order = useMemo(() => orderOf(sc), [sc]);
  const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (ask) return;
    performance.mark("zu-layout-start");
    engine.layout(JSON.parse(graph)).then(
      (out) => {
        performance.mark("zu-layout-end");
        setFailed(null);
        setPlaced({ graph, at: inOrder(positions(out), order) });
      },
      (e: Error) => {
        if (!(e instanceof Superseded)) setFailed(e.message);
      },
    );
  }, [engine, graph, ask]);

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
        searchOpen,
        selected: state.selected !== null,
        atRoot: upTo(view, state.focus) === null,
        typing: e.target instanceof HTMLInputElement,
        mod: e.metaKey || e.ctrlKey || e.altKey,
      });
      if (a === "search") {
        e.preventDefault();
        searchBox.current?.focus();
      } else if (a === "closeSearch") searchBox.current?.blur();
      else if (a === "fit") setFit((n) => n + 1);
      else if (a === "clearSelection") choose(null);
      else if (a === "up") update((s) => up(s, upTo(view, s.focus) ?? ""));
      else if (a === "declutter") update((s) => ({ ...s, stage: nextStage(s.stage) }));
      else if (a === "deeper") update((s) => deeper(s, sc.depth));
      else if (a === "shallower") update((s) => shallower(s, sc.depth));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, state, sc.depth, update, searchOpen]);

  const open = (n: SceneNode) => {
    if (n.shape === "box" || n.shape === "container") go(n.id);
  };
  // The legend explains red only when something can be red, and badges only
  // when something is ranked; an order-only Policy needs neither.
  const rules = (proposed.policy?.levels.length ?? 0) > 0 || proposed.edges.some((e) => e.violation);
  const ranks = sc.nodes.some((n) => n.rank !== undefined);
  const crap = sc.nodes.some((n) => n.crap); // 08: only with a coverprofile (A7)
  const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
  const pkg = sc.focus.endsWith(PKG) ? sc.focus.slice(0, -PKG.length) : sc.focus;

  return (
    <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
      <Header
        view={proposed}
        focus={sc.focus}
        home={homeBox}
        boxes={boxes}
        depth={sc.depth}
        auto={state.depth === null}
        from={requested.depth}
        hidden={sc.hidden}
        onFocus={go}
        full={change ? full : undefined}
        onToggle={flip}
      />
      <div className="bar">
        <Toolbar
          state={state}
          depth={sc.depth}
          update={update}
          proposals={change ? [] : (whole.policy?.proposals ?? []).map((p) => p.name)}
        />
        <SearchBox view={proposed} input={searchBox} onOpen={setSearchOpen} onPick={jump} />
      </div>
      {change && <ChangedList view={whole} onPick={pick} />}
      <main className="canvas">
        {proposed !== whole && (
          <div className="proposal-banner" role="status">
            {PROPOSAL_NOTICE}: {state.proposal}
          </div>
        )}
        {(change || rules || ranks || crap || !sc.lines) && (
          <Legend
            change={change}
            policy={rules}
            ranks={ranks}
            crap={crap}
            proposal={proposed === whole ? null : state.proposal}
            onDemand={!sc.lines}
          />
        )}
        {sc !== requested && (
          <div className="notice" id="zu-notice" role="status">
            Collapsed to depth {sc.depth}: depth {requested.depth} has{" "}
            {requested.lines && requested.edges.length > DRAW_LIMIT.edges
              ? `${requested.edges.length} edges`
              : `${requested.nodes.length} boxes`}{" "}
            <button type="button" onClick={() => setConfirmed(wanted)}>
              Draw depth {requested.depth} anyway
            </button>{" "}
            <button type="button" onClick={() => update((s) => ({ ...s, edges: "off" }))}>
              Hide edges
            </button>
          </div>
        )}
        {sc.noDetail ? (
          <div className="empty">
            Declarations not included. Re-run with <code>-include {pkg}</code>
          </div>
        ) : ask ? (
          <div className="empty ask" id="zu-status">
            <p>
              Even depth 1 is too big to lay out quickly. Draw {sc.nodes.length} boxes and{" "}
              {sc.lines ? sc.edges.length : 0} edges at depth {sc.depth}? Layout may take minutes.
            </p>
            <button type="button" onClick={() => update((s) => ({ ...s, edges: "off" }))}>
              Hide edges
            </button>{" "}
            {upTo(view, state.focus) !== null && (
              <button type="button" onClick={() => update((s) => up(s, upTo(view, s.focus) ?? ""))}>
                Go back one level
              </button>
            )}{" "}
            <button type="button" onClick={() => setConfirmed(wanted)}>
              Draw anyway
            </button>
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
              edge={edgeId}
              onSelect={choose}
              onEdge={(id) => {
                setEdgeId(id);
                update((s) => select(s, null));
              }}
              onOpen={open}
              onToggle={(id) => update((s) => toggle(s, id))}
              center={center}
              fit={fit}
            />
          </ReactFlowProvider>
        ) : (
          <div className="empty" id="zu-status">
            Laying out…
          </div>
        )}
      </main>
      {(state.selected !== null || edge !== null) && (
        <Panel
          view={proposed}
          id={state.selected}
          edge={edge}
          bundles={sc.bundles}
          hidden={sc.nodes.find((n) => n.id === sc.selected)?.hidden}
          crap={sc.nodes.find((n) => n.id === sc.selected)?.crap?.risk}
          onReveal={jump}
          onClose={() => choose(null)}
        />
      )}
    </div>
  );
}
