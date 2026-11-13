// Laserllama "Compendium of Spells" (extracted from the GM Binder PDF by extract_laserllama.py).
import { escapeHtml, htmlToText, SCHOOL_BY_NAME } from './text.mjs';

const tableHtml = (b) => {
  const head = b.rows.filter((r) => r.head);
  const body = b.rows.filter((r) => !r.head);
  const tr = (r, cell) => `<tr>${r.cells.map((c) => `<${cell}>${c}</${cell}>`).join('')}</tr>`;
  return `<table>${b.caption ? `<caption>${b.caption}</caption>` : ''}` +
    (head.length ? `<thead>${head.map((r) => tr(r, 'th')).join('')}</thead>` : '') +
    `<tbody>${body.map((r) => tr(r, 'td')).join('')}</tbody></table>`;
};

const statblockHtml = (b) => {
  const abil = `<table class="sb-abilities"><thead><tr>${b.abilities.map((a) => `<th>${a.ab}</th>`).join('')}</tr></thead>` +
    `<tbody><tr>${b.abilities.map((a) => `<td>${a.vals.join(' ')}</td>`).join('')}</tr></tbody></table>`;
  const props = b.props.map((p) => (p === '<!--abilities-->' ? abil : `<p>${p}</p>`)).join('');
  const sections = (b.sections || []).map((s) =>
    `${s.title ? `<h5>${s.title}</h5>` : ''}${s.entries.map((e) => `<p>${e}</p>`).join('')}`).join('');
  return `<aside class="statblock"><h4>${b.name}</h4>${b.subtitle ? `<p class="sb-sub"><em>${b.subtitle}</em></p>` : ''}` +
    `${props}${sections}</aside>`;
};

/** Laserllama blocks -> HTML (block html is already inline-only markup from the extractor). */
export function blocksToHtml(blocks) {
  return blocks.map((b) => {
    switch (b.type) {
      case 'p': return `<p>${b.html}</p>`;
      case 'h': return `<h5>${escapeHtml(b.text)}</h5>`;
      case 'table': return tableHtml(b);
      case 'statblock': return statblockHtml(b);
      case 'ul': return `<ul>${b.items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
      default: throw new Error(`Laserllama block ${b.type}`);
    }
  }).join('');
}

export const prop = (s, key) => s.props.find(([k]) => k === key)?.[1] ?? '';

/** Casting time string -> filter key ("action", "bonus", "reaction", "minute:10", "attack", "hit"). */
export function castKeyFromText(t) {
  const s = t.trim().toLowerCase();
  if (s.startsWith('on hit')) return ['hit'];
  let m = s.match(/^(\d+) (action|bonus action|reaction|attack|minutes?|hours?)/);
  if (!m) throw new Error(`Unknown casting time "${t}"`);
  const n = +m[1];
  const u = m[2];
  if (u === 'action') return ['action'];
  if (u === 'bonus action') return ['bonus'];
  if (u === 'reaction') return ['reaction'];
  if (u === 'attack') return ['attack'];
  if (u.startsWith('minute')) return [`minute:${n}`];
  return [`hour:${n}`];
}

export function parseComponents(t) {
  // Formats seen: "V, S, M (x)", "V S M (x)", "V (a Fiend's true name), S", "V, S, M (x)."
  let flagsStr = '';
  let material = '';
  let depth = 0, buf = '', last = '';
  for (const ch of t.trim()) {
    if (ch === '(') { if (depth++ === 0) { buf = ''; continue; } }
    if (ch === ')') { if (--depth === 0) { if (last === 'M') material = buf; continue; } }
    if (depth > 0) { buf += ch; continue; }
    flagsStr += ch;
    if (/[VSM]/.test(ch)) last = ch;
  }
  const flags = flagsStr.split(/[,\s.]+/).filter(Boolean);
  for (const f of flags) if (!['V', 'S', 'M'].includes(f)) throw new Error(`Unknown component "${f}" in "${t}"`);
  return { v: flags.includes('V'), s: flags.includes('S'), m: flags.includes('M'), material };
}

const TYPE = '(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)';
const LIST_RE = new RegExp(`${TYPE}((?:,\\s*(?:or\\s+|and\\s+)?${TYPE}|\\s+(?:or|and)\\s+${TYPE})*)\\s+damage`, 'gi');

/** Damage types dealt by a spell, found in its English text ("takes 2d6 fire damage", "acid or cold damage"). */
export function damageTypesFromText(html) {
  const text = htmlToText(html);
  const found = new Set();
  for (const m of text.matchAll(LIST_RE)) {
    const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (/(resistance|immunity|immune|resistant|vulnerab\w*) (to )?$/.test(before)) continue;
    for (const t of m[0].toLowerCase().matchAll(new RegExp(TYPE, 'g'))) found.add(t[1]);
  }
  return [...found].sort();
}

export const schoolCode = (name) => {
  const c = SCHOOL_BY_NAME[name.trim().toLowerCase()];
  if (!c) throw new Error(`Unknown school ${name}`);
  return c;
};

export const classList = (s) => prop(s, 'Classes').split(',').map((x) => x.trim()).filter(Boolean);
