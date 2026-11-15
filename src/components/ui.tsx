import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Tri } from '../types';
import { applyTheme, readTheme, type Theme } from '../theme';

export function Chip(props: { on: boolean; onClick: () => void; children: ComponentChildren; title?: string; tone?: 'll' }) {
  return (
    <button type="button" class={`chip${props.on ? ' on' : ''}${props.tone ? ` tone-${props.tone}` : ''}`}
      aria-pressed={props.on} title={props.title} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

/** Three-state chip: any → required → excluded → any. */
export function TriChip(props: { value: Tri; onChange: (v: Tri) => void; children: ComponentChildren; title?: string }) {
  const next: Record<string, Tri> = { '0': 1, '1': -1, '-1': 0 };
  const label = props.value === 1 ? 'есть' : props.value === -1 ? 'нет' : 'неважно';
  return (
    <button type="button" class={`chip tri${props.value === 1 ? ' on' : ''}${props.value === -1 ? ' excl' : ''}`}
      title={`${props.title ?? ''} — ${label}`} aria-label={`${props.title ?? ''}: ${label}`}
      onClick={() => props.onChange(next[String(props.value)])}>
      {props.value === -1 ? <s>{props.children}</s> : props.children}
    </button>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void; small?: boolean; label?: string }) {
  return (
    <div class={`seg${props.small ? ' small' : ''}`} role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button type="button" role="radio" aria-checked={o.value === props.value} class={o.value === props.value ? 'on' : ''}
          title={o.title} onClick={() => props.onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const ICONS: Record<string, string> = {
  search: 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z',
  filter: 'M3 5h18v2l-7 7v5l-4 2v-7L3 7V5Z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
  back: 'M15.4 4 7.4 12l8 8 1.4-1.4L10.2 12l6.6-6.6L15.4 4Z',
  compare: 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v2h2V1h-2v2Zm0 15H5l5-6v6Zm9-15h-5v2h5v13l-5-6v9h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z',
  logout: 'M10 17v-3H3v-4h7V7l5 5-5 5Zm9-14H12v2h7v14h-7v2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z',
  book: 'M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM6 4h5v8l-2.5-1.5L6 12V4Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
  download: 'M5 20h14v-2H5v2Zm7-3 5-5-1.4-1.4-2.6 2.6V4h-2v9.2l-2.6-2.6L7 12l5 5Z',
  upload: 'M5 20h14v-2H5v2Zm7-16-5 5 1.4 1.4L11 7.8V16h2V7.8l2.6 2.6L17 9l-5-5Z',
  // Material Design icons (Apache 2.0): light_mode, dark_mode, contrast.
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2Zm18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2ZM11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0Zm0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0ZM6 4.6a1 1 0 0 0-1.4 1.4l1 1.1A1 1 0 0 0 7.1 5.6L6 4.6Zm12.4 12.4A1 1 0 0 0 17 18.4l1 1a1 1 0 0 0 1.4-1.4l-1-1Zm1-11a1 1 0 0 0-1.4-1.4l-1 1A1 1 0 0 0 18.4 7l1-1ZM7.1 18.4A1 1 0 0 0 5.6 17l-1 1a1 1 0 0 0 1.4 1.4l1-1Z',
  moon: 'M12 3a9 9 0 1 0 9 9c0-.5 0-.9-.1-1.4a5.4 5.4 0 0 1-9.8-3.1c0-1.8.9-3.4 2.3-4.4L12 3Z',
  contrast: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm1-17.9a8 8 0 0 1 0 15.8V4.1Z',
  spark: 'M10 2c.5 4.8 3.2 7.5 8 8-4.8.5-7.5 3.2-8 8-.5-4.8-3.2-7.5-8-8 4.8-.5 7.5-3.2 8-8Zm8 12c.2 2.3 1.6 3.7 4 4-2.4.3-3.8 1.7-4 4-.2-2.3-1.6-3.7-4-4 2.4-.3 3.8-1.7 4-4Z',
  // moon (Material dark_mode) with a star
  mystic: 'M12 3a9 9 0 1 0 9 9c0-.5 0-.9-.1-1.4a5.4 5.4 0 0 1-9.8-3.1c0-1.8.9-3.4 2.3-4.4L12 3Zm6-1 .9 2.1L21 5l-2.1.9L18 8l-.9-2.1L15 5l2.1-.9L18 2Z',
  // Material content_copy
  copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z',
  // a die showing five
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v14h14V5H5Zm3.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3ZM8.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3Z',
  // Material info (outlined)
  info: 'M11 7h2v2h-2V7Zm0 4h2v6h-2v-6Zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z',
  // Material cloud_queue, cloud_done, cloud_off, sync
  cloud: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96ZM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.47 5.47 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3Z',
  cloudDone: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96ZM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.47 5.47 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3Zm-9-3.82-2.09-2.09L6.5 13.5 10 17l6.01-6.01-1.41-1.41L10 14.18Z',
  cloudOff: 'M24 15c0-2.64-2.05-4.78-4.65-4.96A7.49 7.49 0 0 0 12 4c-1.33 0-2.57.36-3.65.97l1.49 1.49C10.51 6.17 11.23 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19a3 3 0 0 1 1.65 5.5l1.45 1.45A4.98 4.98 0 0 0 24 15ZM4.41 3.86 3 5.27l2.77 2.77h-.42A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h11.73l2 2 1.41-1.41L4.41 3.86ZM6 18c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73l8 8H6Z',
  sync: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8Zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3Z',
  person: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5Z',
  trash: 'M7 21a2 2 0 0 1-2-2V7H4V5h5V4h6v1h5v2h-1v12a2 2 0 0 1-2 2H7Zm10-14H7v12h10V7ZM9 17h2V9H9v8Zm4 0h2V9h-2v8Z',
};

export const Icon = ({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d={ICONS[name]} /></svg>
);

const THEMES: { value: Theme; label: string; icon: string; hint?: string }[] = [
  { value: 'mystic', label: 'Сумерки', icon: 'mystic', hint: 'новая тема' },
  { value: 'auto', label: 'Как в системе', icon: 'contrast', hint: 'классическая' },
  { value: 'light', label: 'Светлая', icon: 'sun', hint: 'классическая' },
  { value: 'dark', label: 'Тёмная', icon: 'moon', hint: 'классическая' },
];

/** Theme menu in the header: "Сумерки" or the classic theme (as in the system / light / dark). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const cur = THEMES.find((t) => t.value === theme)!;
  return (
    <div class="theme" ref={ref}>
      <button type="button" class={`icon-btn theme-btn${open ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open}
        title={`Тема: ${cur.label.toLowerCase()}`} aria-label={`Тема оформления: ${cur.label.toLowerCase()}`} onClick={() => setOpen(!open)}>
        <Icon name={cur.icon} />
      </button>
      {open && (
        <div class="menu theme-menu" role="menu">
          {THEMES.map((t) => (
            <button type="button" role="menuitemradio" aria-checked={t.value === theme} class={`menu-item${t.value === theme ? ' cur' : ''}`}
              onClick={() => { applyTheme(t.value); setTheme(t.value); setOpen(false); }}>
              <Icon name={t.icon} size={18} /> <span>{t.label}{t.hint && <small>{t.hint}</small>}</span>{t.value === theme && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
