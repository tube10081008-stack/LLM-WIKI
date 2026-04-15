import { processWorkspaceAgentQueue } from '../server/p-reinforce/agent.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const processResult = await processWorkspaceAgentQueue({
      limit: request.body?.limit ?? 3,
    });
    const reflection = (processResult.warnings ?? []).map((message) => ({
      severity: 'warning',
      code: 'agent_worker',
      message,
    }));
    const integrity = await buildWorkspaceIntegrityReport({ reflection });

    return response.status(200).json({
      process: processResult,
      reflection,
      integrity,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process agent queue.',
    });
  }
}
