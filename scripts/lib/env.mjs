// Minimal .env.local loader (KEY=VALUE lines). Secrets live only there; the file is git-ignored.
import fs from 'node:fs';
import path from 'node:path';

export const ENV_FILE = path.resolve(import.meta.dirname, '../../.env.local');

export function readEnvFile(file = ENV_FILE) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

export function loadEnv(file = ENV_FILE) {
  for (const [k, v] of Object.entries(readEnvFile(file))) if (process.env[k] === undefined) process.env[k] = v;
}

export function writeEnvValues(values, file = ENV_FILE) {
  const cur = readEnvFile(file);
  Object.assign(cur, values);
  fs.writeFileSync(file, Object.entries(cur).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}
