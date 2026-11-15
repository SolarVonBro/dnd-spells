// Synchronization of the user's data (spell lists, characters, ability score sets) between devices through the hidden
// app data folder of the user's own Google Drive (scope drive.appdata: the site sees only its own file there).
// No server: Google Identity Services gives a short-lived access token (kept only in memory), the Drive REST API stores
// one JSON file. Merging: the newest version of every item wins, deletions included (userstore.mergeRemote).
import { useEffect, useState } from 'preact/hooks';
import { listStore } from './lists';
import { charStore } from './characters';
import { statStore } from './stats';
import type { UserStore, StoredItem } from './userstore';

const CLIENT_ID = '863322834561-mh03u2c2lte8opulhprddbjkstsj3suc.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE = 'dnd-sync.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const META_KEY = 'dnd.gsync';

const STORES: { key: string; store: UserStore<StoredItem> }[] = [
  { key: 'lists', store: listStore as unknown as UserStore<StoredItem> },
  { key: 'chars', store: charStore as unknown as UserStore<StoredItem> },
  { key: 'stats', store: statStore as unknown as UserStore<StoredItem> },
];

export type SyncStatus = 'off' | 'login' | 'syncing' | 'ok' | 'error';
export interface SyncState {
  status: SyncStatus;
  /** The Google account (from Drive), if known. */
  email: string | null;
  lastSync: number | null;
  /** Changes here that are not on the Drive yet (no access token at the moment). */
  pending: boolean;
  error: string | null;
}

/* ---------------- state ---------------- */

interface Meta { on: boolean; email: string | null; lastSync: number | null }
const readMeta = (): Meta => {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
    if (m && typeof m === 'object') return { on: Boolean(m.on), email: typeof m.email === 'string' ? m.email : null, lastSync: typeof m.lastSync === 'number' ? m.lastSync : null };
  } catch { /* none */ }
  return { on: false, email: null, lastSync: null };
};
const writeMeta = (m: Meta) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* the session still syncs */ } };

let meta = readMeta();
let token: { value: string; exp: number } | null = null;
let state: SyncState = { status: meta.on ? 'login' : 'off', email: meta.email, lastSync: meta.lastSync, pending: false, error: null };
const listeners = new Set<() => void>();
const setState = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach((f) => f()); };

export function useSync(): SyncState {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return state;
}

/* ---------------- Google Identity Services ---------------- */

interface TokenResponse { access_token?: string; expires_in?: number; error?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string; hint?: string }): void }
interface Gis {
  accounts: { oauth2: {
    initTokenClient(c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): TokenClient;
    revoke(token: string, done?: () => void): void;
  } };
}
const gisApi = () => (window as unknown as { google?: Gis }).google;

let gisLoad: Promise<void> | null = null;
/** The Google sign-in script, loaded only when synchronization is used. */
export function loadGis(): Promise<void> {
  if (gisApi()?.accounts?.oauth2) return Promise.resolve();
  gisLoad ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoad = null; reject(new Error('Не удалось загрузить вход Google. Проверьте соединение.')); };
    document.head.appendChild(s);
  });
  return gisLoad;
}

let client: TokenClient | null = null;
let waiting: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

const ERRORS: Record<string, string> = {
  access_denied: 'Google не дал доступ: этого аккаунта нет в списке разрешённых или доступ отклонён.',
  popup_closed: 'Окно входа Google закрыто.',
  popup_failed_to_open: 'Браузер заблокировал окно входа Google — разрешите всплывающие окна для этого сайта.',
};

/** Ask Google for an access token. Must run inside a click: it opens Google's window (closes by itself after the first time). */
function requestToken(): Promise<string> {
  const g = gisApi();
  if (!g?.accounts?.oauth2) return Promise.reject(new Error('Вход Google ещё загружается — попробуйте ещё раз через секунду.'));
  client ??= g.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (r) => {
      const w = waiting;
      waiting = null;
      if (!w) return;
      if (r.error || !r.access_token) w.reject(new Error(ERRORS[r.error ?? ''] ?? `Google: ${r.error ?? 'нет доступа'}.`));
      else {
        token = { value: r.access_token, exp: Date.now() + Math.max(60, (r.expires_in ?? 3600) - 120) * 1000 };
        w.resolve(r.access_token);
      }
    },
    error_callback: (e) => {
      const w = waiting;
      waiting = null;
      w?.reject(new Error(ERRORS[e.type] ?? `Google: ${e.type}.`));
    },
  });
  return new Promise((resolve, reject) => {
    waiting?.reject(new Error('Новый запрос входа.'));
    waiting = { resolve, reject };
    client!.requestAccessToken({ prompt: '', hint: meta.email ?? undefined });
  });
}

const hasToken = () => Boolean(token && token.exp > Date.now());

/* ---------------- Drive ---------------- */

class AuthError extends Error {}

async function drive(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasToken()) throw new AuthError('no token');
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token!.value}` } });
  if (r.status === 401) { token = null; throw new AuthError('expired'); }
  if (!r.ok) throw new Error(`Google Drive: ошибка ${r.status}.`);
  return r;
}

interface Payload { app: 'dnd-sync'; v: 1; updated: number; stores: Record<string, unknown> }

async function listFiles(): Promise<{ id: string; modifiedTime: string }[]> {
  const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
  const r = await drive(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10`);
  return ((await r.json()).files ?? []) as { id: string; modifiedTime: string }[];
}

async function download(id: string): Promise<Payload | null> {
  const r = await drive(`${API}/files/${encodeURIComponent(id)}?alt=media`);
  try {
    const p = await r.json();
    return p && p.app === 'dnd-sync' && p.stores && typeof p.stores === 'object' ? p as Payload : null;
  } catch {
    return null;
  }
}

async function upload(id: string | null, body: string): Promise<string> {
  if (id) {
    await drive(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return id;
  }
  const b = `dnd${Math.random().toString(36).slice(2)}`;
  const metaPart = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
  const r = await drive(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
  });
  return (await r.json()).id as string;
}

async function accountEmail(): Promise<string | null> {
  try {
    const r = await drive(`${API}/about?fields=user(emailAddress)`);
    return ((await r.json()).user?.emailAddress as string | undefined) ?? null;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    return null;
  }
}

/* ---------------- synchronization ---------------- */

let busy = false;
let again = false;
let applying = false;

async function run(): Promise<void> {
  if (busy) { again = true; return; }
  if (!hasToken()) { setState({ status: 'login' }); return; }
  busy = true;
  setState({ status: 'syncing', error: null });
  try {
    await Promise.all(STORES.map((s) => s.store.load()));
    if (!meta.email) {
      const email = await accountEmail();
      if (email) { meta = { ...meta, email }; writeMeta(meta); setState({ email }); }
    }
    const files = await listFiles();
    // Normally one file; two may appear if two devices created it at once: all are merged, the extra ones go.
    const remotes = (await Promise.all(files.map((f) => download(f.id)))).filter(Boolean) as Payload[];
    applying = true;
    try {
      for (const r of remotes) for (const s of STORES) if (r.stores[s.key]) s.store.mergeRemote(r.stores[s.key]);
    } finally {
      applying = false;
    }
    const stores = Object.fromEntries(STORES.map((s) => [s.key, s.store.snapshot()]));
    const same = remotes.length === 1 && files.length === 1 && JSON.stringify(remotes[0].stores) === JSON.stringify(stores);
    if (!same) {
      const payload: Payload = { app: 'dnd-sync', v: 1, updated: Date.now(), stores };
      await upload(files[0]?.id ?? null, JSON.stringify(payload));
      for (const f of files.slice(1)) await drive(`${API}/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' }).catch(() => {});
    }
    meta = { ...meta, on: true, lastSync: Date.now() };
    writeMeta(meta);
    setState({ status: 'ok', lastSync: meta.lastSync, pending: false, error: null });
  } catch (e) {
    if (e instanceof AuthError) setState({ status: 'login' });
    else setState({ status: 'error', error: e instanceof Error ? e.message : 'Ошибка синхронизации.' });
  } finally {
    busy = false;
    if (again) { again = false; void run(); }
  }
}

/** The sync button: sign in to Google if needed (inside the click), then synchronize. */
export async function syncNow(): Promise<void> {
  if (!hasToken()) {
    try {
      await requestToken();
    } catch (e) {
      setState({ status: meta.on ? 'login' : 'off', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    meta = { ...meta, on: true };
    writeMeta(meta);
  }
  await run();
}

/** Turn synchronization off on this device; the data stay here and on the Drive. */
export function disconnect() {
  const t = token?.value;
  token = null;
  if (t) gisApi()?.accounts.oauth2.revoke(t);
  meta = { on: false, email: null, lastSync: null };
  writeMeta(meta);
  setState({ status: 'off', email: null, lastSync: null, pending: false, error: null });
}

/** Delete the copy on the Google Drive (the data on this device stay). */
export async function deleteRemote(): Promise<void> {
  if (!hasToken()) await requestToken();
  try {
    for (const f of await listFiles()) await drive(`${API}/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
    setState({ error: null });
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : 'Не удалось удалить копию.' });
  }
}

/* ---------------- automatic runs ---------------- */

let timer: number | undefined;
let started = false;

/** Start listening: changes are sent a few seconds later; returning to the tab picks up changes from other devices. */
export function startSync() {
  if (started) return;
  started = true;
  if (meta.on) void loadGis().catch(() => {});
  for (const s of STORES) {
    s.store.subscribe(() => {
      if (applying || !meta.on) return;
      if (!hasToken()) { if (!state.pending) setState({ pending: true, status: 'login' }); return; }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 3000);
    });
  }
  const refresh = () => {
    if (document.visibilityState !== 'visible' || !meta.on) return;
    if (!hasToken()) { if (state.status !== 'login') setState({ status: 'login' }); return; }
    if (!state.lastSync || Date.now() - state.lastSync > 20_000) void run();
  };
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
}
