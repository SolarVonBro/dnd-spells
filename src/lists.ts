// Character spell lists, stored only in this browser (see userstore.ts: localStorage + IndexedDB "dnd-user").
import { createUserStore, downloadText, newId } from './userstore';

/** A class of the character: official ('Wizard') or Laserllama ('LL:Druid'). */
export interface CharClass {
  cls: string;
  level: number;
  /** Subclass id ('Cleric:Life', 'Fighter:Eldritch Knight') or null. */
  sub: string | null;
  /** Spellcasting ability modifier (for the number of prepared spells), optional. */
  mod: number | null;
}

/** A spell in the list: spell group id, version ('o' official, 'l' Laserllama), class it is learned through ('' = other). */
export interface ListEntry { id: string; v: 'o' | 'l'; by: string }

export interface SpellBook {
  id: string;
  name: string;
  classes: CharClass[];
  spells: ListEntry[];
  created: number;
  updated: number;
}

const store = createUserStore<SpellBook>({
  lsKey: 'dnd.lists.v1',
  idbKey: 'lists',
  field: 'books',
  validItem: (b) => {
    const x = b as SpellBook;
    return Boolean(x && typeof x.id === 'string' && Array.isArray(x.spells) && Array.isArray(x.classes));
  },
});

export const loadLists = () => store.load();
export const useLists = () => store.use();
export const listsReady = () => store.ready();
export const getList = (id: string) => store.get(id);

export function createList(name: string, classes: CharClass[] = [], spells: ListEntry[] = []): SpellBook {
  const now = Date.now();
  const book: SpellBook = { id: newId(), name, classes, spells, created: now, updated: now };
  store.add(book);
  return book;
}

export const updateList = (id: string, patch: Partial<Omit<SpellBook, 'id' | 'created'>>) => store.update(id, patch);
export const deleteList = (id: string) => store.remove(id);

export const hasSpell = (book: SpellBook, id: string, v: 'o' | 'l') => book.spells.some((s) => s.id === id && s.v === v);

export function toggleSpell(bookId: string, entry: ListEntry) {
  const book = getList(bookId);
  if (!book) return;
  const on = hasSpell(book, entry.id, entry.v);
  updateList(bookId, { spells: on ? book.spells.filter((s) => !(s.id === entry.id && s.v === entry.v)) : [...book.spells, entry] });
}

/* ---- backup file ---- */

export function exportBackup() {
  downloadText(store.backup('dnd-spells'), `spell-lists-${new Date().toISOString().slice(0, 10)}.json`);
}

/** Merge lists from a backup file. Returns the number of lists in the file. */
export async function importBackup(file: File): Promise<number> {
  const n = store.restore(JSON.parse(await file.text()));
  if (n == null) throw new Error('not a spell list backup');
  return n;
}
