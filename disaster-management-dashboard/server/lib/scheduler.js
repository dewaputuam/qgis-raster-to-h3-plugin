import { config } from '../config.js';
import * as db from '../db.js';
import { fetchCuaca, fetchGempaTerkini } from './bmkg.js';
import { fetchAllEvents, sikLogin, SikAuthError } from './sik.js';
import { decrypt } from './crypto.js';
import { detectKabupatenScope } from './kabupatenScope.js';

const timers = {};

function isLoggedIn() {
  const admin = db.getAdminConfig();
  return !!(admin.token && admin.tokenExpiresAt && Date.now() < admin.tokenExpiresAt);
}

function hasStoredCredentials() {
  const admin = db.getAdminConfig();
  return !!(admin.username && admin.passwordEnc);
}

function getIntervalMinutes(key) {
  const admin = db.getAdminConfig();
  return (admin.fetchSettings && admin.fetchSettings[key]) || config.fetchIntervalsMinutes[key] || 15;
}

// Falls back to the config default for installs whose stored fetch_settings
// predates this option (ON CONFLICT DO NOTHING on the seed insert means an
// existing row never picks up a newly-added key automatically).
function getSikRangeMonths() {
  const admin = db.getAdminConfig();
  return (admin.fetchSettings && admin.fetchSettings.sikRangeMonths) || config.defaultSikRangeMonths || 3;
}

// Silent re-login using the encrypted password stored at the operator's own
// opt-in ("Ingat sesi ini"). Only ever called from the scheduler, never in
// response to a user action - if the stored credentials themselves are no
// longer valid (password changed, account disabled), this fails and the
// caller falls back to the normal "unauth, please log in" state.
async function attemptSikRelogin() {
  const admin = db.getAdminConfig();
  if (!admin.username || !admin.passwordEnc) return false;
  try {
    const password = decrypt(admin.passwordEnc);
    const { token } = await sikLogin(admin.username, password);
    const tokenExpiresAt = Date.now() + config.sikTokenTtlMinutes * 60000;
    db.updateAdminToken(token, tokenExpiresAt);
    return true;
  } catch (err) {
    if (err instanceof SikAuthError) {
      // Stored password no longer works - stop trying with it, require a
      // fresh manual login rather than fail silently forever.
      db.clearAdminToken();
      db.clearAdminPasswordEnc();
    }
    return false;
  }
}

async function runFetch(key) {
  if (key === 'sik' && !isLoggedIn()) {
    const relogged = hasStoredCredentials() && (await attemptSikRelogin());
    if (!relogged) {
      db.setSourceStatus('sik', { status: 'unauth' });
      return;
    }
  }
  db.setSourceStatus(key, { status: 'loading', error: null });
  try {
    let count = 0;
    if (key === 'sik') {
      let admin = db.getAdminConfig();
      const rangeMonths = getSikRangeMonths();
      const kabupatenScope = detectKabupatenScope(admin.username);
      let events;
      try {
        events = await fetchAllEvents(admin.token, { getPreviousImpacts: db.getEventImpacts, rangeMonths, kabupatenScope });
      } catch (err) {
        if (!(err instanceof SikAuthError) || !(await attemptSikRelogin())) throw err;
        admin = db.getAdminConfig();
        events = await fetchAllEvents(admin.token, { getPreviousImpacts: db.getEventImpacts, rangeMonths, kabupatenScope });
      }
      const existingUuids = db.getAllEventUuids();
      const newOnes = events
        .filter((ev) => !existingUuids.has(ev.uuid))
        .map((ev) => ({ uuid: ev.uuid, jenisBencana: ev.jenisBencana, tanggal: ev.tanggal, jam: ev.jam, kecamatan: ev.kecamatan, kabupaten: ev.kabupaten }));
      db.pushNotifications(newOnes);
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
  if (isLoggedIn() || hasStoredCredentials()) scheduleSourceFetch('sik');
}

export function stopAllSchedules() {
  for (const key of Object.keys(timers)) {
    clearTimeout(timers[key]);
    delete timers[key];
  }
}
