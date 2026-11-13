import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Dataset, Filters as F, Tri } from '../types';
import { CAST_BUCKETS, DAMAGE, SCHOOL, SOURCE_SHORT } from '../i18n';
import { EMPTY_FILTERS, LL_PREFIX, activeFilterCount, laserllamaClasses, officialClasses } from '../model';
import { Chip, Icon, TriChip } from './ui';

interface Props {
  data: Dataset;
  filters: F;
  onChange: (f: F) => void;
  subclassCounts: Map<string, number>;
  noList: Set<string>;
  resultCount: number;
}

type Key = 'class' | 'level' | 'school' | 'source' | 'comp' | 'cast' | 'damage';

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const summary = (items: string[], max = 2) => (items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} +${items.length - max}`);

/** Dropdown panel anchored to its button (desktop) or a bottom sheet (phones). */
function Popover(props: { anchor: HTMLElement | null; title: string; onClose: () => void; resultCount: number; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!props.anchor || !ref.current || window.innerWidth < 720) { setPos(null); return; }
      const a = props.anchor.getBoundingClientRect();
      const w = ref.current.offsetWidth;
      setPos({ left: Math.max(12, Math.min(a.left, window.innerWidth - w - 12)), top: a.bottom + 6 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [props.anchor]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || props.anchor?.contains(t)) return;
      props.onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  });
  return (
    <>
      <div class="pop-scrim" onClick={props.onClose} />
      <div ref={ref} class="pop" role="dialog" aria-label={props.title} style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : undefined}>
        <div class="pop-head">
          <h3>{props.title}</h3>
          <button type="button" class="icon-btn" aria-label="Закрыть" onClick={props.onClose}><Icon name="close" size={18} /></button>
        </div>
        <div class="pop-body">{props.children}</div>
        <div class="pop-foot"><button type="button" class="btn primary" onClick={props.onClose}>Показать {props.resultCount}</button></div>
      </div>
    </>
  );
}

function Section(props: { title?: string; note?: string; children: ComponentChildren }) {
  return (
    <section class="psec">
      {props.title && <h4>{props.title}</h4>}
      {props.note && <p class="hint">{props.note}</p>}
      <div class="chips">{props.children}</div>
    </section>
  );
}

export function FilterBar({ data, filters: f, onChange, subclassCounts, noList, resultCount }: Props) {
  const [open, setOpen] = useState<Key | null>(null);
  const btns = useRef<Partial<Record<Key, HTMLButtonElement | null>>>({});
  const set = (patch: Partial<F>) => onChange({ ...f, ...patch });
  const count = activeFilterCount(f);

  const cls = (code: string) => data.classes.find((c) => c.code === code)?.ru ?? code;
  const byRu = (a: string, b: string) => cls(a).localeCompare(cls(b), 'ru');
  const official = [...officialClasses(data)];
  const spellcasters = official.filter((c) => !noList.has(c)).sort(byRu);
  const subclassOnly = official.filter((c) => noList.has(c)).sort(byRu);
  const llClasses = laserllamaClasses(data).sort(byRu);
  const officialSelected = f.classes.filter((c) => !c.startsWith(LL_PREFIX));

  const toggleClass = (code: string) => {
    const on = f.classes.includes(code);
    set({ classes: toggle(f.classes, code), subclasses: on ? f.subclasses.filter((s) => !s.startsWith(`${code}:`)) : f.subclasses });
  };

  const classLabel = (c: string) => (c.startsWith(LL_PREFIX) ? `${cls(c.slice(LL_PREFIX.length))} (LL)` : cls(c));
  const subLabel = (id: string) => { const s = data.subclasses.find((x) => x.id === id); return s ? s.ru ?? s.en : id; };
  const comps = (['v', 's', 'm'] as const).filter((k) => f.comp[k]).map((k) => `${f.comp[k] === -1 ? 'без ' : ''}${{ v: 'В', s: 'С', m: 'М' }[k]}`);

  const items: { key: Key; label: string; value: string }[] = [
    { key: 'class', label: 'Класс', value: summary([...f.classes.map(classLabel), ...f.subclasses.map(subLabel)]) },
    { key: 'level', label: 'Уровень', value: summary([...f.levels].sort((a, b) => a - b).map((l) => (l === 0 ? 'заговор' : String(l))), 4) },
    { key: 'school', label: 'Школа', value: summary(f.schools.map((s) => SCHOOL[s].ru)) },
    { key: 'source', label: 'Источник', value: summary(f.sources.map((s) => SOURCE_SHORT[s] ?? s)) },
    { key: 'comp', label: 'Компоненты', value: comps.join(', ') },
    { key: 'cast', label: 'Время', value: summary(f.cast.map((c) => CAST_BUCKETS.find((b) => b.key === c)?.ru ?? c)) },
    { key: 'damage', label: 'Урон', value: summary(f.damage.map((d) => DAMAGE[d].ru)) },
  ];

  const body = (key: Key) => {
    switch (key) {
      case 'class': return (
        <>
          <Section title="D&D 5e" note="Официальные списки заклинаний классов.">
            {spellcasters.map((c) => <Chip on={f.classes.includes(c)} onClick={() => toggleClass(c)}>{cls(c)}</Chip>)}
            {subclassOnly.map((c) => <Chip on={f.classes.includes(c)} onClick={() => toggleClass(c)} title="Заклинания только через подклассы">{cls(c)}</Chip>)}
          </Section>
          {officialSelected.map((code) => {
            const subs = data.subclasses.filter((s) => s.class === code && subclassCounts.get(s.id));
            if (!subs.length) return null;
            return (
              <Section title={`Подкласс: ${cls(code)}`}>
                {subs.map((s) => <Chip on={f.subclasses.includes(s.id)} onClick={() => set({ subclasses: toggle(f.subclasses, s.id) })} title={`${s.en} (${s.source})`}>{s.ru ?? s.en}</Chip>)}
              </Section>
            );
          })}
          {officialSelected.length > 0 && (
            <label class="check">
              <input type="checkbox" checked={f.expanded} onChange={(e) => set({ expanded: (e.target as HTMLInputElement).checked })} />
              Учитывать дополнения к спискам (XGE, TCE, FTD, BMT)
            </label>
          )}
          <Section title="Laserllama" note="Классы Laserllama и списки заклинаний из его компендиума.">
            {llClasses.map((c) => <Chip tone="ll" on={f.classes.includes(LL_PREFIX + c)} onClick={() => toggleClass(LL_PREFIX + c)} title={`${c} — Laserllama`}>{cls(c)}</Chip>)}
          </Section>
        </>
      );
      case 'level': return (
        <Section>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <Chip on={f.levels.includes(l)} onClick={() => set({ levels: toggle(f.levels, l) })}>{l === 0 ? 'Заговор' : `${l}`}</Chip>)}
        </Section>
      );
      case 'school': return (
        <Section>{Object.entries(SCHOOL).map(([k, s]) => <Chip on={f.schools.includes(k)} onClick={() => set({ schools: toggle(f.schools, k) })} title={s.en}>{s.ru}</Chip>)}</Section>
      );
      case 'source': return (
        <>
          <Section title="Книги D&D 5e (2014)">
            {data.sources.filter((s) => !s.homebrew).map((s) => <Chip on={f.sources.includes(s.code)} onClick={() => set({ sources: toggle(f.sources, s.code) })} title={`${s.ru} (${s.en})`}>{SOURCE_SHORT[s.code] ?? s.code}</Chip>)}
          </Section>
          <Section title="Хоумбрю">
            {data.sources.filter((s) => s.homebrew).map((s) => <Chip tone="ll" on={f.sources.includes(s.code)} onClick={() => set({ sources: toggle(f.sources, s.code) })} title={s.ru}>{SOURCE_SHORT[s.code] ?? s.code}</Chip>)}
          </Section>
        </>
      );
      case 'comp': return (
        <Section note="Нажатие: «есть» → «нет» → «неважно».">
          <TriChip value={f.comp.v} onChange={(v) => set({ comp: { ...f.comp, v } })} title="Вербальный (V)">В — вербальный</TriChip>
          <TriChip value={f.comp.s} onChange={(v) => set({ comp: { ...f.comp, s: v } })} title="Соматический (S)">С — соматический</TriChip>
          <TriChip value={f.comp.m} onChange={(v) => set({ comp: { ...f.comp, m: v } })} title="Материальный (M)">М — материальный</TriChip>
        </Section>
      );
      case 'cast': return (
        <Section>{CAST_BUCKETS.map((c) => <Chip tone={c.title ? 'll' : undefined} on={f.cast.includes(c.key)} onClick={() => set({ cast: toggle(f.cast, c.key) })} title={c.title}>{c.ru}</Chip>)}</Section>
      );
      case 'damage': return (
        <Section>{Object.entries(DAMAGE).map(([k, d]) => <Chip on={f.damage.includes(k)} onClick={() => set({ damage: toggle(f.damage, k) })} title={d.en}><i class={`dmg dmg-${k}`} aria-hidden="true" />{d.ru}</Chip>)}</Section>
      );
    }
  };

  const current = items.find((i) => i.key === open);
  return (
    <div class="filterbar" role="toolbar" aria-label="Фильтры">
      {items.map((it) => (
        <button type="button" ref={(el) => { btns.current[it.key] = el; }} class={`fbtn${it.value ? ' active' : ''}${open === it.key ? ' open' : ''}`}
          aria-expanded={open === it.key} aria-haspopup="dialog" onClick={() => setOpen(open === it.key ? null : it.key)}>
          <span class="fbtn-label">{it.label}{it.value ? ':' : ''}</span>
          {it.value && <span class="fbtn-value">{it.value}</span>}
          <svg class="caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
      ))}
      <TriChip value={f.concentration} onChange={(v: Tri) => set({ concentration: v })} title="Концентрация">Концентрация</TriChip>
      <TriChip value={f.ritual} onChange={(v: Tri) => set({ ritual: v })} title="Ритуал">Ритуал</TriChip>
      <Chip tone="ll" on={f.altOnly} onClick={() => set({ altOnly: !f.altOnly })} title="Только заклинания, у которых есть альтернативная версия Laserllama">Есть ALT</Chip>
      {count > 0 && <button type="button" class="link reset" onClick={() => { setOpen(null); onChange({ ...EMPTY_FILTERS, q: f.q }); }}>Сбросить ({count})</button>}
      {current && (
        <Popover anchor={btns.current[current.key] ?? null} title={current.label} resultCount={resultCount} onClose={() => setOpen(null)}>
          {body(current.key)}
        </Popover>
      )}
    </div>
  );
}
