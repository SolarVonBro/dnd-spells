// Spell sources shown on the site. Official = 2014-rules D&D books (5etools file names);
// Russian names follow ttg.club.
export const OFFICIAL_SOURCES = {
  PHB: { file: 'spells-phb.json', en: "Player's Handbook", ru: 'Книга игрока', year: 2014 },
  XGE: { file: 'spells-xge.json', en: "Xanathar's Guide to Everything", ru: 'Руководство Занатара обо всём', year: 2017 },
  TCE: { file: 'spells-tce.json', en: "Tasha's Cauldron of Everything", ru: 'Котёл Таши со всякой всячиной', year: 2020 },
  EGW: { file: 'spells-egw.json', en: "Explorer's Guide to Wildemount", ru: 'Путеводитель исследователя по Дикогорью', year: 2020 },
  FTD: { file: 'spells-ftd.json', en: "Fizban's Treasury of Dragons", ru: 'Сокровищница драконов Фицбана', year: 2021 },
  SCC: { file: 'spells-scc.json', en: 'Strixhaven: A Curriculum of Chaos', ru: 'Стриксхейвен: Учебная программа хаоса', year: 2021 },
  BMT: { file: 'spells-bmt.json', en: 'The Book of Many Things', ru: 'Книга многих вещей', year: 2023 },
  AAG: { file: 'spells-aag.json', en: "Astral Adventurer's Guide", ru: 'Руководство астрального приключенца', year: 2022 },
  AI: { file: 'spells-ai.json', en: 'Acquisitions Incorporated', ru: 'Корпорация приобретений', year: 2019 },
  GGR: { file: 'spells-ggr.json', en: "Guildmasters' Guide to Ravnica", ru: 'Справочник гильдмастера по Равнике', year: 2018 },
  IDRotF: { file: 'spells-idrotf.json', en: 'Icewind Dale: Rime of the Frostmaiden', ru: 'Долина Ледяного Ветра: Иней Морозной девы', year: 2020 },
  SatO: { file: 'spells-sato.json', en: 'Sigil and the Outlands', ru: 'Сигил и Внешние Земли', year: 2023 },
  LLK: { file: 'spells-llk.json', en: 'Lost Laboratory of Kwalish', ru: 'Потерянная лаборатория Квалиша', year: 2018 },
  'AitFR-AVT': { file: 'spells-aitfr-avt.json', en: 'Adventures in the Forgotten Realms: A Verdant Tomb', ru: 'Приключения в Забытых Королевствах: Зелёная гробница', year: 2021 },
};

export const LASERLLAMA = {
  code: 'LL',
  en: 'Laserllama: Compendium of Spells v.0.5',
  ru: 'Laserllama: Компендиум заклинаний v.0.5',
  url: 'https://www.gmbinder.com/share/-OCTyV0iLRGFr9WfdtJy',
  author: 'https://www.gmbinder.com/profile/laserllama',
};

// ttg.club uses its own codes for a few books.
export const TTG_TO_5ET = { EGtW: 'EGW', SCAG: 'TCE' };
