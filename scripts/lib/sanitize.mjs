// HTML sanitizer for spell texts: keeps a small whitelist of structural/inline tags,
// unwraps everything else (keeping its text), and lets callers rewrite links.
import { parseFragment } from 'parse5';
import { escapeHtml } from './text.mjs';

const KEEP = new Set(['p', 'strong', 'em', 'ul', 'ol', 'li', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'br', 'sup', 'sub', 'h4', 'h5', 'aside', 'a', 'span']);
const RENAME = { b: 'strong', i: 'em' };
const VOID = new Set(['br']);
const CLASS_OK = new Set(['statblock', 'sb-abilities', 'sb-sub', 'quote-by', 'inset', 'center']);

/**
 * @param {string} html
 * @param {{ link?: (href: string, text: string, node: any) => {ref?: string, drop?: boolean} | null,
 *           drop?: (node: any) => boolean }} hooks
 */
export function sanitize(html, hooks = {}) {
  const frag = parseFragment(String(html));
  let out = '';
  const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;
  const textOf = (node) =>
    node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join('');

  const walk = (node) => {
    if (node.nodeName === '#text') {
      out += escapeHtml(node.value);
      return;
    }
    if (node.nodeName === '#comment') return;
    if (hooks.drop?.(node)) return;
    let tag = RENAME[node.tagName] || node.tagName;
    const kids = () => (node.content?.childNodes || node.childNodes || []).forEach(walk);
    if (!tag || !KEEP.has(tag)) return kids(); // unwrap unknown elements (div, detail-tooltip, dice-roller...)

    let attrs = '';
    if (tag === 'a') {
      const res = hooks.link?.(attr(node, 'href') || '', textOf(node), node);
      if (res?.drop) return;
      if (!res?.ref) return kids(); // plain text
      attrs = ` data-ref="${escapeHtml(res.ref)}"`;
    } else if (tag === 'span') {
      return kids(); // spans only carry site styling
    } else if (tag === 'td' || tag === 'th') {
      for (const n of ['colspan', 'rowspan']) {
        const v = attr(node, n);
        if (v && /^\d+$/.test(v)) attrs += ` ${n}="${v}"`;
      }
    }
    const cls = (attr(node, 'class') || '').split(/\s+/).filter((c) => CLASS_OK.has(c));
    if (cls.length) attrs += ` class="${cls.join(' ')}"`;
    out += `<${tag}${attrs}>`;
    if (VOID.has(tag)) return;
    kids();
    out += `</${tag}>`;
  };
  frag.childNodes.forEach(walk);
  return out
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/\s+<\/p>/g, '</p>')
    .replace(/<p>\s+/g, '<p>')
    .trim();
}
