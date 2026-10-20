// 17: the Screen drawn (screen.ts placeScreen). No ELK: the boxes are placed
// before React Flow sees them, so nothing waits for a layout. A click on a box
// re-centres the Screen on it; a click on a row's "+N more" chip draws the
// rows whole. The page keys this by the Centre and that flag, so each Screen
// opens at its own first view (centredFit).
import {
  Background,
  ControlButton,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { edgeMark } from "./change";
import type { Drawn, ScreenDrawing } from "./screen";
import { centredFit, mapByDefault } from "./viewport";

type SNode = Node<{ d: Drawn }>;

// ScreenBox: the label at its Weight's size, the package or module under it,
// and what the Weight is made of. 18: in a Change View, its mark (change.ts),
// a ghost dotted, and the Centre's changed members.
function ScreenBox({ data: { d } }: NodeProps<SNode>) {
  const at = useRef<HTMLDivElement>(null);
  // Focus, lost with the last Screen (the page keys it by Centre), goes to
  // the Centre's box, so a reader walking by keyboard goes on from it.
  useEffect(() => {
    if (d.row === "centre" && document.activeElement === document.body) {
      at.current?.closest<HTMLElement>(".react-flow__node")?.focus({ preventScroll: true });
    }
  }, [d.row]);
  return (
    <div ref={at} className={`node screen-box ${d.size} k-${d.kind}${d.both ? " both" : ""}${d.mark ? ` ${d.mark}` : ""}${d.ghost ? " ghost" : ""}`} title={d.ref ?? `${d.label}: click to draw every box`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
      <div className="label">{d.label}</div>
      {d.sub && <div className="sub">{d.sub}</div>}
      {d.facts && <div className="facts">{d.facts}</div>}
      {d.members.map((m) => <div key={m} className="member">{m}</div>)}
    </div>
  );
}

const nodeTypes = { screen: ScreenBox };

type Props = {
  drawing: ScreenDrawing;
  onCentre: (id: string) => void;
  onMore: () => void;
  fit?: number; // the first view again each time it changes (the f key)
};

export function ScreenCanvas({ drawing, onCentre, onMore, fit }: Props) {
  const rf = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const [whole, setWhole] = useState(true);
  const [map, setMap] = useState(() => mapByDefault(window.innerWidth));
  const fitted = useRef<number | null>(null);
  useEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (fitted.current === (fit ?? 0) || !r || r.width === 0 || r.height === 0) return;
    fitted.current = fit ?? 0;
    const centre = drawing.nodes.find((n) => n.row === "centre")!;
    const { whole: all, ...v } = centredFit(drawing.nodes, centre, { w: r.width, h: r.height });
    setWhole(all);
    void rf.setViewport(v);
  }, [rf, fit, drawing]);
  const byId = useMemo(() => new Map(drawing.nodes.map((d) => [d.id, d])), [drawing]);
  const pick = (id: string | null) => {
    const d = id === null ? undefined : byId.get(id);
    if (d?.ref === null) onMore();
    else if (d && d.row !== "centre") onCentre(d.ref);
  };
  const nodes: SNode[] = useMemo(() => drawing.nodes.map((d) => ({
    id: d.id,
    type: "screen",
    position: { x: d.x, y: d.y },
    width: d.w,
    height: d.h,
    style: { width: d.w, height: d.h },
    selected: d.row === "centre",
    draggable: false,
    connectable: false,
    data: { d },
  })), [drawing]);
  // 18: a line's status as the tree draws a bundle's (Canvas), its sign the
  // label, and red (pinned) when it holds a violation; a ghost's line is
  // dotted and unsigned: its box says ⇄.
  const edges: Edge[] = useMemo(() => drawing.edges.map((e) => {
    const m = edgeMark(e.status);
    const className = [m.cls, e.ghost && "ghost", e.violation && "pinned"].filter(Boolean).join(" ");
    return {
      id: e.id, source: e.from, target: e.to, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed },
      ...(className ? { className } : {}), ...(m.sign && !e.ghost ? { label: m.sign } : {}),
    };
  }), [drawing]);
  return (
    <div className="flow-row">
      {/* Enter or Space on a focused box re-centres, as a click does. */}
      <div ref={box} className="flow screen" onKeyDown={(e) => {
        const n = e.target as HTMLElement;
        if (!n.classList?.contains("react-flow__node") || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        pick(n.getAttribute("data-id"));
      }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={0.05}
          zoomOnDoubleClick={false}
          onInit={() => performance.mark("zu-drawn")}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable
          onNodeClick={(_, n) => pick(n.id)}
        >
          <Background />
          <Controls showInteractive={false}>
            {!whole && (
              <ControlButton className="zu-map" onClick={() => setMap((m) => !m)} title={map ? "Hide the minimap" : "Show the minimap"} aria-label={map ? "Hide the minimap" : "Show the minimap"} aria-pressed={map}>
                ▦
              </ControlButton>
            )}
          </Controls>
          {!whole && map && <MiniMap pannable zoomable ariaLabel="Minimap" />}
        </ReactFlow>
      </div>
    </div>
  );
}
