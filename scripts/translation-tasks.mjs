// Prepares translation work for spells that have no Russian text (Laserllama + a few official ones):
//   data/translations/glossary.md          terminology extracted from official EN/RU pairs (ttg.club)
//   data/translations/input/batch-N.json   spells to translate (with the official spell as a reference for ALT versions)
// Translators write data/translations/out/batch-N.json; check with scripts/check-translations.mjs.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BATCHES = Number(process.argv[2] || 6);
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/build/spells.json'), 'utf8'));
const ll = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/laserllama/spells.en.json'), 'utf8'));
const dir = path.join(ROOT, 'data/translations');
fs.mkdirSync(path.join(dir, 'input'), { recursive: true });
fs.mkdirSync(path.join(dir, 'out'), { recursive: true });

const official = data.spells.filter((s) => !s.homebrew);
const todo = data.spells.filter((s) => !s.text.ru || (s.homebrew && !s.time.ru));

/* ---------- glossary ---------- */
const pairs = (field) => {
  const m = new Map();
  for (const s of official) if (s[field].ru) m.set(s[field].en, s[field].ru);
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
};
const md = [];
md.push('# Глоссарий перевода заклинаний (EN → RU)\n');
md.push('Источник русской терминологии — переводы ttg.club официальных заклинаний (они уже есть в data/build/spells.json, поле text.ru). Следуй им.\n');
md.push('## Классы\n');
for (const c of data.classes) md.push(`- ${c.en} — ${c.ru}`);
md.push('\n## Формулировки шапки заклинания (официальные пары)\n');
for (const [label, field] of [['Время накладывания', 'time'], ['Дистанция', 'range'], ['Длительность', 'duration']]) {
  md.push(`### ${label}\n`);
  for (const [en, ru] of pairs(field)) md.push(`- ${en} — ${ru}`);
  md.push('');
}
md.push('### Компоненты\n\n- V, S, M (…) — В, С, М (…). Материал переводится, стоимость: "worth at least 50 gp" — "стоимостью не менее 50 зм", "which the spell consumes" — "расходуемый заклинанием".\n');
md.push('## Названия официальных заклинаний\n');
for (const s of [...official].sort((a, b) => a.name.en.localeCompare(b.name.en))) if (s.name.ru) md.push(`- ${s.name.en} — ${s.name.ru}`);
fs.writeFileSync(path.join(dir, 'glossary.md'), md.join('\n') + '\n');

/* ---------- batches ---------- */
const byGroup = new Map(official.map((s) => [s.group, s]));
const items = todo.map((s) => {
  const ref = s.homebrew && s.relation ? byGroup.get(s.group) : null;
  return {
    id: s.id,
    kind: s.homebrew ? 'laserllama' : 'official',
    level: s.level,
    name: s.name.en,
    time: s.time.en,
    range: s.range.en,
    duration: s.duration.en,
    components: s.comps.en,
    html: s.text.en,
    ...(ref ? {
      reference: {
        note: 'Официальная версия этого заклинания с готовым русским переводом. Совпадающие по смыслу фразы переводи так же.',
        name: ref.name, time: ref.time, range: ref.range, duration: ref.duration, components: ref.comps, html: ref.text,
      },
    } : {}),
  };
});
// Balance batches by text size.
const size = (it) => it.html.length + (it.reference ? it.reference.html.en.length / 2 : 0);
const batches = Array.from({ length: BATCHES }, () => ({ items: [], size: 0 }));
for (const it of [...items].sort((a, b) => size(b) - size(a))) {
  const b = batches.reduce((x, y) => (y.size < x.size ? y : x));
  b.items.push(it);
  b.size += size(it);
}
batches.forEach((b, i) => {
  b.items.sort((a, c) => a.id.localeCompare(c.id));
  const extra = i === 0 ? { notes: ll.notes.filter((n) => n.html).map((n) => ({ title: n.title ?? null, html: n.html })) } : {};
  fs.writeFileSync(path.join(dir, 'input', `batch-${i + 1}.json`), JSON.stringify({ batch: i + 1, ...extra, spells: b.items }, null, 1));
  console.log(`batch-${i + 1}: ${b.items.length} spells, ~${Math.round(b.size / 1000)}k chars`);
});
