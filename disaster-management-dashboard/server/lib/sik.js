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

// The guide never documents a kabupaten field on the kejadian record itself
// (only kecamatan.kecamatan / desa.kelurahan, both nested join objects) - but
// since those two ARE nested joins, the real API very plausibly also returns
// an equivalent kabkota/kabupaten join directly on each event. These are
// guessed shapes (mirroring the documented kecamatan/desa pattern) to try
// first, since a value straight from the API is strictly more trustworthy
// than anything derived indirectly - confirm/adjust the field name once a
// real raw sample has been logged (see fetchAllEvents' logSample).
function directKabupatenFromRaw(raw) {
  const k = raw.kabkota || raw.kabupaten;
  if (!k) return null;
  if (typeof k === 'string') return k;
  return k.kabkota || k.kabupaten || k.nama || k.nama_kabkota || k.nama_kabupaten || null;
}

// Maps the fields documented in the SIK access guide. The guide only documents
// the subset of fields used for chat-style reporting (§4.2) - korban/kerugian/impacts
// come from the detail endpoint and aren't fully specified, so they default to
// empty/zero until the real payload shape is confirmed against a live account.
//
// `kabupaten` resolution order, most to least trustworthy:
// 1. A kabkota/kabupaten field straight off the raw record, if the API
//    actually returns one (see directKabupatenFromRaw above).
// 2. The event's own `kecamatan` field cross-checked against the official
//    Kemendagri kecamatan->kabupaten table (kabupatenFromKecamatan) - exact
//    and independent of any assumption about the SIK API's internal IDs.
// 3. The name the caller already knew from the loop (queried one kabupaten
//    at a time via kabkota_id - see fetchAllEvents), which depends on the SIK
//    guide's kabkota_id -> kabupaten table (§5). That table turned out to not
//    match the official Kemendagri numbering from position 3 onward
//    (Buleleng/Badung and everything after were shifted by one) -
//    config.json's kabkotaIds has been corrected, but it's still an inference
//    about the SIK API's internal IDs, so it's only the last resort here.
function mapKejadian(raw, kabupatenName) {
  const kecamatan = (raw.kecamatan && raw.kecamatan.kecamatan) || '';
  const resolvedKabupaten = directKabupatenFromRaw(raw) || kabupatenFromKecamatan(kecamatan) || kabupatenName;
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
    korbanMeninggal: Number(raw.KORBAN_MENINGGAL ?? 0),
    korbanLuka: Number(raw.KORBAN_LUKA ?? 0),
    korbanHilang: Number(raw.KORBAN_HILANG ?? 0),
    bangunanRr: Number(raw.BANGUNAN_RR ?? 0),
    bangunanRs: Number(raw.BANGUNAN_RS ?? 0),
    bangunanRb: Number(raw.BANGUNAN_RB ?? 0),
    kerugian: Number(raw.KERUGIAN ?? 0),
    statusVerifikasi: raw.STATUS_VERIFIKASI === 1 ? 1 : 0,
    lat: parseFloat(raw.LATTITUDE),
    lng: parseFloat(raw.LONGITUDE),
    impacts: Array.isArray(raw.impacts) ? raw.impacts : [],
  };
}

// The impact/dampak record's own field names aren't documented either - the
// guide only says the detail endpoint (§4.3) "berisi area terdampak, data
// korban, kerusakan, dan riwayat penanganan". Each impact record carries the
// parent kejadian's `uuid` (a plain back-reference, not something we need to
// join on ourselves since we already fetch one specific event's detail at a
// time) - kept here so it round-trips if the UI ever needs it directly.
function mapImpact(raw) {
  return {
    idDetail: raw.idDetail ?? raw.ID_DETAIL ?? raw.id ?? null,
    kejadianUuid: raw.uuid ?? null,
    tglLaporan: raw.tglLaporan ?? raw.TGL_LAPOR ?? raw.tgl_lapor ?? '',
    progress: Number(raw.progress ?? raw.PROGRESS ?? 0),
    mengungsiL: Number(raw.mengungsiL ?? raw.MENGUNGSI_L ?? 0),
    mengungsiP: Number(raw.mengungsiP ?? raw.MENGUNGSI_P ?? 0),
    totalKerugian: Number(raw.totalKerugian ?? raw.TOTAL_KERUGIAN ?? 0),
    totalKorban: Number(raw.totalKorban ?? raw.TOTAL_KORBAN ?? 0),
    totalKerusakan: Number(raw.totalKerusakan ?? raw.TOTAL_KERUSAKAN ?? 0),
    korbanMeninggal: Number(raw.korbanMeninggal ?? raw.KORBAN_MENINGGAL ?? 0),
    korbanLukaBerat: Number(raw.korbanLukaBerat ?? raw.KORBAN_LUKA_BERAT ?? 0),
    korbanLukaRingan: Number(raw.korbanLukaRingan ?? raw.KORBAN_LUKA_RINGAN ?? 0),
    korbanHilang: Number(raw.korbanHilang ?? raw.KORBAN_HILANG ?? 0),
    sumberInfo: raw.sumberInfo ?? raw.SUMBER_INFO ?? '',
    contactPerson: raw.contactPerson ?? raw.CONTACT_PERSON ?? '',
    nomorHp: raw.nomorHp ?? raw.NOMOR_HP ?? '',
    penangananTim: raw.penangananTim ?? raw.PENANGANAN_TIM ?? '',
    penangananTindakan: raw.penangananTindakan ?? raw.PENANGANAN_TINDAKAN ?? '',
  };
}

async function fetchEventImpacts(token, uuid, { logSample } = {}) {
  const res = await fetchWithRetry(`${config.sikBaseUrl}/lap-kejadian/${uuid}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new SikAuthError('Token SIK kedaluwarsa atau tidak valid.');
  if (!res.ok) throw new Error(`SIK lap-kejadian detail HTTP ${res.status} (uuid=${uuid})`);
  const body = await res.json();
  const data = body && body.data;
  if (logSample) console.log(`[sik] sample raw detail for uuid=${uuid}:`, JSON.stringify(data, null, 2));
  const rawImpacts = (data && (data.impacts || data.dampak || data.detail_dampak || (Array.isArray(data) ? data : null))) || [];
  return rawImpacts.map(mapImpact);
}

// Simple concurrency-limited map so we don't fire off one request per event
// all at once against a small government API.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
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

// SIK is a small government API, not built to take nine simultaneous list
// requests plus a burst of per-event detail requests (or, it turns out,
// several kabupaten offices' logins landing close together) - retries a 429
// (rate limited) or 5xx (server-side hiccup) with backoff instead of failing
// outright, honoring Retry-After when the server sends one. Deliberately
// does NOT retry 401/other 4xx - those are real rejections (wrong
// credentials, bad request), not transient load issues.
async function fetchWithRetry(url, options, { maxRetries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= maxRetries) return res;
    const retryAfterSec = Number(res.headers.get('retry-after'));
    await sleep(retryAfterSec > 0 ? retryAfterSec * 1000 : (attempt + 1) * 1500);
  }
}

// SIK's real pagination envelope isn't documented, and this has only ever
// been tested against mock servers built to match a *guess* at the shape
// (Laravel paginate() nested once under `data`: data.data/current_page/
// last_page/total). A live deployment could just as easily nest an extra
// `meta` layer (data.meta.last_page, common for API Resource collections)
// or put the items straight on `data` with pagination fields as siblings
// of it instead of nested inside. All three are tried here instead of
// assuming only the first shape, since guessing wrong silently truncates
// every account to page 1 with no error at all - exactly the failure mode
// under investigation ("still only 69 items no matter the range").
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

// The guide's own note ("filter tanggal via parameter query kadang tidak
// konsisten di sisi server") plus a real account confirmed by direct
// observation - the item count and date range returned never move no
// matter what "Rentang Data" is set to, even though the client-side cutoff
// filter (cutoffDateString) is independently verified to work when older
// data is actually present. The likeliest explanation left is that SIK's
// list endpoint itself defaults to only recent data server-side unless a
// date query param is passed, and neither this app nor the guide's own
// reference code (which never sends one either) has ever supplied one.
// The exact param name isn't documented and couldn't be inspected via the
// portal's own UI (it has no browser devtools of its own to inspect - that
// belongs to the browser, not to SIK), so several of the most common
// Indonesian gov-API conventions are sent at once here on a best-effort
// basis. Unrecognized query params are harmless (typical REST/Laravel
// backends simply ignore them), so this can't make things worse even if
// every guess misses - and the client-side cutoff filter in fetchAllEvents
// still applies regardless, so correctness never depends on one of these
// guesses actually landing.
function dateRangeParams(dateRange) {
  if (!dateRange) return '';
  const { from, to } = dateRange;
  return (
    `&tanggal_awal=${from}&tanggal_akhir=${to}` +
    `&tanggal_dari=${from}&tanggal_sampai=${to}` +
    `&start_date=${from}&end_date=${to}` +
    `&tanggal=${from},${to}`
  );
}

async function fetchKejadianPage(kabkotaId, token, page, dateRange) {
  const url = `${config.sikBaseUrl}/lap-kejadian?kabkota=${kabkotaId}&per_page=200&page=${page}${dateRangeParams(dateRange)}`;
  // Printed so an operator can confirm, straight from their own server
  // console, exactly which date-param guesses were actually sent - no
  // browser devtools needed (those belong to whatever browser someone
  // views SIK's own portal in, not to this app or to SIK itself).
  if (page === 1 && dateRange) console.log(`[sik] requesting with date-range guesses: ${url}`);
  const res = await fetchWithRetry(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new SikAuthError('Token SIK kedaluwarsa atau tidak valid.');
  if (!res.ok) throw new Error(`SIK lap-kejadian HTTP ${res.status} (kabkota=${kabkotaId}, page=${page})`);
  const body = await res.json();
  return extractPagedShape(body);
}

// `last_page`/`total` metadata (whatever shape it turned out to be in) is
// only used as a hint/cap here, never trusted on its own - the real
// stopping condition is "the server gave us nothing new", so this keeps
// walking pages even when metadata is missing (lastPage === null) or wrong,
// and stops as soon as a page comes back empty or repeats uuids we already
// have (a server that quietly clamps ?page= back to page 1 for anything out
// of range, rather than erroring, would otherwise loop forever re-adding the
// same page). MAX_PAGES is purely a runaway-loop safety net.
const MAX_PAGES_PER_KABKOTA = 200;

async function fetchAllKejadianForKabkota(kabkotaId, kabupatenName, token, { onListSample, dateRange } = {}) {
  const first = await fetchKejadianPage(kabkotaId, token, 1, dateRange);
  const seenUuids = new Set(first.items.map((it) => it.uuid).filter(Boolean));
  let allItems = first.items;
  let pagesFetched = first.items.length > 0 ? 1 : 0;
  let page = 2;
  while (
    allItems.length > 0 &&
    pagesFetched < MAX_PAGES_PER_KABKOTA &&
    (first.lastPage == null || page <= first.lastPage)
  ) {
    const { items } = await fetchKejadianPage(kabkotaId, token, page, dateRange);
    if (items.length === 0) break;
    const newItems = items.filter((it) => !it.uuid || !seenUuids.has(it.uuid));
    if (newItems.length === 0) break;
    newItems.forEach((it) => it.uuid && seenUuids.add(it.uuid));
    allItems = allItems.concat(newItems);
    pagesFetched++;
    page++;
  }
  if (onListSample) {
    onListSample(kabkotaId, kabupatenName, first.items[0] || null, {
      lastPageMeta: first.lastPage,
      totalMeta: first.total,
      page1Count: first.items.length,
      pagesFetched,
      totalFetched: allItems.length,
    });
  }
  return { events: allItems.map((raw) => mapKejadian(raw, kabupatenName)), diag: {
    kabupaten: kabupatenName, kabkotaId,
    lastPageMeta: first.lastPage, totalMeta: first.total,
    page1Count: first.items.length, pagesFetched, totalFetched: allItems.length,
  } };
}

// The numeric id this app sends as `?kabkota=` is SIK's own internal
// numbering, not the official Kemendagri code - and it does NOT reliably
// match config.json's guessed name->id table. Confirmed against a live
// account's console output: querying kabkota=1 (config guesses "Jembrana")
// actually returned Badung's events (kabupaten.subgroup="BADUNG",
// id_ref=3); kabkota=2 (config guesses "Tabanan") actually returned
// Bangli's (id_ref=6). Only kabkota=7 (Karangasem) happened to line up.
// A scoped kabupaten-office account that only ever queries its assumed id
// (see fetchAllEvents below) would then silently keep pulling a DIFFERENT
// kabupaten's data forever - it would look like the account has no events
// at all once anything filters by the (correct) scope name, which doesn't
// match what actually came back. This samples page 1 of every configured
// id and reads the reliable `kabupaten.subgroup` field SIK returns on each
// record to learn the true id -> kabupaten mapping, so callers can use a
// verified id instead of the guess. Caching this (see scheduler.js) means
// the discovery cost (9 lightweight requests) is paid once, not every fetch.
export async function discoverKabkotaMapping(token) {
  const ids = Object.values(config.kabkotaIds);
  const mapping = {};
  await mapWithConcurrency(ids, 3, async (id) => {
    try {
      const { items } = await fetchKejadianPage(id, token, 1);
      const subgroup = items[0] && items[0].kabupaten && items[0].kabupaten.subgroup;
      if (subgroup) mapping[id] = titleCaseKabupaten(subgroup);
    } catch (err) {
      if (err instanceof SikAuthError) throw err;
      // A single id failing (e.g. genuinely zero events ever) shouldn't
      // block discovering the rest.
    }
  });
  return mapping;
}

function titleCaseKabupaten(subgroup) {
  return subgroup.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchAllEvents(token, { getPreviousImpacts, rangeMonths, kabupatenScope, kabkotaIdOverrides, onProgress } = {}) {
  // kabkotaIdOverrides carries any id->kabupaten corrections learned by
  // discoverKabkotaMapping (see scheduler.js) - preferred over the
  // config.json guess wherever a correction has actually been discovered.
  const allEntries = Object.entries(config.kabkotaIds).map(([name, id]) => {
    const override = kabkotaIdOverrides && Object.entries(kabkotaIdOverrides).find(([, n]) => n === name);
    return [name, override ? Number(override[0]) : id];
  });
  // A kabupaten-office account only ever needs its own kabupaten's data -
  // pulling all nine (then discarding 8/9 of it at read time via the scope
  // filter in routes/api.js) wastes requests against a real, rate-limited
  // external API for no benefit, and was the direct cause of a 429 for a
  // scoped account that had no reason to be fetching every other kabupaten.
  const kabkotaEntries = kabupatenScope
    ? allEntries.filter(([name]) => name === kabupatenScope)
    : allEntries;
  // Sent as a best-effort server-side date filter (see dateRangeParams) in
  // addition to the client-side cutoff filter further down - if SIK's list
  // endpoint really does default to recent-only data server-side, this is
  // the only way to ever see further back regardless of pagination.
  const dateRange = rangeMonths ? { from: cutoffDateString(rangeMonths), to: todayDateString() } : null;
  let loggedListSample = false;
  let listDone = 0;
  const results = await Promise.all(
    kabkotaEntries.map(async ([kabupatenName, id], i) => {
      // Stagger the start of each request slightly instead of firing all of
      // them in the same instant - still concurrent, just not a single burst.
      await sleep(i * 250);
      const { events: mapped, diag } = await fetchAllKejadianForKabkota(id, kabupatenName, token, {
        dateRange,
        onListSample: (kabkotaId, name, sample, meta) => {
          if (loggedListSample) return;
          loggedListSample = true;
          console.log(`[sik] sample raw list item (kabkota=${kabkotaId}, expected kabupaten=${name}, meta=${JSON.stringify(meta)}):`, JSON.stringify(sample, null, 2));
        },
      });
      listDone++;
      if (onProgress) onProgress({ phase: 'list', current: listDone, total: kabkotaEntries.length });
      return { mapped, diag };
    })
  );
  let events = results.flatMap((r) => r.mapped);
  // Per-kabupaten pagination diagnostics (page count, per-page item count,
  // whatever last_page/total metadata the server sent) - surfaced up to
  // Kelola Data so an operator can see directly on the page whether the
  // "still stuck at N items" issue is SIK's own data ceiling (pagesFetched
  // === 1, lastPageMeta === 1 or null) or pagination actually being cut
  // short, without needing to dig through the server's console output.
  const paginationDiag = results.map((r) => r.diag);

  if (rangeMonths) {
    const cutoff = cutoffDateString(rangeMonths);
    events = events.filter((ev) => !ev.tanggal || ev.tanggal >= cutoff);
  }

  let loggedSample = false;
  let impactsDone = 0;
  if (onProgress) onProgress({ phase: 'impacts', current: 0, total: events.length });
  await mapWithConcurrency(events, 8, async (ev) => {
    try {
      ev.impacts = await fetchEventImpacts(token, ev.uuid, { logSample: !loggedSample });
      loggedSample = true;
    } catch (err) {
      if (err instanceof SikAuthError) throw err;
      // A single event's detail failing shouldn't wipe out previously-synced
      // impact data for it, and shouldn't drop the whole sync either.
      ev.impacts = getPreviousImpacts ? getPreviousImpacts(ev.uuid) : [];
    } finally {
      impactsDone++;
      if (onProgress) onProgress({ phase: 'impacts', current: impactsDone, total: events.length });
    }
  });

  events.paginationDiag = paginationDiag;
  return events;
}
