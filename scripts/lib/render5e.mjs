// Renders 5etools spell data (entries + {@tags}) to HTML, and formats header fields in book style.
import { escapeHtml, slugify } from './text.mjs';

/** Split "a|b|c" at top level (ignores pipes inside nested {@...}). */
function splitTop(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === '|' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

const plusSign = (v) => (/^[+-]/.test(v.trim()) ? v.trim() : `+${v.trim()}`);

/**
 * Render one tag. ctx.spellRef(name) -> slug or null. Returns HTML.
 * Display rules follow the 5etools renderer.
 */
function renderTag(tag, body, ctx) {
  const p = splitTop(body);
  const disp = (i) => (p[i] && p[i].trim() ? p[i] : p[0]);
  switch (tag) {
    case 'b': case 'bold': return `<strong>${renderString(body, ctx)}</strong>`;
    case 'i': case 'italic': return `<em>${renderString(body, ctx)}</em>`;
    case 'note': return `<em>${renderString(body, ctx)}</em>`;
    case 'damage': case 'dice': return escapeHtml(disp(1));
    case 'scaledamage': case 'scaledice': return escapeHtml(p[3]?.trim() ? p[3] : p[2]);
    case 'hit': return escapeHtml(p[1]?.trim() ? p[1] : plusSign(p[0]));
    case 'd20': return escapeHtml(p[1]?.trim() ? p[1] : plusSign(p[0]));
    case 'dc': return escapeHtml(p[1]?.trim() ? p[1] : `DC ${p[0]}`);
    case 'chance': return escapeHtml(p[1]?.trim() ? p[1] : `${p[0]} percent`);
    case 'spell': {
      const text = disp(2);
      const ref = ctx.spellRef?.(p[0]);
      return ref ? `<a data-ref="${ref}">${escapeHtml(text)}</a>` : `<em>${escapeHtml(text)}</em>`;
    }
    case 'filter': case 'book': case 'adventure': return escapeHtml(p[0]);
    case 'quickref': return escapeHtml(p[4]?.trim() ? p[4] : p[0]);
    case 'classFeature': return escapeHtml(p[5]?.trim() ? p[5] : p[0]);
    case 'subclassFeature': return escapeHtml(p[7]?.trim() ? p[7] : p[0]);
    case 'condition': case 'status': case 'creature': case 'item': case 'skill': case 'sense': case 'action':
    case 'race': case 'disease': case 'background': case 'feat': case 'object': case 'variantrule':
    case 'language': case 'table': case 'deity': case 'hazard': case 'vehicle': case 'optfeature':
    case 'reward': case 'trap': case 'cult': case 'boon': case 'class':
      return escapeHtml(disp(2));
    default:
      throw new Error(`Unknown 5etools tag {@${tag} ${body}}`);
  }
}

/** Render a 5etools string with nested {@tag ...} markup. */
export function renderString(s, ctx = {}) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf('{@', i);
    if (start < 0) { out += escapeHtml(s.slice(i)); break; }
    out += escapeHtml(s.slice(i, start));
    let depth = 0, j = start;
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) break;
    }
    if (depth !== 0) throw new Error(`Unbalanced tag in: ${s}`);
    const inner = s.slice(start + 2, j);
    const sp = inner.search(/\s/);
    const tag = sp < 0 ? inner : inner.slice(0, sp);
    const body = sp < 0 ? '' : inner.slice(sp + 1);
    out += renderTag(tag, body, ctx);
    i = j + 1;
  }
  return out;
}

const cellText = (c, ctx) => {
  if (typeof c === 'string') return renderString(c, ctx);
  if (c?.type === 'cell') {
    const pad = (n) => String(n).padStart(c.roll.pad ? 2 : 1, '0');
    if (c.roll.exact !== undefined) return pad(c.roll.exact);
    return `${pad(c.roll.min)}–${pad(c.roll.max)}`;
  }
  return renderEntries([c], ctx, 2);
};

/** Render a list of entries to HTML. depth>0 means inside a named section. */
export function renderEntries(entries, ctx = {}, depth = 0) {
  let html = '';
  for (const e of entries) html += renderEntry(e, ctx, depth);
  return html;
}

function renderNamed(name, children, ctx, depth) {
  const label = `<strong><em>${renderString(name, ctx)}.</em></strong> `;
  if (typeof children[0] === 'string') {
    return `<p>${label}${renderString(children[0], ctx)}</p>` + renderEntries(children.slice(1), ctx, depth + 1);
  }
  return `<p>${label.trim()}</p>` + renderEntries(children, ctx, depth + 1);
}

function renderEntry(e, ctx, depth) {
  if (typeof e === 'string') return `<p>${renderString(e, ctx)}</p>`;
  switch (e.type) {
    case 'entries':
      return e.name ? renderNamed(e.name, e.entries, ctx, depth) : renderEntries(e.entries, ctx, depth + 1);
    case 'list':
      return `<ul>${e.items.map((it) => `<li>${renderListItem(it, ctx, depth)}</li>`).join('')}</ul>`;
    case 'table': {
      const cap = e.caption ? `<caption>${renderString(e.caption, ctx)}</caption>` : '';
      const head = e.colLabels ? `<thead><tr>${e.colLabels.map((c) => `<th>${renderString(c, ctx)}</th>`).join('')}</tr></thead>` : '';
      const rows = e.rows.map((r) => `<tr>${r.map((c) => `<td>${cellText(c, ctx)}</td>`).join('')}</tr>`).join('');
      return `<table>${cap}${head}<tbody>${rows}</tbody></table>`;
    }
    case 'quote':
      return `<blockquote>${renderEntries(e.entries, ctx, depth + 1)}${e.by ? `<p class="quote-by">— ${renderString(e.by, ctx)}</p>` : ''}</blockquote>`;
    case 'inset':
      return `<aside class="inset">${e.name ? `<h5>${renderString(e.name, ctx)}</h5>` : ''}${renderEntries(e.entries, ctx, depth + 1)}</aside>`;
    case 'item':
      return renderNamed(e.name, e.entries || [e.entry], ctx, depth);
    default:
      throw new Error(`Unknown entry type ${e.type}`);
  }
}

function renderListItem(it, ctx, depth) {
  if (typeof it === 'string') return renderString(it, ctx);
  if (it.type === 'item') {
    const body = (it.entries || [it.entry]);
    const first = typeof body[0] === 'string' ? ` ${renderString(body[0], ctx)}` : '';
    return `<strong><em>${renderString(it.name, ctx)}.</em></strong>${first}` +
      renderEntries(typeof body[0] === 'string' ? body.slice(1) : body, ctx, depth + 1);
  }
  return renderEntry(it, ctx, depth + 1);
}

/* ---------------- header fields (English, book style) ---------------- */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function formatTime(time, ctx) {
  return time.map((t) => {
    const n = t.number;
    let s;
    switch (t.unit) {
      case 'action': s = plural(n, 'action', 'actions'); break;
      case 'bonus': s = plural(n, 'bonus action', 'bonus actions'); break;
      case 'reaction': s = plural(n, 'reaction', 'reactions'); break;
      case 'minute': s = plural(n, 'minute', 'minutes'); break;
      case 'hour': s = plural(n, 'hour', 'hours'); break;
      case 'round': s = plural(n, 'round', 'rounds'); break;
      default: throw new Error(`time unit ${t.unit}`);
    }
    return t.condition ? `${s}, ${renderPlain(t.condition, ctx)}` : s;
  }).join(' or ');
}

const distance = (d) => {
  switch (d.type) {
    case 'feet': return plural(d.amount, 'foot', 'feet');
    case 'miles': return plural(d.amount, 'mile', 'miles');
    default: throw new Error(`distance ${d.type}`);
  }
};
const unitAdj = (d) => `${d.amount}-${d.type === 'miles' ? 'mile' : 'foot'}`;

export function formatRange(r) {
  if (r.type === 'special') return 'Special';
  if (r.type === 'point') {
    switch (r.distance.type) {
      case 'self': return 'Self';
      case 'touch': return 'Touch';
      case 'sight': return 'Sight';
      case 'unlimited': return 'Unlimited';
      default: return distance(r.distance);
    }
  }
  const d = r.distance;
  switch (r.type) {
    case 'radius': return `Self (${unitAdj(d)} radius)`;
    case 'sphere': return `Self (${unitAdj(d)}-radius sphere)`;
    case 'hemisphere': return `Self (${unitAdj(d)}-radius hemisphere)`;
    case 'cone': return `Self (${unitAdj(d)} cone)`;
    case 'line': return `Self (${unitAdj(d)} line)`;
    case 'cube': return `Self (${unitAdj(d)} cube)`;
    case 'cylinder': return `Self (${unitAdj(d)}-radius cylinder)`;
    default: throw new Error(`range ${r.type}`);
  }
}

export function formatDuration(durations) {
  return durations.map((d) => {
    switch (d.type) {
      case 'instant': return 'Instantaneous';
      case 'special': return 'Special';
      case 'permanent': {
        const ends = d.ends || [];
        if (!ends.length) return 'Permanent';
        const words = ends.map((x) => ({ dispel: 'dispelled', trigger: 'triggered', discharge: 'discharged' }[x] || x));
        return `Until ${words.join(' or ')}`;
      }
      case 'timed': {
        const { type, amount } = d.duration;
        const t = plural(amount, type, `${type}s`);
        if (d.concentration) return `Concentration, up to ${t}`;
        if (d.duration.upTo) return `Up to ${t}`;
        return t;
      }
      default: throw new Error(`duration ${d.type}`);
    }
  }).join(' or ');
}

export function formatComponents(c, ctx) {
  const parts = [];
  if (c.v) parts.push('V');
  if (c.s) parts.push('S');
  if (c.m) parts.push(`M (${renderPlain(typeof c.m === 'string' ? c.m : c.m.text, ctx)})`);
  if (c.r) parts.push('R');
  return parts.join(', ');
}

/** Plain-text render of a 5etools string (for header fields). */
export function renderPlain(s, ctx = {}) {
  return renderString(s, { ...ctx, spellRef: null })
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

export const spellSlug = (name) => slugify(name);
