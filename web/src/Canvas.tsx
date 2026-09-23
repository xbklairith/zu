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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { View } from "./data";
import type { Item, Placed } from "./layout";
import type { Bundle } from "./tree";
import { boxStats } from "./tree";

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

function BoxNode({ data, selected }: NodeProps<ZNode>) {
  const s = data.stats;
  return (
    <div className={`node box${selected ? " selected" : ""}`} title={data.item.id}>
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
    <div className="node container" title={data.item.id}>
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
    <div className={`node decl${selected ? " selected" : ""}`} title={data.item.id}>
      <Ends />
      <div className="label">{data.item.label}</div>
      {data.item.rows?.map((r) => (
        <div
          key={r}
          className="row"
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

const nodeTypes = { container: ContainerNode, box: BoxNode, oval: OvalNode, outside: OutsideNode, decl: DeclNode };

type Props = {
  view: View;
  items: Item[];
  edges: Bundle[];
  placed: Map<string, Placed>;
  selected: string;
  onSelect: (id: string) => void;
  onOpen: (item: Item) => void;
};

// depth orders parents before children, as React Flow requires.
function depth(items: Map<string, Item>, id: string): number {
  let d = 0;
  for (let p = items.get(id)?.parent; p; p = items.get(p)?.parent) d++;
  return d;
}

export function Canvas({ view, items, edges, placed, selected, onSelect, onOpen }: Props) {
  const byId = new Map(items.map((i) => [i.id, i]));
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
  const rfEdges: Edge[] = edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    ...(e.pairs > 1 ? { label: String(e.pairs) } : {}),
  }));
  return (
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.05}
      zoomOnDoubleClick={false}
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
  );
}
