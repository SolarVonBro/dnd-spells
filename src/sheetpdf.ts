// Printable D&D 5e character sheet (A4) for games at the table: computed values are printed, everything that changes in
// play (hit points, spent slots, uses, coins, new spells and items) gets empty boxes and ruled lines for a pencil.
import type { Dataset } from './types';
import { optionsOf, type Character } from './characters';
import { ABILITY, buildSheet, signed, spellLevelLabel, type Sheet, type SheetSpell } from './sheet';
import { levelSchool } from './i18n';
import { htmlToPdf, loadEngine, saveBlob, type PNode } from './pdfcore';

const ACCENT = '#8f2a2a';
const LL_COLOR = '#5845b5';
const INK = '#222222';
const BORDER = '#7a7a7a';
const RULE = '#b9b9b9';
const LABEL = '#5f5f5f';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = { l: 30, t: 30, r: 30, b: 38 };
const W = PAGE_W - MARGIN.l - MARGIN.r;
const H = PAGE_H - MARGIN.t - MARGIN.b;

interface Ctx { s: number; fs: number; row: number; sheet: Sheet; ch: Character }

/* ---------------- small building blocks ---------------- */

const label = (c: Ctx, t: string, extra: PNode = {}) => ({ text: t.toUpperCase(), fontSize: 6.3 * c.s, bold: true, color: LABEL, characterSpacing: 0.2, ...extra });

/** Row of n boxes (squares) or circles; the first `filled` are filled. */
function marks(n: number, opts: { filled?: number; circle?: boolean; size?: number; gap?: number; perRow?: number } = {}): PNode {
  const size = opts.size ?? 8, gap = opts.gap ?? 3.5, perRow = opts.perRow ?? 12;
  const canvas: PNode[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i % perRow) * (size + gap), y = Math.floor(i / perRow) * (size + gap) + 0.5;
    const fill = i < (opts.filled ?? 0) ? { color: INK } : {};
    canvas.push(opts.circle
      ? { type: 'ellipse', x: x + size / 2, y: y + size / 2, r1: size / 2, r2: size / 2, lineWidth: 0.8, lineColor: INK, ...fill }
      : { type: 'rect', x, y, w: size, h: size, lineWidth: 0.8, lineColor: INK, ...fill });
  }
  return { canvas, width: Math.min(n, perRow) * (size + gap) };
}

/** Proficiency marker: empty, half (dot), proficient (filled), expertise (filled + ring). */
function profDot(p: number, size = 7): PNode {
  const r = size / 2, c = r + 1;
  const canvas: PNode[] = [{ type: 'ellipse', x: c, y: c, r1: r, r2: r, lineWidth: 0.8, lineColor: INK, ...(p >= 1 ? { color: INK } : {}) }];
  if (p > 0 && p < 1) canvas.push({ type: 'ellipse', x: c, y: c, r1: 1.4, r2: 1.4, color: INK });
  if (p >= 2) canvas.push({ type: 'ellipse', x: c, y: c, r1: r + 1.6, r2: r + 1.6, lineWidth: 0.6, lineColor: INK });
  return { canvas, width: size + 2, margin: [0, 1, 0, 0] };
}

/** Ruled lines for handwriting. */
const lines = (n: number, width: number, gap: number): PNode => ({
  canvas: Array.from({ length: n }, (_, i) => ({ type: 'line', x1: 0, y1: gap * (i + 1), x2: width, y2: gap * (i + 1), lineWidth: 0.5, lineColor: RULE })),
});

const BOX = {
  hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => BORDER, vLineColor: () => BORDER,
  paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 4,
};
/** Grid with light inner lines and a darker frame. */
const GRID = {
  hLineWidth: (i: number, node: PNode) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: (i: number, node: PNode) => (i === 0 || i === node.table.widths.length ? 0.8 : 0.4),
  hLineColor: (i: number, node: PNode) => (i === 0 || i === node.table.body.length ? BORDER : RULE),
  vLineColor: (i: number, node: PNode) => (i === 0 || i === node.table.widths.length ? BORDER : RULE),
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 1,
};
/** Rows separated by light lines, no vertical lines: tables for handwriting. */
const RULED = {
  hLineWidth: (i: number, node: PNode) => (i === 0 || i === node.table.headerRows || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0, hLineColor: (i: number, node: PNode) => (i === 0 || i === node.table.headerRows || i === node.table.body.length ? BORDER : RULE),
  paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 3, paddingBottom: () => 1,
};

/** A framed block with a small caption. */
const box = (c: Ctx, title: string, body: PNode[], minHeight?: number): PNode => ({
  table: { widths: ['*'], heights: minHeight ? [minHeight] : undefined, body: [[{ stack: [label(c, title, { margin: [0, 0, 0, 2] }), ...body] }]] },
  layout: BOX,
});

const pageTitle = (c: Ctx, text: string, sub = ''): PNode => ({
  stack: [
    { text: [{ text, fontSize: 15 * c.s, bold: true, color: ACCENT }, sub ? { text: `   ${sub}`, fontSize: 9 * c.s, color: LABEL } : ''] },
    { canvas: [{ type: 'line', x1: 0, y1: 3, x2: W, y2: 3, lineWidth: 1, lineColor: ACCENT }], margin: [0, 0, 0, 8] },
  ],
  pageBreak: 'before',
});

/** Labeled fields: value on a line, caption under it (character name block, appearance). */
function fields(c: Ctx, rows: [string, string][][], widths: (number | string)[], tall = false): PNode {
  const body: PNode[][] = [];
  for (const row of rows) {
    body.push(row.map(([v]) => ({ text: v || ' ', fontSize: 9.5 * c.s, bold: true, border: [false, false, false, true], margin: [0, tall ? 10 : 2, 0, 0] })));
    body.push(row.map(([, l]) => ({ ...label(c, l), border: [false, false, false, false], margin: [0, 1, 0, 3] })));
  }
  return { table: { widths, body }, layout: { hLineWidth: () => 0.6, hLineColor: () => BORDER, vLineWidth: () => 0, paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 0, paddingBottom: () => 0 } };
}

/* ---------------- page 1: the main sheet ---------------- */

function mainPage(full: Ctx): PNode[] {
  // The main page is a dense one-page dashboard: the large font grows it less than the other pages.
  const c: Ctx = { ...full, s: Math.min(full.s, 1.06) };
  const { sheet: sh, s } = c;
  const LEFT = s > 1 ? 192 : 172, GAP = 10, RIGHT = W - LEFT - GAP;
  const xp = sh.xpNext ? `${sh.xp} / ${sh.xpNext}` : String(sh.xp);
  const header: PNode = {
    columns: [
      { width: LEFT, stack: [
        { table: { widths: ['*'], body: [[{ text: sh.name, fontSize: 18 * s, bold: true, color: ACCENT, border: [false, false, false, true] }], [{ ...label(c, 'Имя персонажа'), border: [false, false, false, false] }]] },
          layout: { hLineWidth: () => 0.6, hLineColor: () => BORDER, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 1 } },
        { text: `Уровень ${sh.level} · бонус мастерства ${signed(sh.prof)}`, fontSize: 8 * s, color: LABEL, margin: [0, 3, 0, 0] },
      ] },
      { width: '*', ...fields(c, [
        [[sh.classLine, 'Класс и уровень'], [sh.background, 'Предыстория'], [sh.player, 'Игрок']],
        [[sh.race, 'Раса'], [sh.alignment, 'Мировоззрение'], [xp, 'Опыт']],
      ], ['*', '*', 82]) },
    ],
    columnGap: GAP,
    margin: [0, 0, 0, 8],
  };

  /* left column: abilities, saves, skills, passive values, proficiencies */
  const abil: PNode = {
    table: {
      widths: ['*', 26, 30, 40],
      headerRows: 1,
      body: [
        [label(c, 'Характеристика'), label(c, 'Знач.', { alignment: 'center' }), label(c, 'Мод.', { alignment: 'center' }), label(c, 'Спасбр.')],
        ...sh.abilities.map((a) => [
          { text: a.name, bold: true, margin: [0, 4, 0, 0] },
          { text: String(a.score), alignment: 'center', margin: [0, 4, 0, 0] },
          { text: signed(a.mod), fontSize: 13 * s, bold: true, alignment: 'center' },
          { columns: [profDot(a.saveProf ? 1 : 0), { text: signed(a.save), bold: a.saveProf, margin: [3, 0, 0, 0] }], margin: [0, 4, 0, 0] },
        ]),
      ],
    },
    layout: GRID,
  };
  const small: PNode = {
    table: { widths: ['*', '*'], body: [[
      { stack: [label(c, 'Бонус мастерства'), { text: signed(sh.prof), fontSize: 12 * s, bold: true }] },
      { stack: [label(c, 'Вдохновение'), { ...marks(1, { size: 11 }), margin: [0, 2, 0, 0] }] },
    ]] },
    layout: GRID, margin: [0, 6, 0, 0],
  };
  const skills: PNode = {
    table: {
      widths: [10, 20, '*'],
      headerRows: 1,
      body: [
        [{ ...label(c, 'Навыки'), colSpan: 3 }, {}, {}],
        ...sh.skills.map((k) => [profDot(k.prof), { text: signed(k.total), bold: k.prof > 0, alignment: 'right' },
          { text: [k.name, { text: ` (${ABILITY[k.ability].short})`, color: LABEL, fontSize: 7 * s }] }]),
      ],
    },
    layout: { ...GRID, vLineWidth: (i: number, node: PNode) => (i === 0 || i === node.table.widths.length ? 0.8 : 0),
      ...(s > 1 ? { paddingTop: () => 1, paddingBottom: () => 0 } : {}) },
    fontSize: 8.5 * s, margin: [0, 6, 0, 0],
  };
  const passive: PNode = {
    table: { widths: [24, '*'], body: [
      [{ text: String(sh.passive.perception), bold: true, alignment: 'center', fontSize: 11 * s }, { text: 'Пассивная Мудрость (Восприятие)', fontSize: 7.5 * s, margin: [0, 2, 0, 0] }],
      [{ text: String(sh.passive.insight), bold: true, alignment: 'center', fontSize: 11 * s }, { text: 'Пассивная Мудрость (Проницательность)', fontSize: 7.5 * s, margin: [0, 2, 0, 0] }],
      [{ text: String(sh.passive.investigation), bold: true, alignment: 'center', fontSize: 11 * s }, { text: 'Пассивный Интеллект (Анализ)', fontSize: 7.5 * s, margin: [0, 2, 0, 0] }],
    ] },
    layout: GRID, margin: [0, 6, 0, 0],
  };
  const profLines: PNode[] = [];
  const line = (k: string, v: string[]) => { if (v.length) profLines.push({ text: [{ text: `${k}: `, bold: true }, v.join(', ')], margin: [0, 0, 0, 2] }); };
  line('Доспехи', sh.armorProf);
  line('Оружие', sh.weaponProf);
  line('Инструменты', sh.tools.map((t) => `${t.name} ${signed(t.total)}`));
  line('Языки', sh.languages);
  line('Чувства', sh.senses);
  for (const d of sh.defenses) line(d.label, d.values);
  line('Размер', [sh.size]);
  // Ruled lines for new proficiencies only where the page has room (normal font).
  const profBox = box(c, 'Владения, языки, особенности', [{ stack: profLines, fontSize: 8 * s }, ...(s > 1 ? [] : [lines(3, LEFT - 14, 13)])]);

  /* right column */
  const stat = (value: string, title: string, note = '') => ({
    stack: [label(c, title, { alignment: 'center' }), { text: value, fontSize: 17 * s, bold: true, alignment: 'center' },
      ...(note ? [{ text: note, fontSize: 6.8 * s, color: LABEL, alignment: 'center' }] : [])],
  });
  const stats: PNode = {
    table: { widths: ['*', '*', '*', '*'], body: [[
      stat(String(sh.ac), 'Класс доспеха', sh.acNote), stat(signed(sh.init), 'Инициатива'),
      stat(sh.speed.split(',')[0], 'Скорость', sh.speed.includes(',') ? sh.speed.split(',').slice(1).join(',').trim() : ''),
      stat(String(sh.hp.max), 'Максимум хитов'),
    ]] },
    layout: GRID,
  };
  const opts = optionsOf(c.ch);
  const hp: PNode = {
    table: { widths: ['*', 92, 112], heights: [44 * s], body: [[
      { stack: [label(c, 'Текущие хиты'), opts.currentHp ? { text: String(sh.hp.value), fontSize: 16 * s, bold: true, margin: [0, 4, 0, 0] } : ''] },
      { stack: [label(c, 'Временные хиты'), opts.currentHp && sh.hp.temp ? { text: String(sh.hp.temp), fontSize: 14 * s, bold: true } : ''] },
      { stack: [label(c, 'Кости хитов'), { text: sh.hitDice.map((d) => `${d.count}${d.die}`).join(' + ') || '—', bold: true, fontSize: 10 * s },
        { text: 'потрачено:', fontSize: 6.8 * s, color: LABEL, margin: [0, 1, 0, 1] },
        marks(sh.hitDice.reduce((n, d) => n + d.count, 0), { size: 7, gap: 3, perRow: 10, filled: opts.currentHp ? sh.hitDice.reduce((n, d) => n + d.used, 0) : 0 })] },
    ]] },
    layout: GRID, margin: [0, 6, 0, 0],
  };
  const death: PNode = {
    table: { widths: ['*', '*'], body: [[
      { stack: [label(c, 'Спасброски от смерти'), { columns: [
        { width: 'auto', text: 'успехи', fontSize: 7.5 * s, margin: [0, 0, 4, 0] }, { ...marks(3, { circle: true, size: 8 }), margin: [0, 1, 14, 0] },
        { width: 'auto', text: 'провалы', fontSize: 7.5 * s, margin: [0, 0, 4, 0] }, { ...marks(3, { circle: true, size: 8 }), margin: [0, 1, 0, 0] },
        { width: '*', text: '' },
      ], margin: [0, 2, 0, 0] }] },
      { stack: [label(c, 'Истощение (уровни 1–6)'), { columns: [{ ...marks(6, { size: 8 }), margin: [0, 1, 0, 0] }, { text: '', width: '*' }], margin: [0, 2, 0, 0] }] },
    ]] },
    layout: GRID, margin: [0, 6, 0, 0],
  };
  const atkRows = sh.attacks.map((a) => [
    { text: a.name, bold: true }, { text: a.bonus, alignment: 'center', bold: true }, a.damage, { text: a.notes, fontSize: 7 * s, color: '#444444' },
  ]);
  const blankAtk = Math.max(2, 7 - atkRows.length);
  const attacks: PNode = {
    table: {
      widths: [92, 44, 92, '*'],
      headerRows: 2,
      heights: (i: number) => (i < 2 ? 0 : 15 * s),
      body: [
        [{ ...label(c, 'Атаки и заклинания'), colSpan: 4 }, {}, {}, {}],
        [label(c, 'Название'), label(c, 'Атака / Сл', { alignment: 'center' }), label(c, 'Урон и вид'), label(c, 'Примечания')],
        ...atkRows,
        ...Array.from({ length: blankAtk }, () => ['', '', '', '']),
      ],
    },
    layout: RULED, fontSize: 8.3 * s, margin: [0, 6, 0, 0],
  };

  const right: PNode[] = [stats, hp, death, attacks];
  const res = sh.resources.filter((r) => !r.hidden);
  if (res.length) {
    right.push({
      table: {
        widths: ['*', 'auto'], headerRows: 1,
        body: [
          [{ ...label(c, 'Ограниченные умения (отмечайте использования)'), colSpan: 2 }, {}],
          ...res.map((r) => [
            { text: [{ text: r.name, bold: true }, r.per ? { text: ` — ${r.max} / ${r.per}`, color: LABEL, fontSize: 7.3 * s } : ''] },
            r.max <= 12 ? { ...marks(r.max, { size: 8 }), margin: [0, 1, 0, 0] } : { text: `____ / ${r.max}`, alignment: 'right' },
          ]),
        ],
      },
      layout: RULED, fontSize: 8.5 * s, margin: [0, 6, 0, 0],
    });
  }
  if (sh.casters.length || sh.spells.length) {
    const main = sh.casters[0];
    const slotLevels = sh.slots.map((n, i) => ({ n, l: i + 1 })).filter((x) => x.n > 0);
    const parts: PNode[] = [];
    if (main) {
      parts.push({ text: [
        { text: 'Сл спасброска ', color: LABEL }, { text: String(main.dc), bold: true },
        { text: '   Бонус атаки ', color: LABEL }, { text: signed(main.attack), bold: true },
        { text: `   Характеристика `, color: LABEL }, { text: ABILITY[main.ability].short, bold: true },
        ...(sh.casters.length > 1 ? [{ text: '   (у классов разные — см. лист заклинаний)', color: LABEL, fontSize: 7 * s }] : []),
      ], margin: [0, 0, 0, 3] });
    }
    if (slotLevels.length || sh.pact) {
      parts.push({ columns: [
        ...slotLevels.map((x) => ({ width: 'auto', stack: [{ text: `${x.l} ур.`, fontSize: 7 * s, color: LABEL }, marks(x.n, { circle: true, size: 8 })], margin: [0, 0, 10, 0] })),
        ...(sh.pact ? [{ width: 'auto', stack: [{ text: `договор, ${sh.pact.level} ур.`, fontSize: 7 * s, color: LABEL }, marks(sh.pact.slots, { circle: true, size: 8 })] }] : []),
      ] });
    }
    right.push({ ...box(c, 'Заклинания — отмечайте потраченные ячейки', parts), margin: [0, 6, 0, 0] });
  }
  // A short reminder of the features; long lists (high levels) would push the page over, they are on the features page.
  const featNames = sh.features.flatMap((g) => g.items.map((f) => f.name));
  if (featNames.length && featNames.join(' · ').length <= 420) {
    right.push({ ...box(c, 'Умения и черты (полностью — на отдельной странице)', [{ text: featNames.join(' · '), fontSize: 7.8 * s }]), margin: [0, 6, 0, 0] });
  }
  right.push({ ...box(c, 'Состояния, эффекты, концентрация', [lines(3, RIGHT - 14, 13 * s)]), margin: [0, 6, 0, 0] });

  return [
    header,
    { columns: [
      { width: LEFT, stack: [abil, small, skills, passive, { ...profBox, margin: [0, 6, 0, 0] }] },
      { width: RIGHT, stack: right },
    ], columnGap: GAP },
  ];
}

/* ---------------- features ---------------- */

function featuresPages(c: Ctx, full: boolean): PNode[] {
  const { sheet: sh, s } = c;
  const out: PNode[] = [pageTitle(c, 'Умения и черты', sh.name)];
  for (const g of sh.features) {
    out.push({ text: g.title, fontSize: 12 * s, bold: true, color: ACCENT, margin: [0, 8, 0, 3], headlineLevel: 1 });
    if (full && g.intro) out.push({ stack: htmlToPdf(restructure(g.intro)), italics: true, color: '#444444', fontSize: 8.8 * c.s });
    for (const f of g.items) {
      const head: PNode = {
        columns: [
          { width: '*', text: [{ text: f.name, bold: true, fontSize: 10.5 * s }, f.note ? { text: `   ${f.note}`, fontSize: 7.5 * s, color: LABEL } : ''] },
          ...(f.usesMax ? [
            { width: 'auto', text: f.uses, fontSize: 7.5 * s, color: LABEL, margin: [0, 1, 6, 0] },
            f.usesMax <= 12 ? { ...marks(f.usesMax, { size: 8 }), margin: [0, 1, 0, 0] } : { width: 'auto', text: '____' },
          ] : []),
        ],
        margin: [0, 5, 0, 1],
      };
      if (!full) { out.push(head); continue; }
      out.push({ stack: [head, ...htmlToPdf(restructure(f.html)).slice(0, 1)], unbreakable: true });
      out.push(...htmlToPdf(restructure(f.html)).slice(1));
    }
  }
  if (!sh.features.length) out.push({ text: 'В файле нет умений.', italics: true });
  return out;
}

/** 5etools markup: inline run-in headers ("Ability Score Minimum.") become bold text at the start of the next paragraph. */
function restructure(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild!;
  root.querySelectorAll('span.rd__h, .rd__h').forEach((h) => {
    const title = (h.querySelector('.entry-title-inner')?.textContent ?? h.textContent ?? '').trim();
    const next = h.nextElementSibling;
    if (!title) { h.remove(); return; }
    if (h.tagName === 'SPAN' && next?.tagName === 'P') {
      const b = doc.createElement('strong');
      b.textContent = `${title} `;
      next.prepend(b);
      h.remove();
    } else {
      const h4 = doc.createElement('h4');
      h4.textContent = title;
      h.replaceWith(h4);
    }
  });
  root.querySelectorAll('hr, img, .float-clear').forEach((x) => x.remove());
  return root.innerHTML;
}

/* ---------------- spells ---------------- */

function spellPages(c: Ctx): PNode[] {
  const { sheet: sh, s } = c;
  const opts = optionsOf(c.ch);
  const out: PNode[] = [pageTitle(c, 'Заклинания', sh.name)];
  if (sh.casters.length) {
    out.push({
      table: {
        widths: ['*', 62, 52, 50, 150], headerRows: 1,
        body: [
          [label(c, 'Класс'), label(c, 'Характеристика'), label(c, 'Сл спасброска'), label(c, 'Бонус атаки'), label(c, 'Сколько заклинаний')],
          ...sh.casters.map((k) => {
            const counts = [k.cantrips != null ? `заговоров: ${k.cantrips}` : '', k.known != null ? `известно: ${k.known}` : '',
              k.prepared != null ? `подготовить: ${k.prepared} (${k.preparedRule})` : k.preparedRule ? `подготовить: ${k.preparedRule}` : ''].filter(Boolean).join('; ');
            return [{ text: k.name, bold: true }, ABILITY[k.ability].name, { text: String(k.dc), bold: true, fontSize: 11 * s }, { text: signed(k.attack), bold: true, fontSize: 11 * s }, { text: counts || '—', fontSize: 7.8 * s }];
          }),
        ],
      },
      layout: GRID, fontSize: 9 * s, margin: [0, 0, 0, 6],
    });
  }
  const slotLevels = sh.slots.map((n, i) => ({ n, l: i + 1 })).filter((x) => x.n > 0);
  if (slotLevels.length || sh.pact) {
    const cells = [
      ...slotLevels.map((x) => ({ stack: [{ text: `${x.l} уровень · ${x.n}`, bold: true, fontSize: 8 * s }, { ...marks(x.n, { circle: true, size: 9, gap: 4 }), margin: [0, 2, 0, 0] }] })),
      ...(sh.pact ? [{ stack: [{ text: `Договор · ${sh.pact.slots} яч. ${sh.pact.level} ур.`, bold: true, fontSize: 8 * s }, { ...marks(sh.pact.slots, { circle: true, size: 9, gap: 4 }), margin: [0, 2, 0, 0] }] }] : []),
    ];
    out.push({ table: { widths: cells.map(() => '*'), body: [[{ ...label(c, 'Ячейки заклинаний: отмечайте потраченные, стирайте после отдыха'), colSpan: cells.length }, ...cells.slice(1).map(() => ({}))], cells] }, layout: GRID, margin: [0, 0, 0, 6] });
  }
  out.push({
    columns: [
      { ...marks(1, { size: 7, filled: 1 }), width: 11 }, { width: 'auto', text: 'подготовлено всегда (не входит в лимит)', margin: [0, 0, 12, 0] },
      { ...marks(1, { size: 7 }), width: 11 }, { width: 'auto', text: 'отметьте подготовленные сегодня', margin: [0, 0, 12, 0] },
      { width: '*', text: 'К — концентрация, Р — ритуал' },
    ],
    fontSize: 7.5 * s, color: LABEL, margin: [0, 0, 0, 4],
  });

  const maxCast = sh.casters.length ? Math.max(...sh.casters.map((k) => k.maxLevel), sh.pact?.level ?? 0) : -1;
  const maxLevel = Math.max(maxCast, ...sh.spells.map((x) => x.level));
  const header = [label(c, ''), label(c, 'Название'), label(c, 'Время'), label(c, 'Дистанция'), label(c, 'Длительность'), label(c, 'Комп.'), label(c, '')];
  for (let L = 0; L <= maxLevel; L++) {
    const list = sh.spells.filter((x) => x.level === L);
    const canCast = L <= maxCast;
    if (!list.length && !canCast) continue;
    const blank = canCast ? opts.spellRows : 0;
    const prep = (sp: SheetSpell | null) => (L === 0 ? '' : sp?.always ? { ...marks(1, { size: 8, filled: 1 }), margin: [0, 1, 0, 0] } : { ...marks(1, { size: 8 }), margin: [0, 1, 0, 0] });
    out.push({
      table: {
        widths: [12, '*', 72, 70, 92, 34, 18],
        headerRows: 2,
        dontBreakRows: true,
        heights: (i: number) => (i < 2 ? 0 : 15 * s),
        body: [
          [{ text: `${spellLevelLabel(L)}${L > 0 && sh.slots[L - 1] ? ` · ячеек: ${sh.slots[L - 1]}` : ''}`, colSpan: 7, bold: true, color: ACCENT, fontSize: 10 * s }, {}, {}, {}, {}, {}, {}],
          header,
          ...list.map((sp) => [
            prep(sp),
            { text: [{ text: sp.name, bold: true, color: sp.homebrew ? LL_COLOR : INK }, sp.other ? { text: `  ${sp.other}`, fontSize: 6.8 * s, color: LABEL } : ''] },
            sp.time, sp.range, sp.duration, sp.comps,
            { text: [sp.conc ? 'К' : '', sp.ritual ? 'Р' : ''].filter(Boolean).join(' '), bold: true, color: '#9a5b00' },
          ]),
          ...Array.from({ length: blank }, () => [prep(null), '', '', '', '', '', '']),
        ],
      },
      layout: RULED, fontSize: 8 * s, margin: [0, 6, 0, 0],
    });
  }
  if (maxLevel < 0) out.push({ text: 'У персонажа нет заклинаний и ячеек. Ниже — пустые строки на случай, если они появятся.', italics: true, color: LABEL, margin: [0, 4, 0, 4] });
  return out;
}

/** Height of the writing area of a table row (pdfmake adds the cell paddings, 3 + 1, and the 0.4 rule). */
const ROW = 14;
const rowTotal = (c: Ctx) => ROW * c.s + 4.4;
/** Rows that fit into `height` points. */
const rowsFit = (c: Ctx, height: number) => Math.max(0, Math.floor(height / rowTotal(c)));
/** Page title (15pt + rule + margin) and a table header row with small captions. */
const titleH = (c: Ctx) => 15 * c.s * 1.12 + 12;
const headH = (c: Ctx) => 6.3 * c.s * 1.12 + 5;

function blankSpellPage(c: Ctx): PNode[] {
  const row = ROW * c.s;
  const n = rowsFit(c, H - titleH(c) - headH(c)) - 1;
  return [
    pageTitle(c, 'Заклинания — дополнительный лист', c.sheet.name),
    {
      table: {
        widths: [22, 12, '*', 62, 58, 74, 34, 58], headerRows: 1, heights: (i: number) => (i === 0 ? 0 : row),
        body: [
          [label(c, 'Ур.'), label(c, ''), label(c, 'Название'), label(c, 'Время'), label(c, 'Дистанция'), label(c, 'Длительность'), label(c, 'Комп.'), label(c, 'Заметки')],
          ...Array.from({ length: n }, () => ['', { ...marks(1, { size: 8 }), margin: [0, 2, 0, 0] }, '', '', '', '', '', '']),
        ],
      },
      layout: { ...RULED, vLineWidth: (i: number, node: PNode) => (i === 0 || i === node.table.widths.length ? 0 : 0.3), vLineColor: () => RULE },
      fontSize: 8.5 * c.s,
    },
  ];
}

/* ---------------- equipment ---------------- */

const INV_WIDTHS = ['*', 40, 46, 150];
const invHeader = (c: Ctx) => [label(c, 'Предмет'), label(c, 'Кол-во', { alignment: 'center' }), label(c, 'Вес, фнт.', { alignment: 'center' }), label(c, 'Заметки')];

function inventoryPages(c: Ctx): PNode[] {
  const { sheet: sh, s } = c;
  const row = ROW * s;
  const coins: [keyof Sheet['currency'], string][] = [['cp', 'Медные (мм)'], ['sp', 'Серебряные (см)'], ['ep', 'Электрумовые (эм)'], ['gp', 'Золотые (зм)'], ['pp', 'Платиновые (пм)']];
  const currency: PNode = {
    table: { widths: ['*', '*', '*', '*', '*'], heights: [40 * s], body: [coins.map(([k, l]) => ({
      stack: [label(c, l), { text: sh.currency[k] ? String(sh.currency[k]) : '', fontSize: 13 * s, bold: true, margin: [0, 2, 0, 0] }],
    }))] },
    layout: GRID,
  };
  const att = Array.from({ length: Math.max(sh.attunement.max, 3) }, (_, i) => sh.attunement.items[i] ?? '');
  const info: PNode = {
    columns: [
      { width: '*', text: [{ text: 'Вес снаряжения: ', color: LABEL }, { text: `${sh.carried} фнт.`, bold: true }, { text: '   Грузоподъёмность: ', color: LABEL },
        { text: `${sh.capacity} фнт.`, bold: true }, { text: ' (Сила × 15)', color: LABEL }], fontSize: 8.5 * s },
    ],
    margin: [0, 6, 0, 4],
  };
  const attune: PNode = fields(c, [att.map((a, i) => [a, `Настроенный предмет ${i + 1}`] as [string, string])], att.map(() => '*'), true);
  const items = sh.inventory.map((it) => [
    { text: it.name, bold: it.depth === 0, margin: [it.depth * 12, 0, 0, 0] },
    { text: it.qty === 1 ? '1' : String(it.qty), alignment: 'center' },
    { text: it.weight ? String(it.weight) : '—', alignment: 'center' },
    { text: it.notes, fontSize: 7.5 * s, color: '#444444' },
  ]);
  // Fill the first page: title, coins (40 + paddings), weights line, attunement fields, table header.
  const firstFits = rowsFit(c, H - titleH(c) - (40 * s + 6) - (8.5 * s * 1.12 + 10) - (9.5 * s * 1.12 + 6.3 * s * 1.12 + 16) - 6 - headH(c)) - 1;
  const restFits = rowsFit(c, H - headH(c)) - 1;
  const blank = items.length <= firstFits ? firstFits - items.length : (restFits - ((items.length - firstFits) % restFits)) % restFits;
  return [
    pageTitle(c, 'Снаряжение', sh.name),
    currency, info, attune,
    {
      table: { widths: INV_WIDTHS, headerRows: 1, dontBreakRows: true, heights: (i: number) => (i === 0 ? 0 : row), body: [invHeader(c), ...items, ...Array.from({ length: blank }, () => ['', '', '', ''])] },
      layout: RULED, fontSize: 8.6 * s, margin: [0, 6, 0, 0],
    },
  ];
}

function blankInventoryPage(c: Ctx): PNode[] {
  const row = ROW * c.s;
  const n = rowsFit(c, H - titleH(c) - headH(c)) - 1;
  return [
    pageTitle(c, 'Снаряжение — дополнительный лист', c.sheet.name),
    { table: { widths: INV_WIDTHS, headerRows: 1, heights: (i: number) => (i === 0 ? 0 : row), body: [invHeader(c), ...Array.from({ length: n }, () => ['', '', '', ''])] }, layout: RULED, fontSize: 8.6 * c.s },
  ];
}

/* ---------------- personality, notes ---------------- */

function textBox(c: Ctx, title: string, text: string, ruled: number, width: number): PNode {
  return box(c, title, [...(text ? [{ text, fontSize: 8.8 * c.s, margin: [0, 0, 0, 2] }] : []), lines(ruled, width - 14, 15 * c.s)]);
}

function personalityPage(c: Ctx): PNode[] {
  const { sheet: sh } = c;
  const d = sh.details;
  const half = (W - 8) / 2;
  const n = (t: string, base: number) => Math.max(1, base - Math.ceil(t.length / 70));
  return [
    pageTitle(c, 'Личность и история', sh.name),
    { columns: [textBox(c, 'Черты характера', d.traits, n(d.traits, 4), half), textBox(c, 'Идеалы', d.ideals, n(d.ideals, 4), half)], columnGap: 8 },
    { columns: [textBox(c, 'Привязанности', d.bonds, n(d.bonds, 4), half), textBox(c, 'Слабости', d.flaws, n(d.flaws, 4), half)], columnGap: 8, margin: [0, 6, 0, 0] },
    { ...fields(c, [[[d.age, 'Возраст'], [d.height, 'Рост'], [d.weight, 'Вес'], [d.eyes, 'Глаза'], [d.skin, 'Кожа'], [d.hair, 'Волосы']]], ['*', '*', '*', '*', '*', '*'], true), margin: [0, 4, 0, 2] },
    { ...textBox(c, 'Внешность', d.appearance, n(d.appearance, 4), W), margin: [0, 4, 0, 0] },
    { ...textBox(c, 'Предыстория персонажа', d.backstory, n(d.backstory, 10), W), margin: [0, 6, 0, 0] },
    { ...textBox(c, 'Союзники и организации', d.allies, n(d.allies, 5), W), margin: [0, 6, 0, 0] },
    { ...textBox(c, 'Заметки', d.notes, n(d.notes, c.s > 1 ? 5 : 9), W), margin: [0, 6, 0, 0] },
  ];
}

function notesPage(c: Ctx, i: number): PNode[] {
  const gap = 20 * c.s;
  return [pageTitle(c, i ? 'Заметки' : 'Заметки', c.sheet.name), lines(Math.floor((H - 40) / gap) - 1, W, gap)];
}

/* ---------------- spell descriptions ---------------- */

function spellTexts(c: Ctx, data: Dataset): PNode[] {
  const { sheet: sh, s } = c;
  const opts = optionsOf(c.ch);
  const lang = opts.spellLang;
  const out: PNode[] = [pageTitle(c, 'Описания заклинаний', sh.name)];
  let level = -1;
  for (const sp of sh.spells) {
    if (sp.level !== level) {
      level = sp.level;
      out.push({ text: spellLevelLabel(level), fontSize: 12 * s, bold: true, color: ACCENT, margin: [0, 8, 0, 2], headlineLevel: 1 });
    }
    const v = sp.site ? data.spells.find((x) => x.group === sp.site!.id && x.homebrew === sp.site!.ll) ?? null : null;
    const kind = v ? `${levelSchool(v.level, v.school, v.ritual, lang)}${v.concentration ? (lang === 'ru' ? ', концентрация' : ', concentration') : ''}`
      : `${sp.level === 0 ? 'Заговор' : `${sp.level} уровень`}${sp.school ? `, ${sp.school.toLowerCase()}` : ''}${sp.ritual ? ' (ритуал)' : ''}${sp.conc ? ', концентрация' : ''}`;
    const fullComps = v ? (lang === 'ru' ? v.comps.ru ?? v.comps.en : v.comps.en) : sp.comps;
    const meta = [['Время', sp.time], ['Дистанция', sp.range], ['Компоненты', fullComps], ['Длительность', sp.duration]]
      .map(([k, val]) => [{ text: `${k}:`, bold: true, color: '#555555', noWrap: true }, val || '—']);
    out.push({
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 0.5, lineColor: '#dddddd' }], margin: [0, 2, 0, 4] },
        { text: [{ text: sp.name, fontSize: 11.5 * s, bold: true, color: sp.homebrew ? LL_COLOR : INK }, sp.other ? { text: `   ${sp.other}`, fontSize: 8 * s, color: LABEL } : ''] },
        { text: kind, italics: true, color: '#555555', fontSize: 8.3 * s },
        { table: { widths: ['auto', '*', 'auto', '*'], body: [[...meta[0], ...meta[1]], [...meta[2], ...meta[3]]] }, layout: 'noBorders', fontSize: 8.3 * s, margin: [0, 2, 0, 2] },
      ],
      unbreakable: true,
    });
    out.push({ stack: htmlToPdf(restructure(sp.html)), fontSize: 8.8 * s });
    out.push({ text: sp.source, fontSize: 7 * s, color: LABEL, margin: [0, 0, 0, 5] });
  }
  const credits = [
    sh.spells.some((x) => x.site && !x.homebrew) ? 'Тексты официальных заклинаний: книги D&D 5e (2014), русский текст — ttg.club.' : '',
    sh.spells.some((x) => x.homebrew) ? 'Хоумбрю: Laserllama, «Compendium of Spells» (gmbinder.com/profile/laserllama); перевод на русский неофициальный.' : '',
  ].filter(Boolean);
  if (credits.length) out.push({ text: credits.join(' '), fontSize: 7 * s, color: '#888888', margin: [0, 10, 0, 0] });
  return out;
}

/* ---------------- document ---------------- */

export async function buildSheetPdf(data: Dataset, ch: Character): Promise<{ blob: Blob; pages: number }> {
  const pdfMake = await loadEngine();
  const opts = optionsOf(ch);
  const sheet = buildSheet(data, ch);
  const s = opts.large ? 1.12 : 1;
  const c: Ctx = { s, fs: 9 * s, row: 17 * s, sheet, ch };
  const hasMagic = sheet.casters.length > 0 || sheet.spells.length > 0;

  const content: PNode[] = [...mainPage(c)];
  if (sheet.features.length) content.push(...featuresPages(c, opts.featureText));
  if (hasMagic) content.push(...spellPages(c));
  for (let i = 0; i < opts.spellPages; i++) content.push(...blankSpellPage(c));
  content.push(...inventoryPages(c));
  for (let i = 0; i < opts.itemPages; i++) content.push(...blankInventoryPage(c));
  content.push(...personalityPage(c));
  for (let i = 0; i < opts.notePages; i++) content.push(...notesPage(c, i));
  if (opts.spellText && sheet.spells.length) content.push(...spellTexts(c, data));

  let pages = 0;
  const doc = {
    info: { title: sheet.name, creator: 'Spellbook: character sheet (D&D 5e 2014)' },
    pageSize: 'A4',
    pageMargins: [MARGIN.l, MARGIN.t, MARGIN.r, MARGIN.b],
    defaultStyle: { font: 'Roboto', fontSize: c.fs, lineHeight: 1.12, color: INK },
    content,
    footer: (page: number, total: number) => {
      pages = total;
      return {
        columns: [{ text: `${sheet.name} · ${sheet.classLine}`, fontSize: 7, color: '#999999' }, { text: `${page} / ${total}`, alignment: 'right', fontSize: 7, color: '#999999' }],
        margin: [MARGIN.l, 14, MARGIN.r, 0],
      };
    },
    pageBreakBefore: (node: PNode, q: PNode) => node.headlineLevel === 1 && q.getFollowingNodesOnPage().length === 0,
  };
  const blob: Blob = await pdfMake.createPdf(doc).getBlob();
  return { blob, pages };
}

export async function downloadSheetPdf(data: Dataset, ch: Character) {
  const { blob, pages } = await buildSheetPdf(data, ch);
  saveBlob(blob, `${ch.name || 'character'} — лист персонажа`);
  return { size: blob.size, pages };
}
