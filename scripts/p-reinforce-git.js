import { readGitAutomationStatus } from '../server/p-reinforce/gitAutomation.js';
import { getStorageDescriptor } from '../server/p-reinforce/persistence.js';

const storage = getStorageDescriptor();
const status = await readGitAutomationStatus(storage.workspaceRoot);

console.log(JSON.stringify(status, null, 2));

if (!status.repository) {
  process.exit(1);
}
