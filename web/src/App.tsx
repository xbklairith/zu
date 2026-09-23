import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./Canvas";
import type { View } from "./data";
import { Header } from "./Header";
import { Panel } from "./Panel";
import { layout, scene, type Item, type Placed } from "./layout";
import { autoDepth, parentBox } from "./tree";

const PKG = "#pkg";

export function App({ view }: { view: View }) {
  const [focus, setFocus] = useState("");
  const [selected, setSelected] = useState("");
  const depth = useMemo(() => autoDepth(view, focus), [view, focus]);
  const s = useMemo(() => scene(view, focus, depth), [view, focus, depth]);
  const [placed, setPlaced] = useState<{ focus: string; at: Map<string, Placed> } | null>(null);

  useEffect(() => {
    let live = true;
    performance.mark("zu-layout-start");
    layout(s.items, s.edges).then((at) => {
      performance.mark("zu-layout-end");
      if (live) setPlaced({ focus, at });
    });
    return () => {
      live = false;
    };
  }, [s, focus]);

  const go = (box: string) => {
    setFocus(box);
    setSelected("");
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus !== "") go(parentBox(view, focus));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, focus]);

  const open = (item: Item) => {
    if (item.shape === "box" || item.shape === "container") go(item.id);
  };
  const leaves = s.items.filter((i) => i.shape !== "container" && i.shape !== "oval" && i.shape !== "outside");
  const empty = s.items.length === 0 && focus !== "";
  const pkg = focus.endsWith(PKG) ? focus.slice(0, -PKG.length) : focus;

  return (
    <div className="app">
      <Header view={view} focus={focus} boxes={leaves.length} depth={depth} onFocus={go} />
      <main className="canvas">
        {empty ? (
          <div className="empty">
            Declarations not included. Re-run with <code>-include {pkg}</code>
          </div>
        ) : placed && placed.focus === focus ? (
          <ReactFlowProvider key={focus}>
            <Canvas
              view={view}
              items={s.items}
              edges={s.edges}
              placed={placed.at}
              selected={selected}
              onSelect={setSelected}
              onOpen={open}
            />
          </ReactFlowProvider>
        ) : (
          <div className="empty">Laying out…</div>
        )}
      </main>
      {selected && (
        <Panel
          view={view}
          focus={focus}
          depth={depth}
          id={selected}
          onClose={() => setSelected("")}
        />
      )}
    </div>
  );
}
