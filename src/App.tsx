import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Dataset, Filters, Lang } from './types';
import { WrongPasswordError, clearKey, getKey, loadDataset, login, writeCache } from './api';
import { EMPTY_FILTERS, activeFilterCount, buildRecords, filterContext, filterRecords, type Match } from './model';
import { hasSpell, listsReady, loadLists, toggleSpell, useLists, type SpellBook } from './lists';
import { casterFor, classLimits } from './casting';
import { classLabel } from './listview';
import { FilterBar } from './components/FilterBar';
import { SpellList, type Picker } from './components/SpellList';
import { SpellDetail, type View } from './components/SpellDetail';
import { ListEditor, ListsHome } from './components/Lists';
import { Icon, Segmented } from './components/ui';

const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? { ...d as any, ...JSON.parse(v) } : d; } catch { return d; } },
  getStr(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* optional */ } },
};

interface Route {
  /** Open spell (group id). */
  id: string | null;
  view: View;
  /** '#/@lists' - all character lists, '#/@list/<id>' - one list. */
  page: 'main' | 'lists' | 'list';
  listId: string | null;
}

function parseHash(): Route {
  const [a, b] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  if (a === '@lists') return { id: null, view: 'official', page: 'lists', listId: null };
  if (a === '@list' && b) return { id: null, view: 'official', page: 'list', listId: b };
  return { id: a || null, view: b === 'll' || b === 'compare' ? b : 'official', page: 'main', listId: null };
}
const listHash = (id: string) => `#/@list/${encodeURIComponent(id)}`;

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

function Welcome({ data, total, onLogout, onLists }: { data: Dataset; total: number; onLogout: () => void; onLists: () => void }) {
  const ll = data.sources.find((s) => s.homebrew);
  const alt = data.spells.filter((s) => s.relation === 'alt').length;
  return (
    <div class="welcome">
      <h2>Книга заклинаний</h2>
      <p>{total} заклинаний: {data.spells.filter((s) => !s.homebrew).length} официальных из {data.sources.length - 1} книг редакции 2014 года
        и {data.spells.filter((s) => s.homebrew).length} от Laserllama, из них {alt} — альтернативные версии официальных (пометка <span class="tag alt">ALT</span>).</p>
      <p>Выберите заклинание в списке. У заклинаний с ALT-версией можно переключиться на версию Laserllama или открыть их рядом для сравнения.</p>
      <div class="welcome-lists">
        <p><b>Списки заклинаний персонажей.</b> Выберите класс (можно несколько — мультикласс) и уровень: сайт посчитает ячейки,
          покажет подходящие заклинания и выгрузит список в PDF. Списки хранятся в этом браузере.</p>
        <button type="button" class="btn" onClick={onLists}><Icon name="book" size={18} /> Мои списки</button>
      </div>
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
        Хоумбрю: <a href={ll?.url ?? '#'} target="_blank" rel="noopener noreferrer">{ll?.en}</a>, автор <a href={ll?.author ?? '#'} target="_blank" rel="noopener noreferrer">laserllama</a>; перевод на русский неофициальный.</p>
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
  // Entries this tab pushed onto the history stack: "back" buttons use history.back() while there are any.
  const pushed = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lists = useLists();
  // Picking spells for a character list: the spell list gets add/remove toggles and its own filters.
  const [picker, setPicker] = useState<{ listId: string; cls: string } | null>(null);
  const [pickFilters, setPickFilters] = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => { void loadLists(); }, []);

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
    const on = () => { pushed.current = Math.max(0, pushed.current - 1); setRoute(parseHash()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const records = useMemo(() => (data ? buildRecords(data) : []), [data]);
  const recordMap = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const ctx = useMemo(() => (data ? filterContext(data) : { noList: new Set<string>(), llDocLists: new Set<string>() }), [data]);
  const subclassCounts = useMemo(() => {
    const m = new Map<string, number>();
    data?.spells.forEach((s) => s.subclasses.forEach((id) => m.set(id, (m.get(id) ?? 0) + 1)));
    return m;
  }, [data]);
  const active = picker ? pickFilters : filters;
  const matches = useMemo(() => filterRecords(records, active, ctx, lang), [records, active, ctx, lang]);
  const selected = route.id ? recordMap.get(route.id) ?? null : null;
  const routeBook = route.page === 'list' && route.listId ? lists.find((b) => b.id === route.listId) ?? null : null;
  const pickBook = picker ? lists.find((b) => b.id === picker.listId) ?? null : null;
  const pickClass = picker && pickBook ? pickBook.classes.find((c) => c.cls === picker.cls) ?? null : null;
  useEffect(() => { if (picker && listsReady() && !pickClass) setPicker(null); }, [picker, pickClass]);

  const setFilters = (f: Filters) => { setFiltersState(f); store.set('dnd.filters.v2', { ...f, q: '' }); };
  const setActive = (f: Filters) => (picker ? setPickFilters(f) : setFilters(f));
  const setLang = (l: Lang) => { setLangState(l); setSpellLang({}); store.set('dnd.lang', l); };

  const go = (hash: string, replace = false) => {
    if (location.hash === hash || (!hash && !location.hash)) return;
    if (replace || !hash) history.replaceState(null, '', hash || location.pathname + location.search);
    else { history.pushState(null, '', hash); pushed.current++; }
    setRoute(parseHash());
  };
  /** Back to where the user came from (or to the parent page when this page was opened directly). */
  const back = (parent: string) => { if (pushed.current > 0) history.back(); else go(parent, true); };
  const open = (id: string, view: View = 'official') => go(`#/${encodeURIComponent(id)}${view === 'official' ? '' : `/${view}`}`, Boolean(route.id));
  const close = () => back('');

  const startPick = (book: SpellBook, cls: string) => {
    const c = book.classes.find((x) => x.cls === cls);
    if (!data || !c) return;
    const { info } = casterFor(data, c);
    const levels: number[] = [];
    if (info) {
      const lim = classLimits(info, c);
      if (lim.cantrips) levels.push(0);
      for (let l = 1; l <= lim.maxLevel; l++) levels.push(l);
    }
    setPickFilters({ ...EMPTY_FILTERS, classes: [c.cls], subclasses: c.sub ? [c.sub] : [], levels });
    setPicker({ listId: book.id, cls });
    listRef.current?.scrollTo({ top: 0 });
  };
  const finishPick = () => {
    const id = picker?.listId;
    setPicker(null);
    if (id && route.listId !== id) go(listHash(id));
  };
  const pick: Picker | null = pickBook && picker ? {
    has: (m: Match) => hasSpell(pickBook, m.record.id, m.version.homebrew ? 'l' : 'o'),
    toggle: (m: Match) => toggleSpell(pickBook.id, { id: m.record.id, v: m.version.homebrew ? 'l' : 'o', by: picker.cls }),
  } : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.('input, textarea, select');
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      // Escape inside an open filter popover or menu is handled by the popover itself.
      if (e.key === 'Escape' && route.id && !typing && !document.querySelector('.pop, .addto .menu')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Phones: the spell card and the list pages are a full-screen layer over the spell list (hidden while picking).
  const layer = Boolean(selected) || (route.page !== 'main' && !picker);
  useEffect(() => {
    document.body.classList.toggle('layer-open', layer);
  }, [layer]);

  const logout = () => { clearKey(); writeCache(null); setData(null); setExpired(false); setAuth('login'); };

  if (auth === 'login') return <Login expired={expired} onDone={(d) => { setData(d); setExpired(false); setAuth('ready'); }} />;
  if (!data) {
    return <main class="loading">{loadError ? <p class="err">{loadError}</p> : <div class="spinner" aria-label="Загрузка" />}</main>;
  }

  const count = activeFilterCount(active);
  const pickInfo = pickClass ? casterFor(data, pickClass).info : null;
  const pickMax = pickInfo && pickClass ? classLimits(pickInfo, pickClass).maxLevel : null;
  const pickCount = pickBook && picker ? pickBook.spells.filter((s) => s.by === picker.cls).length : 0;

  return (
    <div class={`app${layer ? ' has-detail' : ''}${selected && route.view === 'compare' ? ' comparing' : ''}`}>
      <header class="topbar">
        <a class="brand" href="#" onClick={(e) => { e.preventDefault(); go(''); }} aria-label="Книга заклинаний">
          <span class="sigil" aria-hidden="true">✦</span><span class="brand-name">Книга заклинаний</span>
        </a>
        <div class="search">
          <Icon name="search" size={18} />
          <input ref={searchRef} type="search" placeholder="Поиск по названию (EN / RU)" value={active.q} aria-label="Поиск"
            onInput={(e) => {
              const q = (e.target as HTMLInputElement).value;
              if (picker) setPickFilters({ ...pickFilters, q }); else setFiltersState({ ...filters, q });
              listRef.current?.scrollTo({ top: 0 });
            }} />
        </div>
        <button type="button" class={`btn lists-btn${route.page !== 'main' ? ' on' : ''}`} title="Мои списки заклинаний" aria-label="Мои списки заклинаний"
          onClick={() => go('#/@lists', route.page === 'lists')}>
          <Icon name="book" size={18} /><span class="lbl">Мои списки</span>{lists.length > 0 && <span class="badge">{lists.length}</span>}
        </button>
        <Segmented label="Язык заклинаний" value={lang} onChange={setLang}
          options={[{ value: 'en', label: 'EN', title: 'Тексты на английском (оригинал)' }, { value: 'ru', label: 'RU', title: 'Тексты на русском' }]} />
        <FilterBar data={data} filters={active} onChange={setActive} subclassCounts={subclassCounts} noList={ctx.noList} resultCount={matches.length} />
      </header>

      <div class={`listcol${picker ? ' picking' : ''}`} ref={listRef}>
        {picker && pickBook && pickClass && (
          <div class="pick-banner" role="status">
            <div class="pick-text">
              <b>Подбор в «{pickBook.name || 'Без названия'}»</b>
              <span>{classLabel(data, pickClass.cls)} {pickClass.level}{pickMax != null && pickMax > 0 ? ` · до ${pickMax} уровня` : ''} · выбрано {pickCount}</span>
            </div>
            <button type="button" class="btn primary small" onClick={finishPick}>Готово</button>
          </div>
        )}
        <div class="list-status">
          <span>{matches.length} {plural(matches.length)}</span>
          {count > 0 && <button type="button" class="link" onClick={() => setActive({ ...EMPTY_FILTERS, q: active.q })}>сбросить фильтры</button>}
        </div>
        {loadError && <p class="err">{loadError}</p>}
        <SpellList matches={matches} lang={lang} selected={route.id} pick={pick}
          onSelect={(id, v) => open(id, v === 'll' && recordMap.get(id)?.official ? 'll' : 'official')} />
      </div>

      <main class="detailcol">
        {selected ? (
          <SpellDetail key={selected.id} data={data} record={selected} view={route.view}
            lang={spellLang[selected.id] ?? lang}
            onLang={(l) => setSpellLang({ ...spellLang, [selected.id]: l })}
            onView={(v) => open(selected.id, v)} onBack={close}
            onOpenRef={(id) => open(id)} />
        ) : route.page === 'list' ? (
          routeBook ? (
            <ListEditor key={routeBook.id} data={data} book={routeBook} records={recordMap} lang={lang}
              picking={picker?.listId === routeBook.id ? picker.cls : null}
              onBack={() => back('#/@lists')}
              onOpenSpell={(id, ll) => open(id, ll && recordMap.get(id)?.official ? 'll' : 'official')}
              onPick={(cls) => startPick(routeBook, cls)} />
          ) : listsReady() ? (
            <div class="welcome">
              <p>Список не найден — возможно, он удалён или создан в другом браузере.</p>
              <button type="button" class="btn" onClick={() => go('#/@lists', true)}><Icon name="book" size={18} /> Мои списки</button>
            </div>
          ) : <div class="loading"><div class="spinner" aria-label="Загрузка" /></div>
        ) : route.page === 'lists' ? (
          <ListsHome data={data} onOpen={(id) => go(listHash(id))} onBack={() => back('')} />
        ) : <Welcome data={data} total={records.length} onLogout={logout} onLists={() => go('#/@lists')} />}
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
