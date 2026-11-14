// Character spell lists, stored only in this browser.
// Two copies: localStorage and IndexedDB (database "dnd-user", separate from the spell data cache), so the lists
// survive logout, a password change and dataset updates; they disappear only when the site data is cleared.
// The browser is also asked to keep the site's storage persistent (navigator.storage.persist).
import { useEffect, useState } from 'preact/hooks';

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

interface Stored { v: 1; books: SpellBook[]; deleted: Record<string, number> }

const LS_KEY = 'dnd.lists.v1';
const EMPTY: Stored = { v: 1, books: [], deleted: {} };

let state: Stored = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/* ---- storage ---- */

function valid(x: unknown): x is Stored {
  const s = x as Stored;
  return Boolean(s && Array.isArray(s.books) && s.books.every((b) => b && typeof b.id === 'string' && Array.isArray(b.spells) && Array.isArray(b.classes)));
}

function readLs(): Stored | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return valid(v) ? { ...EMPTY, ...v } : null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dnd-user', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readIdb(): Promise<Stored | null> {
  try {
    const db = await openDb();
    const v = await new Promise<unknown>((resolve) => {
      const req = db.transaction('kv').objectStore('kv').get('lists');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return valid(v) ? { ...EMPTY, ...v } : null;
  } catch {
    return null;
  }
}

async function writeIdb(s: Stored) {
  try {
    const db = await openDb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(s, 'lists');
    db.close();
  } catch { /* the localStorage copy is still there */ }
}

function writeLs(s: Stored) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* the IndexedDB copy is still there */ }
}

/** Union of two copies: the newest version of every list; deletions win over older versions. */
function merge(a: Stored | null, b: Stored | null): Stored {
  const deleted: Record<string, number> = { ...(a?.deleted ?? {}) };
  for (const [id, t] of Object.entries(b?.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, t);
  const byId = new Map<string, SpellBook>();
  for (const book of [...(a?.books ?? []), ...(b?.books ?? [])]) {
    const prev = byId.get(book.id);
    if (!prev || book.updated > prev.updated) byId.set(book.id, book);
  }
  const books = [...byId.values()].filter((x) => !(deleted[x.id] >= x.updated));
  return { v: 1, books, deleted };
}

let persistAsked = false;
function askPersistent() {
  if (persistAsked) return;
  persistAsked = true;
  try { void navigator.storage?.persist?.(); } catch { /* not supported */ }
}

function save(next: Stored) {
  state = next;
  writeLs(next);
  void writeIdb(next);
  askPersistent();
  emit();
}

export async function loadLists() {
  if (loaded) return;
  const [ls, idb] = [readLs(), await readIdb()];
  state = merge(ls, idb);
  loaded = true;
  // Restore a copy that is missing or behind.
  const json = JSON.stringify(state);
  if (JSON.stringify(ls) !== json) writeLs(state);
  if (JSON.stringify(idb) !== json) void writeIdb(state);
  if (state.books.length) askPersistent();
  emit();
}

// Other tabs: pick up their changes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY) return;
    const ls = readLs();
    if (ls) { state = merge(state, ls); emit(); }
  });
}

/* ---- API ---- */

export function useLists(): SpellBook[] {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return state.books;
}

export const listsReady = () => loaded;

export const getList = (id: string) => state.books.find((b) => b.id === id) ?? null;

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function createList(name: string, classes: CharClass[] = []): SpellBook {
  const now = Date.now();
  const book: SpellBook = { id: newId(), name, classes, spells: [], created: now, updated: now };
  save({ ...state, books: [...state.books, book] });
  return book;
}

export function updateList(id: string, patch: Partial<Omit<SpellBook, 'id' | 'created'>>) {
  save({ ...state, books: state.books.map((b) => (b.id === id ? { ...b, ...patch, updated: Date.now() } : b)) });
}

export function deleteList(id: string) {
  save({ ...state, books: state.books.filter((b) => b.id !== id), deleted: { ...state.deleted, [id]: Date.now() } });
}

export const hasSpell = (book: SpellBook, id: string, v: 'o' | 'l') => book.spells.some((s) => s.id === id && s.v === v);

export function toggleSpell(bookId: string, entry: ListEntry) {
  const book = getList(bookId);
  if (!book) return;
  const on = hasSpell(book, entry.id, entry.v);
  updateList(bookId, { spells: on ? book.spells.filter((s) => !(s.id === entry.id && s.v === entry.v)) : [...book.spells, entry] });
}

/* ---- backup file ---- */

export function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'dnd-spells', ...state }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `spell-lists-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Merge lists from a backup file. Returns the number of lists in the file. */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text());
  if (!valid(data)) throw new Error('not a spell list backup');
  // Restoring from a file brings back lists that were deleted here.
  const deleted = { ...state.deleted };
  for (const b of data.books) delete deleted[b.id];
  save(merge({ ...state, deleted }, { ...EMPTY, books: data.books }));
  return data.books.length;
}
