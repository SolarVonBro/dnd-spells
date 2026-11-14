// YDB storage: schema, import of the built dataset, and reading it back for the API.
import ydb from 'ydb-sdk';

const { Driver, TokenAuthService, AnonymousAuthService, TypedValues, Types } = ydb;

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sources (
     code Utf8 NOT NULL, name_en Utf8, name_ru Utf8, homebrew Bool, year Uint32, url Utf8, author Utf8,
     sort Uint32, notes Json,
     PRIMARY KEY (code))`,
  `CREATE TABLE IF NOT EXISTS classes (
     code Utf8 NOT NULL, name_en Utf8, name_ru Utf8, homebrew Bool,
     PRIMARY KEY (code))`,
  `CREATE TABLE IF NOT EXISTS subclasses (
     id Utf8 NOT NULL, class_code Utf8, name_en Utf8, name_ru Utf8, source Utf8,
     PRIMARY KEY (id))`,
  `CREATE TABLE IF NOT EXISTS spells (
     id Utf8 NOT NULL, group_id Utf8, source Utf8, page Uint32, homebrew Bool, relation Utf8,
     name_en Utf8, name_ru Utf8, level Uint8, school Utf8, ritual Bool, concentration Bool,
     comp_v Bool, comp_s Bool, comp_m Bool, comp_r Bool, material_cost Bool, material_consumed Bool,
     cast_keys Json, damage_types Json,
     time_en Utf8, time_ru Utf8, range_en Utf8, range_ru Utf8, duration_en Utf8, duration_ru Utf8,
     components_en Utf8, components_ru Utf8, text_en Utf8, text_ru Utf8,
     PRIMARY KEY (id))`,
  // kind: base = class spell list, expanded = optional list from a later book, subclass = subclass list
  `CREATE TABLE IF NOT EXISTS spell_classes (
     spell_id Utf8 NOT NULL, class_code Utf8 NOT NULL, subclass_id Utf8 NOT NULL, kind Utf8,
     PRIMARY KEY (spell_id, class_code, subclass_id))`,
  `CREATE TABLE IF NOT EXISTS meta (key Utf8 NOT NULL, value Utf8, PRIMARY KEY (key))`,
];

// Column types for writes, mirroring SCHEMA. "!" = NOT NULL (key column), otherwise optional.
const COLUMNS = {
  sources: 'code:Utf8! name_en:Utf8 name_ru:Utf8 homebrew:Bool year:Uint32 url:Utf8 author:Utf8 sort:Uint32 notes:Json',
  classes: 'code:Utf8! name_en:Utf8 name_ru:Utf8 homebrew:Bool',
  subclasses: 'id:Utf8! class_code:Utf8 name_en:Utf8 name_ru:Utf8 source:Utf8',
  spells: 'id:Utf8! group_id:Utf8 source:Utf8 page:Uint32 homebrew:Bool relation:Utf8 name_en:Utf8 name_ru:Utf8 level:Uint8 ' +
    'school:Utf8 ritual:Bool concentration:Bool comp_v:Bool comp_s:Bool comp_m:Bool comp_r:Bool material_cost:Bool ' +
    'material_consumed:Bool cast_keys:Json damage_types:Json time_en:Utf8 time_ru:Utf8 range_en:Utf8 range_ru:Utf8 ' +
    'duration_en:Utf8 duration_ru:Utf8 components_en:Utf8 components_ru:Utf8 text_en:Utf8 text_ru:Utf8',
  spell_classes: 'spell_id:Utf8! class_code:Utf8! subclass_id:Utf8! kind:Utf8',
  meta: 'key:Utf8! value:Utf8',
};
const SDK_TYPE = { Utf8: Types.UTF8, Bool: Types.BOOL, Uint32: Types.UINT32, Uint8: Types.UINT8, Json: Types.JSON };
const columns = (table) => COLUMNS[table].split(' ').map((c) => {
  const [name, t] = c.split(':');
  const required = t.endsWith('!');
  const yql = t.replace('!', '');
  return { name, yql: required ? yql : `${yql}?`, sdk: required ? SDK_TYPE[yql] : Types.optional(SDK_TYPE[yql]) };
});

/**
 * Yandex Cloud gives "grpcs://host:2135/?database=/ru-central1/...", but ydb-sdk 5.x reads the database from the URL
 * path first, and the path "/" wins over the query parameter ("Database not found"). Move the database into the path.
 */
export function normalizeConnectionString(cs) {
  const u = new URL(cs);
  const db = u.searchParams.get('database');
  return db ? `${u.protocol}//${u.host}${db.startsWith('/') ? db : `/${db}`}` : cs;
}

/** Connect. In a Cloud Function pass getToken (IAM token from the invocation context); locally a token or nothing. */
export function connect({ connectionString, token, anonymous = false }) {
  const authService = anonymous ? new AnonymousAuthService() : new TokenAuthService(token || '');
  const driver = new Driver({ connectionString: normalizeConnectionString(connectionString), authService });
  return {
    driver,
    setToken(t) { if (!anonymous) authService.token = t; },
    async ready(timeout = 10_000) {
      if (!(await driver.ready(timeout))) throw new Error('YDB driver is not ready');
    },
    close: () => driver.destroy(),
  };
}

// Every query here is idempotent (CREATE ... IF NOT EXISTS, UPSERT of fixed values, DELETE by key, SELECT),
// so transport errors are retried: the network between a client and YDB may drop connections.
const TRANSIENT = /TransportUnavailable|UNAVAILABLE|ETIMEDOUT|ECONNRESET|No connection established|DeadlineExceeded|Overloaded|SessionExpired/i;

async function exec(driver, text, parameters) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await execOnce(driver, text, parameters);
    } catch (e) {
      if (attempt >= 8 || !TRANSIENT.test(`${e?.name} ${e?.message}`)) throw e;
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
    }
  }
}

async function execOnce(driver, text, parameters) {
  return driver.queryClient.do({
    idempotent: true,
    fn: async (session) => {
      const res = await session.execute({ text, parameters });
      const sets = [];
      for await (const rs of res.resultSets) {
        const rows = [];
        for await (const row of rs.rows) rows.push(row);
        sets.push(rows);
      }
      await res.opFinished;
      return sets;
    },
  });
}

export async function migrate(driver) {
  for (const ddl of SCHEMA) await exec(driver, ddl);
}

/* ---------------- dataset <-> rows ---------------- */

const toRows = (data) => ({
  sources: data.sources.map((s) => ({
    code: s.code, name_en: s.en, name_ru: null, homebrew: s.homebrew, year: s.year ?? null, url: s.url ?? null,
    author: s.author ?? null, sort: s.sort, notes: s.notes ? JSON.stringify(s.notes) : null,
  })),
  classes: data.classes.map((c) => ({ code: c.code, name_en: c.en, name_ru: c.ru, homebrew: c.homebrew })),
  subclasses: data.subclasses.map((s) => ({ id: s.id, class_code: s.class, name_en: s.en, name_ru: s.ru, source: s.source })),
  spells: data.spells.map((s) => ({
    id: s.id, group_id: s.group, source: s.source, page: s.page ?? null, homebrew: s.homebrew, relation: s.relation,
    name_en: s.name.en, name_ru: s.name.ru, level: s.level, school: s.school, ritual: s.ritual, concentration: s.concentration,
    comp_v: s.components.v, comp_s: s.components.s, comp_m: s.components.m, comp_r: s.components.r,
    material_cost: s.components.cost, material_consumed: s.components.consumed,
    cast_keys: JSON.stringify(s.cast), damage_types: JSON.stringify(s.damage),
    time_en: s.time.en, time_ru: s.time.ru, range_en: s.range.en, range_ru: s.range.ru,
    duration_en: s.duration.en, duration_ru: s.duration.ru, components_en: s.comps.en, components_ru: s.comps.ru,
    text_en: s.text.en, text_ru: s.text.ru,
  })),
  spell_classes: data.spells.flatMap((s) => [
    ...s.classes.map((c) => ({ spell_id: s.id, class_code: c, subclass_id: '', kind: 'base' })),
    ...s.expanded.map((c) => ({ spell_id: s.id, class_code: c, subclass_id: '', kind: 'expanded' })),
    ...s.subclasses.map((sc) => ({ spell_id: s.id, class_code: sc.split(':')[0], subclass_id: sc, kind: 'subclass' })),
    // Laserllama class lists (from his class documents); subclass_id 'LL' keeps them apart from official lists.
    ...s.llLists.map((c) => ({ spell_id: s.id, class_code: c, subclass_id: 'LL', kind: 'll-list' })),
  ]),
});

const fromRows = (r, version) => {
  const meta = (key, fallback) => JSON.parse(r.meta?.find((m) => m.key === key)?.value ?? fallback);
  const llClassLists = meta('ll_class_lists', '[]');
  const links = new Map();
  for (const l of r.spell_classes) {
    if (!links.has(l.spellId)) links.set(l.spellId, { classes: [], expanded: [], subclasses: [], llLists: [] });
    const x = links.get(l.spellId);
    if (l.kind === 'base') x.classes.push(l.classCode);
    else if (l.kind === 'expanded') x.expanded.push(l.classCode);
    else if (l.kind === 'll-list') x.llLists.push(l.classCode);
    else x.subclasses.push(l.subclassId);
  }
  const parse = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
  return {
    version,
    llClassLists,
    casters: meta('casters', '[]'),
    multiclassSlots: meta('multiclass_slots', '[]'),
    sources: r.sources.map((s) => ({
      code: s.code, en: s.nameEn, homebrew: s.homebrew, year: s.year ?? null, url: s.url ?? null,
      sort: s.sort, ...(s.author ? { author: s.author } : {}), ...(s.notes ? { notes: parse(s.notes) } : {}),
    })).sort((a, b) => a.sort - b.sort),
    classes: r.classes.map((c) => ({ code: c.code, en: c.nameEn, ru: c.nameRu, homebrew: c.homebrew })).sort((a, b) => a.code.localeCompare(b.code)),
    subclasses: r.subclasses.map((s) => ({ id: s.id, class: s.classCode, en: s.nameEn, ru: s.nameRu, source: s.source })).sort((a, b) => a.id.localeCompare(b.id)),
    spells: r.spells.map((s) => {
      const l = links.get(s.id) || { classes: [], expanded: [], subclasses: [], llLists: [] };
      return {
        id: s.id, group: s.groupId, source: s.source, page: s.page ?? null, homebrew: s.homebrew, relation: s.relation ?? null,
        name: { en: s.nameEn, ru: s.nameRu ?? null }, level: s.level, school: s.school, ritual: s.ritual, concentration: s.concentration,
        components: { v: s.compV, s: s.compS, m: s.compM, r: s.compR, cost: s.materialCost, consumed: s.materialConsumed },
        cast: parse(s.castKeys), damage: parse(s.damageTypes),
        classes: l.classes.sort(), expanded: l.expanded.sort(), subclasses: l.subclasses.sort(), llLists: l.llLists.sort(),
        time: { en: s.timeEn, ru: s.timeRu ?? null }, range: { en: s.rangeEn, ru: s.rangeRu ?? null },
        duration: { en: s.durationEn, ru: s.durationRu ?? null }, comps: { en: s.componentsEn, ru: s.componentsRu ?? null },
        text: { en: s.textEn, ru: s.textRu ?? null },
      };
    }).sort((a, b) => a.id.localeCompare(b.id)),
  };
};

/* ---------------- write ---------------- */

async function upsert(driver, table, rows, chunk = 100) {
  const cols = columns(table);
  const type = Types.struct(Object.fromEntries(cols.map((c) => [c.name, c.sdk])));
  const decl = cols.map((c) => `${c.name}: ${c.yql}`).join(', ');
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk).map((r) => Object.fromEntries(cols.map((c) => [c.name, r[c.name] ?? null])));
    await exec(driver,
      `DECLARE $rows AS List<Struct<${decl}>>;\nUPSERT INTO ${table} SELECT * FROM AS_TABLE($rows);`,
      { $rows: TypedValues.list(type, part) });
  }
}

/** Replace the whole dataset: upsert all rows, delete rows that no longer exist, then bump the version. */
export async function importDataset(driver, data) {
  const rows = toRows(data);
  for (const table of ['sources', 'classes', 'subclasses', 'spells', 'spell_classes']) {
    await upsert(driver, table, rows[table], table === 'spells' ? 20 : 300);
  }
  // Remove stale rows (spells/links/etc. that were deleted from the dataset).
  const keep = {
    sources: new Set(rows.sources.map((r) => r.code)),
    classes: new Set(rows.classes.map((r) => r.code)),
    subclasses: new Set(rows.subclasses.map((r) => r.id)),
    spells: new Set(rows.spells.map((r) => r.id)),
    spell_classes: new Set(rows.spell_classes.map((r) => `${r.spell_id}|${r.class_code}|${r.subclass_id}`)),
  };
  const current = await readTables(driver);
  const del = async (table, where, params) => exec(driver, `${Object.keys(params).map((k) => `DECLARE ${k} AS Utf8;`).join('\n')}\nDELETE FROM ${table} WHERE ${where};`,
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, TypedValues.utf8(v)])));
  for (const r of current.sources) if (!keep.sources.has(r.code)) await del('sources', 'code = $k', { $k: r.code });
  for (const r of current.classes) if (!keep.classes.has(r.code)) await del('classes', 'code = $k', { $k: r.code });
  for (const r of current.subclasses) if (!keep.subclasses.has(r.id)) await del('subclasses', 'id = $k', { $k: r.id });
  for (const r of current.spells) if (!keep.spells.has(r.id)) await del('spells', 'id = $k', { $k: r.id });
  for (const r of current.spell_classes) {
    if (!keep.spell_classes.has(`${r.spellId}|${r.classCode}|${r.subclassId}`)) {
      await del('spell_classes', 'spell_id = $a AND class_code = $b AND subclass_id = $c', { $a: r.spellId, $b: r.classCode, $c: r.subclassId });
    }
  }
  await upsert(driver, 'meta', [
    { key: 'version', value: data.version },
    { key: 'll_class_lists', value: JSON.stringify(data.llClassLists ?? []) },
    { key: 'casters', value: JSON.stringify(data.casters ?? []) },
    { key: 'multiclass_slots', value: JSON.stringify(data.multiclassSlots ?? []) },
    { key: 'imported_at', value: new Date().toISOString() },
  ]);
}

/* ---------------- read ---------------- */

async function readTables(driver) {
  const [sources, classes, subclasses, spells, spell_classes, meta] = await exec(driver, `
    SELECT * FROM sources;
    SELECT * FROM classes;
    SELECT * FROM subclasses;
    SELECT * FROM spells;
    SELECT * FROM spell_classes;
    SELECT * FROM meta;`);
  return { sources, classes, subclasses, spells, spell_classes, meta };
}

export async function getVersion(driver) {
  const [rows] = await exec(driver, `SELECT value FROM meta WHERE key = 'version';`);
  return rows[0]?.value ?? 'empty';
}

export async function loadAll(driver) {
  const version = await getVersion(driver);
  return fromRows(await readTables(driver), version);
}
