// Uses Node's built-in sqlite module instead of better-sqlite3: same
// synchronous prepare/run/get/all API, but no native addon to compile - a
// native module needing node-gyp (Python + a C++ toolchain) was a real
// installer risk for non-developer operators on Windows/Mac, exactly the
// audience the one-click launcher scripts target.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'app.sqlite'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS admin_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT,
  password_hash TEXT,
  token TEXT,
  token_expires_at INTEGER,
  fetch_settings TEXT NOT NULL DEFAULT '{"sik":15,"cuaca":15,"gempa":15}'
);

CREATE TABLE IF NOT EXISTS source_status (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  last_fetch INTEGER,
  next_fetch INTEGER,
  count INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS events (
  uuid TEXT PRIMARY KEY,
  tanggal TEXT,
  jam TEXT,
  jenis_bencana TEXT,
  lokasi TEXT,
  keterangan TEXT,
  kabupaten TEXT,
  kecamatan TEXT,
  desa TEXT,
  korban_meninggal INTEGER,
  korban_luka INTEGER,
  korban_hilang INTEGER,
  bangunan_rr INTEGER,
  bangunan_rs INTEGER,
  bangunan_rb INTEGER,
  kerugian REAL,
  status_verifikasi INTEGER,
  lat REAL,
  lng REAL,
  impacts_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS weather_cache (
  adm4 TEXT PRIMARY KEY,
  lokasi_json TEXT,
  cuaca_json TEXT,
  fetched_at INTEGER
);

CREATE TABLE IF NOT EXISTS quakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fetched_at INTEGER,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regions (
  adm4 TEXT PRIMARY KEY,
  kabupaten TEXT,
  kecamatan TEXT,
  desa TEXT
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  events_json TEXT NOT NULL DEFAULT '[]'
);
`);

// Lightweight migration: admin_config predates the opt-in auto-relogin
// feature, so existing installs won't have this column yet.
const adminConfigCols = db.prepare("PRAGMA table_info(admin_config)").all().map((c) => c.name);
if (!adminConfigCols.includes('password_enc')) {
  db.exec('ALTER TABLE admin_config ADD COLUMN password_enc TEXT');
}

// Same idea: source_status predates the fetch-progress bar and the
// oldest/newest date-range display.
const sourceStatusCols = db.prepare("PRAGMA table_info(source_status)").all().map((c) => c.name);
if (!sourceStatusCols.includes('progress_json')) {
  db.exec('ALTER TABLE source_status ADD COLUMN progress_json TEXT');
}
if (!sourceStatusCols.includes('date_range_json')) {
  db.exec('ALTER TABLE source_status ADD COLUMN date_range_json TEXT');
}

db.prepare(`INSERT INTO notification_queue (id, events_json) VALUES (1, '[]') ON CONFLICT(id) DO NOTHING`).run();

for (const key of Object.keys(config.fetchIntervalsMinutes)) {
  db.prepare(
    `INSERT INTO source_status (key, status) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`
  ).run(key, key === 'sik' ? 'unauth' : 'idle');
}
db.prepare(`INSERT INTO admin_config (id, fetch_settings) VALUES (1, ?) ON CONFLICT(id) DO NOTHING`).run(
  JSON.stringify({ ...config.fetchIntervalsMinutes, sikRangeMonths: config.defaultSikRangeMonths })
);

// node:sqlite's StatementSync throws on named params that aren't referenced
// in the SQL text (unlike better-sqlite3, which silently ignores extras) -
// so event rows (which carry an `impacts` array alongside the plain columns)
// need to be narrowed to exactly the columns the INSERT statements bind.
function toEventParams(ev) {
  return {
    uuid: ev.uuid, tanggal: ev.tanggal, jam: ev.jam, jenisBencana: ev.jenisBencana, lokasi: ev.lokasi,
    keterangan: ev.keterangan, kabupaten: ev.kabupaten, kecamatan: ev.kecamatan, desa: ev.desa,
    korbanMeninggal: ev.korbanMeninggal, korbanLuka: ev.korbanLuka, korbanHilang: ev.korbanHilang,
    bangunanRr: ev.bangunanRr, bangunanRs: ev.bangunanRs, bangunanRb: ev.bangunanRb, kerugian: ev.kerugian,
    statusVerifikasi: ev.statusVerifikasi, lat: ev.lat, lng: ev.lng,
    impactsJson: JSON.stringify(ev.impacts || []),
  };
}

// node:sqlite's DatabaseSync has no db.transaction() helper (a
// better-sqlite3-specific convenience) - wrap the bulk seed inserts in a
// plain BEGIN/COMMIT instead, rolling back on failure.
function runInTransaction(fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function seedIfEmpty() {
  const eventCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  if (eventCount === 0) {
    const seed = JSON.parse(fs.readFileSync(path.join(dataDir, 'disaster-events-seed.json'), 'utf-8'));
    const insert = db.prepare(`
      INSERT INTO events (uuid, tanggal, jam, jenis_bencana, lokasi, keterangan, kabupaten, kecamatan, desa,
        korban_meninggal, korban_luka, korban_hilang, bangunan_rr, bangunan_rs, bangunan_rb, kerugian,
        status_verifikasi, lat, lng, impacts_json)
      VALUES (@uuid, @tanggal, @jam, @jenisBencana, @lokasi, @keterangan, @kabupaten, @kecamatan, @desa,
        @korbanMeninggal, @korbanLuka, @korbanHilang, @bangunanRr, @bangunanRs, @bangunanRb, @kerugian,
        @statusVerifikasi, @lat, @lng, @impactsJson)
    `);
    runInTransaction(() => {
      for (const ev of seed) insert.run(toEventParams(ev));
    });
    console.log(`[db] seeded ${seed.length} events`);
  }

  const regionCount = db.prepare('SELECT COUNT(*) AS n FROM regions').get().n;
  if (regionCount === 0) {
    const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'bali-regions.json'), 'utf-8'));
    const insert = db.prepare(`INSERT OR IGNORE INTO regions (adm4, kabupaten, kecamatan, desa) VALUES (@adm4, @kabupaten, @kecamatan, @desa)`);
    runInTransaction(() => {
      for (const r of regions) insert.run(r);
    });
    console.log(`[db] seeded ${regions.length} regions`);
  }
}

seedIfEmpty();

export function upsertEvent(ev) {
  db.prepare(`
    INSERT INTO events (uuid, tanggal, jam, jenis_bencana, lokasi, keterangan, kabupaten, kecamatan, desa,
      korban_meninggal, korban_luka, korban_hilang, bangunan_rr, bangunan_rs, bangunan_rb, kerugian,
      status_verifikasi, lat, lng, impacts_json)
    VALUES (@uuid, @tanggal, @jam, @jenisBencana, @lokasi, @keterangan, @kabupaten, @kecamatan, @desa,
      @korbanMeninggal, @korbanLuka, @korbanHilang, @bangunanRr, @bangunanRs, @bangunanRb, @kerugian,
      @statusVerifikasi, @lat, @lng, @impactsJson)
    ON CONFLICT(uuid) DO UPDATE SET
      tanggal=excluded.tanggal, jam=excluded.jam, jenis_bencana=excluded.jenis_bencana, lokasi=excluded.lokasi,
      keterangan=excluded.keterangan, kabupaten=excluded.kabupaten, kecamatan=excluded.kecamatan, desa=excluded.desa,
      korban_meninggal=excluded.korban_meninggal, korban_luka=excluded.korban_luka, korban_hilang=excluded.korban_hilang,
      bangunan_rr=excluded.bangunan_rr, bangunan_rs=excluded.bangunan_rs, bangunan_rb=excluded.bangunan_rb,
      kerugian=excluded.kerugian, status_verifikasi=excluded.status_verifikasi, lat=excluded.lat, lng=excluded.lng,
      impacts_json=excluded.impacts_json
  `).run(toEventParams(ev));
}

function rowToEvent(row) {
  return {
    uuid: row.uuid,
    tanggal: row.tanggal,
    jam: row.jam,
    jenisBencana: row.jenis_bencana,
    lokasi: row.lokasi,
    keterangan: row.keterangan,
    kabupaten: row.kabupaten,
    kecamatan: row.kecamatan,
    desa: row.desa,
    korbanMeninggal: row.korban_meninggal,
    korbanLuka: row.korban_luka,
    korbanHilang: row.korban_hilang,
    bangunanRr: row.bangunan_rr,
    bangunanRs: row.bangunan_rs,
    bangunanRb: row.bangunan_rb,
    kerugian: row.kerugian,
    statusVerifikasi: row.status_verifikasi,
    lat: row.lat,
    lng: row.lng,
    impacts: JSON.parse(row.impacts_json || '[]'),
  };
}

export function getEventImpacts(uuid) {
  const row = db.prepare('SELECT impacts_json FROM events WHERE uuid = ?').get(uuid);
  if (!row) return [];
  return JSON.parse(row.impacts_json || '[]');
}

export function getEvents({ start, end } = {}) {
  let rows = db.prepare('SELECT * FROM events').all();
  if (start) rows = rows.filter((r) => r.tanggal >= start);
  if (end) rows = rows.filter((r) => r.tanggal <= end);
  return rows.map(rowToEvent).sort((a, b) => `${b.tanggal} ${b.jam}`.localeCompare(`${a.tanggal} ${a.jam}`));
}

export function getRegions() {
  return db.prepare('SELECT adm4, kabupaten, kecamatan, desa FROM regions').all();
}

export function getSourceStatus(key) {
  const row = db.prepare('SELECT * FROM source_status WHERE key = ?').get(key);
  if (!row) return null;
  return {
    key: row.key,
    status: row.status,
    lastFetch: row.last_fetch,
    nextFetch: row.next_fetch,
    count: row.count,
    error: row.error,
    // { phase: 'list'|'impacts', current, total } while a fetch is running -
    // null the rest of the time (not meaningful once status isn't 'loading').
    progress: row.progress_json ? JSON.parse(row.progress_json) : null,
    // { oldest, newest } tanggal (YYYY-MM-DD) among the events the last
    // completed fetch actually returned - lets an operator see at a glance
    // whether "Rentang Data" is having any effect, instead of just trusting
    // the item count.
    dateRange: row.date_range_json ? JSON.parse(row.date_range_json) : null,
  };
}

export function getAllSourceStatus() {
  return Object.keys(config.fetchIntervalsMinutes).map((key) => getSourceStatus(key));
}

export function setSourceStatus(key, patch) {
  const cur = getSourceStatus(key) || { key, status: 'idle', lastFetch: null, nextFetch: null, count: null, error: null, progress: null, dateRange: null };
  const next = { ...cur, ...patch };
  // node:sqlite throws on named params not referenced in the SQL (unlike
  // better-sqlite3, which ignores extras) - bind exactly the columns used,
  // not a spread of `next` (which carries `progress`/`dateRange`, the
  // objects, while the columns are `progressJson`/`dateRangeJson`, the
  // serialized strings).
  db.prepare(`
    INSERT INTO source_status (key, status, last_fetch, next_fetch, count, error, progress_json, date_range_json)
      VALUES (@key, @status, @lastFetch, @nextFetch, @count, @error, @progressJson, @dateRangeJson)
    ON CONFLICT(key) DO UPDATE SET status=excluded.status, last_fetch=excluded.last_fetch, next_fetch=excluded.next_fetch,
      count=excluded.count, error=excluded.error, progress_json=excluded.progress_json, date_range_json=excluded.date_range_json
  `).run({
    key: next.key,
    status: next.status,
    lastFetch: next.lastFetch,
    nextFetch: next.nextFetch,
    count: next.count,
    error: next.error,
    progressJson: next.progress ? JSON.stringify(next.progress) : null,
    dateRangeJson: next.dateRange ? JSON.stringify(next.dateRange) : null,
  });
  return next;
}

export function getAdminConfig() {
  const row = db.prepare('SELECT * FROM admin_config WHERE id = 1').get();
  return {
    username: row.username,
    passwordHash: row.password_hash,
    passwordEnc: row.password_enc,
    token: row.token,
    tokenExpiresAt: row.token_expires_at,
    fetchSettings: JSON.parse(row.fetch_settings),
  };
}

export function setAdminAuth({ username, passwordHash, passwordEnc, token, tokenExpiresAt }) {
  db.prepare(`
    UPDATE admin_config SET username = ?, password_hash = ?, password_enc = ?, token = ?, token_expires_at = ? WHERE id = 1
  `).run(username, passwordHash, passwordEnc ?? null, token, tokenExpiresAt);
}

export function updateAdminToken(token, tokenExpiresAt) {
  db.prepare(`UPDATE admin_config SET token = ?, token_expires_at = ? WHERE id = 1`).run(token, tokenExpiresAt);
}

export function clearAdminToken() {
  db.prepare(`UPDATE admin_config SET token = NULL, token_expires_at = NULL WHERE id = 1`).run();
}

export function clearAdminPasswordEnc() {
  db.prepare(`UPDATE admin_config SET password_enc = NULL WHERE id = 1`).run();
}

export function setFetchSettings(settings) {
  db.prepare(`UPDATE admin_config SET fetch_settings = ? WHERE id = 1`).run(JSON.stringify(settings));
}

export function cacheWeather(adm4, lokasi, cuaca) {
  db.prepare(`
    INSERT INTO weather_cache (adm4, lokasi_json, cuaca_json, fetched_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(adm4) DO UPDATE SET lokasi_json=excluded.lokasi_json, cuaca_json=excluded.cuaca_json, fetched_at=excluded.fetched_at
  `).run(adm4, JSON.stringify(lokasi || null), JSON.stringify(cuaca || []), Date.now());
}

export function getCachedWeather(adm4) {
  const row = db.prepare('SELECT * FROM weather_cache WHERE adm4 = ?').get(adm4);
  if (!row) return null;
  return { adm4, lokasi: JSON.parse(row.lokasi_json || 'null'), cuaca: JSON.parse(row.cuaca_json || '[]'), fetchedAt: row.fetched_at };
}

export function saveQuakes(list) {
  db.prepare('INSERT INTO quakes (fetched_at, data_json) VALUES (?, ?)').run(Date.now(), JSON.stringify(list));
  db.prepare('DELETE FROM quakes WHERE id NOT IN (SELECT id FROM quakes ORDER BY id DESC LIMIT 1)').run();
}

export function getLatestQuakes() {
  const row = db.prepare('SELECT * FROM quakes ORDER BY id DESC LIMIT 1').get();
  if (!row) return [];
  return JSON.parse(row.data_json);
}

export function getAllEventUuids() {
  return new Set(db.prepare('SELECT uuid FROM events').all().map((r) => r.uuid));
}

export function getNotificationQueue() {
  const row = db.prepare('SELECT events_json FROM notification_queue WHERE id = 1').get();
  return JSON.parse(row?.events_json || '[]');
}

export function pushNotifications(newEvents) {
  if (!newEvents.length) return;
  const current = getNotificationQueue();
  const seen = new Set(current.map((e) => e.uuid));
  const merged = [...current, ...newEvents.filter((e) => !seen.has(e.uuid))];
  db.prepare('UPDATE notification_queue SET events_json = ? WHERE id = 1').run(JSON.stringify(merged));
}

export function clearNotificationQueue() {
  db.prepare(`UPDATE notification_queue SET events_json = '[]' WHERE id = 1`).run();
}
