import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
} from '@xyflow/react';

const ROLE_STYLE_MAP = {
  core: {
    background: 'linear-gradient(180deg, rgba(8, 83, 168, 0.96) 0%, rgba(10, 132, 255, 0.92) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.22)',
    color: '#ffffff',
    width: 252,
  },
  category: {
    background: 'rgba(255, 255, 255, 0.92)',
    border: '1px solid rgba(10, 132, 255, 0.16)',
    color: '#0f172a',
    width: 190,
  },
  tag: {
    background: 'rgba(236, 246, 255, 0.96)',
    border: '1px solid rgba(10, 132, 255, 0.14)',
    color: '#0f172a',
    width: 174,
  },
  related: {
    background: 'rgba(255, 244, 239, 0.96)',
    border: '1px solid rgba(255, 138, 91, 0.16)',
    color: '#0f172a',
    width: 184,
  },
};

function GraphCanvas({ graph }) {
  const { nodes, edges } = buildFlowGraph(graph);

  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-white via-[#f7fbff] to-[#fff7f4]">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Interactive Knowledge Graph</p>
          <p className="mt-1 text-sm text-slate-500">
            중앙 노드를 기준으로 태그와 연결 후보가 퍼져나가는 구조입니다. 드래그와 확대
            축소로 탐색할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <LegendChip tone="core">메인 노드</LegendChip>
          <LegendChip tone="category">카테고리</LegendChip>
          <LegendChip tone="tag">태그</LegendChip>
          <LegendChip tone="related">연결 노드</LegendChip>
        </div>
      </div>

      <div className="h-[680px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.35}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          className="bg-transparent"
        >
          <MiniMap
            zoomable
            pannable
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              if (node.data.role === 'core') return '#0a84ff';
              if (node.data.role === 'category') return '#94a3b8';
              if (node.data.role === 'related') return '#ff8a5b';
              return '#8bc5ff';
            }}
          />
          <Controls showInteractive={false} />
          <Background color="rgba(148, 163, 184, 0.24)" gap={24} size={1.1} />
        </ReactFlow>
      </div>
    </div>
  );
}

function LegendChip({ tone, children }) {
  const className =
    tone === 'core'
      ? 'bg-sky text-white'
      : tone === 'category'
        ? 'bg-slate-200 text-slate-700'
        : tone === 'related'
          ? 'bg-orange-100 text-orange-700'
          : 'bg-sky/10 text-sky';

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function buildFlowGraph(graph) {
  const coreNode = graph.nodes.find((node) => node.role === 'core') ?? graph.nodes[0];
  const categoryNode = graph.nodes.find((node) => node.role === 'category');
  const tagNodes = graph.nodes.filter((node) => node.role === 'tag');
  const relatedNodes = graph.nodes.filter((node) => node.role === 'related');
  const positions = {};

  if (coreNode) {
    positions[coreNode.id] = { x: 0, y: 0 };
  }

  if (categoryNode) {
    positions[categoryNode.id] = { x: 0, y: -230 };
  }

  tagNodes.forEach((node, index) => {
    positions[node.id] = polarPosition(index, tagNodes.length, 320, -28);
  });

  relatedNodes.forEach((node, index) => {
    positions[node.id] = polarPosition(index, relatedNodes.length, 380, 156);
  });

  const nodes = graph.nodes.map((node) => {
    const style = ROLE_STYLE_MAP[node.role] ?? ROLE_STYLE_MAP.tag;

    return {
      id: node.id,
      type: 'default',
      position: positions[node.id] ?? { x: 120, y: 120 },
      draggable: true,
      data: {
        role: node.role,
        label: (
          <div className="flex flex-col gap-1 rounded-[28px] px-4 py-4 text-left">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70">
              {roleToLabel(node.role)}
            </span>
            <span className="text-sm font-semibold leading-6">{node.label}</span>
            {node.meta ? <span className="text-xs opacity-70">{node.meta}</span> : null}
          </div>
        ),
      },
      style: {
        width: style.width,
        color: style.color,
        background: style.background,
        border: style.border,
        borderRadius: '28px',
        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.10)',
        padding: 0,
      },
    };
  });

  const edges = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    animated: edge.label !== '분류',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: 'rgba(100, 116, 139, 0.55)',
    },
    style: {
      stroke: edge.label === '연결' ? 'rgba(255, 138, 91, 0.48)' : 'rgba(100, 116, 139, 0.42)',
      strokeWidth: edge.label === '연결' ? 1.8 : 1.4,
    },
    labelStyle: {
      fill: '#64748b',
      fontSize: 11,
      fontWeight: 600,
    },
  }));

  return { nodes, edges };
}

function polarPosition(index, total, radius, offsetDegrees) {
  const safeTotal = Math.max(total, 1);
  const angle = ((Math.PI * 2) / safeTotal) * index + degreesToRadians(offsetDegrees);

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * (radius * 0.72),
  };
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function roleToLabel(role) {
  if (role === 'core') return 'Main Node';
  if (role === 'category') return 'Category';
  if (role === 'related') return 'Linked Node';
  return 'Tag';
}

export default GraphCanvas;
