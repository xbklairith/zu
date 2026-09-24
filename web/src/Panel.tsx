import { useEffect, useRef } from "react";
import type { Bundle } from "./bundle";
import type { Hunk, Loc, View, ViewEdge, ViewNode } from "./data";
import { calls, imports, targets, type Row } from "./facts";
import { isGroup, isStrip, rankNote } from "./group";
import { linkFor } from "./links";
import { crapFacts, type Risk } from "./metrics";
import type { SceneEdge } from "./scene";
import { EXTERNALS, OUTSIDE, boxStats } from "./tree";

const PKG = "#pkg";

// The panel shows a selected node (id) or a selected bundle edge. Every id it
// lists is a link: reveal draws and selects it (U5, full).
type Props = {
  view: View; // the whole View: facts list every edge
  id: string | null;
  edge: SceneEdge | null;
  bundles: Bundle[]; // the scene's bundles: an aggregate's real targets come from them
  hidden?: ViewEdge[]; // 07: violating imports inside the selected box, drawn as no line
  crap?: Risk; // 08: the selected box's CRAP as the scene rolled it up
  ownTier?: number; // 12: the selected box's rank before the row cap merged its row
  onReveal: (id: string) => void;
  onClose: () => void;
};

function Rows({ title, rows, onReveal }: { title: string; rows: Row[]; onReveal: (id: string) => void }) {
  return (
    <section>
      <h3>
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="muted">none</p>
      ) : (
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="link" onClick={() => onReveal(r.id)}>
                <code>{r.id}</code>
              </button>
              {r.count > 1 && <span className="muted"> ×{r.count}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Where({ view, loc }: { view: View; loc: Loc }) {
  if (!loc.path) return null;
  const href = linkFor(view.links, loc.path, loc.line);
  return (
    <p>
      <code>
        {loc.path}:{loc.line}
      </code>
      {href && (
        <>
          {" · "}
          <a href={href} target="_blank" rel="noopener noreferrer">
            View at {view.head.commit.slice(0, 12)}
          </a>
        </>
      )}
    </p>
  );
}

// Hunks renders line diffs as React text children only, like Source.
function Hunks({ path, hunks }: { path: string; hunks: Hunk[] }) {
  return (
    <section>
      <h3>
        Changes in <code>{path}</code>
      </h3>
      {hunks.map((h) => (
        <pre key={`${h.baseStart},${h.headStart}`} className="hunk">
          <div className="hh">
            @@ −{h.baseStart},{h.baseLines} +{h.headStart},{h.headLines} @@
          </div>
          {h.lines.map((l, i) => (
            <div key={i} className={l[0] === "+" ? "add" : l[0] === "-" ? "del" : undefined}>
              {l}
            </div>
          ))}
        </pre>
      ))}
    </section>
  );
}

function dir(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

// Change is what zu diff says about one node: status, Move, hop, and the
// hunks of its file (a declaration) or of its directory (a package).
function Change({ view, node }: { view: View; node: ViewNode }) {
  if (view.kind !== "change") return null;
  const facts = [
    node.status,
    node.movedFrom && `moved from ${node.movedFrom}`,
    node.hop !== undefined && (node.hop === 0 ? "changed (hop 0)" : `affected, ${node.hop} hop${node.hop > 1 ? "s" : ""} from a change`),
  ].filter(Boolean);
  const hunks = view.hunks ?? {};
  const files =
    node.kind === "package"
      ? Object.keys(hunks).filter((p) => dir(p) === dir(node.loc.path)).sort()
      : hunks[node.loc.path]
        ? [node.loc.path]
        : [];
  return (
    <>
      {facts.length > 0 && <p className={`change-facts ${node.status ? `st-${node.status}` : ""}`}>{facts.join(" · ")}</p>}
      {files.map((p) => (
        <Hunks key={p} path={p} hunks={hunks[p]} />
      ))}
    </>
  );
}

// Source renders file text as React text children only: never parsed as markup.
function Source({ text, line }: { text: string; line: number }) {
  const mark = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center" });
  }, [text, line]);
  return (
    <pre className="source">
      {text.split("\n").map((l, i) => (
        <div key={i} ref={i + 1 === line ? mark : undefined} className={i + 1 === line ? "hit" : undefined}>
          <span className="ln">{i + 1}</span>
          {l}
        </div>
      ))}
    </pre>
  );
}

// Members lists the IR edges a bundle carries, each with where it is written.
function Members({ view, edge, onReveal }: { view: View; edge: SceneEdge; onReveal: (id: string) => void }) {
  return (
    <section>
      <h3>
        {edge.pairs} {edge.pairs === 1 ? "pair" : "pairs"} ({edge.members.length} edges)
      </h3>
      <ul className="rows">
        {edge.members.map((m, i) => (
          <li key={i}>
            <button type="button" className="link" onClick={() => onReveal(m.from)}>
              <code>{m.from}</code>
            </button>
            {` ${m.kind} `}
            <button type="button" className="link" onClick={() => onReveal(m.to)}>
              <code>{m.to}</code>
            </button>
            {m.count > 1 && <span className="muted"> ×{m.count}</span>}
            {m.status && <span className={`muted edge-${m.status}`}> {m.status}</span>}
            <Where view={view} loc={m.loc} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Hidden lists the violating imports a box holds (07): no line draws them, so
// the box is marked red and they are listed here.
function Hidden({ edges, onReveal }: { edges: ViewEdge[]; onReveal: (id: string) => void }) {
  return (
    <section className="hidden-violations">
      <h3>Violations inside ({edges.length})</h3>
      <ul className="rows">
        {edges.map((e) => (
          <li key={`${e.from}\n${e.to}`}>
            <span className="muted">{e.violation} </span>
            <button type="button" className="link" onClick={() => onReveal(e.from)}>
              <code>{e.from}</code>
            </button>
            {" → "}
            <button type="button" className="link" onClick={() => onReveal(e.to)}>
              <code>{e.to}</code>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Crap is what the CRAP overlay knows of the selection (08).
function Crap({ view, id, box, onReveal }: { view: View; id: string; box?: Risk; onReveal: (id: string) => void }) {
  const f = crapFacts(view, id, box);
  if (!f) return null;
  return (
    <section className="crap-facts">
      {f.lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {f.top.length > 0 && (
        <>
          <h3>Highest CRAP</h3>
          <ul className="rows">
            {f.top.map((t) => (
              <li key={t.id}>
                <button type="button" className="link" onClick={() => onReveal(t.id)}>
                  <code>{t.id}</code>
                </button>
                <span className="muted"> {t.crap}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, onReveal, onClose }: Props) {
  const title = edge ? `${edge.from} → ${edge.to}` : (id ?? "");
  const node = id === null ? undefined : view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
  let body: React.ReactNode;
  if (edge) {
    body = <Members view={view} edge={edge} onReveal={onReveal} />;
  } else if (id !== null && isGroup(id)) {
    // 12: a group stands for boxes set aside or folded; it opens in place.
    body = (
      <>
        <p className="muted">{isStrip(id) ? "tests, tools and generated code, set aside" : "boxes the first view folded"} · click to open</p>
        <Rows title="Packages here with dependencies" rows={targets(bundles, id)} onReveal={onReveal} />
      </>
    );
  } else if (id === OUTSIDE || id === EXTERNALS) {
    body = (
      <Rows
        title={id === OUTSIDE ? "Packages outside this box" : "External modules"}
        rows={targets(bundles, id)}
        onReveal={onReveal}
      />
    );
  } else if (node?.kind === "type" || node?.kind === "function") {
    const c = calls(view, node.id);
    const text = view.sources[node.loc.path];
    body = (
      <>
        <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
        {node.status !== "removed" && <Where view={view} loc={node.loc} />}
        <Change view={view} node={node} />
        <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} />
        <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} />
        {text !== undefined && node.status !== "removed" && <Source text={text} line={node.loc.line} />}
      </>
    );
  } else if (node?.kind === "external") {
    body = (
      <>
        <p className="muted">external module</p>
        <Rows title="Imported by" rows={imports(view, node.id).in} onReveal={onReveal} />
      </>
    );
  } else if (id !== null) {
    const s = boxStats(view, id);
    const f = imports(view, id);
    body = (
      <>
        {node && node.status !== "removed" && <Where view={view} loc={node.loc} />}
        {node && <Change view={view} node={node} />}
        <p className="muted">
          {s.packages} packages · {s.decls} declarations · {s.unresolved} unresolved calls
        </p>
        {rankNote(ownTier) && <p className="muted">{rankNote(ownTier)}</p>}
        <Rows title="Imports" rows={f.out} onReveal={onReveal} />
        <Rows title="Imported by" rows={f.in} onReveal={onReveal} />
      </>
    );
  }
  return (
    <aside className="panel">
      <header>
        <code className="id">{title}</code>
        <button type="button" className="link" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </header>
      {!edge && hidden && <Hidden edges={hidden} onReveal={onReveal} />}
      {!edge && id !== null && !isGroup(id) && <Crap view={view} id={id} box={crap} onReveal={onReveal} />}
      {body}
    </aside>
  );
}
