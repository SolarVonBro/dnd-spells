// Editors of a character created on the site (no Foundry file) and the portrait of any character.
import { useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Dataset, Version } from '../types';
import { stubActor, updateCharacter, type Character } from '../characters';
import { ABS, asiLevels, classRules, normalizeManual, type Ab, type FeatureGroup, type ManualData } from '../manualdata';
import { FEATURE_GROUPS, hitDie } from '../manual';
import { ABILITY, SKILL_DEFS, abilityMod, signed } from '../sheet';
import { classLabel, plural } from '../listview';
import { LL_PREFIX, laserllamaClasses, norm, officialClasses } from '../model';
import { onClassList } from '../casting';
import { useLists } from '../lists';
import { ABIL, active, finalScores, normalize as normalizeStats, scoresLine, useStatSets } from '../stats';
import { newId } from '../userstore';
import { levelLabel } from '../i18n';
import { Icon, Segmented } from './ui';

const int = (s: string, lo: number, hi: number, d: number) => {
  const v = Math.round(Number(s));
  return s.trim() !== '' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};

/** Update the site-made data of a character (and the small stub the character cards read). */
export function useManual(data: Dataset, ch: Character) {
  const m = normalizeManual(ch.manual);
  const set = (patch: Partial<ManualData>) => {
    const next = { ...m, ...patch };
    updateCharacter(ch.id, { manual: next, actor: stubActor(ch.name, next.classes.map((c) => ({ name: classLabel(data, c.cls), level: c.level })), next.race) });
  };
  return { m, set };
}

/** A notice for what the site can't fill in yet. */
export const NotYet = ({ children }: { children: ComponentChildren }) => (
  <p class="notyet"><Icon name="info" size={16} /><span>{children}</span></p>
);

/* ---------------- portrait ---------------- */

async function shrinkPhoto(file: File, max = 640): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    let q = 0.86;
    let out = cv.toDataURL('image/jpeg', q);
    while (out.length > 350_000 && q > 0.5) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Portrait({ ch }: { ch: Character }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div class="portrait">
      <button type="button" class={`portrait-img${ch.photo ? '' : ' empty'}`} title={ch.photo ? 'Заменить фото' : 'Загрузить фото'} onClick={() => ref.current?.click()}>
        {ch.photo ? <img src={ch.photo} alt={`Портрет: ${ch.name}`} /> : <><Icon name="person" size={34} /><span>Фото</span></>}
      </button>
      <div class="portrait-actions">
        <button type="button" class="link" onClick={() => ref.current?.click()}>{ch.photo ? 'заменить' : 'загрузить фото'}</button>
        {ch.photo && <button type="button" class="link" onClick={() => { if (confirm('Убрать фото?')) updateCharacter(ch.id, { photo: undefined }); }}>убрать</button>}
      </div>
      {msg && <p class="hint warn" role="alert">{msg}</p>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => {
        const input = e.target as HTMLInputElement;
        const f = input.files?.[0];
        input.value = '';
        if (!f) return;
        if (!f.type.startsWith('image/')) { setMsg('Это не картинка.'); return; }
        try {
          updateCharacter(ch.id, { photo: await shrinkPhoto(f) });
          setMsg(null);
        } catch {
          setMsg('Не удалось прочитать картинку — попробуйте JPEG или PNG.');
        }
      }} />
    </div>
  );
}

/* ---------------- classes ---------------- */

export function ClassEditor({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  const name = (code: string) => data.classes.find((c) => c.code === code)?.ru ?? code;
  const byRu = (a: string, b: string) => name(a).localeCompare(name(b), 'ru');
  const official = [...officialClasses(data)].sort(byRu);
  const llClasses = [...new Set([...laserllamaClasses(data), ...(data.llClassLists ?? []).map((l) => l.class)])].sort(byRu);
  const used = new Set(m.classes.map((c) => c.cls));
  const total = m.classes.reduce((n, c) => n + c.level, 0);
  const setClass = (i: number, patch: Partial<ManualData['classes'][number]>) => set({ classes: m.classes.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = () => {
    const pick = ['Wizard', 'Cleric', 'Fighter', 'Rogue', 'Druid', 'Bard', ...official].find((c) => !used.has(c));
    if (pick) set({ classes: [...m.classes, { cls: pick, level: 1, sub: null, hd: null }] });
  };
  const first = m.classes[0];
  const r = first ? classRules(first.cls) : null;
  return (
    <div class="classes-edit">
      {m.classes.map((c, i) => {
        const isLl = c.cls.startsWith(LL_PREFIX);
        const subs = isLl ? [] : data.subclasses.filter((s) => s.class === c.cls);
        const known = classRules(c.cls);
        const asi = asiLevels(c.cls).filter((l) => l <= c.level);
        return (
          <div class="crow" key={i}>
            <select aria-label="Класс" value={c.cls} onChange={(e) => setClass(i, { cls: (e.target as HTMLSelectElement).value, sub: null, hd: null })}>
              <optgroup label="D&D 5e">
                {official.map((code) => <option value={code} disabled={code !== c.cls && used.has(code)}>{name(code)}</option>)}
              </optgroup>
              <optgroup label="Laserllama">
                {llClasses.map((code) => <option value={LL_PREFIX + code} disabled={LL_PREFIX + code !== c.cls && used.has(LL_PREFIX + code)}>{name(code)} (Laserllama)</option>)}
              </optgroup>
            </select>
            {subs.length > 0 && (
              <select aria-label="Подкласс" value={c.sub ?? ''} onChange={(e) => setClass(i, { sub: (e.target as HTMLSelectElement).value || null })}>
                <option value="">Подкласс не выбран</option>
                {subs.map((s) => <option value={s.id}>{s.ru ?? s.en}</option>)}
              </select>
            )}
            <label class="num"><span>Уровень</span>
              <input type="number" inputMode="numeric" min={1} max={20} value={c.level}
                onChange={(e) => setClass(i, { level: int((e.target as HTMLInputElement).value, 1, 20, c.level) })} />
            </label>
            <label class="num" title="Кость хитов класса"><span>Кость хитов</span>
              <select value={String(hitDie(c))} onChange={(e) => {
                const v = Number((e.target as HTMLSelectElement).value);
                setClass(i, { hd: known && v === known.hd ? null : v });
              }}>
                {[6, 8, 10, 12].map((n) => <option value={n}>к{n}</option>)}
              </select>
            </label>
            <button type="button" class="icon-btn" aria-label="Убрать класс" title="Убрать класс" onClick={() => set({ classes: m.classes.filter((_, j) => j !== i) })}><Icon name="close" size={18} /></button>
            {!known && <p class="hint warn">Правил этого класса на сайте нет: проверьте кость хитов, отметьте спасброски у характеристик и впишите владения.</p>}
            {asi.length > 0 && <p class="hint">Увеличение характеристик на {asi.join(', ')} уровне — {asi.length === 1 ? 'не забудьте учесть его' : 'не забудьте учесть их'} в характеристиках (или в наборе калькулятора).</p>}
          </div>
        );
      })}
      <button type="button" class="btn" onClick={add}><Icon name="plus" size={18} /> {m.classes.length ? 'Добавить класс (мультикласс)' : 'Выбрать класс'}</button>
      {total > 20 && <p class="hint warn">Сумма уровней классов больше 20.</p>}
      {r && (
        <p class="hint">
          Первый класс даёт спасброски ({r.saves.map((a) => ABILITY[a].name).join(', ')}) и все его владения; следующие классы — только владения
          мультикласса («Книга игрока», с. 164).
          {' '}Навыки класса: {r.skills.from === 'any' ? `любые ${r.skills.n}` : `${r.skills.n} из: ${r.skills.from.map((k) => SKILL_DEFS.find((d) => d.key === k)?.name).join(', ')}`} —
          отметьте их кружками в блоке «Навыки».
        </p>
      )}
    </div>
  );
}

/* ---------------- ability scores (from the calculator's sets) ---------------- */

export function AbilityEditor({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  const sets = useStatSets();
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const mine = (s: typeof sets[number]) => norm(s.data.character ?? '') === norm(ch.name);
  const sorted = [...sets].sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.updated - a.updated);
  const saves = new Set(m.saves ?? (m.classes[0] ? classRules(m.classes[0].cls)?.saves ?? [] : []));
  const level = Math.max(1, Math.min(20, m.classes.reduce((n, c) => n + c.level, 0)));
  const prof = Math.floor((level + 7) / 4);
  const apply = () => {
    const s = sets.find((x) => x.id === pick);
    if (!s) return;
    const d = normalizeStats(s.data);
    const fin = finalScores(d);
    if (ABS.some((a) => fin[a] == null)) { setMsg('В этом наборе определены не все значения — откройте его в калькуляторе.'); return; }
    const title = d.name.trim() || 'набор без названия';
    set({
      abilities: Object.fromEntries(ABS.map((a) => [a, fin[a]!])) as Record<Ab, number>,
      extra: { san: active(d).includes('san') ? fin.san : null, hon: active(d).includes('hon') ? fin.hon : null },
      statSet: { id: s.id, title: `${title}${d.character ? ` (${d.character})` : ''}` },
    });
    setMsg(`Значения взяты из набора «${title}».`);
  };
  const toggleSave = (a: Ab) => {
    const next = new Set(saves);
    if (next.has(a)) next.delete(a); else next.add(a);
    const base = m.classes[0] ? classRules(m.classes[0].cls)?.saves ?? [] : [];
    const same = base.length === next.size && base.every((x) => next.has(x));
    set({ saves: same ? null : ABS.filter((x) => next.has(x)) });
  };
  return (
    <div class="abil-edit">
      <div class="statset-pick">
        <select aria-label="Набор характеристик" value={pick} onChange={(e) => setPick((e.target as HTMLSelectElement).value)}>
          <option value="">{sets.length ? 'Выберите набор из калькулятора…' : 'Сохранённых наборов пока нет'}</option>
          {sorted.map((s) => {
            const d = normalizeStats(s.data);
            return <option value={s.id}>{d.character || 'Без персонажа'} — {d.name || 'без названия'}: {scoresLine(d) ?? 'не все значения'}</option>;
          })}
        </select>
        <button type="button" class="btn" disabled={!pick} onClick={apply}><Icon name="dice" size={18} /> Взять значения</button>
        <a class="link" href="#/@stats">открыть калькулятор</a>
      </div>
      {msg && <p class="hint" role="status">{msg}</p>}
      {m.statSet && <p class="hint">Сейчас: из набора «{m.statSet.title}». Значения можно поправить вручную.</p>}
      <div class="abil-inputs">
        {ABS.map((a) => (
          <label class="abil-in" key={a}>
            <span>{ABILITY[a].name}</span>
            <input type="number" inputMode="numeric" min={1} max={30} value={m.abilities[a]}
              onChange={(e) => set({ abilities: { ...m.abilities, [a]: int((e.target as HTMLInputElement).value, 1, 30, m.abilities[a]) } })} />
            <b>{signed(abilityMod(m.abilities[a]))}</b>
            <button type="button" class={`save-tg${saves.has(a) ? ' on' : ''}`} aria-pressed={saves.has(a)} title="Владение спасброском — нажмите, чтобы изменить"
              onClick={() => toggleSave(a)}>спасбр. {signed(abilityMod(m.abilities[a]) + (saves.has(a) ? prof : 0))}</button>
          </label>
        ))}
      </div>
      {(m.extra.san != null || m.extra.hon != null) && (
        <p class="hint">Дополнительные характеристики из набора: {[m.extra.san != null && `${ABIL.san.name} ${m.extra.san}`, m.extra.hon != null && `${ABIL.hon.name} ${m.extra.hon}`].filter(Boolean).join(', ')}
          {' '}— на листе они в разделе умений. <button type="button" class="link" onClick={() => set({ extra: { san: null, hon: null } })}>убрать</button></p>
      )}
    </div>
  );
}

/* ---------------- combat: hit points, armor class, speed ---------------- */

export function CombatEditor({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  return (
    <div class="medit">
      <div class="mgrid">
        <div class="mfield wide"><span>Хиты</span>
          <Segmented small label="Как считать хиты" value={m.hp.mode} onChange={(v) => set({ hp: { ...m.hp, mode: v } })}
            options={[{ value: 'avg', label: 'Среднее', title: 'На 1 уровне максимум кости, дальше среднее (как в «Книге игрока»)' },
              { value: 'max', label: 'Максимум', title: 'Максимум кости на каждом уровне' }, { value: 'manual', label: 'Своё', title: 'Значение, которое выпало на костях' }]} />
        </div>
        {m.hp.mode === 'manual' && (
          <label class="mfield"><span>Максимум хитов</span>
            <input type="number" inputMode="numeric" min={1} max={999} value={m.hp.manual ?? ''} placeholder="—"
              onChange={(e) => set({ hp: { ...m.hp, manual: int((e.target as HTMLInputElement).value, 1, 999, m.hp.manual ?? 1) } })} />
          </label>
        )}
        <label class="mfield" title="Например, холмовой дварф +1, черта «Крепкий» +2"><span>Доп. хиты за уровень</span>
          <input type="number" inputMode="numeric" min={0} max={10} value={m.hp.perLevel}
            onChange={(e) => set({ hp: { ...m.hp, perLevel: int((e.target as HTMLInputElement).value, 0, 10, 0) } })} />
        </label>
      </div>
      <div class="mgrid">
        <div class="mfield wide"><span>Класс доспеха</span>
          <Segmented small label="Класс доспеха" value={m.ac.mode} onChange={(v) => set({ ac: { ...m.ac, mode: v } })}
            options={[{ value: 'auto', label: 'Без доспехов', title: '10 + ЛОВ, защита без доспехов варвара или монаха, драконья устойчивость' },
              { value: 'armor', label: 'Доспех' }, { value: 'manual', label: 'Своё значение' }]} />
        </div>
        {m.ac.mode === 'armor' && <>
          <label class="mfield"><span>Доспех</span>
            <input type="text" maxLength={40} placeholder="например, кольчуга" value={m.ac.armorName} onChange={(e) => set({ ac: { ...m.ac, armorName: (e.target as HTMLInputElement).value } })} />
          </label>
          <label class="mfield"><span>Тип</span>
            <select value={m.ac.armorType} onChange={(e) => set({ ac: { ...m.ac, armorType: (e.target as HTMLSelectElement).value as ManualData['ac']['armorType'] } })}>
              <option value="light">лёгкий (+ ЛОВ)</option><option value="medium">средний (+ ЛОВ, макс. 2)</option><option value="heavy">тяжёлый (без ЛОВ)</option>
            </select>
          </label>
          <label class="mfield"><span>КД доспеха</span>
            <input type="number" inputMode="numeric" min={10} max={20} value={m.ac.armorBase} onChange={(e) => set({ ac: { ...m.ac, armorBase: int((e.target as HTMLInputElement).value, 10, 20, 11) } })} />
          </label>
        </>}
        {m.ac.mode === 'manual' && (
          <label class="mfield"><span>КД</span>
            <input type="number" inputMode="numeric" min={1} max={40} value={m.ac.manual ?? ''} placeholder="—" onChange={(e) => set({ ac: { ...m.ac, manual: int((e.target as HTMLInputElement).value, 1, 40, 10) } })} />
          </label>
        )}
        {m.ac.mode !== 'manual' && <>
          <label class="check mcheck"><input type="checkbox" checked={m.ac.shield} onChange={(e) => set({ ac: { ...m.ac, shield: (e.target as HTMLInputElement).checked } })} /> <span>Щит (+2)</span></label>
          <label class="mfield" title="Магические доспехи, кольцо защиты, стиль боя «Оборона»…"><span>Доп. бонус к КД</span>
            <input type="number" inputMode="numeric" min={-5} max={10} value={m.ac.bonus} onChange={(e) => set({ ac: { ...m.ac, bonus: int((e.target as HTMLInputElement).value, -5, 10, 0) } })} />
          </label>
        </>}
      </div>
      <div class="mgrid">
        <label class="mfield"><span>Скорость, фт.</span>
          <input type="number" inputMode="numeric" min={0} max={120} step={5} value={m.speed} onChange={(e) => set({ speed: int((e.target as HTMLInputElement).value, 0, 120, 30) })} />
        </label>
        <label class="mfield"><span>Размер</span>
          <select value={m.size} onChange={(e) => set({ size: (e.target as HTMLSelectElement).value as ManualData['size'] })}>
            <option value="sm">Маленький</option><option value="med">Средний</option><option value="lg">Большой</option><option value="tiny">Крошечный</option>
          </select>
        </label>
        <label class="mfield"><span>Тёмное зрение, фт.</span>
          <input type="number" inputMode="numeric" min={0} max={300} step={30} value={m.darkvision} onChange={(e) => set({ darkvision: int((e.target as HTMLInputElement).value, 0, 300, 0) })} />
        </label>
        <label class="mfield"><span>Опыт</span>
          <input type="number" inputMode="numeric" min={0} max={999999} value={m.xp} onChange={(e) => set({ xp: int((e.target as HTMLInputElement).value, 0, 999999, 0) })} />
        </label>
      </div>
    </div>
  );
}

/* ---------------- race, background, proficiencies (typed in) ---------------- */

const TextField = ({ label, value, onSet, wide, placeholder, max = 120 }: { label: string; value: string; onSet: (v: string) => void; wide?: boolean; placeholder?: string; max?: number }) => (
  <label class={`mfield${wide ? ' wide' : ''}`}><span>{label}</span>
    <input type="text" maxLength={max} value={value} placeholder={placeholder} onChange={(e) => onSet((e.target as HTMLInputElement).value)} />
  </label>
);

export function OriginEditor({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  return (
    <div class="medit">
      <NotYet>Выбор рас и предысторий на сайт <b>пока не добавлен</b>. Впишите их сами — всё попадёт в PDF; пустые поля останутся на листе для записи от руки.
        Скорость, тёмное зрение и прибавки к характеристикам расы учтите выше.</NotYet>
      <div class="mgrid">
        <TextField label="Раса" value={m.race} placeholder="например, лесной эльф" onSet={(v) => set({ race: v })} />
        <TextField label="Предыстория" value={m.background} placeholder="например, мудрец" onSet={(v) => set({ background: v })} />
        <TextField label="Языки (через запятую)" value={m.languages} wide onSet={(v) => set({ languages: v })} />
        <TextField label="Инструменты (кроме данных классом)" value={m.tools} wide placeholder="например, набор каллиграфа" onSet={(v) => set({ tools: v })} />
        <TextField label="Доп. владение доспехами" value={m.armorExtra} placeholder="от расы, черт" onSet={(v) => set({ armorExtra: v })} />
        <TextField label="Доп. владение оружием" value={m.weaponExtra} placeholder="например, длинные луки" onSet={(v) => set({ weaponExtra: v })} />
        <TextField label="Сопротивления и иммунитеты" value={m.defenses} wide placeholder="например, яд (сопротивление)" onSet={(v) => set({ defenses: v })} />
      </div>
      <div class="mgrid looks">
        {([['age', 'Возраст'], ['height', 'Рост'], ['weight', 'Вес'], ['eyes', 'Глаза'], ['skin', 'Кожа'], ['hair', 'Волосы']] as const).map(([k, label]) => (
          <TextField key={k} label={label} value={m.looks[k]} max={40} onSet={(v) => set({ looks: { ...m.looks, [k]: v } })} />
        ))}
      </div>
    </div>
  );
}

/* ---------------- weapons ---------------- */

export function WeaponEditor({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  const change = (id: string, patch: Partial<ManualData['weapons'][number]>) => set({ weapons: m.weapons.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  return (
    <div class="medit">
      <NotYet>Оружия и снаряжения на сайте <b>пока нет</b> — впишите своё: сайт посчитает бонус атаки и урон по характеристике и бонусу мастерства.</NotYet>
      {m.weapons.map((w) => (
        <div class="mrow weapon" key={w.id}>
          <input type="text" maxLength={40} placeholder="Оружие" aria-label="Оружие" value={w.name} onChange={(e) => change(w.id, { name: (e.target as HTMLInputElement).value })} />
          <select aria-label="Характеристика атаки" value={w.ability} onChange={(e) => change(w.id, { ability: (e.target as HTMLSelectElement).value as Ab | 'fin' })}>
            <option value="str">СИЛ</option><option value="dex">ЛОВ</option><option value="fin">СИЛ или ЛОВ (фехтовальное)</option>
            <option value="int">ИНТ</option><option value="wis">МДР</option><option value="cha">ХАР</option>
          </select>
          <input type="text" maxLength={16} placeholder="1к8" aria-label="Кости урона" value={w.dice} onChange={(e) => change(w.id, { dice: (e.target as HTMLInputElement).value })} />
          <input type="text" maxLength={24} placeholder="рубящий" aria-label="Вид урона" value={w.type} onChange={(e) => change(w.id, { type: (e.target as HTMLInputElement).value })} />
          <label class="mini" title="Магический бонус (+1, +2…)"><span>+маг.</span>
            <input type="number" min={0} max={5} value={w.magic} onChange={(e) => change(w.id, { magic: int((e.target as HTMLInputElement).value, 0, 5, 0) })} />
          </label>
          <label class="check mcheck"><input type="checkbox" checked={w.prof} onChange={(e) => change(w.id, { prof: (e.target as HTMLInputElement).checked })} /> <span>владение</span></label>
          <input type="text" class="wnotes" maxLength={60} placeholder="заметки: дистанция, свойства" aria-label="Заметки" value={w.notes} onChange={(e) => change(w.id, { notes: (e.target as HTMLInputElement).value })} />
          <button type="button" class="icon-btn" aria-label="Убрать оружие" onClick={() => set({ weapons: m.weapons.filter((x) => x.id !== w.id) })}><Icon name="close" size={18} /></button>
        </div>
      ))}
      <button type="button" class="btn small" onClick={() => set({ weapons: [...m.weapons, { id: newId(), name: '', ability: 'str', prof: true, dice: '', type: '', magic: 0, notes: '' }] })}>
        <Icon name="plus" size={16} /> Добавить оружие
      </button>
    </div>
  );
}

/* ---------------- features ---------------- */

export function FeatureEditor({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  const change = (id: string, patch: Partial<ManualData['features'][number]>) => set({ features: m.features.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const add = (group: FeatureGroup) => set({ features: [...m.features, { id: newId(), group, name: '', text: '', uses: 0, per: '' }] });
  return (
    <div class="medit">
      <NotYet>Умения рас, классов и предысторий, а также черты на сайт <b>пока не добавлены</b> — впишите нужные (название и, если хотите, текст).
        Умения с ограниченным числом использований получат на листе клетки для отметок.</NotYet>
      {m.features.map((f) => (
        <div class="mrow feature" key={f.id}>
          <div class="mrow-line">
            <select aria-label="Откуда умение" value={f.group} onChange={(e) => change(f.id, { group: (e.target as HTMLSelectElement).value as FeatureGroup })}>
              {FEATURE_GROUPS.map((g) => <option value={g.id}>{g.label}</option>)}
            </select>
            <input type="text" maxLength={80} placeholder="Название умения" aria-label="Название умения" value={f.name} onChange={(e) => change(f.id, { name: (e.target as HTMLInputElement).value })} />
            <label class="mini" title="Сколько раз можно использовать (0 — без ограничений)"><span>исп.</span>
              <input type="number" min={0} max={20} value={f.uses} onChange={(e) => change(f.id, { uses: int((e.target as HTMLInputElement).value, 0, 20, 0) })} />
            </label>
            {f.uses > 0 && (
              <select aria-label="Восстановление" value={f.per} onChange={(e) => change(f.id, { per: (e.target as HTMLSelectElement).value })}>
                <option value="короткий отдых">короткий отдых</option><option value="продолжительный отдых">продолжительный отдых</option>
                <option value="рассвет">рассвет</option><option value="">—</option>
              </select>
            )}
            <button type="button" class="icon-btn" aria-label="Убрать умение" onClick={() => set({ features: m.features.filter((x) => x.id !== f.id) })}><Icon name="close" size={18} /></button>
          </div>
          <textarea rows={2} maxLength={4000} placeholder="Текст умения (необязательно)" aria-label="Текст умения" value={f.text}
            onChange={(e) => change(f.id, { text: (e.target as HTMLTextAreaElement).value })} />
        </div>
      ))}
      <div class="btn-row">
        {FEATURE_GROUPS.map((g) => <button type="button" class="btn small" onClick={() => add(g.id)}><Icon name="plus" size={16} /> {g.label}</button>)}
      </div>
    </div>
  );
}

/* ---------------- equipment ---------------- */

export function ItemEditor({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  const change = (id: string, patch: Partial<ManualData['items'][number]>) => set({ items: m.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const coins = [['pp', 'пм'], ['gp', 'зм'], ['ep', 'эм'], ['sp', 'см'], ['cp', 'мм']] as const;
  return (
    <div class="medit">
      <div class="coins-edit">
        {coins.map(([k, label]) => (
          <label class="mini"><span>{label}</span>
            <input type="number" min={0} max={999999} value={m.coins[k]} onChange={(e) => set({ coins: { ...m.coins, [k]: int((e.target as HTMLInputElement).value, 0, 999999, 0) } })} />
          </label>
        ))}
      </div>
      {m.items.map((x) => (
        <div class="mrow item" key={x.id}>
          <input type="text" maxLength={60} placeholder="Предмет" aria-label="Предмет" value={x.name} onChange={(e) => change(x.id, { name: (e.target as HTMLInputElement).value })} />
          <label class="mini"><span>шт.</span>
            <input type="number" min={1} max={9999} value={x.qty} onChange={(e) => change(x.id, { qty: int((e.target as HTMLInputElement).value, 1, 9999, 1) })} />
          </label>
          <label class="mini"><span>фнт.</span>
            <input type="number" min={0} max={9999} step="0.1" value={x.weight} onChange={(e) => change(x.id, { weight: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
          </label>
          <input type="text" class="wnotes" maxLength={60} placeholder="заметки" aria-label="Заметки" value={x.notes} onChange={(e) => change(x.id, { notes: (e.target as HTMLInputElement).value })} />
          <button type="button" class="icon-btn" aria-label="Убрать предмет" onClick={() => set({ items: m.items.filter((y) => y.id !== x.id) })}><Icon name="close" size={18} /></button>
        </div>
      ))}
      <button type="button" class="btn small" onClick={() => set({ items: [...m.items, { id: newId(), name: '', qty: 1, weight: 0, notes: '' }] })}>
        <Icon name="plus" size={16} /> Добавить предмет
      </button>
    </div>
  );
}

/* ---------------- spells from the site ---------------- */

export function SpellAdder({ data, ch }: { data: Dataset; ch: Character }) {
  const { m, set } = useManual(data, ch);
  const lists = useLists();
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(true);
  const [listId, setListId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const has = (v: Version) => m.spells.some((s) => s.id === v.group && s.v === (v.homebrew ? 'l' : 'o'));
  const cls = m.classes.map((c) => ({ cls: c.cls, level: c.level, sub: c.sub, mod: null }));
  const found = useMemo(() => {
    const n = norm(q);
    if (n.length < 2) return [];
    return data.spells
      .filter((v) => norm(v.name.en).includes(n) || norm(v.name.ru ?? '').includes(n))
      .filter((v) => !mineOnly || !cls.length || cls.some((c) => onClassList(data, v, c)))
      .sort((a, b) => a.level - b.level || (a.name.ru ?? a.name.en).localeCompare(b.name.ru ?? b.name.en, 'ru'))
      .slice(0, 12);
  }, [q, mineOnly, data, m.classes]);
  const add = (v: Version) => set({ spells: [...m.spells, { id: v.group, v: v.homebrew ? 'l' : 'o' }] });
  const fromList = () => {
    const b = lists.find((x) => x.id === listId);
    if (!b) return;
    const spells = [...m.spells];
    let n = 0;
    for (const e of b.spells) if (!spells.some((s) => s.id === e.id && s.v === e.v)) { spells.push({ id: e.id, v: e.v }); n++; }
    const takeClasses = !m.classes.length && b.classes.length > 0;
    set({ spells, ...(takeClasses ? { classes: b.classes.map((c) => ({ cls: c.cls, level: c.level, sub: c.sub, hd: null })) } : {}) });
    setMsg(`Добавлено ${n} ${plural(n, 'заклинание', 'заклинания', 'заклинаний')} из «${b.name || 'Без названия'}»${takeClasses ? ', классы взяты из списка' : ''}.`);
  };
  return (
    <div class="medit spell-add">
      <div class="statset-pick">
        <select aria-label="Список заклинаний" value={listId} onChange={(e) => setListId((e.target as HTMLSelectElement).value)}>
          <option value="">{lists.length ? 'Из списка заклинаний…' : 'Списков заклинаний пока нет'}</option>
          {lists.map((b) => <option value={b.id}>{b.name || 'Без названия'} ({b.spells.length})</option>)}
        </select>
        <button type="button" class="btn" disabled={!listId} onClick={fromList}><Icon name="book" size={18} /> Добавить из списка</button>
      </div>
      {msg && <p class="hint" role="status">{msg}</p>}
      <div class="search spell-search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Найти заклинание (EN / RU)" aria-label="Найти заклинание" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      {cls.length > 0 && (
        <label class="check"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly((e.target as HTMLInputElement).checked)} /> <span>Только из списков классов персонажа</span></label>
      )}
      {found.length > 0 && (
        <ul class="found">
          {found.map((v) => {
            const on = has(v);
            return (
              <li key={v.id}>
                <button type="button" class={`found-row${on ? ' on' : ''}`} disabled={on} onClick={() => add(v)}>
                  <span class={`lvl lvl-${v.level}`} aria-hidden="true">{v.level}</span>
                  <span class="row-main"><span class="row-name">{v.name.ru ?? v.name.en}{v.name.ru && <span class="row-other">{v.name.en}</span>}</span>
                    <span class="row-meta">{levelLabel(v.level)}{v.homebrew ? ' · Laserllama' : ''}</span></span>
                  <span class="found-act">{on ? <><Icon name="check" size={16} /> есть</> : <><Icon name="plus" size={16} /> добавить</>}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q.trim().length >= 2 && !found.length && <p class="hint">Ничего не найдено{mineOnly && cls.length ? ' в списках классов персонажа — снимите галочку, чтобы искать везде' : ''}.</p>}
    </div>
  );
}
