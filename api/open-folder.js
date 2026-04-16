import { exec } from 'node:child_process';
import path from 'node:path';
import { getStorageDescriptor } from '../server/p-reinforce/persistence.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const relativePath = String(request.body?.path ?? '').trim();

    if (!relativePath) {
      return response.status(400).json({ error: 'Path is required.' });
    }

    const storage = getStorageDescriptor();
    const absolutePath = path.resolve(storage.workspaceRoot, relativePath);
    const folderPath = path.dirname(absolutePath);

    // exec를 Promise로 감싸서 에러를 안전하게 처리
    await new Promise((resolve) => {
      exec(`explorer.exe "${folderPath}"`, (error) => {
        // explorer.exe는 성공해도 exit code 1을 반환할 수 있으므로 에러 무시
        resolve();
      });
    });

    return response.status(200).json({ success: true, folder: folderPath });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to open folder.',
    });
  }
}
