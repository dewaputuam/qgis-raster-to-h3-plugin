import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import * as db from '../db.js';
import { sikLogin, SikAuthError } from '../lib/sik.js';
import { scheduleSourceFetch, onIntervalChange } from '../lib/scheduler.js';
import { fetchCuaca } from '../lib/bmkg.js';

export const router = Router();

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
  res.json({ data: db.getEvents({ start, end }) });
});

router.get('/regions', (req, res) => {
  res.json({ data: db.getRegions() });
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

router.post('/admin/sik/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  try {
    const { token } = await sikLogin(username, password);
    const tokenExpiresAt = Date.now() + config.sikTokenTtlMinutes * 60000;
    const passwordHash = bcrypt.hashSync(password, 10);
    db.setAdminAuth({ username, passwordHash, token, tokenExpiresAt });
    db.setSourceStatus('sik', { status: 'idle', error: null });
    scheduleSourceFetch('sik');
    res.json({ loggedIn: true, username, tokenExpiresAt });
  } catch (err) {
    if (err instanceof SikAuthError) return res.status(401).json({ error: err.message });
    res.status(502).json({ error: err.message || String(err) });
  }
});

router.post('/admin/sik/logout', (req, res) => {
  db.clearAdminToken();
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
  });
});

router.get('/admin/fetch-settings', (req, res) => {
  res.json({ data: db.getAdminConfig().fetchSettings });
});
