// pdfmake engine (loaded only when the user exports: pdfmake is large) and HTML -> pdfmake conversion.
// Light files: text only, no images; Roboto fonts are embedded as subsets (only the glyphs used), streams compressed.
import regularUrl from 'pdfmake/build/fonts/Roboto/Roboto-Regular.ttf?url';
import mediumUrl from 'pdfmake/build/fonts/Roboto/Roboto-Medium.ttf?url';
import italicUrl from 'pdfmake/build/fonts/Roboto/Roboto-Italic.ttf?url';
import mediumItalicUrl from 'pdfmake/build/fonts/Roboto/Roboto-MediumItalic.ttf?url';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PNode = any; // pdfmake document node

let engine: Promise<any> | null = null;

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function loadEngine() {
  engine ??= (async () => {
    const mod: any = await import('pdfmake');
    const pdfMake = mod.default ?? mod;
    const fonts: Record<string, string> = {
      'Roboto-Regular.ttf': regularUrl, 'Roboto-Medium.ttf': mediumUrl,
      'Roboto-Italic.ttf': italicUrl, 'Roboto-MediumItalic.ttf': mediumItalicUrl,
    };
    const vfs: Record<string, string> = {};
    await Promise.all(Object.entries(fonts).map(async ([name, url]) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`font ${name}: HTTP ${r.status}`);
      vfs[name] = toBase64(new Uint8Array(await r.arrayBuffer()));
    }));
    pdfMake.addVirtualFileSystem(vfs);
    return pdfMake;
  })();
  engine.catch(() => { engine = null; });
  return engine;
}

/* ---------------- spell HTML -> pdfmake ---------------- */

interface Inline { bold?: boolean; italics?: boolean; sup?: boolean; sub?: boolean }
const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'li', 'table', 'blockquote', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'caption']);

function inlines(node: ChildNode, st: Inline, out: PNode[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? '').replace(/\s+/g, ' ');
    if (t) out.push({ text: t, ...st });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') { out.push({ text: '\n' }); return; }
  const next = { ...st };
  if (tag === 'strong' || tag === 'b') next.bold = true;
  if (tag === 'em' || tag === 'i' || (tag === 'a' && el.hasAttribute('data-ref'))) next.italics = true;
  if (tag === 'sup') next.sup = true;
  if (tag === 'sub') next.sub = true;
  el.childNodes.forEach((c) => inlines(c, next, out));
}

const textOfInline = (el: Element) => {
  const out: PNode[] = [];
  el.childNodes.forEach((c) => inlines(c, {}, out));
  if (out.length) {
    out[0].text = out[0].text.replace(/^ /, '');
    out[out.length - 1].text = out[out.length - 1].text.replace(/ $/, '');
  }
  return out.filter((x) => x.text !== '');
};

function blocks(parent: Element): PNode[] {
  const out: PNode[] = [];
  let run: PNode[] = [];
  const flush = () => {
    const wrap = document.createElement('p');
    if (run.length) {
      const items = run.filter((x) => x.text.trim() !== '' || x.text === '\n');
      if (items.length) {
        items[0].text = items[0].text.replace(/^ /, '');
        out.push({ text: items, margin: [0, 0, 0, 4] });
      }
    }
    run = [];
    void wrap;
  };
  parent.childNodes.forEach((c) => {
    if (c.nodeType === Node.ELEMENT_NODE && BLOCK.has((c as Element).tagName.toLowerCase())) {
      flush();
      out.push(...block(c as Element));
    } else inlines(c, {}, run);
  });
  flush();
  return out;
}

function table(el: HTMLTableElement): PNode[] {
  const out: PNode[] = [];
  const caption = el.querySelector('caption');
  if (caption) out.push({ text: textOfInline(caption), bold: true, margin: [0, 2, 0, 2] });
  const rows = [...el.querySelectorAll('tr')];
  const body = rows.map((tr) => {
    const cells: PNode[] = [];
    for (const td of [...tr.children]) {
      const span = Number(td.getAttribute('colspan')) || 1;
      cells.push({ stack: blocks(td), bold: td.tagName === 'TH', ...(span > 1 ? { colSpan: span } : {}) });
      for (let i = 1; i < span; i++) cells.push({});
    }
    return cells;
  }).filter((r) => r.length);
  if (!body.length) return out;
  const n = Math.max(...body.map((r) => r.length));
  for (const r of body) while (r.length < n) r.push({ text: '' });
  out.push({
    table: { headerRows: el.querySelector('thead') ? el.querySelectorAll('thead tr').length : 0, body, widths: Array(n).fill('auto') },
    layout: 'lightHorizontalLines', fontSize: 8.5, margin: [0, 0, 0, 6],
  });
  return out;
}

function block(el: Element): PNode[] {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'p': return [{ text: textOfInline(el), margin: [0, 0, 0, 4] }];
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return [{ text: textOfInline(el), bold: true, margin: [0, 4, 0, 2] }];
    case 'ul': case 'ol': {
      const items = [...el.children].filter((x) => x.tagName === 'LI').map((li) => ({ stack: blocks(li) }));
      return [{ [tag]: items, margin: [0, 0, 0, 4] }];
    }
    case 'li': case 'div': case 'caption': return blocks(el);
    case 'blockquote': return [{ stack: blocks(el), italics: true, color: '#555555', margin: [8, 0, 0, 4] }];
    case 'aside': return [{ stack: blocks(el), margin: [8, 2, 0, 6] }];
    case 'table': return table(el as HTMLTableElement);
    default: return blocks(el);
  }
}

export const htmlToPdf = (html: string) => blocks(new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild!);

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
