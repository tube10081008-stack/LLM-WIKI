import fs from 'node:fs/promises';

import { validateContract } from './contracts.js';
import { parseSimpleFrontmatter, splitFrontmatter } from './markdown.js';
import {
  appendEvents,
  createEventId,
  ensurePolicyState,
  getStorageDescriptor,
  resolveWithinWorkspace,
  writeJsonArtifact,
  writeTextArtifact,
} from './persistence.js';
import { readJsonArtifact, randomSuffix } from './utils.js';

const POLICY_CATEGORIES = ['Projects', 'Topics', 'Decisions', 'Skills', 'Views'];

export async function applyReinforcementFeedback(payload = {}) {
  const storage = getStorageDescriptor();

  if (!storage.writesEnabled) {
    return {
      applied: false,
      storage,
      warnings: [storage.reason],
      feedback: null,
      policyState: null,
    };
  }

  if (!payload.nodePath) {
    throw new Error('Reinforcement feedback requires a persisted node path.');
  }

  if (!['confirm_category', 'move_category', 'tighten_links'].includes(payload.signalType)) {
    throw new Error('Unsupported reinforcement signal.');
  }

  const nodeRecord = await readNodeRecord(storage.workspaceRoot, payload.nodePath);
  const currentCategory = extractCategoryBucket(nodeRecord.frontmatter.category_path);
  const targetCategory =
    payload.signalType === 'move_category'
      ? normalizeCategory(payload.targetCategory)
      : currentCategory;
  const note = String(payload.note ?? '').trim();
  const timestamp = new Date().toISOString();

  if (payload.signalType === 'move_category' && !targetCategory) {
    throw new Error('move_category feedback requires a valid target category.');
  }

  if (payload.signalType === 'confirm_category' && !currentCategory) {
    throw new Error('confirm_category feedback requires a recognized current category.');
  }

  const previousPolicy = await ensurePolicyState(storage.workspaceRoot);
  const nextPolicy = buildNextPolicyState(previousPolicy, {
    signalType: payload.signalType,
    currentCategory,
    targetCategory,
    note,
    timestamp,
  });

  await validateContract('PolicyState', nextPolicy);
  await writeJsonArtifact(storage.workspaceRoot, '20_Meta/policy.json', nextPolicy);
  await writeTextArtifact(
    storage.workspaceRoot,
    '20_Meta/Policy.md',
    buildPolicyMarkdown(nextPolicy, {
      nodeTitle: nodeRecord.frontmatter.title,
      signalType: payload.signalType,
      currentCategory,
      targetCategory,
      note,
      timestamp,
    }),
  );

  const event = {
    event_id: createEventId(randomSuffix()),
    timestamp,
    event_type: 'reinforce_update',
    node_ids: [nodeRecord.frontmatter.id],
    policy_version: nextPolicy.version,
    schema_version: 1,
    artifacts_touched: ['20_Meta/policy.json', '20_Meta/Policy.md'],
    summary: summarizeFeedback(nodeRecord.frontmatter.title, payload.signalType, targetCategory),
    details: {
      node_path: payload.nodePath,
      current_category: currentCategory,
      target_category: targetCategory,
      note,
    },
  };

  await appendEvents(storage.workspaceRoot, [event]);

  return {
    applied: true,
    storage,
    warnings: [],
    feedback: {
      nodeId: nodeRecord.frontmatter.id,
      nodeTitle: nodeRecord.frontmatter.title,
      nodePath: payload.nodePath,
      signalType: payload.signalType,
      currentCategory,
      targetCategory,
      note,
    },
    policyState: nextPolicy,
  };
}

export async function runWorkspaceLint() {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const [indexJson, graphCache] = await Promise.all([
    readJsonArtifact(workspaceRoot, '20_Meta/index.json'),
    readJsonArtifact(workspaceRoot, '20_Meta/graph.cache.json'),
  ]);
  const report = buildLintReport(indexJson, graphCache);

  if (!storage.writesEnabled) {
    return {
      persisted: false,
      storage,
      warnings: [storage.reason],
      report,
    };
  }

  const policyState = await ensurePolicyState(workspaceRoot);
  const event = {
    event_id: createEventId(randomSuffix()),
    timestamp: report.generatedAt,
    event_type: 'lint',
    node_ids: report.highlights.map((item) => item.nodeId).filter(Boolean),
    policy_version: policyState.version,
    schema_version: 1,
    artifacts_touched: ['20_Meta/index.json', '20_Meta/graph.cache.json'],
    summary: `Lint scanned ${report.nodeCount} nodes: ${report.orphanCount} orphan, ${report.weaklyLinkedCount} weak, ${report.staleCount} stale.`,
    details: {
      tone: report.tone,
      contradiction_count: report.contradictionCount,
      highlights: report.highlights,
    },
  };

  await appendEvents(workspaceRoot, [event]);

  return {
    persisted: true,
    storage,
    warnings: [],
    report,
  };
}

export function buildLintReport(indexJson, graphCache) {
  const generatedAt = new Date().toISOString();
  const entries = [...(indexJson?.entries ?? [])];
  const wikiNodeIds = new Set(entries.map((entry) => entry.node_id));
  const semanticConnections = new Map(entries.map((entry) => [entry.node_id, 0]));
  const contradictionNodes = new Set();
  let contradictionCount = 0;

  for (const edge of graphCache?.edges ?? []) {
    if (edge.relation === 'contradicts') {
      contradictionCount += 1;

      if (wikiNodeIds.has(edge.source)) {
        contradictionNodes.add(edge.source);
      }

      if (wikiNodeIds.has(edge.target)) {
        contradictionNodes.add(edge.target);
      }
    }

    if (
      edge.relation === 'parent_category' ||
      !wikiNodeIds.has(edge.source) ||
      !wikiNodeIds.has(edge.target)
    ) {
      continue;
    }

    semanticConnections.set(edge.source, (semanticConnections.get(edge.source) ?? 0) + 1);
    semanticConnections.set(edge.target, (semanticConnections.get(edge.target) ?? 0) + 1);
  }

  let orphanCount = 0;
  let weaklyLinkedCount = 0;
  let staleCount = 0;
  const highlights = [];

  for (const entry of entries) {
    const connectionCount = semanticConnections.get(entry.node_id) ?? 0;
    const ageDays = calculateAgeDays(entry.updated_at);

    if (connectionCount === 0) {
      orphanCount += 1;
      highlights.push(buildLintHighlight(entry, 'orphan', ageDays));
      continue;
    }

    if (contradictionNodes.has(entry.node_id)) {
      highlights.push(buildLintHighlight(entry, 'contradiction', ageDays));
    }

    if (connectionCount === 1) {
      weaklyLinkedCount += 1;
      highlights.push(buildLintHighlight(entry, 'weak_linking', ageDays));
    }

    if (ageDays >= 45) {
      staleCount += 1;
      highlights.push(buildLintHighlight(entry, 'stale', ageDays));
    }
  }

  const uniqueHighlights = dedupeHighlights(highlights).slice(0, 6);

  return {
    generatedAt,
    nodeCount: entries.length,
    orphanCount,
    weaklyLinkedCount,
    contradictionCount,
    staleCount,
    tone: deriveLintTone({ orphanCount, contradictionCount, weaklyLinkedCount, staleCount }),
    highlights: uniqueHighlights,
  };
}

async function readNodeRecord(workspaceRoot, nodePath) {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, nodePath);
  const content = await fs.readFile(absolutePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(content);

  return {
    nodePath,
    body,
    frontmatter: parseSimpleFrontmatter(frontmatter),
  };
}



function buildNextPolicyState(previousPolicy, feedback) {
  const nextPolicy = {
    ...previousPolicy,
    version: Number(previousPolicy.version ?? 0) + 1,
    updated_at: feedback.timestamp,
    classification_weights: {
      ...previousPolicy.classification_weights,
    },
    boundary_adjustments: [...(previousPolicy.boundary_adjustments ?? [])],
    auto_apply_thresholds: {
      ...previousPolicy.auto_apply_thresholds,
    },
  };

  if (feedback.signalType === 'confirm_category' && feedback.currentCategory) {
    nextPolicy.classification_weights[feedback.currentCategory] = roundWeight(
      (nextPolicy.classification_weights[feedback.currentCategory] ?? 1) + 0.08,
    );
  }

  if (feedback.signalType === 'move_category' && feedback.currentCategory && feedback.targetCategory) {
    if (feedback.currentCategory !== feedback.targetCategory) {
      nextPolicy.classification_weights[feedback.currentCategory] = roundWeight(
        Math.max(0, (nextPolicy.classification_weights[feedback.currentCategory] ?? 1) - 0.05),
      );
      nextPolicy.classification_weights[feedback.targetCategory] = roundWeight(
        (nextPolicy.classification_weights[feedback.targetCategory] ?? 1) + 0.18,
      );
      nextPolicy.boundary_adjustments.push({
        from: feedback.currentCategory,
        to: feedback.targetCategory,
        reason: feedback.note || 'User moved a persisted node to a different semantic category.',
        created_at: feedback.timestamp,
      });
    } else {
      nextPolicy.classification_weights[feedback.targetCategory] = roundWeight(
        (nextPolicy.classification_weights[feedback.targetCategory] ?? 1) + 0.08,
      );
    }
  }

  if (feedback.signalType === 'tighten_links') {
    nextPolicy.auto_apply_thresholds.link_addition = roundThreshold(
      Math.min(0.98, Number(nextPolicy.auto_apply_thresholds.link_addition ?? 0.84) + 0.03),
    );
  }

  return nextPolicy;
}

function buildPolicyMarkdown(policyState, recentFeedback) {
  const lines = [
    '# Policy',
    '',
    `- version: ${policyState.version}`,
    `- updated_at: ${policyState.updated_at}`,
    '',
    '## Classification Weights',
    ...POLICY_CATEGORIES.map(
      (category) => `- ${category}: ${Number(policyState.classification_weights?.[category] ?? 0).toFixed(2)}`,
    ),
    '',
    '## Auto Apply Thresholds',
    ...Object.entries(policyState.auto_apply_thresholds ?? {}).map(
      ([key, value]) => `- ${key}: ${Number(value).toFixed(2)}`,
    ),
    '',
    '## Recent Boundary Adjustments',
  ];

  const recentAdjustments = [...(policyState.boundary_adjustments ?? [])].slice(-6).reverse();

  if (!recentAdjustments.length) {
    lines.push('- none yet');
  } else {
    for (const adjustment of recentAdjustments) {
      lines.push(
        `- ${adjustment.created_at}: ${adjustment.from} -> ${adjustment.to} (${adjustment.reason})`,
      );
    }
  }

  if (recentFeedback) {
    lines.push('');
    lines.push('## Latest Feedback');
    lines.push(`- node: ${recentFeedback.nodeTitle}`);
    lines.push(`- signal: ${recentFeedback.signalType}`);

    if (recentFeedback.currentCategory) {
      lines.push(`- from: ${recentFeedback.currentCategory}`);
    }

    if (recentFeedback.targetCategory) {
      lines.push(`- to: ${recentFeedback.targetCategory}`);
    }

    if (recentFeedback.note) {
      lines.push(`- note: ${recentFeedback.note}`);
    }
  }

  return lines.join('\n');
}

function summarizeFeedback(nodeTitle, signalType, targetCategory) {
  if (signalType === 'confirm_category') {
    return `Policy reinforced the current category for ${nodeTitle}.`;
  }

  if (signalType === 'move_category') {
    return `Policy shifted ${nodeTitle} toward ${targetCategory}.`;
  }

  return `Policy tightened related-link confidence for ${nodeTitle}.`;
}

function extractCategoryBucket(categoryPath) {
  const segments = String(categoryPath ?? '')
    .split('/')
    .filter(Boolean);

  return segments.find((segment) => POLICY_CATEGORIES.includes(segment)) ?? null;
}

function normalizeCategory(category) {
  if (!category) {
    return null;
  }

  return POLICY_CATEGORIES.find((item) => item.toLowerCase() === String(category).toLowerCase()) ?? null;
}

function deriveLintTone({ orphanCount, contradictionCount, weaklyLinkedCount, staleCount }) {
  if (orphanCount > 0 || contradictionCount > 0) {
    return 'amber';
  }

  if (weaklyLinkedCount > 0 || staleCount > 0) {
    return 'slate';
  }

  return 'emerald';
}

function buildLintHighlight(entry, issue, ageDays) {
  return {
    nodeId: entry.node_id,
    title: entry.title,
    path: entry.path,
    issue,
    ageDays,
  };
}

function dedupeHighlights(highlights) {
  const seen = new Set();
  const priority = {
    orphan: 0,
    contradiction: 1,
    weak_linking: 2,
    stale: 3,
  };

  return [...highlights].sort((left, right) => {
    const rankGap = (priority[left.issue] ?? 99) - (priority[right.issue] ?? 99);

    if (rankGap !== 0) {
      return rankGap;
    }

    return String(left.path).localeCompare(String(right.path));
  }).filter((item) => {
    const key = `${item.nodeId}:${item.issue}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function calculateAgeDays(timestamp) {
  if (!timestamp) {
    return 0;
  }

  const updatedAt = new Date(timestamp);

  if (Number.isNaN(updatedAt.getTime())) {
    return 0;
  }

  const diffMs = Date.now() - updatedAt.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function roundWeight(value) {
  return Number(value.toFixed(2));
}

function roundThreshold(value) {
  return Number(value.toFixed(2));
}


