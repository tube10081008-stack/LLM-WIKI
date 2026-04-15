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
  if (!focusEntry || !graphCache) {
    return null;
  }

  const nodeLookup = new Map((graphCache.nodes ?? []).map((node) => [node.id, node]));
  const focusNode = nodeLookup.get(focusEntry.node_id);

  if (!focusNode) {
    return null;
  }

  const relatedEdges = (graphCache.edges ?? []).filter(
    (edge) =>
      edge.source === focusEntry.node_id &&
      (edge.relation === 'related' || edge.relation === 'wikilink'),
  );
  const categoryEdge = (graphCache.edges ?? []).find(
    (edge) => edge.source === focusEntry.node_id && edge.relation === 'parent_category',
  );
  const uiNodes = [
    {
      id: focusNode.id,
      label: focusNode.label,
      role: 'core',
      meta: focusEntry.path,
    },
  ];
  const uiEdges = [];

  if (categoryEdge) {
    const categoryNode = nodeLookup.get(categoryEdge.target);

    if (categoryNode) {
      uiNodes.push({
        id: categoryNode.id,
        label: categoryNode.label,
        role: 'category',
        meta: 'persisted category',
      });
      uiEdges.push({
        id: `edge-${focusNode.id}-${categoryNode.id}`,
        source: focusNode.id,
        target: categoryNode.id,
        label: 'category',
      });
    }
  }

  for (const edge of relatedEdges.slice(0, 6)) {
    const targetNode = nodeLookup.get(edge.target);

    if (!targetNode) {
      continue;
    }

    uiNodes.push({
      id: targetNode.id,
      label: targetNode.label,
      role: 'related',
      meta: targetNode.path ?? targetNode.node_type,
    });
    uiEdges.push({
      id: `edge-${focusNode.id}-${targetNode.id}-${edge.relation}`,
      source: focusNode.id,
      target: targetNode.id,
      label: edge.relation,
    });
  }

  return {
    nodes: uiNodes,
    edges: uiEdges,
  };
}


