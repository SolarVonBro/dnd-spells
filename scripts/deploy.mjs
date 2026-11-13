// Deploys the site to Yandex Cloud (idempotent — safe to re-run):
//   Object Storage (private bucket, static files) + Cloud Function (API) + YDB Serverless (data) + API Gateway (one HTTPS domain).
// Requirements: yc CLI logged in (`yc init`), `npm run set-password` done once.
// Everything stays in the free tier: tiny storage, function/gateway scaling limits, YDB RU throttling.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { loadEnv, writeEnvValues } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadEnv();
const YC = process.env.YC_BIN || path.join(os.homedir(), 'yandex-cloud', 'bin', process.platform === 'win32' ? 'yc.exe' : 'yc');
const NAME = 'dnd-spells';
const SA_NAME = `${NAME}-sa`;
const FN_NAME = `${NAME}-api`;
const step = (m) => console.log(`\n▸ ${m}`);

function run(cmd, args, { allowFail = false, input, env, quiet = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', input, env: { ...process.env, ...env }, maxBuffer: 64 << 20, stdio: [input ? 'pipe' : 'inherit', 'pipe', 'pipe'] });
    const out = (r.stdout || '').trim();
    const err = (r.stderr || '').trim();
    if (r.status === 0) return out;
    // The connection to Yandex Cloud may drop a large share of TCP connects: retry network errors generously.
    // "Database not found": a just-created serverless database needs a little time before its endpoint serves it.
    const transient = /DeadlineExceeded|UNAVAILABLE|Unavailable|TransportUnavailable|No connection established|connection reset|ECONNRESET|ETIMEDOUT|timeout|TLS handshake|Database not found/i.test(err);
    if (transient && attempt < 12) {
      if (!quiet) console.log(`  (сеть: повтор ${attempt}/11)`);
      spawnSync(process.execPath, ['-e', `setTimeout(()=>{}, ${/Database not found/i.test(err) ? 10000 : 2000})`]);
      continue;
    }
    if (allowFail) return null;
    console.error(`\nКоманда завершилась с ошибкой: ${path.basename(cmd)} ${args.join(' ')}\n${err || out}`);
    process.exit(1);
  }
}
const yc = (...args) => run(YC, args);
const ycJson = (...args) => JSON.parse(run(YC, [...args, '--format', 'json']));
const ycTry = (...args) => { const o = run(YC, [...args, '--format', 'json'], { allowFail: true, quiet: true }); return o ? JSON.parse(o) : null; };
// Run JS tools directly with node (spawning npm.cmd without a shell is refused by Node on Windows).
const node = (...args) => run(process.execPath, args, { quiet: true });

/* ---------- 0. preconditions ---------- */
if (!fs.existsSync(YC)) { console.error(`Не найден yc CLI: ${YC} (укажите путь в YC_BIN)`); process.exit(1); }
if (!process.env.PASSWORD_HASH || !process.env.TOKEN_SECRET) {
  console.error('Пароль сайта не задан. Выполните: npm run set-password');
  process.exit(1);
}
step('Проверка входа в Yandex Cloud (если откроется браузер — войдите в аккаунт)');
const folderId = yc('config', 'get', 'folder-id');
ycJson('resource-manager', 'folder', 'get', folderId);
console.log(`  каталог: ${folderId}`);

/* ---------- 1. build ---------- */
step('Сборка данных и сайта');
console.log(`  ${node('scripts/build-data.mjs').split('\n')[0]}`);
node('node_modules/typescript/bin/tsc', '--noEmit', '-p', '.');
console.log(`  ${node('node_modules/vite/bin/vite.js', 'build').split('\n').filter((l) => /built in/.test(l)).join('').replace(/\x1b\[[0-9;]*m/g, '')}`);
console.log(`  ${run(process.execPath, ['scripts/build-function.mjs'])}`);

/* ---------- 2. service account ---------- */
step('Сервисный аккаунт');
let sa = ycTry('iam', 'service-account', 'get', '--name', SA_NAME);
if (!sa) sa = ycJson('iam', 'service-account', 'create', '--name', SA_NAME, '--description', 'dnd-spells: API Gateway and Function');
console.log(`  ${SA_NAME}: ${sa.id}`);

/* ---------- 3. YDB serverless ---------- */
step('База данных YDB (serverless)');
let db = ycTry('ydb', 'database', 'get', '--name', NAME);
if (!db) {
  // 1 GB storage; the RU/s throttle guards against runaway usage (10 RU/s was too low: queries timed out).
  db = ycJson('ydb', 'database', 'create', '--name', NAME, '--serverless', '--sls-storage-size', '1GB',
    '--sls-enable-throttling-rcu', '--sls-throttling-rcu', '300', '--description', 'dnd-spells: spells database');
}
for (let i = 0; db.status !== 'RUNNING' && i < 60; i++) {
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 5000)']);
  db = ycJson('ydb', 'database', 'get', '--name', NAME);
}
console.log(`  ${NAME}: ${db.status}, ${db.endpoint}`);
run(YC, ['ydb', 'database', 'add-access-binding', '--name', NAME, '--role', 'ydb.editor', '--service-account-id', sa.id], { allowFail: true, quiet: true });


/* ---------- 4. function ---------- */
step('Cloud Function (API)');
let fn = ycTry('serverless', 'function', 'get', '--name', FN_NAME);
if (!fn) fn = ycJson('serverless', 'function', 'create', '--name', FN_NAME, '--description', 'dnd-spells API');
// Admin token for /api/admin/import: data is loaded into YDB by the function itself (inside the cloud),
// because a direct gRPC import from this computer depends on an unstable connection.
if (!process.env.ADMIN_TOKEN) {
  process.env.ADMIN_TOKEN = crypto.randomBytes(32).toString('base64url');
  writeEnvValues({ ADMIN_TOKEN: process.env.ADMIN_TOKEN });
}
const envArg = [
  `YDB_CONNECTION_STRING=${db.endpoint}`,
  `ADMIN_TOKEN=${process.env.ADMIN_TOKEN}`,
  `PASSWORD_HASH=${process.env.PASSWORD_HASH}`,
  `TOKEN_SECRET=${process.env.TOKEN_SECRET}`,
].join(',');
const ver = ycJson('serverless', 'function', 'version', 'create', '--function-id', fn.id, '--runtime', 'nodejs22',
  '--entrypoint', 'index.handler', '--memory', '256m', '--execution-timeout', '120s',
  '--service-account-id', sa.id, '--source-path', 'build/function.zip', '--environment', envArg);
console.log(`  ${FN_NAME}: версия ${ver.id}`);
run(YC, ['serverless', 'function', 'set-scaling-policy', '--id', fn.id, '--tag', '$latest', '--zone-instances-limit', '3', '--zone-requests-limit', '3'], { allowFail: true });
run(YC, ['serverless', 'function', 'add-access-binding', '--id', fn.id, '--role', 'functions.functionInvoker', '--service-account-id', sa.id], { allowFail: true, quiet: true });

/* ---------- 5. bucket with static files ---------- */
step('Object Storage (статические файлы)');
let bucket = process.env.DEPLOY_BUCKET;
if (!bucket) {
  bucket = `${NAME}-${crypto.randomBytes(3).toString('hex')}`;
  writeEnvValues({ DEPLOY_BUCKET: bucket });
}
if (!ycTry('storage', 'bucket', 'get', '--name', bucket)) {
  ycJson('storage', 'bucket', 'create', '--name', bucket, '--default-storage-class', 'standard', '--max-size', String(100 * 1024 * 1024));
}
// Private bucket; only the service account (used by API Gateway) can read it.
yc('storage', 'bucket', 'update', '--name', bucket, '--grants', `grant-type=grant-type-account,grantee-id=${sa.id},permission=permission-read`);
run(YC, ['storage', 's3', 'cp', '--recursive', '--only-show-errors', '--cache-control', 'public, max-age=31536000, immutable', 'dist/assets/', `s3://${bucket}/assets/`]);
run(YC, ['storage', 's3', 'cp', '--recursive', '--only-show-errors', '--cache-control', 'no-cache', '--exclude', 'assets/*', 'dist/', `s3://${bucket}/`]);
console.log(`  ${bucket}: файлы загружены`);

/* ---------- 6. API Gateway ---------- */
step('API Gateway (HTTPS-адрес сайта)');
const spec = `openapi: 3.0.0
info:
  title: ${NAME}
  version: 1.0.0
paths:
  /:
    get:
      x-yc-apigateway-integration:
        type: object_storage
        bucket: ${bucket}
        object: index.html
        service_account_id: ${sa.id}
  /api/{path+}:
    x-yc-apigateway-any-method:
      parameters:
        - name: path
          in: path
          required: true
          schema:
            type: string
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: ${fn.id}
        tag: $latest
        service_account_id: ${sa.id}
  /{file+}:
    get:
      parameters:
        - name: file
          in: path
          required: true
          schema:
            type: string
      x-yc-apigateway-integration:
        type: object_storage
        bucket: ${bucket}
        object: '{file}'
        error_object: index.html
        service_account_id: ${sa.id}
`;
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
const specFile = path.join(ROOT, 'build', 'gateway.yaml');
fs.writeFileSync(specFile, spec);
let gw = ycTry('serverless', 'api-gateway', 'get', '--name', NAME);
gw = gw
  ? ycJson('serverless', 'api-gateway', 'update', '--name', NAME, '--spec', specFile, '--execution-timeout', '120s')
  : ycJson('serverless', 'api-gateway', 'create', '--name', NAME, '--spec', specFile, '--execution-timeout', '120s', '--description', 'dnd-spells site');
const url = `https://${gw.domain}/`;

/* ---------- 7. data -> YDB (through the function) ---------- */
step('Загрузка данных в YDB');
{
  const payload = zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'data/build/spells.json')), { level: 9 }).toString('base64');
  let done = false;
  for (let attempt = 1; attempt <= 10 && !done; attempt++) {
    try {
      const res = await fetch(`${url}api/admin/import`, {
        method: 'POST',
        headers: { 'x-admin-token': process.env.ADMIN_TOKEN, 'content-type': 'text/plain' },
        body: payload,
        signal: AbortSignal.timeout(150_000),
      });
      const text = await res.text();
      if (res.ok) { console.log(`  ok: ${text}`); done = true; break; }
      console.log(`  попытка ${attempt}: HTTP ${res.status} ${text.slice(0, 200)}`);
      if (res.status === 403) break;
    } catch (e) {
      console.log(`  попытка ${attempt}: ${e.cause?.code || e.name}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!done) { console.error('Не удалось загрузить данные в базу. Запустите npm run deploy ещё раз.'); process.exit(1); }
}

/* ---------- 7. smoke test ---------- */
step('Проверка');
for (const [p, expect] of [['', 200], ['api/health', 200], ['api/spells', 401]]) {
  let status = 0;
  for (let i = 0; i < 10 && status !== expect; i++) {
    try { status = (await fetch(url + p, { signal: AbortSignal.timeout(20000) })).status; } catch { status = -1; }
    if (status !== expect) await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`  ${status === expect ? 'ok ' : 'ОШИБКА'} GET /${p} → ${status} (ожидалось ${expect})`);
}
console.log(`\nГотово: ${url}`);
writeEnvValues({ SITE_URL: url });
