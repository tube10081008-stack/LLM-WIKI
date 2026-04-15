import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const integrity = await buildWorkspaceIntegrityReport();

    return response.status(200).json({ integrity });
  } catch (error) {
    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to build workspace integrity report.',
    });
  }
}
