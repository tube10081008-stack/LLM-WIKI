import { readWorkspaceNodeDetail } from '../server/p-reinforce/workspaceSnapshot.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const nodePath = String(request.query?.path ?? '').trim();

    if (!nodePath) {
      return response.status(400).json({ error: 'Missing node path.' });
    }

    const node = await readWorkspaceNodeDetail(nodePath);
    return response.status(200).json({ node });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to read workspace node.',
    });
  }
}
