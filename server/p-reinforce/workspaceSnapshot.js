import fs from 'node:fs/promises';
import path from 'node:path';

import { readWorkspaceAgentState } from './agent.js';
import { readGitAutomationStatus } from './gitAutomation.js';
import { buildLintReport } from './maintenance.js';
import { splitFrontmatter } from './markdown.js';
import { getStorageDescriptor } from './persistence.js';
import { resolveWithinWorkspace, walkFiles, readJsonArtifact } from './utils.js';

export async function readWorkspaceSnapshot() {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const [raw, indexJson, graphCache, policyState, agentState, git] = await Promise.all([
    readRawSummary(workspaceRoot),
    readJsonArtifact(workspaceRoot, '20_Meta/index.json'),
    readJsonArtifact(workspaceRoot, '20_Meta/graph.cache.json'),
    readJsonArtifact(workspaceRoot, '20_Meta/policy.json'),
    readWorkspaceAgentState(workspaceRoot).catch(() => null),
    readGitAutomationStatus(workspaceRoot).catch(() => null),
  ]);
  const events = await readRecentEvents(workspaceRoot, indexJson, 12);
  const lint = buildLintReport(indexJson, graphCache);

  const recentEntries = [...(indexJson?.entries ?? [])]
    .sort(
      (left, right) =>
        String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')) ||
        String(left.path ?? '').localeCompare(String(right.path ?? '')),
    )
    .slice(0, 6);

  const focusedGraph = buildFocusedGraph(indexJson, graphCache, recentEntries[0]);
  const categoryCount =
    graphCache?.nodes?.filter((node) => node.node_kind === 'category').length ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    storage,
    workspaceRoot,
    raw,
    wiki: {
      nodeCount: indexJson?.node_count ?? 0,
      recentEntries,
    },
    graph: {
      nodeCount: graphCache?.node_count ?? 0,
      edgeCount: graphCache?.edge_count ?? 0,
      categoryCount,
      focusedGraph,
    },
    policy: {
      version: policyState?.version ?? null,
      updatedAt: policyState?.updated_at ?? null,
      classificationWeights: policyState?.classification_weights ?? null,
      boundaryAdjustments: [...(policyState?.boundary_adjustments ?? [])].slice(-4).reverse(),
      linkThreshold: policyState?.auto_apply_thresholds?.link_addition ?? null,
    },
    lint,
    agent: agentState
      ? {
          state: agentState.status.state,
          watchRoot: agentState.status.watch_root,
          lastScanAt: agentState.status.last_scan_at,
          lastEventSummary: agentState.status.last_event_summary,
          watchMode: agentState.status.watch_mode,
          queueDepth: agentState.summary.queueDepth,
          processingCount: agentState.summary.processingCount,
          completedCount: agentState.summary.completedCount,
          failedCount: agentState.summary.failedCount,
          recentJobs: agentState.summary.recentJobs,
        }
      : null,
    git,
    derived: {
      hasIndex: Boolean(indexJson),
      hasGraphCache: Boolean(graphCache),
    },
    events,
  };
}

export async function readWorkspaceNodeDetail(nodePath) {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;

  if (!nodePath) {
    return null;
  }

  const absolutePath = resolveWithinWorkspace(workspaceRoot, nodePath);
  const content = await fs.readFile(absolutePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(content);
  const graphCache = await readJsonArtifact(workspaceRoot, '20_Meta/graph.cache.json');
  const indexJson = await readJsonArtifact(workspaceRoot, '20_Meta/index.json');
  const focusEntry = (indexJson?.entries ?? []).find((entry) => entry.path === nodePath);

  return {
    path: nodePath,
    frontmatter,
    body,
    markdown: content,
    graph: buildFocusedGraph(indexJson, graphCache, focusEntry),
  };
}

async function readRawSummary(workspaceRoot) {
  const manifests = await walkFiles(resolveWithinWorkspace(workspaceRoot, '00_Raw'), (absolutePath) =>
    absolutePath.endsWith(`${path.sep}manifest.json`) || absolutePath.endsWith('/manifest.json'),
  );
  const parsed = [];

  for (const manifestPath of manifests) {
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      parsed.push({
        sourceId: manifest.source_id,
        title: manifest.title,
        rawRoot: manifest.raw_root,
        createdAt: manifest.created_at,
        attachmentCount: manifest.attachments?.length ?? 0,
        status: manifest.status,
      });
    } catch {
      // Skip malformed manifests so one bad file does not hide the rest of the workspace.
    }
  }

  parsed.sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')));

  return {
    sourceCount: parsed.length,
    recentSources: parsed.slice(0, 6),
  };
}

async function readRecentEvents(workspaceRoot, indexJson, limit) {
  const files = await walkFiles(resolveWithinWorkspace(workspaceRoot, '20_Meta/events'), (absolutePath) =>
    absolutePath.endsWith('.jsonl'),
  );
  files.sort().reverse();
  const events = [];
  const nodeLookup = new Map((indexJson?.entries ?? []).map((entry) => [entry.node_id, entry]));

  for (const absolutePath of files) {
    const lines = String(await fs.readFile(absolutePath, 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse();

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const linkedEntry = (event.node_ids ?? [])
          .map((nodeId) => nodeLookup.get(nodeId))
          .find(Boolean);
        events.push({
          eventId: event.event_id,
          timestamp: event.timestamp,
          eventType: event.event_type,
          summary: event.summary,
          nodeId: linkedEntry?.node_id ?? null,
          nodeTitle: linkedEntry?.title ?? null,
          nodePath: linkedEntry?.path ?? null,
        });
      } catch {
        // Ignore malformed log lines and keep scanning later events.
      }

      if (events.length >= limit) {
        return events.sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
      }
    }
  }

  return events.sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
}

function buildFocusedGraph(indexJson, graphCache, focusEntry) {
  if (!graphCache) {
    return null;
  }

  const nodeLookup = new Map((graphCache.nodes ?? []).map((node) => [node.id, node]));
  const uiNodes = [];
  const uiEdges = [];
  const addedNodeIds = new Set();

  // 카테고리를 중심축(core)으로 배치 — 지식 그래프의 구조적 허브
  for (const node of graphCache.nodes ?? []) {
    if (node.node_kind === 'category') {
      uiNodes.push({
        id: node.id,
        label: node.label,
        role: 'core',
        meta: 'category hub',
      });
      addedNodeIds.add(node.id);
    } else if (node.node_kind === 'wiki') {
      uiNodes.push({
        id: node.id,
        label: node.label,
        role: 'related',
        meta: node.path ?? node.node_type,
      });
      addedNodeIds.add(node.id);
    }
  }

  // 모든 엣지를 추가하고, 타겟이 없으면 가상 노드 생성
  for (const edge of graphCache.edges ?? []) {
    // 자기 자신으로의 wikilink는 무시
    if (edge.source === edge.target) {
      continue;
    }

    // 소스가 존재하지 않으면 스킵
    if (!addedNodeIds.has(edge.source)) {
      continue;
    }

    // 타겟이 존재하지 않으면 가상(placeholder) 노드 추가
    if (!addedNodeIds.has(edge.target)) {
      const targetNode = nodeLookup.get(edge.target);
      const label = targetNode?.label || humanizeNodeId(edge.target);
      uiNodes.push({
        id: edge.target,
        label,
        role: 'tag',
        meta: edge.relation === 'related' ? 'related candidate' : edge.relation,
      });
      addedNodeIds.add(edge.target);
    }

    uiEdges.push({
      id: `edge-${edge.source}-${edge.target}-${edge.relation}`,
      source: edge.source,
      target: edge.target,
      label: edge.relation === 'parent_category' ? 'category' : edge.relation,
    });
  }

  // 카테고리가 없으면 가장 연결이 많은 위키 노드를 core로 승격
  if (uiNodes.length > 0 && !uiNodes.some((n) => n.role === 'core')) {
    const edgeCount = {};
    for (const edge of uiEdges) {
      edgeCount[edge.source] = (edgeCount[edge.source] || 0) + 1;
      edgeCount[edge.target] = (edgeCount[edge.target] || 0) + 1;
    }
    const mostConnected = uiNodes
      .filter((n) => n.role === 'related')
      .sort((a, b) => (edgeCount[b.id] || 0) - (edgeCount[a.id] || 0))[0];
    if (mostConnected) {
      mostConnected.role = 'core';
    }
  }

  return uiNodes.length > 0 ? { nodes: uiNodes, edges: uiEdges } : null;
}

function humanizeNodeId(nodeId) {
  return String(nodeId)
    .replace(/^node_(topic|skill|project|decision)_/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


