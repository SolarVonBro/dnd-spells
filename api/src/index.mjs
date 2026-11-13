// Yandex Cloud Function entry point (behind API Gateway). Bundled to CommonJS by scripts/build-function.mjs.
// Env: YDB_CONNECTION_STRING, PASSWORD_HASH, TOKEN_SECRET, ADMIN_TOKEN. Auth to YDB: the function's service account token.
import util from 'node:util';
import { createApp } from './app.mjs';
import * as db from './store-ydb.mjs';

let conn = null;
let app = null;

function init(token) {
  conn = db.connect({ connectionString: process.env.YDB_CONNECTION_STRING, token });
  const ready = conn.ready(15_000);
  const store = {
    getVersion: async () => { await ready; return db.getVersion(conn.driver); },
    loadAll: async () => { await ready; return db.loadAll(conn.driver); },
    // Import runs inside the cloud (reliable link to YDB) and is verified by reading everything back.
    importAll: async (data) => {
      await ready;
      await db.migrate(conn.driver);
      await db.importDataset(conn.driver, data);
      return util.isDeepStrictEqual(await db.loadAll(conn.driver), data);
    },
  };
  app = createApp({ store, passwordHash: process.env.PASSWORD_HASH, secret: process.env.TOKEN_SECRET, adminToken: process.env.ADMIN_TOKEN });
}

const requestPath = (event) => {
  // API Gateway passes the path template in event.path ("/api/{path+}") and the real one in event.url.
  if (event.url) return event.url.split('?')[0];
  let p = event.path || '/';
  for (const [k, v] of Object.entries(event.pathParams || event.pathParameters || {})) p = p.replace(new RegExp(`\\{${k}\\+?\\}`), v);
  return p;
};

export async function handler(event, context) {
  const token = context?.token?.access_token;
  if (!app) init(token);
  else if (token) conn.setToken(token);

  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
  const res = await app({ method: event.httpMethod, path: requestPath(event), headers: event.headers || {}, body });
  const binary = Buffer.isBuffer(res.body);
  return {
    statusCode: res.status,
    headers: res.headers,
    body: binary ? res.body.toString('base64') : res.body,
    isBase64Encoded: binary,
  };
}
