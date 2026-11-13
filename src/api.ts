// Static-site data access: the dataset is an encrypted file (src/data/spells.bin, hashed by Vite).
// The password is entered once; the derived key is remembered in localStorage.
import type { Dataset } from './types';
import bundleUrl from './data/spells.bin?url';
import { decryptBundle, deriveKey, fromB64, toB64, WrongPasswordError } from './crypto';

export { WrongPasswordError };

const KEY = 'dnd.key';
const safe = <T,>(fn: () => T, fallback: T): T => {
  try { return fn(); } catch { return fallback; }
};
export const getKey = () => safe(() => { const k = localStorage.getItem(KEY); return k ? fromB64(k) : null; }, null);
const setKey = (k: Uint8Array<ArrayBuffer>) => safe(() => localStorage.setItem(KEY, toB64(k)), undefined);
export const clearKey = () => safe(() => localStorage.removeItem(KEY), undefined);

let bundlePromise: Promise<ArrayBuffer> | null = null;
function fetchBundle() {
  bundlePromise ??= fetch(bundleUrl).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.arrayBuffer();
  });
  bundlePromise.catch(() => { bundlePromise = null; });
  return bundlePromise;
}

/** Check the password by decrypting the data; remembers the key on success. */
export async function login(password: string): Promise<{ ok: true; data: Dataset } | { ok: false; reason: 'wrong' | 'error' }> {
  try {
    const bundle = await fetchBundle();
    const key = await deriveKey(password, bundle);
    const data = await decryptBundle<Dataset>(bundle, key);
    setKey(key);
    writeCache(data);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: e instanceof WrongPasswordError ? 'wrong' : 'error' };
  }
}

/** Load the dataset with the remembered key: from the local cache if it is current, otherwise decrypt the file. */
export async function loadDataset(): Promise<Dataset> {
  const key = getKey();
  if (!key) throw new WrongPasswordError('no key');
  const cached = await readCache();
  if (cached && cached.bundle === bundleUrl) return cached.data;
  const data = await decryptBundle<Dataset>(await fetchBundle(), key);
  writeCache(data);
  return data;
}

/* ---- IndexedDB cache of the decrypted dataset (~2 MB) ---- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dnd-spells', 2);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readCache(): Promise<{ bundle: string; data: Dataset } | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction('kv').objectStore('kv').get('dataset');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function writeCache(data: Dataset | null) {
  try {
    const db = await openDb();
    const store = db.transaction('kv', 'readwrite').objectStore('kv');
    if (data) store.put({ bundle: bundleUrl, data }, 'dataset'); else store.delete('dataset');
  } catch { /* cache is optional */ }
}
