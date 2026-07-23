// BNPB GIS "Basemap" facility layers - real endpoint URLs extracted from the
// design handoff's own FACILITY_LAYERS reference. Same domain as the
// InaRISK hazard layers (gis.bnpb.go.id), proxied here for the same CORS
// reason - see inarisk.js.
export const FACILITY_LAYERS = [
  { key: 'sekolah', label: 'Sekolah', icon: '🏫', urls: ['https://gis.bnpb.go.id/server/rest/services/Basemap/Sekolah/MapServer/0'] },
  {
    key: 'kesehatan', label: 'Fasilitas Kesehatan', icon: '🏥', urls: [
      'https://gis.bnpb.go.id/server/rest/services/Basemap/Rumah_sakit/MapServer/0',
      'https://gis.bnpb.go.id/server/rest/services/Basemap/Puskesmas/MapServer/0',
    ],
  },
  { key: 'kantor_pemerintah', label: 'Kantor Pemerintah', icon: '🏛️', urls: ['https://gis.bnpb.go.id/server/rest/services/Basemap/Kantor_Pemerintah/MapServer/0'] },
];

// The "Kesehatan" source basemap layer includes non-health features (warung,
// pasar, toko, ...) alongside real hospitals/puskesmas - this filter matches
// the design handoff's own isRealHealthFacility to weed those out.
const HEALTH_INCLUDE_RE = /(rumah sakit|^rs\b|\brs\.|\brsu\b|\brsud\b|puskesmas|\bpustu\b|klinik)/i;
const HEALTH_EXCLUDE_RE = /(warung|^wr\.|\bwr\b|pasar|toko|warkop|rumah makan|kedai|depot)/i;

function isRealHealthFacility(attrs) {
  const text = `${attrs.NAMOBJ || attrs.NAMA || attrs.nama || ''} ${attrs.infrastruk || ''}`.toLowerCase();
  if (HEALTH_EXCLUDE_RE.test(text)) return false;
  return HEALTH_INCLUDE_RE.test(text);
}

async function queryOneUrl(url, lat, lng, radiusMeters) {
  const geometry = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
  const params = new URLSearchParams({
    f: 'json', geometry, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', distance: String(radiusMeters), units: 'esriSRUnit_Meter',
    outFields: '*', returnGeometry: 'true', outSR: '4326',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${url}/query?${params}`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.features || [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// Returns { [layerKey]: [{ lat, lng, attrs }, ...] } for every facility
// layer, queried in parallel per-layer (each layer itself may have >1 real
// source url, e.g. "kesehatan" = Rumah_sakit + Puskesmas merged).
export async function fetchFacilities(lat, lng, radiusMeters) {
  const results = {};
  await Promise.all(FACILITY_LAYERS.map(async (f) => {
    const featureLists = await Promise.all(f.urls.map((url) => queryOneUrl(url, lat, lng, radiusMeters)));
    let feats = featureLists.flat().filter((ft) => ft.geometry && Number.isFinite(ft.geometry.x) && Number.isFinite(ft.geometry.y));
    if (f.key === 'kesehatan') feats = feats.filter((ft) => isRealHealthFacility(ft.attributes || {}));
    results[f.key] = feats.map((ft) => ({ lat: ft.geometry.y, lng: ft.geometry.x, attrs: ft.attributes || {} }));
  }));
  return results;
}
