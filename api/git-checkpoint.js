import {
  executeGitCheckpoint,
  pushGitCheckpoint,
  readGitAutomationStatus,
} from '../server/p-reinforce/gitAutomation.js';
import { getStorageDescriptor } from '../server/p-reinforce/persistence.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const action = String(request.body?.action ?? 'checkpoint').toLowerCase();
    const storage = getStorageDescriptor();
    const workspaceRoot = storage.workspaceRoot;
    const reflection = [];

    if (action === 'status') {
      const gitStatus = await readGitAutomationStatus(workspaceRoot);
      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({
        git: gitStatus,
        reflection,
        integrity,
      });
    }

    if (action === 'checkpoint') {
      const commitMessage = request.body?.commitMessage ?? undefined;
      const checkpoint = await executeGitCheckpoint({ commitMessage });

      if (!checkpoint.committed) {
        reflection.push({
          severity: 'warning',
          code: 'git_checkpoint_skipped',
          message: checkpoint.message,
        });
      }

      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({
        checkpoint,
        reflection,
        integrity,
      });
    }

    if (action === 'push') {
      const remote = request.body?.remote ?? 'origin';
      const push = await pushGitCheckpoint({ remote });

      if (!push.pushed) {
        reflection.push({
          severity: 'warning',
          code: 'git_push_failed',
          message: push.message,
        });
      }

      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({
        push,
        reflection,
        integrity,
      });
    }

    return response.status(400).json({
      error: `Unknown git action: ${action}. Use "status", "checkpoint", or "push".`,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Git operation failed.',
    });
  }
}
