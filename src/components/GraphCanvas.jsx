import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useNodesState,
  useEdgesState,
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

const ROLE_FILTER_OPTIONS = ['core', 'category', 'tag', 'related'];

function GraphCanvas({ graph }) {
  const [activeFilter, setActiveFilter] = useState(null);
  const { initialNodes, initialEdges } = useMemo(() => buildFlowGraph(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // 필터 토글: 같은 버튼 다시 누르면 해제
  const handleFilterToggle = useCallback((role) => {
    setActiveFilter((prev) => (prev === role ? null : role));
  }, []);

  // 필터링된 노드와 엣지 계산
  const { filteredNodes, filteredEdges } = useMemo(() => {
    if (!activeFilter) {
      // 필터 없으면 전부 보여주되, 투명도 리셋
      return {
        filteredNodes: nodes.map((n) => ({
          ...n,
          style: { ...n.style, opacity: 1, transition: 'opacity 0.3s ease' },
        })),
        filteredEdges: edges.map((e) => ({
          ...e,
          style: { ...e.style, opacity: 1, transition: 'opacity 0.3s ease' },
          labelStyle: { ...e.labelStyle, opacity: 1, transition: 'opacity 0.3s ease' },
        })),
      };
    }

    // core 노드는 항상 보이게
    const visibleNodeIds = new Set();
    nodes.forEach((n) => {
      if (n.data.role === activeFilter || n.data.role === 'core') {
        visibleNodeIds.add(n.id);
      }
    });

    const filteredNodes = nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        opacity: visibleNodeIds.has(n.id) ? 1 : 0.12,
        transition: 'opacity 0.3s ease',
        pointerEvents: visibleNodeIds.has(n.id) ? 'all' : 'none',
      },
    }));

    const filteredEdges = edges.map((e) => {
      const isVisible = visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target);
      return {
        ...e,
        style: {
          ...e.style,
          opacity: isVisible ? 1 : 0.06,
          transition: 'opacity 0.3s ease',
        },
        labelStyle: {
          ...e.labelStyle,
          opacity: isVisible ? 1 : 0.06,
          transition: 'opacity 0.3s ease',
        },
      };
    });

    return { filteredNodes, filteredEdges };
  }, [nodes, edges, activeFilter]);

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
          {ROLE_FILTER_OPTIONS.map((role) => (
            <FilterChip
              key={role}
              tone={role}
              active={activeFilter === role}
              onClick={() => handleFilterToggle(role)}
            >
              {role === 'core' ? '메인 노드' : role === 'category' ? '카테고리' : role === 'tag' ? '태그' : '연결 노드'}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="h-[680px] w-full">
        <ReactFlow
          nodes={filteredNodes}
          edges={filteredEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.22 }}
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

function FilterChip({ tone, active, onClick, children }) {
  const baseClass =
    tone === 'core'
      ? 'bg-sky text-white'
      : tone === 'category'
        ? 'bg-slate-200 text-slate-700'
        : tone === 'related'
          ? 'bg-orange-100 text-orange-700'
          : 'bg-sky/10 text-sky';

  const activeRing = active ? 'ring-2 ring-offset-1 ring-sky shadow-md scale-105' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer select-none hover:scale-105 ${baseClass} ${activeRing}`}
    >
      {children}
    </button>
  );
}

function buildFlowGraph(graph) {
  const coreNode = graph.nodes.find((node) => node.role === 'core') ?? graph.nodes[0];
  const categoryNode = graph.nodes.find((node) => node.role === 'category');
  const tagNodes = graph.nodes.filter((node) => node.role === 'tag');
  const relatedNodes = graph.nodes.filter((node) => node.role === 'related');
  const positions = {};

  // 코어 노드: 정중앙
  if (coreNode) {
    positions[coreNode.id] = { x: 0, y: 0 };
  }

  // 카테고리: 코어 위쪽 (충분히 떨어뜨림)
  if (categoryNode) {
    positions[categoryNode.id] = { x: 0, y: -280 };
  }

  // 태그: 코어 왼쪽 반원에 펼침 (겹침 방지)
  tagNodes.forEach((node, index) => {
    const angle = Math.PI * 0.6 + (Math.PI * 0.8 / Math.max(tagNodes.length, 1)) * index;
    const radius = 360 + (index % 2) * 80; // 지그재그 배치
    positions[node.id] = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * (radius * 0.65),
    };
  });

  // 연결 노드: 코어 오른쪽 반원에 펼침
  relatedNodes.forEach((node, index) => {
    const angle = -Math.PI * 0.3 + (Math.PI * 0.6 / Math.max(relatedNodes.length, 1)) * index;
    const radius = 380 + (index % 2) * 90;
    positions[node.id] = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * (radius * 0.65),
    };
  });

  const initialNodes = graph.nodes.map((node) => {
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

  const initialEdges = graph.edges.map((edge) => ({
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

  return { initialNodes, initialEdges };
}

function roleToLabel(role) {
  if (role === 'core') return 'Main Node';
  if (role === 'category') return 'Category';
  if (role === 'related') return 'Linked Node';
  return 'Tag';
}

export default GraphCanvas;
