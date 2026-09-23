import { useMemo, useState, type RefObject } from "react";
import type { View } from "./data";
import { search } from "./search";

type Props = {
  view: View;
  input: RefObject<HTMLInputElement | null>;
  onOpen: (open: boolean) => void;
  onPick: (id: string) => void;
};

// Search (U8/A9): up to 20 hits; ↑ ↓ move, Enter or a click picks. Esc is the
// page's key map (keys.ts): it closes the list before anything else.
export function SearchBox({ view, input, onOpen, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const hits = useMemo(() => search(view, query), [view, query]);
  const pick = (id: string) => {
    setQuery("");
    input.current?.blur();
    onPick(id);
  };
  return (
    <div className="search">
      <input
        ref={input}
        type="search"
        placeholder="Search (/)"
        aria-label="Search nodes"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAt(0);
        }}
        onFocus={() => onOpen(true)}
        onBlur={() => onOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setAt((i) => Math.min(i + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setAt((i) => Math.max(i - 1, 0));
          else if (e.key === "Enter" && hits[at]) pick(hits[at].id);
          else return;
          e.preventDefault();
        }}
      />
      {hits.length > 0 && (
        <ul className="hits" role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === at}
              className={i === at ? "at" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h.id);
              }}
            >
              {h.name} <span className="muted">{h.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
