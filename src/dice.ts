// Dice formulas for rolling ability scores: "4d6kh3", "3d6", "2d6+6", "4d6r1kh3", "1d6!"...
// Syntax (also explained on the page): NdM dice, kh/k/kl keep, dl/d/dh drop, r/ro reroll (=, <, >), ! explode, + and - terms.
// Russian "к"/"д" work as "d". Rolls use crypto.getRandomValues (no modulo bias).

export class FormulaError extends Error {}

export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  /** Dice kept after the roll: the n highest or lowest (null: all). */
  keep: { n: number; high: boolean } | null;
  /** Reroll results equal to / at most / at least n: until they stop matching, or only once. */
  reroll: { cmp: '=' | '<' | '>'; n: number; once: boolean } | null;
  /** On the highest face the die is rolled again and added (compound explosion). */
  explode: boolean;
  text: string;
}
export interface NumTerm { kind: 'num'; sign: 1 | -1; value: number; text: string }
export type Term = DiceTerm | NumTerm;

export interface Formula {
  text: string;
  terms: Term[];
  min: number;
  /** Infinity for exploding dice. */
  max: number;
  dice: number;
}

export interface Die {
  v: number;
  dropped: boolean;
  /** Results that were rerolled away (shown crossed out). */
  rerolls: number[];
  /** The die exploded (its value is a sum of several rolls). */
  exploded: boolean;
}
export interface TermRoll { text: string; sign: 1 | -1; dice: Die[] | null; value: number }
export interface Roll { total: number; parts: TermRoll[] }

export type Rng = (sides: number) => number;

/** A fair die roll: 1..sides, from crypto.getRandomValues with rejection of the biased tail. */
export const secureRng: Rng = (sides) => {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / sides) * sides;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return (buf[0] % sides) + 1;
  }
};
const fastRng: Rng = (sides) => 1 + Math.floor(Math.random() * sides);

const MAX_COUNT = 100;
const MAX_SIDES = 1000;
const MAX_DICE = 200;

const matches = (r: NonNullable<DiceTerm['reroll']>, v: number) => (r.cmp === '=' ? v === r.n : r.cmp === '<' ? v <= r.n : v >= r.n);

/** Faces a die can end on (after rerolls that repeat until the result stops matching). */
function finalFaces(t: DiceTerm): [number, number] {
  if (!t.reroll || t.reroll.once) return [1, t.sides];
  let lo = 0, hi = 0;
  for (let v = 1; v <= t.sides; v++) if (!matches(t.reroll, v)) { if (!lo) lo = v; hi = v; }
  return [lo, hi];
}

export function parseFormula(input: string): Formula {
  const src = input.toLowerCase().replace(/[кд]/g, 'd').replace(/[−–—]/g, '-').replace(/\s+/g, '');
  if (!src) throw new FormulaError('Формула пустая.');
  if (/[^0-9d%khlro<>=!+-]/.test(src)) {
    const bad = src.match(/[^0-9d%khlro<>=!+-]/)![0];
    throw new FormulaError(`Непонятный символ «${bad}». Можно использовать числа, d (или к), kh, kl, dh, dl, r, ro, <, >, !, + и −.`);
  }
  let i = 0;
  const terms: Term[] = [];
  const num = (): number | null => {
    const m = /^\d+/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  let sign: 1 | -1 = 1;
  if (src[0] === '+' || src[0] === '-') { sign = src[0] === '-' ? -1 : 1; i = 1; }
  for (;;) {
    const start = i;
    const n = num();
    if (src[i] === 'd') {
      i++;
      let sides: number | null;
      if (src[i] === '%') { i++; sides = 100; } else sides = num();
      if (sides == null) throw new FormulaError('После «d» нужно число граней: например, 4d6.');
      const count = n ?? 1;
      if (count < 1 || count > MAX_COUNT) throw new FormulaError(`Число костей — от 1 до ${MAX_COUNT}.`);
      if (sides < 2 || sides > MAX_SIDES) throw new FormulaError(`У кости должно быть от 2 до ${MAX_SIDES} граней.`);
      const t: DiceTerm = { kind: 'dice', sign, count, sides, keep: null, reroll: null, explode: false, text: '' };
      for (;;) {
        const rest = src.slice(i);
        let m: RegExpExecArray | null;
        if ((m = /^(kh|kl|k|dh|dl|d)(\d+)?/.exec(rest))) {
          if (m[2] == null) throw new FormulaError(`После «${m[1]}» нужно число: например, 4d6${m[1]}${m[1].startsWith('k') ? 3 : 1}.`);
          if (t.keep) throw new FormulaError('У одной группы костей может быть только одно правило «оставить» или «отбросить».');
          const k = Number(m[2]);
          const keep = m[1].startsWith('k') ? k : count - k;
          if (keep < 1 || keep > count) {
            throw new FormulaError(m[1].startsWith('k')
              ? `Оставить можно от 1 до ${count} костей из ${count}.`
              : `Отбросить можно от 0 до ${count - 1} костей из ${count}.`);
          }
          const high = m[1] === 'kh' || m[1] === 'k' || m[1] === 'dl' || m[1] === 'd';
          t.keep = { n: keep, high };
          i += m[0].length;
        } else if ((m = /^(ro|r)([<>=]?)(\d+)?/.exec(rest))) {
          if (m[3] == null) throw new FormulaError(`После «${m[1]}${m[2]}» нужно число: например, 4d6${m[1]}1.`);
          if (t.reroll) throw new FormulaError('У одной группы костей может быть только одно правило переброса.');
          t.reroll = { cmp: (m[2] || '=') as '=' | '<' | '>', n: Number(m[3]), once: m[1] === 'ro' };
          i += m[0].length;
          const [lo] = finalFaces(t);
          if (!t.reroll.once && !lo) throw new FormulaError('Правило переброса затрагивает все грани — бросок никогда не закончится.');
        } else if (rest[0] === '!') {
          if (t.explode) throw new FormulaError('Знак «!» указан дважды.');
          t.explode = true;
          i++;
        } else break;
      }
      t.text = src.slice(start, i);
      terms.push(t);
    } else if (n != null) {
      terms.push({ kind: 'num', sign, value: n, text: String(n) });
    } else {
      const c = src[i];
      throw new FormulaError(c == null ? 'Формула обрывается — после знака нужно число или кости.' : `Неожиданный символ «${c}»: здесь должно быть число или кости (например, 4d6).`);
    }
    if (i >= src.length) break;
    const op = src[i];
    if (op === '+' || op === '-') {
      sign = op === '-' ? -1 : 1;
      i++;
      if (i >= src.length) throw new FormulaError('Формула обрывается на знаке — после него нужно число или кости.');
      continue;
    }
    throw new FormulaError(`Неожиданный символ «${op}» — правила костей пишутся сразу после них (4d6kh3), а части формулы соединяются знаками + и −.`);
  }
  const dice = terms.reduce((s, t) => s + (t.kind === 'dice' ? t.count : 0), 0);
  if (dice > MAX_DICE) throw new FormulaError(`Слишком много костей: не больше ${MAX_DICE} в одной формуле.`);
  let min = 0, max = 0;
  for (const t of terms) {
    let lo: number, hi: number;
    if (t.kind === 'num') { lo = hi = t.value; } else {
      const [fl, fh] = finalFaces(t);
      const k = t.keep ? t.keep.n : t.count;
      lo = k * fl;
      hi = t.explode ? Infinity : k * fh;
    }
    if (t.sign > 0) { min += lo; max += hi; } else { min -= hi; max -= lo; }
  }
  return { text: terms.map((t, j) => `${j === 0 ? (t.sign < 0 ? '-' : '') : t.sign < 0 ? ' - ' : ' + '}${t.text}`).join(''), terms, min, max, dice };
}

function rollDie(t: DiceTerm, rng: Rng): Die {
  let v = rng(t.sides);
  const rerolls: number[] = [];
  if (t.reroll) {
    if (t.reroll.once) {
      if (matches(t.reroll, v)) { rerolls.push(v); v = rng(t.sides); }
    } else {
      for (let g = 0; matches(t.reroll, v) && g < 10000; g++) { if (rerolls.length < 30) rerolls.push(v); v = rng(t.sides); }
    }
  }
  let exploded = false;
  if (t.explode) {
    let last = v;
    for (let g = 0; last === t.sides && g < 100; g++) { last = rng(t.sides); v += last; exploded = true; }
  }
  return { v, dropped: false, rerolls, exploded };
}

export function rollFormula(f: Formula, rng: Rng = secureRng): Roll {
  const parts: TermRoll[] = f.terms.map((t) => {
    if (t.kind === 'num') return { text: t.text, sign: t.sign, dice: null, value: t.sign * t.value };
    const dice = Array.from({ length: t.count }, () => rollDie(t, rng));
    if (t.keep && t.keep.n < t.count) {
      // Drop the lowest (keep high) or the highest (keep low); among equal values the later dice are dropped.
      const order = dice.map((d, idx) => idx).sort((a, b) => (t.keep!.high ? dice[a].v - dice[b].v : dice[b].v - dice[a].v) || b - a);
      for (const idx of order.slice(0, t.count - t.keep.n)) dice[idx].dropped = true;
    }
    const sum = dice.reduce((s, d) => s + (d.dropped ? 0 : d.v), 0);
    return { text: t.text, sign: t.sign, dice, value: t.sign * sum };
  });
  return { total: parts.reduce((s, p) => s + p.value, 0), parts };
}

/** Average of the formula, estimated by simulation (exact enough for a hint). */
export function averageOf(f: Formula): number {
  const n = Math.max(2000, Math.min(20000, Math.floor(400000 / Math.max(1, f.dice))));
  let sum = 0;
  for (let k = 0; k < n; k++) sum += rollFormula(f, fastRng).total;
  return sum / n;
}
