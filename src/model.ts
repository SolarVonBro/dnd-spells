import type { Dataset, Filters, Lang, SpellRecord, Tri, Version } from './types';
import { castBucket } from './i18n';

/** Prefix of Laserllama class filter values: "LL:Druid" = Laserllama's (alternate) Druid. */
export const LL_PREFIX = 'LL:';

/** Classes named in Laserllama spells (his alternate classes and his own: Magus, Psion, Shaman, Vessel). */
export const laserllamaClasses = (data: Dataset) => [...new Set(data.spells.filter((s) => s.homebrew).flatMap((s) => s.classes))];

/** Classes that have official spells (spell list or subclass spells). */
export const officialClasses = (data: Dataset) =>
  new Set(data.spells.filter((s) => !s.homebrew).flatMap((s) => [...s.classes, ...s.expanded, ...s.subclasses.map((x) => x.split(':')[0])]));

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[’'`]/g, '').replace(/[^a-zа-я0-9]+/g, ' ').trim();

export function buildRecords(data: Dataset): SpellRecord[] {
  const by = new Map<string, SpellRecord>();
  for (const v of data.spells) {
    let r = by.get(v.group);
    if (!r) { r = { id: v.group, versions: [], search: '' }; by.set(v.group, r); }
    if (v.homebrew) r.ll = v; else r.official = v;
  }
  for (const r of by.values()) {
    r.versions = [r.official, r.ll].filter(Boolean) as Version[];
    r.search = norm(r.versions.flatMap((v) => [v.name.en, v.name.ru ?? '']).join(' '));
  }
  return [...by.values()];
}

/** Classes that have no spell list of their own (their spells come from subclasses only). */
export function classesWithoutList(data: Dataset): Set<string> {
  // A real class spell list has many spells; a class feature that grants one spell (Monk's Empty Body ->
  // Astral Projection) does not make a spellcasting class, so such classes are handled via their subclasses.
  const size = new Map<string, number>();
  for (const v of data.spells) if (!v.homebrew) for (const c of [...v.classes, ...v.expanded]) size.set(c, (size.get(c) ?? 0) + 1);
  return new Set([...officialClasses(data)].filter((c) => (size.get(c) ?? 0) < 10));
}

export const EMPTY_FILTERS: Filters = {
  q: '', classes: [], subclasses: [], expanded: true, levels: [], schools: [], sources: [], altOnly: false,
  concentration: 0, ritual: 0, comp: { v: 0, s: 0, m: 0 }, cast: [], damage: [],
};

export function activeFilterCount(f: Filters) {
  return f.classes.length + f.subclasses.length + f.levels.length + f.schools.length + f.sources.length + f.cast.length +
    f.damage.length + (f.altOnly ? 1 : 0) + (f.concentration ? 1 : 0) + (f.ritual ? 1 : 0) +
    (f.comp.v ? 1 : 0) + (f.comp.s ? 1 : 0) + (f.comp.m ? 1 : 0);
}

const tri = (t: Tri, value: boolean) => t === 0 || (t === 1 ? value : !value);
const any = <T,>(selected: T[], values: T[]) => selected.length === 0 || values.some((x) => selected.includes(x));

/** Precomputed facts the class filter needs. */
export interface FilterContext {
  noList: Set<string>;
  /** Laserllama classes that have a full spell list from their class document. */
  llDocLists: Set<string>;
}

export const filterContext = (data: Dataset): FilterContext => ({
  noList: classesWithoutList(data),
  llDocLists: new Set((data.llClassLists ?? []).map((l) => l.class)),
});

export function versionMatches(v: Version, f: Filters, ctx: FilterContext): boolean {
  const { noList } = ctx;
  if (f.levels.length && !f.levels.includes(v.level)) return false;
  if (f.schools.length && !f.schools.includes(v.school)) return false;
  if (f.sources.length && !f.sources.includes(v.source)) return false;
  if (!tri(f.concentration, v.concentration) || !tri(f.ritual, v.ritual)) return false;
  if (!tri(f.comp.v, v.components.v) || !tri(f.comp.s, v.components.s) || !tri(f.comp.m, v.components.m)) return false;
  if (!any(f.cast, v.cast.map(castBucket))) return false;
  if (!any(f.damage, v.damage)) return false;
  if (f.classes.length) {
    // Two separate class lists: official D&D classes ("Druid") use the official spell lists and match only official
    // versions; Laserllama classes ("LL:Druid") use the compendium's class lists and match only Laserllama versions.
    const ok = f.classes.some((c) => {
      if (c.startsWith(LL_PREFIX)) {
        const llClass = c.slice(LL_PREFIX.length);
        // Full list from the class document (official and compendium spells); otherwise the compendium's class lines.
        return ctx.llDocLists.has(llClass) ? v.llLists.includes(llClass) : v.homebrew && v.classes.includes(llClass);
      }
      if (v.homebrew) return false;
      const subs = f.subclasses.filter((s) => s.startsWith(`${c}:`));
      const inList = v.classes.includes(c) || (f.expanded && v.expanded.includes(c));
      if (subs.length) return inList || v.subclasses.some((s) => subs.includes(s));
      return inList || (noList.has(c) && v.subclasses.some((s) => s.startsWith(`${c}:`)));
    });
    if (!ok) return false;
  }
  return true;
}

export interface Match { record: SpellRecord; version: Version }

export function filterRecords(records: SpellRecord[], f: Filters, ctx: FilterContext, lang: Lang): Match[] {
  const q = norm(f.q);
  const out: Match[] = [];
  for (const r of records) {
    if (q && !q.split(' ').every((w) => r.search.includes(w))) continue;
    if (f.altOnly && r.ll?.relation !== 'alt') continue;
    const version = r.versions.find((v) => versionMatches(v, f, ctx));
    if (version) out.push({ record: r, version });
  }
  const name = (m: Match) => (lang === 'ru' ? m.version.name.ru ?? m.version.name.en : m.version.name.en);
  return out.sort((a, b) => a.version.level - b.version.level || name(a).localeCompare(name(b), lang));
}

export const nameOf = (v: Version, lang: Lang) => (lang === 'ru' ? v.name.ru ?? v.name.en : v.name.en);
export const textOf = (v: Version, lang: Lang, field: 'time' | 'range' | 'duration' | 'comps' | 'text') =>
  lang === 'ru' ? v[field].ru ?? v[field].en : v[field].en;
export const hasRu = (v: Version) => Boolean(v.text.ru);
