import { config } from '../config.js';

const KABUPATEN_NAMES = Object.keys(config.kabkotaIds);

// Detects whether a SIK username belongs to a specific kabupaten's own
// account (e.g. "buleleng", "admin_denpasar", "kabupaten.badung") rather
// than a provincial "bidang" account that's meant to see all of Bali.
// Matches on a whole lowercase token (bounded by non-letter characters or
// the string edges) so a kabupaten name embedded inside an unrelated word
// can't false-positive.
export function detectKabupatenScope(username) {
  if (!username) return null;
  const normalized = username.toLowerCase();
  for (const kab of KABUPATEN_NAMES) {
    const needle = kab.toLowerCase();
    const re = new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`);
    if (re.test(normalized)) return kab;
  }
  return null;
}
