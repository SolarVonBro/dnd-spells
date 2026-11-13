// Checks translation files against their inputs.
// Usage: node scripts/check-translations.mjs [data/translations/out/batch-1.json ...]   (default: all)
// Output file format: { "<spell id>": { name, time, range, duration, components, html }, "_notes": [...] }
import fs from 'node:fs';
import path from 'node:path';
import { parseFragment } from 'parse5';

const ROOT = path.resolve(import.meta.dirname, '..');
const outDir = path.join(ROOT, 'data/translations/out');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(outDir).filter((f) => f.endsWith('.json')).map((f) => path.join(outDir, f));

const tagSeq = (html) => {
  const seq = [];
  const walk = (n) => {
    if (n.tagName) seq.push(n.tagName + (n.attrs?.find((a) => a.name === 'class') ? `.${n.attrs.find((a) => a.name === 'class').value}` : ''));
    (n.childNodes || []).forEach(walk);
  };
  parseFragment(html).childNodes.forEach(walk);
  return seq.join(' ');
};
const text = (html) => html.replace(/<[^>]+>/g, ' ');
const numbers = (s) => (text(s).match(/\d+/g) || []).sort().join(',');

let errors = 0, warnings = 0;
for (const file of files) {
  const base = path.basename(file);
  const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/translations/input', base), 'utf8'));
  let out;
  try { out = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`${base}: ERROR invalid JSON: ${e.message}`); errors++; continue; }
  const err = (m) => { console.log(`${base}: ERROR ${m}`); errors++; };
  const wrn = (m) => { console.log(`${base}: warn  ${m}`); warnings++; };
  for (const s of input.spells) {
    const t = out[s.id];
    if (!t) { err(`${s.id}: missing`); continue; }
    for (const f of ['name', 'time', 'range', 'duration', 'components', 'html']) if (!t[f] || typeof t[f] !== 'string') err(`${s.id}: empty field ${f}`);
    if (!t.html) continue;
    if (tagSeq(t.html) !== tagSeq(s.html)) err(`${s.id}: HTML structure differs from the original\n    EN: ${tagSeq(s.html)}\n    RU: ${tagSeq(t.html)}`);
    if (numbers(t.html) !== numbers(s.html)) wrn(`${s.id}: numbers differ in text  EN[${numbers(s.html)}]  RU[${numbers(t.html)}]`);
    for (const f of ['time', 'range', 'duration', 'components']) {
      if (t[f] && numbers(t[f]) !== numbers(s[f])) wrn(`${s.id}: numbers differ in ${f}: "${s[f]}" vs "${t[f]}"`);
    }
    const latin = (text(t.html).match(/\b[A-Za-z]{3,}\b/g) || []).filter((w) => !/^(PB|DC|AC|HP|CR)$/.test(w));
    if (latin.length) wrn(`${s.id}: Latin words left in text: ${[...new Set(latin)].slice(0, 8).join(', ')}`);
    if (/\d+d\d+/.test(text(t.html))) wrn(`${s.id}: dice should use "к" (2к6), found "d"`);
  }
  for (const k of Object.keys(out)) if (!k.startsWith('_') && !input.spells.some((s) => s.id === k)) err(`unexpected key ${k}`);
  if (input.notes && !Array.isArray(out._notes)) err('_notes (translation of the "notes" array) missing');
}
console.log(`\n${errors} errors, ${warnings} warnings`);
process.exitCode = errors ? 1 : 0;
