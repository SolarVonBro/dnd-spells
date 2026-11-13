// Browser smoke test of the built site (local preview or the published URL).
//   node tests/smoke.mjs <url> <password> [screenshots-dir]
// Uses the locally installed Chrome/Edge via puppeteer-core.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const [url, password, shotsDir] = process.argv.slice(2);
if (!url || !password) { console.error('usage: node tests/smoke.mjs <url> <password> [shots-dir]'); process.exit(2); }
const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const executablePath = browsers.find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath, headless: true });
const problems = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg); };
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const shot = async (page, name) => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`) }); };

const page = await browser.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.setViewport({ width: 1366, height: 860 });
await page.goto(url, { waitUntil: 'networkidle0' });
check(Boolean(await page.$('#pw')), 'password form is shown first');
await shot(page, '1-login');

await page.type('#pw', 'wrong-password');
await page.click('button[type=submit]');
await page.waitForSelector('.err', { timeout: 30000 });
check(true, 'wrong password is rejected');

await page.$eval('#pw', (el) => { el.value = ''; });
await page.type('#pw', password);
const t = Date.now();
await page.click('button[type=submit]');
await page.waitForSelector('.list .row', { timeout: 60000 });
const count = await page.$eval('.list-status span', (e) => e.textContent);
check(/\d+/.test(count), `login works (${count}, ${((Date.now() - t) / 1000).toFixed(1)} s)`);
await shot(page, '2-list');

await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.list .row', { timeout: 30000 }).catch(() => {});
check(!(await page.$('#pw')) && Boolean(await page.$('.list .row')), 'password is remembered after reload');

// Header filters: official Druid vs Laserllama Druid are separate class lists.
const openFilter = async (label) => {
  await page.evaluate((l) => [...document.querySelectorAll('.fbtn')].find((b) => b.querySelector('.fbtn-label').textContent.replace(/:$/, '') === l).click(), label);
  await page.waitForSelector('.pop');
};
const pick = (section, text) => page.evaluate((sec, t) => {
  const s = [...document.querySelectorAll('.pop .psec')].find((x) => !sec || x.querySelector('h4')?.textContent === sec);
  [...s.querySelectorAll('.chip')].find((c) => c.textContent.trim() === t).click();
}, section, text);
const closePop = () => page.keyboard.press('Escape');
const resultCount = async () => Number((await page.$eval('.list-status span', (e) => e.textContent)).match(/\d+/)[0]);
await openFilter('Класс'); await pick('D&D 5e', 'Друид'); await closePop();
await openFilter('Уровень'); await pick(null, 'Заговор'); await shot(page, '2b-level-popover'); await closePop();
const officialDruid = await resultCount();
await openFilter('Класс'); await pick('D&D 5e', 'Друид'); await pick('Laserllama', 'Друид ✓'); await shot(page, '2c-class-popover'); await closePop();
const llDruid = await resultCount();
// Laserllama's Alternate Druid document lists 17 cantrips (8 from the compendium + 9 official ones).
check(officialDruid === 18 && llDruid === 17, `class lists are separate: official Druid cantrips ${officialDruid} (expect 18), Laserllama Druid ${llDruid} (expect 17)`);
await page.evaluate(() => [...document.querySelectorAll('.filterbar .reset')][0]?.click());

await page.evaluate(() => { location.hash = '#/fireball'; });
await page.waitForSelector('.detail h2');
check((await page.$eval('.detail h2', (e) => e.textContent)) === 'Fireball', 'spell card opens');
await page.evaluate(() => { location.hash = '#/acid-splash/compare'; });
await page.waitForSelector('.compare mark');
check(true, 'compare view with highlighted changes');
await shot(page, '3-compare');

await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('\nall checks passed');
