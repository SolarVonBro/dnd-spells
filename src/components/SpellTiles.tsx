import type { Lang } from '../types';
import type { Match } from '../model';
import { nameOf, textOf } from '../model';
import { SCHOOL, levelLabel } from '../i18n';
import type { Picker } from './SpellList';
import { Icon } from './ui';

interface Props {
  matches: Match[];
  lang: Lang;
  selected: string | null;
  onSelect: (id: string, version: 'official' | 'll') => void;
  pick?: Picker | null;
}

/** Desktop view: spells as tiles, grouped by level and separated by headed lines. */
export function SpellTiles({ matches, lang, selected, onSelect, pick }: Props) {
  if (!matches.length) {
    return <div class="empty">Ничего не найдено. Попробуйте ослабить фильтры.</div>;
  }
  const groups: { level: number; items: Match[] }[] = [];
  for (const m of matches) {
    const last = groups[groups.length - 1];
    if (last?.level === m.version.level) last.items.push(m);
    else groups.push({ level: m.version.level, items: [m] });
  }
  return (
    <div class="tiles">
      {groups.map((g) => (
        <section class="tgroup" key={g.level} aria-label={levelLabel(g.level)}>
          <h3 class="tgroup-head"><span>{levelLabel(g.level)}</span><span class="tgroup-count">{g.items.length}</span></h3>
          <ul class="tgrid">
            {g.items.map((m) => {
              const { record, version: v } = m;
              const other = lang === 'ru' ? v.name.en : v.name.ru;
              const picked = pick?.has(m) ?? false;
              return (
                <li key={record.id} class={`${pick ? 'pickable' : ''}${picked ? ' picked' : ''}`}>
                  <button type="button" class={`tile${selected === record.id ? ' sel' : ''}${v.homebrew ? ' hb' : ''}`}
                    onClick={() => onSelect(record.id, v.homebrew ? 'll' : 'official')}>
                    <span class="tile-name">{nameOf(v, lang)}</span>
                    {other && other !== nameOf(v, lang) && <span class="tile-other">{other}</span>}
                    <span class="tile-meta">{SCHOOL[v.school][lang]} · {textOf(v, lang, 'time')}</span>
                    <span class="tile-tags">
                      {v.concentration && <span class="tag conc" title="Концентрация">К</span>}
                      {v.ritual && <span class="tag rit" title="Ритуал">Р</span>}
                      {record.ll?.relation === 'alt' && <span class="tag alt" title="Есть альтернативная версия Laserllama">ALT</span>}
                      <span class={`tag src${v.homebrew ? ' ll' : ''}`} title={v.homebrew ? 'Laserllama' : v.source}>{v.homebrew ? 'LL' : v.source}</span>
                    </span>
                  </button>
                  {pick && (
                    <button type="button" class="tile-pick" aria-pressed={picked} title={picked ? 'Убрать из списка' : 'Добавить в список'}
                      aria-label={`${picked ? 'Убрать из списка' : 'Добавить в список'}: ${nameOf(v, lang)}`} onClick={() => pick.toggle(m)}>
                      <Icon name={picked ? 'check' : 'plus'} size={18} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
