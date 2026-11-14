// Foundry VTT actor export (system dnd5e, versions 2.x-5.x): validation and a compact copy for storage.
// The copy keeps the dnd5e data model as is (sheet.ts computes everything from it) and drops what the sheet does not
// use: images, permissions, tokens, timestamps, class flavor text, most advancement data.

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FEffect {
  name?: string;
  changes?: { key: string; mode: number; value: string }[];
  disabled?: boolean;
  transfer?: boolean;
}

export interface FItem {
  _id: string;
  name: string;
  type: string;
  system: any;
  flags?: { babele?: { originalName?: string }; plutonium?: { source?: string; hash?: string }; dnd5e?: { advancementOrigin?: string } };
  effects?: FEffect[];
  sort?: number;
}

export interface FActor {
  name: string;
  type: string;
  system: any;
  items: FItem[];
  effects: FEffect[];
  /** Actor flags the rules read (jackOfAllTrades, initiativeAlert, powerfulBuild...). */
  flags?: { dnd5e?: Record<string, any> };
  /** dnd5e system version the file was exported from ('3.3.1'). */
  sysVersion: string | null;
}

export class ImportError extends Error {}

const ITEM_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container', 'backpack', 'spell', 'feat',
  'class', 'subclass', 'race', 'background']);

const effect = (e: any): FEffect => ({
  name: typeof e?.name === 'string' ? e.name : typeof e?.label === 'string' ? e.label : undefined,
  changes: Array.isArray(e?.changes) ? e.changes.filter((c: any) => c && typeof c.key === 'string')
    .map((c: any) => ({ key: c.key, mode: Number(c.mode) || 0, value: String(c.value ?? '') })) : [],
  disabled: Boolean(e?.disabled),
  transfer: e?.transfer !== false,
});

function item(it: any): FItem {
  const system = { ...(it.system ?? it.data ?? {}) };
  delete system.unidentified;
  delete system.startingEquipment;
  if (system.description && typeof system.description === 'object') {
    system.description = { value: it.type === 'class' ? '' : String(system.description.value ?? '') };
  }
  // Only the advancement data the sheet reads: hit points by level and scale values (@scale formulas).
  if (Array.isArray(system.advancement)) {
    system.advancement = system.advancement.filter((a: any) => a?.type === 'HitPoints' || a?.type === 'ScaleValue')
      .map((a: any) => ({ type: a.type, value: a.value, configuration: a.type === 'ScaleValue' ? a.configuration : undefined }));
  }
  const f = it.flags ?? {};
  const flags: FItem['flags'] = {};
  if (f.babele?.originalName) flags.babele = { originalName: String(f.babele.originalName) };
  if (f.plutonium?.hash || f.plutonium?.source) flags.plutonium = { source: f.plutonium.source, hash: f.plutonium.hash };
  if (f.dnd5e?.advancementOrigin) flags.dnd5e = { advancementOrigin: String(f.dnd5e.advancementOrigin) };
  return {
    _id: String(it._id ?? it.id ?? Math.random().toString(36).slice(2)),
    name: String(it.name ?? ''),
    type: String(it.type),
    system,
    flags,
    effects: Array.isArray(it.effects) ? it.effects.map(effect) : [],
    sort: Number(it.sort) || 0,
  };
}

/** Throws ImportError with a message for the user when the file is not a dnd5e player character. */
export function parseActor(json: unknown): FActor {
  const a = json as any;
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new ImportError('Это не файл персонажа Foundry VTT.');
  const systemId = a._stats?.systemId ?? a.flags?.exportSource?.system ?? null;
  if (systemId && systemId !== 'dnd5e') throw new ImportError(`Персонаж из системы «${systemId}», а нужна система D&D 5e (dnd5e).`);
  const system = a.system ?? a.data;
  if (!system?.abilities || !Array.isArray(a.items)) throw new ImportError('Это не файл персонажа Foundry VTT: нет характеристик или предметов.');
  if (a.type !== 'character') {
    throw new ImportError(a.type === 'npc' ? 'Это существо (NPC), а нужен персонаж игрока.' : `Тип «${a.type}» не поддерживается: нужен персонаж игрока.`);
  }
  const sys = { ...system };
  delete sys.favorites;
  return {
    name: String(a.name ?? '').trim() || 'Без имени',
    type: 'character',
    system: sys,
    items: a.items.filter((x: any) => x && ITEM_TYPES.has(x.type)).map(item),
    effects: Array.isArray(a.effects) ? a.effects.map(effect) : [],
    flags: { dnd5e: Object.fromEntries(Object.entries(a.flags?.dnd5e ?? {}).filter(([, v]) => typeof v !== 'object' || v === null)) },
    sysVersion: a._stats?.systemVersion ?? a.flags?.exportSource?.systemVersion ?? null,
  };
}

/** The file looks like a Foundry actor (as opposed to a backup of this site). */
export const isActorFile = (json: unknown) => {
  const a = json as any;
  return Boolean(a && typeof a === 'object' && (a.system || a.data) && Array.isArray(a.items) && typeof a.type === 'string');
};
