// Site password + long-lived access tokens (no accounts: one shared password).
// PASSWORD_HASH = "scrypt$N$r$p$<salt b64url>$<hash b64url>", TOKEN_SECRET = random base64url.
// (base64url: no "=", "+" or "," — safe to pass through `yc --environment KEY=VALUE,...`.)
import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function hashPassword(password, { N = 16384, r = 8, p = 1 } = {}) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password).normalize('NFC'), salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export const newSecret = () => crypto.randomBytes(32).toString('base64url');

export function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(String(password).normalize('NFC'), Buffer.from(salt, 'base64url'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

// Tokens are bound to the current password: changing the password invalidates every token.
const passwordTag = (passwordHash) => crypto.createHash('sha256').update(passwordHash).digest('base64url').slice(0, 12);

export function issueToken({ passwordHash, secret }) {
  const payload = b64url(JSON.stringify({ p: passwordTag(passwordHash), iat: Math.floor(Date.now() / 1000) }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function checkToken(token, { passwordHash, secret }) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).p === passwordTag(passwordHash);
  } catch {
    return false;
  }
}
