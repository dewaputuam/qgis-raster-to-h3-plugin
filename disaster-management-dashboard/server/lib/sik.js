import { config } from '../config.js';

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
function mapKejadian(raw) {
  return {
    uuid: raw.uuid,
    tanggal: raw.DATE_KEJ || '',
    jam: raw.TIME_KEJ || raw.JAM_KEJ || '',
    jenisBencana: (raw.jenis_bencana && raw.jenis_bencana.JENIS_KEJ) || '?',
    lokasi: raw.LOKASI_KEJ || '',
    keterangan: raw.KETERANGAN || raw.URAIAN_KEJ || '',
    kabupaten: (raw.kabupaten && raw.kabupaten.kabupaten) || (raw.kabkota && raw.kabkota.nama) || '',
    kecamatan: (raw.kecamatan && raw.kecamatan.kecamatan) || '',
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

export async function fetchAllEvents(token) {
  const kabkotaIds = Object.values(config.kabkotaIds);
  const results = await Promise.all(
    kabkotaIds.map(async (id) => {
      const res = await fetch(`${config.sikBaseUrl}/lap-kejadian?kabkota=${id}&per_page=200`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new SikAuthError('Token SIK kedaluwarsa atau tidak valid.');
      if (!res.ok) throw new Error(`SIK lap-kejadian HTTP ${res.status} (kabkota=${id})`);
      const body = await res.json();
      const items = (body && body.data && body.data.data) || [];
      return items.map(mapKejadian);
    })
  );
  return results.flat();
}
