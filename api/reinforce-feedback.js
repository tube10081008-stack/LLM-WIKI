import { applyReinforcementFeedback } from '../server/p-reinforce/maintenance.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const feedback = request.body?.feedback;

    if (!feedback) {
      return response.status(400).json({ error: 'Missing feedback payload.' });
    }

    const result = await applyReinforcementFeedback(feedback);
    const reflection = (result.warnings ?? []).map((message) => ({
      severity: 'warning',
      code: 'reinforcement_storage',
      message,
    }));
    const integrity = await buildWorkspaceIntegrityReport({ reflection });

    return response.status(200).json({
      feedback: result.feedback,
      policyState: result.policyState,
      storage: result.storage,
      reflection,
      integrity,
    });
  } catch (error) {
    return response.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to apply reinforcement feedback.',
    });
  }
}
