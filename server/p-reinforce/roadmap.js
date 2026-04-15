import fs from 'node:fs/promises';
import path from 'node:path';

import { getContractHealth } from './contracts.js';
import { getStorageDescriptor } from './persistence.js';

export const ROADMAP_STEPS = [
  { id: 'step0', label: 'Step 0. Thesis Lock', dependsOn: [] },
  { id: 'step1', label: 'Step 1. Studio Prototype', dependsOn: ['step0'] },
  { id: 'step2', label: 'Step 2. Persistent Knowledge Contracts', dependsOn: ['step0', 'step1'] },
  { id: 'step3', label: 'Step 3. Information Architecture Expansion', dependsOn: ['step1', 'step2'] },
  { id: 'step4', label: 'Step 4. Apply and Persist', dependsOn: ['step2', 'step3'] },
  { id: 'step5', label: 'Step 5. Reinforcement Loop', dependsOn: ['step2', 'step4'] },
  { id: 'step6', label: 'Step 6. Garden Health and Lint', dependsOn: ['step2', 'step4'] },
  { id: 'step7', label: 'Step 7. Local Workspace Agent', dependsOn: ['step2', 'step4'] },
  { id: 'step8', label: 'Step 8. Git and GitHub Automation', dependsOn: ['step4', 'step7'] },
  { id: 'step9', label: 'Step 9. Rebuild and Migration System', dependsOn: ['step2', 'step4', 'step8'] },
  { id: 'step10', label: 'Step 10. 10-Year Reliability Mode', dependsOn: ['step2', 'step4', 'step9'] },
];

export async function buildWorkspaceIntegrityReport(options = {}) {
  const contractHealth = options.contractHealth ?? (await getContractHealth());
  const storage = options.storage ?? getStorageDescriptor();
  const gitReady = options.gitReady ?? (await hasGitRepository(storage.workspaceRoot));
  const reflection = normalizeReflection(options.reflection);
  const criticalErrors = [...(contractHealth.errors ?? [])];
  const warnings = [];

  if (!contractHealth.valid) {
    criticalErrors.push('Contract bundle failed to compile, so step transitions must stop.');
  }

  if (!storage.durable) {
    warnings.push(storage.reason);
  }

  for (const entry of reflection) {
    if (entry.severity === 'critical') {
      criticalErrors.push(entry.message);
    }

    if (entry.severity === 'warning') {
      warnings.push(entry.message);
    }
  }

  const gates = [
    {
      id: 'contracts_loaded',
      label: 'Contract bundle compiled',
      status: contractHealth.valid ? 'pass' : 'fail',
      blocksStep: 'step2',
      detail: contractHealth.valid
        ? 'Canonical and derived schemas are machine-valid.'
        : 'One or more schema contracts failed to compile.',
    },
    {
      id: 'durable_storage',
      label: 'Durable storage available',
      status: storage.durable ? 'pass' : 'blocked',
      blocksStep: 'step4',
      detail: storage.reason,
    },
    {
      id: 'filesystem_writer',
      label: 'Filesystem writer enabled',
      status: storage.writesEnabled ? 'pass' : 'blocked',
      blocksStep: 'step4',
      detail: storage.writesEnabled
        ? 'Raw bundles, wiki nodes, and derived artifacts can be written locally.'
        : 'Writes are intentionally disabled to avoid pretending serverless storage is durable.',
    },
    {
      id: 'policy_state',
      label: 'Policy state ready for reinforcement',
      status: storage.durable ? 'pass' : 'blocked',
      blocksStep: 'step5',
      detail: storage.durable
        ? 'policy.json can be materialized and versioned in the workspace.'
        : 'Step 5 stays blocked until persistent local storage exists.',
    },
    {
      id: 'graph_lint_runtime',
      label: 'Graph cache ready for lint',
      status: storage.durable ? 'pass' : 'blocked',
      blocksStep: 'step6',
      detail: storage.durable
        ? 'graph.cache.json can be scanned and lint events can be appended locally.'
        : 'Step 6 stays blocked until graph artifacts live in durable local storage.',
    },
    {
      id: 'local_agent_runtime',
      label: 'Local queue and watcher artifacts available',
      status: storage.durable ? 'pass' : 'blocked',
      blocksStep: 'step7',
      detail: storage.durable
        ? '30_Ops/jobs can host queue.json and agent-status.json for the local workspace agent.'
        : 'Step 7 stays blocked until local durable storage exists.',
    },
    {
      id: 'git_repository',
      label: 'Git repository available for checkpoints',
      status: gitReady ? 'pass' : 'blocked',
      blocksStep: 'step8',
      detail: gitReady
        ? 'Workspace is inside a Git repository, so checkpoints can become durable commits.'
        : 'Step 8 stays blocked until the workspace is initialized as a Git repository.',
    },
  ];
  const progress = buildProgressState({ contractHealth, storage, gitReady });

  return {
    generatedAt: new Date().toISOString(),
    currentPosition: progress.currentPosition,
    currentStep: findStep(progress.currentStepId),
    nextStep: findStep(progress.nextStepId),
    steps: progress.stepStatuses.map((step) => ({
      ...step,
      dependsOn: findStep(step.id).dependsOn,
    })),
    gates,
    storage,
    contractHealth,
    criticalErrors: uniqueList(criticalErrors),
    warnings: uniqueList(warnings),
    reflection,
  };
}

function buildProgressState({ contractHealth, storage, gitReady }) {
  if (!contractHealth.valid) {
    return {
      currentPosition: 'Step 1 complete -> repairing Step 2',
      currentStepId: 'step2',
      nextStepId: 'step3',
      stepStatuses: [
        { id: 'step0', label: findStep('step0').label, status: 'Contracted' },
        { id: 'step1', label: findStep('step1').label, status: 'Implemented' },
        { id: 'step2', label: findStep('step2').label, status: 'In design' },
        { id: 'step3', label: findStep('step3').label, status: 'Blocked' },
        { id: 'step4', label: findStep('step4').label, status: 'Blocked' },
        { id: 'step5', label: findStep('step5').label, status: 'Blocked' },
        { id: 'step6', label: findStep('step6').label, status: 'Not started' },
        { id: 'step7', label: findStep('step7').label, status: 'Not started' },
        { id: 'step8', label: findStep('step8').label, status: 'Not started' },
        { id: 'step9', label: findStep('step9').label, status: 'Not started' },
        { id: 'step10', label: findStep('step10').label, status: 'Not started' },
      ],
    };
  }

  return {
    currentPosition: storage.durable
      ? gitReady
        ? 'Step 8 active -> validating Git checkpoints'
        : 'Step 7 complete -> entering Step 8'
      : 'Step 4 blocked -> Steps 5 and 6 await durable runtime',
    currentStepId: storage.durable ? (gitReady ? 'step8' : 'step7') : 'step4',
    nextStepId: storage.durable ? (gitReady ? 'step9' : 'step8') : 'step5',
    stepStatuses: [
      { id: 'step0', label: findStep('step0').label, status: 'Contracted' },
      { id: 'step1', label: findStep('step1').label, status: 'Implemented' },
      { id: 'step2', label: findStep('step2').label, status: 'Implemented' },
      { id: 'step3', label: findStep('step3').label, status: 'Implemented' },
      {
        id: 'step4',
        label: findStep('step4').label,
        status: storage.durable && storage.writesEnabled ? 'Implemented' : 'Blocked',
      },
      {
        id: 'step5',
        label: findStep('step5').label,
        status: storage.durable ? 'Implemented' : 'Blocked',
      },
      {
        id: 'step6',
        label: findStep('step6').label,
        status: storage.durable ? 'Implemented' : 'Blocked',
      },
      {
        id: 'step7',
        label: findStep('step7').label,
        status: storage.durable ? 'Implemented' : 'Not started',
      },
      {
        id: 'step8',
        label: findStep('step8').label,
        status: storage.durable ? (gitReady ? 'In design' : 'Blocked') : 'Not started',
      },
      { id: 'step9', label: findStep('step9').label, status: 'Not started' },
      { id: 'step10', label: findStep('step10').label, status: 'Not started' },
    ],
  };
}

async function hasGitRepository(workspaceRoot) {
  try {
    await fs.access(path.resolve(workspaceRoot, '.git'));
    return true;
  } catch {
    return false;
  }
}

function normalizeReflection(reflection) {
  if (!Array.isArray(reflection)) {
    return [];
  }

  return reflection
    .filter((entry) => entry?.message)
    .map((entry) => ({
      severity: entry.severity === 'critical' ? 'critical' : 'warning',
      code: entry.code ? String(entry.code) : 'reflection_note',
      message: String(entry.message),
    }));
}

function findStep(stepId) {
  return ROADMAP_STEPS.find((step) => step.id === stepId);
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}
