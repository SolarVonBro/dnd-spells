import { useMemo, useState } from 'preact/hooks';
import type { Dataset, Lang, SpellRecord, Version } from '../types';
import { FIELD_LABEL, levelSchool } from '../i18n';
import { nameOf, textOf } from '../model';
import { diffHtml } from '../diff';
import { Icon, Segmented } from './ui';
import { AddToList } from './Lists';

export type View = 'official' | 'll' | 'compare';

interface Props {
  data: Dataset;
  record: SpellRecord;
  view: View;
  lang: Lang;
  onLang: (l: Lang) => void;
  onView: (v: View) => void;
  onBack: () => void;
  onOpenRef: (id: string) => void;
}

const FIELDS = ['time', 'range', 'comps', 'duration'] as const;

function sourceLabel(data: Dataset, v: Version, lang: Lang) {
  const name = data.sources.find((x) => x.code === v.source)?.en ?? v.source;
  return v.page ? `${name}, ${lang === 'ru' ? 'с.' : 'p.'} ${v.page}` : name;
}

function Classes({ data, v, lang }: { data: Dataset; v: Version; lang: Lang }) {
  const cls = (code: string) => {
    const c = data.classes.find((x) => x.code === code);
    return c ? (lang === 'ru' ? c.ru : c.en) : code;
  };
  const subs = v.subclasses.map((id) => {
    const s = data.subclasses.find((x) => x.id === id);
    return `${cls(id.split(':')[0])}: ${s ? (lang === 'ru' ? s.ru ?? s.en : s.en) : id}`;
  });
  if (!v.classes.length && !v.expanded.length && !subs.length && !v.llLists.length) return null;
  return (
    <div class="classes">
      <div>
        <span class="k">{v.homebrew ? (lang === 'ru' ? 'Классы Laserllama' : 'Laserllama classes') : (lang === 'ru' ? 'Классы' : 'Classes')}:</span>{' '}
        {v.classes.map(cls).join(', ')}
        {v.expanded.length > 0 && (
          <span class="expanded" title={lang === 'ru' ? 'Добавлено в списки классов в XGE, TCE, FTD или BMT' : 'Added to class lists in XGE, TCE, FTD or BMT'}>
            {v.classes.length ? ', ' : ''}{v.expanded.map(cls).join(', ')}*
          </span>
        )}
      </div>
      {v.llLists.length > 0 && (
        <div>
          <span class="k">{lang === 'ru' ? 'В списках классов Laserllama' : 'In Laserllama class lists'}:</span>{' '}
          {v.llLists.map((c) => `${cls(c)}${lang === 'ru' ? ' (альт.)' : ' (alt.)'}`).join(', ')}
        </div>
      )}
      {subs.length > 0 && (
        <details>
          <summary>{lang === 'ru' ? 'Подклассы' : 'Subclasses'} ({subs.length})</summary>
          <p>{subs.join('; ')}</p>
        </details>
      )}
    </div>
  );
}

function Body({ data, v, lang, html, onOpenRef }: { data: Dataset; v: Version; lang: Lang; html?: string; onOpenRef: (id: string) => void }) {
  const missing = lang === 'ru' && !v.text.ru;
  return (
    <div class="body">
      <dl class="meta">
        {FIELDS.map((f) => (
          <div><dt>{FIELD_LABEL[f][lang]}</dt><dd>{textOf(v, lang, f)}</dd></div>
        ))}
      </dl>
      {missing && <p class="note">Перевода нет — показан оригинал.</p>}
      <div class="spell-text" onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a[data-ref]');
        if (a) { e.preventDefault(); onOpenRef(a.getAttribute('data-ref')!); }
      }} dangerouslySetInnerHTML={{ __html: html ?? textOf(v, lang, 'text') }} />
      <Classes data={data} v={v} lang={lang} />
      <p class="source">{sourceLabel(data, v, lang)}</p>
    </div>
  );
}

function Compare({ data, record, lang, onOpenRef }: { data: Dataset; record: SpellRecord; lang: Lang; onOpenRef: (id: string) => void }) {
  const [marks, setMarks] = useState(true);
  const a = record.official!, b = record.ll!;
  const [ha, hb] = useMemo(
    () => (marks ? diffHtml(textOf(a, lang, 'text'), textOf(b, lang, 'text')) : [undefined, undefined]),
    [a, b, lang, marks],
  );
  const rows: [string, string, string, boolean][] = [
    [lang === 'ru' ? 'Уровень и школа' : 'Level & school', levelSchool(a.level, a.school, a.ritual, lang), levelSchool(b.level, b.school, b.ritual, lang),
      a.level !== b.level || a.school !== b.school || a.ritual !== b.ritual],
    ...FIELDS.map((f) => [FIELD_LABEL[f][lang], textOf(a, lang, f), textOf(b, lang, f),
      a[f].en.toLowerCase().replace(/\W+/g, '') !== b[f].en.toLowerCase().replace(/\W+/g, '')] as [string, string, string, boolean]),
  ];
  return (
    <div class="compare">
      <div class="compare-bar">
        <label class="check">
          <input type="checkbox" checked={marks} onChange={(e) => setMarks((e.target as HTMLInputElement).checked)} />
          {lang === 'ru' ? 'Подсветить различия в тексте' : 'Highlight text changes'}
        </label>
        {marks && (
          <span class="legend">
            <mark class="d-del">{lang === 'ru' ? 'нет у Laserllama' : 'removed'}</mark>
            <mark class="d-ins">{lang === 'ru' ? 'добавлено Laserllama' : 'added'}</mark>
          </span>
        )}
      </div>
      <table class="cmp-meta">
        <thead><tr><th /><th>{lang === 'ru' ? 'Официальная' : 'Official'} · {a.source}</th><th class="ll">Laserllama</th></tr></thead>
        <tbody>
          {rows.map(([label, x, y, diff]) => (
            <tr class={diff ? 'diff' : ''}><th>{label}</th><td>{x}</td><td>{y}</td></tr>
          ))}
        </tbody>
      </table>
      <div class="cmp-cols">
        <section>
          <h3>{nameOf(a, lang)} <small>{lang === 'ru' ? 'официальная' : 'official'}</small></h3>
          <div class="spell-text" dangerouslySetInnerHTML={{ __html: ha ?? textOf(a, lang, 'text') }}
            onClick={(e) => { const r = (e.target as HTMLElement).closest('a[data-ref]'); if (r) onOpenRef(r.getAttribute('data-ref')!); }} />
          <Classes data={data} v={a} lang={lang} />
        </section>
        <section class="ll">
          <h3>{nameOf(b, lang)} <small>Laserllama</small></h3>
          <div class="spell-text" dangerouslySetInnerHTML={{ __html: hb ?? textOf(b, lang, 'text') }} />
          <Classes data={data} v={b} lang={lang} />
        </section>
      </div>
    </div>
  );
}

export function SpellDetail({ data, record, view, lang, onLang, onView, onBack, onOpenRef }: Props) {
  const hasAlt = record.ll?.relation === 'alt' && record.official;
  const effective: View = !hasAlt ? (record.official ? 'official' : 'll') : view;
  const v = effective === 'll' ? record.ll! : record.official ?? record.ll!;
  const ll = data.sources.find((s) => s.homebrew);
  const other = lang === 'ru' ? v.name.en : v.name.ru;

  return (
    <article class={`detail${effective === 'compare' ? ' wide' : ''}`}>
      <header class="detail-head">
        <button type="button" class="icon-btn back" aria-label="Назад к списку" onClick={onBack}><Icon name="back" /></button>
        <div class="title">
          <h2>{nameOf(v, lang)}</h2>
          {other && <div class="other-name">{other}</div>}
          <div class="subtitle">{levelSchool(v.level, v.school, v.ritual, lang)}</div>
        </div>
        <Segmented small label="Язык заклинания" value={lang} onChange={onLang}
          options={[{ value: 'en', label: 'EN', title: 'English (оригинал)' }, { value: 'ru', label: 'RU', title: 'Русский' }]} />
      </header>
      <div class="detail-tags">
        {v.concentration && <span class="tag conc">{lang === 'ru' ? 'Концентрация' : 'Concentration'}</span>}
        {v.ritual && <span class="tag rit">{lang === 'ru' ? 'Ритуал' : 'Ritual'}</span>}
        {v.homebrew && <span class="tag src ll">Laserllama{v.relation ? '' : lang === 'ru' ? ' · новое' : ' · new'}</span>}
        {hasAlt && effective !== 'll' && <span class="tag alt">{lang === 'ru' ? 'Есть ALT-версия Laserllama' : 'Laserllama ALT version'}</span>}
        <AddToList data={data} version={v} />
      </div>

      {hasAlt && (
        <div class="versions">
          <Segmented value={effective} onChange={onView} label="Версия"
            options={[
              { value: 'official', label: lang === 'ru' ? 'Официальная' : 'Official' },
              { value: 'll', label: 'Laserllama' },
              { value: 'compare', label: lang === 'ru' ? 'Сравнить' : 'Compare' },
            ]} />
        </div>
      )}

      {effective === 'compare'
        ? <Compare data={data} record={record} lang={lang} onOpenRef={onOpenRef} />
        : <Body data={data} v={v} lang={lang} onOpenRef={onOpenRef} />}

      {v.homebrew && ll && (
        <p class="credit">
          {lang === 'ru' ? 'Хоумбрю: ' : 'Homebrew: '}
          <a href={ll.url ?? '#'} target="_blank" rel="noopener noreferrer">{ll.en}</a>
          {ll.author && <> · <a href={ll.author} target="_blank" rel="noopener noreferrer">laserllama</a></>}
          {lang === 'ru' && <> · перевод на русский — неофициальный</>}
        </p>
      )}
    </article>
  );
}
