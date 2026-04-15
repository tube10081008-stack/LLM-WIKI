import {
  buildRebuildPlan,
  executeRebuild,
  readMigrationManifest,
  registerMigration,
} from '../server/p-reinforce/migration.js';
import { getStorageDescriptor } from '../server/p-reinforce/persistence.js';
import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const action = String(request.body?.action ?? 'plan').toLowerCase();
    const storage = getStorageDescriptor();
    const workspaceRoot = storage.workspaceRoot;
    const reflection = [];

    if (action === 'status') {
      const manifest = await readMigrationManifest(workspaceRoot);
      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({
        manifest,
        reflection,
        integrity,
      });
    }

    if (action === 'plan') {
      const trigger = request.body?.trigger ?? 'manual';
      const plan = await buildRebuildPlan({ trigger });
      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({
        plan,
        reflection,
        integrity,
      });
    }

    if (action === 'rebuild') {
      const trigger = request.body?.trigger ?? 'manual';
      const rebuild = await executeRebuild({ trigger });

      if (!rebuild.executed) {
        reflection.push({
          severity: 'warning',
          code: 'rebuild_skipped',
          message: rebuild.message,
        });
      }

      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({
        rebuild,
        reflection,
        integrity,
      });
    }

    if (action === 'migrate') {
      const toVersion = request.body?.toVersion;
      const description = request.body?.description;
      const changes = request.body?.changes ?? [];

      const migration = await registerMigration({ toVersion, description, changes });
      const integrity = await buildWorkspaceIntegrityReport({ reflection });

      return response.status(200).json({
        migration,
        reflection,
        integrity,
      });
    }

    return response.status(400).json({
      error: `Unknown migration action: ${action}. Use "status", "plan", "rebuild", or "migrate".`,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Migration operation failed.',
    });
  }
}
