import fs from 'node:fs/promises';
import path from 'node:path';

import { validateContract } from './contracts.js';
import {
  appendEvents,
  createEventId,
  ensurePolicyState,
  getStorageDescriptor,
} from './persistence.js';
import { randomSuffix, readJsonArtifact, walkFiles } from './utils.js';
import { parseSimpleFrontmatter, splitFrontmatter } from './markdown.js';

const MIGRATION_MANIFEST_PATH = '30_Ops/migration-manifest.json';

/**
 * Read the current migration manifest from workspace.
 * Returns a default manifest if it doesn't exist yet.
 */
export async function readMigrationManifest(workspaceRoot) {
  const fullPath = path.resolve(workspaceRoot, MIGRATION_MANIFEST_PATH);

  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      schema_version: 1,
      migrations: [],
      rebuild_history: [],
    };
  }
}

/**
 * Persist the migration manifest.
 */
async function writeMigrationManifest(workspaceRoot, manifest) {
  const fullPath = path.resolve(workspaceRoot, MIGRATION_MANIFEST_PATH);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

/**
 * Scan all wiki nodes and return their frontmatter metadata for analysis.
 */
export async function scanWikiNodes(workspaceRoot) {
  const wikiRoot = path.resolve(workspaceRoot, '10_Wiki');
  const nodes = [];

  try {
    const files = await walkFiles(wikiRoot);

    for (const filePath of files) {
      if (!filePath.endsWith('.md')) {
        continue;
      }

      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const { front } = splitFrontmatter(raw);
        const frontmatter = front ? parseSimpleFrontmatter(front) : {};
        const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

        nodes.push({
          path: relativePath,
          title: frontmatter.title ?? path.basename(filePath, '.md'),
          schema_version: Number(frontmatter.schema_version ?? 1),
          knowledge_type: frontmatter.knowledge_type ?? 'unknown',
          date: frontmatter.date ?? null,
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
          connected_nodes: Array.isArray(frontmatter.connected_nodes)
            ? frontmatter.connected_nodes
            : [],
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // 10_Wiki doesn't exist yet
  }

  return nodes;
}

/**
 * Scan all raw source manifests and return metadata.
 */
export async function scanRawSources(workspaceRoot) {
  const rawRoot = path.resolve(workspaceRoot, '00_Raw');
  const sources = [];

  try {
    const files = await walkFiles(rawRoot);

    for (const filePath of files) {
      if (!filePath.endsWith('manifest.json')) {
        continue;
      }

      try {
        const manifest = await readJsonArtifact(filePath);

        if (manifest) {
          const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
          sources.push({
            path: relativePath,
            source_id: manifest.source_id ?? null,
            title: manifest.title ?? null,
            created_at: manifest.created_at ?? null,
            schema_version: manifest.schema_version ?? 1,
          });
        }
      } catch {
        // Skip unreadable manifests
      }
    }
  } catch {
    // 00_Raw doesn't exist yet
  }

  return sources;
}

/**
 * Build a rebuild plan: determine which wiki nodes need regeneration
 * based on policy changes, schema version upgrades, or template updates.
 */
export async function buildRebuildPlan(options = {}) {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const trigger = options.trigger ?? 'manual';

  const manifest = await readMigrationManifest(workspaceRoot);
  const wikiNodes = await scanWikiNodes(workspaceRoot);
  const rawSources = await scanRawSources(workspaceRoot);
  const policyState = await ensurePolicyState(workspaceRoot).catch(() => ({
    version: 1,
    confidence_threshold: 0.6,
  }));

  const currentSchemaVersion = manifest.schema_version;

  // Determine which nodes need rebuild
  const needsRebuild = [];
  const upToDate = [];

  for (const node of wikiNodes) {
    const reasons = [];

    // Schema version mismatch
    if (node.schema_version < currentSchemaVersion) {
      reasons.push(`schema_version ${node.schema_version} < ${currentSchemaVersion}`);
    }

    // Missing required fields (contract validation)
    if (!node.knowledge_type || node.knowledge_type === 'unknown') {
      reasons.push('missing knowledge_type');
    }

    if (!node.tags.length) {
      reasons.push('no tags');
    }

    if (!node.connected_nodes.length) {
      reasons.push('no connected_nodes');
    }

    if (reasons.length > 0) {
      needsRebuild.push({ ...node, rebuild_reasons: reasons });
    } else {
      upToDate.push(node);
    }
  }

  // Find orphaned raw sources (raw without matching wiki)
  const wikiPaths = new Set(wikiNodes.map((n) => n.path));
  const orphanedSources = rawSources.filter((source) => {
    // Check if any wiki node references this source
    // This is a heuristic — in a real system we'd track source_id → node_id mappings
    return source.source_id && !wikiNodes.some((node) =>
      node.connected_nodes.some((cn) => cn.includes(source.source_id)),
    );
  });

  return {
    trigger,
    timestamp: new Date().toISOString(),
    current_schema_version: currentSchemaVersion,
    policy_version: policyState.version,
    total_wiki_nodes: wikiNodes.length,
    total_raw_sources: rawSources.length,
    needs_rebuild: needsRebuild,
    up_to_date: upToDate.length,
    orphaned_sources: orphanedSources.length,
    rebuild_count: needsRebuild.length,
    can_rebuild: needsRebuild.length > 0,
    message: needsRebuild.length > 0
      ? `${needsRebuild.length} nodes need rebuilding out of ${wikiNodes.length} total.`
      : wikiNodes.length > 0
        ? 'All wiki nodes are up to date.'
        : 'No wiki nodes found. Generate knowledge nodes first.',
  };
}

/**
 * Execute a rebuild: re-validate and update wiki nodes.
 * This is a "dry run" style rebuild that fixes metadata without re-generating content.
 */
export async function executeRebuild(options = {}) {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const timestamp = new Date().toISOString();
  const trigger = options.trigger ?? 'manual';

  if (!storage.writesEnabled) {
    return {
      executed: false,
      reason: 'writes_disabled',
      message: 'Filesystem writes are disabled. Enable filesystem mode to run rebuilds.',
    };
  }

  const plan = await buildRebuildPlan({ trigger });

  if (!plan.can_rebuild) {
    return {
      executed: false,
      reason: 'nothing_to_rebuild',
      message: plan.message,
      plan,
    };
  }

  const rebuildId = `rebuild_${timestamp.slice(0, 10).replace(/-/g, '')}_${randomSuffix()}`;
  const manifest = await readMigrationManifest(workspaceRoot);
  const policyState = await ensurePolicyState(workspaceRoot).catch(() => ({ version: 1 }));

  let nodesRebuilt = 0;
  let nodesSkipped = 0;
  const errors = [];

  for (const node of plan.needs_rebuild) {
    try {
      const fullPath = path.resolve(workspaceRoot, node.path);
      const raw = await fs.readFile(fullPath, 'utf8');
      const { front, body } = splitFrontmatter(raw);

      if (!front) {
        nodesSkipped++;
        continue;
      }

      const frontmatter = parseSimpleFrontmatter(front);

      // Update schema version
      frontmatter.schema_version = String(manifest.schema_version);

      // Add/fix knowledge_type if missing
      if (!frontmatter.knowledge_type || frontmatter.knowledge_type === 'unknown') {
        frontmatter.knowledge_type = inferKnowledgeType(node.path, body);
      }

      // Ensure tags exist
      if (!frontmatter.tags || !Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
        frontmatter.tags = ['rebuild-generated'];
      }

      // Ensure connected_nodes exist
      if (
        !frontmatter.connected_nodes ||
        !Array.isArray(frontmatter.connected_nodes) ||
        frontmatter.connected_nodes.length === 0
      ) {
        frontmatter.connected_nodes = ['후속 링크 보강 필요'];
      }

      // Add rebuild metadata
      frontmatter.last_rebuilt = timestamp;
      frontmatter.rebuild_id = rebuildId;

      // Reconstruct the file
      const updatedFront = Object.entries(frontmatter)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            const items = value.map((v) => `  - "${String(v)}"`).join('\n');
            return `${key}:\n${items}`;
          }
          return `${key}: "${String(value)}"`;
        })
        .join('\n');
      const updatedContent = `---\n${updatedFront}\n---\n${body}`;

      await fs.writeFile(fullPath, updatedContent, 'utf8');
      nodesRebuilt++;
    } catch (error) {
      nodesSkipped++;
      errors.push({
        path: node.path,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Record rebuild in manifest
  const rebuildEntry = {
    rebuild_id: rebuildId,
    trigger,
    status: errors.length > 0 ? 'completed' : 'completed',
    started_at: timestamp,
    completed_at: new Date().toISOString(),
    nodes_scanned: plan.total_wiki_nodes,
    nodes_rebuilt: nodesRebuilt,
    nodes_skipped: nodesSkipped,
    policy_version_used: policyState.version,
    error: errors.length > 0
      ? `${errors.length} nodes had errors during rebuild.`
      : null,
  };

  manifest.rebuild_history.push(rebuildEntry);
  await writeMigrationManifest(workspaceRoot, manifest);

  // Record event
  const event = {
    event_id: createEventId(randomSuffix()),
    timestamp,
    event_type: 'rebuild',
    schema_version: manifest.schema_version,
    policy_version: policyState.version,
    summary: `Rebuild ${rebuildId}: ${nodesRebuilt} rebuilt, ${nodesSkipped} skipped.`,
    details: {
      rebuild_id: rebuildId,
      trigger,
      nodes_rebuilt: nodesRebuilt,
      nodes_skipped: nodesSkipped,
      errors: errors.slice(0, 5),
    },
  };

  try {
    await appendEvents(workspaceRoot, [event]);
  } catch {
    // Best-effort event recording
  }

  return {
    executed: true,
    reason: 'success',
    message: `Rebuild complete: ${nodesRebuilt} rebuilt, ${nodesSkipped} skipped.`,
    rebuild_id: rebuildId,
    nodes_rebuilt: nodesRebuilt,
    nodes_skipped: nodesSkipped,
    errors: errors.slice(0, 10),
    plan,
    event,
  };
}

/**
 * Register a schema migration step.
 */
export async function registerMigration(options = {}) {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const timestamp = new Date().toISOString();
  const manifest = await readMigrationManifest(workspaceRoot);

  const fromVersion = manifest.schema_version;
  const toVersion = options.toVersion ?? fromVersion + 1;
  const migrationId = `mig_${fromVersion}_to_${toVersion}_${randomSuffix()}`;

  const migration = {
    migration_id: migrationId,
    from_version: fromVersion,
    to_version: toVersion,
    status: 'pending',
    created_at: timestamp,
    completed_at: null,
    affected_nodes: 0,
    description: options.description ?? `Schema migration from v${fromVersion} to v${toVersion}`,
    changes: options.changes ?? [],
    error: null,
  };

  manifest.migrations.push(migration);
  manifest.schema_version = toVersion;
  await writeMigrationManifest(workspaceRoot, manifest);

  // Log event
  const event = {
    event_id: createEventId(randomSuffix()),
    timestamp,
    event_type: 'migration_registered',
    schema_version: toVersion,
    policy_version: 1,
    summary: `Migration ${migrationId}: v${fromVersion} → v${toVersion}`,
    details: {
      migration_id: migrationId,
      from_version: fromVersion,
      to_version: toVersion,
      description: migration.description,
    },
  };

  try {
    await appendEvents(workspaceRoot, [event]);
  } catch {
    // Best-effort
  }

  return {
    registered: true,
    migration,
    manifest_version: toVersion,
    event,
  };
}

/**
 * Infer knowledge type from file path and body content.
 */
function inferKnowledgeType(filePath, body) {
  const lowerPath = filePath.toLowerCase();
  const lowerBody = (body ?? '').toLowerCase();

  if (lowerPath.includes('research') || lowerBody.includes('hypothesis')) {
    return 'research-note';
  }
  if (lowerPath.includes('code') || lowerBody.includes('```')) {
    return 'development-code';
  }
  if (lowerPath.includes('youtube') || lowerBody.includes('후킹')) {
    return 'youtube-planning';
  }
  if (lowerPath.includes('meeting') || lowerBody.includes('액션 아이템')) {
    return 'meeting-note';
  }
  if (lowerPath.includes('image') || lowerBody.includes('프롬프트')) {
    return 'image-prompt';
  }

  return 'business-insight';
}
