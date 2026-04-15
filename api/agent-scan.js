import { runWorkspaceAgentScan } from '../server/p-reinforce/agent.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const scan = await runWorkspaceAgentScan({ origin: 'manual_scan' });
    const reflection = (scan.warnings ?? []).map((message) => ({
      severity: 'warning',
      code: 'agent_storage',
      message,
    }));
    const integrity = await buildWorkspaceIntegrityReport({ reflection });

    return response.status(200).json({
      scan,
      reflection,
      integrity,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to scan raw workspace.',
    });
  }
}
