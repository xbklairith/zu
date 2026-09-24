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
import { parentBox } from "./cut";
import type { View } from "./data";
import { isGroup } from "./group";
import { around } from "./edges";
import { absolute, triangles, type Placed } from "./layout";
import { crapGrade, crapLabel } from "./metrics";
import type { Scene, SceneEdge, SceneNode } from "./scene";
import { mapByDefault, readableFit } from "./viewport";

type Data = {
  node: SceneNode;
  w: number;
  h: number;
  row: string | null;
  pick: (id: string) => void;
  toggle?: (id: string) => void;
};
type ZNode = Node<Data>;

function Ends() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

// Marks are the triangles drawn when lines are hidden: incoming on top,
// outgoing below, red when a pinned (violating) bundle rides them.
function Marks({ data }: { data: Data }) {
  const m = data.node.mark;
  if (!m) return null;
  const t = triangles(data.w, data.h);
  return (
    <svg className="marks" width={data.w} height={data.h} overflow="visible" aria-hidden="true">
      {m.in && <polygon points={t.in} className={m.inPinned ? "pinned" : undefined} />}
      {m.out && <polygon points={t.out} className={m.outPinned ? "pinned" : undefined} />}
    </svg>
  );
}

function Toggle({ data }: { data: Data }) {
  const { node, toggle } = data;
  if (!node.toggle || !toggle) return null;
  const open = node.toggle === "expand";
  return (
    <button
      type="button"
      className="toggle nodrag"
      aria-label={open ? `Open ${node.label} here` : `Close ${node.label}`}
      onClick={(e) => {
        e.stopPropagation();
        toggle(node.id);
      }}
    >
      {open ? "+" : "−"}
    </button>
  );
}

// cls: the shape, the Change View mark (04 Part B), a violation hidden inside
// (07), the CRAP fill (08), selection and dimming.
const cls = (base: string, n: SceneNode, selected: boolean) =>
  `node ${base}${n.change ? ` ${n.change}` : ""}${n.hidden ? " hides-violation" : ""}${n.rank !== undefined ? " ranked" : ""}` +
  `${n.crap ? ` crap-${n.crap.band}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}${n.hub ? " hub" : ""}` +
  `${n.demoted ? " demoted" : ""}`;

// Crap is the CRAP badge (08), at the lower right, or in a container's
// header: the number and its band in words, so the fill is never the only
// sign. A box shows its worst μ+σ, a function its CRAP; "?" is no coverage
// data, which counts as red (decisions.md).
function Crap({ node }: { node: SceneNode }) {
  const c = node.crap;
  if (!c) return null;
  const what = node.shape === "decl" ? "CRAP" : "worst CRAP μ+σ";
  const title = c.risk === null
    ? "No coverage data: counts as red"
    : `${what} ${c.risk} (grade ${crapGrade(c.risk).toFixed(1)} of 10)`;
  return (
    <span className="crap" title={title}>
      {crapLabel(c.risk)}
    </span>
  );
}

// Rank is the Policy rank at the upper left (uml-viewer README: "Class boxes
// show the current view's rank (innermost 0) at the upper left").
function Rank({ node }: { node: SceneNode }) {
  if (node.rank === undefined) return null;
  return (
    <span className="rank" title={`Level ${node.rank} (0 = innermost)`}>
      {node.rank}
    </span>
  );
}

function BoxNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("box", data.node, selected)} title={data.node.id}>
      <Ends />
      <Rank node={data.node} />
      <Crap node={data.node} />
      <Toggle data={data} />
      <div className="label">{data.node.label}</div>
      {data.node.stats && <div className="stats">{data.node.stats}</div>}
      <Marks data={data} />
    </div>
  );
}

function ContainerNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("container", data.node, selected)} title={data.node.id}>
      <Ends />
      <Rank node={data.node} />
      <Crap node={data.node} />
      <Toggle data={data} />
      <div className="label">{data.node.label}</div>
      <Marks data={data} />
    </div>
  );
}

function OvalNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("oval", data.node, selected)} title={data.node.id}>
      <Ends />
      <div className="label">{data.node.label}</div>
      <Marks data={data} />
    </div>
  );
}

function OutsideNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("outside", data.node, selected)}>
      <Ends />
      <div className="label">{data.node.label}</div>
      <Marks data={data} />
    </div>
  );
}

function DeclNode({ data, selected }: NodeProps<ZNode>) {
  const { node } = data;
  return (
    <div className={cls("decl", node, selected)} title={node.id}>
      <Ends />
      <Crap node={node} />
      <div className="label">{node.label}</div>
      {node.methods.map((r, i) => (
        <div
          key={r}
          className={`row ${node.rowMarks?.[i] ?? ""}${data.row === `${node.id}.${r}` ? " selected" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            data.pick(`${node.id}.${r}`);
          }}
        >
          .{r}
        </div>
      ))}
      <Marks data={data} />
    </div>
  );
}

// ChipNode is a "+N" line of a Change View box (04), or a group (12): the
// strip or a fold chip, which a click opens in place (12, N4: at 1280 × 720
// the Panel opens over it after the first click, so no double-click).
function ChipNode({ data, selected }: NodeProps<ZNode>) {
  if (!isGroup(data.node.id)) return <div className={cls("chip", data.node, false)}>{data.node.label}</div>;
  return (
    <div className={cls("chip group", data.node, selected)} title={data.node.hint ?? data.node.label}>
      <Ends />
      <Toggle data={data} />
      <div className="label">{data.node.label}</div>
      {data.node.stats && <div className="stats">{data.node.stats}</div>}
    </div>
  );
}

const nodeTypes = {
  container: ContainerNode,
  box: BoxNode,
  oval: OvalNode,
  outside: OutsideNode,
  decl: DeclNode,
  chip: ChipNode,
};

type Props = {
  view: View;
  sc: Scene;
  placed: Map<string, Placed>;
  edge?: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (node: SceneNode) => void;
  onToggle?: (id: string) => void;
  onEdge?: (id: string) => void;
  center?: { id: string; seq: number }; // a node to bring into view
  fit?: number; // the first view again each time it changes (the f key)
};

// drawnFor is the drawn node standing for id: itself, its #pkg leaf, or the
// nearest enclosing box on the canvas.
function drawnFor(view: View, nodes: Map<string, SceneNode>, id: string): string | null {
  for (let b = id; b !== ""; b = parentBox(view, b)) {
    if (nodes.has(b)) return b;
    if (nodes.has(b + "#pkg")) return b + "#pkg";
  }
  return null;
}

// depth orders parents before children, as React Flow requires.
function depth(nodes: Map<string, SceneNode>, id: string): number {
  let d = 0;
  for (let p = nodes.get(id)?.parent; p; p = nodes.get(p)?.parent) d++;
  return d;
}

export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onEdge, center, fit }: Props) {
  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
  const rf = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const target = center ? (sc.selected ?? drawnFor(view, byId, center.id)) : null;
  // Centre from the layout, not fitView: fitView waits for DOM-measured nodes,
  // and these are sized by the layout. The canvas is measured here, after the
  // commit that may have opened the panel beside it; setCenter would use React
  // Flow's stored width, which updates only after that resize is observed.
  useEffect(() => {
    const p = target === null ? undefined : placed.get(target);
    const at = target === null ? null : absolute(placed, target);
    const r = box.current?.getBoundingClientRect();
    if (!p || !at || !r || r.width === 0 || r.height === 0) return;
    const zoom = Math.min(1.2, (0.8 * r.width) / p.w, (0.8 * r.height) / p.h);
    const cx = at.x + p.w / 2;
    const cy = at.y + p.h / 2;
    void rf.setViewport({ x: r.width / 2 - cx * zoom, y: r.height / 2 - cy * zoom, zoom });
  }, [rf, target, placed, center?.seq]);
  // 11: the first view, unless a node is centred instead, and the f key show
  // the scene at a readable zoom (viewport.ts), not fitView's; a scene larger
  // than that gets a minimap, which the reader can hide.
  const [whole, setWhole] = useState(true);
  // The minimap covers the canvas's lower right corner; its button in the
  // controls hides it, and shows it again. A narrow window starts without it.
  const [map, setMap] = useState(() => mapByDefault(window.innerWidth));
  const fitted = useRef<number | null>(null);
  useEffect(() => {
    const r = box.current?.getBoundingClientRect();
    const first = fitted.current === null;
    if (fitted.current === (fit ?? 0) || !r || r.width === 0 || r.height === 0) return;
    fitted.current = fit ?? 0;
    if (first && target !== null) return;
    const rects = [...placed].map(([id, p]) => ({ ...absolute(placed, id)!, w: p.w, h: p.h }));
    const { whole: all, ...v } = readableFit(rects, { w: r.width, h: r.height });
    setWhole(all);
    void rf.setViewport(v);
  }, [rf, fit, placed, target]);
  // 11: while lines are on demand, a hovered box draws its own over the rest.
  const [hover, setHover] = useState<string | null>(null);
  const nodes: ZNode[] = useMemo(() => [...sc.nodes]
    .sort((a, b) => depth(byId, a.id) - depth(byId, b.id) || (a.id < b.id ? -1 : 1))
    .map((node) => {
      const p = placed.get(node.id) ?? { x: 0, y: 0, w: 90, h: 40 };
      return {
        id: node.id,
        type: node.shape,
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        style: { width: p.w, height: p.h },
        ...(node.parent ? { parentId: node.parent, extent: "parent" as const } : {}),
        selected: node.selected,
        draggable: false,
        connectable: false,
        data: { node, w: p.w, h: p.h, row: sc.selectedRow, pick: onSelect, toggle: onToggle },
      };
    }), [sc, placed, onSelect, onToggle]); // byId comes from sc
  const drawn = new Set(sc.edges.map((e) => e.id));
  const hovered: SceneEdge[] = sc.lines || hover === null || hover === sc.selected ? []
    : around(sc.all, hover, (id) => byId.get(id)?.parent ?? "").filter((e) => !drawn.has(e.id)).map((e) => ({ ...e, hot: true, dim: false }));
  const rfEdges: Edge[] = [...sc.edges, ...hovered].map((e) => {
    const m = edgeMark(e.status);
    const label = [m.sign, e.pairs > 1 ? String(e.pairs) : ""].filter(Boolean).join(" ");
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      className: [m.cls, e.dim && "dim", e.hot && "hot", e.dir && `dep-${e.dir}`, e.pinned && "pinned", e.id === edge && "selected"]
        .filter(Boolean)
        .join(" "),
      markerEnd: { type: MarkerType.ArrowClosed },
      ...(label ? { label } : {}),
    };
  });
  return (
    <div className="flow-row">
      {/* 11: what the rows mean. Higher rows use lower ones (ranked, rank.ts);
          the bottom rank uses none of its siblings. Nothing more is promised:
          longest-path ranks do not lift a box nothing uses to the top. */}
      <div className="axis" role="note" aria-label="Rows: a box uses the rows below it; at the bottom, boxes that depend on nothing here">
        <span className="uses">
          <span className="v">uses</span>
          <span>↓</span>
        </span>
        <span className="v">depends on nothing here</span>
      </div>
    {/* 11: Enter or Space on a focused box selects it, as a click does; a
        button inside the box keeps its own keys. */}
    <div ref={box} className="flow" onKeyDown={(e) => {
      const n = e.target as HTMLElement;
      if (!n.classList?.contains("react-flow__node") || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      onSelect(n.getAttribute("data-id"));
    }}>
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        minZoom={0.05}
        zoomOnDoubleClick={false}
        onlyRenderVisibleElements
        onInit={() => performance.mark("zu-drawn")}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable
        onNodeClick={(_, n) => {
          onSelect(n.id);
          const node = byId.get(n.id);
          if (node && isGroup(node.id)) onOpen(node); // 12: a click opens or closes a group
        }}
        onNodeDoubleClick={(_, n) => {
          const node = byId.get(n.id);
          if (node && !isGroup(node.id)) onOpen(node);
        }}
        onEdgeClick={(_, e) => onEdge?.(e.id)}
        onPaneClick={() => onSelect(null)}
        onNodeMouseEnter={(_, n) => setHover(n.id)}
        onNodeMouseLeave={() => setHover(null)}
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
