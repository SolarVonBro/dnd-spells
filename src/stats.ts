// Ability score calculator (D&D 5e, 2014): point buy, standard array, rolling (PHB or a custom formula), manual entry;
// increases from race / origin / class / feats; optional Sanity and Honor (DMG p. 264). Saved sets live in this browser.
import { createUserStore, downloadText } from './userstore';
import { FormulaError, parseFormula, rollFormula, secureRng, type Roll, type Rng } from './dice';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'san' | 'hon';
export type Optional = 'san' | 'hon';
export const CORE: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ALL: Ability[] = [...CORE, 'san', 'hon'];
export const ABIL: Record<Ability, { name: string; short: string }> = {
  str: { name: 'Сила', short: 'СИЛ' },
  dex: { name: 'Ловкость', short: 'ЛОВ' },
  con: { name: 'Телосложение', short: 'ТЕЛ' },
  int: { name: 'Интеллект', short: 'ИНТ' },
  wis: { name: 'Мудрость', short: 'МДР' },
  cha: { name: 'Харизма', short: 'ХАР' },
  san: { name: 'Здравомыслие', short: 'ЗДР' },
  hon: { name: 'Честь', short: 'ЧСТ' },
};

export type Method = 'pointbuy' | 'array' | 'roll' | 'manual';
export const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: 'pointbuy', label: 'Поинтбай', hint: '27 очков, значения от 8 до 15' },
  { id: 'array', label: 'Стандартный набор', hint: '15, 14, 13, 12, 10, 8' },
  { id: 'roll', label: 'Броски', hint: '4d6 без меньшей кости или своя формула' },
  { id: 'manual', label: 'Вручную', hint: 'любые значения от 1 до 30' },
];

/** Point buy costs (PHB p. 13). */
export const PB_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
/** House rule: the same curve extended to 3–18 (lower scores give points back). */
export const PB_EXT: Record<number, number> = { 3: -9, 4: -6, 5: -4, 6: -2, 7: -1, ...PB_COST, 16: 12, 17: 15, 18: 19 };
export const PB_BASE = 27;
/** DMG p. 264: +3 points and one 11 in the standard array for every optional ability. */
export const PB_PER_OPTIONAL = 3;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const OPTIONAL_ARRAY_VALUE = 11;

export const FORMULA_PRESETS = [
  { formula: '4d6kh3', label: '4d6, без меньшей кости', hint: 'правило «Книги игрока»' },
  { formula: '3d6', label: '3d6', hint: 'классика старых редакций' },
];

export interface RolledValue {
  id: string;
  value: number;
  roll: Roll;
  /** Not used: more values were rolled than needed and this is one of the lowest. */
  dropped: boolean;
  /** Rolled later for an ability added after the main roll. */
  extra?: boolean;
}
export interface RollAttempt { at: number; rolls: RolledValue[]; assign: Partial<Record<Ability, string | null>>; attempts: number; formula: string }

export type BonusKind = 'p21' | 'p111' | 'all1' | 'p2' | 'p11' | 'p1' | 'custom';
export const BONUS_KINDS: Record<BonusKind, { label: string; slots: number[]; source: string; hint: string }> = {
  p21: { label: '+2 / +1', slots: [2, 1], source: 'Раса', hint: 'раса или происхождение: +2 и +1 к двум разным характеристикам' },
  p111: { label: '+1 / +1 / +1', slots: [1, 1, 1], source: 'Происхождение', hint: '«Котёл Таши» (настройка происхождения): вместо +2/+1 — +1 к трём разным характеристикам' },
  all1: { label: '+1 ко всем', slots: [], source: 'Человек', hint: 'человек: +1 ко всем шести основным характеристикам' },
  p2: { label: '+2', slots: [2], source: 'Увеличение характеристик', hint: 'увеличение характеристик от класса: +2 к одной характеристике' },
  p11: { label: '+1 / +1', slots: [1, 1], source: 'Увеличение характеристик', hint: 'увеличение характеристик от класса (+1 к двум разным) или разновидность человека' },
  p1: { label: '+1', slots: [1], source: 'Черта', hint: 'черта с увеличением характеристики («полчерты»)' },
  custom: { label: 'Свои значения', slots: [], source: 'Прочее', hint: 'любые прибавки и штрафы: расы из старых книг, предметы, решения мастера' },
};
export interface Bonus {
  id: string;
  source: string;
  kind: BonusKind;
  /** Abilities for the slots of the kind (+2, +1...), '' while not chosen. */
  picks: (Ability | '')[];
  custom: Partial<Record<Ability, number>>;
}

export interface StatData {
  character: string;
  name: string;
  method: Method;
  san: boolean;
  hon: boolean;
  /** Point buy scores. */
  pb: Record<Ability, number>;
  /** null: the standard budget (27 + 3 per optional ability). */
  budget: number | null;
  extended: boolean;
  /** Standard array: ability -> pool item id ('a0'..'a5', 'x-san', 'x-hon'). */
  arrayAssign: Partial<Record<Ability, string>>;
  formula: string;
  /** How many values to roll (null: as many as there are abilities); extra ones drop the lowest. */
  count: number | null;
  inOrder: boolean;
  /** House rule: reroll the whole set while the sum of modifiers is below this (null: off). */
  minMods: number | null;
  rolls: RolledValue[];
  rollAssign: Partial<Record<Ability, string | null>>;
  attempts: number;
  rolledAt: number | null;
  history: RollAttempt[];
  manual: Record<Ability, number>;
  bonuses: Bonus[];
  notes: string;
}

const filled = <T,>(v: T) => Object.fromEntries(ALL.map((a) => [a, v])) as Record<Ability, T>;

export function emptyData(): StatData {
  return {
    character: '', name: '', method: 'pointbuy', san: false, hon: false,
    pb: filled(8), budget: null, extended: false,
    arrayAssign: Object.fromEntries(CORE.map((a, i) => [a, `a${i}`])),
    formula: '4d6kh3', count: null, inOrder: false, minMods: null,
    rolls: [], rollAssign: {}, attempts: 0, rolledAt: null, history: [],
    manual: filled(10), bonuses: [], notes: '',
  };
}

/** Fill gaps in stored data (older drafts, backup files). */
export function normalize(x: unknown): StatData {
  const d = { ...emptyData(), ...(x && typeof x === 'object' ? x as Partial<StatData> : {}) };
  d.pb = { ...filled(8), ...d.pb };
  d.manual = { ...filled(10), ...d.manual };
  if (!METHODS.some((m) => m.id === d.method)) d.method = 'pointbuy';
  for (const k of ['rolls', 'history', 'bonuses'] as const) if (!Array.isArray(d[k])) (d as any)[k] = [];
  return d;
}

export const active = (d: Pick<StatData, 'san' | 'hon'>): Ability[] => [...CORE, ...(d.san ? ['san' as const] : []), ...(d.hon ? ['hon' as const] : [])];
export const mod = (score: number) => Math.floor((score - 10) / 2);
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

/* ---------------- point buy ---------------- */

export const pbTable = (extended: boolean) => (extended ? PB_EXT : PB_COST);
export const pbRange = (extended: boolean): [number, number] => (extended ? [3, 18] : [8, 15]);
export const pbBudget = (d: StatData) => d.budget ?? PB_BASE + PB_PER_OPTIONAL * (Number(d.san) + Number(d.hon));
export const pbSpent = (d: StatData) => active(d).reduce((s, a) => s + (pbTable(d.extended)[d.pb[a]] ?? 0), 0);

/** Point buy cost of a set of scores (PHB table, or the extended one), null if a score is outside the table. */
export function pointBuyCost(scores: number[], extended = false): number | null {
  let sum = 0;
  for (const v of scores) {
    const c = pbTable(extended)[v];
    if (c == null) return null;
    sum += c;
  }
  return sum;
}

/* ---------------- standard array and rolls: pools ---------------- */

export interface PoolItem { id: string; value: number; note?: string }

export function arrayPool(d: StatData): PoolItem[] {
  return [
    ...STANDARD_ARRAY.map((value, i) => ({ id: `a${i}`, value })),
    ...(d.san ? [{ id: 'x-san', value: OPTIONAL_ARRAY_VALUE, note: 'за Здравомыслие' }] : []),
    ...(d.hon ? [{ id: 'x-hon', value: OPTIONAL_ARRAY_VALUE, note: 'за Честь' }] : []),
  ];
}
export const keptRolls = (d: StatData) => d.rolls.filter((r) => !r.dropped);
export const needed = (d: StatData) => active(d).length;

/** Give `a` the pool item `id`; whoever had it gets `a`'s previous item. */
export function swap<T extends string | null>(assign: Partial<Record<Ability, T>>, a: Ability, id: T): Partial<Record<Ability, T>> {
  const next = { ...assign };
  const prev = next[a] ?? null;
  const other = (Object.keys(next) as Ability[]).find((b) => b !== a && next[b] === id);
  if (other) next[other] = prev as T;
  next[a] = id;
  return next;
}

/* ---------------- scores ---------------- */

export function baseScores(d: StatData): Record<Ability, number | null> {
  const out = filled<number | null>(null);
  const pool = d.method === 'array' ? arrayPool(d) : keptRolls(d);
  for (const a of active(d)) {
    if (d.method === 'pointbuy') out[a] = d.pb[a];
    else if (d.method === 'manual') out[a] = d.manual[a];
    else {
      const id = d.method === 'array' ? d.arrayAssign[a] : d.rollAssign[a];
      out[a] = pool.find((p) => p.id === id)?.value ?? null;
    }
  }
  return out;
}

/** Which abilities a bonus can go to: Honor can't be raised with ability score increases (DMG p. 264). */
export const bonusTargets = (d: StatData, kind: BonusKind): Ability[] => (kind === 'custom' ? active(d) : active(d).filter((a) => a !== 'hon'));

export function bonusParts(d: StatData): Record<Ability, { source: string; value: number }[]> {
  const out = filled<{ source: string; value: number }[]>([]);
  for (const a of ALL) out[a] = [];
  const act = new Set(active(d));
  for (const b of d.bonuses) {
    const source = b.source.trim() || BONUS_KINDS[b.kind].source;
    if (b.kind === 'all1') { for (const a of CORE) out[a].push({ source, value: 1 }); continue; }
    if (b.kind === 'custom') {
      for (const [a, v] of Object.entries(b.custom) as [Ability, number][]) if (act.has(a) && v) out[a].push({ source, value: v });
      continue;
    }
    BONUS_KINDS[b.kind].slots.forEach((value, i) => {
      const a = b.picks[i];
      if (a && act.has(a) && a !== 'hon') out[a].push({ source, value });
    });
  }
  return out;
}

export function finalScores(d: StatData): Record<Ability, number | null> {
  const base = baseScores(d);
  const parts = bonusParts(d);
  const out = filled<number | null>(null);
  for (const a of active(d)) out[a] = base[a] == null ? null : base[a]! + parts[a].reduce((s, p) => s + p.value, 0);
  return out;
}

/** Space-separated line in the order СИЛ ЛОВ ТЕЛ ИНТ МДР ХАР [ЗДР ЧСТ]; null while a score is missing. */
export function scoresLine(d: StatData, kind: 'values' | 'mods' = 'values', which: 'final' | 'base' = 'final'): string | null {
  const s = which === 'final' ? finalScores(d) : baseScores(d);
  const list = active(d).map((a) => s[a]);
  if (list.some((v) => v == null)) return null;
  return list.map((v) => (kind === 'values' ? String(v) : signed(mod(v!)).replace('−', '-'))).join(' ');
}

/** Problems with a score: over 20 is above the limit of ability score increases; Honor stays within 1–20. */
export function scoreIssue(a: Ability, v: number | null): string | null {
  if (v == null) return null;
  if (v < 1) return 'Меньше 1 — так не бывает';
  if (a === 'hon' && v > 20) return 'Честь не может быть выше 20';
  if (v > 30) return 'Больше 30 — предел для характеристик';
  if (v > 20) return 'Выше 20: увеличения характеристик не поднимают значение выше 20 (кроме особых умений, например «Первобытного чемпиона» варвара — до 24)';
  return null;
}

/* ---------------- changes ---------------- */

export function setMethod(d: StatData, method: Method): StatData {
  const next = { ...d, method };
  // Manual entry starts from the current scores the first time.
  if (method === 'manual' && ALL.every((a) => d.manual[a] === 10)) {
    const base = baseScores(d);
    next.manual = { ...d.manual };
    for (const a of active(d)) if (base[a] != null) next.manual[a] = base[a]!;
  }
  return next;
}

export function toggleOptional(d: StatData, which: Optional, on: boolean): StatData {
  const next: StatData = { ...d, [which]: on };
  // Standard array: the ability brings its own 11 (and takes one 11 away when it goes).
  const aa = { ...d.arrayAssign };
  const own = `x-${which}`;
  if (on) aa[which] = own;
  else {
    const mine = aa[which];
    const holder = (Object.keys(aa) as Ability[]).find((b) => b !== which && aa[b] === own);
    if (holder && mine) aa[holder] = mine;
    delete aa[which];
  }
  next.arrayAssign = aa;
  // Rolls: a new ability waits for its own roll; a removed one takes its value away.
  const ra = { ...d.rollAssign };
  if (on) { if (d.rolls.length) ra[which] = null; } else {
    const id = ra[which];
    if (id) next.rolls = d.rolls.filter((r) => r.id !== id);
    delete ra[which];
  }
  next.rollAssign = ra;
  if (!on) next.bonuses = d.bonuses.map((b) => ({ ...b, picks: b.picks.map((p) => (p === which ? '' : p)) }));
  return next;
}

let seq = 0;
const rid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Roll the whole set. Throws FormulaError for a bad formula. */
export function rollSet(d: StatData, rng: Rng = secureRng): StatData {
  const f = parseFormula(d.formula);
  const act = active(d);
  const total = Math.max(act.length, Math.min(20, d.count ?? act.length));
  let rolls: RolledValue[] = [];
  let attempts = 0;
  for (;;) {
    attempts++;
    rolls = Array.from({ length: total }, () => {
      const roll = rollFormula(f, rng);
      return { id: rid(), value: roll.total, roll, dropped: false };
    });
    if (total > act.length) {
      // The lowest values are not used; among equal values the later ones go.
      const order = rolls.map((r, i) => i).sort((a, b) => rolls[a].value - rolls[b].value || b - a);
      for (const i of order.slice(0, total - act.length)) rolls[i].dropped = true;
    }
    const kept = rolls.filter((r) => !r.dropped);
    if (d.minMods == null || kept.reduce((s, r) => s + mod(r.value), 0) >= d.minMods || attempts >= 1000) break;
  }
  const kept = rolls.filter((r) => !r.dropped);
  const history = d.rolls.length
    ? [{ at: d.rolledAt ?? Date.now(), rolls: d.rolls, assign: d.rollAssign, attempts: d.attempts, formula: d.formula }, ...d.history].slice(0, 10)
    : d.history;
  return {
    ...d, rolls, attempts, rolledAt: Date.now(), history,
    rollAssign: Object.fromEntries(act.map((a, i) => [a, kept[i]?.id ?? null])),
  };
}

/** Roll the values still missing (an ability added after the roll). */
export function rollMissing(d: StatData, rng: Rng = secureRng): StatData {
  const f = parseFormula(d.formula);
  const rolls = [...d.rolls];
  const ra = { ...d.rollAssign };
  for (const a of active(d)) {
    if (ra[a]) continue;
    const roll = rollFormula(f, rng);
    const r: RolledValue = { id: rid(), value: roll.total, roll, dropped: false, extra: true };
    rolls.push(r);
    ra[a] = r.id;
  }
  return { ...d, rolls, rollAssign: ra };
}

export function restoreAttempt(d: StatData, i: number): StatData {
  const h = d.history[i];
  if (!h) return d;
  const current: RollAttempt = { at: d.rolledAt ?? Date.now(), rolls: d.rolls, assign: d.rollAssign, attempts: d.attempts, formula: d.formula };
  const history = d.history.filter((_, j) => j !== i);
  return { ...d, rolls: h.rolls, rollAssign: h.assign, attempts: h.attempts, rolledAt: h.at, history: d.rolls.length ? [current, ...history].slice(0, 10) : history };
}

/** Values in the order they were rolled (for "in order"). */
export function assignInOrder(d: StatData): StatData {
  const kept = keptRolls(d);
  return { ...d, rollAssign: Object.fromEntries(active(d).map((a, i) => [a, kept[i]?.id ?? null])) };
}

export { FormulaError };

/* ---------------- saved sets ---------------- */

export interface StatSet { id: string; created: number; updated: number; data: StatData }

const store = createUserStore<StatSet>({
  lsKey: 'dnd.stats.v1',
  idbKey: 'stats',
  field: 'sets',
  validItem: (x) => {
    const s = x as StatSet;
    return Boolean(s && typeof s.id === 'string' && s.data && typeof s.data === 'object');
  },
});

export const loadStatSets = () => store.load();
export const useStatSets = () => store.use();
export const statSetsReady = () => store.ready();
export const getStatSet = (id: string) => store.get(id);
export function addStatSet(id: string, data: StatData) {
  const now = Date.now();
  store.add({ id, created: now, updated: now, data });
}
export const updateStatSet = (id: string, data: StatData) => store.update(id, { data });
export const deleteStatSet = (id: string) => store.remove(id);
export const exportStatSets = () => downloadText(store.backup('dnd-stats'), `ability-scores-${new Date().toISOString().slice(0, 10)}.json`);
export async function importStatSets(file: File): Promise<number> {
  const n = store.restore(JSON.parse(await file.text()));
  if (n == null) throw new Error('not a backup of ability score sets');
  return n;
}

/* ---------------- the calculator's own state (survives reloads) ---------------- */

const DRAFT_KEY = 'dnd.stats.draft.v1';
export interface Draft { savedId: string | null; data: StatData }
export function readDraft(): Draft {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (v && typeof v === 'object') return { savedId: typeof v.savedId === 'string' ? v.savedId : null, data: normalize(v.data) };
  } catch { /* fresh start */ }
  return { savedId: null, data: emptyData() };
}
export function writeDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* the calculator still works */ }
}

export const sameData = (a: StatData, b: StatData) => JSON.stringify(a) === JSON.stringify(b);
export const isEmpty = (d: StatData) => sameData(d, emptyData());

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* fall back to a hidden text area */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
