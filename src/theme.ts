// Color theme: as in the system (default), light or dark. index.html applies the saved choice before the first paint.
export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'dnd.theme';

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try {
    if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t);
  } catch { /* the choice is only for this visit */ }
}
