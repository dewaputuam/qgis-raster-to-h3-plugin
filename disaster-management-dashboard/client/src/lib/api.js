async function req(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export const api = {
  getQuakes: () => req('/quakes'),
  getWeather: (adm4) => req(`/weather?adm4=${encodeURIComponent(adm4)}`),
  lookupWeather: (adm4) => req(`/weather/lookup?adm4=${encodeURIComponent(adm4)}`),
  getEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req(`/events${qs ? `?${qs}` : ''}`);
  },
  getEvent: (uuid) => req(`/events/${encodeURIComponent(uuid)}`),
  getRegions: () => req('/regions'),
  getSources: () => req('/admin/sources'),
  getFetchSettings: () => req('/admin/fetch-settings'),
  fetchSourceNow: (key) => req(`/admin/sources/${key}/fetch`, { method: 'POST' }),
  setSourceInterval: (key, minutes) => req(`/admin/sources/${key}/interval`, { method: 'POST', body: JSON.stringify({ minutes }) }),
  setSikRangeMonths: (months) => req('/admin/sik/range-months', { method: 'POST', body: JSON.stringify({ months }) }),
  sikLogin: (username, password, rememberSession) => req('/admin/sik/login', { method: 'POST', body: JSON.stringify({ username, password, rememberSession }) }),
  sikLogout: () => req('/admin/sik/logout', { method: 'POST' }),
  sikStatus: () => req('/admin/sik/status'),
  getHazardLayers: () => req('/hazard-layers'),
  getHazardHistogram: (key, lat, lng, radius) => req(`/hazard-layers/${encodeURIComponent(key)}/histogram?lat=${lat}&lng=${lng}&radius=${radius}`),
  getFacilityLayers: () => req('/facility-layers'),
  getEventFacilities: (uuid, radius) => req(`/events/${encodeURIComponent(uuid)}/facilities?radius=${radius}`),
  getEventBuildings: (uuid) => req(`/events/${encodeURIComponent(uuid)}/buildings`),
  getNotifications: () => req('/notifications'),
  dismissNotifications: () => req('/notifications/dismiss', { method: 'POST' }),
};
