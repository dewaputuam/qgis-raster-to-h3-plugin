import { isWithinKabupatenBounds } from './kabupatenBounds.js';

export function isWithinBaliBounds(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat <= -7.8 && lat >= -9.0 && lng >= 114.0 && lng <= 116.0;
}

// "Valid" means both inside Bali at all AND inside the specific kabupaten the
// event claims to be in - catches a coordinate that's technically within
// Bali but doesn't match its own reported kabupaten.
//
// The server computes ev.locationValid against real kabupaten boundary
// polygons (server/lib/kabupatenPolygons.js) - true/false when it could
// check, null when the kabupaten name wasn't recognized. Only fall back to
// the coarse hand-estimated bounding box in that null case.
export function isLocationValid(ev) {
  if (!isWithinBaliBounds(ev.lat, ev.lng)) return false;
  if (ev.locationValid !== null && ev.locationValid !== undefined) return ev.locationValid;
  return isWithinKabupatenBounds(ev.kabupaten, ev.lat, ev.lng);
}
