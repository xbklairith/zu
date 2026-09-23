import { useState } from "react";
import type { View } from "./data";
import { breadcrumb, depthNote, honestyLine, title } from "./headline";

type Props = {
  view: View;
  focus: string;
  boxes: number;
  depth: number;
  onFocus: (box: string) => void;
  auto: boolean; // the depth is autoDepth's, not the reader's
  from?: number; // the requested depth, when the drawn one is shallower (Deviation 8)
  full?: boolean; // Change View only: showing the full project, not the changed subgraph
  onToggle?: () => void;
};

export function Header({ view, focus, boxes, depth, onFocus, auto, from, full, onToggle }: Props) {
  const compare = view.links?.compare?.startsWith("https://") ? view.links.compare : null;
  const [showErrors, setShowErrors] = useState(false);
  const errors = view.honesty.parseErrors;
  return (
    <header className="header">
      <h1>{title(view)}</h1>
      <div className="honesty">
        {errors.length > 0 ? (
          <button type="button" className="link" onClick={() => setShowErrors(!showErrors)}>
            {honestyLine(view)}
          </button>
        ) : (
          <span>{honestyLine(view)}</span>
        )}
        <span className="sensitive">Contains source from this repository.</span>
      </div>
      {showErrors && (
        <ul className="errors">
          {errors.map((e) => (
            <li key={e.path + e.message}>
              <code>{e.path}</code>: {e.message}
            </li>
          ))}
        </ul>
      )}
      <nav className="crumbs" aria-label="Focus">
        {breadcrumb(view, focus).map((c, i, all) => (
          <span key={c.id}>
            {i > 0 && <span className="sep"> / </span>}
            {i === all.length - 1 ? (
              <strong>{c.label}</strong>
            ) : (
              <button type="button" className="link" onClick={() => onFocus(c.id)}>
                {c.label}
              </button>
            )}
          </span>
        ))}
      </nav>
      <p className="note">
        {depthNote(boxes, depth, auto, from)}
        {full !== undefined && (
          <>
            {" "}
            {full ? "Showing every package." : "Showing the changed packages and their direct importers."}{" "}
            <button type="button" className="link" onClick={onToggle}>
              {full ? "Show changed subgraph" : "Show full project"}
            </button>
          </>
        )}
        {compare && (
          <>
            {" · "}
            <a href={compare} target="_blank" rel="noopener noreferrer">
              Compare {view.base?.commit.slice(0, 12)}…{view.head.commit.slice(0, 12)} on the host
            </a>
          </>
        )}
      </p>
    </header>
  );
}
