// Browser test of a character created on the site (no Foundry file): class and level, proficiency bonus, hit points,
// ability scores from a calculator set, spells from a list and from search, typed-in race/weapons/features/items,
// a portrait, the PDF.
//   node tests/manual.mjs <url> [password|-] [out-dir]
// Without a password the key is taken from .env.local (owner's machine only).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { readEnvFile } from '../scripts/lib/env.mjs';

const [url, password, outDir] = process.argv.slice(2);
if (!url) { console.error('usage: node tests/manual.mjs <url> [password|-] [out-dir]'); process.exit(2); }
const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const browser = await puppeteer.launch({ executablePath: browsers.find((p) => fs.existsSync(p)), headless: true });
const problems = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg); };
if (outDir) fs.mkdirSync(outDir, { recursive: true });
const shot = async (name) => { if (outDir) await page.screenshot({ path: path.join(outDir, `${name}.png`) }); };
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-manual-'));

const page = await browser.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 1366, height: 900 });
const cdp = await page.target().createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

// A set of the calculator (with Sanity) and a spell list, as if made before.
const now = Date.now();
const statSets = { v: 1, deleted: {}, sets: [{ id: 'set1', created: now, updated: now, data: {
  character: 'Тест: Элара', name: 'Броски', method: 'manual', san: true, hon: false,
  manual: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10, san: 11, hon: 10 },
} }] };
const lists = { v: 1, deleted: {}, books: [{ id: 'b1', name: 'Список Элары', classes: [{ cls: 'Wizard', level: 5, sub: null, mod: 3 }],
  spells: [{ id: 'fireball', v: 'o', by: 'Wizard' }], created: now, updated: now }] };
await page.evaluateOnNewDocument((s, l) => {
  if (!localStorage.getItem('dnd.stats.v1')) localStorage.setItem('dnd.stats.v1', s);
  if (!localStorage.getItem('dnd.lists.v1')) localStorage.setItem('dnd.lists.v1', l);
}, JSON.stringify(statSets), JSON.stringify(lists));
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

const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const clickText = (sel, text) => page.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
  if (!el) throw new Error(`no ${s} with "${t}"`);
  el.click();
}, sel, text);
const setVal = (sel, value, index = 0) => page.evaluate((s, v, i) => {
  const el = document.querySelectorAll(s)[i];
  if (!el) throw new Error(`no ${s}[${i}]`);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, sel, value, index);
const setField = (label, value) => page.evaluate((l, v) => {
  const el = [...document.querySelectorAll('.mfield')].find((f) => f.querySelector('span')?.textContent === l)?.querySelector('input, select');
  if (!el) throw new Error(`no field ${l}`);
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, label, value);
const stat = (k) => page.evaluate((key) => [...document.querySelectorAll('.stat')].find((s) => s.querySelector('.stat-k').textContent === key)?.querySelector('.stat-v').textContent, k);
const text = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

// Create.
await page.click('.nav-chars');
await page.waitForSelector('.newchar input');
await page.type('.newchar input', 'Тест: Элара');
await page.click('.newchar button[type=submit]');
await page.waitForSelector('.name-input');
check((await page.$eval('.name-input', (e) => e.value)) === 'Тест: Элара' && (await text('.warnings li')).some((w) => w.includes('Класс не выбран')),
  'created without a file; asks for a class');
check(!(await page.$('.dropzone')) && (await text('.todo')).join().includes('раса'), 'no Foundry import on the page; the to-do list before PDF');

// Class: Wizard 5 -> proficiency +3, hit points 6 + 4 × 4.
await clickText('.classes-edit .btn', 'Выбрать класс');
await tick();
await setVal('.crow input[type=number]', '5');
await tick();
check(await stat('Бонус мастерства') === '+3' && await stat('Хиты') === '22', `Wizard 5: proficiency +3, hit points 22 (${await stat('Бонус мастерства')}, ${await stat('Хиты')})`);

// Ability scores from the calculator's set.
await setVal('.statset-pick select', 'set1');
await clickText('.statset-pick .btn', 'Взять значения');
await tick();
const abil = await page.$$eval('.abil-in', (as) => as.map((a) => ({ n: a.querySelector('span').textContent, score: a.querySelector('input').value, save: a.querySelector('.save-tg').textContent, prof: a.querySelector('.save-tg').classList.contains('on') })));
const int = abil.find((a) => a.n === 'Интеллект');
check(abil.map((a) => a.score).join(' ') === '8 14 13 15 12 10' && int.prof && int.save.includes('+5'), `scores from the set, INT save +5 (${abil.map((a) => a.score).join(' ')}, ${int.save})`);
check(await stat('Хиты') === '27' && await stat('КД') === '12', `CON 13: 27 hit points; AC 10 + DEX (${await stat('Хиты')}, ${await stat('КД')})`);
check((await text('.abil-edit .hint')).join().includes('Здравомыслие 11'), 'Sanity from the set');

// Spells: from a list and by search.
await setVal('.spell-add .statset-pick select', 'b1');
await clickText('.spell-add .btn', 'Добавить из списка');
await tick();
await page.type('.spell-search input', 'magic missile');
await page.waitForSelector('.found-row');
await page.click('.found-row');
await tick();
const spells = await text('.cspells .lrow .row-name');
const caster = (await text('.caster')).join();
check(spells.length === 2 && spells.some((s) => s.includes('Огненный шар')) && caster.includes('Сл 13') && caster.includes('атака +5'),
  `spells added; Wizard: DC 13, attack +5 (${spells.join(', ')}; ${caster})`);
check(JSON.stringify(await page.$$eval('.slots tbody td', (t) => t.map((x) => x.textContent))) === '["4","3","2"]', 'Wizard 5 slots 4/3/2');

// Subclasses: all of the 2014 books (not only casters), Laserllama's from class documents, typed-in ones.
const rowSet = (row, sel, value) => page.evaluate((r, s, v) => {
  const el = document.querySelectorAll('.crow')[r].querySelector(s);
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, row, sel, value);
const subs = (row) => page.evaluate((r) => [...document.querySelectorAll('.crow')[r].querySelectorAll('select[aria-label="Подкласс"] option')].map((o) => o.textContent), row);
check((await subs(0)).some((x) => x.startsWith('Школа Воплощения — School of Evocation')) && (await subs(0)).length >= 15, `Wizard: all schools (${(await subs(0)).length} options)`);
await rowSet(0, 'select[aria-label="Подкласс"]', 'custom');
await tick();
await rowSet(0, 'input[aria-label="Название своего подкласса"]', 'Школа Теста');
await tick();
check((await page.$eval('.char .subtitle', (e) => e.textContent)).includes('Волшебник 5 (Школа Теста)'), 'a typed-in subclass');
await clickText('.classes-edit .btn', 'Добавить класс');
await tick();
await rowSet(1, 'select[aria-label="Класс"]', 'Fighter');
await tick();
check((await subs(1)).some((x) => x.startsWith('Чемпион')) && (await subs(1)).some((x) => x.startsWith('Мастер Боевых искусств')), 'Fighter: Champion and Battle Master (no spells) are there');
await rowSet(1, 'select[aria-label="Класс"]', 'LL:Rogue');
await tick();
check((await subs(1)).some((x) => x === 'Взломщик — Burglar') && (await subs(1)).some((x) => x === 'Хирург — Surgeon') && (await text('.crow .hint')).join().includes('Alternate Rogue'),
  `Laserllama Rogue: archetypes from the class documents (${(await subs(1)).length - 2})`);
await rowSet(1, 'select[aria-label="Класс"]', '__custom');
await tick();
await rowSet(1, 'input[aria-label="Название своего класса"]', 'Мистик');
await rowSet(1, 'input[type=number]', '2');
await tick();
for (const ab of ['МДР', 'ХАР']) await page.evaluate((a) => [...document.querySelectorAll('.cc-saves label')].find((l) => l.textContent.includes(a)).querySelector('input').click(), ab);
await tick();
await page.evaluate(() => { const s = [...document.querySelectorAll('.custom-class .mfield')].find((f) => f.textContent.startsWith('Заклинания')).querySelector('select'); s.value = 'full'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await tick();
const slots7 = JSON.stringify(await page.$$eval('.slots tbody td', (t) => t.map((x) => x.textContent)));
check(slots7 === '["4","3","3","1"]' && (await page.$eval('.char .subtitle', (e) => e.textContent)).includes('Мистик 2') && await stat('Хиты') === '39',
  `a typed-in full caster as the 2nd class: caster level 7 → ${slots7}, 39 hit points (${await stat('Хиты')})`);
const chaSave = await page.evaluate(() => [...document.querySelectorAll('.abil-in')].find((a) => a.textContent.includes('Харизма')).querySelector('.save-tg').classList.contains('on'));
check(!chaSave, 'saves come from the first class only (the typed-in 2nd class does not add CHA)');

// Typed in: race, weapon, features, items; a skill.
await setField('Раса', 'Лесной эльф');
await setField('Предыстория', 'Мудрец');
await clickText('.medit .btn', 'Добавить оружие');
await tick();
await setVal('.mrow.weapon input', 'Кинжал', 0);
await setVal('.mrow.weapon select', 'fin', 0);
await setVal('.mrow.weapon input[aria-label="Кости урона"]', '1d4');
await setVal('.mrow.weapon input[aria-label="Вид урона"]', 'колющий');
await tick();
const atk = await page.$$eval('.ctable:not(.inv) tbody tr', (rows) => rows.map((r) => [...r.cells].map((c) => c.textContent.trim()).join(' | ')));
check(atk.some((a) => a.startsWith('Кинжал | +5 | 1к4 + 2 колющий')), `dagger: +5, 1к4 + 2 (${atk.join('; ')})`);
await clickText('.medit .btn-row .btn', 'Класс');
await tick();
await setVal('.mrow.feature input[type=text]', 'Магическое восстановление');
await setVal('.mrow.feature input[type=number]', '1');
await tick();
check((await text('.res li')).some((r) => r.includes('Магическое восстановление — 1')), 'a limited feature gets boxes');
await clickText('.medit .btn', 'Добавить предмет');
await tick();
await setVal('.mrow.item input[type=text]', 'Книга заклинаний');
await setVal('.mrow.item input[type=number]', '3', 1);
await tick();
const arc = async () => page.evaluate(() => [...document.querySelectorAll('.skills li')].find((l) => l.textContent.includes('Магия')).querySelector('b').textContent);
await page.evaluate(() => [...document.querySelectorAll('.skills li')].find((l) => l.textContent.includes('Магия')).querySelector('.pdot').click());
await tick();
check(await arc() === '+5', `Arcana with proficiency +5 (${await arc()})`);
check((await page.$eval('.char .subtitle', (e) => e.textContent)).includes('Лесной эльф'), 'race in the subtitle');

// Portrait: dropped onto the frame, cropped in the app (a 400×200 picture: red left half, blue right half).
await page.evaluate(async () => {
  const cv = Object.assign(document.createElement('canvas'), { width: 400, height: 200 });
  const g = cv.getContext('2d');
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 200);
  g.fillStyle = '#0000ff'; g.fillRect(200, 0, 200, 200);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'face.png', { type: 'image/png' }));
  const el = document.querySelector('.portrait-img');
  el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
});
await page.waitForSelector('.crop-dialog .crop-box img', { timeout: 10000 });
await tick(300);
await shot('m0-crop');
const pixel = () => page.evaluate(async () => {
  const img = document.querySelector('.portrait-img img');
  await img.decode();
  const cv = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const [r, , b] = g.getImageData(4, 300, 1, 1).data;
  return { w: img.naturalWidth, h: img.naturalHeight, left: r > 200 && b < 60 ? 'red' : b > 200 && r < 60 ? 'blue' : `${r},${b}` };
});
await clickText('.crop-dialog .btn.primary', 'Сохранить');
await page.waitForSelector('.portrait-img img', { timeout: 10000 });
const p1 = await pixel();
check(p1.w === 480 && p1.h === 600 && p1.left === 'red', `dropped and cropped to 480×600 in the middle (${JSON.stringify(p1)})`);
await clickText('.portrait-actions .link', 'обрезать');
await page.waitForSelector('.crop-dialog .crop-box img');
await tick(200);
const box = await (await page.$('.crop-box')).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 - 20 * i, box.y + box.height / 2);
await page.mouse.up();
await clickText('.crop-dialog .btn.primary', 'Сохранить');
await tick(300);
const p2 = await pixel();
check(p2.left === 'blue', `dragging the picture changes the crop (left edge now ${p2.left})`);
await page.evaluate(() => document.querySelector('.detailcol').scrollTo(0, 0));
await shot('m1-manual');
await page.evaluate(() => document.querySelector('.detailcol').scrollTo(0, 900));
await shot('m1b-manual');

// PDF.
const before = new Set(fs.readdirSync(downloads));
await clickText('.print .btn.primary', 'Скачать PDF');
await page.waitForFunction(() => /Готово|Не удалось/.test(document.querySelector('.print [role=status]')?.textContent ?? ''), { timeout: 60000 });
let file = null;
for (let i = 0; i < 50 && !file; i++) { file = fs.readdirSync(downloads).find((f) => !before.has(f) && f.endsWith('.pdf')); if (!file) await tick(200); }
const buf = file ? fs.readFileSync(path.join(downloads, file)) : Buffer.alloc(0);
check(buf.subarray(0, 5).toString() === '%PDF-' && buf.includes('/Subtype /Image') && buf.length < 400 * 1024, `PDF with the portrait: ${file} ${(buf.length / 1024).toFixed(0)} KB`);
if (outDir && file) fs.copyFileSync(path.join(downloads, file), path.join(outDir, 'manual.pdf'));

// Stored: after a reload; the card shows the photo.
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.cspells .lrow', { timeout: 60000 });
check(await stat('Хиты') === '39' && (await text('.cspells .lrow .row-name')).length === 2 && Boolean(await page.$('.portrait-img img')), 'kept after reload');
await page.click('.nav-chars');
await page.waitForSelector('.cards .card');
check((await text('.cards .card')).some((c) => c.includes('Волшебник 5') && c.includes('Лесной эльф') && c.includes('создан на сайте')) && Boolean(await page.$('.card-photo')),
  'card: class, race, photo');

// Phone.
await page.click('.cards .card');
await page.waitForSelector('.abil-edit');
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.abil-edit', { timeout: 60000 });
check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('.detailcol').scrollWidth <= document.querySelector('.detailcol').clientWidth + 1), 'phone: no horizontal scroll');
await shot('m2-phone');

await browser.close();
fs.rmSync(downloads, { recursive: true, force: true });
if (problems.length) { console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('\nall checks passed');
