import { useEffect, useMemo, useRef, useState } from "react";
import type { Bundle } from "./bundle";
import { around, behind, centre, inline, litNote, paint, type Read } from "./code";
import type { Hunk, Loc, SourceFile, View, ViewEdge, ViewNode } from "./data";
import { calls, imports, insideDecl, targets, type Row } from "./facts";
import { isGroup, isStrip, rankNote } from "./group";
import { diffLink, fileDiffLink, linkFor } from "./links";
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
  read?: Read; // 19: the source the View does not carry, from zu serve
  lit?: Loc[] | null; // 19: where the Screen line the reader points at is written (screen.ts placesOf)
  onReveal: (id: string) => void;
  onClose: () => void;
};

// 19: onPoint hears the row the reader points at or focuses, and null when they leave it.
function Rows({ title, rows, onReveal, onPoint }: {
  title: string; rows: Row[]; onReveal: (id: string) => void; onPoint?: (r: Row | null) => void;
}) {
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
            <li key={r.id} onMouseEnter={onPoint && (() => onPoint(r))} onMouseLeave={onPoint && (() => onPoint(null))}>
              <button
                type="button"
                className="link"
                onClick={() => onReveal(r.id)}
                onFocus={onPoint && (() => onPoint(r))}
                onBlur={onPoint && (() => onPoint(null))}
              >
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

// Where is a location and its source on the host: at head, or at base for
// what the change removed (14), whose line is base's.
function Where({ view, loc, removed = false }: { view: View; loc: Loc; removed?: boolean }) {
  if (!loc.path) return null;
  const href = linkFor(view.links, loc.path, loc.line, removed ? "base" : "head");
  const at = (removed ? view.base?.commit : view.head.commit) ?? "";
  return (
    <p>
      <code>
        {loc.path}:{loc.line}
      </code>
      {href && (
        <>
          {" · "}
          <a href={href} target="_blank" rel="noopener noreferrer">
            View at {at.slice(0, 12)}
          </a>
        </>
      )}
    </p>
  );
}

// Hunks renders line diffs as React text children only, like Source.
function Hunks({ view, path, hunks }: { view: View; path: string; hunks: Hunk[] }) {
  const href = fileDiffLink(view.links, path);
  return (
    <section>
      <h3>
        Changes in <code>{path}</code>
        {href && (
          <>
            {" · "}
            <a className="diff-link" href={href} target="_blank" rel="noopener noreferrer">
              on the host
            </a>
          </>
        )}
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
  const href = diffLink(view.links, node.id); // 14: its first changed line there
  const files =
    node.kind === "package"
      ? Object.keys(hunks).filter((p) => dir(p) === dir(node.loc.path)).sort()
      : hunks[node.loc.path]
        ? [node.loc.path]
        : [];
  return (
    <>
      {facts.length > 0 && <p className={`change-facts ${node.status ? `st-${node.status}` : ""}`}>{facts.join(" · ")}</p>}
      {href && (
        <p>
          <a
            className="diff-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title="Opens the diff at this line. Some browsers open it at the top; View at always lands on the declaration."
          >
            Diff on the host
          </a>
        </p>
      )}
      {files.map((p) => (
        <Hunks key={p} view={view} path={p} hunks={hunks[p]} />
      ))}
    </>
  );
}

// Code renders file text as React text children only, never parsed as
// markup, coloured as zu coloured it (19, code.ts), the line marked and the
// lines in lit that are this file's lit. Of a file longer than CODE_LINES it
// draws those around the marked line, and says which.
function Code({ file, line, lit }: { file: SourceFile; line: number; lit: Loc[] | null }) {
  const pre = useRef<HTMLPreElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  // Each View brings its files as new objects (13): cut, paint and scroll
  // only when the text or the marked line changes, so a redraw leaves the
  // code where the reader scrolled it. The colour is the text's
  // (export.Syntax), whose lines are cut as these are.
  const all = useMemo(() => file.text.split("\n"), [file.text]);
  const on = useMemo(() => new Set(lit?.filter((l) => l.path === file.path).map((l) => l.line)), [lit, file.path]);
  const first = on.size > 0 ? Math.min(...on) : 0;
  // The lines drawn move to the first lit line when they do not hold it,
  // and stay when the light goes out, as the scroll does, until the mark
  // moves.
  const marked = `${file.path}\n${line}`;
  const [held, setHeld] = useState({ marked, at: line });
  const at = centre(all.length, held.marked === marked ? held.at : line, first);
  if (held.marked !== marked || held.at !== at) setHeld({ marked, at });
  const [from, to] = around(all.length, at);
  const lines = useMemo(() => paint(all.slice(from, to), file.syntax.slice(from, to)), [all, from, to]);
  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center" });
  }, [file.path, file.text, line]);
  // The code alone scrolls to the first lit line: scrolling the panel would
  // move the row the reader points at.
  useEffect(() => {
    const el = pre.current?.children[first - 1 - from] as HTMLElement | undefined;
    if (pre.current && el) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 2;
  }, [first]);
  return (
    <>
      {to - from < all.length && <p className="muted window-note">{`Lines ${from + 1}–${to} of ${all.length}.`}</p>}
      <pre ref={pre} className="source">
        {lines.map((segs, k) => {
          const i = from + k + 1; // its line
          return (
            <div
              key={i}
              ref={i === line ? mark : undefined}
              className={[i === line && "hit", on.has(i) && "lit"].filter(Boolean).join(" ") || undefined}
            >
              <span className="ln">{i}</span>
              {segs.map((s, j) => (
                <span key={j} className={s.cls}>
                  {s.text}
                </span>
              ))}
            </div>
          );
        })}
      </pre>
    </>
  );
}

// Source is the code of the file loc is in: the View's, or (19) read from zu
// serve, the last file read kept while the next comes. It draws nothing while
// neither has the file. Over it, where the lines lit are, or (hint) how to
// light them.
function Source({ view, loc, read, lit, hint }: { view: View; loc: Loc; read?: Read; lit: Loc[] | null; hint: boolean }) {
  const own = useMemo(() => inline(view, loc.path), [view, loc.path]);
  const [got, setGot] = useState<SourceFile | null>(null);
  useEffect(() => {
    if (own || !read) return;
    let on = true;
    read(loc.path).then((f) => on && setGot(f));
    return () => {
      on = false;
    };
  }, [own, read, loc.path]);
  const file = own ?? (got?.path === loc.path ? got : null);
  if (!file) return null;
  return (
    <>
      {(hint || lit !== null) && (
        <p className="muted lit-note" aria-live="polite">
          {litNote(lit, file.path)}
        </p>
      )}
      <Code file={file} line={loc.line} lit={lit} />
    </>
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
            <Where view={view} loc={m.loc} removed={m.status === "removed"} />
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

export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, read, lit, onReveal, onClose }: Props) {
  // 19: the row the reader points at lights its lines, over the Screen's line.
  const [over, setOver] = useState<{ id: string; places: Loc[] } | null>(null);
  const places = over !== null && over.id === id ? over.places : (lit ?? null);
  // A row followed to another declaration goes without a mouseleave or a
  // blur: its light goes with the declaration it was in.
  useEffect(() => setOver(null), [id]);
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
    const inside = insideDecl(view, node.id);
    const point = (out: boolean) => (r: Row | null) =>
      setOver(r && { id: id!, places: out ? behind(view, inside, (x) => x === r.id) : behind(view, (x) => x === r.id, inside) });
    body = (
      <>
        <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
        <Where view={view} loc={node.loc} removed={node.status === "removed"} />
        <Change view={view} node={node} />
        <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} onPoint={point(true)} />
        <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} onPoint={point(false)} />
        {node.status !== "removed" && (
          <Source view={view} loc={node.loc} read={read} lit={places} hint={c.out.length + c.in.length > 0} />
        )}
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
        {node && <Where view={view} loc={node.loc} removed={node.status === "removed"} />}
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
