import { buildWorkspaceIntegrityReport } from '../server/p-reinforce/roadmap.js';

const integrity = await buildWorkspaceIntegrityReport();

console.log(JSON.stringify(integrity, null, 2));

if ((integrity.criticalErrors?.length ?? 0) > 0) {
  process.exitCode = 1;
}
