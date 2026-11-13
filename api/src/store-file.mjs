// Local development store: serves data/build/spells.json (same shape as the YDB store returns).
import fs from 'node:fs';

export function fileStore(file) {
  let cached = null; // { mtime, data }
  const read = () => {
    const mtime = fs.statSync(file).mtimeMs;
    if (!cached || cached.mtime !== mtime) cached = { mtime, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
    return cached.data;
  };
  return {
    getVersion: async () => read().version,
    loadAll: async () => read(),
  };
}
