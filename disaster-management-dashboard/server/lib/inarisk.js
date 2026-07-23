// BNPB InaRISK hazard layers - real endpoint URLs extracted from the design
// handoff's own HAZARD_LAYERS reference (a working prototype's constant),
// not guessed. `matchJenis` lets the client auto-select whichever layer is
// relevant to a given event's jenisBencana on load.
export const HAZARD_LAYERS = [
  { key: 'banjir', label: 'Banjir', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIR/ImageServer', color: 'oklch(55% 0.14 260)', matchJenis: ['Banjir'] },
  { key: 'banjir_bandang', label: 'Banjir Bandang', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir_bandang_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIRBANDANG/ImageServer', color: 'oklch(48% 0.19 305)', matchJenis: [] },
  { key: 'cuaca_ekstrim', label: 'Cuaca Ekstrem', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_cuaca_ekstrim_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_CUACAEKSTRIM/ImageServer', color: 'oklch(58% 0.14 235)', matchJenis: ['Cuaca Ekstrem'] },
  { key: 'gelombang_abrasi', label: 'Gelombang Ekstrem & Abrasi', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gelombang_ekstrim_dan_abrasi_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gelombang_ekstrim_dan_abrasi/ImageServer', color: 'oklch(60% 0.12 210)', matchJenis: [] },
  { key: 'gempabumi', label: 'Gempa Bumi', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gempabumi_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_GEMPABUMI/ImageServer', color: 'oklch(45% 0.14 30)', matchJenis: [] },
  { key: 'karhutla', label: 'Kebakaran Hutan & Lahan', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kebakaran_hutan_dan_lahan_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_KARHUTLA/ImageServer', color: 'oklch(62% 0.16 55)', matchJenis: ['Kebakaran Hutan dan Lahan'] },
  { key: 'kekeringan', label: 'Kekeringan', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kekeringan_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_KEKERINGAN/ImageServer', color: 'oklch(65% 0.1 80)', matchJenis: [] },
  { key: 'gunungapi', label: 'Letusan Gunung Api', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_letusan_gunungapi_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_GUNUNGAPI/ImageServer', color: 'oklch(45% 0.15 45)', matchJenis: [] },
  { key: 'likuefaksi', label: 'Likuefaksi', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_likuefaksi_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_LIKUEFAKSI/ImageServer', color: 'oklch(55% 0.1 300)', matchJenis: [] },
  { key: 'tanah_longsor', label: 'Tanah Longsor', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tanah_longsor_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_TANAHLONGSOR/ImageServer', color: 'oklch(55% 0.13 75)', matchJenis: ['Tanah Longsor'] },
  { key: 'tsunami', label: 'Tsunami', mapServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tsunami_30/MapServer', imageServerUrl: 'https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_TSUNAMI/ImageServer', color: 'oklch(50% 0.13 250)', matchJenis: [] },
];

export function findHazardLayer(key) {
  return HAZARD_LAYERS.find((l) => l.key === key) || null;
}

// A plain browser fetch() straight to gis.bnpb.go.id for computeHistograms
// (a JSON call, unlike the /export image below) is the CORS risk the design
// handoff itself flags ("Verify these succeed from the target production
// domain... consider a same-origin proxy if they don't"). Proxied here
// through this app's own backend instead of waiting to find out it fails
// in production - matches the existing SIK/BMKG proxy pattern already used
// elsewhere in this app. NOT verified against the real gis.bnpb.go.id
// server (this sandbox has no outbound access to it, same restriction that
// blocks the OSM tile/BMKG calls in dev testing here) - the request shape
// matches the design handoff's own working reference code exactly, but
// treat the response-parsing as unverified until tested from a real
// network environment.
export async function fetchHistogram(imageServerUrl, lat, lng, radiusMeters) {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const geometry = {
    xmin: lng - dLng, ymin: lat - dLat, xmax: lng + dLng, ymax: lat + dLat,
    spatialReference: { wkid: 4326 },
  };
  const params = new URLSearchParams({ geometry: JSON.stringify(geometry), geometryType: 'esriGeometryEnvelope', f: 'json' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${imageServerUrl}/computeHistograms?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`InaRISK computeHistograms HTTP ${res.status}`);
    const data = await res.json();
    const h = data && data.histograms && data.histograms[0];
    if (!h) return { status: 'empty' };
    return { status: 'ok', min: h.min, max: h.max, counts: h.counts };
  } finally {
    clearTimeout(timeout);
  }
}

// The `/export` image overlay (a dynamic map image sized/cropped to the
// current viewport bbox) is loaded directly by the browser as an
// L.imageOverlay <img> src, not proxied - CORS only blocks JS from reading
// pixel data off an image, not from just displaying one, so there's no
// same-origin requirement for this part (only the JSON computeHistograms
// call above needs proxying). Kept here so the URL-building logic (matching
// the design handoff's own buildExportUrl) lives in one place.
export function buildExportUrl(mapServerUrl, bboxWest, bboxSouth, bboxEast, bboxNorth, widthPx, heightPx) {
  const params = new URLSearchParams({
    bbox: [bboxWest, bboxSouth, bboxEast, bboxNorth].join(','),
    bboxSR: '4326', imageSR: '4326',
    size: `${Math.round(widthPx)},${Math.round(heightPx)}`,
    format: 'png32', transparent: 'true', dpi: '96', f: 'image',
  });
  return `${mapServerUrl}/export?${params.toString()}`;
}
