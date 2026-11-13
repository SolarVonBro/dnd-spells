// Word-level diff of two HTML fragments that keeps markup intact:
// words missing from the other side are wrapped in <mark class="...">, tags are never split.

type Tok = { t: 'tag' | 'word' | 'space'; s: string; key?: string };

function tokenize(html: string): Tok[] {
  const out: Tok[] = [];
  const re = /(<[^>]+>)|(\s+)|([^\s<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) out.push({ t: 'tag', s: m[1] });
    else if (m[2]) out.push({ t: 'space', s: m[2] });
    else {
      const key = m[3].toLowerCase().replace(/&[a-z]+;|[^\p{L}\p{N}]+/gu, '');
      out.push({ t: 'word', s: m[3], key });
    }
  }
  return out;
}

/** Indices (into the word lists) that are part of the longest common subsequence. */
function lcs(a: string[], b: string[]): [Set<number>, Set<number>] {
  const ka = new Set<number>(), kb = new Set<number>();
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) { ka.add(s); kb.add(s); s++; }
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; ka.add(ea); kb.add(eb); }
  const n = ea - s, m = eb - s;
  if (n && m) {
    const w = m + 1;
    const dp = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = a[s + i] === b[s + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[s + i] === b[s + j]) { ka.add(s + i); kb.add(s + j); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
      else j++;
    }
  }
  return [ka, kb];
}

function render(tokens: Tok[], keep: Set<number>, cls: string): string {
  let out = '', wi = 0, open = false;
  for (const tok of tokens) {
    if (tok.t === 'word') {
      const changed = !keep.has(wi++) && tok.key !== '';
      if (changed && !open) { out += `<mark class="${cls}">`; open = true; }
      if (!changed && open) { out += '</mark>'; open = false; }
      out += tok.s;
    } else if (tok.t === 'tag') {
      if (open) { out += '</mark>'; open = false; }
      out += tok.s;
    } else out += tok.s;
  }
  return open ? `${out}</mark>` : out;
}

/** Returns [left with removed words marked, right with added words marked]. */
export function diffHtml(left: string, right: string): [string, string] {
  const ta = tokenize(left), tb = tokenize(right);
  const wa = ta.filter((t) => t.t === 'word').map((t) => t.key!);
  const wb = tb.filter((t) => t.t === 'word').map((t) => t.key!);
  if (wa.length * wb.length > 6_000_000) return [left, right]; // too large to diff quickly
  const [ka, kb] = lcs(wa, wb);
  return [render(ta, ka, 'd-del'), render(tb, kb, 'd-ins')];
}
