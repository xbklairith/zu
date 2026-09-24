import { deeper, EDGE_MODES, LABELS, LIMITS, nextStage, propose, shallower, type EdgeMode, type ViewState } from "./state";

type Props = {
  state: ViewState; depth: number; update: (next: (s: ViewState) => ViewState) => void;
  proposals: string[]; // 07: the Policy's Proposals, drawn only when chosen here
};

// Toolbar: one control per ViewState field; each calls one state change.
export function Toolbar({ state, depth, update, proposals }: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="View">
      <span>
        depth{" "}
        <button type="button" aria-label="One level shallower (-)" onClick={() => update((s) => shallower(s, depth))}>
          −
        </button>{" "}
        {depth}
        {state.depth === null ? " (auto)" : ""}{" "}
        <button type="button" aria-label="One level deeper (+)" onClick={() => update((s) => deeper(s, depth))}>
          +
        </button>{" "}
        <button
          type="button"
          disabled={state.depth === null}
          onClick={() => update((s) => ({ ...s, depth: null, toggled: [] }))}
        >
          auto
        </button>
      </span>
      <label>
        hops{" "}
        <select
          value={state.hops ?? ""}
          disabled={state.selected === null}
          onChange={(e) => update((s) => ({ ...s, hops: e.target.value ? Number(e.target.value) : null }))}
        >
          <option value="">off</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      <button type="button" title="Next declutter stage (d)" onClick={() => update((s) => ({ ...s, stage: nextStage(s.stage) }))}>
        {LABELS[state.stage]}
      </button>
      <label title="auto: every line when there are few, a box's own on selection or hover when there are many; off: triangles">
        edges{" "}
        <select value={state.edges} onChange={(e) => update((s) => ({ ...s, edges: e.target.value as EdgeMode }))}>
          {EDGE_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        min pairs{" "}
        <input
          type="number"
          min={1}
          max={LIMITS.minPairs}
          value={state.minPairs}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1 && n <= LIMITS.minPairs) update((s) => ({ ...s, minPairs: n }));
          }}
        />
      </label>
      <label>
        <input type="checkbox" checked={state.externals} onChange={(e) => update((s) => ({ ...s, externals: e.target.checked }))} />{" "}
        externals
      </label>
      {proposals.length > 0 && (
        <label>
          proposal{" "}
          <select value={state.proposal ?? ""} onChange={(e) => update((s) => propose(s, e.target.value || null))}>
            <option value="">none (Package Tree)</option>
            {proposals.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
