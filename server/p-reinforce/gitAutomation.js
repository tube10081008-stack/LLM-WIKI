import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  appendEvents,
  createEventId,
  ensurePolicyState,
  getStorageDescriptor,
} from './persistence.js';
import { randomSuffix } from './utils.js';

const execFileAsync = promisify(execFile);
const KNOWLEDGE_ROOTS = ['00_Raw', '10_Wiki', '20_Meta', '30_Ops'];
const MAX_PUSH_RETRIES = 3;
const PUSH_RETRY_BASE_MS = 1000;

export async function readGitAutomationStatus(workspaceRoot) {
  const gitDirectory = path.resolve(workspaceRoot, '.git');

  try {
    await fs.access(gitDirectory);
  } catch {
    return {
      repository: false,
      branch: null,
      dirtyFiles: 0,
      canCommit: false,
      lastCommit: null,
      checkpointPlan: null,
      message: 'Workspace is not a git repository, so Step 8 stays blocked.',
    };
  }

  try {
    const [{ stdout: branchOutput }, { stdout: statusOutput }, { stdout: commitOutput }] =
      await Promise.all([
        execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot }),
        execFileAsync('git', ['status', '--short'], { cwd: workspaceRoot }),
        execFileAsync('git', ['log', '-1', '--pretty=%h %s'], { cwd: workspaceRoot }).catch(() => ({ stdout: '' })),
      ]);
    const entries = parseGitStatus(String(statusOutput));
    const dirtyFiles = String(statusOutput)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean).length;
    const checkpointPlan = buildCheckpointPlan(entries);

    return {
      repository: true,
      branch: String(branchOutput).trim() || 'HEAD',
      dirtyFiles,
      canCommit: dirtyFiles > 0,
      lastCommit: String(commitOutput).trim() || null,
      checkpointPlan,
      message:
        dirtyFiles > 0
          ? checkpointPlan?.message ?? 'Workspace has changes that could become a Git checkpoint.'
          : 'Workspace is clean. No Git checkpoint is needed right now.',
    };
  } catch (error) {
    return {
      repository: true,
      branch: null,
      dirtyFiles: 0,
      canCommit: false,
      lastCommit: null,
      checkpointPlan: null,
      message: error instanceof Error ? error.message : 'Git status could not be read.',
    };
  }
}

/**
 * Execute a git checkpoint: stage all knowledge files and commit with a structured message.
 * Returns a result object describing what happened.
 */
export async function executeGitCheckpoint(options = {}) {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const timestamp = new Date().toISOString();

  // Verify git repository exists
  const gitStatus = await readGitAutomationStatus(workspaceRoot);

  if (!gitStatus.repository) {
    return {
      committed: false,
      reason: 'not_a_repository',
      message: gitStatus.message,
      commitHash: null,
      commitMessage: null,
      filesStaged: 0,
      event: null,
    };
  }

  if (!gitStatus.canCommit) {
    return {
      committed: false,
      reason: 'clean_workspace',
      message: 'Workspace is clean. Nothing to commit.',
      commitHash: null,
      commitMessage: null,
      filesStaged: 0,
      event: null,
    };
  }

  const plan = gitStatus.checkpointPlan;
  const commitMessage = options.commitMessage || plan?.commitMessage || '[P-Reinforce] checkpoint: workspace sync';

  try {
    // Stage knowledge roots that have changes
    const areasToStage = plan?.touchedAreas?.length
      ? plan.touchedAreas
      : KNOWLEDGE_ROOTS;

    for (const area of areasToStage) {
      const areaPath = path.resolve(workspaceRoot, area);

      try {
        await fs.access(areaPath);
        await execFileAsync('git', ['add', area], { cwd: workspaceRoot });
      } catch {
        // Area doesn't exist yet, skip
      }
    }

    // Also stage contract and config files
    const configFiles = ['contracts', 'docs', '.gitignore'];

    for (const configFile of configFiles) {
      try {
        await fs.access(path.resolve(workspaceRoot, configFile));
        await execFileAsync('git', ['add', configFile], { cwd: workspaceRoot });
      } catch {
        // File/dir doesn't exist, skip
      }
    }

    // Verify something is staged
    const { stdout: diffOutput } = await execFileAsync(
      'git',
      ['diff', '--cached', '--name-only'],
      { cwd: workspaceRoot },
    );

    const stagedFiles = String(diffOutput)
      .split('\n')
      .filter(Boolean);

    if (stagedFiles.length === 0) {
      return {
        committed: false,
        reason: 'nothing_staged',
        message: 'No knowledge files were staged for commit.',
        commitHash: null,
        commitMessage: null,
        filesStaged: 0,
        event: null,
      };
    }

    // Commit
    await execFileAsync(
      'git',
      ['commit', '-m', commitMessage],
      { cwd: workspaceRoot },
    );

    // Get the commit hash
    const { stdout: hashOutput } = await execFileAsync(
      'git',
      ['rev-parse', '--short', 'HEAD'],
      { cwd: workspaceRoot },
    );
    const commitHash = String(hashOutput).trim();

    // Record checkpoint event
    const policyState = await ensurePolicyState(workspaceRoot).catch(() => ({ version: 1 }));
    const event = {
      event_id: createEventId(randomSuffix()),
      timestamp,
      event_type: 'git_checkpoint',
      policy_version: policyState.version,
      schema_version: 1,
      artifacts_touched: stagedFiles.slice(0, 12),
      summary: `Git checkpoint ${commitHash}: ${commitMessage}`,
      details: {
        commit_hash: commitHash,
        commit_message: commitMessage,
        files_staged: stagedFiles.length,
        touched_areas: plan?.touchedAreas ?? [],
      },
    };

    try {
      await appendEvents(workspaceRoot, [event]);
    } catch {
      // Event append failure should not break the checkpoint itself
    }

    return {
      committed: true,
      reason: 'success',
      message: `Checkpoint committed: ${commitHash}`,
      commitHash,
      commitMessage,
      filesStaged: stagedFiles.length,
      stagedFiles: stagedFiles.slice(0, 12),
      event,
    };
  } catch (error) {
    // Record failure event
    const failEvent = {
      event_id: createEventId(randomSuffix()),
      timestamp,
      event_type: 'error',
      schema_version: 1,
      policy_version: 1,
      summary: `Git checkpoint failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: {
        operation: 'git_checkpoint',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    };

    try {
      await appendEvents(workspaceRoot, [failEvent]);
    } catch {
      // Best-effort event recording
    }

    return {
      committed: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'Git commit failed.',
      commitHash: null,
      commitMessage,
      filesStaged: 0,
      event: failEvent,
    };
  }
}

/**
 * Push the current branch to origin with retry logic.
 * Returns a result describing push outcome.
 */
export async function pushGitCheckpoint(options = {}) {
  const storage = getStorageDescriptor();
  const workspaceRoot = storage.workspaceRoot;
  const timestamp = new Date().toISOString();
  const remote = options.remote || 'origin';

  const gitStatus = await readGitAutomationStatus(workspaceRoot);

  if (!gitStatus.repository) {
    return {
      pushed: false,
      reason: 'not_a_repository',
      message: gitStatus.message,
      attempts: 0,
    };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt++) {
    try {
      const { stdout: branchOutput } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: workspaceRoot },
      );
      const branch = String(branchOutput).trim();

      await execFileAsync(
        'git',
        ['push', remote, branch],
        { cwd: workspaceRoot },
      );

      // Record push success event
      const event = {
        event_id: createEventId(randomSuffix()),
        timestamp,
        event_type: 'git_push',
        schema_version: 1,
        policy_version: 1,
        summary: `Pushed to ${remote}/${branch} on attempt ${attempt}.`,
        details: {
          remote,
          branch,
          attempt,
        },
      };

      try {
        await appendEvents(workspaceRoot, [event]);
      } catch {
        // Best-effort
      }

      return {
        pushed: true,
        reason: 'success',
        message: `Pushed to ${remote}/${branch} successfully.`,
        attempts: attempt,
        remote,
        branch,
      };
    } catch (error) {
      lastError = error;

      if (attempt < MAX_PUSH_RETRIES) {
        const delay = PUSH_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  const failEvent = {
    event_id: createEventId(randomSuffix()),
    timestamp,
    event_type: 'error',
    schema_version: 1,
    policy_version: 1,
    summary: `Git push failed after ${MAX_PUSH_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown'}`,
    details: {
      operation: 'git_push',
      remote,
      max_retries: MAX_PUSH_RETRIES,
      error_message: lastError instanceof Error ? lastError.message : 'Unknown error',
    },
  };

  try {
    await appendEvents(workspaceRoot, [failEvent]);
  } catch {
    // Best-effort
  }

  return {
    pushed: false,
    reason: 'exhausted_retries',
    message: `Push failed after ${MAX_PUSH_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`,
    attempts: MAX_PUSH_RETRIES,
    remote,
  };
}

function parseGitStatus(output) {
  return String(output)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      raw: line,
      status: line.slice(0, 2).trim() || '??',
      path: normalizeGitPath(line.slice(3).trim()),
    }))
    .filter((entry) => entry.path);
}

function buildCheckpointPlan(entries) {
  if (!entries.length) {
    return null;
  }

  const touchedAreas = [];
  const touchedFiles = [];

  for (const entry of entries) {
    touchedFiles.push(entry.path);
    const root = entry.path.split('/')[0];

    if (KNOWLEDGE_ROOTS.includes(root) && !touchedAreas.includes(root)) {
      touchedAreas.push(root);
    }
  }

  const scopeLabel = touchedAreas.length ? touchedAreas.join(', ') : 'workspace';
  const commitMessage =
    touchedAreas.length > 0
      ? `[P-Reinforce] checkpoint: ${scopeLabel}`
      : '[P-Reinforce] checkpoint: workspace sync';

  return {
    touchedAreas,
    touchedFiles: touchedFiles.slice(0, 8),
    additionalFileCount: Math.max(0, touchedFiles.length - 8),
    commitMessage,
    message: `Suggested checkpoint scope: ${scopeLabel}.`,
  };
}

function normalizeGitPath(filePath) {
  if (!filePath) {
    return '';
  }

  const [, renamedTarget] = filePath.split(' -> ');
  return String(renamedTarget ?? filePath).replace(/\\/g, '/');
}
