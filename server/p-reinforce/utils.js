import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Resolve a relative path within the workspace root, refusing any path traversal.
 * Shared across persistence, workspaceSnapshot, agent, and maintenance modules.
 */
export function resolveWithinWorkspace(workspaceRoot, relativePath) {
  const normalizedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(normalizedRoot, relativePath);

  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Refusing to access path outside workspace: ${relativePath}`);
  }

  return resolved;
}

/**
 * Recursively walk a directory tree and collect files matching a predicate.
 * Shared across agent and workspaceSnapshot modules.
 */
export async function walkFiles(rootDirectory, predicate) {
  try {
    const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const absolutePath = path.join(rootDirectory, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await walkFiles(absolutePath, predicate)));
        continue;
      }

      if (entry.isFile() && predicate(absolutePath)) {
        files.push(absolutePath);
      }
    }

    return files;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

/**
 * Slugify a string for use as file/ID segments.
 * Shared across persistence and proposalBuilder modules.
 */
export function slugify(value) {
  const fallback = String(value || 'untitled')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return fallback || 'untitled';
}

/**
 * Read and parse a JSON artifact, returning null if the file does not exist.
 * Shared across maintenance and workspaceSnapshot modules.
 */
export async function readJsonArtifact(workspaceRoot, relativePath) {
  try {
    const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);
    return JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/**
 * Generate a short random suffix for IDs and deduplication.
 * Shared across agent and maintenance modules.
 */
export function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}
