import type { ComponentChildren } from 'preact';
import type { Tri } from '../types';

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
};

export const Icon = ({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d={ICONS[name]} /></svg>
);
