import fs from 'node:fs';
import path from 'node:path';

// Catalogue snapshots are local server data, scoped to the exact approved tree.
export function readLibrarySnapshot(file, scope) {
  try {
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (snapshot.version !== 1 || snapshot.scope !== scope) return null;
    const cache = snapshot.cache;
    if (!cache || !Number.isFinite(cache.fetchedAt) || !Array.isArray(cache.videos)
      || !Array.isArray(cache.warnings) || !Number.isFinite(cache.folderCount)) return null;
    if (!cache.videos.every((video) => typeof video.id === 'string' && typeof video.title === 'string')) return null;
    return cache;
  } catch {
    return null;
  }
}

export function writeLibrarySnapshot(file, scope, cache) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ version: 1, scope, cache }), { mode: 0o600 });
  fs.renameSync(temp, file);
}
