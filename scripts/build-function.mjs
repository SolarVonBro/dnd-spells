// Bundles the API (api/src/index.mjs) into build/function.zip for Yandex Cloud Functions (runtime nodejs22).
// ydb-sdk stays external: Yandex installs it from package.json while building the function version.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { writeZip } from './lib/zip.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'build');
fs.mkdirSync(OUT, { recursive: true });

const ydbVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/ydb-sdk/package.json'), 'utf8')).version;
const result = await build({
  entryPoints: [path.join(ROOT, 'api/src/index.mjs')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['ydb-sdk'],
  write: false,
  legalComments: 'none',
});
const code = result.outputFiles[0].text;
const pkg = { name: 'dnd-spells-api', private: true, main: 'index.js', dependencies: { 'ydb-sdk': ydbVersion } };
writeZip(path.join(OUT, 'function.zip'), [
  { name: 'index.js', data: code },
  { name: 'package.json', data: JSON.stringify(pkg, null, 2) },
]);
console.log(`build/function.zip: index.js ${(code.length / 1024).toFixed(1)} KB, ydb-sdk ${ydbVersion}`);
