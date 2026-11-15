// Browser test of the Google Drive synchronization between two devices (two separate browser profiles).
// Google is not contacted: the sign-in script is replaced with a stub that hands out a token, and the Drive REST API
// is served from memory here (request interception). Checks: sign-in, upload, download on another device, automatic
// sending of changes, deletions, the site password stays local, sign-out, a refused account.
//   node tests/sync.mjs <url> [password|-]
// Without a password the key is taken from .env.local (owner's machine only).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { readEnvFile } from '../scripts/lib/env.mjs';

const [url, password] = process.argv.slice(2);
if (!url) { console.error('usage: node tests/sync.mjs <url> [password|-]'); process.exit(2); }
const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const browser = await puppeteer.launch({ executablePath: browsers.find((p) => fs.existsSync(p)), headless: true });
const problems = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg); };
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const key = !password || password === '-' ? readEnvFile().DATA_KEY : null;
const keyB64 = key ? Buffer.from(key, 'base64url').toString('base64') : null;

/* ---- fake Google ---- */
const GIS_STUB = `window.google = { accounts: { oauth2: {
  initTokenClient(c) { return { requestAccessToken() { setTimeout(() => window.__gsiDeny ? c.callback({ error: 'access_denied' }) : c.callback({ access_token: 'fake-token', expires_in: 3600 }), 30); } }; },
  revoke(t, d) { window.__revoked = t; if (d) d(); },
} } };`;
const files = new Map(); // id -> { name, content }
let seq = 0;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
const json = (req, status, body) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
function fakeGoogle(req) {
  const u = new URL(req.url());
  if (u.host === 'accounts.google.com' && u.pathname === '/gsi/client') return req.respond({ status: 200, contentType: 'text/javascript', body: GIS_STUB });
  if (u.host !== 'www.googleapis.com') return req.continue();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
  if (req.headers().authorization !== 'Bearer fake-token') return json(req, 401, { error: 'unauthorized' });
  const id = u.pathname.match(/\/files\/([^/]+)$/)?.[1];
  if (u.pathname === '/drive/v3/about') return json(req, 200, { user: { emailAddress: 'tester@example.com' } });
  if (u.pathname === '/drive/v3/files' && req.method() === 'GET') {
    if (u.searchParams.get('spaces') !== 'appDataFolder') return json(req, 400, { error: 'only appDataFolder' });
    return json(req, 200, { files: [...files].map(([fid, f]) => ({ id: fid, name: f.name, modifiedTime: new Date().toISOString() })) });
  }
  if (id && u.pathname.startsWith('/drive/v3/files/') && req.method() === 'GET') {
    const f = files.get(decodeURIComponent(id));
    return f ? req.respond({ status: 200, headers: cors, contentType: 'application/json', body: f.content }) : json(req, 404, {});
  }
  if (id && req.method() === 'DELETE') { files.delete(decodeURIComponent(id)); return req.respond({ status: 204, headers: cors, body: '' }); }
  if (id && req.method() === 'PATCH') { files.get(decodeURIComponent(id)).content = req.postData(); return json(req, 200, { id }); }
  if (u.pathname === '/upload/drive/v3/files' && req.method() === 'POST') {
    const boundary = req.headers()['content-type'].match(/boundary=(\S+)/)[1];
    const parts = req.postData().split(`--${boundary}`).slice(1, -1).map((p) => p.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
    const meta = JSON.parse(parts[0]);
    if (!(meta.parents ?? []).includes('appDataFolder')) return json(req, 400, { error: 'not in appDataFolder' });
    const fid = `f${++seq}`;
    files.set(fid, { name: meta.name, content: parts[1] });
    return json(req, 200, { id: fid });
  }
  return json(req, 400, { error: `unexpected ${req.method()} ${u.pathname}` });
}

async function device(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.setViewport({ width: 1366, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', fakeGoogle);
  if (keyB64) {
    await page.evaluateOnNewDocument((k) => { if (!localStorage.getItem('dnd.key')) localStorage.setItem('dnd.key', k); }, keyB64);
    await page.goto(url, { waitUntil: 'networkidle0' });
  } else {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.type('#pw', password);
    await page.click('button[type=submit]');
  }
  await page.waitForSelector('.list .row', { timeout: 60000 });
  return page;
}
const clickText = (page, sel, text) => page.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
  if (!el) throw new Error(`no ${s} with "${t}"`);
  el.click();
}, sel, text);
const status = (page) => page.$eval('.sync-btn', (b) => [...b.classList].find((c) => c.startsWith('s-'))?.slice(2));
const waitStatus = (page, s, timeout = 15000) => page.waitForFunction((x) => document.querySelector(`.sync-btn.s-${x}`), { timeout }, s);
const openMenu = async (page) => { if (!(await page.$('.sync-menu'))) await page.click('.sync-btn'); await page.waitForSelector('.sync-menu'); await tick(300); };
const drive = () => [...files.values()].map((f) => f.content).join('\n');
const waitDrive = async (text, timeout = 15000) => {
  for (let t = 0; t < timeout; t += 200) { if (drive().includes(text)) return true; await tick(200); }
  return false;
};
const signIn = async (page) => {
  await openMenu(page);
  await clickText(page, '.sync-menu .btn', 'Войти');
  await waitStatus(page, 'ok');
};

// Device A: a list, then sign-in uploads it.
const A = await device('A');
check(await status(A) === 'off', 'sync is off at first');
await A.click('.nav-lists');
await A.waitForSelector('.newlist input');
await A.type('.newlist input', 'Синхр: список А');
await A.click('.newlist button[type=submit]');
await A.waitForSelector('.name-input');
await signIn(A);
check(files.size === 1 && drive().includes('Синхр: список А'), 'A: signed in, the list is in the app data file on the Drive');
check(!keyB64 || !drive().includes(keyB64), 'the site key is not uploaded');
check((await A.$eval('.sync-menu', (m) => m.textContent)).includes('tester@example.com'), 'the account is shown');

// Device B gets it.
const B = await device('B');
await signIn(B);
await B.click('.nav-lists');
await B.waitForSelector('.cards .card', { timeout: 10000 }).catch(() => {});
check((await B.$$eval('.cards .card', (c) => c.map((x) => x.textContent))).some((t) => t.includes('Синхр: список А')), 'B: the list from A arrived');

// B creates a character: sent automatically a few seconds later; A picks it up.
await B.click('.nav-chars');
await B.waitForSelector('.newchar input');
await B.type('.newchar input', 'Синхр: персонаж Б');
await B.click('.newchar button[type=submit]');
await B.waitForSelector('.name-input');
check(await waitDrive('Синхр: персонаж Б'), 'B: a new character is sent to the Drive by itself');
await openMenu(A);
await clickText(A, '.sync-menu .btn', 'Синхронизировать сейчас');
await waitStatus(A, 'ok');
await A.click('.nav-chars');
await A.waitForSelector('.cards .card', { timeout: 10000 }).catch(() => {});
check((await A.$$eval('.cards .card', (c) => c.map((x) => x.textContent))).some((t) => t.includes('Синхр: персонаж Б')), 'A: the character from B arrived');

// A deletes the list: the deletion reaches B (it does not come back).
await A.click('.nav-lists');
await A.waitForSelector('.cards .card');
await A.click('.cards .card');
await A.waitForSelector('.name-input');
await clickText(A, '.danger .btn', 'Удалить список');
await A.waitForSelector('.newlist input');
await tick(4500);
await openMenu(B);
await clickText(B, '.sync-menu .btn', 'Синхронизировать сейчас');
await waitStatus(B, 'ok');
await B.click('.nav-lists');
await B.waitForSelector('.newlist input');
await tick(300);
check(!(await B.$$eval('.cards .card', (c) => c.map((x) => x.textContent))).some((t) => t.includes('Синхр: список А')), 'B: the list deleted on A is gone');
check(!drive().includes('"name":"Синхр: список А"'), 'the deleted list is not in the Drive file (only its deletion mark)');

// After a reload the token is gone (kept only in memory): the button asks to sign in, nothing is lost.
await A.reload({ waitUntil: 'networkidle0' });
await A.waitForSelector('.sync-btn');
check(await status(A) === 'login' && Boolean(await A.$('.sync-dot')), 'A after reload: asks to sign in again (token only in memory)');
await signIn(A);
check(await status(A) === 'ok', 'A: one click and it syncs again');

// Sign-out on B: off, data stay.
await openMenu(B);
await clickText(B, '.sync-menu .link', 'отключить здесь');
await tick();
check(await status(B) === 'off' && await B.evaluate(() => window.__revoked === 'fake-token'), 'B: signed out, access revoked');
await B.click('.nav-chars');
await B.waitForSelector('.cards .card');
check((await B.$$eval('.cards .card', (c) => c.length)) === 1, 'B: data stay after signing out');

// An account that is not allowed.
const C = await device('C');
await C.evaluate(() => { window.__gsiDeny = true; });
await openMenu(C);
await clickText(C, '.sync-menu .btn', 'Войти');
await C.waitForSelector('.sync-menu [role=alert]', { timeout: 10000 });
check((await C.$eval('.sync-menu [role=alert]', (e) => e.textContent)).includes('нет в списке разрешённых') && await status(C) === 'off', 'a refused account gets a clear message');

await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('\nall checks passed');
