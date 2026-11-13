import { parseFragment } from 'parse5';

export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Stable id for a spell name: "Tasha's Hideous Laughter" -> "tashas-hideous-laughter"
export const slugify = (name) =>
  String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Visible text of an HTML fragment, whitespace-collapsed (used for checks and comparisons).
// Uses a real HTML parser so all named entities (&laquo; &mdash; ...) are decoded.
export function htmlToText(html) {
  const parts = [];
  const walk = (n) => {
    if (n.nodeName === '#text') parts.push(n.value);
    else if (n.nodeName !== '#comment') (n.content?.childNodes || n.childNodes || []).forEach((c) => { walk(c); parts.push(' '); });
  };
  parseFragment(String(html)).childNodes.forEach(walk);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing',
  'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

export const SCHOOLS = {
  A: { en: 'Abjuration', ru: 'Ограждение' },
  C: { en: 'Conjuration', ru: 'Вызов' },
  D: { en: 'Divination', ru: 'Прорицание' },
  E: { en: 'Enchantment', ru: 'Очарование' },
  V: { en: 'Evocation', ru: 'Воплощение' },
  I: { en: 'Illusion', ru: 'Иллюзия' },
  N: { en: 'Necromancy', ru: 'Некромантия' },
  T: { en: 'Transmutation', ru: 'Преобразование' },
};
export const SCHOOL_BY_NAME = Object.fromEntries(Object.entries(SCHOOLS).map(([k, v]) => [v.en.toLowerCase(), k]));
