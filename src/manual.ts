// The sheet of a character created on the site: computed from what the site knows (classes: proficiency bonus, hit
// dice and hit points, saving throws, proficiencies, spellcasting; spells; ability scores) plus what the player typed
// in (race, background, equipment, features). Same Sheet as for Foundry characters: the page and the PDF are shared.
import type { CasterInfo, Dataset, Version } from './types';
import type { CharClass } from './lists';
import { optionsOf, type Character } from './characters';
import {
  ABILITIES, ABILITY, SIZES, SKILL_DEFS, XP_LEVELS, abilityMod, buildSheet, genericCaster, signed,
  type Ability, type Sheet, type SheetAttack, type SheetCaster, type SheetFeatureGroup, type SheetItem, type SheetResource, type SheetSkill, type SheetSpell,
} from './sheet';
import { alwaysPrepared, casterFor, classLimits, maxSpellLevel, slotSummaryFor } from './casting';
import { subclassLabel } from './listview';
import { SCHOOL } from './i18n';
import { LL_CLASSES, classRules, classSaves, isCustom, normalizeManual, type FeatureGroup, type ManualClass, type ManualData } from './manualdata';

/** Name of a class of the character: the site's class, a Laserllama class (with or without a document) or a typed-in one. */
export function mClassName(data: Dataset, c: Pick<ManualClass, 'cls' | 'custom'>): string {
  if (c.custom || isCustom(c.cls)) return c.custom?.name.trim() || 'Свой класс';
  if (c.cls.startsWith('LL:')) {
    const code = c.cls.slice(3);
    return `${data.classes.find((x) => x.code === code)?.ru ?? LL_CLASSES[code]?.ru ?? code} (Laserllama)`;
  }
  return data.classes.find((x) => x.code === c.cls)?.ru ?? c.cls;
}

export interface SubOption { id: string; label: string; en: string }
/** Subclasses to choose from: all subclasses of the 2014 books, or those of a Laserllama class document. */
export function subOptions(data: Dataset, cls: string): SubOption[] {
  if (isCustom(cls)) return [];
  if (cls.startsWith('LL:')) return (LL_CLASSES[cls.slice(3)]?.subclasses ?? []).map((x) => ({ id: x.id, label: x.ru, en: x.en }));
  return (data.subclassesAll ?? data.subclasses).filter((x) => x.class === cls)
    .map((x) => ({ id: x.id, label: x.ru ?? x.en, en: x.en }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function mSubName(data: Dataset, c: Pick<ManualClass, 'cls' | 'sub' | 'subName'>): string | null {
  if (!c.sub) return null;
  if (c.sub === 'custom') return c.subName?.trim() || 'свой подкласс';
  return subOptions(data, c.cls).find((x) => x.id === c.sub)?.label ?? subclassLabel(data, c.sub);
}

/** The sheet of any character: from the Foundry file or from the data typed in on the site. */
export const sheetOf = (data: Dataset, ch: Character): Sheet => (ch.manual ? buildManualSheet(data, ch) : buildSheet(data, ch));

export const FEATURE_GROUPS: { id: FeatureGroup; label: string }[] = [
  { id: 'race', label: 'Раса' }, { id: 'class', label: 'Класс' }, { id: 'background', label: 'Предыстория' },
  { id: 'feat', label: 'Черта' }, { id: 'other', label: 'Прочее' },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text typed by the player -> paragraphs. */
export const textHtml = (t: string) => t.trim().split(/\n\s*\n|\n/).filter((x) => x.trim()).map((p) => `<p>${esc(p.trim())}</p>`).join('');
const list = (t: string) => t.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const uniq = (a: string[]) => [...new Set(a)];

/** Version of a spell entry (falls back to the other version if the data changed). */
export function manualSpellVersion(data: Dataset, id: string, v: 'o' | 'l'): Version | null {
  const all = data.spells.filter((x) => x.group === id);
  return all.find((x) => x.homebrew === (v === 'l')) ?? all[0] ?? null;
}

/** Hit die of a class of the character (typed in, by the class, or d8 for unknown classes). */
export const hitDie = (c: { cls: string; hd: number | null }) => c.hd ?? classRules(c.cls)?.hd ?? 8;

export function buildManualSheet(data: Dataset, ch: Character): Sheet {
  const m: ManualData = normalizeManual(ch.manual);
  const opts = optionsOf(ch);
  const warnings: string[] = [];
  const classes = m.classes.filter((c) => c.cls).map((c) => ({ ...c, level: Math.max(1, Math.min(20, Math.round(c.level) || 1)) }));
  const level = Math.max(1, classes.reduce((n, c) => n + c.level, 0));
  if (!classes.length) warnings.push('Класс не выбран — уровень считается равным 1.');
  if (level > 20) warnings.push('Сумма уровней классов больше 20.');
  const prof = Math.floor((Math.min(level, 20) + 7) / 4);
  const score = (k: Ability) => Math.max(1, Math.min(30, Math.round(m.abilities[k]) || 10));
  const mods = Object.fromEntries(ABILITIES.map((k) => [k, abilityMod(score(k))])) as Record<Ability, number>;
  const first = classes[0] ?? null;
  const rules = first ? classRules(first.cls) : null;
  const lvlOf = (base: string) => classes.filter((c) => c.cls.replace(/^LL:/, '') === base).reduce((n, c) => n + c.level, 0);

  /* saving throws and skills */
  const saveSet = new Set<string>(m.saves ?? (first ? classSaves(first) : []));
  if (first && !rules && !first.custom && !m.saves) warnings.push(`${mClassName(data, first)}: правил класса на сайте нет — отметьте спасброски и кость хитов сами.`);
  const abilities = ABILITIES.map((k) => ({
    key: k, name: ABILITY[k].name, short: ABILITY[k].short, score: score(k), mod: mods[k], saveProf: saveSet.has(k),
    save: mods[k] + (saveSet.has(k) ? prof : 0),
  }));
  // Bard's Jack of All Trades (2nd level): half the proficiency bonus to checks without proficiency, initiative included.
  const jack = lvlOf('Bard') >= 2;
  const skills: SheetSkill[] = SKILL_DEFS.map((d) => {
    const abFix = ch.skillAb?.[d.key];
    const ab = abFix && (ABILITIES as readonly string[]).includes(abFix) ? (abFix as Ability) : d.ability;
    let p = ch.skills?.[d.key] ?? 0;
    if (p === 0 && jack) p = 0.5;
    const total = mods[ab] + Math.floor(prof * p);
    return { key: d.key, name: d.name, ability: ab, prof: p, total, passive: 10 + total, changed: false };
  });
  const skill = (k: string) => skills.find((s) => s.key === k)!;

  /* armor class */
  const barb = lvlOf('Barbarian'), monk = lvlOf('Monk');
  const draconic = classes.some((c) => c.cls === 'Sorcerer' && /Draconic/i.test(c.sub ?? ''));
  let ac: number;
  let acNote: string;
  const dex = mods.dex;
  if (m.ac.mode === 'manual' && m.ac.manual != null) { ac = m.ac.manual; acNote = 'своё значение'; } else if (m.ac.mode === 'armor') {
    const cap = m.ac.armorType === 'heavy' ? 0 : m.ac.armorType === 'medium' ? 2 : null;
    ac = (Math.round(m.ac.armorBase) || 10) + (cap == null ? dex : Math.min(dex, cap));
    acNote = m.ac.armorName.trim() || { light: 'лёгкий доспех', medium: 'средний доспех', heavy: 'тяжёлый доспех' }[m.ac.armorType];
  } else {
    // Without armor: the first class's Unarmored Defense, or Draconic Resilience.
    const order = classes.map((c) => c.cls.replace(/^LL:/, ''));
    const ud = order.find((x) => x === 'Barbarian' || x === 'Monk');
    if (ud === 'Barbarian') { ac = 10 + dex + mods.con; acNote = 'защита без доспехов (варвар)'; } else if (ud === 'Monk' && !m.ac.shield) {
      ac = 10 + dex + mods.wis; acNote = 'защита без доспехов (монах)';
    } else if (draconic) { ac = 13 + dex; acNote = 'драконья устойчивость'; } else { ac = 10 + dex; acNote = 'без доспехов'; }
  }
  if (m.ac.mode !== 'manual' && m.ac.shield) { ac += 2; acNote += ', щит'; }
  if (m.ac.mode !== 'manual' && m.ac.bonus) { ac += m.ac.bonus; acNote += `, ${signed(m.ac.bonus)}`; }

  /* initiative and speed */
  const init = dex + (jack ? Math.floor(prof / 2) : 0);
  const noArmor = m.ac.mode === 'auto';
  let speed = Math.max(0, Math.round(m.speed) || 0);
  const speedNotes: string[] = [];
  if (monk >= 2 && noArmor && !m.ac.shield) {
    const add = monk >= 18 ? 30 : monk >= 14 ? 25 : monk >= 10 ? 20 : monk >= 6 ? 15 : 10;
    speed += add;
    speedNotes.push(`с движением без доспехов +${add} фт.`);
  }
  if (barb >= 5 && !(m.ac.mode === 'armor' && m.ac.armorType === 'heavy')) { speed += 10; speedNotes.push('с быстрым передвижением +10 фт.'); }

  /* hit points and hit dice */
  let hpMax: number;
  const drac = classes.filter((c) => c.cls === 'Sorcerer' && /Draconic/i.test(c.sub ?? '')).reduce((n, c) => n + c.level, 0);
  if (m.hp.mode === 'manual' && m.hp.manual != null) hpMax = m.hp.manual;
  else {
    hpMax = 0;
    classes.forEach((c, i) => {
      const faces = hitDie(c);
      for (let l = 1; l <= c.level; l++) {
        const roll = (i === 0 && l === 1) || m.hp.mode === 'max' ? faces : faces / 2 + 1;
        hpMax += Math.max(1, roll + mods.con);
      }
    });
    if (!classes.length) hpMax = Math.max(1, 8 + mods.con);
    hpMax += level * (m.hp.perLevel || 0) + drac;
  }
  const hitDice = classes.map((c) => ({ die: `к${hitDie(c)}`, count: c.level, used: 0 }));

  /* proficiencies (the first class fully, the others by the multiclass table) */
  const armorProf: string[] = [];
  const weaponProf: string[] = [];
  const toolNames: string[] = [];
  classes.forEach((c, i) => {
    if (c.custom) {
      if (i === 0) { armorProf.push(...list(c.custom.armor)); weaponProf.push(...list(c.custom.weapons)); }
      return;
    }
    const r = classRules(c.cls);
    if (!r) return;
    if (i === 0) { armorProf.push(...r.armor); weaponProf.push(...r.weapons); if (r.tools) toolNames.push(r.tools); } else {
      armorProf.push(...r.multi.armor); weaponProf.push(...r.multi.weapons);
      if (r.multi.note && /инструмент/.test(r.multi.note)) toolNames.push(r.multi.note.replace(/^.*?(воровские|один музыкальный)/, '$1'));
    }
  });
  armorProf.push(...list(m.armorExtra));
  weaponProf.push(...list(m.weaponExtra));
  toolNames.push(...list(m.tools));
  const tools = uniq(toolNames).map((name) => ({ name, ability: 'int' as Ability, total: null }));

  /* attacks */
  const attacks: SheetAttack[] = m.weapons.filter((w) => w.name.trim()).map((w) => {
    const ab: Ability = w.ability === 'fin' ? (mods.dex >= mods.str ? 'dex' : 'str') : w.ability;
    const magic = Math.round(w.magic) || 0;
    const dmgMod = mods[ab] + magic;
    const dice = w.dice.trim().replace(/d/gi, 'к');
    return {
      name: w.name.trim(), bonus: signed(mods[ab] + (w.prof ? prof : 0) + magic),
      damage: dice ? `${dice}${dmgMod ? ` ${signed(dmgMod).replace('−', '− ').replace('+', '+ ')}` : ''}${w.type.trim() ? ` ${w.type.trim()}` : ''}` : '',
      notes: [w.notes.trim(), w.prof ? '' : 'нет владения'].filter(Boolean).join(', '),
    };
  });

  /* spellcasting */
  const casterEntries: { c: CharClass; info: CasterInfo | null; name: string }[] = [];
  for (const c of classes) {
    const cc: CharClass = { cls: c.cls, level: c.level, sub: c.sub, mod: null };
    let info: CasterInfo | null;
    if (c.custom) info = c.custom.caster === 'none' ? null : genericCaster(c.custom.caster, c.custom.ability, data);
    else {
      info = casterFor(data, cc).info;
      // A Laserllama subclass that is a third-caster in the official class too (Arcane Trickster, Eldritch Knight).
      if (!info && c.sub && c.sub !== 'custom') info = data.casters.find((x) => x.key === `${c.cls.replace(/^LL:/, '')}:${c.sub!.split(':').pop()}`) ?? null;
    }
    if (!info) continue;
    cc.mod = mods[info.ability];
    casterEntries.push({ c: cc, info, name: `${mClassName(data, c)}${c.sub && info.subclass ? ` (${mSubName(data, c)})` : ''}` });
  }
  const slotSum = slotSummaryFor(casterEntries.map(({ c, info }) => ({ c, info })), data.multiclassSlots);
  const casters: SheetCaster[] = casterEntries.map(({ c, info, name }) => {
    const lim = classLimits(info!, c);
    return {
      name, ability: info!.ability, dc: 8 + prof + mods[info!.ability], attack: prof + mods[info!.ability],
      prepared: lim.prepared ?? null,
      preparedRule: lim.preparedRule ? `${lim.preparedRule === 'half' ? 'пол-уровня' : 'уровень'} класса + мод. ${ABILITY[info!.ability].short}` : '',
      cantrips: lim.cantrips ?? null, known: lim.known ?? null, maxLevel: maxSpellLevel(info!, c.level),
    };
  });
  const lang = opts.spellLang;
  const spells: SheetSpell[] = [];
  const missing: string[] = [];
  for (const e of m.spells) {
    const v = manualSpellVersion(data, e.id, e.v);
    if (!v) { missing.push(e.id); continue; }
    const key = `${e.id}|${e.v}`;
    const baseAlways = casterEntries.some(({ c, info }) => alwaysPrepared(info, v, c));
    const always = ch.always?.[key] ?? baseAlways;
    const pick = (f: 'time' | 'range' | 'duration' | 'comps' | 'text') => (lang === 'ru' ? v[f].ru ?? v[f].en : v[f].en);
    const nm = lang === 'ru' ? v.name.ru ?? v.name.en : v.name.en;
    const other = lang === 'ru' ? v.name.en : v.name.ru ?? '';
    spells.push({
      id: key, level: v.level, name: nm, other: other && other !== nm ? other : '', school: SCHOOL[v.school]?.[lang] ?? v.school,
      time: pick('time'), range: pick('range'), duration: pick('duration'), comps: pick('comps').replace(/\s*\(.*$/, ''),
      conc: v.concentration, ritual: v.ritual, always, alwaysChanged: ch.always?.[key] != null && ch.always[key] !== baseAlways,
      html: pick('text'), source: v.homebrew ? 'Laserllama' : data.sources.find((x) => x.code === v.source)?.en ?? v.source,
      homebrew: v.homebrew, site: { id: v.group, ll: v.homebrew }, mode: 'prepared',
    });
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'ru'));
  if (missing.length) warnings.push(`Заклинаний больше нет в данных сайта: ${missing.join(', ')}.`);
  const maxCast = Math.max(-1, ...casters.map((k) => k.maxLevel), slotSum.pact ? slotSum.pact.level : -1, ...slotSum.slots.map((n, i) => (n ? i + 1 : -1)));
  const tooHigh = spells.filter((s) => casters.length && s.level > maxCast && !s.always).map((s) => s.name);
  if (tooHigh.length) warnings.push(`Уровень заклинаний выше, чем персонаж может накладывать: ${tooHigh.join(', ')}.`);

  /* features and resources */
  const groups = new Map<string, SheetFeatureGroup>();
  const group = (title: string) => {
    if (!groups.has(title)) groups.set(title, { title, intro: '', items: [] });
    return groups.get(title)!;
  };
  const raceTitle = m.race.trim() ? `Раса: ${m.race.trim()}` : 'Раса';
  const bgTitle = m.background.trim() ? `Предыстория: ${m.background.trim()}` : 'Предыстория';
  const classTitle = first ? `Класс: ${mClassName(data, first)} ${first.level}` : 'Класс';
  const titles: Record<FeatureGroup, string> = { race: raceTitle, class: classTitle, background: bgTitle, feat: 'Черты', other: 'Прочие умения' };
  const resources: SheetResource[] = [];
  const hidden = new Set(ch.hiddenRes ?? []);
  for (const f of m.features) {
    if (!f.name.trim() && !f.text.trim()) continue;
    const uses = Math.max(0, Math.round(f.uses) || 0);
    group(titles[f.group] ?? titles.other).items.push({
      id: f.id, name: f.name.trim() || 'Без названия', note: '', html: textHtml(f.text), usesMax: hidden.has(f.id) ? 0 : uses,
      uses: uses && !hidden.has(f.id) ? `${uses}${f.per ? ` / ${f.per}` : ''}` : '',
    });
    if (uses) resources.push({ id: f.id, name: f.name.trim() || 'Без названия', max: uses, per: f.per, hidden: hidden.has(f.id) });
  }
  const extra = [
    m.extra.san != null ? { id: 'x-san', name: `Здравомыслие ${m.extra.san} (${signed(abilityMod(m.extra.san))})`, html: '<p>Дополнительная характеристика («Руководство мастера», с. 264): спасброски от безумия, проверки вместо Интеллекта при встрече с непостижимым.</p>' } : null,
    m.extra.hon != null ? { id: 'x-hon', name: `Честь ${m.extra.hon} (${signed(abilityMod(m.extra.hon))})`, html: '<p>Дополнительная характеристика («Руководство мастера», с. 264): проверки в общении, когда важны кодекс и этикет; спасброски, чтобы не совершить бесчестный поступок. Не растёт от увеличения характеристик.</p>' } : null,
  ].filter(Boolean) as { id: string; name: string; html: string }[];
  for (const x of extra) group('Дополнительные характеристики').items.push({ ...x, note: '', uses: '', usesMax: 0 });
  const order = (t: string) => (t.startsWith('Раса') ? 0 : t.startsWith('Класс') ? 1 : t.startsWith('Предыстория') ? 3 : t === 'Черты' ? 4 : t.startsWith('Доп') ? 6 : 5);
  const features = [...groups.values()].filter((g) => g.items.length).sort((a, b) => order(a.title) - order(b.title));

  /* equipment */
  const inventory: SheetItem[] = m.items.filter((x) => x.name.trim()).map((x) => {
    const qty = Math.max(0, Math.round(x.qty) || 0) || 1;
    return { id: x.id, name: x.name.trim(), qty, weight: Math.round((Number(x.weight) || 0) * qty * 100) / 100, depth: 0, notes: x.notes.trim(), equipped: false };
  });
  const carried = Math.round(inventory.reduce((n, x) => n + x.weight, 0) * 10) / 10;
  const size = SIZES[m.size] ?? SIZES.med;

  /* details */
  const notes = ch.notes ?? {};
  const classLine = classes.map((c) => `${mClassName(data, c)} ${c.level}${c.sub ? ` (${mSubName(data, c)})` : ''}`).join(' / ');
  const listClasses: CharClass[] = classes.filter((c) => !c.custom && !isCustom(c.cls)).map((c) => {
    const e = casterEntries.find((x) => x.c.cls === c.cls);
    return { cls: c.cls, level: c.level, sub: c.sub === 'custom' ? null : c.sub, mod: e?.c.mod ?? null };
  });
  const lv = Math.min(level, 20);

  return {
    name: ch.name || 'Без имени',
    level, prof, classLine,
    classes: classes.map((c) => ({ name: mClassName(data, c), level: c.level, sub: mSubName(data, c), hd: `к${hitDie(c)}`, hdUsed: 0 })),
    race: m.race.trim(), background: m.background.trim(), alignment: notes.alignment ?? '', player: notes.player ?? '',
    xp: Math.max(0, Math.round(m.xp) || 0), xpNext: lv < 20 ? XP_LEVELS[lv] : null,
    size: size.name,
    abilities, skills, tools,
    passive: { perception: skill('prc').passive, insight: skill('ins').passive, investigation: skill('inv').passive },
    ac, acNote, init, speed: [`${speed} фт.`, ...speedNotes].join(', '),
    hp: { max: Math.max(1, Math.round(hpMax)), value: Math.max(1, Math.round(hpMax)), temp: 0 },
    hitDice,
    senses: m.darkvision > 0 ? [`Тёмное зрение ${m.darkvision} фт.`] : [],
    defenses: list(m.defenses).length ? [{ label: 'Сопротивления и иммунитеты', values: list(m.defenses) }] : [],
    languages: list(m.languages), armorProf: uniq(armorProf), weaponProf: uniq(weaponProf),
    attacks, resources, features, inventory,
    currency: { ...m.coins },
    carried, capacity: score('str') * 15 * size.carry,
    attunement: { max: 3, items: [] },
    casters, listClasses, slots: [...slotSum.slots], pact: slotSum.pact ? { slots: slotSum.pact.slots, level: slotSum.pact.level } : null, spells,
    details: {
      player: notes.player ?? '', alignment: notes.alignment ?? '',
      traits: notes.traits ?? '', ideals: notes.ideals ?? '', bonds: notes.bonds ?? '', flaws: notes.flaws ?? '',
      appearance: notes.appearance ?? '', backstory: notes.backstory ?? '', allies: notes.allies ?? '', notes: notes.notes ?? '',
      ...m.looks, gender: '', faith: '',
    },
    warnings: [...new Set(warnings)],
  };
}

/** What is not on the site yet and is typed in by hand: empty fields before printing (they stay blank on the sheet). */
export function manualTodo(ch: Character): string[] {
  const m = normalizeManual(ch.manual);
  const out: string[] = [];
  if (!m.classes.length) out.push('класс');
  if (!m.race.trim()) out.push('раса');
  if (!m.background.trim()) out.push('предыстория');
  if (!Object.keys(ch.skills ?? {}).length) out.push('владение навыками');
  if (!m.features.some((f) => f.group === 'race')) out.push('умения расы');
  if (!m.features.some((f) => f.group === 'class')) out.push('умения класса');
  if (!m.features.some((f) => f.group === 'background')) out.push('умение предыстории');
  if (!m.weapons.length) out.push('оружие');
  if (!m.items.length) out.push('снаряжение');
  if (!ch.notes?.alignment) out.push('мировоззрение');
  return out;
}
