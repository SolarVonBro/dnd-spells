// Downloads raw spell sources into data/vendor (idempotent, cached).
//   5etools (English book text + metadata): data/vendor/5etools
//   ttg.club 5e14 (Russian translations):   data/vendor/ttg
// Usage: node scripts/fetch-sources.mjs [--refresh]
import fs from 'node:fs/promises';
import path from 'node:path';
import { OFFICIAL_SOURCES } from './lib/sources.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const V5 = path.join(ROOT, 'data/vendor/5etools');
const VTTG = path.join(ROOT, 'data/vendor/ttg');
const REFRESH = process.argv.includes('--refresh');

const RAW_5ET = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data';
const TTG = 'https://5e14.ttg.club';
// ttg.club source codes we take Russian text from (official 2014 books + Laserllama for reference).
// SCAG cantrips are reprinted in TCE; EGtW is ttg's code for EGW.
const TTG_SOURCES = new Set(['PHB', 'XGE', 'TCE', 'SCAG', 'EGtW', 'AI', 'FTD', 'SCC', 'BMT', 'LLK',
  'IDRotF', 'AAG', 'SatO', 'GGR', 'LH']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => fs.access(p).then(() => true, () => false);

async function request(url, { method = 'GET', body, tries = 8 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (dnd-spells fetcher)' },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** Math.min(i, 4));
    }
  }
  throw lastErr;
}

async function saveJson(file, text) {
  JSON.parse(text); // validate before writing
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

async function fetch5etools() {
  const files = [
    ...Object.values(OFFICIAL_SOURCES).map((s) => [`spells/${s.file}`, s.file]),
    ['generated/gendata-spell-source-lookup.json', 'gendata-spell-source-lookup.json'],
  ];
  for (const [remote, local] of files) {
    const file = path.join(V5, local);
    if (!REFRESH && (await exists(file))) continue;
    await saveJson(file, await request(`${RAW_5ET}/${remote}`));
    console.log('5etools', local);
  }
}

async function fetchTtg() {
  const listFile = path.join(VTTG, 'list.json');
  if (REFRESH || !(await exists(listFile))) {
    const body = { page: 0, size: 5000, search: { value: '', exact: false }, order: [{ field: 'name', direction: 'asc' }] };
    await saveJson(listFile, await request(`${TTG}/api/v1/spells`, { method: 'POST', body }));
  }
  const list = JSON.parse(await fs.readFile(listFile, 'utf8'));
  const todo = [];
  for (const s of list) {
    if (!TTG_SOURCES.has(s.source.shortName)) continue;
    const slug = s.url.replace(/^\/spells\//, '');
    const file = path.join(VTTG, 'spells', `${slug}.json`);
    if (!REFRESH && (await exists(file))) continue;
    todo.push({ slug, file });
  }
  console.log(`ttg: ${todo.length} spell cards to download`);
  let done = 0;
  const failed = [];
  const worker = async () => {
    while (todo.length) {
      const { slug, file } = todo.shift();
      try {
        await saveJson(file, await request(`${TTG}/api/v1/spells/${encodeURIComponent(slug)}`, { method: 'POST' }));
      } catch (e) {
        failed.push(slug);
        console.error('FAIL', slug, e.message);
      }
      if (++done % 50 === 0) console.log(`ttg: ${done} done`);
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (failed.length) {
    console.error(`ttg: ${failed.length} failed, re-run to retry: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

await fetch5etools();
await fetchTtg();
console.log('sources ok');
