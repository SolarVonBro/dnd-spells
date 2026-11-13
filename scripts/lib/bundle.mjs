// Encrypted data bundle for the static site.
// Layout: "DND1" | iterations (uint32 BE) | salt (16) | iv (12) | AES-256-GCM ciphertext of gzip(JSON) + tag (16)
// The browser derives the key with PBKDF2-SHA256(password, salt, iterations) — see src/crypto.ts.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const PBKDF2_ITERATIONS = 600_000;
const MAGIC = Buffer.from('DND1');

export function encryptBundle(json, key, salt, iterations = PBKDF2_ITERATIONS) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 })), cipher.final(), cipher.getAuthTag()]);
  const head = Buffer.alloc(8);
  MAGIC.copy(head, 0);
  head.writeUInt32BE(iterations, 4);
  return Buffer.concat([head, salt, iv, body]);
}

export function decryptBundle(buf, key) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('bad bundle');
  const iv = buf.subarray(24, 36);
  const body = buf.subarray(36);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(body.subarray(body.length - 16));
  const gz = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]);
  return zlib.gunzipSync(gz).toString('utf8');
}
