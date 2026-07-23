import { config } from '../config.js';
import { kabupatenFromKecamatan } from './wilayah.js';

export class SikAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SikAuthError';
  }
}

export async function sikLogin(username, password) {
  // A burst of logins from different kabupaten offices around the same time
  // (e.g. shift start) can trip SIK's own rate limit or transient server
  // errors on this endpoint too, not just the data-fetch ones - retried the
  // same way rather than surfacing a one-off 429/5xx as "login failed".
  const res = await fetchWithRetry(`${config.sikBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, device_name: 'DISASTER_DASHBOARD' }),
  });
  if (res.status === 401) throw new SikAuthError('Username atau password salah.');
  if (res.status === 429) throw new Error('Server SIK sedang membatasi permintaan (429). Coba login lagi dalam beberapa saat.');
  if (!res.ok) throw new Error(`SIK login HTTP ${res.status}`);
  const body = await res.json();
  const token = body && body.data && body.data.token;
  if (!token) throw new Error('Respons login SIK tidak berisi token.');
  return { token, user: body.data.user || null };
}

function titleCaseKabupaten(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Confirmed against a real production response (a raw list-item sample
// logged via onListSample): each kejadian record's `kabupaten` join is an
// object like `{ subgroup: "BADUNG", id, id_ref, ... }` - `subgroup` is the
// actual kabupaten name, uppercased. An earlier version checked for
// `k.kabkota`/`k.kabupaten`/`k.nama`/etc, none of which exist on the real
// object, so this always silently fell through to the (unreliable)
// kecamatan cross-check below.
function directKabupatenFromRaw(raw) {
  const k = raw.kabkota || raw.kabupaten;
  if (!k) return null;
  if (typeof k === 'string') return k;
  const name = k.subgroup || k.kabkota || k.kabupaten || k.nama || k.nama_kabkota || k.nama_kabupaten || null;
  return name ? titleCaseKabupaten(name) : null;
}

// Maps the kejadian list-item fields, cross-referenced against a real
// production response rather than the access guide's own reference code
// (which never fetches beyond page 1 and doesn't document every field).
//
// `kabupaten` resolution order, most to least trustworthy:
// 1. The record's own `kabupaten.subgroup` field (see directKabupatenFromRaw)
//    - straight from the API, no inference involved.
// 2. The event's own `kecamatan` field cross-checked against the official
//    Kemendagri kecamatan->kabupaten table (kabupatenFromKecamatan) - a
//    fallback for the rare case `kabupaten.subgroup` is missing.
//
// Victim/damage/loss figures (korbanMeninggal, korbanLuka*, bangunanR*,
// kerugian) are deliberately left at 0 here, NOT read from this record: the
// list endpoint's own KORBAN_0/1/2 and BANGUNAN_0/1/2 fields have an
// undocumented category order ("urutan kategori belum dikonfirmasi
// persis"), so guessing which index means what would just trade one silent
// wrong-data bug for another. The detail endpoint's `korban_summary` object
// names each category explicitly (meninggal/luka_berat/luka_ringan/hilang)
// - fetchAllEvents overwrites these fields with that authoritative source
// once the detail fetch completes for each event.
function mapKejadian(raw) {
  const kecamatan = (raw.kecamatan && raw.kecamatan.kecamatan) || '';
  const resolvedKabupaten = directKabupatenFromRaw(raw) || kabupatenFromKecamatan(kecamatan) || '';
  return {
    uuid: raw.uuid,
    tanggal: raw.DATE_KEJ || '',
    jam: raw.TIME_KEJ || raw.JAM_KEJ || '',
    jenisBencana: (raw.jenis_bencana && raw.jenis_bencana.JENIS_KEJ) || '?',
    lokasi: raw.LOKASI_KEJ || '',
    keterangan: raw.KETERANGAN || raw.URAIAN_KEJ || '',
    kabupaten: resolvedKabupaten,
    kecamatan,
    desa: (raw.desa && raw.desa.kelurahan) || '',
    korbanMeninggal: 0,
    korbanLuka: 0,
    korbanLukaBerat: 0,
    korbanLukaRingan: 0,
    korbanHilang: 0,
    bangunanRr: 0,
    bangunanRs: 0,
    bangunanRb: 0,
    kerugian: 0,
    statusVerifikasi: raw.STATUS_VERIFIKASI === 1 ? 1 : 0,
    lat: parseFloat(raw.LATTITUDE),
    lng: parseFloat(raw.LONGITUDE),
    impacts: [],
  };
}

// One entry per `area_terdampak` record from the detail endpoint - the
// actual field names, cross-referenced against a real production response:
// LOKASI, TGL_LAPORAN_MASUK, PROGRESS, MENGUNGSI_L/P, SUMBER_INFO,
// CONTACT_PERSON, NOMOR_HP, KETERANGAN, plus nested `kerusakan` (each with
// its own RR/RS/RB/TOTAL_KERUGIAN) and `penanganan` (each with TIM/
// TINDAKAN) arrays - not the flat tglLapor/totalKerugian/penangananTim
// fields an earlier version guessed at (none of which exist on the real
// object, so every impact card and per-area total previously read as
// blank/zero no matter what SIK actually returned).
function mapImpact(raw) {
  const kerusakan = Array.isArray(raw.kerusakan) ? raw.kerusakan : [];
  const penanganan = Array.isArray(raw.penanganan) ? raw.penanganan : [];
  return {
    idDetail: raw.ID_DETAIL ?? null,
    lokasi: raw.LOKASI || '',
    // Each area_terdampak record carries its own real coordinates (confirmed
    // in a live response) - used for plotting actual per-impact map markers
    // (Analisis Detail Bencana) instead of a fabricated scatter position.
    lat: parseFloat(raw.LATTITUDE),
    lng: parseFloat(raw.LONGITUDE),
    tglLaporan: raw.TGL_LAPORAN_MASUK || '',
    jamLaporan: raw.JAM_LAPORAN_MASUK || '',
    progress: Number(raw.PROGRESS ?? 0),
    mengungsiL: Number(raw.MENGUNGSI_L ?? 0),
    mengungsiP: Number(raw.MENGUNGSI_P ?? 0),
    keterangan: raw.KETERANGAN || '',
    sumberInfo: raw.SUMBER_INFO || '',
    contactPerson: raw.CONTACT_PERSON || '',
    nomorHp: raw.NOMOR_HP || '',
    // A single impacted area can have several damaged structures and
    // several response actions logged over time - sum the former, join the
    // latter, rather than assuming there's only ever one of each.
    totalKerugian: kerusakan.reduce((s, k) => s + (parseFloat(k.TOTAL_KERUGIAN) || 0), 0),
    penangananTim: penanganan.map((p) => p.TIM).filter(Boolean).join('; '),
    penangananTindakan: penanganan.map((p) => p.TINDAKAN).filter(Boolean).join('; '),
  };
}

// The detail endpoint's real shape (confirmed against a live account):
// { kejadian, area_terdampak: [...], total_kerugian, total_korban,
//   total_kerusakan, korban_summary: { meninggal, luka_berat, luka_ringan,
//   hilang } } - not `data.impacts`/`data.dampak`/`data.detail_dampak` as an
// earlier version guessed (none of those keys exist on the real response,
// so `rawImpacts` was always `[]` and every impact card and korban/kerugian
// total silently showed blank/zero regardless of what SIK actually had).
async function fetchEventImpacts(token, uuid, { logSample } = {}) {
  const res = await fetchWithRetry(`${config.sikBaseUrl}/lap-kejadian/${uuid}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new SikAuthError('Token SIK kedaluwarsa atau tidak valid.');
  if (!res.ok) throw new Error(`SIK lap-kejadian detail HTTP ${res.status} (uuid=${uuid})`);
  const body = await res.json();
  const data = body && body.data;
  if (logSample) console.log(`[sik] sample raw detail for uuid=${uuid}:`, JSON.stringify(data, null, 2));
  const areaTerdampak = (data && Array.isArray(data.area_terdampak)) ? data.area_terdampak : [];
  const korbanSummary = (data && data.korban_summary) || {};
  // Building-damage severity (ringan/sedang/berat) has no event-level
  // summary field - only an ambiguous BANGUNAN_0/1/2 at the list level
  // (see mapKejadian) - so it's summed here from every kerusakan record
  // across every impacted area, where RR/RS/RB are named explicitly.
  let bangunanRr = 0, bangunanRs = 0, bangunanRb = 0;
  for (const area of areaTerdampak) {
    for (const k of Array.isArray(area.kerusakan) ? area.kerusakan : []) {
      bangunanRr += Number(k.RR) || 0;
      bangunanRs += Number(k.RS) || 0;
      bangunanRb += Number(k.RB) || 0;
    }
  }
  return {
    impacts: areaTerdampak.map(mapImpact),
    totals: {
      kerugian: Number((data && data.total_kerugian) ?? 0),
      korbanMeninggal: Number(korbanSummary.meninggal ?? 0),
      korbanLukaBerat: Number(korbanSummary.luka_berat ?? 0),
      korbanLukaRingan: Number(korbanSummary.luka_ringan ?? 0),
      korbanHilang: Number(korbanSummary.hilang ?? 0),
      bangunanRr, bangunanRs, bangunanRb,
    },
  };
}

// Concurrency-limited map, with an optional per-dispatch delay - so we
// don't fire off requests faster than SIK's own documented ~60/minute
// throttle allows. A companion QGIS plugin's own notes record 8-way (or
// any) concurrent detail-fetching as the direct cause of repeated 429s
// against this same API, resolved there by going fully sequential with a
// mandatory ~500ms gap between requests - matched here via delayMs with
// limit=1 (see fetchAllEvents).
async function mapWithConcurrency(items, limit, fn, { delayMs = 0 } = {}) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      if (delayMs && i > 0) await sleep(delayMs);
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// The guide itself says server-side date filtering on this API is
// unreliable ("filter tanggal via parameter query kadang tidak konsisten di
// sisi server") and should be done client-side after the full list comes
// back - this does that, comparing DATE_KEJ strings (YYYY-MM-DD, so a plain
// string comparison works) against a cutoff.
//
// "N bulan terakhir" is whole calendar months, not a rolling N*30-day
// window: the cutoff is the 1st of the month N months before the current
// one, so the current (partial) month is always included in full alongside
// it - e.g. fetched mid-July, "1 bulan" means the whole of June and July,
// "2 bulan" adds the whole of May, and so on. An earlier version anchored
// on today's day-of-month instead (cutoff = exactly N months back from
// today), which cut off the first half of the current range's oldest month
// depending what day of the month it happened to be run on.
function cutoffDateString(rangeMonths) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() - rangeMonths;
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// SIK enforces a documented ~60 requests/minute throttle (Laravel's default
// sliding-window throttle middleware); a companion QGIS plugin's own notes
// record the backoff that actually works against it in practice: wait 35s,
// retry; wait 70s, retry; wait 70s, retry; give up after 3 attempts. An
// earlier version here waited only 1.5s/3s/4.5s, which doesn't come close
// to respecting a 60/minute budget and likely kept re-triggering 429s on
// retry rather than recovering from them. Retry-After is still honored
// first when the server sends one. Deliberately does NOT retry 401/other
// 4xx - those are real rejections (wrong credentials, bad request), not
// transient load issues.
const RETRY_BACKOFF_SECONDS = [35, 70, 70];

async function fetchWithRetry(url, options, { maxRetries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= maxRetries) return res;
    const retryAfterSec = Number(res.headers.get('retry-after'));
    const fallbackSec = RETRY_BACKOFF_SECONDS[Math.min(attempt, RETRY_BACKOFF_SECONDS.length - 1)];
    await sleep((retryAfterSec > 0 ? retryAfterSec : fallbackSec) * 1000);
  }
}

// A real production response confirmed the first shape (Laravel paginate()
// nested once under `data`: data.data/current_page/last_page/total). The
// other two (an extra `meta` layer, or pagination fields as siblings of a
// flat `data` array) are kept as fallbacks in case a different SIK
// deployment nests it differently - guessing wrong here would silently
// truncate every account to page 1 with no error at all.
function extractPagedShape(body) {
  const d = body && body.data;
  if (Array.isArray(d)) {
    const meta = (body && body.meta) || {};
    return {
      items: d,
      lastPage: meta.last_page ?? meta.lastPage ?? (body && body.last_page) ?? null,
      total: meta.total ?? (body && body.total) ?? null,
    };
  }
  if (d && Array.isArray(d.data)) {
    const meta = d.meta || {};
    return {
      items: d.data,
      lastPage: d.last_page ?? meta.last_page ?? d.lastPage ?? null,
      total: d.total ?? meta.total ?? null,
    };
  }
  return { items: [], lastPage: null, total: null };
}

// `tgl_kejadian` is the confirmed-working date-range parameter for this
// same live API, from a companion QGIS plugin's own trial-and-error notes:
// a single param formatted `YYYY-MM-DD - YYYY-MM-DD` (matching DATE_KEJ's
// own date format - an earlier attempt at `DD/MM/YYYY - DD/MM/YYYY`,
// matching the official Postman collection, was silently ignored: still
// 200 OK, just with no filtering applied). The other guessed names from an
// earlier version are kept alongside as a no-cost safety net in case this
// account's server version differs - unrecognized query params are
// harmless (typical Laravel backends simply ignore them) - but
// `tgl_kejadian` is the one with actual confirmation behind it.
function dateRangeParams(dateRange) {
  if (!dateRange) return '';
  const { from, to } = dateRange;
  return (
    `&tgl_kejadian=${encodeURIComponent(`${from} - ${to}`)}` +
    `&tanggal_awal=${from}&tanggal_akhir=${to}` +
    `&tanggal_dari=${from}&tanggal_sampai=${to}` +
    `&start_date=${from}&end_date=${to}` +
    `&tanggal=${from},${to}`
  );
}

async function fetchKejadianPage(token, page, dateRange) {
  // No `kabkota` filter: omitting it entirely returns every kabupaten's
  // events in one paginated stream (confirmed working in a companion QGIS
  // plugin, "v13"), and a USER_KABKOTA account is restricted server-side to
  // its own kabupaten's data regardless of what's requested - so there's no
  // need to loop over per-kabupaten ids and guess which numeric id belongs
  // to which kabupaten (a guess that was confirmed wrong for at least two
  // kabupaten against a live account). One combined stream is also far
  // fewer requests than nine separate per-kabupaten ones, which matters
  // against SIK's ~60 requests/minute throttle.
  const url = `${config.sikBaseUrl}/lap-kejadian?per_page=200&page=${page}${dateRangeParams(dateRange)}`;
  if (page === 1 && dateRange) console.log(`[sik] requesting with date-range params: ${url}`);
  const res = await fetchWithRetry(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new SikAuthError('Token SIK kedaluwarsa atau tidak valid.');
  if (!res.ok) throw new Error(`SIK lap-kejadian HTTP ${res.status} (page=${page})`);
  const body = await res.json();
  return extractPagedShape(body);
}

// `last_page`/`total` metadata (whatever shape it turned out to be in) is
// only used as a hint/cap here, never trusted on its own - the real
// stopping condition is "the server gave us nothing new", so this keeps
// walking pages even when metadata is missing (lastPage == null) or wrong,
// and stops as soon as a page comes back empty or repeats uuids we already
// have (a server that quietly clamps ?page= back to page 1 for anything out
// of range, rather than erroring, would otherwise loop forever re-adding the
// same page). MAX_PAGES is purely a runaway-loop safety net.
const MAX_PAGES = 500;

async function fetchAllKejadian(token, { onListSample, dateRange, onlyFirstPage } = {}) {
  const first = await fetchKejadianPage(token, 1, dateRange);
  const seenUuids = new Set(first.items.map((it) => it.uuid).filter(Boolean));
  let allItems = first.items;
  let pagesFetched = first.items.length > 0 ? 1 : 0;
  let page = 2;
  // onlyFirstPage (the scheduler's automatic-fetch "incremental" mode): SIK
  // returns newest-first, so page 1 alone already covers every new event
  // since the last cycle for a normal-sized list - walking every remaining
  // page just to re-see already-known older events is the dominant cost of
  // a routine fetch (each one's detail request is paced 500ms apart to
  // respect SIK's throttle). An operator forcing a full resync (the "Fetch
  // Sekarang" button, a Rentang Data change, or logging in) still walks
  // every page as before.
  while (
    !onlyFirstPage &&
    allItems.length > 0 &&
    pagesFetched < MAX_PAGES &&
    (first.lastPage == null || page <= first.lastPage)
  ) {
    const { items } = await fetchKejadianPage(token, page, dateRange);
    if (items.length === 0) break;
    const newItems = items.filter((it) => !it.uuid || !seenUuids.has(it.uuid));
    if (newItems.length === 0) break;
    newItems.forEach((it) => it.uuid && seenUuids.add(it.uuid));
    allItems = allItems.concat(newItems);
    pagesFetched++;
    page++;
  }
  if (onListSample && first.items[0]) {
    onListSample(first.items[0], {
      lastPageMeta: first.lastPage,
      totalMeta: first.total,
      page1Count: first.items.length,
      pagesFetched,
      totalFetched: allItems.length,
    });
  }
  return {
    events: allItems.map(mapKejadian),
    diag: {
      lastPageMeta: first.lastPage, totalMeta: first.total,
      page1Count: first.items.length, pagesFetched, totalFetched: allItems.length,
    },
  };
}

export async function fetchAllEvents(token, { getPreviousEvent, rangeMonths, onProgress, mode = 'full' } = {}) {
  const incremental = mode === 'incremental';
  // Sent as a best-effort server-side date filter (see dateRangeParams) in
  // addition to the client-side cutoff filter further down - if SIK's list
  // endpoint really does default to recent-only data server-side, this is
  // the only way to ever see further back regardless of pagination.
  const dateRange = rangeMonths ? { from: cutoffDateString(rangeMonths), to: todayDateString() } : null;
  const { events: rawEvents, diag } = await fetchAllKejadian(token, {
    dateRange,
    onlyFirstPage: incremental,
    onListSample: (sample, meta) => {
      console.log(`[sik] sample raw list item (meta=${JSON.stringify(meta)}):`, JSON.stringify(sample, null, 2));
    },
  });
  let events = rawEvents;
  if (onProgress) onProgress({ phase: 'list', current: 1, total: 1 });

  if (rangeMonths) {
    const cutoff = cutoffDateString(rangeMonths);
    events = events.filter((ev) => !ev.tanggal || ev.tanggal >= cutoff);
  }

  // Detail-fetching (sequential, paced 500ms apart to respect SIK's ~60/min
  // throttle) is the slow part of a fetch - in 'incremental' mode, an event
  // already stored from a previous fetch reuses that stored korban/kerugian/
  // impacts wholesale instead of hitting the detail endpoint again, since
  // most events don't change after being fetched once. This means a status
  // update on an older event (e.g. penanganan progressing to "selesai")
  // won't be picked up automatically - the operator's own "Fetch Sekarang"
  // (mode: 'full') is how to force a complete detail refresh.
  const toFetchDetail = incremental && getPreviousEvent
    ? events.filter((ev) => !getPreviousEvent(ev.uuid))
    : events;

  let loggedSample = false;
  let impactsDone = 0;
  if (onProgress) onProgress({ phase: 'impacts', current: 0, total: toFetchDetail.length });
  await mapWithConcurrency(toFetchDetail, 1, async (ev) => {
    try {
      const { impacts, totals } = await fetchEventImpacts(token, ev.uuid, { logSample: !loggedSample });
      loggedSample = true;
      ev.impacts = impacts;
      ev.korbanMeninggal = totals.korbanMeninggal;
      ev.korbanLukaBerat = totals.korbanLukaBerat;
      ev.korbanLukaRingan = totals.korbanLukaRingan;
      ev.korbanLuka = totals.korbanLukaBerat + totals.korbanLukaRingan;
      ev.korbanHilang = totals.korbanHilang;
      ev.kerugian = totals.kerugian;
      ev.bangunanRr = totals.bangunanRr;
      ev.bangunanRs = totals.bangunanRs;
      ev.bangunanRb = totals.bangunanRb;
    } catch (err) {
      if (err instanceof SikAuthError) throw err;
      // A single event's detail failing shouldn't wipe out previously-synced
      // data for it, and shouldn't drop the whole sync either.
      const prev = getPreviousEvent ? getPreviousEvent(ev.uuid) : null;
      Object.assign(ev, {
        impacts: prev?.impacts || [],
        korbanMeninggal: prev?.korbanMeninggal ?? 0,
        korbanLukaBerat: prev?.korbanLukaBerat ?? 0,
        korbanLukaRingan: prev?.korbanLukaRingan ?? 0,
        korbanLuka: (prev?.korbanLukaBerat ?? 0) + (prev?.korbanLukaRingan ?? 0),
        korbanHilang: prev?.korbanHilang ?? 0,
        kerugian: prev?.kerugian ?? 0,
        bangunanRr: prev?.bangunanRr ?? 0,
        bangunanRs: prev?.bangunanRs ?? 0,
        bangunanRb: prev?.bangunanRb ?? 0,
      });
    } finally {
      impactsDone++;
      if (onProgress) onProgress({ phase: 'impacts', current: impactsDone, total: toFetchDetail.length });
    }
  }, { delayMs: 500 });

  // Anything skipped above (already known, incremental mode) still needs
  // its stored totals/impacts spliced back in - only its list-level fields
  // (tanggal/lokasi/etc, refreshed from this fetch) were freshly mapped.
  if (incremental && getPreviousEvent) {
    const fetchedUuids = new Set(toFetchDetail.map((ev) => ev.uuid));
    for (const ev of events) {
      if (fetchedUuids.has(ev.uuid)) continue;
      const prev = getPreviousEvent(ev.uuid);
      if (!prev) continue;
      ev.impacts = prev.impacts || [];
      ev.korbanMeninggal = prev.korbanMeninggal ?? 0;
      ev.korbanLukaBerat = prev.korbanLukaBerat ?? 0;
      ev.korbanLukaRingan = prev.korbanLukaRingan ?? 0;
      ev.korbanLuka = (prev.korbanLukaBerat ?? 0) + (prev.korbanLukaRingan ?? 0);
      ev.korbanHilang = prev.korbanHilang ?? 0;
      ev.kerugian = prev.kerugian ?? 0;
      ev.bangunanRr = prev.bangunanRr ?? 0;
      ev.bangunanRs = prev.bangunanRs ?? 0;
      ev.bangunanRb = prev.bangunanRb ?? 0;
    }
  }

  events.paginationDiag = [diag];
  return events;
}
