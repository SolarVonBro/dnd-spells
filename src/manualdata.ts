// Characters created on the site (without a Foundry VTT file): stored data and class rules of PHB 2014 / TCE
// (hit dice, saving throws, proficiencies, class skills, multiclass proficiencies). No imports: used by the store.

export type Ab = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABS: Ab[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** A class typed in by the player: name, saving throws, spellcasting, proficiencies. */
export interface CustomClass {
  name: string;
  saves: Ab[];
  caster: 'none' | 'full' | 'half' | 'third' | 'artificer' | 'pact';
  ability: 'int' | 'wis' | 'cha';
  armor: string;
  weapons: string;
}

export interface ManualClass {
  /** Site class code: 'Wizard', 'LL:Druid' (Laserllama), 'custom:<id>' (typed in, see `custom`). */
  cls: string;
  level: number;
  /** Subclass id ('Cleric:Life', 'LL:Rogue:Burglar'), 'custom' (typed in, see `subName`) or null. */
  sub: string | null;
  subName?: string;
  /** Hit die faces when the class is unknown or the player changes it (null: by the class). */
  hd: number | null;
  custom?: CustomClass;
}

export const isCustom = (cls: string) => cls.startsWith('custom:');
export const newCustomClass = (): CustomClass => ({ name: '', saves: [], caster: 'none', ability: 'int', armor: '', weapons: '' });
export interface ManualSpell { id: string; v: 'o' | 'l' }
export interface ManualWeapon {
  id: string;
  name: string;
  /** 'fin': the better of STR and DEX (finesse). */
  ability: Ab | 'fin';
  prof: boolean;
  dice: string;
  type: string;
  magic: number;
  notes: string;
}
export type FeatureGroup = 'race' | 'class' | 'background' | 'feat' | 'other';
export interface ManualFeature { id: string; group: FeatureGroup; name: string; text: string; uses: number; per: string }
export interface ManualItem { id: string; name: string; qty: number; weight: number; notes: string }

export interface ManualData {
  classes: ManualClass[];
  abilities: Record<Ab, number>;
  /** Sanity and Honor (DMG p. 264) from a set of the calculator; null: not used. */
  extra: { san: number | null; hon: number | null };
  /** The calculator's set the scores were taken from. */
  statSet: { id: string; title: string } | null;
  /** Saving throw proficiencies; null: by the first class. */
  saves: Ab[] | null;
  hp: { mode: 'avg' | 'max' | 'manual'; manual: number | null; perLevel: number };
  ac: { mode: 'auto' | 'armor' | 'manual'; armorName: string; armorBase: number; armorType: 'light' | 'medium' | 'heavy'; shield: boolean; bonus: number; manual: number | null };
  speed: number;
  size: 'tiny' | 'sm' | 'med' | 'lg';
  darkvision: number;
  race: string;
  background: string;
  xp: number;
  languages: string;
  tools: string;
  armorExtra: string;
  weaponExtra: string;
  defenses: string;
  looks: { age: string; height: string; weight: string; eyes: string; skin: string; hair: string };
  weapons: ManualWeapon[];
  features: ManualFeature[];
  items: ManualItem[];
  coins: { pp: number; gp: number; ep: number; sp: number; cp: number };
  spells: ManualSpell[];
}

export function emptyManual(): ManualData {
  return {
    classes: [], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, extra: { san: null, hon: null }, statSet: null, saves: null,
    hp: { mode: 'avg', manual: null, perLevel: 0 },
    ac: { mode: 'auto', armorName: '', armorBase: 11, armorType: 'light', shield: false, bonus: 0, manual: null },
    speed: 30, size: 'med', darkvision: 0, race: '', background: '', xp: 0,
    languages: 'Общий', tools: '', armorExtra: '', weaponExtra: '', defenses: '',
    looks: { age: '', height: '', weight: '', eyes: '', skin: '', hair: '' },
    weapons: [], features: [], items: [], coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, spells: [],
  };
}

/** Stored data with defaults for fields added later. */
export function normalizeManual(x: unknown): ManualData {
  const e = emptyManual();
  const m = (x && typeof x === 'object' ? x : {}) as Partial<ManualData>;
  return {
    ...e, ...m,
    abilities: { ...e.abilities, ...m.abilities },
    extra: { ...e.extra, ...m.extra },
    hp: { ...e.hp, ...m.hp },
    ac: { ...e.ac, ...m.ac },
    looks: { ...e.looks, ...m.looks },
    coins: { ...e.coins, ...m.coins },
    classes: Array.isArray(m.classes) ? m.classes : [],
    weapons: Array.isArray(m.weapons) ? m.weapons : [],
    features: Array.isArray(m.features) ? m.features : [],
    items: Array.isArray(m.items) ? m.items : [],
    spells: Array.isArray(m.spells) ? m.spells : [],
  };
}

/* ---------------- classes (PHB 2014, TCE for the Artificer) ---------------- */

const LIGHT = 'лёгкие доспехи', MEDIUM = 'средние доспехи', HEAVY = 'тяжёлые доспехи', SHIELDS = 'щиты';
const SIMPLE = 'простое оружие', MARTIAL = 'воинское оружие';

export interface ClassRules {
  hd: number;
  saves: Ab[];
  armor: string[];
  weapons: string[];
  tools: string;
  /** Skills to choose at 1st level: how many and from which (keys of the sheet's skills; 'any' for the Bard). */
  skills: { n: number; from: string[] | 'any' };
  /** Proficiencies gained when this class is taken as a second class (PHB p. 164). */
  multi: { armor: string[]; weapons: string[]; note: string };
}

export const CLASS_RULES: Record<string, ClassRules> = {
  Artificer: { hd: 8, saves: ['con', 'int'], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE], tools: 'воровские инструменты, инструменты жестянщика, один вид инструментов ремесленника',
    skills: { n: 2, from: ['arc', 'his', 'inv', 'med', 'nat', 'prc', 'slt'] }, multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [], note: 'воровские инструменты, инструменты жестянщика' } },
  Barbarian: { hd: 12, saves: ['str', 'con'], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL], tools: '',
    skills: { n: 2, from: ['ani', 'ath', 'itm', 'nat', 'prc', 'sur'] }, multi: { armor: [SHIELDS], weapons: [SIMPLE, MARTIAL], note: '' } },
  Bard: { hd: 8, saves: ['dex', 'cha'], armor: [LIGHT], weapons: [SIMPLE, 'ручные арбалеты', 'длинные мечи', 'рапиры', 'короткие мечи'], tools: 'три музыкальных инструмента на выбор',
    skills: { n: 3, from: 'any' }, multi: { armor: [LIGHT], weapons: [], note: 'один навык на выбор, один музыкальный инструмент' } },
  Cleric: { hd: 8, saves: ['wis', 'cha'], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE], tools: '',
    skills: { n: 2, from: ['his', 'ins', 'med', 'per', 'rel'] }, multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [], note: '' } },
  Druid: { hd: 8, saves: ['int', 'wis'], armor: [`${LIGHT} (не металлические)`, `${MEDIUM} (не металлические)`, `${SHIELDS} (не металлические)`],
    weapons: ['боевые посохи', 'булавы', 'дротики', 'дубинки', 'кинжалы', 'копья', 'метательные копья', 'пращи', 'серпы', 'скимитары'], tools: 'набор травника',
    skills: { n: 2, from: ['arc', 'ani', 'ins', 'med', 'nat', 'prc', 'rel', 'sur'] }, multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [], note: 'доспехи и щиты не из металла' } },
  Fighter: { hd: 10, saves: ['str', 'con'], armor: [LIGHT, MEDIUM, HEAVY, SHIELDS], weapons: [SIMPLE, MARTIAL], tools: '',
    skills: { n: 2, from: ['acr', 'ani', 'ath', 'his', 'ins', 'itm', 'prc', 'sur'] }, multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL], note: '' } },
  Monk: { hd: 8, saves: ['str', 'dex'], armor: [], weapons: [SIMPLE, 'короткие мечи'], tools: 'один вид инструментов ремесленника или музыкальный инструмент',
    skills: { n: 2, from: ['acr', 'ath', 'his', 'ins', 'rel', 'ste'] }, multi: { armor: [], weapons: [SIMPLE, 'короткие мечи'], note: '' } },
  Paladin: { hd: 10, saves: ['wis', 'cha'], armor: [LIGHT, MEDIUM, HEAVY, SHIELDS], weapons: [SIMPLE, MARTIAL], tools: '',
    skills: { n: 2, from: ['ath', 'ins', 'itm', 'med', 'per', 'rel'] }, multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL], note: '' } },
  Ranger: { hd: 10, saves: ['str', 'dex'], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL], tools: '',
    skills: { n: 3, from: ['ani', 'ath', 'ins', 'inv', 'nat', 'prc', 'ste', 'sur'] }, multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL], note: 'один навык из списка следопыта' } },
  Rogue: { hd: 8, saves: ['dex', 'int'], armor: [LIGHT], weapons: [SIMPLE, 'ручные арбалеты', 'длинные мечи', 'рапиры', 'короткие мечи'], tools: 'воровские инструменты',
    skills: { n: 4, from: ['acr', 'ath', 'dec', 'ins', 'itm', 'inv', 'prc', 'prf', 'per', 'slt', 'ste'] }, multi: { armor: [LIGHT], weapons: [], note: 'один навык из списка плута, воровские инструменты' } },
  Sorcerer: { hd: 6, saves: ['con', 'cha'], armor: [], weapons: ['кинжалы', 'дротики', 'пращи', 'боевые посохи', 'лёгкие арбалеты'], tools: '',
    skills: { n: 2, from: ['arc', 'dec', 'ins', 'itm', 'per', 'rel'] }, multi: { armor: [], weapons: [], note: '' } },
  Warlock: { hd: 8, saves: ['wis', 'cha'], armor: [LIGHT], weapons: [SIMPLE], tools: '',
    skills: { n: 2, from: ['arc', 'dec', 'his', 'itm', 'inv', 'nat', 'rel'] }, multi: { armor: [LIGHT], weapons: [SIMPLE], note: '' } },
  Wizard: { hd: 6, saves: ['int', 'wis'], armor: [], weapons: ['кинжалы', 'дротики', 'пращи', 'боевые посохи', 'лёгкие арбалеты'], tools: '',
    skills: { n: 2, from: ['arc', 'his', 'ins', 'inv', 'med', 'rel'] }, multi: { armor: [], weapons: [], note: '' } },
};

/* ---------------- Laserllama classes with documents (the player's GM Binder PDFs) ---------------- */

export interface LlClass { en: string; ru: string; doc: string; rules: ClassRules; subclasses: { id: string; en: string; ru: string }[] }
const llSubs = (cls: string, list: [string, string][]) => list.map(([en, ru]) => ({ id: `LL:${cls}:${en.replace(/^(Circle of (the )?|Academy of )/, '')}`, en, ru }));

export const LL_CLASSES: Record<string, LlClass> = {
  Druid: {
    en: 'Alternate Druid', ru: 'Друид', doc: 'Alternate Druid',
    rules: { hd: 8, saves: ['int', 'wis'], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, 'скимитары'], tools: 'набор травника',
      skills: { n: 2, from: ['arc', 'ani', 'ins', 'med', 'nat', 'prc', 'rel', 'sur'] }, multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [], note: '' } },
    subclasses: llSubs('Druid', [['Circle of Decay', 'Круг Разложения'], ['Circle of the Land', 'Круг Земли'], ['Circle of the Moon', 'Круг Луны'], ['Circle of the Tides', 'Круг Приливов']]),
  },
  Rogue: {
    en: 'Alternate Rogue', ru: 'Плут', doc: 'Alternate Rogue, Alternate Rogue: Expanded',
    rules: { hd: 8, saves: ['dex', 'int'], armor: [LIGHT], weapons: [SIMPLE, 'духовые трубки', 'ручные арбалеты', 'скимитары', 'короткие мечи', 'рапиры', 'кнуты'],
      tools: 'один набор инструментов на выбор',
      skills: { n: 4, from: ['acr', 'ath', 'dec', 'ins', 'itm', 'inv', 'prc', 'prf', 'per', 'slt', 'ste'] },
      multi: { armor: [LIGHT], weapons: [], note: 'один навык из списка плута, один набор инструментов' } },
    subclasses: llSubs('Rogue', [
      ['Arcane Trickster', 'Мистический Ловкач'], ['Assassin', 'Убийца'], ['Burglar', 'Взломщик'], ['Investigator', 'Следователь'],
      ['Mastermind', 'Комбинатор'], ['Phantom', 'Фантом'], ['Psiknife', 'Псиклинок'], ['Scout', 'Разведчик'], ['Swashbuckler', 'Дуэлянт'],
      ['Acrobat', 'Акробат'], ['Avenger', 'Мститель'], ['Bloodknife', 'Кровавый клинок'], ['Gambler', 'Игрок'], ['Ruffian', 'Громила'],
      ['Saboteur', 'Диверсант'], ['Seeker', 'Искатель'], ['Skinchanger', 'Перевёртыш'], ['Surgeon', 'Хирург'],
    ]),
  },
  Warlord: {
    en: 'Warlord', ru: 'Военачальник', doc: 'The Warlord Class',
    rules: { hd: 8, saves: ['wis', 'cha'], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, 'ручные арбалеты', 'длинные луки', 'длинные мечи', 'рапиры', 'скимитары', 'короткие мечи'],
      tools: 'один игровой набор на выбор', skills: { n: 2, from: ['ath', 'dec', 'his', 'ins', 'itm', 'inv', 'per'] },
      multi: { armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE], note: 'один игровой набор' } },
    subclasses: llSubs('Warlord', [['Academy of Chivalry', 'Академия Рыцарства'], ['Academy of Ferocity', 'Академия Свирепости'], ['Academy of Schemes', 'Академия Интриг'],
      ['Academy of Skalds', 'Академия Скальдов'], ['Academy of Tactics', 'Академия Тактики']]),
  },
};

/** Rules of a class: a Laserllama class document, else the official class (Laserllama's alternate classes keep its hit die,
 *  saves and proficiencies); null for a typed-in class or an unknown homebrew class. */
export function classRules(cls: string): ClassRules | null {
  if (isCustom(cls)) return null;
  if (cls.startsWith('LL:')) {
    const ll = LL_CLASSES[cls.slice(3)];
    if (ll) return ll.rules;
  }
  return CLASS_RULES[cls.replace(/^LL:/, '')] ?? null;
}

/** Saving throws a class gives as the first class. */
export const classSaves = (c: ManualClass): Ab[] => (c.custom ? c.custom.saves : classRules(c.cls)?.saves ?? []);

/** Ability score improvements: class levels that give them (PHB). */
export function asiLevels(cls: string): number[] {
  const base = cls.replace(/^LL:/, '');
  if (base === 'Fighter') return [4, 6, 8, 12, 14, 16, 19];
  if (base === 'Rogue') return [4, 8, 10, 12, 16, 19];
  return [4, 8, 12, 16, 19];
}
