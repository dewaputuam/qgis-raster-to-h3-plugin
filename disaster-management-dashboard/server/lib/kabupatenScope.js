import { config } from '../config.js';

const KABUPATEN_NAMES = Object.keys(config.kabkotaIds);
const KABUPATEN_LOOKUP = new Map(KABUPATEN_NAMES.map((n) => [n.toLowerCase(), n]));

function titleCaseKabupaten(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Username-pattern fallback, kept only for a session that logged in before
// SIK's own group/subgroup fields were captured (see resolveKabupatenScope
// below, which is preferred whenever available). Matches on a whole
// lowercase token (bounded by non-letter characters or the string edges) so
// a kabupaten name embedded inside an unrelated word can't false-positive.
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

// SIK's own login response already says exactly which kabupaten an account
// is scoped to - `user.group === "USER_KABKOTA"` plus `user.subgroup` (e.g.
// "BULELENG") - ground truth from the API itself, unlike guessing from the
// username string. This matters because the username heuristic and SIK's
// real per-account restriction are two independent things: a real account
// was observed (via a live console log) fetching data for a kabupaten that
// didn't match what its username implied, and a companion QGIS plugin's own
// notes confirm the server-side rule directly ("Akun USER_KABKOTA hanya
// bisa lihat data kabupatennya sendiri"). Preferring the API's own group/
// subgroup removes the guesswork entirely; the username pattern is only a
// fallback for a session that logged in before these fields were persisted.
export function resolveKabupatenScope({ sikGroup, sikSubgroup, username }) {
  if (sikGroup === 'USER_KABKOTA' && sikSubgroup) {
    return KABUPATEN_LOOKUP.get(sikSubgroup.toLowerCase()) || titleCaseKabupaten(sikSubgroup);
  }
  // A known, non-kabupaten group (e.g. a provincial "bidang" account) is
  // authoritative too - it should never fall through to the username guess.
  if (sikGroup) return null;
  return detectKabupatenScope(username);
}
