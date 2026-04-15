import fs from 'node:fs/promises';
import path from 'node:path';

import { buildKnowledgeProposal } from './proposalBuilder.js';
import { validateContract } from './contracts.js';
import {
  appendEvents,
  createEventId,
  ensurePolicyState,
  getStorageDescriptor,
  persistKnowledgeProposal,
  readWikiNodes,
  resolveWithinWorkspace,
  writeJsonArtifact,
} from './persistence.js';
import { splitFrontmatter, stringifyFrontmatter } from './markdown.js';
import { walkFiles, randomSuffix } from './utils.js';

const DEFAULT_JOB_QUEUE = {
  schema_version: 1,
  updated_at: '2026-04-15T00:00:00.000Z',
  jobs: [],
};

const DEFAULT_AGENT_STATUS = {
  schema_version: 1,
  updated_at: '2026-04-15T00:00:00.000Z',
  state: 'idle',
  watch_root: '00_Raw',
  queue_depth: 0,
  last_scan_at: null,
  last_event_summary: null,
  watch_mode: null,
};

export async function ensureWorkspaceAgentArtifacts(workspaceRoot) {
  await validateContract('JobQueue', DEFAULT_JOB_QUEUE);
  await validateContract('AgentStatus', DEFAULT_AGENT_STATUS);

  const queue = await readOrInitializeArtifact(
    workspaceRoot,
    '30_Ops/jobs/queue.json',
    'JobQueue',
    DEFAULT_JOB_QUEUE,
  );
  const status = await readOrInitializeArtifact(
    workspaceRoot,
    '30_Ops/jobs/agent-status.json',
    'AgentStatus',
    DEFAULT_AGENT_STATUS,
  );

  return { queue, status };
}

export async function readWorkspaceAgentState(workspaceRoot) {
  const storage = getStorageDescriptor();
  const queue = await readArtifactIfPresent(workspaceRoot, '30_Ops/jobs/queue.json', 'JobQueue');
  const status = await readArtifactIfPresent(
    workspaceRoot,
    '30_Ops/jobs/agent-status.json',
    'AgentStatus',
  );

  if (!queue || !status) {
    if (!storage.writesEnabled) {
      return null;
    }

    const initialized = await ensureWorkspaceAgentArtifacts(workspaceRoot);
    return readWorkspaceAgentSummary(initialized.queue, initialized.status);
  }

  return readWorkspaceAgentSummary(queue, status);
}

function readWorkspaceAgentSummary(queue, status) {
  const jobs = [...(queue.jobs ?? [])].sort(
    (left, right) =>
      String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')) ||
      String(left.job_id ?? '').localeCompare(String(right.job_id ?? '')),
  );

  return {
    status,
    queue,
    summary: {
      queueDepth: jobs.filter((job) => job.status === 'queued').length,
      pendingReviewCount: jobs.filter((job) => job.status === 'pending_review').length,
      processingCount: jobs.filter((job) => job.status === 'processing').length,
      completedCount: jobs.filter((job) => job.status === 'completed').length,
      failedCount: jobs.filter((job) => job.status === 'failed').length,
      recentJobs: jobs.slice(0, 6),
    },
  };
}

export async function runWorkspaceAgentScan(options = {}) {
  const storage = getStorageDescriptor();

  if (!storage.writesEnabled) {
    return {
      executed: false,
      storage,
      warnings: [storage.reason],
      summary: null,
    };
  }

  const workspaceRoot = storage.workspaceRoot;
  const timestamp = new Date().toISOString();
  const origin = options.origin === 'watcher_scan' ? 'watcher_scan' : 'manual_scan';
  const { queue, status } = await ensureWorkspaceAgentArtifacts(workspaceRoot);
  const policyState = await ensurePolicyState(workspaceRoot);
  await updateAgentStatus(workspaceRoot, status, {
    state: 'scanning',
    updated_at: timestamp,
    watch_mode: origin === 'watcher_scan' ? 'watch' : 'manual',
  });

  const manifests = await findRawManifests(workspaceRoot);
  const knownSourceIds = new Set((queue.jobs ?? []).map((job) => job.source_id));
  const nextJobs = [...(queue.jobs ?? [])];
  const newEvents = [];
  let newJobsCount = 0;

  for (const manifest of manifests) {
    if (knownSourceIds.has(manifest.source_id)) {
      continue;
    }

    const job = createIngestJob(manifest, origin, timestamp);
    nextJobs.push(job);
    knownSourceIds.add(job.source_id);
    newJobsCount += 1;
    newEvents.push({
      event_id: createEventId(randomSuffix()),
      timestamp,
      event_type: 'capture',
      source_ids: [job.source_id],
      policy_version: policyState.version,
      schema_version: 1,
      artifacts_touched: ['30_Ops/jobs/queue.json', '30_Ops/jobs/agent-status.json'],
      summary: `Workspace agent queued ${job.source_id} for ingest.`,
      details: {
        raw_root: job.raw_root,
        job_id: job.job_id,
        origin,
      },
    });
  }

  const nextQueue = {
    schema_version: 1,
    updated_at: timestamp,
    jobs: nextJobs,
  };
  await validateContract('JobQueue', nextQueue);
  await writeJsonArtifact(workspaceRoot, '30_Ops/jobs/queue.json', nextQueue);

  const queueDepth = nextJobs.filter((job) => job.status === 'queued').length;
  const nextStatus = {
    ...status,
    updated_at: timestamp,
    state: options.keepWatching ? 'watching' : 'idle',
    queue_depth: queueDepth,
    last_scan_at: timestamp,
    last_event_summary:
      newJobsCount > 0
        ? `Queued ${newJobsCount} new raw ingest job${newJobsCount > 1 ? 's' : ''}.`
        : 'No new raw manifests needed ingest jobs.',
    watch_mode: options.keepWatching ? 'watch' : origin === 'watcher_scan' ? 'watch' : 'manual',
  };
  await validateContract('AgentStatus', nextStatus);
  await writeJsonArtifact(workspaceRoot, '30_Ops/jobs/agent-status.json', nextStatus);

  if (newEvents.length > 0) {
    await appendEvents(workspaceRoot, newEvents);
  }

  return {
    executed: true,
    storage,
    warnings: [],
    summary: {
      queuedJobs: newJobsCount,
      queueDepth,
      manifestsScanned: manifests.length,
      state: nextStatus.state,
      recentJobs: nextQueue.jobs.slice(-6).reverse(),
    },
  };
}

export async function setWorkspaceAgentWatchState(nextState, options = {}) {
  const storage = getStorageDescriptor();

  if (!storage.writesEnabled) {
    return {
      updated: false,
      storage,
      warnings: [storage.reason],
      status: null,
    };
  }

  const workspaceRoot = storage.workspaceRoot;
  const { queue, status } = await ensureWorkspaceAgentArtifacts(workspaceRoot);
  const queueDepth = (queue.jobs ?? []).filter((job) => job.status === 'queued').length;
  const timestamp = new Date().toISOString();
  const nextStatus = {
    ...status,
    updated_at: timestamp,
    state: nextState,
    queue_depth: queueDepth,
    watch_mode: options.watchMode ?? status.watch_mode ?? null,
    last_event_summary: options.summary ?? status.last_event_summary,
    last_scan_at: options.lastScanAt ?? status.last_scan_at,
  };

  await validateContract('AgentStatus', nextStatus);
  await writeJsonArtifact(workspaceRoot, '30_Ops/jobs/agent-status.json', nextStatus);

  return {
    updated: true,
    storage,
    warnings: [],
    status: nextStatus,
  };
}

export async function processWorkspaceAgentQueue(options = {}) {
  const storage = getStorageDescriptor();

  if (!storage.writesEnabled) {
    return {
      executed: false,
      storage,
      warnings: [storage.reason],
      summary: null,
    };
  }

  const agentMode = String(process.env.P_REINFORCE_AGENT_MODE || 'manual').toLowerCase();
  const workspaceRoot = storage.workspaceRoot;
  const limit = Math.max(1, Number(options.limit ?? 3));
  const timestamp = new Date().toISOString();
  const { queue, status } = await ensureWorkspaceAgentArtifacts(workspaceRoot);
  const policyState = await ensurePolicyState(workspaceRoot);
  const wikiNodes = await readWikiNodes(workspaceRoot);
  const jobs = [...(queue.jobs ?? [])];
  const queuedJobs = jobs.filter((job) => job.status === 'queued').slice(0, limit);
  let completedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let proposedCount = 0;
  const processedNodes = [];

  await updateAgentStatus(workspaceRoot, status, {
    state: 'scanning',
    updated_at: timestamp,
    last_event_summary:
      queuedJobs.length > 0
        ? `Processing ${queuedJobs.length} queued ingest job${queuedJobs.length > 1 ? 's' : ''} (mode: ${agentMode}).`
        : 'No queued ingest jobs were available.',
  });

  for (const job of queuedJobs) {
    const jobIndex = jobs.findIndex((candidate) => candidate.job_id === job.job_id);

    if (jobIndex === -1) {
      continue;
    }

    jobs[jobIndex] = {
      ...jobs[jobIndex],
      status: 'processing',
      attempts: Number(jobs[jobIndex].attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
      note: 'Worker is processing this raw source.',
    };
    await writeJobQueue(workspaceRoot, jobs);

    try {
      const existingNode = wikiNodes.find((node) =>
        Array.isArray(node.frontmatter.source_refs) &&
        node.frontmatter.source_refs.includes(job.source_id),
      );

      if (existingNode) {
        jobs[jobIndex] = {
          ...jobs[jobIndex],
          status: 'completed',
          updated_at: new Date().toISOString(),
          note: `Already represented by ${existingNode.relativePath}.`,
        };
        skippedCount += 1;
        continue;
      }

      const sourceManifest = await loadRawManifest(workspaceRoot, job.raw_root);
      const sourceText = await loadSourceText(workspaceRoot, sourceManifest.text_path);

      if (agentMode === 'auto') {
        // Auto mode: propose + apply in one shot (explicit opt-in only)
        const proposal = await buildAgentProposal({
          sourceManifest,
          sourceText,
          policyVersion: policyState.version,
          model: options.model ?? 'p-reinforce-agent',
          includeApplyEvent: true,
        });
        const persistence = await persistKnowledgeProposal(proposal);

        jobs[jobIndex] = {
          ...jobs[jobIndex],
          status: persistence.persisted ? 'completed' : 'failed',
          updated_at: new Date().toISOString(),
          note: persistence.persisted
            ? `Applied ${proposal.wikiPath}.`
            : 'Persistence runtime refused the apply step.',
        };

        if (persistence.persisted) {
          completedCount += 1;
          processedNodes.push(proposal.wikiPath);
        } else {
          failedCount += 1;
        }
      } else {
        // Manual mode (default): propose only, leave for human review
        const proposal = await buildAgentProposal({
          sourceManifest,
          sourceText,
          policyVersion: policyState.version,
          model: options.model ?? 'p-reinforce-agent',
          includeApplyEvent: false,
        });

        // Write only the propose event, not the apply event
        await appendEvents(workspaceRoot, proposal.events);

        jobs[jobIndex] = {
          ...jobs[jobIndex],
          status: 'pending_review',
          updated_at: new Date().toISOString(),
          note: `Proposal ready for review: ${proposal.wikiPath}`,
          proposal_path: proposal.wikiPath,
        };
        proposedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      jobs[jobIndex] = {
        ...jobs[jobIndex],
        status: 'failed',
        updated_at: new Date().toISOString(),
        note: error instanceof Error ? error.message : 'Unknown worker failure.',
      };
    }

    await writeJobQueue(workspaceRoot, jobs);
  }

  const queueDepth = jobs.filter((job) => job.status === 'queued').length;
  const pendingReviewCount = jobs.filter((job) => job.status === 'pending_review').length;
  const nextStatus = {
    ...status,
    updated_at: new Date().toISOString(),
    state: 'idle',
    queue_depth: queueDepth,
    last_scan_at: timestamp,
    last_event_summary:
      queuedJobs.length > 0
        ? `Worker completed ${completedCount}, proposed ${proposedCount}, skipped ${skippedCount}, failed ${failedCount} (mode: ${agentMode}).`
        : 'No queued ingest jobs were available.',
    watch_mode: status.watch_mode ?? 'manual',
  };

  await validateContract('AgentStatus', nextStatus);
  await writeJsonArtifact(workspaceRoot, '30_Ops/jobs/agent-status.json', nextStatus);

  return {
    executed: true,
    storage,
    agentMode,
    warnings: agentMode === 'manual'
      ? ['Agent is in manual mode. Proposals require explicit review before apply.']
      : [],
    summary: {
      processedJobs: queuedJobs.length,
      completedCount,
      proposedCount,
      skippedCount,
      failedCount,
      queueDepth,
      pendingReviewCount,
      processedNodes,
    },
  };
}

async function updateAgentStatus(workspaceRoot, currentStatus, patch) {
  const nextStatus = {
    ...currentStatus,
    ...patch,
  };

  await validateContract('AgentStatus', nextStatus);
  await writeJsonArtifact(workspaceRoot, '30_Ops/jobs/agent-status.json', nextStatus);
}

async function findRawManifests(workspaceRoot) {
  const rawRoot = resolveWithinWorkspace(workspaceRoot, '00_Raw');
  const files = await walkFiles(rawRoot, (absolutePath) =>
    absolutePath.endsWith(`${path.sep}manifest.json`) || absolutePath.endsWith('/manifest.json'),
  );
  const manifests = [];

  for (const absolutePath of files) {
    try {
      const parsed = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
      manifests.push(parsed);
    } catch {
      // Ignore malformed manifests and keep scanning the rest of the raw layer.
    }
  }

  return manifests.sort((left, right) =>
    String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')),
  );
}

async function buildAgentProposal({ sourceManifest, sourceText, policyVersion, model, includeApplyEvent = true }) {
  const extracted = parseSourceDocument(sourceText);
  const knowledgeType = extracted.knowledgeType;
  const rawText = extracted.rawText;
  const llmResult = {
    title: sourceManifest.title,
    markdown: buildAgentMarkdown({
      title: sourceManifest.title,
      rawText,
      tags: sourceManifest.tags ?? [],
    }),
    graph: null,
  };
  const draft = await buildKnowledgeProposal({
    knowledgeType,
    rawText,
    attachments: [],
    llmResult,
    model,
  });
  const frontmatter = {
    ...draft.frontmatter,
    source_refs: [sourceManifest.source_id],
    policy_version: policyVersion,
    confidence_score: Number(
      Math.min(0.96, draft.frontmatter.confidence_score + (sourceManifest.attachments?.length ? 0.04 : 0.02)).toFixed(2),
    ),
  };
  const { body } = splitFrontmatter(draft.markdown);
  const markdown = [stringifyFrontmatter(frontmatter), '', body].join('\n');
  const timestamp = new Date().toISOString();

  const events = [
    {
      event_id: createEventId(randomSuffix()),
      timestamp,
      event_type: 'ingest_propose',
      source_ids: [sourceManifest.source_id],
      node_ids: [frontmatter.id],
      policy_version: policyVersion,
      schema_version: 1,
      model,
      artifacts_touched: [draft.wikiPath],
      summary: `Local agent proposed ${frontmatter.id} from ${sourceManifest.source_id}.`,
      details: {
        origin: 'local_agent',
        confidence_score: frontmatter.confidence_score,
        agent_mode: includeApplyEvent ? 'auto' : 'manual',
      },
    },
  ];

  if (includeApplyEvent) {
    events.push({
      event_id: createEventId(randomSuffix()),
      timestamp,
      event_type: 'ingest_apply',
      source_ids: [sourceManifest.source_id],
      node_ids: [frontmatter.id],
      policy_version: policyVersion,
      schema_version: 1,
      model,
      artifacts_touched: [draft.wikiPath, '20_Meta/index.json', '20_Meta/graph.cache.json'],
      summary: `Local agent applied ${frontmatter.id} from queued raw source ${sourceManifest.source_id}.`,
      details: {
        origin: 'local_agent',
        automated: true,
      },
    });
  }

  const reflectionItems = [
    ...(draft.reflection ?? []),
  ];

  if (includeApplyEvent) {
    reflectionItems.push({
      severity: 'warning',
      code: 'agent_auto_apply',
      message:
        'Local agent applied a deterministic fallback synthesis. Review and reinforce if the category or links need correction.',
    });
  } else {
    reflectionItems.push({
      severity: 'info',
      code: 'agent_manual_propose',
      message:
        'Local agent created a proposal for human review. Use Apply to persist when ready.',
    });
  }

  return {
    ...draft,
    sourceManifest: {
      ...sourceManifest,
      status: includeApplyEvent ? 'applied' : 'proposed',
    },
    sourceText,
    rawRoot: sourceManifest.raw_root,
    markdown,
    frontmatter,
    attachmentFiles: await loadAttachmentFiles(sourceManifest),
    events,
    reflection: reflectionItems,
  };
}

async function readOrInitializeArtifact(workspaceRoot, relativePath, contractName, fallback) {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);

  try {
    const existing = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    await validateContract(contractName, existing);
    return existing;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  await writeJsonArtifact(workspaceRoot, relativePath, fallback);
  return fallback;
}

async function readArtifactIfPresent(workspaceRoot, relativePath, contractName) {
  try {
    const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);
    const existing = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    await validateContract(contractName, existing);
    return existing;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}



function createIngestJob(manifest, origin, timestamp) {
  return {
    job_id: `job_${timestamp.slice(0, 10).replaceAll('-', '')}_${randomJobSuffix()}`,
    job_type: 'ingest_raw',
    status: 'queued',
    source_id: manifest.source_id,
    raw_root: manifest.raw_root,
    origin,
    attempts: 0,
    created_at: timestamp,
    updated_at: timestamp,
    note: manifest.title ? `Discovered raw bundle: ${manifest.title}` : 'Discovered raw bundle.',
  };
}

async function writeJobQueue(workspaceRoot, jobs) {
  const queue = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    jobs,
  };

  await validateContract('JobQueue', queue);
  await writeJsonArtifact(workspaceRoot, '30_Ops/jobs/queue.json', queue);
}

async function loadRawManifest(workspaceRoot, rawRoot) {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, `${rawRoot}/manifest.json`);
  return JSON.parse(await fs.readFile(absolutePath, 'utf8'));
}

async function loadSourceText(workspaceRoot, textPath) {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, textPath);
  return fs.readFile(absolutePath, 'utf8');
}

async function loadAttachmentFiles(sourceManifest) {
  const workspaceRoot = getStorageDescriptor().workspaceRoot;
  const files = [];

  for (const attachment of sourceManifest.attachments ?? []) {
    const absolutePath = resolveWithinWorkspace(workspaceRoot, attachment.path);
    const binary = await fs.readFile(absolutePath);
    files.push({
      attachment_id: attachment.attachment_id,
      path: attachment.path,
      mime_type: attachment.mime_type,
      sha256: attachment.sha256,
      size_bytes: attachment.size_bytes,
      binary,
    });
  }

  return files;
}

function parseSourceDocument(sourceText) {
  const knowledgeTypeMatch = String(sourceText).match(/^- knowledge_type:\s*(.+)$/m);
  const rawTextMatch = String(sourceText).match(/## Raw Text\n([\s\S]*?)\n## Attachments/m);

  return {
    knowledgeType: knowledgeTypeMatch?.[1]?.trim() || 'research-note',
    rawText: rawTextMatch?.[1]?.trim() || '',
  };
}

function buildAgentMarkdown({ title, rawText, tags }) {
  const today = new Date().toISOString().slice(0, 10);
  const bullets = String(rawText)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => `- ${line}`);
  const connected = (tags ?? []).slice(0, 2).map((tag) => `  - "${tag}"`).join('\n') || '  - "follow-up-review"';
  const tagLines = (tags ?? []).slice(0, 4).map((tag) => `  - "${tag}"`).join('\n') || '  - "agent-ingest"';

  return `---
title: "${escapeYaml(title)}"
date: "${today}"
knowledge_type: "Agent Ingest"
tags:
${tagLines}
connected_nodes:
${connected}
---

## 한 줄 요약
${summarizeRawText(rawText)}

## 추출된 패턴
${bullets.length ? bullets.join('\n') : '- 입력 원문을 더 보강하면 더 정교한 노드로 재합성할 수 있습니다.'}

## 다음 액션
- Garden에서 연결 구조를 확인합니다.
- Reinforce에서 분류와 링크를 교정합니다.
`;
}

function summarizeRawText(rawText) {
  const line = String(rawText)
    .split(/\n+/)
    .map((item) => item.trim())
    .find(Boolean);

  return line ? line.slice(0, 180) : '원문이 짧아서 기본 요약만 생성했습니다.';
}

function escapeYaml(value) {
  return String(value).replace(/"/g, '\\"');
}



function randomJobSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
