import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import { changedSubgraph, nodeMark } from "./change";
import type { Read } from "./code";
import { home, index, isBox, upTo } from "./cut";
import type { View } from "./data";
import { isGroup } from "./group";
import { pageEngine } from "./engine";
import { Header } from "./Header";
import { redLegend, violationsNote } from "./headline";
import { keyAction } from "./keys";
import { drawnCentre, enter, leave } from "./lens";
import { elkGraph, headers, Superseded, type Placed } from "./layout";
import { show } from "./place";
import { Panel } from "./Panel";
import { pinFor } from "./policy";
import { PROPOSAL_NOTICE, proposalView } from "./proposal";
import { reveal } from "./search";
import { SearchBox } from "./SearchBox";
import { DRAW_LIMIT, fitDepth, HUBS, opening, openFull, scene, type Scene, type SceneNode } from "./scene";
import { centreOf, placeScreen, placesOf, screenNote, screenOf, screenView } from "./screen";
import { ScreenCanvas } from "./ScreenCanvas";
import { centreAt, deeper, drill, nextStage, select, shallower, toggle, up, type ViewState } from "./state";
import { Toolbar } from "./Toolbar";
import { useViewState } from "./useViewState";
import { step, walkAt } from "./walk";

const PKG = "#pkg";
const FRAMES = 64; // 15: the most layouts the page keeps (place.ts)
const SCENES = 32; // 15: and scenes

type LegendProps = {
  change: boolean; policy: boolean; ranks: boolean; crap: boolean; proposal: string | null;
  onDemand: boolean; // 11: lines show for a selected or hovered box
  hubs: boolean; // 11: some box is drawn as one of the most used
  screen?: boolean; // 18: the Screen: a Change View's marks and ghosts, red lines, no rows
};

function Legend({ change, policy, ranks, crap, proposal, onDemand, hubs, screen }: LegendProps) {
  return (
    <div className="legend" aria-label="Legend">
      {!screen && <span className="rows">rows are dependency order: a box mostly uses the rows below it</span>}
      {onDemand && <span className="dirs">hover or select a box for its lines: solid, it uses · dotted, used by</span>}
      {hubs && <span className="swatch hub">thick border: the {HUBS} most used</span>}
      {change && (
        <>
          <span className="swatch st-added">added</span>
          <span className="swatch st-removed">removed</span>
          <span className="swatch st-modified">modified</span>
          <span className="swatch st-moved">moved</span>
          <span className="swatch affected">affected</span>
          {screen && <span className="swatch ghost">dotted: where a reversed import was in base</span>}
          <span>{screen ? "lines" : "edges"}: + added · − removed · ⇄ reversed · ± mixed</span>
        </>
      )}
      {policy && <span className="swatch violation">{redLegend(proposal, screen)}</span>}
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

// Drawing is a finished layout and what it was made for.
type Drawing = { whole: View; view: View; sc: Scene; graph: string; base: string; at: Map<string, Placed> };

// read gives the source the View does not carry, from zu serve (19).
export function App({ view: whole, read }: { view: View; read?: Read }) {
  const change = whole.kind === "change";
  const [state, update] = useViewState(whole);
  // 07: a chosen Proposal replaces the Package Tree everywhere a tree is read.
  // A Change View never has one (knownIds): its violations are zu diff's.
  const proposed = useMemo(
    () => (change || state.proposal === null ? whole : proposalView(whole, state.proposal)),
    [whole, change, state.proposal],
  );
  // 17: the Screen of the Centre, drawn instead of the tree, in a Proposal
  // over the Proposal's View; 18: in a Change View over its near neighbours too.
  const centre = drawnCentre(proposed, state);
  const onScreen = centre !== null;
  const screen = useMemo(
    () => (centre === null ? null : screenOf(proposed, centre, state.more)),
    [proposed, centre, state.more],
  );
  const drawing = useMemo(() => screen && placeScreen(screen), [screen]);
  // 19: the Screen box or line the reader points at, and where its calls and embeds are written.
  const [point, setPoint] = useState<{ centre: string; id: string } | null>(null);
  const lit = centre !== null && point?.centre === centre ? placesOf(proposed, centre, point.id) : null;
  const red = drawing?.edges.some((e) => e.violation) ?? false; // 18: a Screen line the Policy forbids
  const canEnter = centreOf(proposed, state.selected) !== null;
  const lens = () => {
    // 18: leaving for a box the changed subgraph leaves out draws all of the
    // View (U10), as jump does.
    const left = state.centre === null ? null : leave(proposed, state).selected;
    if (change && !full && left !== null && index(whole).node.has(left) && !view.nodes.some((n) => n.id === left)) setFull(true);
    update((s) => (s.centre === null ? enter(proposed, s) : leave(proposed, s)));
  };
  const walk = walkAt(proposed, centre); // 18: where the Screen is on the walk through the change
  const recentre = (id: string) => {
    const c = centreOf(proposed, id);
    if (c !== null) update((s) => centreAt(s, c));
  };
  // The Panel shows the Centre until the reader closes it, and again once the
  // Centre changes.
  const [closed, setClosed] = useState<string | null>(null);
  useEffect(() => setClosed((c) => (c === centre ? c : null)), [centre]);
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
  // 15: the scenes of this View by state, so the view as it opened is made
  // once while the reader opens and closes boxes and selects in it, and
  // closing the last box draws the first view without making it again.
  const sceneOf = useMemo(() => {
    const at = new Map<string, Scene>();
    const made = (s: ViewState, base: Scene | null): Scene => {
      const k = JSON.stringify({ ...s, centre: null, more: false }); // 17: the Screen draws no tree
      const hit = at.get(k);
      if (hit) return hit;
      if (at.size >= SCENES) at.clear();
      const sc = scene(view, s, { pin, home: true, base });
      at.set(k, sc);
      return sc;
    };
    return (s: ViewState) => made(s, opening(view, s, (b) => made(b, null)));
  }, [view, pin]);
  const requested = useMemo(() => sceneOf(state), [sceneOf, state]);
  // A view over DRAW_LIMIT draws the deepest depth that fits and says so; only
  // when even depth 1 is too big does the reader choose (Deviation 8).
  // "Draw depth M anyway" holds for this graph only.
  const wanted = useMemo(() => JSON.stringify(elkGraph(requested)), [requested]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const fitted = useMemo(() => {
    if (confirmed === wanted) return requested;
    const d = fitDepth(requested, (depth) => sceneOf({ ...state, depth }));
    return d === null ? null : d === requested.depth ? requested : sceneOf({ ...state, depth: d });
  }, [confirmed, wanted, requested, sceneOf, state]);
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
  // 15: and on the view as it opened, which places what the reader did not open.
  const opened = useMemo(() => JSON.stringify(elkGraph(sc.ref ?? sc)), [sc]);
  const graph = useMemo(() => JSON.stringify(elkGraph(sc)) + (sc.ref ? opened : ""), [sc, opened]);
  // 11: what packed widens containers to; a change lays out again.
  const heads = useMemo(() => JSON.stringify([...headers(sc)]), [sc]);
  const key = graph + "\n" + heads;
  // 15: every layout of the page's life by its input (place.ts frameKey), so
  // a toggle lays out only the box it opened, and closing it lays out nothing.
  const frames = useRef(new Map<string, Map<string, Placed>>());
  // 13: a layout keeps the View and scene it was made for, so while zu
  // serve's newer View lays out the page goes on drawing the last one, in the
  // same React Flow, and the reader's pan and zoom stay. 15: so too while a
  // box the reader opened or closed lays out, when the view as it opened is
  // the same; anything else that lays the view out again starts afresh.
  const [placed, setPlaced] = useState<Drawing | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (ask || onScreen) return; // 17: the Screen needs no layout
    const made = { whole, view, sc };
    performance.mark("zu-layout-start");
    if (frames.current.size > FRAMES) frames.current.clear();
    // 15 (B1): once the page wants another layout, this one draws nothing.
    return show(
      sc, engine, frames.current,
      (at) => {
        performance.mark("zu-layout-end");
        setFailed(null);
        setPlaced({ ...made, graph: graph + "\n" + heads, base: opened, at });
      },
      (e: Error) => {
        if (!(e instanceof Superseded)) setFailed(e.message);
      },
    );
  }, [engine, graph, heads, ask, onScreen]);

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
  // 17: the tree comes back centred on its selection, however the Screen was
  // left (s, Esc, Back): its pan and zoom are not kept while a Screen is drawn.
  const wasScreen = useRef(onScreen);
  useEffect(() => {
    if (wasScreen.current && !onScreen && state.selected !== null) {
      const id = state.selected;
      setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
    }
    wasScreen.current = onScreen;
  }, [onScreen, state.selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction(e.key, {
        searchOpen,
        selected: state.selected !== null,
        atRoot: upTo(view, state.focus) === null,
        // A checkbox (every box, externals) keeps the focus after a click but takes no keys.
        typing: e.target instanceof HTMLInputElement && e.target.type !== "checkbox",
        mod: e.metaKey || e.ctrlKey || e.altKey,
        screen: onScreen,
        change,
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
      else if (a === "lens") lens();
      else if (a === "next") update((s) => step(proposed, s, 1)); // 18: the walk
      else if (a === "previous") update((s) => step(proposed, s, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, proposed, state, sc.depth, update, searchOpen]);

  const open = (n: SceneNode) => {
    if (n.shape === "box" || n.shape === "container") go(n.id);
    else if (isGroup(n.id)) update((s) => toggle(s, n.id)); // 12: a group opens in place
  };
  // The legend explains red only when something can be red, and badges only
  // when something is ranked; an order-only Policy needs neither.
  const rules = (proposed.policy?.levels.length ?? 0) > 0 || proposed.edges.some((e) => e.violation);
  const ranks = sc.nodes.some((n) => n.rank !== undefined);
  const crap = sc.nodes.some((n) => n.crap); // 08: only with a coverprofile (A7)
  const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
  const pkg = sc.focus.endsWith(PKG) ? sc.focus.slice(0, -PKG.length) : sc.focus;
  const frame = `${state.focus}\n${sc.depth}`; // a new one starts at the first view
  const shown: Pick<Drawing, "view" | "sc" | "at"> | null = !placed
    ? null
    : placed.graph === key
      ? { view, sc, at: placed.at }
      : (placed.whole !== whole || placed.base === opened) && `${state.focus}\n${placed.sc.depth}` === frame
        ? placed // 13: a newer View; 15: a toggle, until its layout is done
        : null;

  return (
    <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
      <Header
        view={proposed}
        focus={sc.focus}
        home={homeBox}
        boxes={boxes}
        folded={sc.folded}
        depth={sc.depth}
        auto={state.depth === null}
        from={requested.depth}
        hidden={sc.hidden}
        against={sc.noDetail ? undefined : sc.against}
        onFocus={go}
        full={change ? full : undefined}
        onToggle={flip}
        screen={screen ? screenNote(screen) : undefined}
      />
      <div className="bar">
        <div className="toolbar" role="toolbar" aria-label="Lens">
          <button
            type="button"
            aria-pressed={onScreen}
            disabled={!onScreen && !canEnter}
            title={onScreen ? "Back to the tree (s)" : canEnter ? "Draw the selection's Screen (s)" : "Select a package or declaration to draw its Screen (s)"}
            onClick={lens}
          >
            Screen
          </button>
          {screen && (state.more || screen.above.more > 0 || screen.below.more > 0) && (
            <label>
              <input type="checkbox" checked={state.more} onChange={(e) => update((s) => ({ ...s, more: e.target.checked }))} /> every box
            </label>
          )}
        </div>
        {change && walk.of > 0 && (
          <div className="toolbar walk" role="toolbar" aria-label="Walk the change">
            <button type="button" aria-label="Previous step" title="The previous step of the change (p)"
              disabled={step(proposed, state, -1) === state} onClick={() => update((s) => step(proposed, s, -1))}>
              ◂
            </button>
            <span className="at">{onScreen ? `${walk.at ?? "–"} of ${walk.of}` : `${walk.of} ${walk.of === 1 ? "step" : "steps"}`}</span>
            <button type="button" aria-label="Next step" title={onScreen ? "The next step of the change (n)" : "Walk the change in reading order (n)"}
              disabled={step(proposed, state, 1) === state} onClick={() => update((s) => step(proposed, s, 1))}>
              ▸
            </button>
          </div>
        )}
        {!onScreen && (
          <Toolbar
            state={state}
            depth={sc.depth}
            update={update}
            proposals={change ? [] : (whole.policy?.proposals ?? []).map((p) => p.name)}
          />
        )}
        <SearchBox view={proposed} input={searchBox} onOpen={setSearchOpen} onPick={onScreen ? recentre : jump} />
      </div>
      {change && <ChangedList view={whole} onPick={onScreen ? recentre : pick} />}
      <main className="canvas">
        {proposed !== whole && (
          <div className="proposal-banner" role="status">
            {PROPOSAL_NOTICE}: {state.proposal}
          </div>
        )}
        {!sc.noDetail && !onScreen && (
          <Legend
            change={change}
            policy={rules}
            ranks={ranks}
            crap={crap}
            proposal={proposed === whole ? null : state.proposal}
            onDemand={!sc.lines}
            hubs={sc.nodes.some((n) => n.hub)}
          />
        )}
        {onScreen && (change || red) && (
          <Legend change={change} screen policy={red} ranks={false} crap={false} proposal={proposed === whole ? null : state.proposal} onDemand={false} hubs={false} />
        )}
        {sc !== requested && !onScreen && (
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
        {drawing ? (
          <ReactFlowProvider key={`${centre}\n${state.more}`}>
            <ScreenCanvas
              drawing={drawing}
              onCentre={recentre}
              onMore={() => update((s) => ({ ...s, more: true }))}
              fit={fit}
              onPoint={(id) => setPoint(id === null || centre === null ? null : { centre, id })}
            />
          </ReactFlowProvider>
        ) : sc.noDetail ? (
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
        ) : shown ? (
          <ReactFlowProvider key={frame}>
            <Canvas
              view={shown.view}
              sc={shown.sc}
              placed={shown.at}
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
      {centre !== null && closed !== centre && (
        <Panel
          key={centre} // mounted anew for each Centre: WebKit redraws an updated one slowly (17)
          view={screenView(proposed)}
          id={isBox(proposed, centre + PKG) ? centre + PKG : centre}
          edge={null}
          bundles={[]}
          read={read}
          lit={lit}
          onReveal={recentre}
          onClose={() => setClosed(centre)}
        />
      )}
      {!onScreen && (state.selected !== null || edge !== null) && (
        <Panel
          view={proposed}
          id={state.selected}
          edge={edge}
          bundles={sc.bundles}
          hidden={sc.nodes.find((n) => n.id === sc.selected)?.hidden}
          crap={sc.nodes.find((n) => n.id === sc.selected)?.crap?.risk}
          ownTier={sc.nodes.find((n) => n.id === sc.selected)?.ownTier}
          read={read}
          onReveal={jump}
          onClose={() => choose(null)}
        />
      )}
    </div>
  );
}
