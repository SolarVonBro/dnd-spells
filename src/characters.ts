// Character sheets: imported from Foundry VTT or created on the site; stored only in this browser (see userstore.ts).
import { createUserStore, downloadText, newId } from './userstore';
import { ImportError, isActorFile, parseActor, type FActor } from './foundry';
import { emptyManual, type ManualData } from './manualdata';
import type { Lang } from './types';

/** Print settings of a character sheet. */
export interface SheetOptions {
  /** Full texts of race, class and background features (otherwise names only). */
  featureText: boolean;
  /** Appendix with the full texts of the character's spells. */
  spellText: boolean;
  /** Language of spell names and texts taken from the site. */
  spellLang: Lang;
  /** Blank pages for spells written in by hand. */
  spellPages: number;
  /** Blank inventory pages. */
  itemPages: number;
  /** Lined pages for notes. */
  notePages: number;
  /** Empty rows for new spells under every spell level the character can cast. */
  spellRows: number;
  /** Print current hit points (otherwise the field is left empty for a pencil). */
  currentHp: boolean;
  /** Larger font. */
  large: boolean;
}

export const DEFAULT_OPTIONS: SheetOptions = {
  featureText: true, spellText: true, spellLang: 'ru', spellPages: 1, itemPages: 1, notePages: 2, spellRows: 2, currentHp: false, large: false,
};

/** Texts the player can fill in on the site; undefined = take from the Foundry file. */
export interface SheetNotes {
  player: string;
  alignment: string;
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  appearance: string;
  backstory: string;
  allies: string;
  notes: string;
}

export interface Character {
  id: string;
  name: string;
  /** Foundry data; for a character created on the site a small stub (classes and race for the card). */
  actor: FActor;
  /** Data of a character created on the site (no Foundry file): the sheet is computed from it. */
  manual?: ManualData;
  /** Portrait: a cropped 4:5 JPEG data URL (480×600), made in the browser. */
  photo?: string;
  /** The uploaded picture (reduced to 1024 px) and the crop, to crop again later. */
  photoSrc?: string;
  photoCrop?: { cx: number; cy: number; zoom: number };
  /** Name of the imported file ('' for a character created on the site). */
  file: string;
  imported: number;
  opts: SheetOptions;
  notes: Partial<SheetNotes>;
  /** Skill proficiency corrections: 0, 0.5 (half), 1, 2 (expertise). */
  skills: Record<string, number>;
  /** Skill ability corrections ('nat' -> 'wis' for Druidic Initiate). */
  skillAb?: Record<string, string>;
  /** Spell item id -> always prepared (true) or prepared each day (false); overrides the Foundry mode. */
  always: Record<string, boolean>;
  /** Limited-use features that are not printed in the resources block. */
  hiddenRes: string[];
  created: number;
  updated: number;
}

const store = createUserStore<Character>({
  lsKey: 'dnd.chars.v1',
  idbKey: 'chars',
  field: 'chars',
  validItem: (c) => {
    const x = c as Character;
    return Boolean(x && typeof x.id === 'string' && x.actor && Array.isArray(x.actor.items) && x.actor.system);
  },
});

export const loadCharacters = () => store.load();
export const useCharacters = () => store.use();
export const charactersReady = () => store.ready();
export const getCharacter = (id: string) => store.get(id);
export const updateCharacter = (id: string, patch: Partial<Omit<Character, 'id' | 'created'>>) => store.update(id, patch);
export const deleteCharacter = (id: string) => store.remove(id);

/** Options of a stored character with defaults for settings added later. */
export const optionsOf = (c: Character): SheetOptions => ({ ...DEFAULT_OPTIONS, ...(c.opts ?? {}) });

/** Foundry-like stub of a character created on the site: what the cards and the store's check read. */
export function stubActor(name: string, classes: { name: string; level: number }[], race: string): FActor {
  return {
    name, type: 'character', system: { abilities: {}, details: {} }, effects: [], sysVersion: null,
    items: [
      ...classes.map((c, i) => ({ _id: `cls${i}`, name: c.name, type: 'class', system: { levels: c.level } })),
      ...(race.trim() ? [{ _id: 'race', name: race.trim(), type: 'race', system: {} }] : []),
    ],
  };
}

/** A new character without a Foundry file. */
export function createManualCharacter(name: string): Character {
  const now = Date.now();
  const c: Character = {
    id: newId(), name, actor: stubActor(name, [], ''), manual: emptyManual(), file: '', imported: now, opts: { ...DEFAULT_OPTIONS },
    notes: {}, skills: {}, always: {}, hiddenRes: [], created: now, updated: now,
  };
  store.add(c);
  return c;
}

export function createCharacter(actor: FActor, file: string): Character {
  const now = Date.now();
  const c: Character = {
    id: newId(), name: actor.name, actor, file, imported: now, opts: { ...DEFAULT_OPTIONS }, notes: {}, skills: {}, always: {}, hiddenRes: [],
    created: now, updated: now,
  };
  store.add(c);
  return c;
}

/** Replace the Foundry data with a newer export; the player's notes and print settings stay. */
export function reimportCharacter(id: string, actor: FActor, file: string) {
  const c = getCharacter(id);
  if (!c) return;
  const known = new Set(actor.items.map((x) => x._id));
  const keep = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => known.has(k)));
  updateCharacter(id, {
    actor, file, imported: Date.now(),
    // A name typed on the site wins over the file; otherwise follow the file.
    name: c.name === c.actor.name ? actor.name : c.name,
    always: keep(c.always ?? {}),
    hiddenRes: (c.hiddenRes ?? []).filter((x) => known.has(x.replace(/^!/, '')) || x.startsWith('res:')),
  });
}

export type ImportResult = { kind: 'actor'; character: Character } | { kind: 'backup'; count: number };

/** A Foundry actor file (new character) or a backup file of this page (merged). */
export async function importFile(file: File): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new ImportError(`«${file.name}» — не JSON-файл.`);
  }
  if (isActorFile(json)) return { kind: 'actor', character: createCharacter(parseActor(json), file.name) };
  const count = store.restore(json);
  if (count != null) return { kind: 'backup', count };
  throw new ImportError(`«${file.name}» — это не персонаж Foundry VTT и не копия листов персонажей.`);
}

export async function readActorFile(file: File): Promise<FActor> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new ImportError(`«${file.name}» — не JSON-файл.`);
  }
  return parseActor(json);
}

export function exportCharacters() {
  downloadText(store.backup('dnd-characters'), `characters-${new Date().toISOString().slice(0, 10)}.json`);
}
