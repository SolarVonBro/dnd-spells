// Labels and lookups shared by the spell list screens and the PDF export.
import type { Dataset, Lang, SpellRecord, Version } from './types';
import type { ListEntry } from './lists';
import { LL_PREFIX } from './model';

export function classLabel(data: Dataset, cls: string, lang: Lang = 'ru') {
  const ll = cls.startsWith(LL_PREFIX);
  const code = ll ? cls.slice(LL_PREFIX.length) : cls;
  const c = data.classes.find((x) => x.code === code);
  const name = c ? (lang === 'ru' ? c.ru : c.en) : code;
  return ll ? `${name} (Laserllama)` : name;
}

export function subclassLabel(data: Dataset, id: string, lang: Lang = 'ru') {
  const s = data.subclasses.find((x) => x.id === id);
  return s ? (lang === 'ru' ? s.ru ?? s.en : s.en) : id.split(':')[1] ?? id;
}

let cache: { data: Dataset; map: Map<string, Version> } | null = null;

/** The spell version a list entry points to (falls back to the other version if the data changed). */
export function entryVersion(data: Dataset, e: ListEntry, records?: Map<string, SpellRecord>): Version | null {
  const r = records?.get(e.id);
  if (r) return (e.v === 'l' ? r.ll ?? r.official : r.official ?? r.ll) ?? null;
  if (cache?.data !== data) {
    const map = new Map<string, Version>();
    for (const v of data.spells) map.set(`${v.group}|${v.homebrew ? 'l' : 'o'}`, v);
    cache = { data, map };
  }
  return cache.map.get(`${e.id}|${e.v}`) ?? cache.map.get(`${e.id}|${e.v === 'l' ? 'o' : 'l'}`) ?? null;
}

export const classesSummary = (data: Dataset, b: { classes: { cls: string; level: number }[] }, lang: Lang = 'ru') =>
  b.classes.map((c) => `${classLabel(data, c.cls, lang)} ${c.level}`).join(' / ');

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
