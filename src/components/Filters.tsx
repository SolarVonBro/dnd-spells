import type { Dataset, Filters as F, Tri } from '../types';
import { CAST_BUCKETS, DAMAGE, SCHOOL, SOURCE_SHORT, levelShort } from '../i18n';
import { EMPTY_FILTERS, activeFilterCount } from '../model';
import { Chip, Icon, TriChip } from './ui';

interface Props {
  data: Dataset;
  filters: F;
  onChange: (f: F) => void;
  subclassCounts: Map<string, number>;
  noList: Set<string>;
  onClose?: () => void;
  resultCount: number;
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Group(props: { title: string; active: boolean; onReset: () => void; children: any }) {
  return (
    <section class="fgroup">
      <header>
        <h3>{props.title}</h3>
        {props.active && <button type="button" class="link" onClick={props.onReset}>сбросить</button>}
      </header>
      <div class="chips">{props.children}</div>
    </section>
  );
}

export function FiltersPanel({ data, filters: f, onChange, subclassCounts, noList, onClose, resultCount }: Props) {
  const set = (patch: Partial<F>) => onChange({ ...f, ...patch });
  // Spellcasting classes first, then classes that get spells only through subclasses, then Laserllama classes.
  const byName = (a: { ru: string }, b: { ru: string }) => a.ru.localeCompare(b.ru, 'ru');
  const official = [
    ...data.classes.filter((c) => !c.homebrew && !noList.has(c.code)).sort(byName),
    ...data.classes.filter((c) => !c.homebrew && noList.has(c.code)).sort(byName),
  ];
  const homebrew = data.classes.filter((c) => c.homebrew).sort(byName);
  const count = activeFilterCount(f);

  const toggleClass = (code: string) => {
    const on = f.classes.includes(code);
    set({ classes: toggle(f.classes, code), subclasses: on ? f.subclasses.filter((s) => !s.startsWith(`${code}:`)) : f.subclasses });
  };

  return (
    <div class="filters">
      <div class="filters-head">
        <h2>Фильтры{count ? <span class="badge">{count}</span> : null}</h2>
        {count > 0 && <button type="button" class="link" onClick={() => onChange({ ...EMPTY_FILTERS, q: f.q })}>Сбросить всё</button>}
        {onClose && <button type="button" class="icon-btn" aria-label="Закрыть фильтры" onClick={onClose}><Icon name="close" /></button>}
      </div>

      <Group title="Класс" active={f.classes.length > 0} onReset={() => set({ classes: [], subclasses: [] })}>
        {official.map((c) => <Chip on={f.classes.includes(c.code)} onClick={() => toggleClass(c.code)} title={c.en}>{c.ru}</Chip>)}
        {homebrew.map((c) => <Chip tone="ll" on={f.classes.includes(c.code)} onClick={() => toggleClass(c.code)} title={`${c.en} — класс Laserllama`}>{c.ru}</Chip>)}
      </Group>
      {f.classes.map((code) => {
        const subs = data.subclasses.filter((s) => s.class === code && subclassCounts.get(s.id));
        if (!subs.length) return null;
        const cls = data.classes.find((c) => c.code === code)!;
        return (
          <section class="fgroup sub">
            <header><h3>Подкласс: {cls.ru}</h3></header>
            <div class="chips">
              {subs.map((s) => (
                <Chip on={f.subclasses.includes(s.id)} onClick={() => set({ subclasses: toggle(f.subclasses, s.id) })} title={`${s.en} (${s.source})`}>
                  {s.ru ?? s.en}
                </Chip>
              ))}
            </div>
          </section>
        );
      })}
      {f.classes.length > 0 && (
        <label class="check">
          <input type="checkbox" checked={f.expanded} onChange={(e) => set({ expanded: (e.target as HTMLInputElement).checked })} />
          Расширенные списки классов (XGE, TCE, FTD, BMT)
        </label>
      )}

      <Group title="Уровень" active={f.levels.length > 0} onReset={() => set({ levels: [] })}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
          <Chip on={f.levels.includes(l)} onClick={() => set({ levels: toggle(f.levels, l) })} title={l === 0 ? 'Заговор' : `${l} уровень`}>
            {l === 0 ? 'Заговор' : levelShort(l)}
          </Chip>
        ))}
      </Group>

      <Group title="Школа" active={f.schools.length > 0} onReset={() => set({ schools: [] })}>
        {Object.entries(SCHOOL).map(([k, s]) => <Chip on={f.schools.includes(k)} onClick={() => set({ schools: toggle(f.schools, k) })} title={s.en}>{s.ru}</Chip>)}
      </Group>

      <Group title="Источник" active={f.sources.length > 0 || f.altOnly} onReset={() => set({ sources: [], altOnly: false })}>
        {data.sources.map((s) => (
          <Chip tone={s.homebrew ? 'll' : undefined} on={f.sources.includes(s.code)} onClick={() => set({ sources: toggle(f.sources, s.code) })} title={`${s.ru} (${s.en})`}>
            {SOURCE_SHORT[s.code] ?? s.code}
          </Chip>
        ))}
        <Chip tone="ll" on={f.altOnly} onClick={() => set({ altOnly: !f.altOnly })} title="Только заклинания, у которых есть альтернативная версия Laserllama">
          Есть ALT-версия
        </Chip>
      </Group>

      <Group title="Концентрация и ритуал" active={Boolean(f.concentration || f.ritual)} onReset={() => set({ concentration: 0, ritual: 0 })}>
        <TriChip value={f.concentration} onChange={(v: Tri) => set({ concentration: v })} title="Концентрация">Концентрация</TriChip>
        <TriChip value={f.ritual} onChange={(v: Tri) => set({ ritual: v })} title="Ритуал">Ритуал</TriChip>
      </Group>

      <Group title="Компоненты" active={Boolean(f.comp.v || f.comp.s || f.comp.m)} onReset={() => set({ comp: { v: 0, s: 0, m: 0 } })}>
        <TriChip value={f.comp.v} onChange={(v) => set({ comp: { ...f.comp, v } })} title="Вербальный (V)">В — вербальный</TriChip>
        <TriChip value={f.comp.s} onChange={(v) => set({ comp: { ...f.comp, s: v } })} title="Соматический (S)">С — соматический</TriChip>
        <TriChip value={f.comp.m} onChange={(v) => set({ comp: { ...f.comp, m: v } })} title="Материальный (M)">М — материальный</TriChip>
      </Group>
      <p class="hint">Нажатие по компоненту, концентрации или ритуалу: «есть» → «нет» → «неважно».</p>

      <Group title="Время накладывания" active={f.cast.length > 0} onReset={() => set({ cast: [] })}>
        {CAST_BUCKETS.map((c) => <Chip tone={c.title ? 'll' : undefined} on={f.cast.includes(c.key)} onClick={() => set({ cast: toggle(f.cast, c.key) })} title={c.title}>{c.ru}</Chip>)}
      </Group>

      <Group title="Тип урона" active={f.damage.length > 0} onReset={() => set({ damage: [] })}>
        {Object.entries(DAMAGE).map(([k, d]) => (
          <Chip on={f.damage.includes(k)} onClick={() => set({ damage: toggle(f.damage, k) })} title={d.en}>
            <i class={`dmg dmg-${k}`} aria-hidden="true" />{d.ru}
          </Chip>
        ))}
      </Group>

      {onClose && (
        <div class="filters-foot">
          <button type="button" class="btn primary" onClick={onClose}>Показать {resultCount}</button>
        </div>
      )}
    </div>
  );
}
