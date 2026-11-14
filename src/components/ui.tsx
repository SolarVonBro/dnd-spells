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
  person: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5Z',
  trash: 'M7 21a2 2 0 0 1-2-2V7H4V5h5V4h6v1h5v2h-1v12a2 2 0 0 1-2 2H7Zm10-14H7v12h10V7ZM9 17h2V9H9v8Zm4 0h2V9h-2v8Z',
};

export const Icon = ({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d={ICONS[name]} /></svg>
);

const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'auto', label: 'Как в системе', icon: 'contrast' },
  { value: 'light', label: 'Светлая', icon: 'sun' },
  { value: 'dark', label: 'Тёмная', icon: 'moon' },
];

/** Theme menu in the header: as in the system / light / dark. */
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
              <Icon name={t.icon} size={18} /> <span>{t.label}</span>{t.value === theme && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
