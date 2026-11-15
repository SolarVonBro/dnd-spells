// Browser test of the ability score calculator: point buy (custom budget), standard array, rolls and custom formulas,
// bonuses, Sanity and Honor, copying the line of scores, saved sets.
//   node tests/stats.mjs <url> [password|-] [screenshots-dir]
// Without a password the key is taken from .env.local (owner's machine only).
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { readEnvFile } from '../scripts/lib/env.mjs';

const [url, password, shotsDir] = process.argv.slice(2);
if (!url) { console.error('usage: node tests/stats.mjs <url> [password|-] [shots-dir]'); process.exit(2); }
const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const browser = await puppeteer.launch({ executablePath: browsers.find((p) => fs.existsSync(p)), headless: true });
await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['clipboard-read', 'clipboard-write']);
const problems = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg); };
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const shot = async (name) => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: false }); };

const page = await browser.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 1366, height: 900 });
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

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
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
const rows = () => page.$$eval('.srow:not(.shead)', (rs) => rs.map((r) => ({
  name: r.querySelector('.sname b').textContent,
  base: r.querySelector('.sbase').textContent.trim(),
  total: r.querySelector('.stotal').textContent.replace('!', ''),
  warn: r.querySelector('.stotal').classList.contains('warn'),
})));
const left = () => page.$eval('.pb-left b', (e) => Number(e.textContent));
const copyText = (label) => page.evaluate((l) => [...document.querySelectorAll('.copies .copyline')].find((b) => b.textContent.includes(l))?.querySelector('code').textContent ?? null, label);
const plus = (i) => page.evaluate((n) => document.querySelectorAll('.srow:not(.shead)')[n].querySelectorAll('.stepper button')[1].click(), i);
const plusDisabled = (i) => page.evaluate((n) => document.querySelectorAll('.srow:not(.shead)')[n].querySelectorAll('.stepper button')[1].disabled, i);
const rolled = () => page.$$eval('.rcard', (cs) => cs.map((c) => ({
  value: Number(c.querySelector('.rval').textContent),
  dropped: c.classList.contains('dropped'),
  dice: c.querySelectorAll('.die').length,
  droppedDice: c.querySelectorAll('.die.dropped').length,
})));
const info = () => page.$eval('.formula-info', (e) => ({ text: e.textContent, err: e.classList.contains('err') }));

// The menu: a section of its own.
await page.click('.nav-stats');
await page.waitForSelector('.methods');
check(await page.evaluate(() => document.querySelector('.nav-tab[aria-current=page]')?.classList.contains('nav-stats') && document.title.startsWith('Калькулятор')),
  'stats page: menu tab and title');

// Point buy: 27 points, 8–15, PHB costs.
check(await left() === 27 && (await copyText('Итог')) === '8 8 8 8 8 8', 'point buy starts at 8 everywhere with 27 points');
for (const [i, n] of [[0, 7], [1, 6], [2, 5], [3, 4], [4, 2]]) for (let k = 0; k < n; k++) await plus(i);
await tick();
check((await copyText('Итог')) === '15 14 13 12 10 8' && await left() === 0, `15 14 13 12 10 8 costs exactly 27 (left ${await left()})`);
check(await plusDisabled(0) && await plusDisabled(5), 'no points left: increases are disabled; 15 is the maximum');
await setVal('.pb-budget input', '32');
await tick();
check(await left() === 5, `custom budget 32: 5 points left (${await left()})`);
await clickText('.pb-head .link', 'вернуть');
await tick();
check(await left() === 0, 'back to the standard budget');
await clickText('.mpanel.pb .check', 'Расширенная таблица');
await tick();
await setVal('.pb-budget input', '40');
await tick();
for (let k = 0; k < 3; k++) await plus(0);
await tick();
check((await rows())[0].base.startsWith('−18') || (await rows())[0].total === '18', `extended table allows 18 (${(await rows())[0].total})`);
check(await left() === 40 - 27 - 10, `18 costs 19 in the extended table (left ${await left()})`);
await clickText('.mpanel.pb .check', 'Расширенная таблица');
await setVal('.pb-budget input', '27');
await tick();

// Optional abilities: +3 points each.
await clickText('.optional .check', 'Здравомыслие');
await tick();
let r = await rows();
check(r.length === 7 && r[6].name === 'Здравомыслие' && await left() === 3, `Sanity: 7 abilities, budget 30 (left ${await left()})`);
await shot('s1-pointbuy');

// Bonuses: +2/+1 (race), +1 to all (human); Honor can't take increases.
await clickText('.badd .chip', '+2 / +1');
await tick();
await setVal('.bpick select', 'str', 0);
await setVal('.bpick select', 'con', 1);
await tick();
r = await rows();
check(r[0].total === '17' && r[2].total === '14', `+2 STR, +1 CON (${r[0].total}, ${r[2].total})`);
await clickText('.optional .check', 'Честь');
await tick();
const targets = await page.$$eval('.bpick select', (ss) => [...ss[0].options].map((o) => o.value));
check(targets.includes('san') && !targets.includes('hon'), `increases can go to Sanity but not to Honor (${targets.join(',')})`);
await clickText('.badd .chip', 'Увеличение +2');
await tick();
await setVal('.bpick select', 'str', 2);
await clickText('.badd .chip', 'Увеличение +2');
await tick();
await setVal('.bpick select', 'str', 3);
await tick();
r = await rows();
check(r[0].total === '21' && r[0].warn, `over 20 is flagged (${r[0].total})`);
for (let k = 0; k < 2; k++) {
  await page.evaluate(() => [...document.querySelectorAll('.brow')].at(-1).querySelector('.brow-head .icon-btn').click());
  await tick();
}
check(await page.$$eval('.brow', (b) => b.length) === 1, 'bonuses are removed one by one');

// Copying: a click puts the line of scores on the clipboard.
const line = await copyText('Итог');
await page.evaluate(() => [...document.querySelectorAll('.copies .copyline')].find((b) => b.textContent.includes('Итог')).click());
await tick(300);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(clip === line && clip.split(' ').length === 8 && (await page.$eval('.copies .copyline', (e) => e.textContent)).includes('скопировано'),
  `copied "${clip}" (8 scores incl. Sanity and Honor)`);
const mods = await copyText('Модификаторы');
check(mods.split(' ').every((m) => /^[+-]\d+$/.test(m)), `modifiers line "${mods}"`);

// Standard array: 15 14 13 12 10 8 + 11 per optional ability; choosing a value swaps it.
await clickText('.mcard', 'Стандартный набор');
await tick();
check((await copyText('Без бонусов')) === '15 14 13 12 10 8 11 11', `standard array with two 11s (${await copyText('Без бонусов')})`);
const opt8 = await page.$$eval('select.pick', (ss) => [...ss[0].options].find((o) => o.textContent.startsWith('8')).value);
await setVal('select.pick', opt8, 0);
await tick();
check((await copyText('Без бонусов')) === '8 14 13 12 10 15 11 11', `swap STR and CHA (${await copyText('Без бонусов')})`);
await clickText('.optional .check', 'Честь');
await tick();
check((await copyText('Без бонусов')) === '8 14 13 12 10 15 11', `without Honor its 11 leaves the array (${await copyText('Без бонусов')})`);

// Rolling: 4d6, drop the lowest (PHB).
await clickText('.mcard', 'Броски');
await page.waitForSelector('.roll-go .btn');
check(/от 3 до 18/.test((await info()).text), `4d6kh3: 3–18 (${(await info()).text})`);
await clickText('.roll-go .btn', 'Бросить');
await page.waitForSelector('.rcard');
let rs = await rolled();
check(rs.length === 7 && rs.every((x) => x.value >= 3 && x.value <= 18 && x.dice === 4 && x.droppedDice === 1),
  `7 rolls of 4d6, one die dropped each (${rs.map((x) => x.value).join(' ')})`);
const base1 = await copyText('Без бонусов');
check(base1 === rs.map((x) => x.value).join(' '), `rolled values go to the abilities in order (${base1})`);
await shot('s2-rolls');

// Custom formulas and their errors.
await clickText('.roll .chip', 'Своя формула');
await page.waitForSelector('.formula input');
const formula = async (f) => { await setVal('.formula input', f); await tick(); return info(); };
check(/от 8 до 18/.test((await formula('2d6+6')).text), '2d6+6: 8–18');
check(/от 6 до 18/.test((await formula('4d6r1kh3')).text), '4d6r1kh3: 6–18 (ones are rerolled)');
check(/от 3 до 18/.test((await formula('4к6kh3')).text), 'Russian к works as d');
check(/∞/.test((await formula('1d6!')).text), '1d6!: no upper limit');
let e = await formula('4d6x');
check(e.err && /Непонятный символ/.test(e.text) && await page.$eval('.roll-go .btn', (b) => b.disabled), `bad symbol: ${e.text}`);
e = await formula('4d6kh5');
check(e.err && /от 1 до 4/.test(e.text), `keep more than rolled: ${e.text}`);
e = await formula('1d6r<6');
check(e.err && /никогда не закончится/.test(e.text), `endless reroll: ${e.text}`);
e = await formula('4d6+');
check(e.err && /обрывается/.test(e.text), `dangling sign: ${e.text}`);
await formula('2d6+6');
await setVal('.num-opt input', '9');
await tick();
await clickText('.roll-go .btn', 'Бросить');
await tick(200);
rs = await rolled();
const kept = rs.filter((x) => !x.dropped).map((x) => x.value);
const dropped = rs.filter((x) => x.dropped).map((x) => x.value);
check(rs.length === 9 && dropped.length === 2 && rs.every((x) => x.value >= 8 && x.value <= 18) && Math.min(...kept) >= Math.max(...dropped),
  `9 rolls of 2d6+6, the 2 lowest dropped (kept ${kept.join(' ')}; dropped ${dropped.join(' ')})`);
check(await page.$eval('.history summary', (s) => s.textContent.includes('(1)')), 'the previous roll is in the history');

// Free assignment vs "in order"; the house rule on modifiers.
const before = await copyText('Без бонусов');
const second = await page.$$eval('select.pick', (ss) => ss[0].options[1].value);
await setVal('select.pick', second, 0);
await tick();
check((await copyText('Без бонусов')) !== before || before.split(' ')[0] === before.split(' ')[1], 'rolled values can be swapped');
await clickText('.roll-opts .check', 'По порядку');
await tick();
check(await page.$$eval('select.pick', (ss) => ss.every((s) => s.disabled)), '"in order": no rearranging');
await clickText('.roll-opts .check', 'По порядку');
await setVal('.num-opt input', '7');
await formula('3d6');
await clickText('.roll-opts .check', 'Домашнее правило');
await setVal('.inline-num', '4');
await tick();
await clickText('.roll-go .btn', 'Бросить');
await tick(200);
rs = await rolled();
const modSum = rs.filter((x) => !x.dropped).reduce((s, x) => s + Math.floor((x.value - 10) / 2), 0);
check(modSum >= 4, `house rule: rerolled until the modifiers sum to at least +4 (${modSum})`);
await clickText('.roll-opts .check', 'Домашнее правило');

// An ability added after the roll gets its own roll.
await clickText('.optional .check', 'Честь');
await page.waitForSelector('.roll .hint.warn .btn');
await clickText('.roll .hint.warn .btn', 'Добросить');
await tick();
check((await copyText('Без бонусов'))?.split(' ').length === 8 && !(await page.$('.roll .hint.warn .btn')), 'Honor rolled separately');

// Saving sets.
await setVal('.set-fields input', 'Тест: Элара', 0);
await setVal('.set-fields input', 'Броски 3d6', 1);
await clickText('.save-card .btn', 'Сохранить набор');
await page.waitForSelector('.sset');
const savedLine = await copyText('Итог');
check(await page.$eval('.sgroup h4', (h) => h.textContent) === 'Тест: Элара' && (await page.$eval('.sset .copyline code', (c) => c.textContent)) === savedLine,
  'saved under the character, with the line of scores');
check(await page.$eval('.nav-stats .badge', (b) => b.textContent).catch(() => '') === '1', 'menu shows 1 saved set');
await clickText('.mcard', 'Вручную');
await tick();
check(await page.$eval('.save-state', (e) => e.classList.contains('dirty')), 'changes after saving are marked');
await setVal('.mnum', '16', 0);
await setVal('.set-fields input', 'Вручную', 1);
await clickText('.save-card .btn', 'Как новый');
await tick();
check(await page.$$eval('.sset', (s) => s.length) === 2, 'saved as a new set');
await page.evaluate(() => [...document.querySelectorAll('.sset')].find((s) => s.textContent.includes('Броски 3d6')).querySelector('.copyline').click());
await tick(300);
check(await page.evaluate(() => navigator.clipboard.readText()) === savedLine, 'copy from the saved list');
await page.evaluate(() => [...document.querySelectorAll('.sset-main')].find((s) => s.textContent.includes('Броски 3d6')).click());
await tick();
check((await page.$eval('.mcard.on', (m) => m.textContent)).includes('Броски') && (await copyText('Итог')) === savedLine, 'a saved set opens in the calculator');
await shot('s3-saved');

// Survives a reload.
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.sset', { timeout: 60000 });
check(await page.$$eval('.sset', (s) => s.length) === 2 && (await page.$eval('.set-fields input', (i) => i.value)) === 'Тест: Элара' && (await copyText('Итог')) === savedLine,
  'sets and the calculator survive a reload');
await page.evaluate(() => [...document.querySelectorAll('.sset')].find((s) => s.textContent.includes('Вручную')).querySelector('.sset-head .icon-btn').click());
await tick();
check(await page.$$eval('.sset', (s) => s.length) === 1, 'a set is deleted');

// Phone layout.
await page.setViewport({ width: 360, height: 760, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.srow', { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
const phone = await page.evaluate(() => ({
  over: document.documentElement.scrollWidth - window.innerWidth,
  inner: document.querySelector('.detailcol').scrollWidth - document.querySelector('.detailcol').clientWidth,
  tabs: [...document.querySelectorAll('.nav-tab')].map((t) => t.getBoundingClientRect().right),
  labels: [...document.querySelectorAll('.nav-tab .lbl')].filter((l) => l.offsetParent).every((l) => l.scrollWidth <= l.clientWidth + 1),
  short: document.querySelector('.nav-stats .lbl-short').offsetParent !== null,
}));
check(phone.over <= 1 && phone.inner <= 1 && phone.labels && phone.short && Math.max(...phone.tabs) <= 360,
  `phone: fits the screen, 4 menu tabs with short labels (${JSON.stringify(phone)})`);
await shot('s4-phone');

await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('\nall checks passed');
