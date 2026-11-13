// YDB maintenance CLI.
//   node scripts/db.mjs migrate   create tables
//   node scripts/db.mjs import    load data/build/spells.json (upsert + delete stale rows + bump version)
//   node scripts/db.mjs check     read everything back and compare with data/build/spells.json
// Connection: YDB_CONNECTION_STRING (grpcs://...?...database=/ru-central1/...), YDB_TOKEN (IAM token, `yc iam create-token`),
// or YDB_ANONYMOUS=1 for a local YDB in Docker (grpc://localhost:2136/?database=/local).
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { loadEnv } from './lib/env.mjs';
import * as db from '../api/src/store-ydb.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadEnv();
const cmd = process.argv[2];
const connectionString = process.env.YDB_CONNECTION_STRING;
if (!connectionString || !['migrate', 'import', 'check'].includes(cmd)) {
  console.error('usage: YDB_CONNECTION_STRING=... [YDB_TOKEN=...|YDB_ANONYMOUS=1] node scripts/db.mjs migrate|import|check');
  process.exit(2);
}
const conn = db.connect({ connectionString, token: process.env.YDB_TOKEN, anonymous: process.env.YDB_ANONYMOUS === '1' });
const data = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/build/spells.json'), 'utf8'));

try {
  await conn.ready(60_000);
  if (cmd === 'migrate') {
    await db.migrate(conn.driver);
    console.log('schema ok');
  } else if (cmd === 'import') {
    const d = data();
    const t = Date.now();
    await db.importDataset(conn.driver, d);
    console.log(`imported ${d.spells.length} spells, version ${d.version} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  } else {
    const expected = data();
    const actual = await db.loadAll(conn.driver);
    if (util.isDeepStrictEqual(actual, expected)) console.log(`check ok: database matches build (${actual.spells.length} spells, version ${actual.version})`);
    else {
      for (const k of Object.keys(expected)) {
        if (!util.isDeepStrictEqual(actual[k], expected[k])) {
          console.error(`MISMATCH in "${k}"`);
          if (Array.isArray(expected[k])) {
            const i = expected[k].findIndex((x, j) => !util.isDeepStrictEqual(x, actual[k]?.[j]));
            console.error(' expected:', JSON.stringify(expected[k][i]).slice(0, 600));
            console.error(' actual:  ', JSON.stringify(actual[k]?.[i]).slice(0, 600));
          } else console.error(' expected:', expected[k], ' actual:', actual[k]);
        }
      }
      process.exitCode = 1;
    }
  }
} finally {
  await conn.close();
}
