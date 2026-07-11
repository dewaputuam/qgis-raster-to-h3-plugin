import { config } from '../config.js';
import * as db from '../db.js';
import { fetchCuaca, fetchGempaTerkini } from './bmkg.js';
import { fetchAllEvents, SikAuthError } from './sik.js';

const timers = {};

function isLoggedIn() {
  const admin = db.getAdminConfig();
  return !!(admin.token && admin.tokenExpiresAt && Date.now() < admin.tokenExpiresAt);
}

function getIntervalMinutes(key) {
  const admin = db.getAdminConfig();
  return (admin.fetchSettings && admin.fetchSettings[key]) || config.fetchIntervalsMinutes[key] || 15;
}

async function runFetch(key) {
  if (key === 'sik' && !isLoggedIn()) {
    db.setSourceStatus('sik', { status: 'unauth' });
    return;
  }
  db.setSourceStatus(key, { status: 'loading', error: null });
  try {
    let count = 0;
    if (key === 'sik') {
      const admin = db.getAdminConfig();
      const events = await fetchAllEvents(admin.token);
      for (const ev of events) db.upsertEvent(ev);
      count = events.length;
    } else if (key === 'cuaca') {
      const { lokasi, cuaca } = await fetchCuaca(config.defaultAdm4);
      db.cacheWeather(config.defaultAdm4, lokasi, cuaca);
      count = cuaca.length;
    } else if (key === 'gempa') {
      const quakes = await fetchGempaTerkini();
      db.saveQuakes(quakes);
      count = quakes.length;
    }
    const now = Date.now();
    const intervalMin = getIntervalMinutes(key);
    db.setSourceStatus(key, { status: 'ok', lastFetch: now, nextFetch: now + intervalMin * 60000, count, error: null });
    armTimer(key, intervalMin);
  } catch (err) {
    if (err instanceof SikAuthError) {
      db.clearAdminToken();
      db.setSourceStatus('sik', { status: 'unauth', nextFetch: null, error: 'Token kadaluarsa, silakan login kembali.' });
      return;
    }
    db.setSourceStatus(key, { status: 'error', nextFetch: null, error: err.message || String(err) });
    // No auto-retry on error, matching the reference behavior - operator must
    // hit "Fetch Sekarang" or change the interval.
  }
}

function armTimer(key, intervalMin) {
  if (timers[key]) clearTimeout(timers[key]);
  timers[key] = setTimeout(() => runFetch(key), intervalMin * 60000);
}

export function scheduleSourceFetch(key) {
  if (timers[key]) {
    clearTimeout(timers[key]);
    delete timers[key];
  }
  return runFetch(key);
}

export function onIntervalChange(key, minutes) {
  const admin = db.getAdminConfig();
  const next = { ...admin.fetchSettings, [key]: minutes };
  db.setFetchSettings(next);
  return scheduleSourceFetch(key);
}

export function startInitialSchedules() {
  scheduleSourceFetch('cuaca');
  scheduleSourceFetch('gempa');
  if (isLoggedIn()) scheduleSourceFetch('sik');
}

export function stopAllSchedules() {
  for (const key of Object.keys(timers)) {
    clearTimeout(timers[key]);
    delete timers[key];
  }
}
