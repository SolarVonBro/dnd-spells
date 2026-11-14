import { useMemo, useRef, useState } from 'preact/hooks';
import type { Dataset, Lang } from '../types';
import {
  deleteCharacter, exportCharacters, importFile, optionsOf, readActorFile, reimportCharacter, updateCharacter, useCharacters,
  type Character, type SheetNotes, type SheetOptions,
} from '../characters';
import { ImportError } from '../foundry';
import { ABILITIES, ABILITY, buildSheet, signed, spellLevelLabel, summaryOf, type Sheet } from '../sheet';
import { createList, type ListEntry } from '../lists';
import { classForSpell } from '../casting';
import { plural } from '../listview';
import { Icon, Segmented } from './ui';

/** HTML from an uploaded file (it may come from anyone): the tree is copied node by node, keeping only text and
 *  harmless formatting tags without attributes; everything else is unwrapped or dropped. */
const SAFE_TAGS = new Set(['P', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'CAPTION', 'H1', 'H2',
  'H3', 'H4', 'H5', 'H6', 'BR', 'SPAN', 'DIV', 'SUP', 'SUB', 'BLOCKQUOTE']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'NOSCRIPT', 'TITLE', 'HEAD']);
export function safeHtml(html: string): string {
  const src = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body;
  const out = document.createElement('div');
  const copy = (from: Node, to: Node) => {
    for (const n of from.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) to.appendChild(document.createTextNode(n.textContent ?? ''));
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName.toUpperCase();
        if (DROP_TAGS.has(tag)) continue;
        if (SAFE_TAGS.has(tag)) copy(n, to.appendChild(document.createElement(tag.toLowerCase())));
        else copy(n, to);
      }
    }
  };
  copy(src, out);
  return out.innerHTML;
}

const sheetsWord = (n: number) => plural(n, 'лист', 'листа', 'листов');

/* ---------------- all characters ---------------- */

export function CharactersHome({ onOpen, onBack }: { onOpen: (id: string) => void; onBack: () => void }) {
  const chars = useCharacters();
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const take = async (files: File[]) => {
    if (!files.length) return;
    const out: string[] = [];
    let err = false;
    let opened: string | null = null;
    for (const f of files) {
      try {
        const r = await importFile(f);
        if (r.kind === 'actor') { out.push(`Добавлен персонаж «${r.character.name}».`); opened = r.character.id; } else out.push(`Из копии загружено: ${r.count} ${sheetsWord(r.count)}.`);
      } catch (e) {
        err = true;
        out.push(e instanceof ImportError ? e.message : `«${f.name}»: не удалось прочитать файл.`);
        if (!(e instanceof ImportError)) console.error(e);
      }
    }
    setMsg({ text: out.join(' '), err });
    if (opened && files.length === 1 && !err) onOpen(opened);
  };
  const sorted = [...chars].sort((a, b) => b.updated - a.updated);
  return (
    <section class="detail lists chars">
      <header class="detail-head">
        <button type="button" class="icon-btn back" aria-label="Назад" onClick={onBack}><Icon name="back" /></button>
        <div class="title">
          <h2>Листы персонажей</h2>
          <div class="subtitle">Персонажи из Foundry VTT → лист D&amp;D 5e для печати</div>
        </div>
      </header>

      <div class={`dropzone${drag ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void take([...(e.dataTransfer?.files ?? [])]); }}>
        <Icon name="upload" size={28} />
        <p><b>Загрузите персонажа из Foundry VTT</b> (файл .json, система D&amp;D 5e) — перетащите сюда или выберите файл.</p>
        <button type="button" class="btn primary" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Выбрать файл</button>
        <p class="hint">В Foundry: вкладка «Актёры» → правый клик по персонажу → <i>Export Data</i> (Экспорт данных).</p>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={async (e) => {
          const input = e.target as HTMLInputElement;
          await take([...(input.files ?? [])]);
          input.value = '';
        }} />
      </div>
      {msg && <p class={`hint${msg.err ? ' warn' : ''}`} role="status">{msg.text}</p>}

      {sorted.length === 0
        ? <p class="empty-note">Листов пока нет. Сайт посчитает бонусы, КД, хиты, атаки и ячейки, подставит переводы заклинаний и соберёт PDF для игры за столом.</p>
        : (
          <ul class="cards">
            {sorted.map((c) => (
              <li key={c.id}>
                <button type="button" class="card" onClick={() => onOpen(c.id)}>
                  <span class="card-name">{c.name || 'Без имени'}</span>
                  <span class="card-meta">{summaryOf(c.actor) || 'класс не указан'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

      <div class="backup">
        <p class="hint">
          Листы хранятся в этом браузере и сохраняются сами, как и списки заклинаний: они не пропадают при выходе, смене пароля
          или обновлении сайта — только при полной очистке данных сайта. Чтобы перенести их на другое устройство, сохраните копию в файл
          и загрузите её там через «Выбрать файл».
        </p>
        <div class="btn-row">
          <button type="button" class="btn" disabled={!chars.length} onClick={exportCharacters}><Icon name="download" size={18} /> Сохранить копию в файл</button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- one character ---------------- */

interface ViewProps {
  data: Dataset;
  ch: Character;
  onBack: () => void;
  onOpenSpell: (id: string, ll: boolean) => void;
  onOpenList: (id: string) => void;
}

const PROF_CYCLE = [0, 1, 2, 0.5];
const profTitle = (p: number) => (p >= 2 ? 'компетентность' : p >= 1 ? 'владение' : p > 0 ? 'половина бонуса мастерства' : 'нет владения');

export function CharacterView({ data, ch, onBack, onOpenSpell, onOpenList }: ViewProps) {
  const sheet = useMemo(() => buildSheet(data, ch), [data, ch]);
  const set = (patch: Partial<Character>) => updateCharacter(ch.id, patch);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cycleSkill = (key: string, cur: number) => {
    const base = Number(ch.actor.system?.skills?.[key]?.value ?? 0);
    const next = PROF_CYCLE[(PROF_CYCLE.indexOf(cur) + 1) % PROF_CYCLE.length] ?? 0;
    const skills = { ...(ch.skills ?? {}) };
    if (next === base) delete skills[key]; else skills[key] = next;
    set({ skills });
  };
  const cycleAbility = (key: string, cur: string) => {
    const base = String(ch.actor.system?.skills?.[key]?.ability ?? '');
    const next = ABILITIES[(ABILITIES.indexOf(cur as typeof ABILITIES[number]) + 1) % ABILITIES.length];
    const skillAb = { ...(ch.skillAb ?? {}) };
    if (next === base) delete skillAb[key]; else skillAb[key] = next;
    set({ skillAb });
  };
  const toggleAlways = (id: string, value: boolean, base: boolean) => {
    const always = { ...(ch.always ?? {}) };
    if (value === base) delete always[id]; else always[id] = value;
    set({ always });
  };
  const toggleRes = (id: string, hidden: boolean, auto: boolean) => {
    const rest = (ch.hiddenRes ?? []).filter((x) => x !== id && x !== `!${id}`);
    // Auto-hidden resources ("Spellcasting") are shown with a "!id" marker.
    set({ hiddenRes: hidden ? (auto ? rest : [...rest, id]) : auto ? [...rest, `!${id}`] : rest });
  };
  const makeList = () => {
    const tmp = { id: '', name: '', classes: sheet.listClasses, spells: [] as ListEntry[], created: 0, updated: 0 };
    const spells: ListEntry[] = [];
    for (const sp of sheet.spells) {
      if (!sp.site || spells.some((e) => e.id === sp.site!.id && e.v === (sp.site!.ll ? 'l' : 'o'))) continue;
      const v = data.spells.find((x) => x.group === sp.site!.id && x.homebrew === sp.site!.ll);
      spells.push({ id: sp.site.id, v: sp.site.ll ? 'l' : 'o', by: v ? classForSpell(data, tmp, v) : '' });
    }
    const b = createList(sheet.name, sheet.listClasses, spells);
    onOpenList(b.id);
  };

  const s = sheet;
  return (
    <section class="detail lists char">
      <header class="detail-head">
        <button type="button" class="icon-btn back" aria-label="К листам персонажей" onClick={onBack}><Icon name="back" /></button>
        <div class="title">
          <input class="name-input" value={ch.name} maxLength={80} aria-label="Имя персонажа" placeholder="Имя персонажа"
            onChange={(e) => set({ name: (e.target as HTMLInputElement).value })} />
          <div class="subtitle">{[s.classLine, s.race, s.background].filter(Boolean).join(' · ')}</div>
        </div>
      </header>

      <div class="char-layout">
      <aside class="char-side"><PrintPanel data={data} ch={ch} sheet={s} /></aside>
      <div class="char-main">
      {s.warnings.length > 0 && (
        <ul class="warnings">{s.warnings.map((w) => <li>{w}</li>)}</ul>
      )}

      <h3 class="sec">Основное</h3>
      <div class="stat-row">
        <Stat v={String(s.ac)} k="КД" note={s.acNote} />
        <Stat v={signed(s.init)} k="Инициатива" />
        <Stat v={s.speed.split(',')[0]} k="Скорость" note={s.speed.split(',').slice(1).join(',').trim()} />
        <Stat v={String(s.hp.max)} k="Хиты" note={`кости хитов ${s.hitDice.map((d) => `${d.count}${d.die}`).join(' + ')}`} />
        <Stat v={signed(s.prof)} k="Бонус мастерства" note={`уровень ${s.level}`} />
        <Stat v={String(s.passive.perception)} k="Пасс. восприятие" />
      </div>
      <div class="abil-grid">
        {s.abilities.map((a) => (
          <div class="abil">
            <span class="abil-name">{a.name}</span>
            <span class="abil-mod">{signed(a.mod)}</span>
            <span class="abil-score">{a.score}</span>
            <span class={`abil-save${a.saveProf ? ' prof' : ''}`} title={a.saveProf ? 'Владение спасброском' : 'Спасбросок'}>спасбр. {signed(a.save)}</span>
          </div>
        ))}
      </div>

      <div class="char-cols">
      <div>
      <h3 class="sec">Навыки <span class="sec-hint">— кружок: владение, ИНТ/МДР…: характеристика; нажмите, чтобы поправить</span></h3>
      <ul class="skills">
        {s.skills.map((k) => (
          <li class={k.changed ? 'changed' : ''}>
            <button type="button" class={`pdot p${String(k.prof).replace('.', '')}`} aria-label={`${k.name}: ${profTitle(k.prof)}`} title={`${profTitle(k.prof)} — нажмите, чтобы изменить`}
              onClick={() => cycleSkill(k.key, ch.skills?.[k.key] ?? Number(ch.actor.system?.skills?.[k.key]?.value ?? 0))} />
            <b>{signed(k.total)}</b> {k.name}
            <button type="button" class="ab-btn" title="Характеристика проверки — нажмите, чтобы сменить (например, «Посвящённый друид»: Природа через Мудрость)"
              aria-label={`${k.name}: характеристика ${ABILITY[k.ability].name}`} onClick={() => cycleAbility(k.key, k.ability)}>{ABILITY[k.ability].short}</button>
          </li>
        ))}
      </ul>
      {Object.keys({ ...(ch.skills ?? {}), ...(ch.skillAb ?? {}) }).length > 0 && <button type="button" class="link" onClick={() => set({ skills: {}, skillAb: {} })}>вернуть навыки как в файле</button>}
      </div>
      <div>

      <h3 class="sec">Атаки</h3>
      {s.attacks.length ? (
        <table class="ctable">
          <thead><tr><th>Название</th><th>Атака / Сл</th><th>Урон</th><th>Примечания</th></tr></thead>
          <tbody>{s.attacks.map((a) => <tr><td><b>{a.name}</b></td><td>{a.bonus}</td><td>{a.damage}</td><td class="muted">{a.notes}</td></tr>)}</tbody>
        </table>
      ) : <p class="empty-note">Оружия и атакующих заговоров нет.</p>}
      {s.resources.length > 0 && (
        <>
          <h3 class="sec">Ограниченные умения <span class="sec-hint">— на листе клетки для отметок</span></h3>
          <ul class="res">
            {s.resources.map((r) => {
              const auto = /^(spellcasting|использование заклинаний|колдовство|магия договора)$/i.test(r.name.trim());
              return (
                <li><label class="check">
                  <input type="checkbox" checked={!r.hidden} onChange={(e) => toggleRes(r.id, !(e.target as HTMLInputElement).checked, auto)} />
                  <span><b>{r.name}</b> — {r.max}{r.per ? ` / ${r.per}` : ''}</span>
                </label></li>
              );
            })}
          </ul>
        </>
      )}
      </div>
      </div>

      {(s.casters.length > 0 || s.spells.length > 0) && (
        <>
          <h3 class="sec">Заклинания</h3>
          {s.casters.map((k) => (
            <p class="caster"><b>{k.name}</b>: {ABILITY[k.ability].name}, Сл {k.dc}, атака {signed(k.attack)}
              {k.prepared != null && <>, подготовить {k.prepared}</>}{k.cantrips != null && <>, заговоров {k.cantrips}</>}{k.known != null && <>, известно {k.known}</>}</p>
          ))}
          {s.slots.some((n) => n > 0) && (
            <div class="slots"><table>
              <thead><tr><th>Уровень</th>{s.slots.map((n, i) => (n ? <th>{i + 1}</th> : null))}</tr></thead>
              <tbody><tr><th>Ячейки</th>{s.slots.map((n) => (n ? <td>{n}</td> : null))}</tr></tbody>
            </table></div>
          )}
          {s.pact && <p class="pact"><b>Магия договора:</b> {s.pact.slots} яч. {s.pact.level} уровня.</p>}
          <ul class="lspells cspells">
            {s.spells.map((sp, i) => {
              const head = i === 0 || s.spells[i - 1].level !== sp.level;
              const base = sp.alwaysChanged ? !sp.always : sp.always;
              return (
                <>
                  {head && <li class="lvl-head">{spellLevelLabel(sp.level)}</li>}
                  <li class="lrow">
                    <span class={`lvl lvl-${sp.level}`} aria-hidden="true">{sp.level}</span>
                    {sp.site
                      ? <button type="button" class="lrow-main" onClick={() => onOpenSpell(sp.site!.id, sp.site!.ll)}>
                          <span class="row-name">{sp.name}{sp.other && <span class="row-other">{sp.other}</span>}</span>
                          <span class="row-meta">{sp.school} · {sp.time} · {sp.range}</span>
                        </button>
                      : <span class="lrow-main">
                          <span class="row-name">{sp.name}{sp.other && <span class="row-other">{sp.other}</span>}</span>
                          <span class="row-meta">нет на сайте — текст из файла · {sp.time}</span>
                        </span>}
                    <span class="row-tags">
                      {sp.conc && <span class="tag conc" title="Концентрация">К</span>}
                      {sp.ritual && <span class="tag rit" title="Ритуал">Р</span>}
                      {sp.homebrew && <span class="tag src ll">LL</span>}
                    </span>
                    {sp.level > 0 && (
                      <label class={`always${sp.alwaysChanged ? ' changed' : ''}`} title="Всегда подготовлено: на листе отмечено и не входит в лимит подготовки">
                        <input type="checkbox" checked={sp.always} onChange={(e) => toggleAlways(sp.id, (e.target as HTMLInputElement).checked, base)} /> всегда
                      </label>
                    )}
                  </li>
                </>
              );
            })}
          </ul>
          {s.spells.some((x) => x.site) && (
            <div class="btn-row">
              <button type="button" class="btn small" onClick={makeList}><Icon name="book" size={16} /> Сделать список заклинаний на сайте</button>
            </div>
          )}
        </>
      )}

      <h3 class="sec">Умения и черты</h3>
      {s.features.map((g) => (
        <div class="fgroup">
          <h4>{g.title}</h4>
          {g.items.map((f) => (
            <details class="feat">
              <summary><b>{f.name}</b>{f.uses && <span class="muted"> · {f.uses}</span>}{f.note && <span class="muted"> · {f.note}</span>}</summary>
              <div class="spell-text" dangerouslySetInnerHTML={{ __html: safeHtml(f.html) }} />
            </details>
          ))}
        </div>
      ))}

      <h3 class="sec">Снаряжение</h3>
      <p class="coins">{(['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((k) => s.currency[k]).map((k) => `${s.currency[k]} ${{ pp: 'пм', gp: 'зм', ep: 'эм', sp: 'см', cp: 'мм' }[k]}`).join(', ') || 'Монет нет'}
        <span class="muted"> · вес {s.carried} из {s.capacity} фнт.</span></p>
      <table class="ctable inv">
        <thead><tr><th>Предмет</th><th>Кол-во</th><th>Вес</th><th>Заметки</th></tr></thead>
        <tbody>{s.inventory.map((it) => (
          <tr><td style={{ paddingLeft: `${8 + it.depth * 16}px` }}>{it.depth > 0 ? '— ' : ''}{it.name}</td><td>{it.qty}</td><td>{it.weight || '—'}</td><td class="muted">{it.notes}</td></tr>
        ))}</tbody>
      </table>

      <h3 class="sec">Личность и заметки <span class="sec-hint">— попадут на лист; пустые поля останутся для записей от руки</span></h3>
      <NotesForm ch={ch} sheet={s} />

      <div class="danger btn-row">
        <button type="button" class="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Обновить из нового файла Foundry</button>
        <button type="button" class="btn ghost" onClick={() => { if (confirm(`Удалить лист «${ch.name || 'Без имени'}»?`)) { deleteCharacter(ch.id); onBack(); } }}>
          <Icon name="trash" size={18} /> Удалить лист
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const input = e.target as HTMLInputElement;
          const f = input.files?.[0];
          input.value = '';
          if (!f) return;
          try {
            reimportCharacter(ch.id, await readActorFile(f), f.name);
            setMsg(`Данные обновлены из «${f.name}». Заметки и настройки печати сохранены.`);
          } catch (err) {
            setMsg(err instanceof ImportError ? err.message : 'Не удалось прочитать файл.');
          }
        }} />
      </div>
      {msg && <p class="hint" role="status">{msg}</p>}
      <p class="hint">Файл: {ch.file}{ch.actor.sysVersion ? ` · dnd5e ${ch.actor.sysVersion}` : ''} · загружен {new Date(ch.imported).toLocaleString('ru-RU')}</p>
      </div>
      </div>
    </section>
  );
}

const Stat = ({ v, k, note }: { v: string; k: string; note?: string }) => (
  <div class="stat"><span class="stat-v">{v}</span><span class="stat-k">{k}</span>{note && <span class="stat-n">{note}</span>}</div>
);

/* ---------------- notes ---------------- */

const NOTE_FIELDS: { key: keyof SheetNotes; label: string; rows: number }[] = [
  { key: 'player', label: 'Игрок', rows: 0 },
  { key: 'alignment', label: 'Мировоззрение', rows: 0 },
  { key: 'traits', label: 'Черты характера', rows: 2 },
  { key: 'ideals', label: 'Идеалы', rows: 2 },
  { key: 'bonds', label: 'Привязанности', rows: 2 },
  { key: 'flaws', label: 'Слабости', rows: 2 },
  { key: 'appearance', label: 'Внешность', rows: 2 },
  { key: 'backstory', label: 'Предыстория персонажа', rows: 4 },
  { key: 'allies', label: 'Союзники и организации', rows: 2 },
  { key: 'notes', label: 'Заметки', rows: 3 },
];

function NotesForm({ ch, sheet }: { ch: Character; sheet: Sheet }) {
  const setNote = (key: keyof SheetNotes, value: string) => updateCharacter(ch.id, { notes: { ...(ch.notes ?? {}), [key]: value } });
  return (
    <div class="notes-form">
      {NOTE_FIELDS.map((f) => {
        const value = sheet.details[f.key] ?? '';
        return (
          <label class={f.rows ? 'wide' : ''}>
            <span>{f.label}</span>
            {f.rows
              ? <textarea rows={f.rows} value={value} onChange={(e) => setNote(f.key, (e.target as HTMLTextAreaElement).value)} />
              : <input type="text" value={value} maxLength={80} onChange={(e) => setNote(f.key, (e.target as HTMLInputElement).value)} />}
          </label>
        );
      })}
    </div>
  );
}

/* ---------------- print settings and PDF ---------------- */

function Count({ label, value, max, onChange, title }: { label: string; value: number; max: number; onChange: (n: number) => void; title?: string }) {
  return (
    <div class="count" role="group" aria-label={label} title={title}>
      <span>{label}</span>
      <span class="stepper">
        <button type="button" aria-label={`${label}: меньше`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
        <b>{value}</b>
        <button type="button" aria-label={`${label}: больше`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </span>
    </div>
  );
}

function PrintPanel({ data, ch, sheet }: { data: Dataset; ch: Character; sheet: Sheet }) {
  const opts = optionsOf(ch);
  const setOpt = (patch: Partial<SheetOptions>) => updateCharacter(ch.id, { opts: { ...opts, ...patch } });
  const [state, setState] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const hasMagic = sheet.casters.length > 0 || sheet.spells.length > 0;
  const run = async () => {
    setState({ busy: true, msg: null });
    try {
      const { downloadSheetPdf } = await import('../sheetpdf');
      const r = await downloadSheetPdf(data, ch);
      setState({ busy: false, msg: `Готово: ${r.pages} ${plural(r.pages, 'страница', 'страницы', 'страниц')}, ${Math.max(1, Math.round(r.size / 1024))} КБ.` });
    } catch (e) {
      console.error(e);
      setState({ busy: false, msg: 'Не удалось создать PDF. Проверьте соединение и попробуйте ещё раз.' });
    }
  };
  return (
    <div class="export print">
      <div class="export-opts">
        <div><span class="k">Умения</span>
          <Segmented small label="Описания умений" value={opts.featureText ? 'full' : 'names'} onChange={(v) => setOpt({ featureText: v === 'full' })}
            options={[{ value: 'full', label: 'С описаниями' }, { value: 'names', label: 'Только названия' }]} /></div>
        {hasMagic && (
          <div><span class="k">Описания заклинаний</span>
            <Segmented small label="Описания заклинаний" value={opts.spellText ? 'yes' : 'no'} onChange={(v) => setOpt({ spellText: v === 'yes' })}
              options={[{ value: 'yes', label: 'Печатать' }, { value: 'no', label: 'Нет' }]} /></div>
        )}
        {hasMagic && (
          <div><span class="k">Язык заклинаний</span>
            <Segmented<Lang> small label="Язык заклинаний" value={opts.spellLang} onChange={(v) => setOpt({ spellLang: v })}
              options={[{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]} /></div>
        )}
        <div><span class="k">Текущие хиты</span>
          <Segmented small label="Текущие хиты" value={opts.currentHp ? 'yes' : 'no'} onChange={(v) => setOpt({ currentHp: v === 'yes' })}
            options={[{ value: 'no', label: 'Пусто (карандашом)' }, { value: 'yes', label: `Вписать (${sheet.hp.value})` }]} /></div>
        <div><span class="k">Шрифт</span>
          <Segmented small label="Размер шрифта" value={opts.large ? 'large' : 'normal'} onChange={(v) => setOpt({ large: v === 'large' })}
            options={[{ value: 'normal', label: 'Обычный' }, { value: 'large', label: 'Крупный' }]} /></div>
      </div>
      <div class="export-opts counts">
        <span class="k">Дополнительные страницы:</span>
        <Count label="для заклинаний" value={opts.spellPages} max={6} onChange={(n) => setOpt({ spellPages: n })} title="Пустые таблицы для заклинаний, вписываемых от руки" />
        <Count label="для снаряжения" value={opts.itemPages} max={6} onChange={(n) => setOpt({ itemPages: n })} title="Пустые таблицы для предметов" />
        <Count label="для заметок" value={opts.notePages} max={10} onChange={(n) => setOpt({ notePages: n })} title="Разлинованные страницы" />
        {hasMagic && <Count label="пустых строк на уровень заклинаний" value={opts.spellRows} max={8} onChange={(n) => setOpt({ spellRows: n })} title="Под каждым уровнем, который персонаж может накладывать" />}
      </div>
      <p class="hint">
        В PDF: основной лист (характеристики, навыки, КД, хиты, атаки, клетки для ограниченных умений и ячеек), умения{opts.featureText ? ' с полными описаниями' : ''}
        {hasMagic ? ', заклинания по уровням' : ''}, снаряжение, личность и история{opts.spellText && hasMagic ? ', описания заклинаний' : ''}.
        Всё, что меняется в игре, оставлено пустым для записей карандашом.
      </p>
      <button type="button" class="btn primary" disabled={state.busy} onClick={run}><Icon name="download" size={18} /> {state.busy ? 'Готовлю PDF…' : 'Скачать PDF для печати'}</button>
      {state.msg && <p class="hint" role="status">{state.msg}</p>}
    </div>
  );
}
