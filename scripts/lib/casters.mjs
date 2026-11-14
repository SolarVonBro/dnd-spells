// Spellcasting tables of classes (spell slots, cantrips and spells known, prepared spells) for character spell lists.
//   Official classes: 5etools class files (2014 rules: PHB classes, TCE artificer; Eldritch Knight and Arcane Trickster
//   from PHB). Laserllama classes: data/laserllama/class-tables/*.json (scripts/extract_class_table.py).
import fs from 'node:fs';
import path from 'node:path';
import { CLASS_FILES } from './sources.mjs';

const CLASS_SOURCE = { Artificer: 'TCE' }; // everything else: PHB
const THIRD_CASTERS = [['Fighter', 'Eldritch Knight'], ['Rogue', 'Arcane Trickster']];
const FULL = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'];

// "{@filter Cantrips Known|spells|level=0|class=bard}" -> "Cantrips Known"
const label = (s) => String(s).replace(/\{@\w+ ([^|}]+)[^}]*\}/g, '$1').trim();
const ordinal = (s) => Number(label(s).match(/^(\d)/)?.[1] ?? NaN);

function column(groups, name) {
  for (const g of groups ?? []) {
    const i = (g.colLabels ?? []).findIndex((c) => label(c) === name);
    if (i >= 0 && g.rows) return g.rows.map((r) => r[i]);
  }
  return null;
}

function slotRows(groups) {
  const g = (groups ?? []).find((x) => x.rowsSpellProgression);
  if (!g) return null;
  return g.rowsSpellProgression.map((r) => Array.from({ length: 9 }, (_, i) => r[i] ?? 0));
}

const preparedRule = (formula) => {
  if (!formula) return null;
  if (/^<\$level\$> \+ <\$\w+_mod\$>$/.test(formula)) return 'level';
  if (/^<\$level\$> \/ 2 \+ <\$\w+_mod\$>$/.test(formula)) return 'half';
  throw new Error(`unknown prepared spells formula: ${formula}`);
};

function check(c) {
  const rows20 = (a) => a == null || (a.length === 20 && a.every((x) => Number.isInteger(x) && x >= 0));
  if (!rows20(c.cantrips) || !rows20(c.known) || !rows20(c.spellbook)) throw new Error(`${c.key}: bad progression`);
  if (c.slots && (c.slots.length !== 20 || c.slots.some((r) => r.length !== 9))) throw new Error(`${c.key}: bad slot table`);
  if (c.pact && (c.pact.slots.length !== 20 || c.pact.level.length !== 20)) throw new Error(`${c.key}: bad pact table`);
  if (!c.slots && !c.pact) throw new Error(`${c.key}: no spell slots`);
  if (!['int', 'wis', 'cha'].includes(c.ability)) throw new Error(`${c.key}: ability ${c.ability}`);
  return c;
}

function fromEntry(e, groups, base) {
  const pact = e.casterProgression === 'pact';
  const known = column(groups, 'Spells Known') ?? e.spellsKnownProgression ?? null;
  let spellbook = null;
  if (e.spellsKnownProgressionFixed) {
    let n = 0;
    spellbook = e.spellsKnownProgressionFixed.map((x) => (n += x));
  }
  const arcanum = {};
  for (const f of e.classFeatures ?? []) {
    const m = String(typeof f === 'string' ? f : f.classFeature).match(/^Mystic Arcanum \((\d)th level\)\|[^|]*\|[^|]*\|(\d+)/);
    if (m) arcanum[m[1]] = Number(m[2]);
  }
  return check({
    ...base,
    progression: e.casterProgression,
    ability: e.spellcastingAbility,
    slots: pact ? null : slotRows(groups),
    pact: pact ? { slots: column(groups, 'Spell Slots'), level: column(groups, 'Slot Level').map(ordinal) } : null,
    arcanum: Object.keys(arcanum).length ? arcanum : null,
    cantrips: column(groups, 'Cantrips Known') ?? e.cantripProgression ?? null,
    known: spellbook ? null : known,
    spellbook,
    prepared: preparedRule(e.preparedSpells),
  });
}

export function buildCasters(root) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data/vendor/5etools/class', f), 'utf8'));
  const casters = [];
  for (const file of CLASS_FILES) {
    const j = read(`class-${file}.json`);
    const name = file[0].toUpperCase() + file.slice(1);
    const src = CLASS_SOURCE[name] ?? 'PHB';
    const c = j.class.find((x) => x.name === name && x.source === src);
    if (!c) throw new Error(`5etools: class ${name} (${src}) not found`);
    if (c.casterProgression) {
      casters.push(fromEntry(c, c.classTableGroups, { key: name, class: name, subclass: null, homebrew: false, source: src }));
    }
    for (const [cls, sub] of THIRD_CASTERS.filter(([x]) => x === name)) {
      const s = (j.subclass ?? []).find((x) => x.shortName === sub && x.source === 'PHB' && x.classSource === 'PHB');
      if (!s?.casterProgression) throw new Error(`5etools: subclass ${cls}: ${sub} (PHB) not found`);
      casters.push(fromEntry(s, s.subclassTableGroups, { key: `${cls}:${sub}`, class: cls, subclass: `${cls}:${sub}`, homebrew: false, source: 'PHB' }));
    }
  }

  // Laserllama class documents.
  const dir = path.join(root, 'data/laserllama/class-tables');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort() : []) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    casters.push(check({
      key: `LL:${t.class}`, class: t.class, subclass: null, homebrew: true, source: t.source,
      progression: t.progression, ability: t.ability, slots: t.slots, pact: null, arcanum: null,
      cantrips: t.cantrips, known: t.known, spellbook: null, prepared: t.prepared,
    }));
  }

  // PHB "Multiclass Spellcaster: Spell Slots per Spell Level" is the full caster table; make sure it is the same in all
  // full casters before using it.
  const full = casters.filter((c) => FULL.includes(c.key));
  const multiclassSlots = full[0].slots;
  for (const c of full) if (JSON.stringify(c.slots) !== JSON.stringify(multiclassSlots)) throw new Error(`${c.key}: slot table differs from the full caster table`);
  return { casters, multiclassSlots };
}
