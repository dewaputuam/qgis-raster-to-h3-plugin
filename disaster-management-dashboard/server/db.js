import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'app.sqlite'));
db.pragma('journal_mode = WAL');

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
`);

for (const key of Object.keys(config.fetchIntervalsMinutes)) {
  db.prepare(
    `INSERT INTO source_status (key, status) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`
  ).run(key, key === 'sik' ? 'unauth' : 'idle');
}
db.prepare(`INSERT INTO admin_config (id, fetch_settings) VALUES (1, ?) ON CONFLICT(id) DO NOTHING`).run(
  JSON.stringify(config.fetchIntervalsMinutes)
);

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
    const tx = db.transaction((items) => {
      for (const ev of items) {
        insert.run({ ...ev, impactsJson: JSON.stringify(ev.impacts || []) });
      }
    });
    tx(seed);
    console.log(`[db] seeded ${seed.length} events`);
  }

  const regionCount = db.prepare('SELECT COUNT(*) AS n FROM regions').get().n;
  if (regionCount === 0) {
    const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'bali-regions.json'), 'utf-8'));
    const insert = db.prepare(`INSERT OR IGNORE INTO regions (adm4, kabupaten, kecamatan, desa) VALUES (@adm4, @kabupaten, @kecamatan, @desa)`);
    const tx = db.transaction((items) => {
      for (const r of items) insert.run(r);
    });
    tx(regions);
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
  `).run({ ...ev, impactsJson: JSON.stringify(ev.impacts || []) });
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
  };
}

export function getAllSourceStatus() {
  return Object.keys(config.fetchIntervalsMinutes).map((key) => getSourceStatus(key));
}

export function setSourceStatus(key, patch) {
  const cur = getSourceStatus(key) || { key, status: 'idle', lastFetch: null, nextFetch: null, count: null, error: null };
  const next = { ...cur, ...patch };
  db.prepare(`
    INSERT INTO source_status (key, status, last_fetch, next_fetch, count, error) VALUES (@key, @status, @lastFetch, @nextFetch, @count, @error)
    ON CONFLICT(key) DO UPDATE SET status=excluded.status, last_fetch=excluded.last_fetch, next_fetch=excluded.next_fetch, count=excluded.count, error=excluded.error
  `).run(next);
  return next;
}

export function getAdminConfig() {
  const row = db.prepare('SELECT * FROM admin_config WHERE id = 1').get();
  return {
    username: row.username,
    passwordHash: row.password_hash,
    token: row.token,
    tokenExpiresAt: row.token_expires_at,
    fetchSettings: JSON.parse(row.fetch_settings),
  };
}

export function setAdminAuth({ username, passwordHash, token, tokenExpiresAt }) {
  db.prepare(`
    UPDATE admin_config SET username = ?, password_hash = ?, token = ?, token_expires_at = ? WHERE id = 1
  `).run(username, passwordHash, token, tokenExpiresAt);
}

export function clearAdminToken() {
  db.prepare(`UPDATE admin_config SET token = NULL, token_expires_at = NULL WHERE id = 1`).run();
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
