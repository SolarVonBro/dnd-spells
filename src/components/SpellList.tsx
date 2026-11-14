import type { JSX } from 'preact';
import type { Lang } from '../types';
import type { Match } from '../model';
import { nameOf, textOf } from '../model';
import { SCHOOL, levelLabel } from '../i18n';
import { Icon } from './ui';

/** Picking spells for a character list: each row gets an add/remove toggle. */
export interface Picker {
  has: (m: Match) => boolean;
  toggle: (m: Match) => void;
}

interface Props {
  matches: Match[];
  lang: Lang;
  selected: string | null;
  onSelect: (id: string, version: 'official' | 'll') => void;
  pick?: Picker | null;
}

export function SpellList({ matches, lang, selected, onSelect, pick }: Props) {
  if (!matches.length) {
    return <div class="empty">Ничего не найдено. Попробуйте ослабить фильтры.</div>;
  }
  const rows: JSX.Element[] = [];
  let level = -1;
  for (const m of matches) {
    const { record, version: v } = m;
    if (v.level !== level) {
      level = v.level;
      rows.push(<li class="lvl-head" key={`h${level}`}>{levelLabel(level)}</li>);
    }
    const other = lang === 'ru' ? v.name.en : v.name.ru;
    const alt = record.ll?.relation === 'alt';
    const picked = pick?.has(m) ?? false;
    rows.push(
      <li key={record.id} class={pick ? `pickable${picked ? ' picked' : ''}` : undefined}>
        <button type="button" class={`row${selected === record.id ? ' sel' : ''}`} onClick={() => onSelect(record.id, v.homebrew ? 'll' : 'official')}>
          <span class={`lvl lvl-${v.level}`} title={v.level ? `${v.level} уровень` : 'Заговор'} aria-label={v.level ? `${v.level} уровень` : 'заговор'}>{v.level}</span>
          <span class="row-main">
            <span class="row-name">
              {nameOf(v, lang)}
              {other && other !== nameOf(v, lang) && <span class="row-other">{other}</span>}
            </span>
            <span class="row-meta">
              {SCHOOL[v.school][lang]} · {textOf(v, lang, 'time')}
            </span>
          </span>
          <span class="row-tags">
            {v.concentration && <span class="tag conc" title="Концентрация">К</span>}
            {v.ritual && <span class="tag rit" title="Ритуал">Р</span>}
            {alt && <span class="tag alt" title="Есть альтернативная версия Laserllama">ALT</span>}
            <span class={`tag src${v.homebrew ? ' ll' : ''}`} title={v.homebrew ? 'Laserllama' : v.source}>{v.homebrew ? 'LL' : v.source}</span>
          </span>
        </button>
        {pick && (
          <button type="button" class="pick-btn" aria-pressed={picked} title={picked ? 'Убрать из списка' : 'Добавить в список'}
            aria-label={`${picked ? 'Убрать из списка' : 'Добавить в список'}: ${nameOf(v, lang)}`} onClick={() => pick.toggle(m)}>
            <Icon name={picked ? 'check' : 'plus'} size={20} />
          </button>
        )}
      </li>,
    );
  }
  return <ul class="list">{rows}</ul>;
}
