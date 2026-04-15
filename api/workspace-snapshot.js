import { readWorkspaceSnapshot } from '../server/p-reinforce/workspaceSnapshot.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const snapshot = await readWorkspaceSnapshot();
    return response.status(200).json({ snapshot });
  } catch (error) {
    return response.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to read workspace snapshot.',
    });
  }
}
