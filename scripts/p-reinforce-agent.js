import fs from 'node:fs';
import path from 'node:path';

import {
  runWorkspaceAgentScan,
  setWorkspaceAgentWatchState,
} from '../server/p-reinforce/agent.js';
import { getStorageDescriptor } from '../server/p-reinforce/persistence.js';

const watchMode = process.argv.includes('--watch');
const storage = getStorageDescriptor();

if (!storage.writesEnabled) {
  console.error(storage.reason);
  process.exit(1);
}

if (!watchMode) {
  const result = await runWorkspaceAgentScan({ origin: 'manual_scan' });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const rawRoot = path.resolve(storage.workspaceRoot, '00_Raw');
let debounceTimer = null;

await setWorkspaceAgentWatchState('watching', {
  watchMode: 'watch',
  summary: 'Local raw watcher is active.',
});

await runWorkspaceAgentScan({
  origin: 'watcher_scan',
  keepWatching: true,
});

const watcher = fs.watch(rawRoot, { recursive: true }, () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    try {
      await runWorkspaceAgentScan({
        origin: 'watcher_scan',
        keepWatching: true,
      });
      console.log(`[agent] scanned ${new Date().toISOString()}`);
    } catch (error) {
      console.error('[agent] scan failed', error);
      await setWorkspaceAgentWatchState('error', {
        watchMode: 'watch',
        summary: error instanceof Error ? error.message : 'Watcher scan failed.',
      }).catch(() => {});
    }
  }, 250);
});

function shutdown() {
  watcher.close();

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  setWorkspaceAgentWatchState('idle', {
    watchMode: 'manual',
    summary: 'Local raw watcher stopped.',
  }).catch(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[agent] watching ${rawRoot}`);
