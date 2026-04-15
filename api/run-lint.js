import { runWorkspaceLint } from '../server/p-reinforce/maintenance.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const lint = await runWorkspaceLint();
    const reflection = (lint.warnings ?? []).map((message) => ({
      severity: 'warning',
      code: 'lint_storage',
      message,
    }));
    const integrity = await buildWorkspaceIntegrityReport({ reflection });

    return response.status(200).json({
      lint,
      reflection,
      integrity,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to run workspace lint.',
    });
  }
}
