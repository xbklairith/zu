import { useEffect, useRef } from "react";
import type { Hunk, Loc, View, ViewNode } from "./data";
import { calls, imports, targets, type Row } from "./facts";
import { linkFor } from "./links";
import { EXTERNALS, OUTSIDE, boxStats } from "./tree";

const PKG = "#pkg";

type Props = {
  view: View; // the whole View: facts list every edge
  shown?: View; // what the canvas draws, for aggregate targets (default view)
  focus: string;
  depth: number;
  id: string;
  onClose: () => void;
};

function Rows({ title, rows }: { title: string; rows: Row[] }) {
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
              <code>{r.id}</code>
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

export function Panel({ view, shown, focus, depth, id, onClose }: Props) {
  const node = view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
  let body: React.ReactNode;
  if (id === OUTSIDE || id === EXTERNALS) {
    body = <Rows title={id === OUTSIDE ? "Packages outside this box" : "External modules"} rows={targets(shown ?? view, focus, depth, id)} />;
  } else if (node?.kind === "type" || node?.kind === "function") {
    const c = calls(view, node.id);
    const text = view.sources[node.loc.path];
    body = (
      <>
        <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
        {node.status !== "removed" && <Where view={view} loc={node.loc} />}
        <Change view={view} node={node} />
        <Rows title="Calls and embeds out" rows={c.out} />
        <Rows title="Called or embedded by" rows={c.in} />
        {text !== undefined && node.status !== "removed" && <Source text={text} line={node.loc.line} />}
      </>
    );
  } else if (node?.kind === "external") {
    body = (
      <>
        <p className="muted">external module</p>
        <Rows title="Imported by" rows={imports(view, node.id).in} />
      </>
    );
  } else {
    const s = boxStats(view, id);
    const f = imports(view, id);
    body = (
      <>
        {node && node.status !== "removed" && <Where view={view} loc={node.loc} />}
        {node && <Change view={view} node={node} />}
        <p className="muted">
          {s.packages} packages · {s.decls} declarations · {s.unresolved} unresolved calls
        </p>
        <Rows title="Imports" rows={f.out} />
        <Rows title="Imported by" rows={f.in} />
      </>
    );
  }
  return (
    <aside className="panel">
      <header>
        <code className="id">{id}</code>
        <button type="button" className="link" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </header>
      {body}
    </aside>
  );
}
