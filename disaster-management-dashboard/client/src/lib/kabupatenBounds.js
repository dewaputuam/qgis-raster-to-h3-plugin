// Hand-estimated approximate bounding boxes per Bali kabupaten/kota, NOT
// sourced from an official administrative boundary file (no GeoJSON polygon
// data was available). These are coarse rectangles, not real polygons, so:
// - they overlap at shared borders (unavoidable with boxes, real boundaries
//   are irregular)
// - a coordinate can sit right on/near a border and read as "valid" for the
//   wrong neighboring kabupaten
// Good enough to catch genuinely wrong locations (event tagged "Karangasem"
// with coordinates actually in Jembrana), not precise enough for anything
// requiring survey-grade accuracy. Replace with a real GeoJSON boundary
// dataset (e.g. from Badan Informasi Geospasial) if that level of precision
// is ever needed.
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
