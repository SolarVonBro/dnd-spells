import type { Lang } from './types';

export const SCHOOL: Record<string, { en: string; ru: string }> = {
  A: { en: 'Abjuration', ru: 'Ограждение' },
  C: { en: 'Conjuration', ru: 'Вызов' },
  D: { en: 'Divination', ru: 'Прорицание' },
  E: { en: 'Enchantment', ru: 'Очарование' },
  V: { en: 'Evocation', ru: 'Воплощение' },
  I: { en: 'Illusion', ru: 'Иллюзия' },
  N: { en: 'Necromancy', ru: 'Некромантия' },
  T: { en: 'Transmutation', ru: 'Преобразование' },
};

export const DAMAGE: Record<string, { en: string; ru: string }> = {
  acid: { en: 'Acid', ru: 'Кислота' },
  bludgeoning: { en: 'Bludgeoning', ru: 'Дробящий' },
  cold: { en: 'Cold', ru: 'Холод' },
  fire: { en: 'Fire', ru: 'Огонь' },
  force: { en: 'Force', ru: 'Силовое поле' },
  lightning: { en: 'Lightning', ru: 'Электричество' },
  necrotic: { en: 'Necrotic', ru: 'Некротическая' },
  piercing: { en: 'Piercing', ru: 'Колющий' },
  poison: { en: 'Poison', ru: 'Яд' },
  psychic: { en: 'Psychic', ru: 'Психическая' },
  radiant: { en: 'Radiant', ru: 'Излучение' },
  slashing: { en: 'Slashing', ru: 'Рубящий' },
  thunder: { en: 'Thunder', ru: 'Звук' },
};

// Casting time filter buckets (keys produced by scripts/build-data.mjs).
export const CAST_BUCKETS: { key: string; ru: string; title?: string }[] = [
  { key: 'action', ru: 'Действие' },
  { key: 'bonus', ru: 'Бонусное действие' },
  { key: 'reaction', ru: 'Реакция' },
  { key: 'attack', ru: '1 атака', title: 'Laserllama: вместо одной атаки' },
  { key: 'hit', ru: 'При попадании', title: 'Laserllama: при попадании атакой оружием' },
  { key: 'minute:1', ru: '1 минута' },
  { key: 'minute:10', ru: '10 минут' },
  { key: 'hour:1', ru: '1 час' },
  { key: 'hour:long', ru: '8 часов и дольше' },
];
export const castBucket = (key: string) => (/^hour:(\d+)$/.test(key) && +key.split(':')[1] >= 8 ? 'hour:long' : key);

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function levelSchool(level: number, school: string, ritual: boolean, lang: Lang) {
  const s = SCHOOL[school];
  if (lang === 'ru') {
    const base = level === 0 ? `Заговор, ${s.ru.toLowerCase()}` : `${level} уровень, ${s.ru.toLowerCase()}`;
    return ritual ? `${base} (ритуал)` : base;
  }
  const base = level === 0 ? `${s.en} cantrip` : `${ORD[level]}-level ${s.en.toLowerCase()}`;
  return ritual ? `${base} (ritual)` : base;
}

export const levelLabel = (level: number) => (level === 0 ? 'Заговоры' : `${level} уровень`);
export const levelShort = (level: number) => (level === 0 ? 'З' : String(level));

// Short chip labels for sources (full names come from the dataset and are shown as tooltips).
export const SOURCE_SHORT: Record<string, string> = {
  PHB: 'Книга игрока', XGE: 'Занатар', TCE: 'Таша', EGW: 'Дикогорье', FTD: 'Фицбан', SCC: 'Стриксхейвен',
  BMT: 'Многие вещи', AAG: 'Астрал', AI: 'Корпорация', GGR: 'Равника', IDRotF: 'Ледяной Ветер', SatO: 'Сигил',
  LLK: 'Квалиш', 'AitFR-AVT': 'Зелёная гробница', LL: 'Laserllama',
};

export const FIELD_LABEL = {
  time: { en: 'Casting Time', ru: 'Время накладывания' },
  range: { en: 'Range', ru: 'Дистанция' },
  comps: { en: 'Components', ru: 'Компоненты' },
  duration: { en: 'Duration', ru: 'Длительность' },
} as const;
