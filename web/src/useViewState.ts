// The view state of the page, kept in the URL hash (Deviation 5): read once at
// start, written after every change, and read again when the reader edits or
// pastes a link (hashchange).
import { useEffect, useMemo, useState } from "react";
import type { View } from "./data";
import { knownIds } from "./scene";
import { decodeHash, storeHash, type ViewState } from "./state";

export function useViewState(view: View): [ViewState, (next: (s: ViewState) => ViewState) => void] {
  const known = useMemo(() => knownIds(view), [view]);
  const [state, setState] = useState(() => decodeHash(window.location.hash, known));
  useEffect(() => {
    storeHash(window.location, window.history, state);
  }, [state]);
  useEffect(() => {
    const onHash = () => setState(decodeHash(window.location.hash, known));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [known]);
  return [state, setState];
}
