import { persistKnowledgeProposal } from '../server/p-reinforce/persistence.js';
import {
  hydrateSerializedProposal,
} from '../server/p-reinforce/proposalBuilder.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const proposalPayload = request.body?.proposal;

    if (!proposalPayload) {
      return response.status(400).json({
        error: 'Missing proposal payload.',
      });
    }

    const proposal = await hydrateSerializedProposal(proposalPayload);
    const persistence = await persistKnowledgeProposal(proposal);
    const reflection = [
      ...(proposal.reflection ?? []),
      ...(persistence.warnings ?? []).map((message) => ({
        severity: 'warning',
        code: 'storage_mode',
        message,
      })),
    ];

    try {
      const { executeGitCheckpoint, pushGitCheckpoint } = await import('../server/p-reinforce/gitAutomation.js');
      const checkpoint = await executeGitCheckpoint({ commitMessage: `auto: node apply - ${proposal.frontmatter.title}` });
      
      let push = null;
      if (checkpoint.committed || checkpoint.reason === 'clean_workspace') {
        push = await pushGitCheckpoint({ remote: 'origin' });
      }

      if (push && !push.pushed) {
        reflection.push({
          severity: 'warning',
          code: 'auto_git_push_failed',
          message: `Auto-push failed: ${push.message}`,
        });
      } else if (push && push.pushed) {
        reflection.push({
          severity: 'info',
          code: 'auto_git_push_success',
          message: 'Workspace successfully backed up to GitHub.',
        });
      } else if (checkpoint.committed) {
        reflection.push({
          severity: 'info',
          code: 'auto_git_commit_success',
          message: `Changes committed locally: ${checkpoint.message}`,
        });
      }
    } catch (gitError) {
      reflection.push({
        severity: 'warning',
        code: 'auto_git_error',
        message: `Failed to automate git tasks: ${gitError.message}`,
      });
    }

    const integrity = await buildWorkspaceIntegrityReport({ reflection });

    return response.status(200).json({
      persistence,
      reflection,
      integrity,
    });
  } catch (error) {
    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to apply proposal.',
    });
  }
}
