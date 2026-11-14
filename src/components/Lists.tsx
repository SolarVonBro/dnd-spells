import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Dataset, Lang, SpellRecord, Version } from '../types';
import {
  createList, deleteList, exportBackup, hasSpell, importBackup, toggleSpell, updateList, useLists,
  type CharClass, type ListEntry, type SpellBook,
} from '../lists';
import { ABILITY_RU, alwaysPrepared, casterFor, classForSpell, classLimits, maxSpellLevel, slotSummary } from '../casting';
import { classLabel, classesSummary, entryVersion, plural, subclassLabel } from '../listview';
import { LL_PREFIX, laserllamaClasses, nameOf, officialClasses, textOf } from '../model';
import { SCHOOL, levelLabel } from '../i18n';
import { Icon, Segmented } from './ui';

const spellsWord = (n: number) => plural(n, 'заклинание', 'заклинания', 'заклинаний');

/* ---------------- all lists ---------------- */

export function ListsHome({ data, onOpen, onBack }: { data: Dataset; onOpen: (id: string) => void; onBack: () => void }) {
  const lists = useLists();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = (e: Event) => {
    e.preventDefault();
    const b = createList(name.trim() || 'Новый список');
    setName('');
    onOpen(b.id);
  };
  const sorted = [...lists].sort((a, b) => b.updated - a.updated);
  return (
    <section class="detail lists">
      <header class="detail-head">
        <button type="button" class="icon-btn back" aria-label="Назад" onClick={onBack}><Icon name="back" /></button>
        <div class="title">
          <h2>Мои списки заклинаний</h2>
          <div class="subtitle">Для персонажей: класс, уровень, ячейки и выбранные заклинания</div>
        </div>
      </header>

      <form class="newlist" onSubmit={create}>
        <input type="text" placeholder="Имя персонажа или название списка" aria-label="Название нового списка" maxLength={80}
          value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button type="submit" class="btn primary"><Icon name="plus" size={18} /> Создать</button>
      </form>

      {sorted.length === 0
        ? <p class="empty-note">Списков пока нет. Создайте первый: выберите класс и уровень — сайт посчитает ячейки и покажет подходящие заклинания.</p>
        : (
          <ul class="cards">
            {sorted.map((b) => (
              <li key={b.id}>
                <button type="button" class="card" onClick={() => onOpen(b.id)}>
                  <span class="card-name">{b.name || 'Без названия'}</span>
                  <span class="card-meta">{classesSummary(data, b) || 'класс не выбран'} · {b.spells.length} {spellsWord(b.spells.length)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

      <div class="backup">
        <p class="hint">
          Списки хранятся в этом браузере и сохраняются сами. Они не пропадают при выходе, смене пароля или обновлении сайта —
          только при полной очистке данных сайта (кеша и cookies). Чтобы перенести их на другое устройство, сохраните копию в файл.
        </p>
        <div class="btn-row">
          <button type="button" class="btn" disabled={!lists.length} onClick={exportBackup}><Icon name="download" size={18} /> Сохранить копию в файл</button>
          <button type="button" class="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Загрузить из файла</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const input = e.target as HTMLInputElement;
          const f = input.files?.[0];
          if (!f) return;
          try { setMsg(`Загружено списков: ${await importBackup(f)}.`); } catch { setMsg('Это не файл со списками заклинаний.'); }
          input.value = '';
        }} />
        {msg && <p class="hint" role="status">{msg}</p>}
      </div>
    </section>
  );
}

/* ---------------- one list ---------------- */

interface EditorProps {
  data: Dataset;
  book: SpellBook;
  records: Map<string, SpellRecord>;
  lang: Lang;
  picking: string | null;
  onBack: () => void;
  onOpenSpell: (id: string, ll: boolean) => void;
  onPick: (cls: string) => void;
}

function Meter({ have, max, label, min }: { have: number; max?: number | null; label: string; min?: boolean }) {
  const over = max != null && (min ? have < max : have > max);
  return (
    <span class={`meter${over ? ' over' : ''}${max != null && have === max ? ' full' : ''}`}>
      <b>{have}</b>{max != null ? <>{min ? ' из мин. ' : ' / '}{max}</> : null} <span>{label}</span>
    </span>
  );
}

function SlotTable({ data, book }: { data: Dataset; book: SpellBook }) {
  const s = slotSummary(data, book);
  const max = s.slots.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0);
  if (!max && !s.pact) return <p class="hint">Ячеек заклинаний на этих уровнях нет.</p>;
  return (
    <div class="slots">
      {max > 0 && (
        <table>
          <thead><tr><th>Уровень</th>{Array.from({ length: max }, (_, i) => <th>{i + 1}</th>)}</tr></thead>
          <tbody><tr><th>Ячейки</th>{s.slots.slice(0, max).map((n) => <td>{n || '—'}</td>)}</tr></tbody>
        </table>
      )}
      {s.casterLevel != null && <p class="hint">Мультикласс: уровень заклинателя {s.casterLevel} (таблица мультиклассового заклинателя, PHB).</p>}
      {s.pact && (
        <p class="pact">
          <b>Магия договора:</b> {s.pact.slots} {plural(s.pact.slots, 'ячейка', 'ячейки', 'ячеек')} {s.pact.level} уровня, восстанавливаются после короткого отдыха.
          {s.pact.arcanum.length > 0 && <> Таинственный арканум: {s.pact.arcanum.join(', ')} уровень.</>}
        </p>
      )}
    </div>
  );
}

export function ListEditor({ data, book, records, lang, picking, onBack, onOpenSpell, onPick }: EditorProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const set = (patch: Partial<SpellBook>) => updateList(book.id, patch);
  const cls = (code: string) => data.classes.find((c) => c.code === code)?.ru ?? code;
  const byRu = (a: string, b: string) => cls(a).localeCompare(cls(b), 'ru');
  const official = [...officialClasses(data)].sort(byRu);
  const llClasses = [...new Set([...laserllamaClasses(data), ...(data.llClassLists ?? []).map((l) => l.class)])].sort(byRu);
  const used = new Set(book.classes.map((c) => c.cls));
  const total = book.classes.reduce((n, c) => n + c.level, 0);

  // Re-assign spells that are not tied to an existing class after the classes change.
  const withClasses = (classes: CharClass[], spells: ListEntry[]) => {
    const tmp = { ...book, classes };
    return spells.map((s) => {
      if (s.by && classes.some((c) => c.cls === s.by)) return s;
      const v = entryVersion(data, s, records);
      return { ...s, by: v ? classForSpell(data, tmp, v) : '' };
    });
  };
  const setClass = (i: number, patch: Partial<CharClass>) => {
    const old = book.classes[i];
    const classes = book.classes.map((c, j) => (j === i ? { ...c, ...patch } : c));
    let spells = book.spells;
    if (patch.cls && patch.cls !== old.cls) spells = spells.map((s) => (s.by === old.cls ? { ...s, by: '' } : s));
    set({ classes, spells: withClasses(classes, spells) });
  };
  const addClass = () => {
    const pick = ['Wizard', 'Cleric', 'Sorcerer', 'Bard', 'Druid', 'Warlock', 'Paladin', 'Ranger', 'Artificer', ...official].find((c) => !used.has(c));
    if (!pick) return;
    const classes = [...book.classes, { cls: pick, level: 1, sub: null, mod: null }];
    set({ classes, spells: withClasses(classes, book.spells) });
  };
  const removeClass = (i: number) => {
    const gone = book.classes[i].cls;
    const classes = book.classes.filter((_, j) => j !== i);
    set({ classes, spells: withClasses(classes, book.spells.map((s) => (s.by === gone ? { ...s, by: '' } : s))) });
  };

  const items = book.spells
    .map((e) => ({ e, v: entryVersion(data, e, records), r: records.get(e.id) ?? null }))
    .sort((a, b) => (a.v?.level ?? 99) - (b.v?.level ?? 99) || (a.v ? nameOf(a.v, lang) : a.e.id).localeCompare(b.v ? nameOf(b.v, lang) : b.e.id, lang));

  const removeSpell = (e: ListEntry) => set({ spells: book.spells.filter((s) => !(s.id === e.id && s.v === e.v)) });
  const switchVersion = (e: ListEntry) => {
    const v = e.v === 'l' ? 'o' : 'l';
    set({ spells: hasSpell(book, e.id, v) ? book.spells.filter((s) => !(s.id === e.id && s.v === e.v)) : book.spells.map((s) => (s.id === e.id && s.v === e.v ? { ...s, v } : s)) });
  };
  const setBy = (e: ListEntry, by: string) => set({ spells: book.spells.map((s) => (s.id === e.id && s.v === e.v ? { ...s, by } : s)) });


  const spellRows = () => {
    const out: JSX.Element[] = [];
    let level = -2;
    for (const { e, v, r } of items) {
      const k = `${e.id}|${e.v}`;
      if (!v) {
        out.push(
          <li class="lrow missing" key={k}>
            <span class="row-main">Заклинание «{e.id}» больше не найдено в данных</span>
            <button type="button" class="icon-btn" aria-label="Убрать из списка" onClick={() => removeSpell(e)}><Icon name="close" size={18} /></button>
          </li>,
        );
        continue;
      }
      if (v.level !== level) {
        level = v.level;
        out.push(<li class="lvl-head" key={`h${level}`}>{levelLabel(level)}</li>);
      }
      const other = lang === 'ru' ? v.name.en : v.name.ru;
      const alt = Boolean(r?.official && r?.ll);
      const c = book.classes.find((x) => x.cls === e.by);
      const info = c ? casterFor(data, c).info : null;
      const always = Boolean(c && alwaysPrepared(info, v, c));
      const tooHigh = Boolean(c && info && v.level > maxSpellLevel(info, c.level));
      out.push(
        <li class="lrow" key={k}>
          <span class={`lvl lvl-${v.level}`} aria-hidden="true">{v.level}</span>
          <button type="button" class="lrow-main" onClick={() => onOpenSpell(e.id, v.homebrew)}>
            <span class="row-name">{nameOf(v, lang)}{other && other !== nameOf(v, lang) && <span class="row-other">{other}</span>}</span>
            <span class="row-meta">{SCHOOL[v.school][lang]} · {textOf(v, lang, 'time')}</span>
          </button>
          <span class="row-tags">
            {v.concentration && <span class="tag conc" title="Концентрация">К</span>}
            {v.ritual && <span class="tag rit" title="Ритуал">Р</span>}
            {always && <span class="tag" title="Заклинание подкласса: всегда подготовлено, не входит в лимит">подкл.</span>}
            {tooHigh && <span class="tag warn" title="Уровень заклинания выше, чем этот класс может знать на своём уровне">выше уровня</span>}
            {alt
              ? <button type="button" class={`tag ver${v.homebrew ? ' ll' : ''}`} title="Версия заклинания — нажмите, чтобы переключить (официальная / Laserllama)"
                  onClick={() => switchVersion(e)}>{v.homebrew ? 'LL' : v.source}</button>
              : <span class={`tag src${v.homebrew ? ' ll' : ''}`}>{v.homebrew ? 'LL' : v.source}</span>}
          </span>
          {book.classes.length > 0 && (
            <select class="by" aria-label="Через какой класс" title="Через какой класс получено заклинание («прочее» — черта, раса, предмет)" value={e.by}
              onChange={(ev) => setBy(e, (ev.target as HTMLSelectElement).value)}>
              {book.classes.map((x) => <option value={x.cls}>{classLabel(data, x.cls)}</option>)}
              <option value="">прочее</option>
            </select>
          )}
          <button type="button" class="icon-btn" aria-label="Убрать из списка" title="Убрать из списка" onClick={() => removeSpell(e)}><Icon name="close" size={18} /></button>
        </li>,
      );
    }
    return out;
  };

  return (
    <section class="detail lists">
      <header class="detail-head">
        <button type="button" class="icon-btn back" aria-label="К моим спискам" onClick={onBack}><Icon name="back" /></button>
        <div class="title">
          <input class="name-input" value={book.name} maxLength={80} aria-label="Название списка" placeholder="Название списка"
            onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
          <div class="subtitle">{classesSummary(data, book) || 'Выберите класс'}{book.classes.length > 1 ? ` · уровень персонажа ${total}` : ''}</div>
        </div>
        <button type="button" class={`btn${exportOpen ? ' on' : ''}`} aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>
          <Icon name="download" size={18} /> PDF
        </button>
      </header>

      {exportOpen && <ExportPanel data={data} book={book} records={records} lang={lang} />}

      <h3 class="sec">Классы</h3>
      <div class="classes-edit">
        {book.classes.map((c, i) => {
          const { info, inherited } = casterFor(data, c);
          const isLl = c.cls.startsWith(LL_PREFIX);
          const subs = isLl ? [] : data.subclasses.filter((s) => s.class === c.cls);
          return (
            <div class="crow" key={c.cls}>
              <select aria-label="Класс" value={c.cls} onChange={(e) => setClass(i, { cls: (e.target as HTMLSelectElement).value, sub: null, mod: null })}>
                <optgroup label="D&D 5e">
                  {official.map((code) => <option value={code} disabled={code !== c.cls && used.has(code)}>{cls(code)}</option>)}
                </optgroup>
                <optgroup label="Laserllama">
                  {llClasses.map((code) => <option value={LL_PREFIX + code} disabled={LL_PREFIX + code !== c.cls && used.has(LL_PREFIX + code)}>{cls(code)} (Laserllama)</option>)}
                </optgroup>
              </select>
              {subs.length > 0 && (
                <select aria-label="Подкласс" value={c.sub ?? ''} onChange={(e) => setClass(i, { sub: (e.target as HTMLSelectElement).value || null })}>
                  <option value="">Подкласс не выбран</option>
                  {subs.map((s) => <option value={s.id}>{s.ru ?? s.en}</option>)}
                </select>
              )}
              <label class="num">
                <span>Уровень</span>
                <input type="number" inputMode="numeric" min={1} max={20} value={c.level}
                  onChange={(e) => setClass(i, { level: Math.min(20, Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1))) })} />
              </label>
              {info?.prepared && (
                <label class="num" title="Модификатор характеристики — для числа подготовленных заклинаний">
                  <span>Мод. {ABILITY_RU[info.ability]}</span>
                  <input type="number" inputMode="numeric" min={-5} max={10} placeholder="—" value={c.mod ?? ''}
                    onChange={(e) => { const v = (e.target as HTMLInputElement).value; setClass(i, { mod: v === '' ? null : Math.max(-5, Math.min(10, Math.round(Number(v)))) }); }} />
                </label>
              )}
              <button type="button" class="icon-btn" aria-label="Убрать класс" title="Убрать класс" onClick={() => removeClass(i)}><Icon name="close" size={18} /></button>
              {inherited && <p class="hint">Документа этого класса от Laserllama нет — ячейки считаются по официальному классу.</p>}
              {!info && (isLl
                ? <p class="hint">Таблицы ячеек для этого класса нет (нет документа класса Laserllama). Заклинания можно добавлять любого уровня.</p>
                : <p class="hint">{c.cls === 'Fighter' || c.cls === 'Rogue' ? 'Заклинатель только с подклассом «Мистический рыцарь» / «Мистический ловкач».' : 'Не заклинатель: уровни этого класса не дают ячеек.'}</p>)}
            </div>
          );
        })}
        <button type="button" class="btn" onClick={addClass}><Icon name="plus" size={18} /> {book.classes.length ? 'Добавить класс (мультикласс)' : 'Выбрать класс'}</button>
        {total > 20 && <p class="hint warn">Сумма уровней классов больше 20.</p>}
      </div>

      {book.classes.length > 0 && (
        <>
          <h3 class="sec">Ячейки заклинаний</h3>
          <SlotTable data={data} book={book} />
          <div class="ccards">
            {book.classes.map((c) => {
              const { info } = casterFor(data, c);
              const isLl = c.cls.startsWith(LL_PREFIX);
              if (!info && !isLl) return null;
              const lim = info ? classLimits(info, c) : null;
              const mine = items.filter((x) => x.e.by === c.cls && x.v);
              const cantrips = mine.filter((x) => x.v!.level === 0).length;
              const always = mine.filter((x) => x.v!.level > 0 && alwaysPrepared(info, x.v!, c)).length;
              const leveled = mine.filter((x) => x.v!.level > 0).length - always;
              const ab = lim ? ABILITY_RU[lim.ability] : '';
              const canPick = !lim || lim.maxLevel >= 0;
              return (
                <div class={`ccard${picking === c.cls ? ' picking' : ''}`}>
                  <div class="ccard-head">
                    <div>
                      <b>{classLabel(data, c.cls)} {c.level}</b>
                      {c.sub && <span class="muted"> · {subclassLabel(data, c.sub)}</span>}
                      {lim && <span class="muted"> · {ab} · {lim.maxLevel < 0 ? 'заклинаний пока нет' : lim.maxLevel === 0 ? 'только заговоры' : `заклинания до ${lim.maxLevel} уровня`}</span>}
                    </div>
                    <button type="button" class="btn small" disabled={!canPick} onClick={() => onPick(c.cls)}>
                      <Icon name="plus" size={16} /> {picking === c.cls ? 'Идёт подбор' : 'Подобрать заклинания'}
                    </button>
                  </div>
                  <div class="meters">
                    {(lim?.cantrips || cantrips > 0) ? <Meter have={cantrips} max={lim?.cantrips ?? null} label="заговоров" /> : null}
                    {lim?.known != null && <Meter have={leveled} max={lim.known} label="известных заклинаний" />}
                    {lim?.spellbook != null && <Meter have={leveled} max={lim.spellbook} min label="в книге заклинаний" />}
                    {lim?.preparedRule && lim.spellbook == null && (
                      lim.prepared != null
                        ? <Meter have={leveled} max={lim.prepared} label="подготовлено" />
                        : <span class="meter"><b>{leveled}</b> <span>подготовлено · лимит: {lim.preparedRule === 'half' ? 'пол-уровня' : 'уровень'} + мод. {ab}</span></span>
                    )}
                    {lim?.preparedRule && lim.spellbook != null && (
                      <span class="meter"><span>можно подготовить: {lim.prepared != null ? <b>{lim.prepared}</b> : `уровень + мод. ${ab}`}</span></span>
                    )}
                    {!lim && <span class="meter"><b>{mine.length}</b> <span>{spellsWord(mine.length)}</span></span>}
                    {always > 0 && <span class="meter"><b>{always}</b> <span>подкласса (всегда подготовлены)</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 class="sec">Заклинания{book.spells.length ? ` (${book.spells.length})` : ''}</h3>
      {items.length === 0 && (
        <p class="empty-note">
          {book.classes.length
            ? 'Нажмите «Подобрать заклинания» у класса — в списке слева появятся подходящие заклинания с кнопками добавления. Ещё можно добавить заклинание из его карточки кнопкой «В список».'
            : 'Сначала выберите класс.'}
        </p>
      )}
      <ul class="lspells">{spellRows()}</ul>

      <div class="danger">
        <button type="button" class="btn ghost" onClick={() => { if (confirm(`Удалить список «${book.name || 'Без названия'}»?`)) { deleteList(book.id); onBack(); } }}>
          <Icon name="trash" size={18} /> Удалить список
        </button>
      </div>
    </section>
  );
}

/* ---------------- PDF export ---------------- */

function ExportPanel({ data, book, records, lang }: { data: Dataset; book: SpellBook; records: Map<string, SpellRecord>; lang: Lang }) {
  const [pdfLang, setPdfLang] = useState<Lang>(lang);
  const [mode, setMode] = useState<'short' | 'full'>('full');
  const [state, setState] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const run = async () => {
    setState({ busy: true, msg: null });
    try {
      const { downloadPdf } = await import('../pdf');
      const size = await downloadPdf(data, book, records, { lang: pdfLang, full: mode === 'full' });
      setState({ busy: false, msg: `Готово: ${Math.max(1, Math.round(size / 1024))} КБ.` });
    } catch (e) {
      console.error(e);
      setState({ busy: false, msg: 'Не удалось создать PDF. Проверьте соединение и попробуйте ещё раз.' });
    }
  };
  return (
    <div class="export">
      <div class="export-opts">
        <div><span class="k">Язык</span>
          <Segmented small label="Язык PDF" value={pdfLang} onChange={setPdfLang} options={[{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]} /></div>
        <div><span class="k">Содержание</span>
          <Segmented small label="Содержание PDF" value={mode} onChange={setMode}
            options={[{ value: 'full', label: 'С описаниями' }, { value: 'short', label: 'Таблица' }]} /></div>
      </div>
      <p class="hint">В PDF: классы, ячейки и заклинания по уровням{mode === 'full' ? ' с полным текстом' : ' одной таблицей (без текста)'}. Файл без картинок, шрифты встроены частично — он получается лёгким.</p>
      <button type="button" class="btn primary" disabled={state.busy} onClick={run}>{state.busy ? 'Готовлю PDF…' : 'Скачать PDF'}</button>
      {state.msg && <p class="hint" role="status">{state.msg}</p>}
    </div>
  );
}

/* ---------------- "add to list" in the spell card ---------------- */

export function AddToList({ data, version }: { data: Dataset; version: Version }) {
  const lists = useLists();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const key = version.homebrew ? 'l' : 'o';
  const inLists = lists.filter((b) => hasSpell(b, version.group, key)).length;
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const entry = (b: SpellBook): ListEntry => ({ id: version.group, v: key, by: classForSpell(data, b, version) });
  return (
    <div class="addto" ref={ref}>
      <button type="button" class={`btn small${inLists ? ' on' : ''}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Icon name={inLists ? 'check' : 'plus'} size={16} /> {inLists ? `В списках: ${inLists}` : 'В список'}
      </button>
      {open && (
        <div class="menu" role="menu">
          {lists.length === 0 && <p class="hint">Списков пока нет.</p>}
          {[...lists].sort((a, b) => b.updated - a.updated).map((b) => (
            <label class="menu-item" key={b.id}>
              <input type="checkbox" checked={hasSpell(b, version.group, key)} onChange={() => toggleSpell(b.id, entry(b))} />
              <span>{b.name || 'Без названия'}<small>{classesSummary(data, b)}</small></span>
            </label>
          ))}
          <button type="button" class="menu-item new" onClick={() => { const b = createList('Новый список'); toggleSpell(b.id, entry(b)); }}>
            <Icon name="plus" size={16} /> Новый список с этим заклинанием
          </button>
        </div>
      )}
    </div>
  );
}
