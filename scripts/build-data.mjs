// Builds the normalized spell dataset: data/build/spells.json
//   English official text  : 5etools (data/vendor/5etools)
//   Russian official text  : ttg.club (data/vendor/ttg)
//   Laserllama (EN)        : data/laserllama/spells.en.json (from the GM Binder PDF)
//   Our translations (RU)  : data/translations/*.ru.json
//   Class spellcasting tables: 5etools class files + data/laserllama/class-tables (scripts/lib/casters.mjs)
// The same file is loaded into YDB (scripts/db.mjs) and served by the dev API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { OFFICIAL_SOURCES, LASERLLAMA, TTG_TO_5ET } from './lib/sources.mjs';
import { renderEntries, formatTime, formatRange, formatDuration, formatComponents, renderPlain } from './lib/render5e.mjs';
import { sanitize } from './lib/sanitize.mjs';
import { slugify, htmlToText, DAMAGE_TYPES, SCHOOLS } from './lib/text.mjs';
import * as LL from './lib/laserllama.mjs';
import { buildCasters } from './lib/casters.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readJsonOpt = (p) => (fs.existsSync(path.join(ROOT, p)) ? readJson(p) : {});
const problems = [];
const warn = (m) => problems.push(m);

/* ---------------- classes ---------------- */
const CLASS_RU = {
  Artificer: 'Изобретатель', Bard: 'Бард', Cleric: 'Жрец', Druid: 'Друид', Paladin: 'Паладин', Ranger: 'Следопыт',
  Sorcerer: 'Чародей', Warlock: 'Колдун', Wizard: 'Волшебник', Fighter: 'Воин', Rogue: 'Плут', Monk: 'Монах',
  Barbarian: 'Варвар', Magus: 'Магус', Psion: 'Псион', Shaman: 'Шаман', Vessel: 'Сосуд',
};
// Class lists of 2014 rules: PHB classes + TCE artificer. Optional expansions only from 2014 books.
const CLASS_SRC = new Set(['PHB', 'TCE']);
const VARIANT_BOOKS = new Set(['XGE', 'TCE', 'FTD', 'BMT', 'SCC', 'AAG', 'EGW']);
const SUBCLASS_BOOKS = new Set(['PHB', 'DMG', 'SCAG', 'XGE', 'TCE', 'EGW', 'FTD', 'VRGR', 'BGG', 'DSotDQ', 'GGR', 'MOT', 'SCC', 'BMT', 'ERLW']);

/* ---------------- official spells (5etools) ---------------- */
const lookup = readJson('data/vendor/5etools/gendata-spell-source-lookup.json');
const official = [];
for (const [code, src] of Object.entries(OFFICIAL_SOURCES)) {
  for (const s of readJson(`data/vendor/5etools/${src.file}`).spell) official.push({ ...s, _code: code });
}
const byId = new Map();
const nameToId = new Map(); // lowercased names / aliases -> group id
// Name key ignores case and punctuation: "Green-Flame Blade" == "Green Flame Blade".
const nameKey = (name) => String(name).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const addAlias = (name, id) => {
  const k = nameKey(name);
  if (!nameToId.has(k)) nameToId.set(k, id);
};
for (const s of official) {
  const id = slugify(s.name);
  if (byId.has(id)) throw new Error(`Duplicate spell id ${id}`);
  byId.set(id, s);
  addAlias(s.name, id);
  if (typeof s.srd === 'string') addAlias(s.srd, id);
  const m = s.name.match(/^[A-Z][\w-]+'s (.+)$/); // "Tasha's Hideous Laughter" -> "Hideous Laughter"
  if (m) addAlias(m[1], id);
  for (const a of s.alias || []) addAlias(a, id);
}
const refId = (name) => nameToId.get(nameKey(name)) ?? null;
const ctx5e = { spellRef: (name) => refId(name) };

/* ---------------- ttg.club (Russian) ---------------- */
const TTG_ALIAS = {
  'antipathy or sympathy': 'Antipathy/Sympathy',
  'blindness or deafness': 'Blindness/Deafness',
  'enlarge or reduce': 'Enlarge/Reduce',
  'creating spelljamming helm': 'Create Spelljamming Helm',
  'immovable objec': 'Immovable Object',
};
const ttgDir = path.join(ROOT, 'data/vendor/ttg/spells');
const ttgById = new Map();
const ttgSlugToId = new Map();
const ttgSubclassRu = new Map(); // "cleric/light" -> "Домен Света"
for (const f of fs.readdirSync(ttgDir)) {
  const c = JSON.parse(fs.readFileSync(path.join(ttgDir, f), 'utf8'));
  for (const sc of c.subclasses || []) ttgSubclassRu.set(sc.url.replace(/^\/classes\//, ''), sc.name);
  if (c.source.shortName === 'LH') continue;
  const en = c.name.eng.trim();
  const id = refId(TTG_ALIAS[en.toLowerCase()] ?? en);
  const slug = c.url.replace(/^\/spells\//, '');
  if (!id) { warn(`ttg: no 5etools match for "${en}" (${c.source.shortName}) — skipped`); continue; }
  ttgSlugToId.set(slug, id);
  const src = TTG_TO_5ET[c.source.shortName] ?? c.source.shortName;
  const prev = ttgById.get(id);
  // Prefer the card from the same book as 5etools (TCE over SCAG reprints).
  if (!prev || (prev._src !== byId.get(id)._code && src === byId.get(id)._code)) ttgById.set(id, { ...c, _src: src });
}

const ruLink = (href) => {
  const m = href.match(/^\/spells\/([^/?#]+)/);
  if (m) return { ref: ttgSlugToId.get(decodeURIComponent(m[1])) ?? undefined };
  if (href.startsWith('/rules/Errata')) return { drop: true }; // footnote markers pointing to ttg errata page
  return null;
};
function sanitizeRu(html, where) {
  const out = sanitize(html, { link: ruLink }).replace(/<sup><\/sup>/g, '');
  // Text must survive sanitizing (except errata footnote markers that we drop on purpose).
  const expected = htmlToText(String(html).replace(/<a [^>]*href="\/rules\/Errata[^"]*"[^>]*>.*?<\/a>/g, ''));
  if (htmlToText(out).replace(/\s/g, '') !== expected.replace(/\s/g, '')) warn(`text changed while sanitizing RU ${where}`);
  return out;
}

const HIGHER_RU = 'На более высоких уровнях.';
function ruBody(card, id) {
  let html = sanitizeRu(card.description, id);
  if (card.upper) {
    const up = sanitizeRu(card.upper, `${id}/upper`);
    const label = `<strong><em>${HIGHER_RU}</em></strong> `;
    html += up.startsWith('<p>') ? up.replace(/^<p>/, `<p>${label}`) : `<p>${label}${up}</p>`;
  }
  return html;
}
const ruComponents = (c) => [c.v && 'В', c.s && 'С', c.m && (typeof c.m === 'string' ? `М (${c.m})` : 'М')]
  .filter(Boolean).join(', ');

/* ---------------- class lists ---------------- */
function classesFor(s) {
  const L = lookup[s.source.toLowerCase()]?.[s.name.toLowerCase()] ?? {};
  const classes = new Set();
  const expanded = new Set();
  const subclasses = [];
  for (const [csrc, cl] of Object.entries(L.class || {})) if (CLASS_SRC.has(csrc)) for (const c of Object.keys(cl)) classes.add(c);
  for (const [csrc, cl] of Object.entries(L.classVariant || {})) {
    if (!CLASS_SRC.has(csrc)) continue;
    for (const [c, v] of Object.entries(cl)) if (v.definedInSources.some((b) => VARIANT_BOOKS.has(b)) && !classes.has(c)) expanded.add(c);
  }
  for (const [csrc, cl] of Object.entries(L.subclass || {})) {
    if (!CLASS_SRC.has(csrc)) continue;
    for (const [c, bySrc] of Object.entries(cl)) {
      for (const [ssrc, scs] of Object.entries(bySrc)) {
        if (!SUBCLASS_BOOKS.has(ssrc)) continue;
        for (const [short, v] of Object.entries(scs)) {
          if (!subclasses.some((x) => x.class === c && x.short === short)) subclasses.push({ class: c, short, name: v.name, source: ssrc });
        }
      }
    }
  }
  return { classes: [...classes].sort(), expanded: [...expanded].sort(), subclasses };
}

/* ---------------- build official records ---------------- */
const versions = [];
const subclassIndex = new Map();
// Our own translations (spells without a Russian source), keyed by version id: "ll:<id>", "aitfr-avt:linked-glyphs".
const translations = {};
let llNotesRu = null;
const outDir = path.join(ROOT, 'data/translations/out');
for (const f of fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((x) => x.endsWith('.json')).sort() : []) {
  const t = JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
  if (t._notes) llNotesRu = t._notes;
  for (const [k, v] of Object.entries(t)) if (!k.startsWith('_')) translations[k] = v;
}

for (const [id, s] of byId) {
  const enBody = sanitize(
    renderEntries(s.entries, ctx5e) + (s.entriesHigherLevel ? renderEntries(s.entriesHigherLevel, ctx5e) : ''),
    { link: () => null },
  );
  const card = ttgById.get(id);
  const tr = translations[`${s._code.toLowerCase()}:${id}`];
  if (!card && !tr) warn(`no Russian text for ${s.name} (${s._code})`);
  const { classes, expanded, subclasses } = classesFor(s);
  for (const sc of subclasses) {
    const key = `${sc.class}:${sc.short}`;
    if (!subclassIndex.has(key)) {
      const ttgKey = `${sc.class.toLowerCase()}/${sc.short.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      subclassIndex.set(key, { id: key, class: sc.class, en: sc.name, ru: ttgSubclassRu.get(ttgKey) ?? null, source: sc.source });
    }
  }
  const m = s.components.m;
  const conc = s.duration.some((d) => d.concentration);
  versions.push({
    id: `${s._code.toLowerCase()}:${id}`,
    group: id,
    source: s._code,
    page: s.page ?? null,
    homebrew: false,
    relation: null,
    name: { en: s.name, ru: card?.name.rus ?? tr?.name ?? null },
    level: s.level,
    school: s.school,
    ritual: Boolean(s.meta?.ritual),
    concentration: conc,
    components: {
      v: Boolean(s.components.v), s: Boolean(s.components.s), m: Boolean(m), r: Boolean(s.components.r),
      cost: Boolean(m && typeof m === 'object' && m.cost),
      consumed: Boolean(m && typeof m === 'object' && m.consume),
    },
    cast: s.time.map((t) => (['minute', 'hour'].includes(t.unit) ? `${t.unit}:${t.number}` : t.unit)),
    damage: [...new Set(s.damageInflict || [])].sort(),
    classes,
    expanded,
    subclasses: subclasses.map((x) => `${x.class}:${x.short}`).sort(),
    time: { en: formatTime(s.time, ctx5e), ru: card?.time ?? tr?.time ?? null },
    range: { en: formatRange(s.range), ru: card?.range ?? tr?.range ?? null },
    duration: { en: formatDuration(s.duration), ru: card?.duration ?? tr?.duration ?? null },
    comps: { en: formatComponents(s.components, ctx5e), ru: card ? ruComponents(card.components) : tr?.components ?? null },
    text: { en: enBody, ru: card ? ruBody(card, id) : tr ? sanitize(tr.html, { link: () => null }) : null },
  });
}

/* ---------------- Laserllama ---------------- */
const llData = readJson('data/laserllama/spells.en.json');
// Laserllama alternates whose names differ from the official spell (checked against the texts).
const LL_ALIAS = {
  'animate object': 'animate-objects',
  'control flame': 'control-flames',
  'create water': 'create-or-destroy-water',
  antipathy: 'antipathy-sympathy',
  'create snare': 'snare',
  'dominate creature': 'dominate-beast',
};
// Marked "A" in the PDF body but not in its index, and there is no official spell to compare with.
const LL_NOT_ALT = new Set(['astral blade']);
const llIds = new Set();
const relations = { alt: 0, same: 0, changed: 0, new: 0 };
for (const s of llData.spells) {
  const key = s.name.toLowerCase();
  const offId = LL_ALIAS[key] ?? refId(s.name);
  const id = offId ?? slugify(s.name);
  if (llIds.has(id)) throw new Error(`Duplicate Laserllama spell ${id}`);
  llIds.add(id);
  const rawHtml = LL.blocksToHtml(s.blocks);
  const enBody = sanitize(rawHtml, { link: () => null });
  if (htmlToText(enBody).replace(/\s/g, '') !== htmlToText(rawHtml).replace(/\s/g, '')) warn(`text changed while sanitizing LL ${s.name}`);

  let relation = null;
  if (offId) {
    const off = versions.find((v) => v.id === `${byId.get(offId)._code.toLowerCase()}:${offId}`);
    const same = htmlToText(off.text.en).replace(/\W+/g, ' ').toLowerCase() === htmlToText(enBody).replace(/\W+/g, ' ').toLowerCase();
    if (s.alt) relation = 'alt';
    else if (same) relation = 'same';
    else { relation = 'alt'; relations.changed++; } // ALT only in the PDF index; text differs from the official one
    relations[relation]++;
  } else {
    relations.new++;
    if (s.alt && !LL_NOT_ALT.has(key)) warn(`LL "${s.name}" is marked ALT but no official spell matched`);
  }

  const comps = LL.parseComponents(LL.prop(s, 'Components'));
  const dur = LL.prop(s, 'Duration');
  const ru = translations[`ll:${id}`];
  versions.push({
    id: `ll:${id}`,
    group: id,
    source: LASERLLAMA.code,
    page: s.page,
    homebrew: true,
    relation,
    name: { en: s.name, ru: ru?.name ?? (offId ? versions.find((v) => v.group === offId)?.name.ru : null) ?? null },
    level: s.level,
    school: LL.schoolCode(s.school),
    ritual: Boolean(s.ritual),
    concentration: /^concentration/i.test(dur.trim()),
    components: { v: comps.v, s: comps.s, m: comps.m, r: false, cost: /\bworth\b|\bgp\b/i.test(comps.material), consumed: /\bconsume/i.test(comps.material) },
    cast: LL.castKeyFromText(LL.prop(s, 'Casting Time')),
    damage: LL.damageTypesFromText(enBody),
    classes: [...new Set(LL.classList(s))].sort(),
    expanded: [],
    subclasses: [],
    time: { en: LL.prop(s, 'Casting Time'), ru: ru?.time ?? null },
    range: { en: LL.prop(s, 'Range'), ru: ru?.range ?? null },
    duration: { en: dur, ru: ru?.duration ?? null },
    comps: { en: LL.prop(s, 'Components'), ru: ru?.components ?? null },
    text: { en: enBody, ru: ru ? sanitize(ru.html, { link: () => null }) : null },
  });
}
for (const k of Object.keys(translations)) {
  if (!versions.some((v) => v.id === k)) warn(`translation for unknown spell "${k}"`);
}

/* ---------------- Laserllama class spell lists (from his class documents) ---------------- */
// data/laserllama/class-lists/<class>.json (scripts/extract_class_spell_list.py). An entry marked "ll" refers to the
// compendium version of the spell, otherwise to the official one. Classes without a document keep the compendium's
// "Classes" line as their list (handled in the site).
const LIST_ALIAS = { 'protection from good and evil': 'Protection from Evil and Good' };
const llByName = new Map(versions.filter((v) => v.homebrew).map((v) => [nameKey(v.name.en), v]));
const officialByGroup = new Map(versions.filter((v) => !v.homebrew).map((v) => [v.group, v]));
const llClassLists = [];
for (const v of versions) v.llLists = [];
const listDir = path.join(ROOT, 'data/laserllama/class-lists');
for (const f of fs.existsSync(listDir) ? fs.readdirSync(listDir).filter((x) => x.endsWith('.json')).sort() : []) {
  const L = JSON.parse(fs.readFileSync(path.join(listDir, f), 'utf8'));
  let count = 0;
  for (const [lvl, entries] of Object.entries(L.levels)) {
    for (const e of entries) {
      const key = nameKey(e.name.replace(/&/g, ' and '));
      const v = e.ll ? llByName.get(key) : officialByGroup.get(refId(LIST_ALIAS[key] ?? key));
      if (!v) throw new Error(`${f}: "${e.name}" (${e.ll ? 'Laserllama' : 'official'}) not found`);
      if (v.level !== Number(lvl)) throw new Error(`${f}: "${e.name}" is listed at level ${lvl}, but ${v.id} is level ${v.level}`);
      if (!v.llLists.includes(L.class)) v.llLists.push(L.class);
      count++;
    }
  }
  llClassLists.push({ class: L.class, source: L.source, spells: count });
}
for (const v of versions) v.llLists.sort();

/* ---------------- validation ---------------- */
// Header fields: collapse stray whitespace from sources ("1 реакция,  совершаемая ").
const squash = (s) => (s == null ? null : s.replace(/\s+/g, ' ').trim());
for (const v of versions) for (const f of ['name', 'time', 'range', 'duration', 'comps']) v[f] = { en: squash(v[f].en), ru: squash(v[f].ru) };
for (const v of versions) {
  for (const lang of ['en', 'ru']) {
    const t = v.text[lang];
    if (t == null) continue;
    if (/\{@|\[\[|&Reference|@UUID/.test(t)) warn(`unrendered markup in ${v.id} ${lang}`);
    if (/DC DC|percent percent/.test(t)) warn(`doubled word in ${v.id} ${lang}`);
  }
  for (const d of v.damage) if (!DAMAGE_TYPES.includes(d)) warn(`unknown damage type ${d} in ${v.id}`);
  if (!SCHOOLS[v.school]) warn(`unknown school ${v.school} in ${v.id}`);
}
const missingRu = versions.filter((v) => !v.text.ru);
const missingSubRu = [...subclassIndex.values()].filter((s) => !s.ru);

/* ---------------- output ---------------- */
const classCodes = [...new Set(versions.flatMap((v) => [...v.classes, ...v.expanded, ...v.subclasses.map((x) => x.split(':')[0])]))];
for (const c of classCodes) if (!CLASS_RU[c]) warn(`no Russian name for class ${c}`);
const sources = [
  ...Object.entries(OFFICIAL_SOURCES).map(([code, s], i) => ({ code, en: s.en, homebrew: false, year: s.year, url: null, sort: i })),
  {
    code: LASERLLAMA.code, en: LASERLLAMA.en, homebrew: true, year: null, url: LASERLLAMA.url, sort: 100,
    author: LASERLLAMA.author,
    notes: {
      en: llData.notes.filter((n) => n.html).map((n) => ({ title: n.title ?? null, html: sanitize(n.html) })),
      ru: llNotesRu ? llNotesRu.map((n) => ({ title: n.title ?? null, html: sanitize(n.html) })) : null,
    },
  },
];
const subRu = readJsonOpt('data/translations/subclasses.ru.json');
const { casters, multiclassSlots } = buildCasters(ROOT);
for (const c of casters) if (c.subclass && !subclassIndex.has(c.subclass)) warn(`caster table for unknown subclass ${c.subclass}`);
const payload = {
  sources,
  classes: classCodes.sort().map((c) => ({ code: c, en: c, ru: CLASS_RU[c] ?? c, homebrew: !CLASS_RU[c] || ['Magus', 'Psion', 'Shaman', 'Vessel'].includes(c) })),
  subclasses: [...subclassIndex.values()].map((s) => ({ ...s, ru: s.ru ?? subRu[s.id] ?? null })).sort((a, b) => a.id.localeCompare(b.id)),
  llClassLists,
  casters,
  multiclassSlots,
  spells: versions.sort((a, b) => a.id.localeCompare(b.id)),
};
const version = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
fs.mkdirSync(path.join(ROOT, 'data/build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/build/spells.json'), JSON.stringify({ version, ...payload }));

console.log(`official: ${byId.size}, laserllama: ${llData.spells.length} (alt ${relations.alt}, same ${relations.same}, new ${relations.new}; not-marked-but-changed ${relations.changed})`);
console.log(`versions: ${versions.length}, subclasses: ${subclassIndex.size}, version ${version}`);
for (const l of llClassLists) console.log(`Laserllama class list ${l.class}: ${l.spells} spells (${l.source})`);
console.log(`spellcasting tables: ${casters.map((c) => `${c.key} (${c.progression})`).join(', ')}`);
console.log(`missing RU text: ${missingRu.length}${missingRu.length ? ` (${missingRu.filter((v) => !v.homebrew).map((v) => v.id).join(', ') || 'only Laserllama'})` : ''}`);
console.log(`subclasses without RU name: ${missingSubRu.filter((s) => !subRu[s.id]).length}`);
if (problems.length) console.log(`\n${problems.length} notes:\n- ${problems.join('\n- ')}`);
