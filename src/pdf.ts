// PDF export of a character spell list (loaded only when the user exports: pdfmake is large).
import type { Dataset, Lang, SpellRecord, Version } from './types';
import type { SpellBook } from './lists';
import { ABILITY_EN, ABILITY_RU, alwaysPrepared, casterFor, classLimits, slotSummary } from './casting';
import { FIELD_LABEL, SCHOOL, levelSchool } from './i18n';
import { nameOf, textOf } from './model';
import { classLabel, entryVersion, subclassLabel } from './listview';
import { htmlToPdf, loadEngine, saveBlob, type PNode } from './pdfcore';

export interface PdfOptions { lang: Lang; full: boolean }

/* ---------------- document ---------------- */

const ACCENT = '#8f2a2a';
const LL_COLOR = '#5845b5';

const T = {
  ru: {
    level: 'Уровень персонажа', slots: 'Ячейки заклинаний', spellLevel: 'Уровень', none: 'Ячеек заклинаний пока нет.',
    multiclass: (n: number) => `Мультикласс: уровень заклинателя ${n}.`,
    pact: (n: number, l: number) => `Магия договора: ${n} ${n === 1 ? 'ячейка' : n < 5 ? 'ячейки' : 'ячеек'} ${l} уровня (восстанавливаются после короткого отдыха).`,
    arcanum: (a: number[]) => `Таинственный арканум: ${a.join(', ')} уровень.`,
    upTo: (n: number) => (n <= 0 ? 'только заговоры' : `заклинания до ${n} уровня`),
    cantrips: 'заговоры', known: 'известные', spellbook: 'в книге', min: 'мин.', prepared: 'подготовка',
    preparedRule: (half: boolean, ab: string) => `${half ? 'пол-уровня' : 'уровень'} + мод. ${ab}`,
    cantripHead: 'Заговоры', levelHead: (n: number) => `${n} уровень`, other: 'Прочее',
    cols: ['Заклинание', 'Школа', 'Время', 'Дистанция', 'Длительность', 'Комп.', 'Источник'],
    conc: 'К', rit: 'Р', comps: { v: 'В', s: 'С', m: 'М' }, page: 'с.', always: 'подкласс',
    noSpells: 'В списке пока нет заклинаний.',
    credit: 'Хоумбрю: Laserllama, «Compendium of Spells» v.0.5 (gmbinder.com/profile/laserllama). Перевод хоумбрю на русский — неофициальный.',
    officialCredit: 'Тексты официальных заклинаний: книги D&D 5e (2014), русский текст — ttg.club.',
  },
  en: {
    level: 'Character level', slots: 'Spell slots', spellLevel: 'Level', none: 'No spell slots yet.',
    multiclass: (n: number) => `Multiclass: spellcaster level ${n}.`,
    pact: (n: number, l: number) => `Pact Magic: ${n} slot${n === 1 ? '' : 's'} of level ${l} (regained on a short rest).`,
    arcanum: (a: number[]) => `Mystic Arcanum: level ${a.join(', ')}.`,
    upTo: (n: number) => (n <= 0 ? 'cantrips only' : `spells up to level ${n}`),
    cantrips: 'cantrips', known: 'known', spellbook: 'spellbook', min: 'min.', prepared: 'prepared',
    preparedRule: (half: boolean, ab: string) => `${half ? 'half level' : 'level'} + ${ab} mod.`,
    cantripHead: 'Cantrips', levelHead: (n: number) => `Level ${n}`, other: 'Other',
    cols: ['Spell', 'School', 'Casting time', 'Range', 'Duration', 'Comp.', 'Source'],
    conc: 'C', rit: 'R', comps: { v: 'V', s: 'S', m: 'M' }, page: 'p.', always: 'subclass',
    noSpells: 'No spells in the list yet.',
    credit: 'Homebrew: Laserllama, "Compendium of Spells" v.0.5 (gmbinder.com/profile/laserllama).',
    officialCredit: 'Official spell texts: D&D 5e (2014) books.',
  },
};

function header(data: Dataset, book: SpellBook, lang: Lang): PNode[] {
  const t = T[lang];
  const out: PNode[] = [{ text: book.name, fontSize: 18, bold: true, color: ACCENT }];
  const total = book.classes.reduce((n, c) => n + c.level, 0);
  if (book.classes.length) {
    const cls = book.classes.map((c) => {
      const sub = c.sub ? ` (${subclassLabel(data, c.sub, lang)})` : '';
      return `${classLabel(data, c.cls, lang)} ${c.level}${sub}`;
    }).join(' / ');
    out.push({ text: `${cls}${book.classes.length > 1 ? ` · ${t.level} ${total}` : ''}`, color: '#444444', margin: [0, 2, 0, 6] });
  }

  const sum = slotSummary(data, book);
  const maxSlot = sum.slots.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0);
  if (maxSlot) {
    const levels = Array.from({ length: maxSlot }, (_, i) => i + 1);
    out.push({
      table: {
        body: [
          [{ text: t.spellLevel, bold: true }, ...levels.map((l) => ({ text: String(l), bold: true, alignment: 'center' }))],
          [{ text: t.slots, bold: true }, ...levels.map((l) => ({ text: String(sum.slots[l - 1] || '—'), alignment: 'center' }))],
        ],
        widths: ['auto', ...levels.map(() => 22)],
      },
      layout: 'lightHorizontalLines', fontSize: 9, margin: [0, 2, 0, 4],
    });
  }
  const notes: string[] = [];
  if (sum.casterLevel) notes.push(t.multiclass(sum.casterLevel));
  if (sum.pact) {
    notes.push(t.pact(sum.pact.slots, sum.pact.level));
    if (sum.pact.arcanum.length) notes.push(t.arcanum(sum.pact.arcanum));
  }
  if (!maxSlot && !sum.pact && book.classes.length) notes.push(t.none);
  if (notes.length) out.push({ text: notes.join(' '), fontSize: 8.5, color: '#444444', margin: [0, 0, 0, 4] });

  for (const c of book.classes) {
    const { info } = casterFor(data, c);
    if (!info) continue;
    const lim = classLimits(info, c);
    const ab = (lang === 'ru' ? ABILITY_RU : ABILITY_EN)[lim.ability];
    const mine = book.spells.map((e) => ({ e, v: entryVersion(data, e) })).filter((x) => x.e.by === c.cls && x.v);
    const cantrips = mine.filter((x) => x.v!.level === 0).length;
    const leveled = mine.filter((x) => x.v!.level > 0 && !alwaysPrepared(info, x.v!, c)).length;
    const parts = [ab, t.upTo(lim.maxLevel)];
    if (lim.cantrips) parts.push(`${t.cantrips} ${cantrips}/${lim.cantrips}`);
    if (lim.known != null) parts.push(`${t.known} ${leveled}/${lim.known}`);
    if (lim.spellbook != null) parts.push(`${t.spellbook} ${leveled} (${t.min} ${lim.spellbook})`);
    if (lim.preparedRule) {
      const rule = t.preparedRule(lim.preparedRule === 'half', ab);
      parts.push(lim.prepared != null ? `${t.prepared} ${lim.spellbook != null ? '' : `${leveled}/`}${lim.prepared} (${rule})` : `${t.prepared}: ${rule}`);
    }
    out.push({ text: [{ text: `${classLabel(data, c.cls, lang)} ${c.level}: `, bold: true }, parts.join(' · ')], fontSize: 8.5, margin: [0, 0, 0, 1] });
  }
  return out;
}

interface Row { v: Version; record: SpellRecord | null; by: string; always: boolean }

function rows(data: Dataset, book: SpellBook, records: Map<string, SpellRecord>, lang: Lang): Row[] {
  const out: Row[] = [];
  for (const e of book.spells) {
    const v = entryVersion(data, e, records);
    if (!v) continue;
    const c = book.classes.find((x) => x.cls === e.by);
    out.push({ v, record: records.get(e.id) ?? null, by: e.by, always: Boolean(c && alwaysPrepared(casterFor(data, c).info, v, c)) });
  }
  return out.sort((a, b) => a.v.level - b.v.level || nameOf(a.v, lang).localeCompare(nameOf(b.v, lang), lang));
}

function source(data: Dataset, v: Version, lang: Lang) {
  const s = data.sources.find((x) => x.code === v.source);
  return `${v.homebrew ? 'Laserllama' : s?.en ?? v.source}${v.page ? `, ${T[lang].page} ${v.page}` : ''}`;
}

function compact(data: Dataset, book: SpellBook, list: Row[], lang: Lang): PNode[] {
  const t = T[lang];
  const multi = book.classes.length > 1;
  const out: PNode[] = [];
  for (let level = 0; level <= 9; level++) {
    const items = list.filter((r) => r.v.level === level);
    if (!items.length) continue;
    out.push({ text: level === 0 ? t.cantripHead : t.levelHead(level), fontSize: 12, bold: true, color: ACCENT, margin: [0, 10, 0, 3], headlineLevel: 1 });
    const head = t.cols.map((c) => ({ text: c, bold: true, color: '#555555' }));
    const body = items.map(({ v, by, always }) => {
      const other = lang === 'ru' ? v.name.en : v.name.ru;
      const flags = [v.concentration && t.conc, v.ritual && t.rit].filter(Boolean).join(' ');
      const name: PNode[] = [{ text: nameOf(v, lang), bold: true, color: v.homebrew ? LL_COLOR : undefined }];
      if (flags) name.push({ text: `  ${flags}`, color: '#9a5b00', fontSize: 7 });
      const comps = [v.components.v && t.comps.v, v.components.s && t.comps.s, v.components.m && t.comps.m].filter(Boolean).join(', ');
      const src = v.homebrew ? 'LL' : v.source;
      const extra = [multi && by ? classLabel(data, by, lang) : '', always ? t.always : ''].filter(Boolean).join(', ');
      return [
        { stack: [{ text: name }, ...(other && other !== nameOf(v, lang) ? [{ text: other, fontSize: 7, color: '#777777' }] : [])] },
        SCHOOL[v.school]?.[lang] ?? v.school,
        textOf(v, lang, 'time'),
        textOf(v, lang, 'range'),
        textOf(v, lang, 'duration'),
        comps,
        { stack: [src, ...(extra ? [{ text: extra, fontSize: 7, color: '#777777' }] : [])] },
      ];
    });
    out.push({
      table: { headerRows: 1, widths: ['*', 58, 62, 56, 72, 30, 40], body: [head, ...body], dontBreakRows: true },
      layout: {
        hLineWidth: (i: number) => (i === 1 ? 0.8 : 0.4), vLineWidth: () => 0,
        hLineColor: () => '#cccccc', paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2,
      },
      fontSize: 8,
    });
  }
  return out;
}

function full(data: Dataset, book: SpellBook, list: Row[], lang: Lang): PNode[] {
  const t = T[lang];
  const multi = book.classes.length > 1;
  const out: PNode[] = [];
  let level = -1;
  for (const { v, by, always } of list) {
    if (v.level !== level) {
      level = v.level;
      out.push({ text: level === 0 ? t.cantripHead : t.levelHead(level), fontSize: 13, bold: true, color: ACCENT, margin: [0, 10, 0, 2], headlineLevel: 1 });
    }
    const other = lang === 'ru' ? v.name.en : v.name.ru;
    const meta = (['time', 'range', 'comps', 'duration'] as const).map((f) => [{ text: `${FIELD_LABEL[f][lang]}:`, bold: true, color: '#555555', noWrap: true }, textOf(v, lang, f)]);
    const tail = [source(data, v, lang), multi && by ? classLabel(data, by, lang) : '', always ? t.always : ''].filter(Boolean).join(' · ');
    out.push({
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#dddddd' }], margin: [0, 2, 0, 4] },
        { text: [{ text: nameOf(v, lang), fontSize: 12, bold: true, color: v.homebrew ? LL_COLOR : undefined },
          ...(other && other !== nameOf(v, lang) ? [{ text: `   ${other}`, fontSize: 8.5, color: '#777777' }] : [])] },
        { text: `${levelSchool(v.level, v.school, v.ritual, lang)}${v.concentration ? (lang === 'ru' ? ', концентрация' : ', concentration') : ''}`, italics: true, color: '#555555', fontSize: 8.5 },
        { table: { widths: ['auto', '*', 'auto', '*'], body: [[...meta[0], ...meta[1]], [...meta[2], ...meta[3]]] }, layout: 'noBorders', fontSize: 8.5, margin: [0, 3, 0, 3] },
      ],
      unbreakable: true,
    });
    out.push(...htmlToPdf(textOf(v, lang, 'text')));
    out.push({ text: tail, fontSize: 7.5, color: '#777777', margin: [0, 0, 0, 6] });
  }
  return out;
}

export async function buildPdf(data: Dataset, book: SpellBook, records: Map<string, SpellRecord>, opts: PdfOptions): Promise<Blob> {
  const pdfMake = await loadEngine();
  const t = T[opts.lang];
  const list = rows(data, book, records, opts.lang);
  const content: PNode[] = [...header(data, book, opts.lang)];
  if (!list.length) content.push({ text: t.noSpells, italics: true, margin: [0, 12, 0, 0] });
  else content.push(...(opts.full ? full(data, book, list, opts.lang) : compact(data, book, list, opts.lang)));
  const credits = [list.some((r) => !r.v.homebrew) ? t.officialCredit : '', list.some((r) => r.v.homebrew) ? t.credit : ''].filter(Boolean);
  if (credits.length) content.push({ text: credits.join(' '), fontSize: 7, color: '#888888', margin: [0, 14, 0, 0] });

  const doc = {
    info: { title: book.name, creator: 'Spellbook (D&D 5e 2014 + Laserllama)' },
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 40],
    defaultStyle: { font: 'Roboto', fontSize: opts.full ? 9.5 : 9, lineHeight: 1.15 },
    content,
    footer: (page: number, pages: number) => ({
      columns: [{ text: book.name, fontSize: 7, color: '#999999' }, { text: `${page} / ${pages}`, alignment: 'right', fontSize: 7, color: '#999999' }],
      margin: [36, 14, 36, 0],
    }),
    pageBreakBefore: (node: any, q: any) => node.headlineLevel === 1 && q.getFollowingNodesOnPage().length === 0,
  };
  return pdfMake.createPdf(doc).getBlob();
}


export async function downloadPdf(data: Dataset, book: SpellBook, records: Map<string, SpellRecord>, opts: PdfOptions) {
  const blob = await buildPdf(data, book, records, opts);
  saveBlob(blob, `${book.name || 'spells'}${opts.full ? '' : ` (${opts.lang === 'ru' ? 'кратко' : 'short'})`}`);
  return blob.size;
}
