// Spellcasting rules for character spell lists (PHB 2014, chapter 6 "Multiclassing"; TCE for the Artificer).
import type { CasterInfo, Dataset, Version } from './types';
import type { CharClass, SpellBook } from './lists';
import { LL_PREFIX } from './model';

export const ABILITY_RU: Record<CasterInfo['ability'], string> = { int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };
export const ABILITY_EN: Record<CasterInfo['ability'], string> = { int: 'INT', wis: 'WIS', cha: 'CHA' };

export interface ClassCaster {
  info: CasterInfo | null;
  /** Laserllama class without a class document: the official class table is used. */
  inherited: boolean;
}

export function casterFor(data: Dataset, c: CharClass): ClassCaster {
  const find = (key: string) => data.casters.find((x) => x.key === key) ?? null;
  if (c.cls.startsWith(LL_PREFIX)) {
    const own = find(c.cls);
    if (own) return { info: own, inherited: false };
    const official = find(c.cls.slice(LL_PREFIX.length));
    return { info: official, inherited: Boolean(official) };
  }
  return { info: (c.sub && find(c.sub)) || find(c.cls), inherited: false };
}

const at = <T,>(a: T[] | null | undefined, level: number) => (a ? a[Math.min(20, Math.max(1, level)) - 1] : undefined);

/** The class has the Spellcasting feature at this level (Paladin and Ranger from 2nd, Eldritch Knight from 3rd). */
export const hasSlots = (info: CasterInfo, level: number) =>
  info.progression === 'pact' ? (at(info.pact?.slots, level) ?? 0) > 0 : (at(info.slots, level) ?? []).some((n) => n > 0);

/** Highest spell level the class can learn at this class level (0 = cantrips only, -1 = no spells yet). */
export function maxSpellLevel(info: CasterInfo, level: number): number {
  let max = -1;
  if ((at(info.cantrips, level) ?? 0) > 0) max = 0;
  if (info.progression === 'pact') {
    max = Math.max(max, at(info.pact?.level, level) ?? 0);
    for (const [spell, cl] of Object.entries(info.arcanum ?? {})) if (level >= cl) max = Math.max(max, Number(spell));
  } else {
    (at(info.slots, level) ?? []).forEach((n, i) => { if (n > 0) max = Math.max(max, i + 1); });
  }
  return max;
}

/** Caster levels a class adds to the multiclass spell slot table. */
function casterLevels(info: CasterInfo, level: number) {
  switch (info.progression) {
    case 'full': return level;
    case '1/2': return Math.floor(level / 2);
    case '1/3': return Math.floor(level / 3);
    case 'artificer': return Math.ceil(level / 2);
    default: return 0;
  }
}

export interface SlotSummary {
  /** Spell slots of levels 1-9. */
  slots: number[];
  /** Multiclass caster level when the multiclass table is used. */
  casterLevel: number | null;
  pact: { slots: number; level: number; arcanum: number[] } | null;
}

export function slotSummary(data: Dataset, book: SpellBook): SlotSummary {
  const entries = book.classes.map((c) => ({ c, info: casterFor(data, c).info }));
  const casting = entries.filter((e) => e.info && e.info.progression !== 'pact' && hasSlots(e.info, e.c.level));
  let slots = Array(9).fill(0);
  let casterLevel: number | null = null;
  if (casting.length === 1) slots = [...(at(casting[0].info!.slots, casting[0].c.level) ?? slots)];
  else if (casting.length > 1) {
    casterLevel = casting.reduce((n, e) => n + casterLevels(e.info!, e.c.level), 0);
    if (casterLevel > 0) slots = [...(at(data.multiclassSlots, casterLevel) ?? slots)];
  }
  const warlock = entries.find((e) => e.info?.progression === 'pact' && hasSlots(e.info, e.c.level));
  const pact = warlock ? {
    slots: at(warlock.info!.pact!.slots, warlock.c.level)!,
    level: at(warlock.info!.pact!.level, warlock.c.level)!,
    arcanum: Object.entries(warlock.info!.arcanum ?? {}).filter(([, cl]) => warlock.c.level >= cl).map(([s]) => Number(s)),
  } : null;
  return { slots, casterLevel, pact };
}

export interface ClassLimits {
  ability: CasterInfo['ability'];
  maxLevel: number;
  cantrips: number | null;
  known: number | null;
  spellbook: number | null;
  /** Number of prepared spells (null if the modifier is not set). */
  prepared: number | null;
  preparedRule: CasterInfo['prepared'];
}

export function classLimits(info: CasterInfo, c: CharClass): ClassLimits {
  const lvl = c.level;
  let prepared: number | null = null;
  if (info.prepared && c.mod != null) prepared = Math.max(1, (info.prepared === 'half' ? Math.floor(lvl / 2) : lvl) + c.mod);
  return {
    ability: info.ability,
    maxLevel: maxSpellLevel(info, lvl),
    cantrips: info.cantrips ? at(info.cantrips, lvl)! : null,
    known: info.known ? at(info.known, lvl)! : null,
    spellbook: info.spellbook ? at(info.spellbook, lvl)! : null,
    prepared,
    preparedRule: info.prepared,
  };
}

/** The spell version is on the class's spell list (official lists for official classes, Laserllama lists for his). */
export function onClassList(data: Dataset, v: Version, c: CharClass): boolean {
  if (c.cls.startsWith(LL_PREFIX)) {
    const llClass = c.cls.slice(LL_PREFIX.length);
    const hasDoc = (data.llClassLists ?? []).some((l) => l.class === llClass);
    return hasDoc ? v.llLists.includes(llClass) : v.homebrew && v.classes.includes(llClass);
  }
  if (v.homebrew) return false;
  return v.classes.includes(c.cls) || v.expanded.includes(c.cls) || Boolean(c.sub && v.subclasses.includes(c.sub));
}

/** Subclass spells of prepared casters (domain, oath, circle...) are always prepared and do not count. */
export const alwaysPrepared = (info: CasterInfo | null, v: Version, c: CharClass) =>
  Boolean(info?.prepared && c.sub && v.subclasses.includes(c.sub));

/** The class a newly added spell goes to: the first class whose list has it and that can cast its level. */
export function classForSpell(data: Dataset, book: SpellBook, v: Version): string {
  const fits = (c: CharClass) => {
    if (!onClassList(data, v, c)) return false;
    const { info } = casterFor(data, c);
    return !info || maxSpellLevel(info, c.level) >= v.level;
  };
  return (book.classes.find(fits) ?? book.classes.find((c) => onClassList(data, v, c)))?.cls ?? '';
}
