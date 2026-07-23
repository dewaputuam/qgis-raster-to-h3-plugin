// OSM Overpass building footprints (Stage 4) - matches the design handoff's
// own fixed 1500m fetch radius regardless of the UI's radius selector; the
// client filters the returned list down to whatever radius is selected for
// display, rather than re-querying Overpass on every radius change.
const OVERPASS_RADIUS_METERS = 1500;

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Proxied for the same reason as the SIK/BMKG/InaRISK calls elsewhere in
// this app - a browser POST straight to overpass-api.de hits the same CORS
// wall, and centralizing it here also means only one place needs the
// timeout/retry handling instead of duplicating it client-side.
export async function fetchBuildingFootprints(lat, lng) {
  const query = `[out:json][timeout:20];way["building"](around:${OVERPASS_RADIUS_METERS},${lat},${lng});out geom;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const data = await res.json();
    return (data.elements || [])
      .filter((el) => el.geometry && el.geometry.length > 2)
      .map((el) => {
        const pts = el.geometry;
        const clat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
        const clng = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
        return { latlngs: pts.map((p) => [p.lat, p.lon]), lat: clat, lng: clng, dist: distanceMeters(lat, lng, clat, clng) };
      });
  } finally {
    clearTimeout(timeout);
  }
}
