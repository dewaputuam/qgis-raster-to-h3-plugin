import wilayahBali from './wilayahBali.json';

// Official Kemendagri kecamatan -> kabupaten/kota reference for Bali (57
// kecamatan, no name collisions across kabupaten). This is an exact
// administrative match, not a geometric approximation - use it as the
// primary validity check whenever the event's kecamatan is recognized.
const KECAMATAN_TO_KABUPATEN = new Map(
  Object.entries(wilayahBali.kecamatanToKabupaten).map(([kec, kab]) => [kec.trim().toLowerCase(), kab])
);

export function isKecamatanInKabupaten(kabupaten, kecamatan) {
  const resolved = KECAMATAN_TO_KABUPATEN.get((kecamatan || '').trim().toLowerCase());
  if (!resolved) return null; // unrecognized kecamatan - caller should fall back to bounds
  return resolved === (kabupaten || '').trim();
}

// Hand-estimated approximate bounding boxes per Bali kabupaten/kota, NOT
// sourced from an official administrative boundary file (no GeoJSON polygon
// data was available). These are coarse rectangles, not real polygons, so:
// - they overlap at shared borders (unavoidable with boxes, real boundaries
//   are irregular)
// - a coordinate can sit right on/near a border and read as "valid" for the
//   wrong neighboring kabupaten
// Used only as a fallback when the event's kecamatan doesn't resolve via the
// exact Kemendagri lookup above (e.g. kecamatan missing from the SIK record).
export const KABUPATEN_BOUNDS = {
  Jembrana: { latMin: -8.45, latMax: -8.10, lngMin: 114.35, lngMax: 114.75 },
  Buleleng: { latMin: -8.30, latMax: -8.05, lngMin: 114.65, lngMax: 115.45 },
  Tabanan: { latMin: -8.45, latMax: -8.15, lngMin: 114.80, lngMax: 115.15 },
  Badung: { latMin: -8.85, latMax: -8.45, lngMin: 115.05, lngMax: 115.25 },
  Denpasar: { latMin: -8.75, latMax: -8.60, lngMin: 115.16, lngMax: 115.30 },
  Gianyar: { latMin: -8.65, latMax: -8.35, lngMin: 115.20, lngMax: 115.40 },
  Klungkung: { latMin: -8.78, latMax: -8.45, lngMin: 115.35, lngMax: 115.62 },
  Bangli: { latMin: -8.35, latMax: -8.18, lngMin: 115.28, lngMax: 115.45 },
  Karangasem: { latMin: -8.55, latMax: -8.05, lngMin: 115.40, lngMax: 115.75 },
};

export function isWithinKabupatenBounds(kabupaten, lat, lng) {
  const box = KABUPATEN_BOUNDS[(kabupaten || '').trim()];
  if (!box) return false;
  return lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax;
}
