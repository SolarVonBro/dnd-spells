// Encrypts data/build/spells.json into src/data/spells.bin (the only data file that is published).
// The key comes from .env.local (npm run set-password). Verifies the result by decrypting it back.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './lib/env.mjs';
import { encryptBundle, decryptBundle } from './lib/bundle.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadEnv();
if (!process.env.DATA_KEY || !process.env.DATA_SALT) {
  console.error('Нет ключа шифрования. Выполните: npm run set-password');
  process.exit(1);
}
const key = Buffer.from(process.env.DATA_KEY, 'base64url');
const salt = Buffer.from(process.env.DATA_SALT, 'base64url');
const json = fs.readFileSync(path.join(ROOT, 'data/build/spells.json'), 'utf8');
const bundle = encryptBundle(json, key, salt);
if (decryptBundle(bundle, key) !== json) throw new Error('round-trip check failed');
const out = path.join(ROOT, 'src/data/spells.bin');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bundle);
console.log(`src/data/spells.bin: ${(bundle.length / 1024).toFixed(0)} KB, version ${JSON.parse(json).version}`);
