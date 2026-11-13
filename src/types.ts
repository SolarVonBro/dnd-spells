export type Lang = 'en' | 'ru';
export interface L10n { en: string; ru: string | null }

export interface Version {
  id: string;
  group: string;
  source: string;
  page: number | null;
  homebrew: boolean;
  relation: 'alt' | 'same' | null;
  name: L10n;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  components: { v: boolean; s: boolean; m: boolean; r: boolean; cost: boolean; consumed: boolean };
  cast: string[];
  damage: string[];
  classes: string[];
  expanded: string[];
  subclasses: string[];
  time: L10n;
  range: L10n;
  duration: L10n;
  comps: L10n;
  text: L10n;
}

export interface Source {
  code: string; en: string; ru: string; homebrew: boolean; year: number | null; url: string | null; sort: number;
  author?: string;
  notes?: { en: { title: string | null; html: string }[]; ru: { title: string | null; html: string }[] | null };
}
export interface ClassInfo { code: string; en: string; ru: string; homebrew: boolean }
export interface SubclassInfo { id: string; class: string; en: string; ru: string | null; source: string }

export interface Dataset {
  version: string;
  sources: Source[];
  classes: ClassInfo[];
  subclasses: SubclassInfo[];
  spells: Version[];
}

/** One row of the list: an official spell and/or its Laserllama version. */
export interface SpellRecord {
  id: string;
  official?: Version;
  ll?: Version;
  versions: Version[];
  search: string;
}

export type Tri = 0 | 1 | -1; // any / required / excluded

export interface Filters {
  q: string;
  classes: string[];
  subclasses: string[];
  expanded: boolean;
  levels: number[];
  schools: string[];
  sources: string[];
  altOnly: boolean;
  concentration: Tri;
  ritual: Tri;
  comp: { v: Tri; s: Tri; m: Tri };
  cast: string[];
  damage: string[];
}
