// Character sheet values computed from a Foundry VTT dnd5e actor (rules of D&D 5e 2014, as the dnd5e system does them).
// Pure functions: used by the character page and by the PDF.
import type { CasterInfo, Dataset, Lang, Version } from './types';
import type { CharClass } from './lists';
import type { FActor, FEffect, FItem } from './foundry';
import { optionsOf, type Character, type SheetNotes } from './characters';
import { casterFor, classLimits, maxSpellLevel, slotSummaryFor } from './casting';
import { LL_PREFIX, norm } from './model';
import { SCHOOL } from './i18n';
import { plural } from './listview';

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ---------------- dictionaries (ttg.club terms) ---------------- */

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = typeof ABILITIES[number];
export const ABILITY: Record<Ability, { name: string; short: string; gen: string }> = {
  str: { name: 'Сила', short: 'СИЛ', gen: 'Силы' },
  dex: { name: 'Ловкость', short: 'ЛОВ', gen: 'Ловкости' },
  con: { name: 'Телосложение', short: 'ТЕЛ', gen: 'Телосложения' },
  int: { name: 'Интеллект', short: 'ИНТ', gen: 'Интеллекта' },
  wis: { name: 'Мудрость', short: 'МДР', gen: 'Мудрости' },
  cha: { name: 'Харизма', short: 'ХАР', gen: 'Харизмы' },
};

const SKILL_DEFS: { key: string; name: string; ability: Ability }[] = [
  { key: 'acr', name: 'Акробатика', ability: 'dex' }, { key: 'inv', name: 'Анализ', ability: 'int' },
  { key: 'ath', name: 'Атлетика', ability: 'str' }, { key: 'prc', name: 'Восприятие', ability: 'wis' },
  { key: 'sur', name: 'Выживание', ability: 'wis' }, { key: 'prf', name: 'Выступление', ability: 'cha' },
  { key: 'itm', name: 'Запугивание', ability: 'cha' }, { key: 'his', name: 'История', ability: 'int' },
  { key: 'slt', name: 'Ловкость рук', ability: 'dex' }, { key: 'arc', name: 'Магия', ability: 'int' },
  { key: 'med', name: 'Медицина', ability: 'wis' }, { key: 'dec', name: 'Обман', ability: 'cha' },
  { key: 'nat', name: 'Природа', ability: 'int' }, { key: 'ins', name: 'Проницательность', ability: 'wis' },
  { key: 'rel', name: 'Религия', ability: 'int' }, { key: 'ste', name: 'Скрытность', ability: 'dex' },
  { key: 'per', name: 'Убеждение', ability: 'cha' }, { key: 'ani', name: 'Уход за животными', ability: 'wis' },
];

const TOOLS: Record<string, string> = {
  art: 'Инструменты ремесленника', alchemist: 'Инструменты алхимика', brewer: 'Инструменты пивовара', calligrapher: 'Инструменты каллиграфа',
  carpenter: 'Инструменты плотника', cartographer: 'Инструменты картографа', cobbler: 'Инструменты сапожника', cook: 'Инструменты повара',
  glassblower: 'Инструменты стеклодува', jeweler: 'Инструменты ювелира', leatherworker: 'Инструменты кожевника', mason: 'Инструменты каменщика',
  painter: 'Инструменты художника', potter: 'Инструменты гончара', smith: 'Инструменты кузнеца', tinker: 'Инструменты жестянщика',
  weaver: 'Инструменты ткача', woodcarver: 'Инструменты резчика по дереву', disg: 'Набор для грима', forg: 'Набор для фальсификации',
  herb: 'Набор травника', navg: 'Инструменты навигатора', pois: 'Набор отравителя', thief: 'Воровские инструменты',
  game: 'Игровой набор', chess: 'Шахматы драконов', dice: 'Кости', card: 'Карты', music: 'Музыкальный инструмент',
  bagpipes: 'Волынка', drum: 'Барабан', dulcimer: 'Цимбалы', flute: 'Флейта', horn: 'Рожок', lute: 'Лютня', lyre: 'Лира',
  panflute: 'Свирель', shawm: 'Шалмей', viol: 'Виола', vehicle: 'Транспорт', land: 'Наземный транспорт', water: 'Водный транспорт',
  air: 'Воздушный транспорт', space: 'Космический транспорт',
};

const LANGUAGES: Record<string, string> = {
  common: 'Общий', dwarvish: 'Дварфийский', elvish: 'Эльфийский', giant: 'Великаний', gnomish: 'Гномий', goblin: 'Гоблинский',
  halfling: 'Язык полуросликов', orc: 'Орочий', aarakocra: 'Ааракокра', abyssal: 'Язык Бездны', celestial: 'Небесный',
  deep: 'Глубинная речь', draconic: 'Драконий', gith: 'Гитский', gnoll: 'Гноллий', infernal: 'Инфернальный', primordial: 'Первичный',
  aquan: 'Акван', auran: 'Ауран', ignan: 'Игнан', terran: 'Терран', sylvan: 'Сильван', undercommon: 'Подземный общий',
  druidic: 'Друидический', cant: 'Воровской жаргон', sign: 'Язык жестов',
};

export const DAMAGE_RU: Record<string, string> = {
  acid: 'кислота', bludgeoning: 'дробящий', cold: 'холод', fire: 'огонь', force: 'силовое поле', lightning: 'электричество',
  necrotic: 'некротическая энергия', piercing: 'колющий', poison: 'яд', psychic: 'психическая энергия', radiant: 'излучение',
  slashing: 'рубящий', thunder: 'звук', healing: 'лечение', temphp: 'временные хиты',
};

const CONDITIONS: Record<string, string> = {
  blinded: 'ослепление', charmed: 'очарование', deafened: 'глухота', diseased: 'болезни', exhaustion: 'истощение', frightened: 'испуг',
  grappled: 'захват', incapacitated: 'недееспособность', invisible: 'невидимость', paralyzed: 'паралич', petrified: 'окаменение',
  poisoned: 'отравление', prone: 'сбивание с ног', restrained: 'опутанность', stunned: 'ошеломление', unconscious: 'бессознательность',
};

const WEAPON_PROPS: Record<string, string> = {
  ada: 'адамантиновое', amm: 'боеприпасы', fin: 'фехтовальное', fir: 'огнестрельное', foc: 'фокусировка', hvy: 'тяжёлое', lgt: 'лёгкое',
  lod: 'перезарядка', mgc: 'магическое', rch: 'досягаемость', rel: 'перезарядка', ret: 'возвращается', sil: 'посеребрённое',
  spc: 'особое', thr: 'метательное', two: 'двуручное', ver: 'универсальное',
};

const WEAPONS: Record<string, string> = {
  club: 'дубинка', dagger: 'кинжал', greatclub: 'палица', handaxe: 'ручной топор', javelin: 'метательное копьё', lighthammer: 'лёгкий молот',
  mace: 'булава', quarterstaff: 'боевой посох', sickle: 'серп', spear: 'копьё', lightcrossbow: 'лёгкий арбалет', dart: 'дротик',
  shortbow: 'короткий лук', sling: 'праща', battleaxe: 'боевой топор', flail: 'цеп', glaive: 'глефа', greataxe: 'секира',
  greatsword: 'двуручный меч', halberd: 'алебарда', lance: 'длинное копьё', longsword: 'длинный меч', maul: 'молот', morningstar: 'моргенштерн',
  pike: 'пика', rapier: 'рапира', scimitar: 'скимитар', shortsword: 'короткий меч', trident: 'трезубец', warpick: 'боевая кирка',
  warhammer: 'боевой молот', whip: 'кнут', blowgun: 'духовая трубка', handcrossbow: 'ручной арбалет', heavycrossbow: 'тяжёлый арбалет',
  longbow: 'длинный лук', net: 'сеть',
};

const ARMOR_PROF: Record<string, string> = { lgt: 'лёгкие доспехи', med: 'средние доспехи', hvy: 'тяжёлые доспехи', shl: 'щиты' };
const WEAPON_PROF: Record<string, string> = { sim: 'простое оружие', mar: 'воинское оружие' };

const SIZES: Record<string, { name: string; carry: number }> = {
  tiny: { name: 'Крошечный', carry: 0.5 }, sm: { name: 'Маленький', carry: 1 }, med: { name: 'Средний', carry: 1 },
  lg: { name: 'Большой', carry: 2 }, huge: { name: 'Огромный', carry: 4 }, grg: { name: 'Громадный', carry: 8 },
};

const ALIGNMENTS: [RegExp, string][] = [
  [/^lawful good$|^lg$/i, 'Законно-добрый'], [/^neutral good$|^ng$/i, 'Нейтрально-добрый'], [/^chaotic good$|^cg$/i, 'Хаотично-добрый'],
  [/^lawful neutral$|^ln$/i, 'Законно-нейтральный'], [/^(true )?neutral$|^n$/i, 'Нейтральный'], [/^chaotic neutral$|^cn$/i, 'Хаотично-нейтральный'],
  [/^lawful evil$|^le$/i, 'Законно-злой'], [/^neutral evil$|^ne$/i, 'Нейтрально-злой'], [/^chaotic evil$|^ce$/i, 'Хаотично-злой'],
  [/^unaligned$/i, 'Без мировоззрения'],
];

const SCHOOL_KEY: Record<string, string> = { abj: 'A', con: 'C', div: 'D', enc: 'E', evo: 'V', ill: 'I', nec: 'N', trs: 'T' };

const XP_LEVELS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

/* ---------------- helpers ---------------- */

export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : d);
const get = (o: any, path: string) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
const dice = (s: string, ru = true) => (ru ? s.replace(/(\d*)d(\d+)/g, '$1к$2') : s);
const ft = (n: number) => `${n} фт.`;

/** Safe evaluation of a dnd5e formula ('@prof', '1 + @abilities.wis.mod', 'max(1, @abilities.cha.mod)'): no eval. Dice -> null. */
export function evalFormula(src: unknown, refs: (path: string) => number | null): number | null {
  if (typeof src === 'number') return Number.isFinite(src) ? src : null;
  if (typeof src !== 'string') return null;
  let s = src.trim();
  if (!s) return null;
  let bad = false;
  s = s.replace(/@([\w.-]+)/g, (_, p: string) => {
    const v = refs(p);
    if (v == null) bad = true;
    return `(${v ?? 0})`;
  });
  if (bad || /\d*d\d/i.test(s)) return null;
  const tokens = s.match(/\d+(?:\.\d+)?|[a-z]+|[-+*/(),]/gi);
  if (!tokens || tokens.join('') !== s.replace(/\s+/g, '')) return null;
  let i = 0;
  const peek = () => tokens[i];
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = tokens[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = tokens[i++] === '*' ? v * factor() : v / factor();
    return v;
  };
  const factor = (): number => {
    const t = tokens[i++];
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') { const v = expr(); if (tokens[i++] !== ')') throw new Error('paren'); return v; }
    if (/^[a-z]+$/i.test(t ?? '')) {
      const f = t.toLowerCase();
      if (tokens[i++] !== '(') throw new Error('fn');
      const args = [expr()];
      while (peek() === ',') { i++; args.push(expr()); }
      if (tokens[i++] !== ')') throw new Error('fn)');
      const fns: Record<string, (...a: number[]) => number> = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs };
      if (!fns[f]) throw new Error('fn?');
      return fns[f](...args);
    }
    const v = Number(t);
    if (!Number.isFinite(v)) throw new Error('num');
    return v;
  };
  try {
    const v = expr();
    return i === tokens.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/* ---------------- active effects ---------------- */

function setPath(o: any, path: string, value: unknown) {
  const keys = path.split('.');
  let cur = o;
  for (const k of keys.slice(0, -1)) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

/** Item effects that dnd5e applies to the actor: transferred, enabled, and the item is equipped/attuned if it must be. */
function activeEffects(actor: FActor): FEffect[] {
  const out = actor.effects.filter((e) => !e.disabled);
  for (const it of actor.items) {
    const s = it.system ?? {};
    if ((it.type === 'weapon' || it.type === 'equipment') && s.equipped === false) continue;
    if ((s.attunement === 'required' || s.attunement === 1) && !s.attuned) continue;
    for (const e of it.effects ?? []) if (e.transfer && !e.disabled) out.push(e);
  }
  return out;
}

function applyEffects(sys: any, effects: FEffect[]) {
  const changes = effects.flatMap((e) => e.changes ?? []).filter((c) => c.key.startsWith('system.'));
  for (const c of changes) {
    const path = c.key.slice('system.'.length);
    const cur = get(sys, path);
    const raw = c.value;
    const n = Number(raw);
    const isNum = raw.trim() !== '' && Number.isFinite(n);
    let next: unknown = cur;
    switch (c.mode) {
      case 1: if (typeof cur === 'number' && isNum) next = cur * n; break;
      case 2:
        if (Array.isArray(cur)) next = [...cur, ...raw.split(',').map((x) => x.trim()).filter(Boolean)];
        else if (typeof cur === 'number' || cur == null) next = isNum ? (num(cur) + n) : (cur == null ? raw : cur);
        else if (typeof cur === 'string') next = cur.trim() ? `${cur} + ${raw}` : raw;
        break;
      case 3: if (isNum) next = cur == null ? n : Math.min(num(cur), n); break;
      case 4: if (isNum) next = cur == null ? n : Math.max(num(cur), n); break;
      case 5: next = isNum && (typeof cur === 'number' || cur == null) ? n : raw; break;
      default: break;
    }
    setPath(sys, path, next);
  }
}

/* ---------------- Foundry HTML -> plain HTML ---------------- */

/** Replace Foundry enrichers (@UUID[...]{Label}, [[/r 1d10]], &Reference[...]) with their text. */
export function cleanHtml(html: string): string {
  const ru = /[а-яё]/i.test(html);
  return (html ?? '')
    .replace(/<span[^>]*rd__h-toggle[^>]*>\[–\]<\/span>/g, '')
    .replace(/\[–\]/g, '')
    .replace(/@(UUID|Compendium|Actor|Item|JournalEntry|RollTable)\[[^\]]*\]\{([^}]*)\}/g, '$2')
    .replace(/@(UUID|Compendium|Actor|Item|JournalEntry|RollTable)\[([^\]]*)\]/g, (_, __, p: string) => p.split('.').pop() ?? '')
    .replace(/&(?:amp;)?Reference\[[^\]]*\]\{([^}]*)\}/g, '$1')
    .replace(/&(?:amp;)?Reference\[(?:\w+=)?([^\]\s]*)[^\]]*\]/g, (_, v: string) => v.replace(/([a-z])([A-Z])/g, '$1 $2'))
    // Plutonium / 5etools tags: @spell[name|source|display]{label}
    .replace(/@(\w+)\[([^\]]*)\](?:\{([^}]*)\})?/g, (_, __, body: string, label?: string) => {
      if (label) return label;
      const parts = body.split('|');
      return parts[2] || parts[0];
    })
    .replace(/\[\[\/(\w+)\s*([^\]]*)\]\](?:\{([^}]*)\})?/g, (_, cmd: string, args: string, label?: string) => {
      if (label) return label;
      const a = args.replace(/\b\w+=\S+/g, '').replace(/--?\w+/g, '').trim();
      // Foundry shows "/damage 1d10 type=fire" as "1d10 fire"; Russian texts already name the damage type.
      const type = !ru && /^damage$/i.test(cmd) ? args.match(/\btype=(\w+)/)?.[1] ?? '' : '';
      if (/^(r|roll|gmr|br|damage|heal)$/i.test(cmd)) return `${dice(a.replace(/\s+/g, ' '), ru)}${type ? ` ${type}` : ''}`;
      return a;
    })
    .replace(/\[\[([^\]]*)\]\]/g, (_, f: string) => dice(f.trim(), ru))
    .replace(/<a [^>]*href="https?:[^"]*"[^>]*>([^<]*)<\/a>/g, '$1');
}

/* ---------------- the sheet model ---------------- */

export interface SheetSkill { key: string; name: string; ability: Ability; prof: number; total: number; passive: number; changed: boolean }
export interface SheetAttack { name: string; bonus: string; damage: string; notes: string }
export interface SheetResource { id: string; name: string; max: number; per: string; hidden: boolean }
export interface SheetFeature { id: string; name: string; note: string; html: string; uses: string; usesMax: number }
export interface SheetFeatureGroup { title: string; intro: string; items: SheetFeature[] }
export interface SheetItem { id: string; name: string; qty: number; weight: number; depth: number; notes: string; equipped: boolean }
export interface SheetSpell {
  id: string; level: number; name: string; other: string; school: string; time: string; range: string; duration: string; comps: string;
  conc: boolean; ritual: boolean; always: boolean; alwaysChanged: boolean; html: string; source: string; homebrew: boolean;
  /** Site spell group and version, if the spell was found on the site. */
  site: { id: string; ll: boolean } | null;
  /** Mode in Foundry: prepared / always / innate / pact / atwill. */
  mode: string;
}
export interface SheetCaster { name: string; ability: Ability; dc: number; attack: number; prepared: number | null; preparedRule: string; cantrips: number | null; known: number | null; maxLevel: number }

export interface Sheet {
  name: string;
  level: number;
  prof: number;
  classLine: string;
  classes: { name: string; level: number; sub: string | null; hd: string; hdUsed: number }[];
  race: string;
  background: string;
  alignment: string;
  player: string;
  xp: number;
  xpNext: number | null;
  size: string;
  abilities: { key: Ability; name: string; short: string; score: number; mod: number; save: number; saveProf: boolean }[];
  skills: SheetSkill[];
  tools: { name: string; ability: Ability; total: number }[];
  passive: { perception: number; insight: number; investigation: number };
  ac: number;
  acNote: string;
  init: number;
  speed: string;
  hp: { max: number; value: number; temp: number };
  hitDice: { die: string; count: number; used: number }[];
  senses: string[];
  defenses: { label: string; values: string[] }[];
  languages: string[];
  armorProf: string[];
  weaponProf: string[];
  attacks: SheetAttack[];
  resources: SheetResource[];
  features: SheetFeatureGroup[];
  inventory: SheetItem[];
  currency: { pp: number; gp: number; ep: number; sp: number; cp: number };
  carried: number;
  capacity: number;
  attunement: { max: number; items: string[] };
  casters: SheetCaster[];
  /** Classes in the site's terms (for a character spell list); unknown homebrew classes are left out. */
  listClasses: CharClass[];
  slots: number[];
  pact: { slots: number; level: number } | null;
  spells: SheetSpell[];
  details: SheetNotes & { age: string; height: string; weight: string; eyes: string; skin: string; hair: string; gender: string; faith: string };
  warnings: string[];
}

/* ---- site lookups ---- */

let spellIndex: { data: Dataset; by: Map<string, Version[]> } | null = null;
function siteSpells(data: Dataset, name: string): Version[] {
  if (spellIndex?.data !== data) {
    const by = new Map<string, Version[]>();
    for (const v of data.spells) for (const n of [v.name.en, v.name.ru ?? '']) {
      if (!n) continue;
      const k = norm(n);
      by.set(k, [...(by.get(k) ?? []), v]);
    }
    spellIndex = { data, by };
  }
  return spellIndex.by.get(norm(name)) ?? [];
}

/** The site's version of a Foundry spell: by English name (Babele keeps it), Plutonium hash or name; Laserllama for "(Alternate)"/LL sources. */
export function matchSpell(data: Dataset, it: FItem): Version | null {
  const src = String(it.system?.source?.book ?? it.system?.source ?? '');
  const pl = it.flags?.plutonium;
  const hashName = pl?.hash ? decodeURIComponent(pl.hash.replace(/_[^_]*$/, '')) : '';
  const names = [it.flags?.babele?.originalName ?? '', hashName, it.name].filter(Boolean);
  const alt = names.some((n) => /\((alternate|альт[^)]*)\)/i.test(n));
  const ll = alt || /^LL/i.test(src) || /^ll/i.test(pl?.source ?? '');
  for (const raw of names) {
    const n = raw.replace(/\s*\((alternate|альт[^)]*)\)\s*$/i, '').trim();
    const found = siteSpells(data, n).filter((v) => v.level === num(it.system?.level, v.level));
    if (!found.length) continue;
    return found.find((v) => v.homebrew === ll) ?? found[0];
  }
  return null;
}

/** Site class code for a Foundry class: 'Wizard', 'LL:Druid' (Laserllama's alternate class) or null (unknown class). */
export function siteClass(data: Dataset, cls: FItem, sub: FItem | null): { code: string | null; sub: string | null } {
  const ident = String(cls.system?.identifier || cls.name).toLowerCase().trim().replace(/\s+/g, '-');
  const book = String(cls.system?.source?.book ?? '');
  const ll = /^LL/i.test(book) || ident.startsWith('alternate-') || /alternate|альтернатив/i.test(cls.name);
  const base = ident.replace(/^alternate-/, '');
  const c = data.classes.find((x) => x.en.toLowerCase() === base || x.ru.toLowerCase() === base || norm(cls.name).includes(norm(x.ru)) || norm(cls.name).includes(norm(x.en)));
  if (!c) return { code: null, sub: null };
  if (ll) return { code: LL_PREFIX + c.code, sub: null };
  let subId: string | null = null;
  if (sub) {
    const n = norm(sub.name);
    const s = data.subclasses.find((x) => x.class === c.code && [x.en, x.ru ?? ''].some((y) => y && (norm(y) === n || norm(y).includes(n) || n.includes(norm(y)))));
    subId = s?.id ?? null;
  }
  return { code: c.code, sub: subId };
}

const zeros = () => Array(9).fill(0);
function genericCaster(progression: string, ability: Ability, data: Dataset): CasterInfo | null {
  const table = data.multiclassSlots;
  const row = (cl: number) => (cl > 0 ? [...table[Math.min(20, cl) - 1]] : zeros());
  const prog = { full: 'full', half: '1/2', third: '1/3', artificer: 'artificer', pact: 'pact' }[progression] as CasterInfo['progression'] | undefined;
  if (!prog) return null;
  const warlock = data.casters.find((x) => x.key === 'Warlock');
  const slots = prog === 'pact' ? null : Array.from({ length: 20 }, (_, i) => {
    const L = i + 1;
    if (prog === 'full') return row(L);
    if (prog === '1/2') return L < 2 ? zeros() : row(Math.ceil(L / 2));
    if (prog === '1/3') return L < 3 ? zeros() : row(Math.ceil(L / 3));
    return row(Math.ceil(L / 2));
  });
  return {
    key: `generic:${progression}`, class: '', subclass: null, homebrew: true, source: '', progression: prog, ability: ability as CasterInfo['ability'],
    slots, pact: prog === 'pact' ? warlock?.pact ?? null : null, arcanum: prog === 'pact' ? warlock?.arcanum ?? null : null,
    cantrips: null, known: null, spellbook: null, prepared: null,
  };
}

/* ---- formatting of Foundry fields ---- */

function activation(a: any): string {
  const n = num(a?.cost, 1) || 1;
  switch (a?.type) {
    case 'action': return n === 1 ? '1 действие' : `${n} ${plural(n, 'действие', 'действия', 'действий')}`;
    case 'bonus': return '1 бонусное действие';
    case 'reaction': return '1 реакция';
    case 'minute': return `${n} ${plural(n, 'минута', 'минуты', 'минут')}`;
    case 'hour': return `${n} ${plural(n, 'час', 'часа', 'часов')}`;
    case 'day': return `${n} ${plural(n, 'день', 'дня', 'дней')}`;
    case 'special': return 'Особое';
    case 'legendary': return 'Легендарное действие';
    default: return '';
  }
}

function range(r: any): string {
  switch (r?.units) {
    case 'touch': return 'Касание';
    case 'self': return 'На себя';
    case 'spec': return 'Особая';
    case 'any': return 'Любая';
    case 'ft': return r.long ? `${r.value}/${r.long} фт.` : r.value ? `${r.value} фт.` : '';
    case 'mi': return `${r.value} ${plural(num(r.value), 'миля', 'мили', 'миль')}`;
    default: return '';
  }
}

function duration(d: any, conc: boolean): string {
  const n = num(d?.value, 1) || 1;
  const unit: Record<string, [string, string, string]> = {
    turn: ['ход', 'хода', 'ходов'], round: ['раунд', 'раунда', 'раундов'], minute: ['минута', 'минуты', 'минут'],
    hour: ['час', 'часа', 'часов'], day: ['день', 'дня', 'дней'], month: ['месяц', 'месяца', 'месяцев'], year: ['год', 'года', 'лет'],
  };
  let s: string;
  if (unit[d?.units]) s = `${n} ${plural(n, ...unit[d.units])}`;
  else s = ({ inst: 'Мгновенная', instantaneous: 'Мгновенная', perm: 'Пока не рассеется', spec: 'Особая', ue: 'Пока не окончится' } as Record<string, string>)[d?.units] ?? '';
  if (conc && s && unit[d?.units]) return `Концентрация, вплоть до ${s.replace(/^1 минута$/, '1 минуты').replace(/^1 час$/, '1 часа').replace(/^1 день$/, '1 дня')}`;
  return s;
}

/** Damage of a 3.x (parts) or 4.x+ (base) damage block, '@mod' replaced. */
function damageText(sys: any, mod: number, extra = 0, scaleCantrip = 0): { main: string; versatile: string } {
  const fix = (f: string) => {
    let s = String(f ?? '').replace(/@mod/g, String(mod)).replace(/\s+/g, ' ').trim();
    if (scaleCantrip) s = s.replace(/^(\d+)d(\d+)/, (_, n: string, d: string) => `${Number(n) * scaleCantrip}d${d}`);
    if (extra) s = `${s} + ${extra}`;
    s = s.replace(/\+\s*-\s*(\d+)/g, '− $1').replace(/\+\s*0(?!\d)/g, '').replace(/\s+/g, ' ').trim().replace(/\+\s*$/, '').trim();
    return dice(s.replace(/ ?\+ ?/g, ' + ').replace(/ ?− ?/g, ' − '));
  };
  const typeOf = (t: unknown) => (Array.isArray(t) ? t : t ? [t] : []).map((x) => DAMAGE_RU[String(x)] ?? String(x)).join(' или ');
  const d = sys?.damage;
  if (Array.isArray(d?.parts) && d.parts.length) {
    const main = d.parts.map(([f, t]: [string, string]) => `${fix(f)} ${typeOf(t)}`.trim()).join(' + ');
    return { main, versatile: d.versatile ? fix(d.versatile) : '' };
  }
  if (d?.base && (d.base.number || d.base.custom?.formula)) {
    const b = d.base;
    const f = b.custom?.enabled ? b.custom.formula : `${b.number}d${b.denomination}${b.bonus ? ` + ${b.bonus}` : ''} + @mod`;
    const v = d.versatile?.number ? fix(`${d.versatile.number}d${d.versatile.denomination} + @mod`) : '';
    return { main: `${fix(f)} ${typeOf(b.types)}`.trim(), versatile: v };
  }
  return { main: '', versatile: '' };
}

const usesOf = (sys: any, refs: (p: string) => number | null): { max: number; per: string } | null => {
  const u = sys?.uses;
  if (!u) return null;
  const max = evalFormula(u.max, refs);
  if (!max || max <= 0) return null;
  const period = u.per ?? (Array.isArray(u.recovery) ? u.recovery[0]?.period : null);
  const per = ({ sr: 'короткий отдых', lr: 'продолжительный отдых', day: 'день', dawn: 'рассвет', dusk: 'закат', charges: 'заряды', round: 'раунд', turn: 'ход', turnStart: 'ход', turnEnd: 'ход' } as Record<string, string>)[period] ?? '';
  return { max, per };
};

/** dnd5e 4.x+ keeps attacks, saves and damage in "activities": a 3.x-shaped view of them. */
function actionOf(sys: any): { actionType: string; save: { ability: string; scaling: string; dc: unknown }; damage: any } {
  if (sys?.actionType || !sys?.activities) {
    return { actionType: String(sys?.actionType ?? ''), save: sys?.save ?? {}, damage: sys?.damage };
  }
  const acts: any[] = Object.values(sys.activities ?? {});
  const atk = acts.find((a) => a?.type === 'attack');
  const save = acts.find((a) => a?.type === 'save');
  const dmgAct = atk ?? save ?? acts.find((a) => a?.type === 'damage');
  const parts = (dmgAct?.damage?.parts ?? []).map((p: any) => {
    const f = p.custom?.enabled ? p.custom.formula : p.number && p.denomination ? `${p.number}d${p.denomination}${p.bonus ? ` + ${p.bonus}` : ''}` : '';
    const types = Array.isArray(p.types) ? p.types : Object.keys(p.types ?? {});
    return [f, types[0] ?? ''];
  }).filter((p: string[]) => p[0]);
  const ability = Array.isArray(save?.save?.ability) ? save.save.ability[0] : Object.keys(save?.save?.ability ?? {})[0] ?? save?.save?.ability ?? '';
  const calc = save?.save?.dc?.calculation;
  return {
    actionType: atk ? (atk.attack?.type?.classification === 'spell' ? (atk.attack?.type?.value === 'melee' ? 'msak' : 'rsak') : atk.attack?.type?.value === 'ranged' ? 'rwak' : 'mwak') : save ? 'save' : '',
    save: { ability: String(ability ?? ''), scaling: calc === 'spellcasting' || !calc ? (calc === '' ? 'flat' : 'spell') : calc, dc: save?.save?.dc?.formula },
    damage: parts.length ? { parts } : sys.damage,
  };
}

const textField = (v: unknown) => (typeof v === 'string' ? v : typeof (v as any)?.value === 'string' ? (v as any).value : '');
const htmlToText = (html: string) => cleanHtml(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();

/* ---------------- build ---------------- */

export function buildSheet(data: Dataset, ch: Character): Sheet {
  const actor = ch.actor;
  const opts = optionsOf(ch);
  const sys = structuredClone(actor.system ?? {});
  applyEffects(sys, activeEffects(actor));
  const items = [...actor.items];
  const warnings: string[] = [];
  const byId = new Map(items.map((x) => [x._id, x]));
  const ofType = (t: string) => items.filter((x) => x.type === t);

  /* classes and level */
  const classItems = ofType('class');
  const subItems = ofType('subclass');
  const classes = classItems.map((c) => {
    const ident = String(c.system?.identifier || c.name).toLowerCase();
    const sub = subItems.find((s) => String(s.system?.classIdentifier ?? '').toLowerCase() === ident) ?? null;
    const die = String(c.system?.hd?.denomination ?? c.system?.hitDice ?? 'd8');
    return {
      item: c, ident, sub, level: Math.max(1, num(c.system?.levels, 1)), die,
      hdUsed: num(c.system?.hd?.spent ?? c.system?.hitDiceUsed, 0),
    };
  });
  const level = Math.max(1, classes.reduce((n, c) => n + c.level, 0));
  if (!classes.length) warnings.push('В файле нет класса — уровень считается равным 1.');
  const prof = Math.floor((level + 7) / 4);

  /* abilities */
  const score = (k: Ability) => num(sys.abilities?.[k]?.value, 10);
  const mods = Object.fromEntries(ABILITIES.map((k) => [k, abilityMod(score(k))])) as Record<Ability, number>;

  const scale = (cls: string, id: string): number | null => {
    const owner = [...classes.map((c) => ({ ident: c.ident, item: c.item, level: c.level })),
      ...classes.filter((c) => c.sub).map((c) => ({ ident: String(c.sub!.system?.identifier ?? '').toLowerCase(), item: c.sub!, level: c.level }))]
      .find((x) => x.ident === cls.toLowerCase());
    const adv = (owner?.item.system?.advancement ?? []).find((a: any) => a.type === 'ScaleValue' && a.configuration?.identifier === id);
    if (!adv || !owner) return null;
    let v: any = null;
    for (const [lvl, val] of Object.entries(adv.configuration?.scale ?? {})) if (Number(lvl) <= owner.level) v = val;
    return v == null ? 0 : num(v.value ?? v.number ?? v.distance, 0);
  };
  const refs = (p: string): number | null => {
    if (p === 'prof' || p === 'attributes.prof') return prof;
    if (p === 'details.level') return level;
    let m = p.match(/^abilities\.(\w+)\.(mod|value)$/);
    if (m) return m[2] === 'mod' ? mods[m[1] as Ability] ?? null : score(m[1] as Ability);
    m = p.match(/^classes\.([\w-]+)\.levels$/);
    if (m) return classes.find((c) => c.ident === m![1])?.level ?? 0;
    m = p.match(/^scale\.([\w-]+)\.([\w-]+)(?:\.\w+)?$/);
    if (m) return scale(m[1], m[2]);
    const v = get(sys, p);
    return typeof v === 'number' ? v : null;
  };
  const bonus = (f: unknown, what: string) => {
    if (f == null || f === '') return 0;
    const v = evalFormula(f, refs);
    if (v == null) { warnings.push(`Бонус «${f}» (${what}) не удалось посчитать — он не учтён.`); return 0; }
    return v;
  };
  const globalCheck = bonus(sys.bonuses?.abilities?.check, 'проверки характеристик');
  const globalSave = bonus(sys.bonuses?.abilities?.save, 'спасброски');

  const abilities = ABILITIES.map((k) => {
    const a = sys.abilities?.[k] ?? {};
    const saveProf = num(a.proficient) >= 1;
    return {
      key: k, name: ABILITY[k].name, short: ABILITY[k].short, score: score(k), mod: mods[k], saveProf,
      save: mods[k] + (saveProf ? prof : 0) + bonus(a.bonuses?.save, `спасбросок ${ABILITY[k].gen}`) + globalSave,
    };
  });

  const flags = actor.flags?.dnd5e ?? {};
  const jack = Boolean(flags.jackOfAllTrades);
  const skills: SheetSkill[] = SKILL_DEFS.map((d) => {
    const s = sys.skills?.[d.key] ?? {};
    const baseAb = (ABILITIES as readonly string[]).includes(s.ability) ? (s.ability as Ability) : d.ability;
    const abFix = ch.skillAb?.[d.key];
    const ab = abFix && (ABILITIES as readonly string[]).includes(abFix) ? (abFix as Ability) : baseAb;
    const base = num(s.value ?? s.proficient, 0);
    const changed = (ch.skills?.[d.key] != null && ch.skills[d.key] !== base) || ab !== baseAb;
    let p = ch.skills?.[d.key] ?? base;
    if (p === 0 && jack) p = 0.5;
    const total = mods[ab] + Math.floor(prof * p) + bonus(s.bonuses?.check, d.name) + bonus(sys.abilities?.[ab]?.bonuses?.check, d.name)
      + globalCheck + bonus(sys.bonuses?.abilities?.skill, 'навыки');
    const mode = num(s.roll?.mode ?? s.mode, 0);
    return { key: d.key, name: d.name, ability: ab, prof: p, total, changed, passive: 10 + total + bonus(s.bonuses?.passive, d.name) + (mode > 0 ? 5 : mode < 0 ? -5 : 0) };
  });
  const skill = (k: string) => skills.find((s) => s.key === k)!;

  const tools = Object.entries(sys.tools ?? {}).map(([k, t]: [string, any]) => {
    const ab = ((ABILITIES as readonly string[]).includes(t?.ability) ? t.ability : 'int') as Ability;
    const p = num(t?.value, 0);
    return { name: TOOLS[k] ?? k, ability: ab, total: mods[ab] + Math.floor(prof * p) + bonus(t?.bonuses?.check, TOOLS[k] ?? k) + globalCheck };
  });

  /* race, background, details */
  const race = ofType('race')[0] ?? null;
  const background = ofType('background')[0] ?? null;
  const det = sys.details ?? {};
  const raceName = race?.name ?? (typeof det.race === 'string' && !byId.has(det.race) ? det.race : '');
  const bgName = background?.name ?? (typeof det.background === 'string' && !byId.has(det.background) ? det.background : '');
  const alignRaw = String(det.alignment ?? '').trim();
  const alignment = ch.notes.alignment ?? (ALIGNMENTS.find(([re]) => re.test(alignRaw))?.[1] ?? alignRaw);

  /* armor class */
  const equipped = items.filter((x) => x.type === 'equipment' && x.system?.equipped);
  const armor = equipped.find((x) => ['light', 'medium', 'heavy'].includes(x.system?.type?.value ?? x.system?.armor?.type));
  const shield = equipped.find((x) => (x.system?.type?.value ?? x.system?.armor?.type) === 'shield');
  const acData = sys.attributes?.ac ?? {};
  const dex = mods.dex;
  let ac: number;
  let acNote = '';
  const armorValue = (x: FItem) => num(x.system?.armor?.value) + num(x.system?.armor?.magicalBonus ?? x.system?.magicalBonus);
  switch (acData.calc) {
    case 'flat': ac = num(acData.flat, 10); acNote = 'фиксированный'; break;
    case 'natural': ac = num(acData.flat, 10); acNote = 'природный доспех'; break;
    case 'mage': ac = 13 + dex; acNote = 'доспехи мага'; break;
    case 'draconic': ac = 13 + dex; acNote = 'драконья устойчивость'; break;
    case 'unarmoredMonk': ac = 10 + dex + mods.wis; acNote = 'защита без доспехов'; break;
    case 'unarmoredBarb': ac = 10 + dex + mods.con; acNote = 'защита без доспехов'; break;
    case 'custom': {
      const v = evalFormula(acData.formula, refs);
      ac = v ?? 10 + dex;
      acNote = 'своя формула';
      if (v == null) warnings.push(`Формулу КД «${acData.formula}» не удалось посчитать.`);
      break;
    }
    default:
      if (armor) {
        const type = armor.system?.type?.value ?? armor.system?.armor?.type;
        const cap = armor.system?.armor?.dex ?? (type === 'heavy' ? 0 : type === 'medium' ? 2 : null);
        ac = armorValue(armor) + (cap == null ? dex : Math.min(dex, num(cap)));
        acNote = armor.name;
      } else {
        ac = 10 + dex;
        acNote = 'без доспехов';
      }
  }
  if (shield && acData.calc !== 'flat') { ac += armorValue(shield); acNote += `, ${shield.name}`; }
  ac += bonus(acData.bonus, 'КД');

  /* initiative, speed, senses */
  const init = dex + bonus(sys.attributes?.init?.bonus, 'инициатива') + bonus(sys.abilities?.dex?.bonuses?.check, 'инициатива') + globalCheck
    + (jack ? Math.floor(prof / 2) : 0) + (flags.initiativeAlert ? 5 : 0);
  const mv = sys.attributes?.movement ?? {};
  const rmv = race?.system?.movement ?? {};
  const move = (k: string) => num(mv[k] ?? rmv[k], 0);
  const walk = mv.walk ?? rmv.walk ?? 30;
  const speedParts = [ft(num(walk, 30))];
  for (const [k, label] of [['climb', 'лазание'], ['swim', 'плавание'], ['fly', 'полёт'], ['burrow', 'копание']]) {
    if (move(k) > 0) speedParts.push(`${label} ${ft(move(k))}${k === 'fly' && (mv.hover || rmv.hover) ? ' (парение)' : ''}`);
  }
  const se = sys.attributes?.senses ?? {};
  const rse = race?.system?.senses ?? {};
  const senses: string[] = [];
  for (const [k, label] of [['darkvision', 'Тёмное зрение'], ['blindsight', 'Слепое зрение'], ['tremorsense', 'Чувство вибрации'], ['truesight', 'Истинное зрение']]) {
    const v = num(se[k] ?? rse[k], 0);
    if (v > 0) senses.push(`${label} ${ft(v)}`);
  }
  if (se.special || rse.special) senses.push(String(se.special || rse.special));

  /* hit points and hit dice */
  const hpData = sys.attributes?.hp ?? {};
  let hpMax: number;
  if (hpData.max != null && hpData.max !== '' && Number.isFinite(Number(hpData.max))) hpMax = Number(hpData.max);
  else {
    hpMax = 0;
    for (const c of classes) {
      const faces = num(c.die.replace(/^d/, ''), 8);
      const adv = (c.item.system?.advancement ?? []).find((a: any) => a.type === 'HitPoints');
      for (let l = 1; l <= c.level; l++) {
        const v = adv?.value?.[l] ?? adv?.value?.[String(l)];
        if (v === 'max' || (v == null && l === 1 && c === classes[0])) hpMax += faces;
        else if (v === 'avg' || v == null) hpMax += faces / 2 + 1;
        else hpMax += num(v, faces / 2 + 1);
      }
    }
    hpMax += level * mods.con + level * bonus(hpData.bonuses?.level, 'хиты за уровень') + bonus(hpData.bonuses?.overall, 'хиты');
  }
  hpMax += num(hpData.tempmax, 0);
  const hitDice = classes.map((c) => ({ die: dice(c.die), count: c.level, used: c.hdUsed }));

  /* defenses, languages, proficiencies */
  const traits = sys.traits ?? {};
  const list = (t: any, dict: Record<string, string>) => [
    ...(Array.isArray(t?.value) ? t.value : []).map((x: string) => dict[x] ?? x),
    ...String(t?.custom ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean),
  ];
  const defenses = [
    { label: 'Сопротивление', values: list(traits.dr, DAMAGE_RU) },
    { label: 'Иммунитет', values: list(traits.di, DAMAGE_RU) },
    { label: 'Уязвимость', values: list(traits.dv, DAMAGE_RU) },
    { label: 'Иммунитет к состояниям', values: list(traits.ci, CONDITIONS) },
  ].filter((d) => d.values.length);
  const languages = list(traits.languages, LANGUAGES);
  const armorProf = list(traits.armorProf, ARMOR_PROF);
  const weaponProf = list(traits.weaponProf, { ...WEAPON_PROF, ...WEAPONS });

  /* attacks */
  const attacks: SheetAttack[] = [];
  const weaponProfs = new Set<string>(Array.isArray(traits.weaponProf?.value) ? traits.weaponProf.value : []);
  for (const w of ofType('weapon')) {
    const s = w.system ?? {};
    const props: string[] = Array.isArray(s.properties) ? s.properties : Object.keys(s.properties ?? {}).filter((k) => s.properties[k]);
    const wtype = String(s.type?.value ?? s.weaponType ?? '');
    const ranged = wtype.endsWith('R') || s.actionType === 'rwak';
    let ab: Ability = (ABILITIES as readonly string[]).includes(s.ability) ? s.ability : ranged ? 'dex' : 'str';
    if (!s.ability && props.includes('fin')) ab = mods.dex >= mods.str ? 'dex' : 'str';
    const autoProf = wtype.startsWith('simple') ? weaponProfs.has('sim') : wtype.startsWith('martial') ? weaponProfs.has('mar') : true;
    const proficient = s.proficient == null ? autoProf || weaponProfs.has(String(s.type?.baseItem ?? s.baseItem ?? '')) : num(s.proficient) >= 1;
    const magic = num(s.magicalBonus ?? 0);
    const kind = ranged ? 'rwak' : 'mwak';
    const atk = mods[ab] + (proficient ? prof : 0) + magic + bonus(s.attack?.bonus ?? s.attackBonus, w.name) + bonus(sys.bonuses?.[kind]?.attack, 'атаки оружием');
    const extraDmg = magic + bonus(sys.bonuses?.[kind]?.damage, 'урон оружием');
    const dmg = damageText(s, mods[ab], extraDmg);
    const r = s.range ?? {};
    const reach = props.includes('rch') ? 10 : 5;
    const notes = [
      ranged || props.includes('thr') ? `дист. ${r.value ?? '?'}${r.long ? `/${r.long}` : ''} фт.` : '',
      !ranged ? `досяг. ${num(r.value) && !props.includes('thr') ? r.value : reach} фт.` : '',
      ...props.filter((p) => !['fin', 'thr', 'rch', 'mgc'].includes(p) || p === 'fin').map((p) => WEAPON_PROPS[p] ?? '').filter(Boolean),
      dmg.versatile ? `двумя руками ${dmg.versatile}` : '',
      proficient ? '' : 'нет владения',
      s.equipped === false ? 'не экипировано' : '',
    ].filter(Boolean);
    if (!proficient) warnings.push(`${w.name}: нет владения этим оружием — бонус мастерства к атаке не добавлен.`);
    attacks.push({ name: w.name, bonus: signed(atk), damage: dmg.main, notes: notes.join(', ') });
  }

  /* spellcasting */
  const casterEntries: { c: CharClass; info: CasterInfo | null; name: string; ability: Ability }[] = [];
  for (const c of classes) {
    const sc = (c.sub?.system?.spellcasting?.progression && c.sub.system.spellcasting.progression !== 'none') ? c.sub.system.spellcasting : c.item.system?.spellcasting;
    const progression = String(sc?.progression ?? 'none');
    if (progression === 'none') continue;
    const ab = ((ABILITIES as readonly string[]).includes(sc?.ability) ? sc.ability : sys.attributes?.spellcasting || 'int') as Ability;
    const site = siteClass(data, c.item, c.sub);
    const cc: CharClass = { cls: site.code ?? `custom:${c.ident}`, level: c.level, sub: site.sub, mod: mods[ab] };
    let info = site.code ? casterFor(data, cc).info : null;
    if (info && info.ability !== ab) info = { ...info, ability: ab as CasterInfo['ability'] };
    info ??= genericCaster(progression, ab, data);
    casterEntries.push({ c: cc, info, name: c.item.name, ability: ab });
  }
  const slotSum = slotSummaryFor(casterEntries.map(({ c, info }) => ({ c, info })), data.multiclassSlots);
  const slots = [...slotSum.slots];
  for (let l = 1; l <= 9; l++) {
    const o = sys.spells?.[`spell${l}`]?.override;
    if (o != null && o !== '') slots[l - 1] = num(o, slots[l - 1]);
  }
  let pact = slotSum.pact ? { slots: slotSum.pact.slots, level: slotSum.pact.level } : null;
  const pactOverride = sys.spells?.pact?.override;
  if (pact && pactOverride != null && pactOverride !== '') pact = { ...pact, slots: num(pactOverride, pact.slots) };
  const dcBonus = bonus(sys.bonuses?.spell?.dc, 'Сл заклинаний');
  const spellAtkBonus = bonus(sys.bonuses?.rsak?.attack || sys.bonuses?.msak?.attack, 'атаки заклинаниями');
  const casters: SheetCaster[] = casterEntries.map(({ c, info, name, ability }) => {
    const lim = info ? classLimits(info, c) : null;
    return {
      name, ability, dc: 8 + prof + mods[ability] + dcBonus, attack: prof + mods[ability] + spellAtkBonus,
      prepared: lim?.prepared ?? null,
      preparedRule: lim?.preparedRule ? `${lim.preparedRule === 'half' ? 'пол-уровня' : 'уровень'} класса + мод. ${ABILITY[ability].short}` : '',
      cantrips: lim?.cantrips ?? null, known: lim?.known ?? null, maxLevel: info ? maxSpellLevel(info, c.level) : 9,
    };
  });
  const listClasses: CharClass[] = [];
  for (const c of classes) {
    const site = siteClass(data, c.item, c.sub);
    if (!site.code) continue;
    const entry = casterEntries.find((e) => e.c.cls === site.code);
    listClasses.push({ cls: site.code, level: c.level, sub: site.sub, mod: entry ? mods[entry.ability] : null });
  }
  const mainCaster = casters[0] ?? null;
  const spellDc = mainCaster?.dc ?? 8 + prof + mods[(sys.attributes?.spellcasting || 'int') as Ability];
  const spellAtk = mainCaster?.attack ?? prof + mods[(sys.attributes?.spellcasting || 'int') as Ability];

  /* spells */
  const lang = opts.spellLang;
  // Spells granted by subclass features ("Decay Spells", "Domain Spells"): their @spell[...] links name them.
  const grantedNames = new Set<string>();
  for (const f of ofType('feat')) {
    if (!/spells|заклинани/i.test(f.name)) continue;
    for (const m of textField(f.system?.description).matchAll(/@spell\[([^\]|]+)/gi)) grantedNames.add(norm(m[1].replace(/\s*\((alternate|альт[^)]*)\)/i, '')));
  }
  const casterSubs = casterEntries.map((e) => e.c).filter((c) => c.sub);
  const isGranted = (it: FItem, v: Version | null) => {
    const names = [v?.name.en, v?.name.ru, it.flags?.babele?.originalName, it.name].filter(Boolean).map((n) => norm(String(n).replace(/\s*\((alternate|альт[^)]*)\)/i, '')));
    return names.some((n) => grantedNames.has(n)) || Boolean(v && casterSubs.some((c) => v.subclasses.includes(c.sub!)));
  };
  // Importers (Plutonium) often mark every spell of a prepared caster as "always prepared"; by the rules only the
  // subclass spells are. Then the others are printed as prepared spells (the player can change it on the site).
  const preparedCaster = casterEntries.some((e) => e.info?.prepared);
  const spellItems = ofType('spell');
  const leveled = spellItems.filter((it) => num(it.system?.level) > 0);
  const modeOf = (it: FItem) => String(it.system?.method ?? it.system?.preparation?.mode ?? 'prepared');
  const allAlways = preparedCaster && leveled.length > 0 && leveled.every((it) => modeOf(it) === 'always');
  let fixedAlways = 0;
  const cantripScale = 1 + Math.floor((level + 1) / 6);
  const spells: SheetSpell[] = [];
  for (const it of ofType('spell')) {
    const s = it.system ?? {};
    const lvl = num(s.level, 0);
    const props: string[] = Array.isArray(s.properties) ? s.properties : [];
    const conc = props.includes('concentration') || Boolean(s.components?.concentration);
    const ritual = props.includes('ritual') || Boolean(s.components?.ritual);
    const v = matchSpell(data, it);
    const mode = modeOf(it);
    let baseAlways = ['always', 'innate', 'atwill', 'pact'].includes(mode) || num(s.prepared) === 2;
    if (allAlways && lvl > 0 && mode === 'always' && !isGranted(it, v)) { baseAlways = false; fixedAlways++; }
    const always = ch.always?.[it._id] ?? baseAlways;
    const comps = [props.includes('vocal') && 'В', props.includes('somatic') && 'С', props.includes('material') && 'М'].filter(Boolean).join(', ');
    const pick = <K extends 'time' | 'range' | 'duration' | 'comps' | 'text'>(f: K) => (v ? (lang === 'ru' ? v[f].ru ?? v[f].en : v[f].en) : '');
    const nm = v ? (lang === 'ru' ? v.name.ru ?? v.name.en : v.name.en) : it.name;
    const other = v ? (lang === 'ru' ? v.name.en : v.name.ru ?? '') : (it.flags?.babele?.originalName ?? '');
    spells.push({
      id: it._id, level: lvl, name: nm, other: other && other !== nm ? other : '',
      school: v ? SCHOOL[v.school]?.[lang] ?? v.school : SCHOOL[SCHOOL_KEY[s.school] ?? '']?.ru ?? '',
      time: v ? pick('time') : activation(s.activation),
      range: v ? pick('range') : range(s.range),
      duration: v ? pick('duration') : duration(s.duration, conc),
      comps: v ? pick('comps').replace(/\s*\(.*$/, '') : comps,
      conc: v ? v.concentration : conc, ritual: v ? v.ritual : ritual,
      always, alwaysChanged: ch.always?.[it._id] != null && ch.always[it._id] !== baseAlways,
      html: v ? pick('text') : cleanHtml(textField(s.description)),
      source: v ? (v.homebrew ? 'Laserllama' : data.sources.find((x) => x.code === v.source)?.en ?? v.source) : String(s.source?.book ?? ''),
      homebrew: v ? v.homebrew : /^LL/i.test(String(s.source?.book ?? '')),
      site: v ? { id: v.group, ll: v.homebrew } : null,
      mode,
    });
    // Damaging cantrips go to the attacks block.
    if (lvl === 0) {
      const act = actionOf(s);
      const dmg = damageText({ damage: act.damage }, mods[(sys.attributes?.spellcasting || 'int') as Ability], 0, cantripScale);
      const saveAb = act.save?.ability as Ability | undefined;
      const atk = act.actionType === 'msak' || act.actionType === 'rsak' ? signed(spellAtk) : saveAb && ABILITY[saveAb] ? `Сл ${spellDc} ${ABILITY[saveAb].short}` : '';
      if (dmg.main && atk) attacks.push({ name: nm, bonus: atk, damage: dmg.main.replace(/@mod/g, ''), notes: [v ? pick('range') : range(s.range), 'заговор'].filter(Boolean).join(', ') });
    }
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'ru'));
  if (fixedAlways) {
    const kept = spells.filter((x) => x.level > 0 && x.always && x.mode === 'always').map((x) => x.name);
    warnings.push(`В Foundry все заклинания отмечены «всегда подготовленными». По правилам так подготовлены только заклинания подкласса${kept.length ? ` (${kept.join(', ')})` : ''}; остальные на листе — обычные подготовленные. Это можно поменять в списке заклинаний ниже.`);
  }

  /* features and resources */
  const groups = new Map<string, SheetFeatureGroup>();
  const group = (title: string, intro = '') => {
    if (!groups.has(title)) groups.set(title, { title, intro, items: [] });
    return groups.get(title)!;
  };
  const raceTitle = race ? `Раса: ${race.name}` : 'Раса';
  if (race) group(raceTitle);
  for (const c of classes) {
    group(`Класс: ${c.item.name} ${c.level}`);
    if (c.sub) group(`Подкласс: ${c.sub.name}`, cleanHtml(textField(c.sub.system?.description)));
  }
  const bgTitle = background ? `Предыстория: ${background.name}` : 'Предыстория';
  const resources: SheetResource[] = [];
  const hidden = new Set(ch.hiddenRes ?? []);
  for (const f of ofType('feat')) {
    const s = f.system ?? {};
    const origin = f.flags?.dnd5e?.advancementOrigin?.split('.')[0] ?? '';
    const cls = classes.find((c) => c.item._id === origin || c.sub?._id === origin);
    let title: string;
    const t = s.type?.value ?? '';
    if (cls) title = cls.sub && cls.sub._id === origin ? `Подкласс: ${cls.sub.name}` : `Класс: ${cls.item.name} ${cls.level}`;
    else if (t === 'race' || (race && origin === race._id)) title = raceTitle;
    else if (t === 'background' || (background && origin === background._id)) title = bgTitle;
    else if (t === 'class') title = classes[0] ? `Класс: ${classes[0].item.name} ${classes[0].level}` : 'Класс';
    else if (t === 'feat') title = 'Черты';
    else title = 'Прочие умения';
    const u0 = usesOf(s, refs);
    const autoHidden = /^(spellcasting|использование заклинаний|колдовство|магия договора)$/i.test(f.name.trim());
    const isHidden = hidden.has(f._id) || (autoHidden && !hidden.has(`!${f._id}`));
    const u = u0 && !isHidden ? u0 : null;
    const act = activation(s.activation);
    group(title).items.push({
      id: f._id, name: f.name, html: cleanHtml(textField(s.description)), usesMax: u?.max ?? 0,
      uses: u ? `${u.max} ${u.per ? `/ ${u.per}` : ''}`.trim() : '',
      note: [act && act !== 'Особое' ? act : '', s.requirements && (title === 'Черты' || title === 'Прочие умения') ? `требование: ${s.requirements}` : ''].filter(Boolean).join(' · '),
    });
    if (u0) resources.push({ id: f._id, name: f.name, max: u0.max, per: u0.per, hidden: isHidden });
  }
  for (const key of ['primary', 'secondary', 'tertiary']) {
    const r = sys.resources?.[key];
    if (r?.label && num(r.max) > 0) {
      resources.push({ id: `res:${key}`, name: r.label, max: num(r.max), per: r.lr ? 'продолжительный отдых' : r.sr ? 'короткий отдых' : '', hidden: hidden.has(`res:${key}`) });
    }
  }
  // Groups in a fixed order; empty class/race groups are dropped.
  const order = (title: string) => (title.startsWith('Раса') ? 0 : title.startsWith('Класс') ? 1 : title.startsWith('Подкласс') ? 2 : title.startsWith('Предыстория') ? 3 : title === 'Черты' ? 4 : 5);
  const features = [...groups.values()].filter((g) => g.items.length || g.intro).sort((a, b) => order(a.title) - order(b.title));
  // Features that deal damage on a save (Breath Weapon) go to the attacks block.
  for (const f of ofType('feat')) {
    const s = f.system ?? {};
    const act = actionOf(s);
    const dmg = damageText({ damage: act.damage }, 0);
    // Only real save-for-damage features (Breath Weapon); importers sometimes put flat numbers there.
    if (!/\d*d\d+/.test(JSON.stringify(act.damage ?? '')) || !act.save?.ability || !ABILITY[act.save.ability as Ability]) continue;
    const sc = act.save.scaling;
    const dc = sc === 'flat' ? evalFormula(act.save.dc, refs) ?? 10 : sc === 'spell' || !sc ? spellDc : 8 + prof + (mods[sc as Ability] ?? 0);
    const tgt = s.target?.value ? `${s.target.type === 'line' ? 'линия' : s.target.type === 'cone' ? 'конус' : s.target.type === 'radius' || s.target.type === 'sphere' ? 'радиус' : s.target.type === 'cube' ? 'куб' : ''} ${s.target.value} фт.`.trim() : '';
    attacks.push({ name: f.name, bonus: `Сл ${dc} ${ABILITY[act.save.ability as Ability].short}`, damage: dmg.main, notes: tgt });
  }

  /* inventory */
  const invTypes = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container', 'backpack']);
  const inv = items.filter((x) => invTypes.has(x.type));
  const weightOf = (x: FItem) => {
    const w = x.system?.weight;
    const v = typeof w === 'object' && w ? num(w.value) * (w.units === 'kg' ? 2.2 : 1) : num(w);
    return v;
  };
  // Charges of wands, staffs and magic items (not the "1 charge" Foundry gives to torches and rations).
  const charges = (x: FItem) => {
    const max = evalFormula(x.system?.uses?.max, refs) ?? 0;
    const kind = String(x.system?.type?.value ?? x.system?.consumableType ?? '');
    return max > 1 && !['food', 'ammo', 'trinket', 'poison', 'potion', 'scroll'].includes(kind) ? `зарядов: ${max}` : '';
  };
  const inventory: SheetItem[] = [];
  const seen = new Set<string>();
  const addItem = (x: FItem, depth: number) => {
    if (seen.has(x._id)) return;
    seen.add(x._id);
    const s = x.system ?? {};
    const qty = num(s.quantity, 1);
    const notes = [
      s.equipped ? (x.type === 'weapon' ? 'в руках' : 'надето') : '',
      s.attuned ? 'настроен' : (s.attunement === 'required' || s.attunement === 1) ? 'нужна настройка' : '',
      charges(x),
    ].filter(Boolean).join(', ');
    inventory.push({ id: x._id, name: x.name, qty, weight: Math.round(weightOf(x) * qty * 100) / 100, depth, notes, equipped: Boolean(s.equipped) });
    for (const child of inv.filter((y) => y.system?.container === x._id)) addItem(child, depth + 1);
  };
  for (const x of inv) if (!x.system?.container || !byId.has(x.system.container)) addItem(x, 0);
  for (const x of inv) addItem(x, 0);
  const weightless = new Set(inv.filter((x) => (Array.isArray(x.system?.properties) && x.system.properties.includes('weightlessContents'))).map((x) => x._id));
  const carried = Math.round(inv.filter((x) => !weightless.has(x.system?.container)).reduce((n, x) => n + weightOf(x) * num(x.system?.quantity, 1), 0) * 10) / 10;
  const size = SIZES[traits.size ?? 'med'] ?? SIZES.med;
  const capacity = score('str') * 15 * size.carry * (flags.powerfulBuild ? 2 : 1);
  const cur = sys.currency ?? {};

  /* details */
  const notes = ch.notes ?? {};
  const xp = num(det.xp?.value, 0);
  const xpNext = level < 20 ? XP_LEVELS[level] : null;
  const classLine = classes.map((c) => `${c.item.name} ${c.level}${c.sub ? ` (${c.sub.name})` : ''}`).join(' / ');
  if (opts.spellLang === 'en' && spells.some((s) => !s.site)) warnings.push('Заклинания, которых нет на сайте, печатаются как в файле Foundry.');
  if (spells.some((s) => !s.site)) {
    warnings.push(`Нет на сайте (текст взят из файла): ${spells.filter((s) => !s.site).map((s) => s.name).join(', ')}.`);
  }

  return {
    name: ch.name || actor.name,
    level, prof, classLine,
    classes: classes.map((c) => ({ name: c.item.name, level: c.level, sub: c.sub?.name ?? null, hd: dice(c.die), hdUsed: c.hdUsed })),
    race: raceName, background: bgName, alignment, player: notes.player ?? '', xp, xpNext,
    size: size.name,
    abilities, skills, tools,
    passive: { perception: skill('prc').passive, insight: skill('ins').passive, investigation: skill('inv').passive },
    ac, acNote, init, speed: speedParts.join(', '),
    hp: { max: Math.max(1, Math.round(hpMax)), value: num(hpData.value, 0), temp: num(hpData.temp, 0) },
    hitDice, senses, defenses, languages, armorProf, weaponProf,
    attacks, resources, features, inventory,
    currency: { pp: num(cur.pp), gp: num(cur.gp), ep: num(cur.ep), sp: num(cur.sp), cp: num(cur.cp) },
    carried, capacity,
    attunement: { max: num(sys.attributes?.attunement?.max, 3), items: inv.filter((x) => x.system?.attuned).map((x) => x.name) },
    casters, listClasses, slots, pact, spells,
    details: {
      player: notes.player ?? '',
      alignment,
      traits: notes.traits ?? htmlToText(textField(det.trait)),
      ideals: notes.ideals ?? htmlToText(textField(det.ideal)),
      bonds: notes.bonds ?? htmlToText(textField(det.bond)),
      flaws: notes.flaws ?? htmlToText(textField(det.flaw)),
      appearance: notes.appearance ?? htmlToText(textField(det.appearance)),
      backstory: notes.backstory ?? htmlToText(textField(det.biography)),
      allies: notes.allies ?? '',
      notes: notes.notes ?? '',
      age: String(det.age ?? ''), height: String(det.height ?? ''), weight: String(det.weight ?? ''), eyes: String(det.eyes ?? ''),
      skin: String(det.skin ?? ''), hair: String(det.hair ?? ''), gender: String(det.gender ?? ''), faith: String(det.faith ?? ''),
    },
    warnings: [...new Set(warnings)],
  };
}

/** Text values from the Foundry file (what the notes fields show before the player edits them). */
export function foundryNotes(actor: FActor): Partial<SheetNotes> {
  const d = actor.system?.details ?? {};
  return {
    traits: htmlToText(textField(d.trait)), ideals: htmlToText(textField(d.ideal)), bonds: htmlToText(textField(d.bond)),
    flaws: htmlToText(textField(d.flaw)), appearance: htmlToText(textField(d.appearance)), backstory: htmlToText(textField(d.biography)),
  };
}

export const spellLevelLabel = (l: number) => (l === 0 ? 'Заговоры' : `${l} уровень`);

/** Short line for a character card: 'Альтернативный друид 3 · Драконорождённый'. */
export function summaryOf(actor: FActor): string {
  const cls = actor.items.filter((x) => x.type === 'class').map((c) => `${c.name} ${num(c.system?.levels, 1)}`).join(' / ');
  const race = actor.items.find((x) => x.type === 'race')?.name ?? '';
  return [cls, race].filter(Boolean).join(' · ');
}
