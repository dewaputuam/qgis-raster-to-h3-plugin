import { config } from '../config.js';
import { kabupatenFromKecamatan } from './wilayah.js';

export class SikAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SikAuthError';
  }
}

export async function sikLogin(username, password) {
  const res = await fetch(`${config.sikBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, device_name: 'DISASTER_DASHBOARD' }),
  });
  if (res.status === 401) throw new SikAuthError('Username atau password salah.');
  if (!res.ok) throw new Error(`SIK login HTTP ${res.status}`);
  const body = await res.json();
  const token = body && body.data && body.data.token;
  if (!token) throw new Error('Respons login SIK tidak berisi token.');
  return { token, user: body.data.user || null };
}

// Maps the fields documented in the SIK access guide. The guide only documents
// the subset of fields used for chat-style reporting (§4.2) - korban/kerugian/impacts
// come from the detail endpoint and aren't fully specified, so they default to
// empty/zero until the real payload shape is confirmed against a live account.
//
// `kabupaten` used to just be the name the caller already knew from the loop
// (queried one kabupaten at a time via kabkota_id - see fetchAllEvents). That
// depended on the SIK guide's kabkota_id -> kabupaten table (§5), which turned
// out to not match the official Kemendagri kabupaten numbering from position
// 3 onward (Buleleng/Badung and everything after were shifted by one) -
// config.json's kabkotaIds has been corrected to the official order, but
// since that's still an inference about the SIK API's internal IDs, the
// event's own `kecamatan` field is cross-checked against the authoritative
// Kemendagri kecamatan->kabupaten table and wins whenever it resolves to a
// known kabupaten, so a residual ID mismatch can't silently mislabel events.
function mapKejadian(raw, kabupatenName) {
  const kecamatan = (raw.kecamatan && raw.kecamatan.kecamatan) || '';
  const resolvedKabupaten = kabupatenFromKecamatan(kecamatan) || kabupatenName;
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
  const res = await fetch(`${config.sikBaseUrl}/lap-kejadian/${uuid}`, {
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

export async function fetchAllEvents(token, { getPreviousImpacts } = {}) {
  const kabkotaEntries = Object.entries(config.kabkotaIds);
  const results = await Promise.all(
    kabkotaEntries.map(async ([kabupatenName, id]) => {
      const res = await fetch(`${config.sikBaseUrl}/lap-kejadian?kabkota=${id}&per_page=200`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new SikAuthError('Token SIK kedaluwarsa atau tidak valid.');
      if (!res.ok) throw new Error(`SIK lap-kejadian HTTP ${res.status} (kabkota=${id})`);
      const body = await res.json();
      const items = (body && body.data && body.data.data) || [];
      return items.map((raw) => mapKejadian(raw, kabupatenName));
    })
  );
  const events = results.flat();

  let loggedSample = false;
  await mapWithConcurrency(events, 8, async (ev) => {
    try {
      ev.impacts = await fetchEventImpacts(token, ev.uuid, { logSample: !loggedSample });
      loggedSample = true;
    } catch (err) {
      if (err instanceof SikAuthError) throw err;
      // A single event's detail failing shouldn't wipe out previously-synced
      // impact data for it, and shouldn't drop the whole sync either.
      ev.impacts = getPreviousImpacts ? getPreviousImpacts(ev.uuid) : [];
    }
  });

  return events;
}
