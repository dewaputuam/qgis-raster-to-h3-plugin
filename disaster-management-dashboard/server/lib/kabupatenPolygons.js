import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Real kabupaten/kota boundary polygons for Bali, derived from an official
// administrative boundary GeoJSON (kabupaten identity confirmed via its
// WADMKK name field, cross-checked against the KDPKAB code column - two of
// the nine had an ambiguous dual code, e.g. "51.06/51.03" for Bangli, likely
// from a border-segment merge artifact in the source dissolve, so WADMKK is
// the key here rather than KDPKAB). This replaces the hand-estimated
// rectangular bounding boxes previously used for location verification.
const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/kabupaten-boundaries.geojson');
const geojson = JSON.parse(readFileSync(dataPath, 'utf-8'));

const polygonsByKabupaten = new Map(
  geojson.features.map((f) => [f.properties.kabupaten, f.geometry])
);

// Even-odd ray-casting test for a single ring (array of [lng, lat] points).
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// A polygon's rings are [exterior, hole1, hole2, ...] - inside the exterior
// and not inside any hole.
function pointInPolygon(lng, lat, rings) {
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false;
  }
  return true;
}

function pointInGeometry(lng, lat, geometry) {
  if (geometry.type === 'Polygon') return pointInPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((poly) => pointInPolygon(lng, lat, poly));
  return false;
}

// Returns true/false if the kabupaten is recognized, or null if it isn't (so
// callers can fall back to a different check rather than treating an unknown
// kabupaten name as a hard "invalid").
export function isPointInKabupaten(kabupaten, lat, lng) {
  const geometry = polygonsByKabupaten.get((kabupaten || '').trim());
  if (!geometry || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return pointInGeometry(lng, lat, geometry);
}
