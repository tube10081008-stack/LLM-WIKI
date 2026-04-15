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
