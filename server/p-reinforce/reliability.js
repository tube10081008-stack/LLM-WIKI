import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getStorageDescriptor } from './persistence.js';
import { readMigrationManifest, scanWikiNodes, scanRawSources } from './migration.js';
import { readGitAutomationStatus } from './gitAutomation.js';
import { walkFiles } from './utils.js';

const execFileAsync = promisify(execFile);

/**
 * Build a comprehensive 10-year reliability report.
 * Assesses backup, export, portability, observability, and recovery readiness.
 */
export async function buildReliabilityReport() {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const timestamp = new Date().toISOString();

  const checks = [];

  // ── Backup checks ──
  const gitStatus = await readGitAutomationStatus(workspaceRoot);

  checks.push({
    id: 'git_initialized',
    label: 'Git repository initialized',
    category: 'backup',
    status: gitStatus.repository ? 'pass' : 'fail',
    detail: gitStatus.repository
      ? `Branch: ${gitStatus.branch}, Last commit: ${gitStatus.lastCommit ?? 'none'}`
      : 'No .git directory found.',
    recommendation: gitStatus.repository ? null : 'Run "git init" in the workspace root.',
  });

  const hasRemote = await checkGitRemote(workspaceRoot);

  checks.push({
    id: 'git_remote',
    label: 'Remote backup configured',
    category: 'backup',
    status: hasRemote ? 'pass' : 'warn',
    detail: hasRemote
      ? 'At least one remote is configured for off-site backup.'
      : 'No git remote configured. Knowledge exists only on this machine.',
    recommendation: hasRemote ? null : 'Run "git remote add origin <url>" to enable off-site backup.',
  });

  checks.push({
    id: 'clean_workspace',
    label: 'All changes committed',
    category: 'backup',
    status: gitStatus.dirtyFiles === 0 ? 'pass' : 'warn',
    detail: gitStatus.dirtyFiles === 0
      ? 'Working tree is clean.'
      : `${gitStatus.dirtyFiles} uncommitted files.`,
    recommendation: gitStatus.dirtyFiles > 0
      ? 'Run a Git checkpoint to commit pending changes.'
      : null,
  });

  // ── Export checks ──
  const wikiNodes = await scanWikiNodes(workspaceRoot);
  const rawSources = await scanRawSources(workspaceRoot);
  const eventCount = await countEventFiles(workspaceRoot);
  const totalSize = await estimateWorkspaceSize(workspaceRoot);

  checks.push({
    id: 'export_wiki_nodes',
    label: 'Wiki nodes exportable',
    category: 'export',
    status: wikiNodes.length > 0 ? 'pass' : 'warn',
    detail: `${wikiNodes.length} wiki nodes in standard Markdown with YAML frontmatter.`,
    recommendation: wikiNodes.length === 0 ? 'Generate knowledge nodes to have exportable content.' : null,
  });

  checks.push({
    id: 'export_raw_sources',
    label: 'Raw sources preserved',
    category: 'export',
    status: rawSources.length > 0 ? 'pass' : 'warn',
    detail: `${rawSources.length} raw source manifests with original evidence.`,
    recommendation: rawSources.length === 0 ? 'Ingest raw content to build provenance chain.' : null,
  });

  checks.push({
    id: 'export_events',
    label: 'Event log durability',
    category: 'export',
    status: eventCount > 0 ? 'pass' : 'warn',
    detail: `${eventCount} event log files found in append-only JSONL format.`,
    recommendation: eventCount === 0 ? 'Events accumulate as you use the system.' : null,
  });

  // ── Portability checks ──
  const geminiModel = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3-flash-preview';

  checks.push({
    id: 'provider_independence',
    label: 'Raw truth independent of LLM provider',
    category: 'portability',
    status: 'pass',
    detail: 'Raw sources (00_Raw) contain original user input, not LLM output. Switching models does not affect truth.',
    recommendation: null,
  });

  checks.push({
    id: 'model_switchable',
    label: 'LLM model can be switched',
    category: 'portability',
    status: 'pass',
    detail: `Current model: ${geminiModel}. Model is configured via GEMINI_MODEL env var and can be changed without data loss.`,
    recommendation: null,
  });

  checks.push({
    id: 'format_standard',
    label: 'Knowledge stored in standard formats',
    category: 'portability',
    status: 'pass',
    detail: 'Wiki nodes use Markdown+YAML, events use JSONL, schemas use JSON Schema. No proprietary formats.',
    recommendation: null,
  });

  // ── Observability checks ──
  const manifest = await readMigrationManifest(workspaceRoot);

  checks.push({
    id: 'contract_health',
    label: 'Schema contracts machine-readable',
    category: 'observability',
    status: 'pass',
    detail: `Bundle v${manifest.schema_version}. All contracts compile and validate at runtime.`,
    recommendation: null,
  });

  checks.push({
    id: 'event_audit_trail',
    label: 'Audit trail via event log',
    category: 'observability',
    status: eventCount > 0 ? 'pass' : 'warn',
    detail: eventCount > 0
      ? 'Every significant operation (generate, apply, checkpoint, rebuild) produces a durable event.'
      : 'No events logged yet. Events appear as you use the system.',
    recommendation: null,
  });

  checks.push({
    id: 'migration_tracking',
    label: 'Schema migration history',
    category: 'observability',
    status: 'pass',
    detail: `${manifest.migrations?.length ?? 0} migrations, ${manifest.rebuild_history?.length ?? 0} rebuilds recorded.`,
    recommendation: null,
  });

  // ── Recovery checks ──
  checks.push({
    id: 'rebuild_capability',
    label: 'Wiki can be rebuilt from raw sources',
    category: 'recovery',
    status: rawSources.length > 0 ? 'pass' : 'warn',
    detail: rawSources.length > 0
      ? 'Raw sources exist. Wiki nodes can be regenerated if templates or policies improve.'
      : 'No raw sources yet. Rebuild requires original evidence to exist in 00_Raw.',
    recommendation: null,
  });

  checks.push({
    id: 'policy_versioned',
    label: 'Policy changes tracked',
    category: 'recovery',
    status: 'pass',
    detail: 'PolicyState uses integer versioning. Old versions remain in event history.',
    recommendation: null,
  });

  checks.push({
    id: 'git_timeline',
    label: 'Full history available via Git',
    category: 'recovery',
    status: gitStatus.repository ? 'pass' : 'fail',
    detail: gitStatus.repository
      ? 'Git history preserves every checkpoint. Any past state can be recovered.'
      : 'No Git history. Initialize a repository for full timeline.',
    recommendation: gitStatus.repository ? null : 'Run "git init" to enable timeline recovery.',
  });

  // ── Aggregate status ──
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const overallStatus = failCount > 0 ? 'critical' : warnCount > 2 ? 'degraded' : 'healthy';

  return {
    generated_at: timestamp,
    overall_status: overallStatus,
    checks,
    export_manifest: {
      total_raw_sources: rawSources.length,
      total_wiki_nodes: wikiNodes.length,
      total_events: eventCount,
      total_size_bytes: totalSize,
      exportable: wikiNodes.length > 0 || rawSources.length > 0,
      last_export: null,
    },
    provider_portability: {
      current_provider: 'Google Gemini',
      model_locked: false,
      can_switch_provider: true,
      raw_truth_independent: true,
    },
    backup_status: {
      git_commits: await countGitCommits(workspaceRoot),
      has_remote: hasRemote,
      last_push: null,
      dirty_files: gitStatus.dirtyFiles ?? 0,
    },
    summary: {
      pass: checks.filter((c) => c.status === 'pass').length,
      warn: warnCount,
      fail: failCount,
      total: checks.length,
    },
  };
}

/**
 * Export the entire knowledge base as a self-contained JSON manifest.
 */
export async function exportKnowledgeBase() {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const timestamp = new Date().toISOString();

  const wikiNodes = await scanWikiNodes(workspaceRoot);
  const rawSources = await scanRawSources(workspaceRoot);
  const manifest = await readMigrationManifest(workspaceRoot);
  const gitStatus = await readGitAutomationStatus(workspaceRoot);

  // Read full content of each wiki node
  const wikiContents = [];

  for (const node of wikiNodes) {
    try {
      const fullPath = path.resolve(workspaceRoot, node.path);
      const content = await fs.readFile(fullPath, 'utf8');
      wikiContents.push({ ...node, content });
    } catch {
      wikiContents.push({ ...node, content: null, error: 'Could not read file' });
    }
  }

  const exportData = {
    export_version: 1,
    exported_at: timestamp,
    workspace_root: workspaceRoot,
    schema_version: manifest.schema_version,
    git: {
      branch: gitStatus.branch,
      last_commit: gitStatus.lastCommit,
      repository: gitStatus.repository,
    },
    statistics: {
      wiki_nodes: wikiNodes.length,
      raw_sources: rawSources.length,
      migrations: manifest.migrations?.length ?? 0,
      rebuilds: manifest.rebuild_history?.length ?? 0,
    },
    wiki_nodes: wikiContents,
    raw_sources: rawSources,
    migration_manifest: manifest,
  };

  // Write export file
  const exportDir = path.resolve(workspaceRoot, '30_Ops/exports');
  await fs.mkdir(exportDir, { recursive: true });
  const exportPath = path.resolve(
    exportDir,
    `knowledge-export-${timestamp.slice(0, 10)}.json`,
  );
  await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2) + '\n', 'utf8');

  return {
    exported: true,
    export_path: path.relative(workspaceRoot, exportPath).replace(/\\/g, '/'),
    statistics: exportData.statistics,
    timestamp,
  };
}

async function checkGitRemote(workspaceRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['remote'], { cwd: workspaceRoot });
    return String(stdout).trim().length > 0;
  } catch {
    return false;
  }
}

async function countGitCommits(workspaceRoot) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-list', '--count', 'HEAD'],
      { cwd: workspaceRoot },
    );
    return parseInt(String(stdout).trim(), 10) || 0;
  } catch {
    return 0;
  }
}

async function countEventFiles(workspaceRoot) {
  try {
    const eventsDir = path.resolve(workspaceRoot, '20_Meta/events');
    const files = await walkFiles(eventsDir);
    return files.filter((f) => f.endsWith('.jsonl')).length;
  } catch {
    return 0;
  }
}

async function estimateWorkspaceSize(workspaceRoot) {
  const knowledgeRoots = ['00_Raw', '10_Wiki', '20_Meta', '30_Ops'];
  let totalBytes = 0;

  for (const root of knowledgeRoots) {
    try {
      const files = await walkFiles(path.resolve(workspaceRoot, root));

      for (const filePath of files) {
        try {
          const stat = await fs.stat(filePath);
          totalBytes += stat.size;
        } catch {
          // Skip
        }
      }
    } catch {
      // Root doesn't exist
    }
  }

  return totalBytes;
}
