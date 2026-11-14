// Browser test of character sheets: import of a Foundry VTT actor, computed values, settings, storage, PDF.
//   node tests/chars.mjs <url> <actor.json> [password|-] [out-dir]
// The actor file is not in the repository (characters/ is git-ignored). Without a password the key is taken
// from .env.local (owner's machine only). With out-dir, screenshots and the PDF are saved there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { readEnvFile } from '../scripts/lib/env.mjs';

const [url, actorFile, password, outDir] = process.argv.slice(2);
if (!url || !actorFile) { console.error('usage: node tests/chars.mjs <url> <actor.json> [password|-] [out-dir]'); process.exit(2); }
const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const browser = await puppeteer.launch({ executablePath: browsers.find((p) => fs.existsSync(p)), headless: true });
const problems = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg); };
if (outDir) fs.mkdirSync(outDir, { recursive: true });
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-sheet-'));
const actor = JSON.parse(fs.readFileSync(actorFile, 'utf8'));

const page = await browser.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 1366, height: 900 });
const shot = async (name) => { if (outDir) await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false }); };
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
const text = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

// Wrong files are rejected with a message.
await page.click('.chars-btn');
await page.waitForSelector('.dropzone input[type=file]');
const bad = path.join(downloads, 'not-a-character.json');
fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
await (await page.$('.dropzone input[type=file]')).uploadFile(bad);
await page.waitForSelector('[role=status]');
check((await page.$eval('[role=status]', (e) => e.textContent)).includes('не персонаж'), 'a random JSON file is rejected');

// Import the actor.
await (await page.$('.dropzone input[type=file]')).uploadFile(path.resolve(actorFile));
await page.waitForSelector('.char .stat-row', { timeout: 10000 });
check((await page.$eval('.name-input', (e) => e.value)) === actor.name, `imported and opened: ${actor.name}`);
await shot('c1-character');
const stats = await text('.stat');
console.log('     stats:', stats.join(' | '));
const abil = await text('.abil');
console.log('     abilities:', abil.join(' | '));
const attacks = await page.$$eval('.ctable:not(.inv) tbody tr', (rows) => rows.map((r) => [...r.cells].map((c) => c.textContent.trim()).join(' ')));
console.log('     attacks:', attacks.join(' | '));
const warnings = await text('.warnings li');
for (const w of warnings) console.log('     warning:', w);

// Checks for the test character (Diarmad: Alternate Druid 3, Decay; leather armor; WIS 16, CON 14, DEX 14).
if (/diarmad/i.test(actorFile)) {
  check(stats[0].startsWith('13') && /кож/i.test(stats[0]), `AC 13 with leather armor (${stats[0]})`);
  check(stats[3].startsWith('24'), `max HP 24 = 8 + 5 + 5 + 3×2 (${stats[3]})`);
  check(abil.some((a) => a.startsWith('Мудрость+316') && a.includes('спасбр. +5')), 'WIS 16: +3, save +5 (proficient)');
  check(attacks.some((a) => /Кинжал \+4 1к4 \+ 2 колющий/.test(a)), 'dagger +4, 1к4 + 2 piercing');
  check(attacks.some((a) => /Скимитар \+2 .*нет владения/.test(a)), 'scimitar without proficiency: +2');
  check(attacks.some((a) => /(Оружие дыхания|Breath Weapon) Сл 12 ЛОВ 1к10 огонь/.test(a)), 'breath weapon DC 12 DEX, 1к10 fire');
  check((await text('.caster'))[0]?.includes('Сл 13') && (await text('.caster'))[0]?.includes('подготовить 6'), 'spellcasting: DC 13, prepare 6');
  check(JSON.stringify(await text('.slots tbody td')) === '["4","2"]', 'spell slots 4 / 2');
  const always = await page.$$eval('.cspells .lrow', (rows) => rows.filter((r) => r.querySelector('label.always input')?.checked).map((r) => r.querySelector('.row-name').firstChild.textContent));
  check(always.length === 2 && always.includes('Нанесение ран') && always.includes('Нетленные останки'), `only circle spells are always prepared (${always.join(', ')})`);
  const spellNames = await page.$$eval('.cspells .row-name', (els) => els.map((e) => e.firstChild.textContent));
  check(spellNames.includes('Леденящее прикосновение') && spellNames.includes('Аура мороза') && spellNames.length === 11, `11 spells with site names (${spellNames.length})`);
}

// Skill correction: Nature proficiency (Druidic Initiate) — click the marker of «Природа».
const natBefore = await page.$$eval('.skills li', (li) => li.find((x) => x.textContent.includes('Природа')).textContent);
await page.evaluate(() => [...document.querySelectorAll('.skills li')].find((x) => x.textContent.includes('Природа')).querySelector('.pdot').click());
await page.waitForFunction(() => [...document.querySelectorAll('.skills li')].find((x) => x.textContent.includes('Природа')).classList.contains('changed'));
const natAfter = await page.$$eval('.skills li', (li) => li.find((x) => x.textContent.includes('Природа')).textContent);
check(natBefore !== natAfter, `skill proficiency can be corrected (${natBefore.trim()} → ${natAfter.trim()})`);
// …and its ability: Druidic Initiate rolls Nature with Wisdom (INT -> WIS is one click).
await page.evaluate(() => [...document.querySelectorAll('.skills li')].find((x) => x.textContent.includes('Природа')).querySelector('.ab-btn').click());
await page.waitForFunction(() => /МДР/.test([...document.querySelectorAll('.skills li')].find((x) => x.textContent.includes('Природа')).textContent));
const natWis = await page.$$eval('.skills li', (li) => li.find((x) => x.textContent.includes('Природа')).querySelector('b').textContent);
if (/diarmad/i.test(actorFile)) check(natWis === '+5', `Nature with proficiency and WIS: +5 (${natWis})`);

// Notes field is saved.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('.notes-form label')].find((l) => l.textContent.startsWith('Игрок')).querySelector('input');
  el.value = 'Тестовый игрок';
  el.dispatchEvent(new Event('change', { bubbles: true }));
});

// Storage: survives a reload.
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.char .stat-row', { timeout: 60000 });
const player = await page.evaluate(() => [...document.querySelectorAll('.notes-form label')].find((l) => l.textContent.startsWith('Игрок')).querySelector('input').value);
check(player === 'Тестовый игрок', 'notes are kept after reload');
check((await page.$$eval('.skills li.changed', (x) => x.length)) === 1 && (await page.$$eval('.skills li.changed', (x) => x[0].textContent)).includes('МДР'), 'skill correction is kept after reload');

// PDF.
const pdf = async (label) => {
  for (const f of fs.readdirSync(downloads)) if (f.endsWith('.pdf')) fs.renameSync(path.join(downloads, f), path.join(downloads, `${Date.now()}-${f}.old`));
  const before = new Set(fs.readdirSync(downloads));
  await page.evaluate(() => { const s = document.querySelector('.print [role=status]'); if (s) s.textContent = ''; });
  await clickText('.print .btn.primary', 'Скачать PDF');
  await page.waitForFunction(() => /Готово|Не удалось/.test(document.querySelector('.print [role=status]')?.textContent ?? ''), { timeout: 60000 });
  const msg = await page.$eval('.print [role=status]', (e) => e.textContent);
  let file = null;
  for (let i = 0; i < 50 && !file; i++) {
    file = fs.readdirSync(downloads).find((f) => !before.has(f) && f.endsWith('.pdf'));
    if (!file) await new Promise((r) => setTimeout(r, 200));
  }
  const buf = file ? fs.readFileSync(path.join(downloads, file)) : Buffer.alloc(0);
  check(buf.subarray(0, 5).toString() === '%PDF-' && buf.length < 400 * 1024, `PDF ${label}: ${(buf.length / 1024).toFixed(0)} KB (${msg})`);
  return { file: file && path.join(downloads, file), pages: Number(msg.match(/(\d+) стр/)?.[1] ?? 0) };
};
const a = await pdf('default');
await page.evaluate(() => [...document.querySelectorAll('.count')].find((x) => x.textContent.includes('для заметок')).querySelectorAll('button')[1].click());
await new Promise((r) => setTimeout(r, 200));
const b = await pdf('one more notes page');
check(b.pages === a.pages + 1, `"pages for notes" adds a page (${a.pages} → ${b.pages})`);
if (outDir && a.file) fs.copyFileSync(a.file, path.join(outDir, 'sheet.pdf'));
// Large font, feature names only.
await clickText('.print .seg button', 'Крупный');
await clickText('.print .seg button', 'Только названия');
await new Promise((r) => setTimeout(r, 200));
const c = await pdf('large font, feature names only');
if (outDir && c.file) fs.copyFileSync(c.file, path.join(outDir, 'sheet-large.pdf'));
await clickText('.print .seg button', 'Обычный');
await clickText('.print .seg button', 'С описаниями');

// The list of characters shows the card; re-import keeps the notes.
await page.click('.chars-btn');
await page.waitForSelector('.cards .card');
check((await text('.cards .card'))[0].includes(actor.name), 'character card in the list');
await page.click('.cards .card');
await page.waitForSelector('.char .stat-row');
await (await page.$('.char .danger input[type=file]')).uploadFile(path.resolve(actorFile));
await page.waitForFunction(() => /обновлены/.test(document.querySelector('.char [role=status]')?.textContent ?? ''), { timeout: 10000 });
const player2 = await page.evaluate(() => [...document.querySelectorAll('.notes-form label')].find((l) => l.textContent.startsWith('Игрок')).querySelector('input').value);
check(player2 === 'Тестовый игрок', 're-import from a new file keeps notes');

// Texts from a file are untrusted: scripts and event handlers must not get into the page, even deeply nested.
const evil = structuredClone(actor);
evil.name = 'XSS <img src=x onerror="window.__xss=1">';
const feat = evil.items.find((i) => i.type === 'feat');
feat.name = '<b onmouseover="window.__xss=2">Умение</b>';
feat.system.description.value = '<x1><x2><x3><x4><x5><x6><img src=x onerror="window.__xss=3"></x6></x5></x4></x3></x2></x1>'
  + '<script>window.__xss=4</script><p onclick="window.__xss=5">текст</p><a href="javascript:window.__xss=6">ссылка</a>';
const evilFile = path.join(downloads, 'evil-actor.json');
fs.writeFileSync(evilFile, JSON.stringify(evil));
await page.click('.chars-btn');
await page.waitForSelector('.dropzone input[type=file]');
await (await page.$('.dropzone input[type=file]')).uploadFile(evilFile);
await page.waitForSelector('.char .stat-row', { timeout: 10000 });
await page.$$eval('details.feat', (ds) => ds.forEach((d) => { d.open = true; }));
await new Promise((r) => setTimeout(r, 300));
const xss = await page.evaluate(() => ({
  flag: window.__xss ?? null,
  bad: document.querySelectorAll('.char img, .char script, .char [onclick], .char [onerror], .char [onmouseover], .char a[href^="javascript"]').length,
}));
check(xss.flag === null && xss.bad === 0, `uploaded HTML is sanitized (flag ${xss.flag}, bad nodes ${xss.bad})`);
await clickText('.char .danger .btn', 'Удалить лист');
await page.waitForSelector('.cards .card');
await page.click('.cards .card');
await page.waitForSelector('.char .stat-row');

// Phone layout.
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.char .stat-row', { timeout: 60000 });
check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('.detailcol').scrollWidth <= document.querySelector('.detailcol').clientWidth + 1), 'phone: no horizontal scroll');
await shot('c2-phone');

await browser.close();
fs.rmSync(downloads, { recursive: true, force: true });
if (problems.length) { console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('\nall checks passed');
