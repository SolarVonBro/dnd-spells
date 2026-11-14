// User data stored only in this browser (character spell lists, character sheets).
// Two copies: localStorage and IndexedDB (database "dnd-user", separate from the spell data cache), so the data
// survives logout, a password change and dataset updates; it disappears only when the site data is cleared.
// The browser is also asked to keep the site's storage persistent (navigator.storage.persist).
import { useEffect, useState } from 'preact/hooks';

export interface StoredItem { id: string; updated: number }

/** Stored shape: `{ v: 1, [field]: T[], deleted: { id: time } }` (field is 'books' for spell lists). */
type Stored<T> = { v: 1; deleted: { [id: string]: number } } & { [field: string]: T[] | unknown };

export interface UserStore<T extends StoredItem> {
  load(): Promise<void>;
  ready(): boolean;
  all(): T[];
  get(id: string): T | null;
  use(): T[];
  add(item: T): void;
  update(id: string, patch: Partial<T>): void;
  remove(id: string): void;
  /** Backup file content: `{ app, v, [field], deleted }`. */
  backup(app: string): string;
  /** Merge items from a parsed backup file; deleted items come back. Returns the number of items in the file, or null if it is not a backup. */
  restore(data: unknown): number | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dnd-user', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let persistAsked = false;
function askPersistent() {
  if (persistAsked) return;
  persistAsked = true;
  try { void navigator.storage?.persist?.(); } catch { /* not supported */ }
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function createUserStore<T extends StoredItem>(opts: {
  lsKey: string;
  idbKey: string;
  field: string;
  validItem: (x: unknown) => boolean;
}): UserStore<T> {
  const { lsKey, idbKey, field } = opts;
  const empty = (): Stored<T> => ({ v: 1, [field]: [], deleted: {} }) as Stored<T>;
  const items = (s: Stored<T> | null) => (s?.[field] as T[] | undefined) ?? [];
  let state: Stored<T> = empty();
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());

  const valid = (x: unknown): x is Stored<T> => {
    const s = x as Stored<T>;
    return Boolean(s && Array.isArray(s[field]) && (s[field] as unknown[]).every(opts.validItem));
  };
  const readLs = (): Stored<T> | null => {
    try {
      const raw = localStorage.getItem(lsKey);
      const v = raw ? JSON.parse(raw) : null;
      return valid(v) ? { ...empty(), ...v } : null;
    } catch {
      return null;
    }
  };
  const readIdb = async (): Promise<Stored<T> | null> => {
    try {
      const db = await openDb();
      const v = await new Promise<unknown>((resolve) => {
        const req = db.transaction('kv').objectStore('kv').get(idbKey);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
      db.close();
      return valid(v) ? { ...empty(), ...v } : null;
    } catch {
      return null;
    }
  };
  const writeIdb = async (s: Stored<T>) => {
    try {
      const db = await openDb();
      db.transaction('kv', 'readwrite').objectStore('kv').put(s, idbKey);
      db.close();
    } catch { /* the localStorage copy is still there */ }
  };
  const writeLs = (s: Stored<T>) => {
    try { localStorage.setItem(lsKey, JSON.stringify(s)); } catch { /* full or blocked: the IndexedDB copy is still there */ }
  };

  /** Union of two copies: the newest version of every item; deletions win over older versions. */
  const merge = (a: Stored<T> | null, b: Stored<T> | null): Stored<T> => {
    const deleted: { [id: string]: number } = { ...(a?.deleted ?? {}) };
    for (const [id, t] of Object.entries(b?.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, t);
    const byId = new Map<string, T>();
    for (const item of [...items(a), ...items(b)]) {
      const prev = byId.get(item.id);
      if (!prev || item.updated > prev.updated) byId.set(item.id, item);
    }
    const list = [...byId.values()].filter((x) => !(deleted[x.id] >= x.updated));
    return { v: 1, [field]: list, deleted } as Stored<T>;
  };

  const save = (next: Stored<T>) => {
    state = next;
    writeLs(next);
    void writeIdb(next);
    askPersistent();
    emit();
  };
  const withItems = (list: T[], deleted = state.deleted) => ({ ...state, [field]: list, deleted }) as Stored<T>;

  // Other tabs: pick up their changes.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== lsKey) return;
      const ls = readLs();
      if (ls) { state = merge(state, ls); emit(); }
    });
  }

  return {
    async load() {
      if (loaded) return;
      const [ls, idb] = [readLs(), await readIdb()];
      state = merge(ls, idb);
      loaded = true;
      // Restore a copy that is missing or behind.
      const json = JSON.stringify(state);
      if (JSON.stringify(ls) !== json) writeLs(state);
      if (JSON.stringify(idb) !== json) void writeIdb(state);
      if (items(state).length) askPersistent();
      emit();
    },
    ready: () => loaded,
    all: () => items(state),
    get: (id) => items(state).find((x) => x.id === id) ?? null,
    use() {
      const [, force] = useState(0);
      useEffect(() => {
        const f = () => force((n) => n + 1);
        listeners.add(f);
        return () => { listeners.delete(f); };
      }, []);
      return items(state);
    },
    add(item) { save(withItems([...items(state), item])); },
    update(id, patch) {
      save(withItems(items(state).map((x) => (x.id === id ? { ...x, ...patch, updated: Date.now() } : x))));
    },
    remove(id) { save(withItems(items(state).filter((x) => x.id !== id), { ...state.deleted, [id]: Date.now() })); },
    backup(app) { return JSON.stringify({ app, ...state }, null, 1); },
    restore(data) {
      if (!valid(data)) return null;
      // Restoring from a file brings back items that were deleted here.
      const deleted = { ...state.deleted };
      for (const x of items(data)) delete deleted[x.id];
      save(merge({ ...state, deleted }, { ...empty(), [field]: items(data) } as Stored<T>));
      return items(data).length;
    },
  };
}

export function downloadText(text: string, name: string, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
