// Color theme: "Сумерки" (mystic, the default), or the classic one - as in the system, light or dark.
// index.html applies the saved choice before the first paint.
export type Theme = 'mystic' | 'auto' | 'light' | 'dark';

const KEY = 'dnd.theme';
/** Browser UI color (phones): the mystic night or the classic red. */
const BAR: Record<Theme, string> = { mystic: '#17161e', auto: '#8f2a2a', light: '#8f2a2a', dark: '#8f2a2a' };

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'auto' || t === 'light' || t === 'dark' ? t : 'mystic';
  } catch {
    return 'mystic';
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
  try {
    if (t === 'mystic') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t);
  } catch { /* the choice is only for this visit */ }
}
