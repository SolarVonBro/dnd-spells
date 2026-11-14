// Browser test of character spell lists: classes and slots, picking spells, storage, PDF export.
//   node tests/lists.mjs <url> [password] [screenshots-dir]
// Without a password the key is taken from .env.local (owner's machine only).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { readEnvFile } from '../scripts/lib/env.mjs';

const [url, password, shotsDir] = process.argv.slice(2);
if (!url) { console.error('usage: node tests/lists.mjs <url> [password|-] [shots-dir]'); process.exit(2); }
const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const browser = await puppeteer.launch({ executablePath: browsers.find((p) => fs.existsSync(p)), headless: true });
const problems = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg); };
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const shot = async (name) => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`) }); };
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-pdf-'));

const page = await browser.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 1366, height: 900 });
const cdp = await page.target().createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

if (!password || password === '-') {
  const key = readEnvFile().DATA_KEY;
  if (!key) { console.error('no password and no DATA_KEY in .env.local'); process.exit(2); }
  const b64 = Buffer.from(key, 'base64url').toString('base64');
  await page.evaluateOnNewDocument((k) => { if (!localStorage.getItem('dnd.key')) localStorage.setItem('dnd.key', k); }, b64);
  await page.goto(url, { waitUntil: 'networkidle0' });
} else {
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.type('#pw', password);
  await page.click('button[type=submit]');
}
await page.waitForSelector('.list .row', { timeout: 60000 });

const clickText = (sel, text) => page.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
  if (!el) throw new Error(`no ${s} with "${t}"`);
  el.click();
}, sel, text);
const setInput = (sel, index, value) => page.evaluate((s, i, v) => {
  const el = document.querySelectorAll(s)[i];
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, sel, index, value);
const slots = () => page.$$eval('.slots tbody td', (tds) => tds.map((t) => t.textContent));
const tick = () => new Promise((r) => setTimeout(r, 150));

// Book names are shown in English.
await page.evaluate(() => [...document.querySelectorAll('.fbtn')].find((b) => b.textContent.startsWith('Источник')).click());
await page.waitForSelector('.pop');
const chips = await page.$$eval('.pop .chip', (c) => c.map((x) => x.textContent));
check(chips.includes("Player's Handbook") && chips.includes("Xanathar's") && !chips.some((c) => /[а-я]/i.test(c) && c !== 'Laserllama'),
  `source chips in English (${chips.slice(0, 4).join(', ')}…)`);
await page.keyboard.press('Escape');

// Create a list: Wizard 5.
await page.click('.lists-btn');
await page.waitForSelector('.newlist input');
await page.type('.newlist input', 'Тест: Элара');
await page.click('.newlist button[type=submit]');
await page.waitForSelector('.name-input');
check((await page.$eval('.name-input', (e) => e.value)) === 'Тест: Элара', 'list created and opened');
await clickText('.classes-edit .btn', 'Выбрать класс');
await page.waitForSelector('.crow select');
check((await page.$eval('.crow select', (e) => e.value)) === 'Wizard', 'first class defaults to Wizard');
await setInput('.crow input[type=number]', 0, '5');
await tick();
check(JSON.stringify(await slots()) === '["4","3","2"]', `Wizard 5 slots 4/3/2 (${await slots()})`);
await setInput('.crow input[type=number]', 1, '3');
await tick();
const meters = await page.$$eval('.ccard .meter', (m) => m.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
check(meters.some((m) => m.includes('0 / 4') && m.includes('заговор')) && meters.some((m) => m.includes('из мин. 14')) && meters.some((m) => m.includes('8')),
  `Wizard 5 limits: cantrips 4, spellbook 14, prepared 5+3 (${meters.join(' | ')})`);

// Pick spells for the Wizard.
await clickText('.ccard .btn', 'Подобрать');
await page.waitForSelector('.pick-banner');
const levels = await page.$$eval('.list .row .lvl', (l) => [...new Set(l.map((x) => Number(x.textContent)))]);
check(levels.length > 0 && Math.max(...levels) <= 3, `picker shows Wizard spells up to level 3 (levels ${levels.join(',')})`);
await shot('l1-picker');
const btns = await page.$$('.list .pick-btn');
for (const b of btns.slice(0, 2)) await b.click();
const lvl1 = await page.$$('.list li.pickable');
for (const li of lvl1) {
  if ((await li.$eval('.lvl', (e) => e.textContent)) === '1') { await (await li.$('.pick-btn')).click(); break; }
}
await tick();
check((await page.$eval('.pick-banner', (e) => e.textContent)).includes('выбрано 3'), 'three spells picked');
await clickText('.pick-banner .btn', 'Готово');
await page.waitForSelector('.lspells .lrow');
check((await page.$$('.lspells .lrow')).length === 3, 'list shows the picked spells');

// Multiclass: + Cleric 2 -> caster level 7 -> 4/3/3/1.
await clickText('.classes-edit .btn', 'Добавить класс');
await tick();
check((await page.$$eval('.crow select:first-child', (s) => s.map((x) => x.value))).join() === 'Wizard,Cleric', 'second class is Cleric');
await setInput('.crow input[type=number]', 2, '2');
await tick();
check(JSON.stringify(await slots()) === '["4","3","3","1"]', `Wizard 5 / Cleric 2 slots 4/3/3/1 (${await slots()})`);
// + Warlock 3: Pact Magic is separate.
await clickText('.classes-edit .btn', 'Добавить класс');
await tick();
await page.evaluate(() => { const s = document.querySelectorAll('.crow')[2].querySelector('select'); s.value = 'Warlock'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await tick();
await page.evaluate(() => { const i = document.querySelectorAll('.crow')[2].querySelector('input[type=number]'); i.value = '3'; i.dispatchEvent(new Event('change', { bubbles: true })); });
await tick();
const pact = await page.$eval('.pact', (e) => e.textContent).catch(() => '');
check(JSON.stringify(await slots()) === '["4","3","3","1"]' && pact.includes('2 ячейки 2 уровня'), `Warlock 3 adds Pact Magic: ${pact}`);
await shot('l2-editor');

// Add from the spell card.
await page.evaluate(() => { location.hash = '#/fireball'; });
await page.waitForSelector('.addto .btn');
await page.click('.addto .btn');
await page.waitForSelector('.addto .menu-item input');
await page.click('.addto .menu-item input');
await tick();
check((await page.$eval('.addto .btn', (e) => e.textContent)).includes('В списках: 1'), 'Fireball added from the spell card');
await page.keyboard.press('Escape');

// Storage: survives reload; restored from IndexedDB if the localStorage copy is gone; survives logout.
await page.goto(`${url.replace(/#.*$/, '')}#/@lists`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.cards .card');
check((await page.$eval('.cards .card', (e) => e.textContent)).includes('4 заклинания'), 'list is kept after reload (4 spells)');
await page.evaluate(() => localStorage.removeItem('dnd.lists.v1'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.cards .card', { timeout: 10000 }).catch(() => {});
check(Boolean(await page.$('.cards .card')) && await page.evaluate(() => Boolean(localStorage.getItem('dnd.lists.v1'))), 'restored from IndexedDB copy');
await page.evaluate(() => { localStorage.removeItem('dnd.key'); });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.list .row, #pw', { timeout: 60000 });
if (await page.$('#pw')) {
  if (password && password !== '-') { await page.type('#pw', password); await page.click('button[type=submit]'); await page.waitForSelector('.list .row', { timeout: 60000 }); }
}
await page.evaluate(() => { location.hash = '#/@lists'; });
await page.waitForSelector('.cards .card', { timeout: 10000 }).catch(() => {});
check(Boolean(await page.$('.cards .card')), 'list is kept after logout and login');

// PDF export (both modes).
await page.click('.cards .card');
await page.waitForSelector('.name-input');
await clickText('.detail-head .btn', 'PDF');
await page.waitForSelector('.export');
const exportPdf = async (mode) => {
  const before = new Set(fs.readdirSync(downloads));
  await clickText('.export .seg button', mode);
  await clickText('.export .btn.primary', 'Скачать PDF');
  await page.waitForFunction(() => /Готово|Не удалось/.test(document.querySelector('.export [role=status]')?.textContent ?? ''), { timeout: 60000 });
  const msg = await page.$eval('.export [role=status]', (e) => e.textContent);
  let file = null;
  for (let i = 0; i < 50 && !file; i++) {
    file = fs.readdirSync(downloads).find((f) => !before.has(f) && f.endsWith('.pdf'));
    if (!file) await new Promise((r) => setTimeout(r, 200));
  }
  const buf = file ? fs.readFileSync(path.join(downloads, file)) : Buffer.alloc(0);
  check(buf.subarray(0, 5).toString() === '%PDF-' && buf.length < 250 * 1024, `PDF "${mode}": ${file} ${(buf.length / 1024).toFixed(0)} KB (${msg})`);
  return file && path.join(downloads, file);
};
const fullPdf = await exportPdf('С описаниями');
const shortPdf = await exportPdf('Таблица');
await shot('l3-export');

// Desktop: tiles layout (spells grouped by level, the card takes the rest of the screen).
await clickText('.topbar .seg button', 'Плитки');
await page.waitForSelector('.tiles .tile');
const tileCount = await page.$$eval('.tiles .tile', (t) => t.length);
const listed = Number((await page.$eval('.list-status span', (e) => e.textContent)).match(/\d+/)[0]);
const heads = await page.$$eval('.tgroup-head span:first-child', (h) => h.map((x) => x.textContent));
check(tileCount === listed && heads[0] === 'Заговоры' && heads.includes('9 уровень'), `tiles: ${tileCount} tiles in ${heads.length} level groups`);
await page.click('.tiles .tile');
await page.waitForSelector('.detail h2');
const [colA, colB] = await page.evaluate(() => ['.listcol', '.detailcol'].map((s) => document.querySelector(s).getBoundingClientRect().width));
check(colA / (colA + colB) > 0.6 && colA / (colA + colB) < 0.72, `tiles take about 2/3 of the width (${Math.round(colA)} / ${Math.round(colB)} px)`);
await shot('l3b-tiles');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.tiles .tile', { timeout: 60000 });
check(true, 'tiles layout is remembered after reload');
await clickText('.topbar .seg button', 'Список');
await page.waitForSelector('.list .row');

// Phone layout: lists page is a full-screen layer; picking shows the spell list.
// (switching to a mobile viewport reloads the page)
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(`${url.replace(/#.*$/, '')}#/@lists`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.cards .card', { timeout: 60000 });
await shot('l4-phone-lists');
await page.click('.cards .card');
await page.waitForSelector('.ccard .btn');
await shot('l5-phone-editor');
await clickText('.ccard .btn', 'Подобрать');
await page.waitForSelector('.pick-banner');
check(await page.$eval('.listcol', (e) => e.getBoundingClientRect().width > 300), 'phone: picker shows the spell list');
await shot('l6-phone-picker');

await browser.close();
if (shotsDir && fullPdf) fs.copyFileSync(fullPdf, path.join(shotsDir, 'full.pdf'));
if (shotsDir && shortPdf) fs.copyFileSync(shortPdf, path.join(shotsDir, 'short.pdf'));
fs.rmSync(downloads, { recursive: true, force: true });
if (problems.length) { console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('\nall checks passed');
