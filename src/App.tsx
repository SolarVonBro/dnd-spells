import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Dataset, Filters, Lang } from './types';
import { WrongPasswordError, clearKey, getKey, loadDataset, login, writeCache } from './api';
import { EMPTY_FILTERS, activeFilterCount, buildRecords, filterContext, filterRecords } from './model';
import { FilterBar } from './components/FilterBar';
import { SpellList } from './components/SpellList';
import { SpellDetail, type View } from './components/SpellDetail';
import { Icon, Segmented } from './components/ui';

const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? { ...d as any, ...JSON.parse(v) } : d; } catch { return d; } },
  getStr(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* optional */ } },
};

function parseHash(): { id: string | null; view: View } {
  const [id, view] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  return { id: id || null, view: view === 'll' || view === 'compare' ? view : 'official' };
}

function Login({ onDone, expired }: { onDone: (data: Dataset) => void; expired: boolean }) {
  const [pw, setPw] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'wrong' | 'error'>('idle');
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!pw) return;
    setState('busy');
    const r = await login(pw);
    if (r.ok) onDone(r.data); else setState(r.reason);
  };
  return (
    <main class="login">
      <form onSubmit={submit} class="login-card">
        <div class="sigil" aria-hidden="true">✦</div>
        <h1>Книга заклинаний</h1>
        <p>D&amp;D 5e (2014) и хоумбрю Laserllama. Сайт закрыт паролем — введите его один раз, браузер запомнит.</p>
        {expired && <p class="err">Пароль сменился — введите новый.</p>}
        <label for="pw">Пароль</label>
        <input id="pw" type="password" autocomplete="current-password" value={pw} autoFocus
          onInput={(e) => { setPw((e.target as HTMLInputElement).value); setState('idle'); }} />
        {state === 'wrong' && <p class="err" role="alert">Неверный пароль.</p>}
        {state === 'error' && <p class="err" role="alert">Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.</p>}
        <button class="btn primary" type="submit" disabled={state === 'busy' || !pw}>{state === 'busy' ? 'Проверяю…' : 'Войти'}</button>
      </form>
    </main>
  );
}

function Welcome({ data, total, onLogout }: { data: Dataset; total: number; onLogout: () => void }) {
  const ll = data.sources.find((s) => s.homebrew);
  const alt = data.spells.filter((s) => s.relation === 'alt').length;
  return (
    <div class="welcome">
      <h2>Книга заклинаний</h2>
      <p>{total} заклинаний: {data.spells.filter((s) => !s.homebrew).length} официальных из {data.sources.length - 1} книг редакции 2014 года
        и {data.spells.filter((s) => s.homebrew).length} от Laserllama, из них {alt} — альтернативные версии официальных (пометка <span class="tag alt">ALT</span>).</p>
      <p>Выберите заклинание в списке. У заклинаний с ALT-версией можно переключиться на версию Laserllama или открыть их рядом для сравнения.</p>
      <ul class="kbd-help">
        <li><kbd>/</kbd> — поиск</li>
        <li><kbd>Esc</kbd> — закрыть заклинание</li>
      </ul>
      {ll?.notes && (
        <details class="ll-notes">
          <summary>Новые времена накладывания Laserllama</summary>
          {(ll.notes.ru ?? ll.notes.en).map((n) => (
            <div>{n.title && <h4>{n.title}</h4>}<p dangerouslySetInnerHTML={{ __html: n.html }} /></div>
          ))}
        </details>
      )}
      <p class="small">Тексты официальных заклинаний: книги WotC (английский), переводы ttg.club (русский).
        Хоумбрю: <a href={ll?.url ?? '#'} target="_blank" rel="noopener noreferrer">{ll?.ru}</a>, автор <a href={ll?.author ?? '#'} target="_blank" rel="noopener noreferrer">laserllama</a>; перевод на русский неофициальный.</p>
      <button type="button" class="btn ghost" onClick={onLogout}><Icon name="logout" size={18} /> Выйти на этом устройстве</button>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<'checking' | 'login' | 'ready'>(getKey() ? 'checking' : 'login');
  const [expired, setExpired] = useState(false);
  const [data, setData] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>(() => (store.getStr('dnd.lang', 'en') === 'ru' ? 'ru' : 'en'));
  const [spellLang, setSpellLang] = useState<Record<string, Lang>>({});
  const [filters, setFiltersState] = useState<Filters>(() => ({ ...store.get('dnd.filters.v2', EMPTY_FILTERS), q: '' }));
  const [route, setRoute] = useState(parseHash);
  const pushed = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Remembered key: load the dataset (local cache if current, otherwise decrypt the published file).
  useEffect(() => {
    if (!getKey()) return;
    let alive = true;
    loadDataset()
      .then((d) => { if (alive) { setData(d); setAuth('ready'); } })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof WrongPasswordError) { clearKey(); writeCache(null); setExpired(true); setAuth('login'); }
        else { setLoadError('Не удалось загрузить заклинания. Проверьте соединение и обновите страницу.'); setAuth('ready'); }
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const on = () => { setRoute(parseHash()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const records = useMemo(() => (data ? buildRecords(data) : []), [data]);
  const ctx = useMemo(() => (data ? filterContext(data) : { noList: new Set<string>(), llDocLists: new Set<string>() }), [data]);
  const subclassCounts = useMemo(() => {
    const m = new Map<string, number>();
    data?.spells.forEach((s) => s.subclasses.forEach((id) => m.set(id, (m.get(id) ?? 0) + 1)));
    return m;
  }, [data]);
  const matches = useMemo(() => filterRecords(records, filters, ctx, lang), [records, filters, ctx, lang]);
  const selected = route.id ? records.find((r) => r.id === route.id) ?? null : null;

  const setFilters = (f: Filters) => { setFiltersState(f); store.set('dnd.filters.v2', { ...f, q: '' }); };
  const setLang = (l: Lang) => { setLangState(l); setSpellLang({}); store.set('dnd.lang', l); };

  const open = (id: string, view: View = 'official') => {
    const hash = `#/${encodeURIComponent(id)}${view === 'official' ? '' : `/${view}`}`;
    if (location.hash === hash) return;
    if (route.id) history.replaceState(null, '', hash); else { history.pushState(null, '', hash); pushed.current = true; }
    setRoute(parseHash());
  };
  const close = () => {
    if (pushed.current) { pushed.current = false; history.back(); }
    else { history.replaceState(null, '', location.pathname + location.search); setRoute(parseHash()); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.('input, textarea');
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      // Escape inside an open filter popover is handled by the popover itself.
      if (e.key === 'Escape' && route.id && !typing && !document.querySelector('.pop')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Lock background scroll while the full-screen spell card is open on phones.
  useEffect(() => {
    document.body.classList.toggle('layer-open', Boolean(selected));
  }, [selected]);

  const logout = () => { clearKey(); writeCache(null); setData(null); setExpired(false); setAuth('login'); };

  if (auth === 'login') return <Login expired={expired} onDone={(d) => { setData(d); setExpired(false); setAuth('ready'); }} />;
  if (!data) {
    return <main class="loading">{loadError ? <p class="err">{loadError}</p> : <div class="spinner" aria-label="Загрузка" />}</main>;
  }

  const count = activeFilterCount(filters);

  return (
    <div class={`app${selected ? ' has-detail' : ''}${selected && route.view === 'compare' ? ' comparing' : ''}`}>
      <header class="topbar">
        <a class="brand" href="#" onClick={(e) => { e.preventDefault(); if (route.id) close(); }} aria-label="Книга заклинаний">
          <span class="sigil" aria-hidden="true">✦</span><span class="brand-name">Книга заклинаний</span>
        </a>
        <div class="search">
          <Icon name="search" size={18} />
          <input ref={searchRef} type="search" placeholder="Поиск по названию (EN / RU)" value={filters.q} aria-label="Поиск"
            onInput={(e) => { setFiltersState({ ...filters, q: (e.target as HTMLInputElement).value }); listRef.current?.scrollTo({ top: 0 }); }} />
        </div>
        <Segmented label="Язык заклинаний" value={lang} onChange={setLang}
          options={[{ value: 'en', label: 'EN', title: 'Тексты на английском (оригинал)' }, { value: 'ru', label: 'RU', title: 'Тексты на русском' }]} />
        <FilterBar data={data} filters={filters} onChange={setFilters} subclassCounts={subclassCounts} noList={ctx.noList} resultCount={matches.length} />
      </header>

      <div class="listcol" ref={listRef}>
        <div class="list-status">
          <span>{matches.length} {plural(matches.length)}</span>
          {count > 0 && <button type="button" class="link" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>сбросить фильтры</button>}
        </div>
        {loadError && <p class="err">{loadError}</p>}
        <SpellList matches={matches} lang={lang} selected={route.id}
          onSelect={(id, v) => open(id, v === 'll' && records.find((r) => r.id === id)?.official ? 'll' : 'official')} />
      </div>

      <main class="detailcol">
        {selected ? (
          <SpellDetail key={selected.id} data={data} record={selected} view={route.view}
            lang={spellLang[selected.id] ?? lang}
            onLang={(l) => setSpellLang({ ...spellLang, [selected.id]: l })}
            onView={(v) => open(selected.id, v)} onBack={close}
            onOpenRef={(id) => open(id)} />
        ) : <Welcome data={data} total={records.length} onLogout={logout} />}
      </main>
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'заклинание';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'заклинания';
  return 'заклинаний';
}
