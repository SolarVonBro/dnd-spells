import type { JSX } from 'preact';
import type { Lang } from '../types';
import type { Match } from '../model';
import { nameOf, textOf } from '../model';
import { SCHOOL, levelLabel } from '../i18n';

interface Props {
  matches: Match[];
  lang: Lang;
  selected: string | null;
  onSelect: (id: string, version: 'official' | 'll') => void;
}

export function SpellList({ matches, lang, selected, onSelect }: Props) {
  if (!matches.length) {
    return <div class="empty">Ничего не найдено. Попробуйте ослабить фильтры.</div>;
  }
  const rows: JSX.Element[] = [];
  let level = -1;
  for (const { record, version: v } of matches) {
    if (v.level !== level) {
      level = v.level;
      rows.push(<li class="lvl-head" key={`h${level}`}>{levelLabel(level)}</li>);
    }
    const other = lang === 'ru' ? v.name.en : v.name.ru;
    const alt = record.ll?.relation === 'alt';
    rows.push(
      <li key={record.id}>
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
      </li>,
    );
  }
  return <ul class="list">{rows}</ul>;
}
