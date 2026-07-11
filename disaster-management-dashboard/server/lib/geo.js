import { config } from '../config.js';

const { lat: BALI_LAT, lon: BALI_LON } = config.baliCenter;

export function parseQuakeCoord(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(-?[\d.]+)\s*([A-Za-z]*)/);
  if (!m) return null;
  let val = parseFloat(m[1]);
  const hemi = (m[2] || '').toUpperCase();
  if (hemi === 'LS' || hemi === 'BB') val = -Math.abs(val);
  if (hemi === 'LU' || hemi === 'BT') val = Math.abs(val);
  return val;
}

export function distanceFromBaliKm(lat, lon) {
  if (lat == null || lon == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat - BALI_LAT);
  const dLon = toRad(lon - BALI_LON);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(BALI_LAT)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isNearBali(distanceKm) {
  return distanceKm != null && distanceKm <= config.nearBaliRadiusKm;
}
