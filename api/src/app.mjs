// Transport-independent API: used by the Yandex Cloud Function (index.mjs) and by the Vite dev server.
//   POST /api/login   {password}       -> {token}
//   GET  /api/spells  Bearer <token>   -> full dataset (gzip JSON, ETag = data version)
//   GET  /api/health                   -> ok
//   POST /api/admin/import  x-admin-token, body = base64(gzip(dataset JSON))
//        -> loads the dataset into the database from inside the cloud and verifies it by reading it back
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { checkToken, issueToken, verifyPassword } from './auth.mjs';

const VERSION_TTL_MS = 60_000;

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * @param {{ store: { getVersion(): Promise<string>, loadAll(): Promise<object>, importAll?(data: object): Promise<boolean> },
 *           passwordHash: string, secret: string, adminToken?: string }} deps
 */
export function createApp({ store, passwordHash, secret, adminToken }) {
  if (!passwordHash || !secret) throw new Error('PASSWORD_HASH and TOKEN_SECRET must be set');
  let cache = null; // { version, gz }
  let versionCheckedAt = 0;
  let currentVersion = null;

  async function latestVersion() {
    if (!currentVersion || Date.now() - versionCheckedAt > VERSION_TTL_MS) {
      currentVersion = await store.getVersion();
      versionCheckedAt = Date.now();
    }
    return currentVersion;
  }

  async function dataset(version) {
    if (cache?.version === version) return cache;
    const data = await store.loadAll();
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
    cache = { version: data.version, gz };
    return cache;
  }

  const json = (status, obj, headers = {}) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
    body: JSON.stringify(obj),
  });

  return async function handle({ method, path, headers = {}, body = '' }) {
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    try {
      if (path === '/api/health') return json(200, { ok: true });

      if (path === '/api/login' && method === 'POST') {
        let password = '';
        try { password = JSON.parse(body || '{}').password ?? ''; } catch { /* bad json */ }
        if (!password || !verifyPassword(password, passwordHash)) {
          await new Promise((r) => setTimeout(r, 400)); // slow down guessing
          return json(401, { error: 'wrong_password' });
        }
        return json(200, { token: issueToken({ passwordHash, secret }) });
      }

      if (path === '/api/spells' && method === 'GET') {
        const token = (h.authorization || '').replace(/^Bearer\s+/i, '');
        if (!checkToken(token, { passwordHash, secret })) return json(401, { error: 'unauthorized' });
        const version = await latestVersion();
        const etag = `"${version}"`;
        if (h['if-none-match'] === etag) return { status: 304, headers: { etag, 'cache-control': 'no-cache' }, body: '' };
        const d = await dataset(version);
        return {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-encoding': 'gzip',
            etag: `"${d.version}"`,
            'cache-control': 'no-cache',
          },
          body: d.gz,
        };
      }
      if (path === '/api/admin/import' && method === 'POST') {
        if (!adminToken || adminToken.length < 32 || !store.importAll || !sameSecret(h['x-admin-token'] || '', adminToken)) {
          await new Promise((r) => setTimeout(r, 400));
          return json(403, { error: 'forbidden' });
        }
        try {
          const data = JSON.parse(zlib.gunzipSync(Buffer.from(body, 'base64')).toString('utf8'));
          const verified = await store.importAll(data);
          cache = null;
          currentVersion = null;
          return json(verified ? 200 : 500, { ok: verified, version: data.version, spells: data.spells.length, verified });
        } catch (e) {
          // Only the admin sees details (function logs may be unavailable).
          return json(500, { error: 'import_failed', message: String(e?.message ?? e).slice(0, 1500), issues: e?.issues ?? null });
        }
      }

      return json(404, { error: 'not_found' });
    } catch (e) {
      console.error(e);
      return json(500, { error: 'server_error' });
    }
  };
}
