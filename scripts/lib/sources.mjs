// Spell sources shown on the site. Official = 2014-rules D&D books (5etools file names).
// Book names are shown in English only.
export const OFFICIAL_SOURCES = {
  PHB: { file: 'spells-phb.json', en: "Player's Handbook", year: 2014 },
  XGE: { file: 'spells-xge.json', en: "Xanathar's Guide to Everything", year: 2017 },
  TCE: { file: 'spells-tce.json', en: "Tasha's Cauldron of Everything", year: 2020 },
  EGW: { file: 'spells-egw.json', en: "Explorer's Guide to Wildemount", year: 2020 },
  FTD: { file: 'spells-ftd.json', en: "Fizban's Treasury of Dragons", year: 2021 },
  SCC: { file: 'spells-scc.json', en: 'Strixhaven: A Curriculum of Chaos', year: 2021 },
  BMT: { file: 'spells-bmt.json', en: 'The Book of Many Things', year: 2023 },
  AAG: { file: 'spells-aag.json', en: "Astral Adventurer's Guide", year: 2022 },
  AI: { file: 'spells-ai.json', en: 'Acquisitions Incorporated', year: 2019 },
  GGR: { file: 'spells-ggr.json', en: "Guildmasters' Guide to Ravnica", year: 2018 },
  IDRotF: { file: 'spells-idrotf.json', en: 'Icewind Dale: Rime of the Frostmaiden', year: 2020 },
  SatO: { file: 'spells-sato.json', en: 'Sigil and the Outlands', year: 2023 },
  LLK: { file: 'spells-llk.json', en: 'Lost Laboratory of Kwalish', year: 2018 },
  'AitFR-AVT': { file: 'spells-aitfr-avt.json', en: 'Adventures in the Forgotten Realms: A Verdant Tomb', year: 2021 },
};

export const LASERLLAMA = {
  code: 'LL',
  en: 'Laserllama: Compendium of Spells v.0.5',
  url: 'https://www.gmbinder.com/share/-OCTyV0iLRGFr9WfdtJy',
  author: 'https://www.gmbinder.com/profile/laserllama',
};

// ttg.club uses its own codes for a few books.
export const TTG_TO_5ET = { EGtW: 'EGW', SCAG: 'TCE' };

// 5etools class files (data/vendor/5etools/class) with spell slot tables. Fighter and Rogue are here for their
// Eldritch Knight and Arcane Trickster subclasses.
export const CLASS_FILES = ['artificer', 'bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard', 'fighter', 'rogue'];
