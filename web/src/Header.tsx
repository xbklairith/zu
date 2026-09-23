import { useState } from "react";
import type { View } from "./data";
import { breadcrumb, depthNote, honestyLine, title } from "./headline";

type Props = {
  view: View;
  focus: string;
  boxes: number;
  depth: number;
  onFocus: (box: string) => void;
};

export function Header({ view, focus, boxes, depth, onFocus }: Props) {
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
      <p className="note">{depthNote(boxes, depth)}</p>
    </header>
  );
}
