import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import * as db from '../db.js';
import { sikLogin, SikAuthError } from '../lib/sik.js';
import { scheduleSourceFetch, onIntervalChange } from '../lib/scheduler.js';
import { fetchCuaca } from '../lib/bmkg.js';
import { encrypt } from '../lib/crypto.js';
import { isPointInKabupaten } from '../lib/kabupatenPolygons.js';
import { resolveKabupatenScope } from '../lib/kabupatenScope.js';

export const router = Router();

// A logged-in kabupaten-office account scopes every data endpoint to just
// that kabupaten instead of all of Bali - see resolveKabupatenScope, which
// prefers SIK's own login response (user.group/user.subgroup) over
// pattern-matching the username. Derived fresh from stored admin_config
// each call (no separate flag to keep in sync), and persists across a
// token expiring (an install's identity shouldn't flip back to "all of
// Bali" just because the token hasn't refreshed yet) - only a different
// account logging in changes it.
function currentKabupatenScope() {
  const admin = db.getAdminConfig();
  return resolveKabupatenScope({ sikGroup: admin.sikGroup, sikSubgroup: admin.sikSubgroup, username: admin.username });
}

router.get('/quakes', (req, res) => {
  res.json({ data: db.getLatestQuakes() });
});

router.get('/weather', (req, res) => {
  const adm4 = req.query.adm4 || config.defaultAdm4;
  const cached = db.getCachedWeather(adm4) || db.getCachedWeather(config.defaultAdm4);
  if (!cached) return res.json({ data: null });
  res.json({ data: cached });
});

// On-demand lookup for a specific village (e.g. an event's location on the map),
// distinct from the scheduled default-location cache above. Fetches live and
// caches the result so repeat lookups for the same village are fast.
router.get('/weather/lookup', async (req, res) => {
  const adm4 = req.query.adm4;
  if (!adm4) return res.status(400).json({ error: 'adm4 is required' });
  const cached = db.getCachedWeather(adm4);
  if (cached && Date.now() - cached.fetchedAt < 15 * 60000) return res.json({ data: cached });
  try {
    const { lokasi, cuaca } = await fetchCuaca(adm4);
    db.cacheWeather(adm4, lokasi, cuaca);
    res.json({ data: { adm4, lokasi, cuaca, fetchedAt: Date.now() } });
  } catch (err) {
    if (cached) return res.json({ data: cached });
    res.status(502).json({ error: err.message || String(err) });
  }
});

router.get('/events', (req, res) => {
  const { start, end } = req.query;
  const scope = currentKabupatenScope();
  let events = db.getEvents({ start, end }).map((ev) => ({
    ...ev,
    // true/false = checked against the real kabupaten polygon; null = the
    // event's kabupaten/coordinates couldn't be checked (unrecognized name
    // or missing lat/lng) - the client falls back to its own heuristic then.
    locationValid: isPointInKabupaten(ev.kabupaten, ev.lat, ev.lng),
  }));
  if (scope) events = events.filter((ev) => ev.kabupaten === scope);
  res.json({ data: events });
});

router.get('/regions', (req, res) => {
  const scope = currentKabupatenScope();
  const regions = scope ? db.getRegions().filter((r) => r.kabupaten === scope) : db.getRegions();
  res.json({ data: regions });
});

router.get('/admin/sources', (req, res) => {
  res.json({ data: db.getAllSourceStatus() });
});

router.post('/admin/sources/:key/fetch', async (req, res) => {
  const { key } = req.params;
  if (!config.fetchIntervalsMinutes[key]) return res.status(404).json({ error: 'Unknown source' });
  scheduleSourceFetch(key);
  res.json({ ok: true });
});

router.post('/admin/sources/:key/interval', async (req, res) => {
  const { key } = req.params;
  const minutes = Number(req.body?.minutes);
  if (!config.fetchIntervalsMinutes[key]) return res.status(404).json({ error: 'Unknown source' });
  if (!config.allowedIntervalOptions.includes(minutes)) {
    return res.status(400).json({ error: `minutes must be one of ${config.allowedIntervalOptions.join(', ')}` });
  }
  onIntervalChange(key, minutes);
  res.json({ ok: true });
});

// How far back to pull SIK events from (the guide notes server-side date
// filtering on this API is unreliable, so it's applied to the fetched list
// afterward - see fetchAllEvents in lib/sik.js). Unlike the interval route
// above, this used to just save the setting with no re-fetch - the operator
// would change it, see the "Data Ditarik" count stay exactly the same, and
// have no way to tell whether it had taken effect short of separately
// hitting "Fetch Sekarang". Now triggers an immediate fetch under the new
// range, same as changing the interval already did.
router.post('/admin/sik/range-months', (req, res) => {
  const months = Number(req.body?.months);
  if (!config.allowedSikRangeMonthsOptions.includes(months)) {
    return res.status(400).json({ error: `months must be one of ${config.allowedSikRangeMonthsOptions.join(', ')}` });
  }
  const admin = db.getAdminConfig();
  db.setFetchSettings({ ...admin.fetchSettings, sikRangeMonths: months });
  scheduleSourceFetch('sik');
  res.json({ ok: true });
});

router.post('/admin/sik/login', async (req, res) => {
  // No "required" pre-check here: whatever's submitted (including blank)
  // goes straight to the real SIK login call below, and success is judged
  // purely by whether that call actually returns a token - not by any
  // guess here about what a valid username/password should look like.
  const { username = '', password = '', rememberSession } = req.body || {};
  try {
    const { token, user } = await sikLogin(username, password);
    const tokenExpiresAt = Date.now() + config.sikTokenTtlMinutes * 60000;
    const passwordHash = bcrypt.hashSync(password, 10);
    // Opt-in only: encrypted password is what lets the scheduler silently
    // re-login when the token expires, instead of forcing the operator back
    // to this form every ~60 minutes. Deliberate deviation from the SIK
    // guide's "no silent retry" - the operator/BPBD chose this tradeoff.
    const passwordEnc = rememberSession ? encrypt(password) : null;
    // user.group/user.subgroup are SIK's own authoritative answer to which
    // kabupaten (if any) this account is scoped to - see resolveKabupatenScope.
    db.setAdminAuth({ username, passwordHash, passwordEnc, token, tokenExpiresAt, sikGroup: user?.group, sikSubgroup: user?.subgroup });
    db.setSourceStatus('sik', { status: 'idle', error: null });
    scheduleSourceFetch('sik');
    res.json({ loggedIn: true, username, tokenExpiresAt, rememberSession: !!rememberSession });
  } catch (err) {
    if (err instanceof SikAuthError) return res.status(401).json({ error: err.message });
    res.status(502).json({ error: err.message || String(err) });
  }
});

router.post('/admin/sik/logout', (req, res) => {
  db.clearAdminToken();
  db.clearAdminPasswordEnc();
  db.setSourceStatus('sik', { status: 'unauth', nextFetch: null, error: null });
  res.json({ ok: true });
});

router.get('/admin/sik/status', (req, res) => {
  const admin = db.getAdminConfig();
  const loggedIn = !!(admin.token && admin.tokenExpiresAt && Date.now() < admin.tokenExpiresAt);
  res.json({
    loggedIn,
    username: admin.username || null,
    tokenExpiresAt: loggedIn ? admin.tokenExpiresAt : null,
    rememberSession: !!admin.passwordEnc,
    kabupatenScope: currentKabupatenScope(),
  });
});

router.get('/admin/fetch-settings', (req, res) => {
  const fetchSettings = db.getAdminConfig().fetchSettings;
  // Fallback for installs whose stored settings predate this option.
  res.json({ data: { sikRangeMonths: config.defaultSikRangeMonths, ...fetchSettings } });
});

router.get('/notifications', (req, res) => {
  res.json({ data: db.getNotificationQueue() });
});

router.post('/notifications/dismiss', (req, res) => {
  db.clearNotificationQueue();
  res.json({ ok: true });
});
