// The view state of the page, kept in the URL hash (Deviation 5): read once at
// start, written after every change, and read again when the reader edits or
// pastes a link (hashchange).
import { useEffect, useState } from "react";
import type { View } from "./data";
import { readHash } from "./proposal";
import { storeHash, type ViewState } from "./state";

export function useViewState(view: View): [ViewState, (next: (s: ViewState) => ViewState) => void] {
  const [state, setState] = useState(() => readHash(window.location.hash, view));
  useEffect(() => {
    storeHash(window.location, window.history, state);
  }, [state]);
  useEffect(() => {
    const onHash = () => setState(readHash(window.location.hash, view));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [view]);
  return [state, setState];
}
