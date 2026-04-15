import fs from 'node:fs/promises';
import path from 'node:path';

import { validateContract } from './contracts.js';
import {
  extractWikiLinks,
  firstMeaningfulParagraph,
  parseSimpleFrontmatter,
  splitFrontmatter,
} from './markdown.js';
import {
  resolveWithinWorkspace,
  slugify,
} from './utils.js';

// Re-export for modules that import from persistence.js
export { resolveWithinWorkspace };

export const DEFAULT_POLICY_STATE = {
  version: 1,
  updated_at: '2026-04-14T00:00:00.000Z',
  classification_weights: {
    Projects: 1,
    Topics: 1,
    Decisions: 1,
    Skills: 1,
    Views: 1,
  },
  boundary_adjustments: [],
  auto_apply_thresholds: {
    link_addition: 0.84,
    minor_summary_update: 0.9,
    new_node_creation: 0.78,
    folder_move: 0.95,
    refactor_proposal: 0.92,
  },
};

export function getStorageDescriptor() {
  const requestedMode = String(process.env.P_REINFORCE_STORAGE_MODE || 'proposal_only').toLowerCase();
  const workspaceRoot = path.resolve(process.env.P_REINFORCE_WORKSPACE_ROOT || process.cwd());
  const vercelRuntime = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

  if (vercelRuntime) {
    return {
      requestedMode,
      mode: 'proposal_only',
      durable: false,
      writesEnabled: false,
      workspaceRoot,
      reason:
        'Vercel serverless storage is ephemeral, so the runtime refuses to claim durable persistence.',
    };
  }

  if (requestedMode === 'filesystem') {
    return {
      requestedMode,
      mode: 'filesystem',
      durable: true,
      writesEnabled: true,
      workspaceRoot,
      reason: 'Local filesystem persistence is active.',
    };
  }

  return {
    requestedMode,
    mode: 'proposal_only',
    durable: false,
    writesEnabled: false,
    workspaceRoot,
    reason: 'Proposal-only mode is active until persistent local storage is explicitly enabled.',
  };
}

export async function persistKnowledgeProposal(proposal) {
  const storage = getStorageDescriptor();

  if (!storage.writesEnabled) {
    return {
      persisted: false,
      storage,
      artifacts: predictArtifacts(proposal),
      warnings: [storage.reason],
    };
  }

  const policyState = await ensurePolicyState(storage.workspaceRoot);

  try {
    await writeTextArtifact(storage.workspaceRoot, proposal.sourceManifest.text_path, proposal.sourceText);
    await writeJsonArtifact(
      storage.workspaceRoot,
      `${proposal.rawRoot}/manifest.json`,
      proposal.sourceManifest,
    );

    for (const attachment of proposal.attachmentFiles ?? []) {
      await writeBinaryArtifact(storage.workspaceRoot, attachment.path, attachment.binary);
    }

    await writeTextArtifact(storage.workspaceRoot, proposal.wikiPath, proposal.markdown);
    await appendEvents(storage.workspaceRoot, proposal.events);

    const wikiNodes = await readWikiNodes(storage.workspaceRoot);
    const indexJson = await buildIndexJson(wikiNodes);
    const graphCache = await buildGraphCache(wikiNodes);

    await writeJsonArtifact(storage.workspaceRoot, '20_Meta/index.json', indexJson);
    await writeTextArtifact(storage.workspaceRoot, '20_Meta/index.md', buildIndexMarkdown(indexJson));
    await writeJsonArtifact(storage.workspaceRoot, '20_Meta/graph.cache.json', graphCache);

    return {
      persisted: true,
      storage,
      policyState,
      artifacts: [
        `${proposal.rawRoot}/manifest.json`,
        proposal.sourceManifest.text_path,
        ...proposal.attachmentFiles.map((attachment) => attachment.path),
        proposal.wikiPath,
        '20_Meta/index.json',
        '20_Meta/index.md',
        '20_Meta/graph.cache.json',
      ],
      derived: {
        indexNodeCount: indexJson.node_count,
        graphNodeCount: graphCache.node_count,
        graphEdgeCount: graphCache.edge_count,
      },
    };
  } catch (error) {
    await appendFailureEvent(storage.workspaceRoot, proposal, error);
    throw error;
  }
}

export async function ensurePolicyState(workspaceRoot) {
  await validateContract('PolicyState', DEFAULT_POLICY_STATE);

  const relativePath = '20_Meta/policy.json';
  const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);

  try {
    const existing = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    await validateContract('PolicyState', existing);
    return existing;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  await writeJsonArtifact(workspaceRoot, relativePath, DEFAULT_POLICY_STATE);
  await writeTextArtifact(
    workspaceRoot,
    '20_Meta/Policy.md',
    [
      '# Policy',
      '',
      '- version: 1',
      '- note: default policy created automatically by P-Reinforce Studio.',
    ].join('\n'),
  );

  return DEFAULT_POLICY_STATE;
}

async function buildIndexJson(wikiNodes) {
  const seenNodeIds = new Set();
  const activeNodes = [];

  for (const node of wikiNodes) {
    if (seenNodeIds.has(node.frontmatter.id)) {
      throw new Error(`Duplicate node ID detected during index build: ${node.frontmatter.id}`);
    }

    seenNodeIds.add(node.frontmatter.id);

    if (node.frontmatter.status !== 'archived') {
      activeNodes.push(node);
    }
  }

  const indexJson = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    node_count: activeNodes.length,
    entries: activeNodes
      .map((node) => ({
        node_id: node.frontmatter.id,
        title: node.frontmatter.title,
        node_type: node.frontmatter.node_type,
        path: node.relativePath,
        status: node.frontmatter.status,
        updated_at: node.frontmatter.updated_at,
        source_ref_count: node.frontmatter.source_refs.length,
        summary: firstMeaningfulParagraph(node.body).slice(0, 180),
      }))
      .sort((left, right) => left.path.localeCompare(right.path) || left.title.localeCompare(right.title)),
  };

  await validateContract('IndexJson', indexJson);
  return indexJson;
}

async function buildGraphCache(wikiNodes) {
  const titleLookup = new Map();
  const nodes = [];
  const edges = [];
  const edgeKeys = new Set();
  const categoryNodes = new Map();

  for (const node of wikiNodes) {
    nodes.push({
      id: node.frontmatter.id,
      label: node.frontmatter.title,
      node_kind: 'wiki',
      node_type: node.frontmatter.node_type,
      path: node.relativePath,
      status: node.frontmatter.status,
    });

    titleLookup.set(normalizeLookupKey(node.frontmatter.title), node.frontmatter.id);

    for (const alias of node.frontmatter.aliases ?? []) {
      titleLookup.set(normalizeLookupKey(alias), node.frontmatter.id);
    }

    const categoryNode = buildCategoryNode(node.frontmatter.category_path);
    categoryNodes.set(categoryNode.id, categoryNode);
    pushEdge(edgeKeys, edges, {
      source: node.frontmatter.id,
      target: categoryNode.id,
      relation: 'parent_category',
      weight: 1,
    });

    for (const targetId of node.frontmatter.related ?? []) {
      pushEdge(edgeKeys, edges, {
        source: node.frontmatter.id,
        target: targetId,
        relation: 'related',
        weight: 1,
      });
    }

    for (const targetId of node.frontmatter.contradicts ?? []) {
      pushEdge(edgeKeys, edges, {
        source: node.frontmatter.id,
        target: targetId,
        relation: 'contradicts',
        weight: 1,
      });
    }
  }

  for (const categoryNode of categoryNodes.values()) {
    nodes.push(categoryNode);
  }

  for (const node of wikiNodes) {
    const wikiLinks = extractWikiLinks(node.body);

    for (const linkTitle of wikiLinks) {
      const targetId = titleLookup.get(normalizeLookupKey(linkTitle));

      if (!targetId) {
        continue;
      }

      pushEdge(edgeKeys, edges, {
        source: node.frontmatter.id,
        target: targetId,
        relation: 'wikilink',
        weight: 1,
      });
    }
  }

  const graphCache = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
  };

  await validateContract('GraphCache', graphCache);
  return graphCache;
}

export async function readWikiNodes(workspaceRoot) {
  const wikiRoot = resolveWithinWorkspace(workspaceRoot, '10_Wiki');
  const files = await walkMarkdownFiles(wikiRoot);
  const records = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(workspaceRoot, absolutePath).replaceAll('\\', '/');
    const content = await fs.readFile(absolutePath, 'utf8');
    const { frontmatter, body } = splitFrontmatter(content);
    const parsed = parseSimpleFrontmatter(frontmatter);

    await validateContract('WikiNodeFrontmatter', parsed);

    records.push({
      relativePath,
      body,
      frontmatter: parsed,
    });
  }

  return records;
}

async function walkMarkdownFiles(rootDirectory) {
  try {
    const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const absolutePath = path.join(rootDirectory, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await walkMarkdownFiles(absolutePath)));
        continue;
      }

      if (entry.isFile() && absolutePath.endsWith('.md')) {
        files.push(absolutePath);
      }
    }

    return files;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function appendEvents(workspaceRoot, events) {
  for (const event of events) {
    await validateContract('EventLogEntry', event);

    const date = event.timestamp.slice(0, 10);
    const [year, month, day] = date.split('-');
    const relativePath = `20_Meta/events/${year}/${month}/${day}.jsonl`;
    const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.appendFile(absolutePath, `${JSON.stringify(event)}\n`, 'utf8');
  }
}

export async function writeJsonArtifact(workspaceRoot, relativePath, value) {
  await writeTextArtifact(workspaceRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextArtifact(workspaceRoot, relativePath, content) {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, String(content), 'utf8');
}

async function writeBinaryArtifact(workspaceRoot, relativePath, binary) {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, binary);
}

function buildIndexMarkdown(indexJson) {
  const lines = ['# Index', '', `- generated_at: ${indexJson.generated_at}`, ''];

  for (const entry of indexJson.entries) {
    lines.push(`- [[${entry.title}]] (${entry.node_type}) -> ${entry.path}`);
  }

  return lines.join('\n');
}

function buildCategoryNode(categoryPath) {
  const segments = String(categoryPath).replace(/^10_Wiki\//, '').split('/');
  const id = `cat_${segments.map((segment) => slugify(segment)).join('_')}`;

  return {
    id,
    label: segments.join(' / '),
    node_kind: 'category',
    node_type: 'category',
    status: 'active',
  };
}



function predictArtifacts(proposal) {
  return [
    `${proposal.rawRoot}/manifest.json`,
    proposal.sourceManifest.text_path,
    ...(proposal.attachmentFiles ?? []).map((attachment) => attachment.path),
    proposal.wikiPath,
    '20_Meta/index.json',
    '20_Meta/index.md',
    '20_Meta/graph.cache.json',
  ];
}

async function appendFailureEvent(workspaceRoot, proposal, error) {
  const errorEvent = {
    event_id: createEventId('err1'),
    timestamp: new Date().toISOString(),
    event_type: 'error',
    source_ids: [proposal.sourceManifest.source_id],
    node_ids: [proposal.frontmatter.id],
    policy_version: 1,
    schema_version: 1,
    summary: `Persistence failed for ${proposal.frontmatter.id}.`,
    details: {
      message: error instanceof Error ? error.message : 'Unknown persistence failure.',
    },
  };

  try {
    await appendEvents(workspaceRoot, [errorEvent]);
  } catch {
    // Preserve the original failure even if the error event could not be appended.
  }
}

function pushEdge(edgeKeys, edges, edge) {
  const key = `${edge.source}:${edge.target}:${edge.relation}`;

  if (edgeKeys.has(key)) {
    return;
  }

  edgeKeys.add(key);
  edges.push(edge);
}

function normalizeLookupKey(value) {
  return String(value).trim().toLowerCase();
}



export function createEventId(suffix) {
  const iso = new Date().toISOString();
  const compactDate = iso.slice(0, 10).replaceAll('-', '');
  const compactTime = iso.slice(11, 19).replaceAll(':', '');
  return `evt_${compactDate}_${compactTime}_${suffix}`;
}
