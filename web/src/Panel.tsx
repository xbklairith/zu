import { useEffect, useRef } from "react";
import type { Loc, View } from "./data";
import { calls, imports, targets, type Row } from "./facts";
import { linkFor } from "./links";
import { EXTERNALS, OUTSIDE, boxStats } from "./tree";

const PKG = "#pkg";

type Props = {
  view: View;
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

export function Panel({ view, focus, depth, id, onClose }: Props) {
  const node = view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
  let body: React.ReactNode;
  if (id === OUTSIDE || id === EXTERNALS) {
    body = <Rows title={id === OUTSIDE ? "Packages outside this box" : "External modules"} rows={targets(view, focus, depth, id)} />;
  } else if (node?.kind === "type" || node?.kind === "function") {
    const c = calls(view, node.id);
    const text = view.sources[node.loc.path];
    body = (
      <>
        <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
        <Where view={view} loc={node.loc} />
        <Rows title="Calls and embeds out" rows={c.out} />
        <Rows title="Called or embedded by" rows={c.in} />
        {text !== undefined && <Source text={text} line={node.loc.line} />}
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
        {node && <Where view={view} loc={node.loc} />}
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
