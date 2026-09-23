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
import type { View } from "./data";
import type { Item, Placed } from "./layout";
import type { Bundle } from "./tree";
import { boxStats, parentBox } from "./tree";

type Data = {
  item: Item;
  stats?: { packages: number; decls: number; unresolved: number };
  pick: (id: string) => void;
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

function cls(base: string, item: Item, selected: boolean): string {
  return `node ${base}${item.mark ? ` ${item.mark}` : ""}${selected ? " selected" : ""}`;
}

function BoxNode({ data, selected }: NodeProps<ZNode>) {
  const s = data.stats;
  return (
    <div className={cls("box", data.item, selected)} title={data.item.id}>
      <Ends />
      <div className="label">{data.item.label}</div>
      {s && (
        <div className="stats">
          {s.packages > 1 && `${s.packages} pkgs · `}
          {s.decls} decls{s.unresolved > 0 && ` · ${s.unresolved} unresolved`}
        </div>
      )}
    </div>
  );
}

function ContainerNode({ data }: NodeProps<ZNode>) {
  return (
    <div className={cls("container", data.item, false)} title={data.item.id}>
      <Ends />
      <div className="label">{data.item.label}</div>
    </div>
  );
}

function OvalNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={`node oval${selected ? " selected" : ""}`} title={data.item.id}>
      <Ends />
      <div className="label">{data.item.label}</div>
    </div>
  );
}

function OutsideNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={`node outside${selected ? " selected" : ""}`}>
      <Ends />
      <div className="label">{data.item.label}</div>
    </div>
  );
}

function DeclNode({ data, selected }: NodeProps<ZNode>) {
  return (
    <div className={cls("decl", data.item, selected)} title={data.item.id}>
      <Ends />
      <div className="label">{data.item.label}</div>
      {data.item.rows?.map((r, i) => (
        <div
          key={r}
          className={`row ${data.item.rowMarks?.[i] ?? ""}`}
          onClick={(e) => {
            e.stopPropagation();
            data.pick(`${data.item.id}.${r}`);
          }}
        >
          .{r}
        </div>
      ))}
    </div>
  );
}

function ChipNode({ data }: NodeProps<ZNode>) {
  return <div className="node chip">{data.item.label}</div>;
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
  items: Item[];
  edges: Bundle[];
  placed: Map<string, Placed>;
  selected: string;
  onSelect: (id: string) => void;
  onOpen: (item: Item) => void;
  center?: { id: string; seq: number }; // a node to bring into view
};

// drawnFor is the drawn item standing for id: itself, its #pkg leaf, or the
// nearest enclosing box on the canvas.
function drawnFor(view: View, items: Map<string, Item>, id: string): string | null {
  for (let b = id; b !== ""; b = parentBox(view, b)) {
    if (items.has(b)) return b;
    if (items.has(b + "#pkg")) return b + "#pkg";
  }
  return null;
}

// depth orders parents before children, as React Flow requires.
function depth(items: Map<string, Item>, id: string): number {
  let d = 0;
  for (let p = items.get(id)?.parent; p; p = items.get(p)?.parent) d++;
  return d;
}

export function Canvas({ view, items, edges, placed, selected, onSelect, onOpen, center }: Props) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rf = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const target = center ? drawnFor(view, byId, center.id) : null;
  // Centre from the layout, not fitView: fitView waits for DOM-measured nodes,
  // and these are sized by the layout. The canvas is measured here, after the
  // commit that may have opened the panel beside it.
  useEffect(() => {
    const p = target === null ? undefined : placed.get(target);
    const r = box.current?.getBoundingClientRect();
    if (!p || !r || r.width === 0 || r.height === 0) return;
    const { width, height } = r;
    let x = p.x;
    let y = p.y;
    for (let q = p.parent; q; q = placed.get(q)?.parent) {
      x += placed.get(q)?.x ?? 0;
      y += placed.get(q)?.y ?? 0;
    }
    const zoom = Math.min(1.2, (0.8 * width) / p.w, (0.8 * height) / p.h);
    void rf.setCenter(x + p.w / 2, y + p.h / 2, { zoom });
  }, [rf, target, placed, center?.seq]);
  const nodes: ZNode[] = [...items]
    .sort((a, b) => depth(byId, a.id) - depth(byId, b.id) || (a.id < b.id ? -1 : 1))
    .map((item) => {
      const p = placed.get(item.id) ?? { x: 0, y: 0, w: 90, h: 40 };
      const stats = item.shape === "box" ? boxStats(view, item.id) : undefined;
      return {
        id: item.id,
        type: item.shape,
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        style: { width: p.w, height: p.h },
        ...(item.parent ? { parentId: item.parent } : {}),
        selected: item.id === selected,
        draggable: false,
        connectable: false,
        data: { item, stats, pick: onSelect },
      };
    });
  const rfEdges: Edge[] = edges.map((e) => {
    const m = edgeMark(e.status);
    const label = [m.sign, e.pairs > 1 ? String(e.pairs) : ""].filter(Boolean).join(" ");
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      ...(m.cls ? { className: m.cls } : {}),
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
        onInit={() => performance.mark("zu-drawn")}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, n) => onSelect(n.id)}
        onNodeDoubleClick={(_, n) => {
          const item = byId.get(n.id);
          if (item) onOpen(item);
        }}
        onPaneClick={() => onSelect("")}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
