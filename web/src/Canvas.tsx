import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useRef } from "react";
import "@xyflow/react/dist/style.css";
import { edgeMark } from "./change";
import { parentBox } from "./cut";
import type { View } from "./data";
import { absolute, triangles, type Placed } from "./layout";
import type { Scene, SceneNode } from "./scene";
import { boxStats } from "./tree";

type Data = {
  node: SceneNode;
  w: number;
  h: number;
  stats?: { packages: number; decls: number; unresolved: number };
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

// cls: the shape, the Change View mark (04 Part B), selection and dimming.
const cls = (base: string, n: SceneNode, selected: boolean) =>
  `node ${base}${n.change ? ` ${n.change}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}`;

function BoxNode({ data, selected }: NodeProps<ZNode>) {
  const s = data.stats;
  return (
    <div className={cls("box", data.node, selected)} title={data.node.id}>
      <Ends />
      <Toggle data={data} />
      <div className="label">{data.node.label}</div>
      {s && (
        <div className="stats">
          {s.packages > 1 && `${s.packages} pkgs · `}
          {s.decls} decls{s.unresolved > 0 && ` · ${s.unresolved} unresolved`}
        </div>
      )}
      <Marks data={data} />
    </div>
  );
}

function ContainerNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("container", data.node, selected)} title={data.node.id}>
      <Ends />
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

function ChipNode({ data }: NodeProps<ZNode>) {
  return <div className={cls("chip", data.node, false)}>{data.node.label}</div>;
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
  fit?: number; // fits the whole scene each time it changes (the f key)
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
  useEffect(() => {
    if (fit) void rf.fitView();
  }, [rf, fit]);
  const nodes: ZNode[] = [...sc.nodes]
    .sort((a, b) => depth(byId, a.id) - depth(byId, b.id) || (a.id < b.id ? -1 : 1))
    .map((node) => {
      const p = placed.get(node.id) ?? { x: 0, y: 0, w: 90, h: 40 };
      const stats = node.shape === "box" ? boxStats(view, node.id) : undefined;
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
        data: { node, w: p.w, h: p.h, stats, row: sc.selectedRow, pick: onSelect, toggle: onToggle },
      };
    });
  const rfEdges: Edge[] = sc.edges.map((e) => {
    const m = edgeMark(e.status);
    const label = [m.sign, e.pairs > 1 ? String(e.pairs) : ""].filter(Boolean).join(" ");
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      className: [m.cls, e.dim && "dim", e.hot && "hot", e.pinned && "pinned", e.id === edge && "selected"]
        .filter(Boolean)
        .join(" "),
      markerEnd: { type: MarkerType.ArrowClosed },
      ...(label ? { label } : {}),
    };
  });
  return (
    <div ref={box} className="flow">
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView={target === null}
        minZoom={0.05}
        zoomOnDoubleClick={false}
        onlyRenderVisibleElements
        onInit={() => performance.mark("zu-drawn")}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, n) => onSelect(n.id)}
        onNodeDoubleClick={(_, n) => {
          const node = byId.get(n.id);
          if (node) onOpen(node);
        }}
        onEdgeClick={(_, e) => onEdge?.(e.id)}
        onPaneClick={() => onSelect(null)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
