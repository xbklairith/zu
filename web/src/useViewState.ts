// The view state of the page, kept in the URL hash (Deviation 5): read once at
// start, written after every change, and read again when the reader edits or
// pastes a link (hashchange), or when zu serve's watch sends a new View (13),
// which drops what the View no longer has, such as a deleted selection.
import { useEffect, useRef, useState } from "react";
import type { View } from "./data";
import { readHash, revalidate } from "./proposal";
import { storeHash, type ViewState } from "./state";

export function useViewState(view: View): [ViewState, (next: (s: ViewState) => ViewState) => void] {
  const [state, setState] = useState(() => readHash(window.location.hash, view));
  useEffect(() => {
    storeHash(window.location, window.history, state);
  }, [state]);
  const read = useRef(view);
  useEffect(() => {
    if (read.current === view) return;
    read.current = view;
    setState((s) => revalidate(s, view));
  }, [view]);
  useEffect(() => {
    const onHash = () => setState(readHash(window.location.hash, view));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [view]);
  return [state, setState];
}
