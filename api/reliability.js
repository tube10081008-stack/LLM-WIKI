import { buildReliabilityReport, exportKnowledgeBase } from '../server/p-reinforce/reliability.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const action = String(request.body?.action ?? 'report').toLowerCase();
    const reflection = [];

    if (action === 'report') {
      const report = await buildReliabilityReport();
      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({ report, reflection, integrity });
    }

    if (action === 'export') {
      const result = await exportKnowledgeBase();
      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({ export: result, reflection, integrity });
    }

    return response.status(400).json({
      error: `Unknown reliability action: ${action}. Use "report" or "export".`,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Reliability operation failed.',
    });
  }
}
