import { config } from '../config.js';
import { parseQuakeCoord, distanceFromBaliKm, isNearBali } from './geo.js';

export async function fetchCuaca(adm4) {
  const res = await fetch(`${config.bmkgCuacaUrl}?adm4=${encodeURIComponent(adm4)}`);
  if (!res.ok) throw new Error(`BMKG cuaca HTTP ${res.status}`);
  const data = await res.json();
  const entry = data && data.data && data.data[0];
  if (!entry) throw new Error('Data cuaca kosong');
  const cuaca = (entry.cuaca || []).flat();
  return { lokasi: entry.lokasi || null, cuaca };
}

export async function fetchGempaTerkini() {
  const res = await fetch(config.bmkgGempaUrl);
  if (!res.ok) throw new Error(`BMKG gempa HTTP ${res.status}`);
  const data = await res.json();
  const list = data && data.Infogempa && data.Infogempa.gempa;
  if (!Array.isArray(list)) throw new Error('Data gempa kosong');
  return list.map((q) => {
    const lat = parseQuakeCoord(q.Lintang);
    const lon = parseQuakeCoord(q.Bujur);
    const distanceKm = distanceFromBaliKm(lat, lon);
    return { ...q, lat, lon, distanceKm, isNearBali: isNearBali(distanceKm) };
  });
}
