import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  ABIL, ALL, BONUS_KINDS, CORE, FORMULA_PRESETS, FormulaError, METHODS, PB_BASE, PB_PER_OPTIONAL,
  active, addStatSet, arrayPool, assignInOrder, baseScores, bonusParts, bonusTargets, copyText, deleteStatSet, emptyData,
  exportStatSets, finalScores, importStatSets, isEmpty, keptRolls, mod, normalize, pbBudget, pbRange, pbSpent, pbTable,
  pointBuyCost, readDraft, restoreAttempt, rollMissing, rollSet, sameData, scoreIssue, scoresLine, setMethod, signed, swap,
  toggleOptional, updateStatSet, useStatSets, writeDraft,
  type Ability, type Bonus, type BonusKind, type Draft, type RolledValue, type StatData, type StatSet,
} from '../stats';
import { averageOf, parseFormula } from '../dice';
import { newId } from '../userstore';
import { useLists } from '../lists';
import { useCharacters } from '../characters';
import { plural } from '../listview';
import { Icon } from './ui';

const BONUS_SOURCES = ['Раса', 'Подраса', 'Происхождение', 'Предыстория', 'Человек', 'Увеличение характеристик (4 ур.)',
  'Увеличение характеристик (8 ур.)', 'Черта', 'Магический предмет', 'Благословение', 'Решение мастера', 'Прочее'];

const fmtDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const num = (s: string, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(s));
  return Number.isFinite(v) && s.trim() !== '' ? Math.min(hi, Math.max(lo, v)) : fallback;
};

/** A line of values that is copied to the clipboard on click. */
function CopyLine({ text, label, small }: { text: string | null; label?: string; small?: boolean }) {
  const [done, setDone] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button type="button" class={`copyline${small ? ' small' : ''}${done ? ` ${done}` : ''}`} disabled={!text}
      title={text ? 'Нажмите, чтобы скопировать' : 'Не все значения определены'} aria-label={`${label ?? 'Скопировать'}: ${text ?? '—'}`}
      onClick={async () => {
        if (!text) return;
        setDone((await copyText(text)) ? 'ok' : 'fail');
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(null), 1600);
      }}>
      {label && <span class="copyline-k">{label}</span>}
      <code>{text ?? '—'}</code>
      <span class="copyline-ic">{done === 'ok' ? <><Icon name="check" size={16} /> скопировано</> : done === 'fail' ? 'не удалось' : <Icon name="copy" size={16} />}</span>
    </button>
  );
}

/** Dice of one rolled value: kept, dropped (crossed out), rerolled results (small, crossed out). */
function RollDetail({ r }: { r: RolledValue }) {
  return (
    <span class="rdetail">
      {r.roll.parts.map((p, i) => (
        p.dice ? (
          <span class="dterm" key={i}>
            {(i > 0 || p.sign < 0) && <span class="dop">{p.sign < 0 ? '−' : '+'}</span>}
            {p.dice.map((die, j) => (
              <span key={j} class={`die${die.dropped ? ' dropped' : ''}${die.exploded ? ' boom' : ''}`}
                title={`${die.dropped ? 'отброшена' : 'учтена'}${die.rerolls.length ? `; переброшено: ${die.rerolls.join(', ')}` : ''}${die.exploded ? '; взрыв' : ''}`}>
                {die.rerolls.length > 0 && <s class="rr">{die.rerolls.join(' ')}</s>}{die.v}
              </span>
            ))}
          </span>
        ) : <span class="dterm" key={i}><span class="dop">{p.sign < 0 ? '−' : '+'}</span>{Math.abs(p.value)}</span>
      ))}
    </span>
  );
}

function FormulaHelp() {
  return (
    <details class="formula-help">
      <summary>Как записать формулу</summary>
      <p>Формула — это кости и числа, соединённые знаками <code>+</code> и <code>−</code>. Пробелы и регистр не важны; вместо <code>d</code> можно писать
        русские <code>к</code> или <code>д</code> (<code>4к6</code>). Каждое значение характеристики — один бросок формулы.</p>
      <table>
        <tbody>
          <tr><th><code>NdM</code></th><td>N костей с M гранями: <code>3d6</code>, <code>2d8</code>. Без N — одна кость: <code>d20</code>. <code>d%</code> — кость на 100.</td></tr>
          <tr><th><code>khK</code> или <code>kK</code></th><td>оставить K наибольших костей: <code>4d6kh3</code> — правило «Книги игрока».</td></tr>
          <tr><th><code>klK</code></th><td>оставить K наименьших: <code>3d6kl2</code>.</td></tr>
          <tr><th><code>dlK</code> или <code>dK</code></th><td>отбросить K наименьших: <code>4d6dl1</code> — то же, что <code>4d6kh3</code>.</td></tr>
          <tr><th><code>dhK</code></th><td>отбросить K наибольших.</td></tr>
          <tr><th><code>rX</code></th><td>перебрасывать кость, пока выпадает X: <code>4d6r1kh3</code> — единицы не в счёт.</td></tr>
          <tr><th><code>r&lt;X</code>, <code>r&gt;X</code></th><td>перебрасывать результаты X и меньше / X и больше: <code>4d6r&lt;2kh3</code> — без единиц и двоек.</td></tr>
          <tr><th><code>roX</code>, <code>ro&lt;X</code></th><td>перебросить только один раз — второй результат остаётся, даже если он такой же.</td></tr>
          <tr><th><code>!</code></th><td>«взрыв»: при максимуме кость бросается ещё раз и результат прибавляется: <code>1d6!</code>.</td></tr>
          <tr><th><code>+ −</code></th><td>сложить или вычесть: <code>2d6+6</code>, <code>1d10+8</code>, <code>3d6+1d4-2</code>.</td></tr>
        </tbody>
      </table>
      <p>Правила пишутся сразу после своих костей, в любом порядке: <code>4d6r1kh3</code> = <code>4d6kh3r1</code>. Под полем видно, какие значения
        возможны и какое в среднем.</p>
      <p><b>Примеры:</b> <code>4d6kh3</code> — стандарт (3–18, в среднем ≈12,2); <code>3d6</code> — классика (≈10,5); <code>2d6+6</code> — без провалов
        (8–18); <code>5d6kh3</code> — героические (≈13,4); <code>4d6r1kh3</code> — без единиц (≈13); <code>1d20</code> — хаос.</p>
      <p>Число бросков задаётся отдельно: например, «Бросков: 7» — бросить 7 значений и отбросить худшее.</p>
    </details>
  );
}

/* ---------------- the page ---------------- */

export function StatsPage() {
  const [draft, setDraftState] = useState<Draft>(readDraft);
  const [rollError, setRollError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const sets = useStatSets();
  const lists = useLists();
  const chars = useCharacters();
  const d = draft.data;
  const setDraft = (next: Draft) => { setDraftState(next); writeDraft(next); };
  const set = (data: StatData) => setDraft({ ...draft, data });
  const patch = (p: Partial<StatData>) => set({ ...d, ...p });

  const act = active(d);
  const base = baseScores(d);
  const parts = bonusParts(d);
  const final = finalScores(d);
  const saved = draft.savedId ? sets.find((s) => s.id === draft.savedId) ?? null : null;
  const dirty = saved ? !sameData(saved.data, d) : !isEmpty(d);
  const names = useMemo(() => [...new Set([...chars.map((c) => c.name), ...lists.map((b) => b.name), ...sets.map((s) => s.data.character)]
    .map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [chars, lists, sets]);

  const formulaInfo = useMemo(() => {
    try {
      const f = parseFormula(d.formula);
      return { f, avg: averageOf(f), error: null as string | null };
    } catch (e) {
      return { f: null, avg: 0, error: e instanceof FormulaError ? e.message : 'Ошибка в формуле.' };
    }
  }, [d.formula]);

  const flash = (text: string) => { setMsg(text); window.setTimeout(() => setMsg((m) => (m === text ? null : m)), 2500); };
  const save = () => {
    if (saved) { updateStatSet(saved.id, d); flash('Изменения сохранены.'); return; }
    const id = newId();
    addStatSet(id, d);
    setDraft({ savedId: id, data: d });
    flash('Набор сохранён.');
  };
  const saveAsNew = () => {
    const id = newId();
    const data = { ...d, name: d.name.trim() ? `${d.name.trim()} (копия)` : '' };
    addStatSet(id, data);
    setDraft({ savedId: id, data });
    flash('Сохранено как новый набор.');
  };
  const confirmLeave = () => !dirty || confirm('В калькуляторе есть несохранённые изменения — они пропадут. Продолжить?');
  const load = (s: StatSet) => {
    if (s.id === draft.savedId && !dirty) return;
    if (!confirmLeave()) return;
    setDraft({ savedId: s.id, data: normalize(s.data) });
    setRollError(null);
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const reset = () => {
    if (!confirmLeave()) return;
    setDraft({ savedId: null, data: { ...emptyData(), character: d.character } });
    setRollError(null);
  };
  const remove = (s: StatSet) => {
    if (!confirm(`Удалить набор «${setTitle(s.data)}»${s.data.character ? ` (${s.data.character})` : ''}?`)) return;
    deleteStatSet(s.id);
    if (draft.savedId === s.id) setDraft({ savedId: null, data: d });
  };
  const roll = (fn: (x: StatData) => StatData) => {
    try { set(fn(d)); setRollError(null); } catch (e) { setRollError(e instanceof FormulaError ? e.message : 'Не удалось бросить.'); }
  };

  const sumFinal = act.every((a) => final[a] != null) ? act.reduce((s, a) => s + final[a]!, 0) : null;
  const sumMods = act.every((a) => final[a] != null) ? act.reduce((s, a) => s + mod(final[a]!), 0) : null;
  const coreBase = CORE.map((a) => base[a]);
  const pbEq = coreBase.every((v) => v != null) ? pointBuyCost(coreBase as number[]) : null;
  const pbEqExt = pbEq == null && coreBase.every((v) => v != null) ? pointBuyCost(coreBase as number[], true) : null;

  return (
    <section class="detail lists stats" ref={topRef}>
      <header class="detail-head">
        <div class="title">
          <h2>Характеристики</h2>
          <div class="subtitle">Поинтбай, стандартный набор, броски и увеличения — по правилам D&amp;D 5e</div>
        </div>
      </header>

      <div class="stats-layout">
        <div class="stats-main">
          <div class="set-fields">
            <label><span>Персонаж</span>
              <input type="text" list="stat-chars" maxLength={80} placeholder="Имя персонажа" value={d.character}
                onInput={(e) => patch({ character: (e.target as HTMLInputElement).value })} />
            </label>
            <label><span>Название набора</span>
              <input type="text" maxLength={80} placeholder="Например: «Броски, сессия 0»" value={d.name}
                onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })} />
            </label>
            <datalist id="stat-chars">{names.map((n) => <option value={n} />)}</datalist>
          </div>

          <h3 class="sec">Способ</h3>
          <div class="methods" role="radiogroup" aria-label="Способ определения характеристик">
            {METHODS.map((m) => (
              <button type="button" role="radio" aria-checked={d.method === m.id} class={`mcard${d.method === m.id ? ' on' : ''}`}
                onClick={() => set(setMethod(d, m.id))}>
                <b>{m.label}</b><span>{m.id === 'pointbuy' && d.budget != null ? `${d.budget} очков, значения ${pbRange(d.extended).join('–')}` : m.hint}</span>
              </button>
            ))}
          </div>

          <div class="optional">
            <label class="check">
              <input type="checkbox" checked={d.san} onChange={(e) => set(toggleOptional(d, 'san', (e.target as HTMLInputElement).checked))} />
              <span><b>Здравомыслие</b> — спасброски от безумия, проверки вместо Интеллекта при встрече с непостижимым</span>
            </label>
            <label class="check">
              <input type="checkbox" checked={d.hon} onChange={(e) => set(toggleOptional(d, 'hon', (e.target as HTMLInputElement).checked))} />
              <span><b>Честь</b> — следование кодексу; не растёт от увеличения характеристик, пределы 1–20</span>
            </label>
            <p class="hint">Дополнительные характеристики из «Руководства мастера» (с. 264): +{PB_PER_OPTIONAL} очка поинтбая и ещё одно значение 11
              в стандартный набор за каждую, при бросках — ещё один бросок.</p>
          </div>

          {d.method === 'pointbuy' && <PointBuyPanel d={d} set={set} />}
          {d.method === 'array' && (
            <div class="mpanel">
              <p>Значения <b>{arrayPool(d).map((p) => p.value).join(', ')}</b> распределяются между характеристиками. Выберите значение у
                характеристики — оно поменяется местами с той, у которой было.</p>
            </div>
          )}
          {d.method === 'roll' && (
            <RollPanel d={d} set={set} patch={patch} info={formulaInfo} error={rollError}
              onRoll={() => roll(rollSet)} onRollMissing={() => roll(rollMissing)} />
          )}
          {d.method === 'manual' && (
            <div class="mpanel"><p>Впишите значения сами — например, полученные от мастера или из другого источника (от 1 до 30).</p></div>
          )}

          <h3 class="sec">Итог</h3>
          <div class="srows" role="table" aria-label="Характеристики">
            <div class="srow shead" role="row">
              <span role="columnheader">Характеристика</span>
              <span role="columnheader">{d.method === 'pointbuy' ? 'Основа · цена' : 'Основа'}</span>
              <span role="columnheader">Бонусы</span>
              <span role="columnheader">Итог</span>
              <span role="columnheader">Мод.</span>
            </div>
            {act.map((a) => {
              const bsum = parts[a].reduce((s, p) => s + p.value, 0);
              const v = final[a];
              const issue = scoreIssue(a, v);
              return (
                <div class={`srow${a === 'san' || a === 'hon' ? ' opt' : ''}`} role="row" key={a}>
                  <span class="sname" role="cell"><b>{ABIL[a].name}</b><small>{ABIL[a].short}</small></span>
                  <span class="sbase" role="cell"><BaseControl d={d} a={a} set={set} /></span>
                  <span class={`sbonus${bsum ? '' : ' none'}`} role="cell" title={parts[a].map((p) => `${p.source}: ${signed(p.value)}`).join('\n') || 'нет'}>
                    {bsum ? signed(bsum) : '—'}
                    {parts[a].length > 0 && <small>{parts[a].map((p) => p.source).join(', ')}</small>}
                  </span>
                  <span class={`stotal${issue ? ' warn' : ''}`} role="cell" title={issue ?? undefined}>{v ?? '—'}{issue && <i aria-label={issue}>!</i>}</span>
                  <span class="smod" role="cell">{v == null ? '—' : signed(mod(v))}</span>
                </div>
              );
            })}
          </div>
          <div class="ssum">
            <span>Сумма: <b>{sumFinal ?? '—'}</b></span>
            <span>Сумма модификаторов: <b>{sumMods == null ? '—' : signed(sumMods)}</b></span>
            <span title="Сколько стоили бы основные шесть значений (без бонусов) по таблице поинтбая">
              Цена основы по поинтбаю: <b>{pbEq != null ? `${pbEq} очк.` : pbEqExt != null ? `${pbEqExt} очк. (расширенная таблица)` : 'вне таблицы'}</b>
            </span>
          </div>
          <div class="copies">
            <CopyLine label="Итог" text={scoresLine(d, 'values')} />
            <CopyLine label="Модификаторы" text={scoresLine(d, 'mods')} small />
            {d.bonuses.length > 0 && <CopyLine label="Без бонусов" text={scoresLine(d, 'values', 'base')} small />}
            <p class="hint">Порядок: {act.map((a) => ABIL[a].short).join(' ')}. Нажмите на строку — она скопируется через пробел.</p>
          </div>

          <h3 class="sec">Бонусы к характеристикам</h3>
          <BonusEditor d={d} set={set} />

          <h3 class="sec">Что дают итоговые значения</h3>
          <Facts d={d} final={final} />

          <h3 class="sec">Заметки</h3>
          <textarea class="snotes" rows={3} maxLength={4000} placeholder="Например: кто и когда бросал, договорённости с мастером"
            value={d.notes} onInput={(e) => patch({ notes: (e.target as HTMLTextAreaElement).value })} />
        </div>

        <aside class="stats-side">
          <div class="save-card">
            <p class={`save-state${dirty ? ' dirty' : ''}`} role="status">
              {saved ? (dirty ? `Есть несохранённые изменения в «${setTitle(saved.data)}»` : `Открыт сохранённый набор «${setTitle(saved.data)}»`) : dirty ? 'Набор не сохранён' : 'Новый набор'}
            </p>
            <div class="btn-row">
              <button type="button" class="btn primary" disabled={Boolean(saved && !dirty)} onClick={save}>
                <Icon name="check" size={18} /> {saved ? 'Сохранить изменения' : 'Сохранить набор'}
              </button>
              {saved && <button type="button" class="btn" onClick={saveAsNew}>Как новый</button>}
              <button type="button" class="btn ghost" onClick={reset}><Icon name="plus" size={18} /> Новый</button>
            </div>
            {msg && <p class="hint" role="status">{msg}</p>}
          </div>

          <SavedSets sets={sets} current={draft.savedId} onLoad={load} onRemove={remove} />

          <div class="backup">
            <p class="hint">Наборы хранятся в этом браузере, как списки и листы персонажей. Чтобы перенести их на другое устройство, сохраните копию в файл.</p>
            <div class="btn-row">
              <button type="button" class="btn small" disabled={!sets.length} onClick={exportStatSets}><Icon name="download" size={16} /> В файл</button>
              <button type="button" class="btn small" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /> Из файла</button>
            </div>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const input = e.target as HTMLInputElement;
              const f = input.files?.[0];
              if (!f) return;
              try { flash(`Загружено наборов: ${await importStatSets(f)}.`); } catch { flash('Это не файл с наборами характеристик.'); }
              input.value = '';
            }} />
          </div>
        </aside>
      </div>
    </section>
  );
}

export function setTitle(d: StatData) {
  return d.name.trim() || METHODS.find((m) => m.id === d.method)!.label;
}

/* ---------------- point buy ---------------- */

function PointBuyPanel({ d, set }: { d: StatData; set: (d: StatData) => void }) {
  const budget = pbBudget(d);
  const spent = pbSpent(d);
  const left = budget - spent;
  const std = PB_BASE + PB_PER_OPTIONAL * (Number(d.san) + Number(d.hon));
  const table = pbTable(d.extended);
  const values = Object.keys(table).map(Number).sort((a, b) => a - b);
  return (
    <div class="mpanel pb">
      <div class="pb-head">
        <label class="pb-budget"><span>Очков</span>
          <input type="number" inputMode="numeric" min={0} max={200} value={budget}
            onChange={(e) => { const v = num((e.target as HTMLInputElement).value, 0, 200, std); set({ ...d, budget: v === std ? null : v }); }} />
        </label>
        <div class={`pb-left${left < 0 ? ' over' : left === 0 ? ' zero' : ''}`} role="status">
          <b>{left}</b> <span>{left < 0 ? 'перерасход' : plural(left, 'очко осталось', 'очка осталось', 'очков осталось')}</span>
          <small>потрачено {spent} из {budget}</small>
        </div>
        {d.budget != null && <button type="button" class="link" onClick={() => set({ ...d, budget: null })}>вернуть {std}</button>}
      </div>
      <div class="pb-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, (spent / Math.max(1, budget)) * 100))}%` }} /></div>
      <p class="hint">Стандарт — {PB_BASE} очков{d.san || d.hon ? ` + ${PB_PER_OPTIONAL} за каждую дополнительную характеристику = ${std}` : ''}. Своё число очков
        впишите в поле — например, 32 для более сильных героев.</p>
      <label class="check">
        <input type="checkbox" checked={d.extended} onChange={(e) => {
          const on = (e.target as HTMLInputElement).checked;
          const [lo, hi] = pbRange(on);
          const pb = { ...d.pb };
          for (const a of ALL) pb[a] = Math.min(hi, Math.max(lo, pb[a]));
          set({ ...d, extended: on, pb });
        }} />
        <span>Расширенная таблица 3–18 <span class="muted">(домашнее правило: значения ниже 8 возвращают очки, выше 15 стоят дороже)</span></span>
      </label>
      <details class="pb-table">
        <summary>Таблица стоимости</summary>
        <table>
          <tbody>
            <tr><th>Значение</th>{values.map((v) => <td>{v}</td>)}</tr>
            <tr><th>Стоимость</th>{values.map((v) => <td class={v < 8 || v > 15 ? 'ext' : ''}>{table[v]}</td>)}</tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ---------------- rolling ---------------- */

interface RollPanelProps {
  d: StatData;
  set: (d: StatData) => void;
  patch: (p: Partial<StatData>) => void;
  info: { f: ReturnType<typeof parseFormula> | null; avg: number; error: string | null };
  error: string | null;
  onRoll: () => void;
  onRollMissing: () => void;
}

function RollPanel({ d, set, patch, info, error, onRoll, onRollMissing }: RollPanelProps) {
  const act = active(d);
  const need = act.length;
  const total = Math.max(need, d.count ?? need);
  const kept = keptRolls(d);
  const missing = act.filter((a) => !d.rollAssign[a]);
  const holder = (id: string) => act.find((a) => d.rollAssign[a] === id);
  const preset = FORMULA_PRESETS.find((p) => p.formula === d.formula.replace(/\s+/g, '').toLowerCase());
  const [custom, setCustom] = useState(!preset);
  return (
    <div class="mpanel roll">
      <div class="chips">
        {FORMULA_PRESETS.map((p) => (
          <button type="button" class={`chip${!custom && preset === p ? ' on' : ''}`} title={p.hint} aria-pressed={!custom && preset === p}
            onClick={() => { setCustom(false); patch({ formula: p.formula }); }}>{p.label}</button>
        ))}
        <button type="button" class={`chip${custom || !preset ? ' on' : ''}`} aria-pressed={custom || !preset} onClick={() => setCustom(true)}>Своя формула</button>
      </div>
      {(custom || !preset) && (
        <label class="formula">
          <span>Формула одного значения</span>
          <input type="text" spellcheck={false} autocomplete="off" value={d.formula} placeholder="например, 4d6kh3" aria-invalid={Boolean(info.error)}
            onInput={(e) => patch({ formula: (e.target as HTMLInputElement).value })} />
        </label>
      )}
      <p class={`formula-info${info.error ? ' err' : ''}`} role="status">
        {info.error ?? (info.f && <>
          <code>{info.f.text}</code>: от {info.f.min} до {Number.isFinite(info.f.max) ? info.f.max : '∞'}, в среднем ≈ {info.avg.toFixed(1).replace('.', ',')}
          {(info.f.min < 1 || info.f.max > 30) && <span class="warnnote"> · выходит за пределы 1–30</span>}
        </>)}
      </p>
      {(custom || !preset) && <FormulaHelp />}

      <div class="roll-opts">
        <label class="num-opt"><span>Бросков</span>
          <input type="number" inputMode="numeric" min={need} max={20} value={total}
            onChange={(e) => { const v = num((e.target as HTMLInputElement).value, need, 20, need); patch({ count: v === need ? null : v }); }} />
          <small>{total > need ? `${total - need} худш${total - need === 1 ? 'ее' : 'их'} отбросится` : `по одному на характеристику`}</small>
        </label>
        <label class="check">
          <input type="checkbox" checked={d.inOrder} onChange={(e) => {
            const on = (e.target as HTMLInputElement).checked;
            set(on ? assignInOrder({ ...d, inOrder: true }) : { ...d, inOrder: false });
          }} />
          <span>По порядку: значения идут в {act.map((a) => ABIL[a].short).join(', ')} как выпали, без перестановки</span>
        </label>
        <label class="check">
          <input type="checkbox" checked={d.minMods != null} onChange={(e) => patch({ minMods: (e.target as HTMLInputElement).checked ? 1 : null })} />
          <span>Домашнее правило: перебрасывать весь набор, пока сумма модификаторов меньше
            {' '}<input type="number" class="inline-num" min={-10} max={20} value={d.minMods ?? 1} disabled={d.minMods == null}
              onChange={(e) => patch({ minMods: num((e.target as HTMLInputElement).value, -10, 20, 1) })} /></span>
        </label>
      </div>

      <div class="roll-go">
        <button type="button" class="btn primary big" disabled={Boolean(info.error)} onClick={onRoll}>
          <Icon name="dice" size={20} /> {d.rolls.length ? 'Бросить заново' : 'Бросить'}
        </button>
        {d.rolledAt && (
          <span class="hint">Брошено {fmtDate(d.rolledAt)}, {fmtTime(d.rolledAt)}
            {d.attempts > 1 ? ` · наборов по домашнему правилу: ${d.attempts}${d.attempts >= 1000 ? ' (предел)' : ''}` : ''}</span>
        )}
      </div>
      {error && <p class="err" role="alert">{error}</p>}

      {d.rolls.length > 0 && (
        <ul class="rolls">
          {d.rolls.map((r) => {
            const a = holder(r.id);
            return (
              <li class={`rcard${r.dropped ? ' dropped' : ''}`} key={r.id}>
                <span class="rval">{r.value}</span>
                <RollDetail r={r} />
                <span class="rwho">{r.dropped ? 'отброшено' : a ? ABIL[a].short : 'не назначено'}{r.extra ? ' · доброшено' : ''}</span>
              </li>
            );
          })}
        </ul>
      )}
      {d.rolls.length > 0 && missing.length > 0 && (
        <p class="hint warn">
          Не хватает {missing.length === 1 ? 'значения' : 'значений'} для: {missing.map((a) => ABIL[a].name).join(', ')}.{' '}
          <button type="button" class="btn small" onClick={onRollMissing}><Icon name="dice" size={16} /> Добросить</button>
        </p>
      )}
      {d.rolls.length > 0 && !d.inOrder && kept.length >= need && (
        <p class="hint">Значения можно переставить: выберите другое значение у характеристики в таблице ниже.</p>
      )}
      {d.history.length > 0 && (
        <details class="history">
          <summary>Предыдущие броски ({d.history.length})</summary>
          <ul>
            {d.history.map((h, i) => (
              <li key={h.at + i}>
                <span class="muted">{fmtTime(h.at)}</span>
                <code>{h.rolls.map((r) => (r.dropped ? `(${r.value})` : r.value)).join(' ')}</code>
                <span class="muted">{h.formula}</span>
                <button type="button" class="link" onClick={() => set(restoreAttempt(d, i))}>вернуть</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ---------------- base score control per method ---------------- */

function BaseControl({ d, a, set }: { d: StatData; a: Ability; set: (d: StatData) => void }) {
  if (d.method === 'pointbuy') {
    const table = pbTable(d.extended);
    const [lo, hi] = pbRange(d.extended);
    const v = d.pb[a];
    const left = pbBudget(d) - pbSpent(d);
    const up = v < hi ? table[v + 1] - table[v] : null;
    return (
      <span class="pbctl">
        <span class="stepper">
          <button type="button" aria-label={`${ABIL[a].name}: меньше`} disabled={v <= lo} onClick={() => set({ ...d, pb: { ...d.pb, [a]: v - 1 } })}>−</button>
          <b>{v}</b>
          <button type="button" aria-label={`${ABIL[a].name}: больше`} disabled={up == null || up > left}
            title={up == null ? `Максимум ${hi}` : up > left ? `Нужно ${up} очк., осталось ${left}` : `Стоит ещё ${up} очк.`}
            onClick={() => set({ ...d, pb: { ...d.pb, [a]: v + 1 } })}>+</button>
        </span>
        <small class="scost">{table[v]} очк.</small>
      </span>
    );
  }
  if (d.method === 'manual') {
    return (
      <input class="mnum" type="number" inputMode="numeric" min={1} max={30} value={d.manual[a]} aria-label={`${ABIL[a].name}: значение`}
        onChange={(e) => set({ ...d, manual: { ...d.manual, [a]: num((e.target as HTMLInputElement).value, 1, 30, d.manual[a]) } })} />
    );
  }
  const isArray = d.method === 'array';
  const pool = isArray ? arrayPool(d) : keptRolls(d);
  const assign = (isArray ? d.arrayAssign : d.rollAssign) as Partial<Record<Ability, string | null>>;
  const act = active(d);
  const owner = (id: string) => act.find((b) => assign[b] === id);
  const cur = assign[a] ?? '';
  if (!isArray && !d.rolls.length) return <span class="muted">бросьте</span>;
  return (
    <select class="pick" value={cur} disabled={!isArray && d.inOrder} aria-label={`${ABIL[a].name}: значение`}
      onChange={(e) => {
        const id = (e.target as HTMLSelectElement).value;
        if (!id) return;
        if (isArray) set({ ...d, arrayAssign: swap(d.arrayAssign, a, id) });
        else set({ ...d, rollAssign: swap(d.rollAssign, a, id as string | null) });
      }}>
      {!cur && <option value="">—</option>}
      {pool.map((p) => {
        const o = owner(p.id);
        return <option value={p.id}>{p.value}{o && o !== a ? ` — сейчас у ${ABIL[o].short}` : !o ? ' — свободно' : ''}{'note' in p && p.note ? ` (${p.note})` : ''}</option>;
      })}
    </select>
  );
}

/* ---------------- bonuses ---------------- */

const ORDER: BonusKind[] = ['p21', 'p111', 'all1', 'p2', 'p11', 'p1', 'custom'];

function BonusEditor({ d, set }: { d: StatData; set: (d: StatData) => void }) {
  const change = (id: string, p: Partial<Bonus>) => set({ ...d, bonuses: d.bonuses.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  const add = (kind: BonusKind) => set({ ...d, bonuses: [...d.bonuses, { id: newId(), source: '', kind, picks: BONUS_KINDS[kind].slots.map(() => ''), custom: {} }] });
  return (
    <div class="bonuses">
      {d.bonuses.length === 0 && <p class="empty-note">Бонусов пока нет. Добавьте увеличения от расы или происхождения, классов и черт.</p>}
      {d.bonuses.map((b) => {
        const k = BONUS_KINDS[b.kind];
        const targets = bonusTargets(d, b.kind);
        const unpicked = k.slots.some((_, i) => !b.picks[i]);
        return (
          <div class="brow" key={b.id}>
            <div class="brow-head">
              <input class="bsrc" type="text" list="bonus-sources" maxLength={60} placeholder={k.source} value={b.source} aria-label="Источник бонуса"
                onInput={(e) => change(b.id, { source: (e.target as HTMLInputElement).value })} />
              <select aria-label="Вид бонуса" value={b.kind} onChange={(e) => {
                const kind = (e.target as HTMLSelectElement).value as BonusKind;
                change(b.id, { kind, picks: BONUS_KINDS[kind].slots.map((_, i) => b.picks[i] ?? '') });
              }}>
                {ORDER.map((x) => <option value={x}>{BONUS_KINDS[x].label}</option>)}
              </select>
              <button type="button" class="icon-btn" aria-label="Убрать бонус" title="Убрать бонус"
                onClick={() => set({ ...d, bonuses: d.bonuses.filter((x) => x.id !== b.id) })}><Icon name="close" size={18} /></button>
            </div>
            {k.slots.length > 0 && (
              <div class="bpicks">
                {k.slots.map((amt, i) => (
                  <label class="bpick">
                    <span>+{amt}</span>
                    <select value={b.picks[i] ?? ''} aria-label={`+${amt}: характеристика`} onChange={(e) => {
                      const picks = [...b.picks];
                      picks[i] = (e.target as HTMLSelectElement).value as Ability | '';
                      change(b.id, { picks });
                    }}>
                      <option value="">выберите…</option>
                      {targets.map((a) => <option value={a} disabled={b.picks.some((p, j) => j !== i && p === a)}>{ABIL[a].name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {b.kind === 'all1' && <p class="bnote">{CORE.map((a) => `${ABIL[a].short} +1`).join(' · ')}</p>}
            {b.kind === 'custom' && (
              <div class="bcustom">
                {active(d).map((a) => (
                  <label><span>{ABIL[a].short}</span>
                    <input type="number" inputMode="numeric" min={-10} max={10} placeholder="0" value={b.custom[a] ?? ''}
                      onChange={(e) => {
                        const raw = (e.target as HTMLInputElement).value;
                        const custom = { ...b.custom };
                        if (raw.trim() === '' || Number(raw) === 0) delete custom[a]; else custom[a] = num(raw, -10, 10, 0);
                        change(b.id, { custom });
                      }} />
                  </label>
                ))}
              </div>
            )}
            <p class={`hint${unpicked ? ' warn' : ''}`}>{unpicked ? 'Выберите характеристики. ' : ''}{k.hint}.</p>
          </div>
        );
      })}
      <datalist id="bonus-sources">{BONUS_SOURCES.map((s) => <option value={s} />)}</datalist>
      <div class="badd">
        <span class="muted">Добавить:</span>
        {ORDER.map((x) => (
          <button type="button" class="chip" title={BONUS_KINDS[x].hint} onClick={() => add(x)}>
            {x === 'p2' || x === 'p11' ? `Увеличение ${BONUS_KINDS[x].label}` : x === 'p1' ? 'Черта +1' : BONUS_KINDS[x].label}
          </button>
        ))}
      </div>
      <p class="hint">Увеличение характеристик классы дают на 4, 8, 12, 16 и 19 уровнях (воин — ещё на 6 и 14, плут — на 10): +2 к одной
        характеристике или +1 к двум; выше 20 так подняться нельзя. Честь увеличениями не растёт — её меняет мастер (на 1 в конце приключения),
        поэтому для неё доступны только «Свои значения».</p>
    </div>
  );
}

/* ---------------- what the scores give ---------------- */

function Facts({ d, final }: { d: StatData; final: Record<Ability, number | null> }) {
  const act = active(d);
  const s = (a: Ability) => final[a];
  const m = (a: Ability) => (final[a] == null ? null : mod(final[a]!));
  const items: [Ability, JSX.Element][] = [];
  const S = s('str'), D = m('dex'), C = m('con');
  if (S != null) {
    items.push(['str', <>Грузоподъёмность <b>{S * 15}</b> фунтов; толкать, тянуть, поднимать — до <b>{S * 30}</b> фунтов.
      Прыжок в длину с разбега — <b>{S}</b> фт (с места — {Math.floor(S / 2)}), в высоту с разбега — <b>{Math.max(0, 3 + m('str')!)}</b> фт
      (с места — {Math.floor(Math.max(0, 3 + m('str')!) / 2)}). Для существа среднего размера.</>]);
  }
  if (D != null) items.push(['dex', <>Инициатива <b>{signed(D)}</b>; КД без доспехов — <b>{10 + D}</b>; лёгкие доспехи прибавляют весь модификатор, средние — не больше +2.</>]);
  if (C != null) {
    const breath = 1 + C;
    items.push(['con', <>Хиты за уровень: кость хитов <b>{signed(C)}</b> (не меньше 1). Задержать дыхание — на <b>{breath >= 1 ? `${breath} ${plural(breath, 'минуту', 'минуты', 'минут')}` : '30 секунд'}</b>;
      спасброски концентрации.</>]);
  }
  for (const a of ['int', 'wis', 'cha'] as Ability[]) {
    const mm = m(a);
    if (mm == null) continue;
    items.push([a, <>Для заклинателя с этой характеристикой на 1–4 уровне: СЛ спасброска <b>{8 + 2 + mm}</b>, бонус атаки заклинанием <b>{signed(2 + mm)}</b>.
      {a === 'wis' && <> Пассивная Мудрость (Внимательность) — <b>{10 + mm}</b>.</>}
      {a === 'int' && <> Проверки знаний: Магия, История, Природа, Религия, Анализ.</>}
      {a === 'cha' && <> Обман, Убеждение, Запугивание, Выступление.</>}</>]);
  }
  if (act.includes('san') && m('san') != null) {
    items.push(['san', <>Спасброски Здравомыслия <b>{signed(m('san')!)}</b> — от безумия (существа Дальнего Предела, некоторые заклинания, психический урон);
      проверки — вместо Интеллекта, чтобы понять чуждые тексты и знания. Долгосрочное или бессрочное безумие снижает Здравомыслие на 1.</>]);
  }
  if (act.includes('hon') && m('hon') != null) {
    items.push(['hon', <>Проверки Чести <b>{signed(m('hon')!)}</b> — в общении, как Харизма, когда важны кодекс и этикет; спасброски — чтобы по
      неосторожности не совершить бесчестный поступок. Значение меняет мастер (±1 в конце приключения), пределы 1–20.</>]);
  }
  if (!items.length) return <p class="empty-note">Сначала определите значения.</p>;
  return (
    <ul class="facts">
      {items.map(([a, el]) => (
        <li key={a}><b class="fact-k">{ABIL[a].name} {final[a]}</b><span>{el}</span></li>
      ))}
    </ul>
  );
}

/* ---------------- saved sets ---------------- */

function SavedSets({ sets, current, onLoad, onRemove }: { sets: StatSet[]; current: string | null; onLoad: (s: StatSet) => void; onRemove: (s: StatSet) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, StatSet[]>();
    for (const s of [...sets].sort((a, b) => b.updated - a.updated)) {
      const k = s.data.character?.trim() || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return [...m.entries()];
  }, [sets]);
  return (
    <div class="saved">
      <h3 class="sec">Сохранённые наборы{sets.length ? ` (${sets.length})` : ''}</h3>
      {sets.length === 0 && <p class="empty-note">Пока пусто. Определите характеристики, впишите имя персонажа и нажмите «Сохранить набор».</p>}
      {groups.map(([name, list]) => (
        <div class="sgroup" key={name}>
          <h4>{name || 'Без персонажа'}</h4>
          <ul>
            {list.map((s) => {
              const data = normalize(s.data);
              return (
                <li class={`sset${s.id === current ? ' cur' : ''}`} key={s.id}>
                  <div class="sset-head">
                    <button type="button" class="sset-main" onClick={() => onLoad(s)} title="Открыть в калькуляторе">
                      <b>{setTitle(data)}</b>
                      <small>{METHODS.find((m) => m.id === data.method)!.label}{data.san || data.hon ? ` · ${[data.san && 'ЗДР', data.hon && 'ЧСТ'].filter(Boolean).join(', ')}` : ''} · {fmtDate(s.updated)}</small>
                    </button>
                    <button type="button" class="icon-btn" aria-label={`Удалить набор «${setTitle(data)}»`} title="Удалить" onClick={() => onRemove(s)}><Icon name="trash" size={18} /></button>
                  </div>
                  <CopyLine small text={scoresLine(data, 'values')} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
