import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { toPng } from 'html-to-image';
import { THEME, themeVars, severityColor } from '../theme.js';
import { Icon, DisasterIcon, ChevronIcon, disasterMarkerSvgHtml, WeatherIcon } from '../icons.jsx';
import { api } from '../lib/api.js';
import { formatRupiah } from '../lib/format.js';
import { mapFocusUrl } from '../lib/nav.js';

function norm(s) {
  return (s || '').toString().trim().toLowerCase();
}

// Shared with App.jsx - dark mode should stay in sync whichever page you're
// on, not reset when navigating here from the main dashboard.
const DARK_MODE_KEY = 'disaster-dashboard-dark-mode';

// Stage 1 (shell + routing): header, two-column map/sidebar layout, the
// collapsible "Ringkasan Kejadian" card with real event data, and the
// Profil Wilayah / Detil Kejadian tab shell. The GIS-heavy cards (hazard
// layers, facilities, buildings, demographics) that actually populate those
// tabs land in later stages - see the design handoff's own 6-stage plan.
export default function AnalisisDetailBencana() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(DARK_MODE_KEY) === '1');
  const [uuid] = useState(() => new URLSearchParams(window.location.search).get('uuid') || '');
  const [event, setEvent] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [tab, setTab] = useState('profil');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showImpactMarkers, setShowImpactMarkers] = useState(true);

  // Radius analysis (Stage 2): a preset (300/800/1500m) or a custom value
  // once applied - distance-only zones for visual/analytical context, not
  // an official risk model (see the footnote rendered with them).
  const [radiusPreset, setRadiusPreset] = useState(800);
  const [customRadiusInput, setCustomRadiusInput] = useState('800');
  const [customRadiusApplied, setCustomRadiusApplied] = useState(null);
  const [floatingTab, setFloatingTab] = useState('pengaturan');
  const [showInset, setShowInset] = useState(false);
  const selectedRadius = customRadiusApplied ?? radiusPreset;

  // Hazard layers (Stage 3, BNPB InaRISK) - `hazardLayers` is the static
  // list from the server (see /api/hazard-layers); `layerToggles` is which
  // ones are currently checked; `histograms` caches each toggled layer's
  // computeHistograms result (loading/ok/empty/error) keyed by layer key.
  const [hazardLayers, setHazardLayers] = useState([]);
  const [layerToggles, setLayerToggles] = useState({});
  const [histograms, setHistograms] = useState({});
  const [legendaExpanded, setLegendaExpanded] = useState(false);
  const [hazardInfoOpen, setHazardInfoOpen] = useState(false);
  const autoSelectedRef = useRef(false);

  // Facilities (Stage 4, BNPB GIS Basemap) - `facilityLayers` is the static
  // list from the server; `facilityToggles` is which are checked;
  // `facilityData` holds the last successful fetch's points per layer key
  // (re-fetched as one combined request whenever the event or radius
  // changes, since the query itself is radius-scoped server-side).
  const [facilityLayers, setFacilityLayers] = useState([]);
  const [facilityToggles, setFacilityToggles] = useState({});
  const [facilityStatus, setFacilityStatus] = useState('idle');
  const [facilityData, setFacilityData] = useState({});
  const [facilityInfoOpen, setFacilityInfoOpen] = useState(false);

  // Buildings (Stage 4, OSM Overpass) - fetched once per event (server
  // fetches a fixed 1500m radius - see buildings.js); `buildings` is then
  // filtered client-side to whatever radius is currently selected.
  const [buildingLayerOn, setBuildingLayerOn] = useState(false);
  const [buildingStage, setBuildingStage] = useState('idle');
  const [buildings, setBuildings] = useState([]);

  // Demographics & weather (Stage 5) - `regions` (kab/kec/desa -> BMKG adm4,
  // already used elsewhere for the same lookup - see EventDetailCard.jsx)
  // and `demografiDesa` (the bundled BPS dataset) are each loaded once;
  // `weatherStatus`/`weather` follow the same loading/notfound/empty/error
  // states as the existing weather lookups on the main dashboard.
  const [regions, setRegions] = useState([]);
  const [weatherStatus, setWeatherStatus] = useState('loading');
  const [weather, setWeather] = useState(null);
  const [demografiDesa, setDemografiDesa] = useState([]);

  const rootRef = useRef(null);
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const impactLayerRef = useRef(null);
  const impactMarkersRef = useRef({});
  const ringsLayerRef = useRef(null);
  const insetElRef = useRef(null);
  const insetMapRef = useRef(null);
  const insetRectRef = useRef(null);
  const hazardOverlaysRef = useRef({});
  const facilityOverlaysRef = useRef({});
  const facilityMarkersRef = useRef({});
  const buildingLayerRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    if (!uuid) { setLoadError('missing-uuid'); return; }
    api.getEvent(uuid).then((r) => setEvent(r.data)).catch(() => setLoadError('not-found'));
  }, [uuid]);

  useEffect(() => {
    localStorage.setItem(DARK_MODE_KEY, darkMode ? '1' : '0');
  }, [darkMode]);

  useEffect(() => {
    document.body.style.background = darkMode ? 'oklch(16% 0.014 260)' : 'oklch(98.5% 0.004 250)';
  }, [darkMode]);

  // Map init - once, when the event and its container are both ready.
  useEffect(() => {
    if (!event || !mapElRef.current || mapRef.current) return;
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
    const map = L.map(mapElRef.current, { zoomControl: true, attributionControl: true }).setView([event.lat, event.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const icon = L.divIcon({
      className: '',
      html: disasterMarkerSvgHtml(event.jenisBencana, severityColor(event.jenisBencana), false, false),
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([event.lat, event.lng], { icon }).addTo(map).bindPopup(`<b>${event.jenisBencana}</b><br/>${event.lokasi || ''}`);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [event]);

  // Impact markers (real per-area coordinates, not a fabricated scatter -
  // see mapImpact in sik.js) - simple numbered pins, toggled by the summary
  // card's checkbox.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !event) return;
    if (impactLayerRef.current) {
      map.removeLayer(impactLayerRef.current);
      impactLayerRef.current = null;
    }
    impactMarkersRef.current = {};
    if (!showImpactMarkers) return;
    const group = L.layerGroup();
    (event.impacts || []).forEach((im, i) => {
      if (!Number.isFinite(im.lat) || !Number.isFinite(im.lng)) return;
      const icon = L.divIcon({
        className: '',
        html: `<div class="fac-marker-inner" style="width:22px;height:22px;border-radius:50%;background:oklch(55% 0.18 25);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([im.lat, im.lng], { icon }).addTo(group).bindPopup(`<b>Dampak #${i + 1}</b><br/>${im.lokasi || ''}`);
      impactMarkersRef.current[i] = marker;
    });
    group.addTo(map);
    impactLayerRef.current = group;
  }, [event, showImpactMarkers]);

  // Radius rings: the 3 presets always drawn for scale context (300m solid,
  // 800m dashed, 1500m dotted, muted color), plus the currently-selected
  // radius (whichever preset, or a custom value) redrawn on top in accent
  // color with a pulsing highlight - a custom radius doesn't remove the
  // preset rings, it just means the highlight sits at a size that may not
  // match any of them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !event || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
    if (ringsLayerRef.current) {
      map.removeLayer(ringsLayerRef.current);
      ringsLayerRef.current = null;
    }
    const center = [event.lat, event.lng];
    const group = L.layerGroup();
    const accentColor = (darkMode ? THEME.dark : THEME.light).accentStrong;
    const mutedColor = 'oklch(55% 0.02 255)';
    const PRESETS = [
      { r: 300, dash: null },
      { r: 800, dash: '6 6' },
      { r: 1500, dash: '2 6' },
    ];
    PRESETS.forEach(({ r, dash }) => {
      const isSelected = customRadiusApplied == null && radiusPreset === r;
      L.circle(center, {
        radius: r,
        color: isSelected ? accentColor : mutedColor,
        weight: isSelected ? 3 : 1.5,
        opacity: isSelected ? 0.9 : 0.45,
        fillOpacity: 0,
        dashArray: dash,
        className: isSelected ? 'adb-ring-selected' : '',
      }).addTo(group);
    });
    if (customRadiusApplied != null) {
      L.circle(center, {
        radius: customRadiusApplied,
        color: accentColor,
        weight: 3,
        opacity: 0.9,
        fillOpacity: 0,
        className: 'adb-ring-selected',
      }).addTo(group);
    }
    group.addTo(map);
    ringsLayerRef.current = group;

    // L.latLng(...).toBounds(sizeInMeters) computes bounds directly from the
    // point + a size, with no dependency on any layer being attached to a
    // map first (unlike calling .getBounds() on a not-yet-added L.circle,
    // which throws since it needs the layer's own rendered pixel geometry).
    const bounds = L.latLng(center).toBounds(selectedRadius * 2);
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
  }, [event, radiusPreset, customRadiusApplied, selectedRadius, darkMode]);

  // Fetch the static hazard layer list once (see /api/hazard-layers).
  useEffect(() => {
    api.getHazardLayers().then((r) => setHazardLayers(r.data)).catch(() => setHazardLayers([]));
  }, []);

  // Auto-select whichever hazard layer matches this event's jenisBencana,
  // once, the first time both the event and the layer list are available -
  // matches the design handoff's own behavior (a Tanah Longsor event starts
  // with the Tanah Longsor layer already checked, not empty).
  useEffect(() => {
    if (autoSelectedRef.current || !event || hazardLayers.length === 0) return;
    autoSelectedRef.current = true;
    const match = hazardLayers.find((l) => (l.matchJenis || []).includes(event.jenisBencana));
    if (match) setLayerToggles((prev) => ({ ...prev, [match.key]: true }));
  }, [event, hazardLayers]);

  // Histogram fetch (proxied - see server/lib/inarisk.js for why) for every
  // currently-toggled layer, re-fetched whenever the radius changes since
  // the histogram is computed over a bbox derived from it. NOT verified
  // against the real BNPB server in this sandbox (no outbound access to
  // gis.bnpb.go.id here) - the request shape matches the design handoff's
  // own reference code, but the response parsing is unverified until
  // tested from a real network environment.
  useEffect(() => {
    if (!event || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
    const activeKeys = Object.entries(layerToggles).filter(([, on]) => on).map(([k]) => k);
    activeKeys.forEach((key) => {
      setHistograms((prev) => ({ ...prev, [key]: { status: 'loading' } }));
      api.getHazardHistogram(key, event.lat, event.lng, selectedRadius)
        .then((r) => setHistograms((prev) => ({ ...prev, [key]: r.data })))
        .catch(() => setHistograms((prev) => ({ ...prev, [key]: { status: 'error' } })));
    });
  }, [event, layerToggles, selectedRadius]);

  // Hazard image overlays - each toggled layer's ArcGIS MapServer `/export`
  // image, sized/cropped to the map's current viewport and refreshed on
  // every pan/zoom so it stays aligned (the export endpoint renders a fresh
  // image per bbox rather than serving static tiles). Loaded directly by
  // the browser (not proxied) - CORS blocks JS from reading pixel data off
  // an image, not from displaying one via <img>/L.imageOverlay, so this
  // part doesn't need the same server-side proxy as the JSON histogram call.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    function refreshOverlays() {
      const b = map.getBounds();
      const size = map.getSize();
      Object.entries(layerToggles).forEach(([key, on]) => {
        const existing = hazardOverlaysRef.current[key];
        if (!on) {
          if (existing) { map.removeLayer(existing); delete hazardOverlaysRef.current[key]; }
          return;
        }
        const def = hazardLayers.find((l) => l.key === key);
        if (!def) return;
        const params = new URLSearchParams({
          bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(','),
          bboxSR: '4326', imageSR: '4326',
          size: `${Math.round(size.x)},${Math.round(size.y)}`,
          format: 'png32', transparent: 'true', dpi: '96', f: 'image',
        });
        const url = `${def.mapServerUrl}/export?${params.toString()}`;
        if (existing) map.removeLayer(existing);
        hazardOverlaysRef.current[key] = L.imageOverlay(url, b, { opacity: 0.6 }).addTo(map);
      });
      // Drop overlays for layers that got unchecked entirely.
      Object.keys(hazardOverlaysRef.current).forEach((key) => {
        if (!layerToggles[key]) { map.removeLayer(hazardOverlaysRef.current[key]); delete hazardOverlaysRef.current[key]; }
      });
    }
    refreshOverlays();
    map.on('moveend', refreshOverlays);
    return () => map.off('moveend', refreshOverlays);
  }, [layerToggles, hazardLayers, event]);

  // Fetch the static facility layer list once (see /api/facility-layers).
  useEffect(() => {
    api.getFacilityLayers().then((r) => setFacilityLayers(r.data)).catch(() => setFacilityLayers([]));
  }, []);

  // Facilities within the selected radius - one combined request per
  // event/radius change (the server queries all 3 layer types and, where
  // possible, classifies each point against the event's matching hazard
  // layer - see GET /events/:uuid/facilities). NOT verified against the
  // real gis.bnpb.go.id server in this sandbox (no outbound access here) -
  // same caveat as the Stage 3 histogram fetch.
  useEffect(() => {
    if (!event || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
    setFacilityStatus('loading');
    api.getEventFacilities(event.uuid, selectedRadius)
      .then((r) => { setFacilityData(r.data); setFacilityStatus('ok'); })
      .catch(() => setFacilityStatus('error'));
  }, [event, selectedRadius]);

  // Building footprints - fetched once per event (server always queries a
  // fixed 1500m radius around the event regardless of the UI's radius
  // selector - see buildings.js), then filtered client-side by
  // `selectedRadius` for display/counting. NOT verified against the real
  // overpass-api.de server in this sandbox.
  useEffect(() => {
    if (!event || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
    setBuildingStage('fetching');
    setBuildings([]);
    api.getEventBuildings(event.uuid)
      .then((r) => { setBuildings(r.data); setBuildingStage('done'); })
      .catch(() => setBuildingStage('error'));
  }, [event]);

  // Facility markers - one numbered pin per toggled layer's points, numbered
  // nearest-first across all currently-toggled layers combined (matches the
  // design handoff's own getFacilityNumbering: numbering is shared across
  // layers, not restarted per layer).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !event) return;
    const numbering = {};
    let n = 1;
    facilityLayers
      .filter((f) => facilityToggles[f.key])
      .forEach((f) => {
        const pts = facilityData[f.key] || [];
        const withDist = pts.map((p, idx) => ({ idx, dist: distanceMeters(event.lat, event.lng, p.lat, p.lng) }));
        withDist.sort((a, b) => a.dist - b.dist);
        withDist.forEach((w) => { numbering[`${f.key}:${w.idx}`] = n++; });
      });

    facilityLayers.forEach((f) => {
      const on = !!facilityToggles[f.key];
      const existing = facilityOverlaysRef.current[f.key];
      if (!on) {
        if (existing) { map.removeLayer(existing); delete facilityOverlaysRef.current[f.key]; delete facilityMarkersRef.current[f.key]; }
        return;
      }
      if (existing) { map.removeLayer(existing); }
      const group = L.layerGroup();
      const markers = {};
      (facilityData[f.key] || []).forEach((p, idx) => {
        const num = numbering[`${f.key}:${idx}`] || '';
        const a = p.attrs || {};
        const nama = a.NAMOBJ || a.NAMA || a.nama || f.label;
        const classColor = p.hazardClass ? CLASS_COLORS[p.hazardClass] : 'var(--muted)';
        const classLabel = p.hazardClass ? `${p.hazardClass} (${Number.isFinite(p.hazardValue) ? p.hazardValue.toFixed(2) : '—'})` : 'Data tidak tersedia';
        const html = `<div style="font-family:'Inter',sans-serif;min-width:170px;">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:4px;">${num ? `${num}. ` : ''}${nama}</div>
          <div style="display:inline-block;font-size:10px;font-weight:700;color:${classColor};background:${classColor}22;border-radius:5px;padding:2px 7px;">Kelas Bahaya: ${classLabel}</div>
        </div>`;
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: '',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: `<div class="fac-marker-inner" style="position:relative;width:24px;height:24px;border-radius:50%;background:var(--card-bg);border:2px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.3);">${f.icon}${num ? `<span style="position:absolute;bottom:-5px;right:-5px;min-width:14px;height:14px;padding:0 3px;border-radius:999px;background:var(--accent-strong);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;">${num}</span>` : ''}</div>`,
          }),
        }).bindPopup(html).addTo(group);
        markers[idx] = marker;
      });
      group.addTo(map);
      facilityOverlaysRef.current[f.key] = group;
      facilityMarkersRef.current[f.key] = markers;
    });
  }, [event, facilityToggles, facilityData, facilityLayers]);

  // Building footprints layer - polygons filtered to the current radius,
  // colored by each building's own hazard class (from getSamples, not the
  // area-averaged histogram) - matches CLASS_COLORS used in the sidebar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (buildingLayerRef.current) { map.removeLayer(buildingLayerRef.current); buildingLayerRef.current = null; }
    if (!buildingLayerOn) return;
    const visible = buildings.filter((b) => b.dist <= selectedRadius);
    const group = L.layerGroup();
    visible.forEach((b) => {
      const color = b.hazardClass ? CLASS_COLORS[b.hazardClass] : 'oklch(55% 0.14 260)';
      L.polygon(b.latlngs, { color, weight: 1, fillOpacity: 0.4, fillColor: color }).addTo(group);
    });
    group.addTo(map);
    buildingLayerRef.current = group;
  }, [buildingLayerOn, buildings, selectedRadius]);

  // Regions (kab/kec/desa -> BMKG adm4) - fetched once, same source/shape
  // already used by EventDetailCard.jsx's weather lookup on the main
  // dashboard, reused here rather than re-deriving it.
  useEffect(() => {
    api.getRegions().then((r) => setRegions(r.data)).catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    if (!event || regions.length === 0) return;
    setWeatherStatus('loading');
    setWeather(null);
    const match = regions.find((r) => norm(r.kabupaten) === norm(event.kabupaten) && norm(r.kecamatan) === norm(event.kecamatan) && norm(r.desa) === norm(event.desa));
    if (!match) { setWeatherStatus('notfound'); return; }
    api.lookupWeather(match.adm4)
      .then((r) => {
        if (!r.data || !r.data.cuaca || !r.data.cuaca.length) { setWeatherStatus('empty'); return; }
        setWeather(r.data);
        setWeatherStatus('ok');
      })
      .catch(() => setWeatherStatus('error'));
  }, [event, regions]);

  // BPS village demographic profile dataset (age/sex pyramid + disability
  // breakdown) - a large (~800KB) bundled static module, dynamically
  // imported so it doesn't block the initial page bundle, matching the
  // design handoff's own dynamic import() of the same file.
  useEffect(() => {
    import('../data/bali-demografi-desa.js').then((mod) => setDemografiDesa(mod.DEMOGRAFI_DESA || [])).catch(() => setDemografiDesa([]));
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Overview inset - a small non-interactive Bali-wide map with a rectangle
  // tracking the main map's current viewport, toggled by the "Inset" tab in
  // the floating panel stack rather than shown as a content panel itself.
  useEffect(() => {
    if (!showInset || !insetElRef.current || insetMapRef.current) return;
    const inset = L.map(insetElRef.current, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false,
    }).setView([-8.4, 115.19], 8);
    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', { maxZoom: 12 }).addTo(inset);
    insetMapRef.current = inset;
    setTimeout(() => inset.invalidateSize(), 50);
    return () => {
      inset.remove();
      insetMapRef.current = null;
      insetRectRef.current = null;
    };
  }, [showInset]);

  useEffect(() => {
    const map = mapRef.current;
    const inset = insetMapRef.current;
    if (!map || !inset) return;
    function syncRect() {
      const b = map.getBounds();
      if (insetRectRef.current) inset.removeLayer(insetRectRef.current);
      insetRectRef.current = L.rectangle(b, { color: 'oklch(55% 0.18 25)', weight: 2, fillOpacity: 0.08 }).addTo(inset);
    }
    syncRect();
    map.on('moveend zoomend', syncRect);
    return () => map.off('moveend zoomend', syncRect);
  }, [showInset, event]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function shareWhatsApp() {
    const label = event ? `${event.jenisBencana} - ${[event.desa, event.kecamatan && `Kec. ${event.kecamatan}`, event.kabupaten && `Kab. ${event.kabupaten}`].filter(Boolean).join(', ')}` : 'Analisis Detail Bencana';
    const text = `Analisis Detail Bencana: ${label}\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  // Pans to + pops up + bounces (adb-marker-bounce, reusing the existing
  // markerBounce keyframe) whichever facility marker a sidebar detail row
  // was clicked for - matches the design handoff's own bounceFacilityMarker.
  function bounceFacilityMarker(key, idx) {
    const marker = facilityMarkersRef.current[key]?.[idx];
    const map = mapRef.current;
    if (!marker || !map) return;
    map.panTo(marker.getLatLng(), { animate: true });
    const el = marker.getElement();
    const inner = el?.querySelector('.fac-marker-inner');
    if (inner) {
      inner.classList.remove('adb-marker-bounce');
      void inner.offsetWidth;
      inner.classList.add('adb-marker-bounce');
    }
    marker.openPopup();
  }

  // Same pan/bounce/popup behavior as bounceFacilityMarker, for the "Dampak
  // per Lokasi" card's clickable rows (Detil Kejadian tab) - a no-op if the
  // marker isn't currently on the map (impact markers can be hidden via the
  // summary card's own checkbox).
  function focusImpactMarker(idx) {
    const marker = impactMarkersRef.current[idx];
    const map = mapRef.current;
    if (!marker || !map) return;
    map.panTo(marker.getLatLng(), { animate: true });
    const el = marker.getElement();
    const inner = el?.querySelector('.fac-marker-inner');
    if (inner) {
      inner.classList.remove('adb-marker-bounce');
      void inner.offsetWidth;
      inner.classList.add('adb-marker-bounce');
    }
    marker.openPopup();
  }

  // Per-card "save as image" (Stage 6) - captures whichever card element is
  // registered under `key` (see sectionRef below) as a PNG, matching the
  // design handoff's own saveCardImage (2x pixel ratio, background color
  // sampled from the element's own computed style so dark mode exports
  // correctly instead of a transparent/black background).
  function sectionRef(key) {
    return (el) => { sectionRefs.current[key] = el; };
  }

  function saveCardImage(key, filename) {
    const el = sectionRefs.current[key];
    if (!el) return;
    // skipFonts: true - the card's own text still renders fine with
    // whatever font is already active in the DOM at capture time; without
    // this, html-to-image tries to re-fetch and inline every @font-face in
    // the page's stylesheets (including the cross-origin Google Fonts
    // link in index.html), which hangs the whole export if that host is
    // unreachable rather than gracefully degrading.
    toPng(el, { pixelRatio: 2, backgroundColor: getComputedStyle(el).backgroundColor || '#ffffff', skipFonts: true })
      .then((dataUrl) => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${filename}.png`;
        a.click();
      })
      .catch(() => {});
  }

  function shareFacilityWhatsApp(facilityLabel, row) {
    const lines = [
      '*VERIFIKASI SITUASI FASILITAS UMUM*',
      'Mohon bantuan tim lapangan untuk verifikasi situasi fasilitas berikut, terkait kejadian:',
      `${event.jenisBencana} — ${event.tanggal}${event.jam ? ' ' + event.jam : ''}, ${[event.desa, event.kecamatan, event.kabupaten].filter(Boolean).join(', ')}`,
      '',
      '_Detail Fasilitas_',
      `${facilityLabel}: ${row.name}`,
      `Tingkat Bahaya: ${row.hazardClass ? `${row.hazardClass} (${row.hazardValue.toFixed(2)})` : 'Data tidak tersedia'}`,
      `Jarak dari lokasi kejadian: ${Math.round(row.dist)} m`,
    ];
    if (Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
      lines.push('', `Navigasi ke lokasi: https://www.google.com/maps/dir/?api=1&destination=${row.lat},${row.lng}`);
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  }

  const desaProfile = event ? demografiDesa.find((d) => norm(d.kecamatan) === norm(event.kecamatan) && norm(d.desa) === norm(event.desa)) : null;

  const vars = themeVars(darkMode);
  const rootStyle = {
    ...vars,
    fontFamily: "'Inter', sans-serif",
    background: 'var(--bg)',
    color: 'var(--fg)',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div ref={rootRef} style={rootStyle}>
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--header-bg)', backdropFilter: 'blur(14px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <a href="/" aria-label="Kembali ke beranda" style={iconBtnStyle}>
            <HomeIcon />
          </a>
          <a href={event ? mapFocusUrl(event.uuid) : '/'} aria-label="Lihat di peta Bali" style={iconBtnStyle}>
            <Icon name="pin" width={16} height={16} />
          </a>
          <div style={{ width: 1, height: 24, background: 'var(--border2)' }} />
          {!event ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
              {loadError ? 'Kejadian tidak ditemukan.' : 'Memuat data kejadian…'}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: severityColor(event.jenisBencana), flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                {event.jenisBencana}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                📅 {event.tanggal}
                <span>·</span>
                📍 {[event.kecamatan && `Kec. ${event.kecamatan}`, event.kabupaten && `Kab. ${event.kabupaten}`].filter(Boolean).join(' / ')}
              </span>
            </div>
          )}
        </div>
        <div className="print-hide" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={toggleFullscreen} aria-label="Fullscreen" style={{ ...iconBtnStyle, display: window.innerWidth < 760 ? 'none' : 'flex' }}>
            <ExpandGlyph expanded={isFullscreen} />
          </button>
          <button onClick={() => setDarkMode((v) => !v)} aria-label="Toggle dark mode" style={iconBtnStyle}>
            <Icon name={darkMode ? 'sun' : 'moon'} width={16} height={16} />
          </button>
          <button onClick={shareWhatsApp} style={{ ...pillBtnStyle, background: 'oklch(55% 0.14 150)', color: 'white' }}>
            Bagikan
          </button>
          <button onClick={() => window.print()} style={{ ...pillBtnStyle, background: 'var(--accent-strong)', color: 'white' }}>
            PDF
          </button>
        </div>
      </header>

      {loadError ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, padding: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {loadError === 'missing-uuid' ? 'Tidak ada kejadian yang dipilih.' : 'Kejadian tidak ditemukan atau tidak dapat diakses.'}
          </div>
          <a href="/" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-strong)' }}>← Kembali ke beranda</a>
        </div>
      ) : (
        <div className="adb-content-row" style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
          <div className="adb-map-wrap" style={{ position: 'relative', flex: sidebarHidden ? '1 1 auto' : '0 0 74%', minWidth: 0 }}>
            <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />

            <div className="print-hide" style={{ position: 'absolute', top: 16, left: 16, zIndex: 401, pointerEvents: 'none' }}>
              <CompassGlyph />
            </div>

            {showInset && (
              <div
                className="print-hide"
                style={{
                  position: 'absolute', top: 16, right: 16, zIndex: 401, width: 160, height: 120,
                  border: '1px solid var(--border2)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--card-shadow)',
                }}
              >
                <div ref={insetElRef} style={{ width: '100%', height: '100%' }} />
              </div>
            )}

            <FloatingPanelStack
              activeTab={floatingTab}
              onChangeTab={setFloatingTab}
              showInset={showInset}
              onToggleInset={() => setShowInset((v) => !v)}
              radiusPreset={radiusPreset}
              customRadiusApplied={customRadiusApplied}
              selectedRadius={selectedRadius}
              customRadiusInput={customRadiusInput}
              onSelectPreset={(r) => { setRadiusPreset(r); setCustomRadiusApplied(null); }}
              onCustomInputChange={setCustomRadiusInput}
              onApplyCustom={() => {
                const n = Number(customRadiusInput);
                if (Number.isFinite(n) && n > 0) setCustomRadiusApplied(Math.round(n));
              }}
              hazardLayers={hazardLayers}
              layerToggles={layerToggles}
              onToggleLayer={(key) => setLayerToggles((prev) => ({ ...prev, [key]: !prev[key] }))}
              legendaExpanded={legendaExpanded}
              onToggleLegendaExpanded={() => setLegendaExpanded((v) => !v)}
              facilityLayers={facilityLayers}
              facilityToggles={facilityToggles}
            />
          </div>

          {!sidebarHidden && (
            <div
              className="adb-sidebar-col"
              style={{
                flex: '0 0 26%', minWidth: 320, borderLeft: '1px solid var(--border)', background: 'var(--bg)',
                display: 'flex', flexDirection: 'column', overflowY: 'auto',
              }}
            >
              <SummaryCard
                event={event}
                expanded={summaryExpanded}
                onToggleExpanded={() => setSummaryExpanded((v) => !v)}
                showImpactMarkers={showImpactMarkers}
                onToggleImpactMarkers={() => setShowImpactMarkers((v) => !v)}
                onHide={() => setSidebarHidden(true)}
              />

              <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px' }}>
                <TabBtn active={tab === 'profil'} onClick={() => setTab('profil')}>Profil Wilayah</TabBtn>
                <TabBtn active={tab === 'detil'} onClick={() => setTab('detil')}>Detil Kejadian</TabBtn>
              </div>

              <div style={{ flex: 1, padding: '0 16px 20px', fontSize: 12.5, color: 'var(--muted)' }}>
                {tab === 'profil' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <HazardIndexCard
                      hazardLayers={hazardLayers}
                      layerToggles={layerToggles}
                      histograms={histograms}
                      infoOpen={hazardInfoOpen}
                      onToggleInfo={() => setHazardInfoOpen((v) => !v)}
                      cardRef={sectionRef('hazard')}
                      onSaveImage={() => saveCardImage('hazard', 'Indeks-Bahaya-InaRISK')}
                    />
                    <TapakBangunanCard
                      event={event}
                      buildings={buildings}
                      buildingStage={buildingStage}
                      buildingLayerOn={buildingLayerOn}
                      onToggleBuildingLayer={() => setBuildingLayerOn((v) => !v)}
                      selectedRadius={selectedRadius}
                      cardRef={sectionRef('bangunan')}
                      onSaveImage={() => saveCardImage('bangunan', 'Tapak-Bangunan')}
                    />
                    <FasilitasCard
                      event={event}
                      facilityLayers={facilityLayers}
                      facilityToggles={facilityToggles}
                      onToggleFacility={(key) => setFacilityToggles((prev) => ({ ...prev, [key]: !prev[key] }))}
                      facilityStatus={facilityStatus}
                      facilityData={facilityData}
                      selectedRadius={selectedRadius}
                      infoOpen={facilityInfoOpen}
                      onToggleInfo={() => setFacilityInfoOpen((v) => !v)}
                      onRowClick={bounceFacilityMarker}
                      onShareRow={shareFacilityWhatsApp}
                      cardRef={sectionRef('fasilitas')}
                      onSaveImage={() => saveCardImage('fasilitas', 'Fasilitas-Umum')}
                    />
                    <DemografiCard
                      desaProfile={desaProfile}
                      cardRef={sectionRef('demografi')}
                      onSaveImage={() => saveCardImage('demografi', 'Demografi-Terdampak')}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <CuacaCard
                      status={weatherStatus}
                      weather={weather}
                      cardRef={sectionRef('cuaca')}
                      onSaveImage={() => saveCardImage('cuaca', 'Cuaca-Terkini')}
                    />
                    <TotalDampakCard
                      event={event}
                      cardRef={sectionRef('totalDampak')}
                      onSaveImage={() => saveCardImage('totalDampak', 'Total-Dampak-Tercatat')}
                    />
                    <DampakPerLokasiCard event={event} onLocate={focusImpactMarker} />
                  </div>
                )}
              </div>
            </div>
          )}

          {sidebarHidden && (
            <button
              className="print-hide"
              onClick={() => setSidebarHidden(false)}
              aria-label="Tampilkan panel"
              style={{
                position: 'absolute', bottom: 20, right: 20, width: 44, height: 44, borderRadius: '50%',
                background: 'var(--accent-strong)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 18,
                boxShadow: 'var(--card-shadow-hover)',
              }}
            >
              ☰
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ event, expanded, onToggleExpanded, showImpactMarkers, onToggleImpactMarkers, onHide }) {
  return (
    <div style={{ margin: 16, marginBottom: 12, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)', padding: 16, position: 'relative' }}>
      <button onClick={onHide} aria-label="Sembunyikan panel" style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15 }}>✕</button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Ringkasan Kejadian</div>
        <button onClick={onToggleExpanded} aria-label="Perluas/ciutkan" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <ChevronIcon pointRight={!expanded} />
        </button>
      </div>

      {!event ? (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>Memuat…</div>
      ) : !expanded ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: severityColor(event.jenisBencana), flexShrink: 0 }} />
          <span style={{ fontWeight: 700 }}>{event.jenisBencana}</span>
          <span style={{ color: 'var(--muted)' }}>{event.tanggal} · {event.desa}</span>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <DisasterIcon jenis={event.jenisBencana} style={{ color: severityColor(event.jenisBencana) }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{event.jenisBencana}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 4 }}>{event.tanggal} · {event.jam || '—'} WITA</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
            Desa {event.desa || '—'}, Kec. {event.kecamatan || '—'}, Kab. {event.kabupaten || '—'}
          </div>
          {event.keterangan && (
            <div style={{ fontSize: 12, color: 'var(--fg2)', lineHeight: 1.5, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              {event.keterangan}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip>☠ {event.korbanMeninggal || 0} meninggal</Chip>
            <Chip>🩹 {event.korbanLuka || 0} luka</Chip>
            <Chip>❓ {event.korbanHilang || 0} hilang</Chip>
            <Chip>💸 {formatRupiah(event.kerugian)}</Chip>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={showImpactMarkers} onChange={onToggleImpactMarkers} />
            Tampilkan titik dampak di peta
          </label>
        </div>
      )}
    </div>
  );
}

function PlaceholderCard({ title, note }) {
  return (
    <div style={{ border: '1px dashed var(--border2)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

// Quiet icon button (not a bright CTA) shown on every analysis card next to
// the "i" info button where one exists - captures that card as a PNG via
// saveCardImage/html-to-image. Styled to match: 22x22px, 1px border, band
// background, muted icon color (see the design handoff's own spec).
function SaveImageButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Simpan sebagai gambar"
      title="Simpan sebagai gambar"
      style={{
        width: 22, height: 22, borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--band)',
        color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
      }}
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M4 19h16" />
      </svg>
    </button>
  );
}

function Chip({ children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--band)', color: 'var(--fg2)' }}>
      {children}
    </span>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? 'var(--card-bg)' : 'var(--band)', color: active ? 'var(--accent-strong)' : 'var(--muted)',
        boxShadow: active ? 'var(--card-shadow)' : 'none', transition: 'background .15s, color .15s',
      }}
    >
      {children}
    </button>
  );
}

const RADIUS_PRESETS = [300, 800, 1500];

function radiusAreaKm2(radiusMeters) {
  return ((Math.PI * radiusMeters * radiusMeters) / 1e6).toFixed(2);
}

// Classification thresholds match the design handoff's own reference
// (Rendah <0.33 · Sedang 0.33-0.67 · Tinggi >0.67 on the raster's 0-1 hazard
// index). Every INDEKS_BAHAYA_* ImageServer name ends in "_30" (see
// server/lib/inarisk.js's mapServerUrl values), i.e. a 30m cell - so one
// pixel is 900 sqm = 0.09 ha, used to turn a histogram's pixel counts into
// a hectare figure per class.
const CLASS_COLORS = { Rendah: 'oklch(60% 0.12 150)', Sedang: 'oklch(65% 0.14 80)', Tinggi: 'oklch(55% 0.18 30)' };
const PIXEL_AREA_HA = 0.09;

function toTitleCase(str) {
  return (str || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyHistogram(hist) {
  if (!hist || hist.status !== 'ok' || !Array.isArray(hist.counts) || hist.counts.length === 0) return null;
  const { min, max, counts } = hist;
  const pixelsByClass = { Rendah: 0, Sedang: 0, Tinggi: 0 };
  counts.forEach((count, i) => {
    const binValue = min + ((i + 0.5) / counts.length) * (max - min);
    const cls = binValue < 0.3333 ? 'Rendah' : binValue < 0.6666 ? 'Sedang' : 'Tinggi';
    pixelsByClass[cls] += count;
  });
  const totalPixels = counts.reduce((a, b) => a + b, 0);
  if (totalPixels === 0) return { hectaresByClass: pixelsByClass, totalPixels: 0, dominant: null };
  const hectaresByClass = Object.fromEntries(Object.entries(pixelsByClass).map(([k, v]) => [k, v * PIXEL_AREA_HA]));
  const dominant = Object.entries(pixelsByClass).sort((a, b) => b[1] - a[1])[0][0];
  return { hectaresByClass, totalPixels, dominant };
}

// "Indeks Bahaya InaRISK" card (Profil Wilayah tab) - one row per currently
// toggled hazard layer, showing its dominant classification and a small
// hectares-per-class bar chart from the histogram computed over the
// selected radius. Loading/empty/error states are copy-per-layer since
// different layers can be in different states (e.g. one still loading
// while another already errored).
function HazardIndexCard({ hazardLayers, layerToggles, histograms, infoOpen, onToggleInfo, cardRef, onSaveImage }) {
  const activeKeys = Object.entries(layerToggles).filter(([, on]) => on).map(([k]) => k);
  return (
    <div ref={cardRef} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: infoOpen ? 8 : 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>Indeks Bahaya InaRISK</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} className="print-hide">
          <SaveImageButton onClick={onSaveImage} />
          <button
            onClick={onToggleInfo}
            aria-label="Keterangan klasifikasi"
            style={{
              width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--border2)', background: 'var(--band)',
              color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            i
          </button>
        </div>
      </div>

      {infoOpen && (
        <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, background: 'var(--band)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          Klasifikasi: Rendah &lt; 0,33 · Sedang 0,33–0,67 · Tinggi &gt; 0,67 — nilai rata-rata raster pada radius analisis yang dipilih. Bukan pemodelan risiko resmi BNPB.
        </div>
      )}

      {activeKeys.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Belum ada layer bahaya yang dipilih. Aktifkan salah satu layer pada tab "Legenda" di peta untuk melihat indeksnya di sini.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeKeys.map((key) => {
            const def = hazardLayers.find((l) => l.key === key);
            const hist = histograms[key];
            return (
              <div key={key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: def?.color || 'var(--muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700 }}>{def?.label || key}</span>
                </div>
                <HazardIndexRow hist={hist} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HazardIndexRow({ hist }) {
  if (!hist || hist.status === 'loading') {
    return <div style={{ fontSize: 11, color: 'var(--muted)' }}>Menghitung indeks…</div>;
  }
  if (hist.status === 'error') {
    return <div style={{ fontSize: 11, color: 'oklch(55% 0.18 25)' }}>Gagal memuat data InaRISK. Coba lagi nanti.</div>;
  }
  if (hist.status === 'empty') {
    return <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tidak ada data raster pada radius ini.</div>;
  }
  const result = classifyHistogram(hist);
  if (!result || result.totalPixels === 0) {
    return <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tidak ada data raster pada radius ini.</div>;
  }
  const { hectaresByClass, dominant } = result;
  const maxHa = Math.max(...Object.values(hectaresByClass), 0.001);
  return (
    <div>
      <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: CLASS_COLORS[dominant], color: 'white', marginBottom: 8 }}>
        Dominan: {dominant}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {['Rendah', 'Sedang', 'Tinggi'].map((cls) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, width: 42, color: 'var(--muted)', flexShrink: 0 }}>{cls}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--band)', overflow: 'hidden' }}>
              <div style={{ width: `${(hectaresByClass[cls] / maxHa) * 100}%`, height: '100%', background: CLASS_COLORS[cls], borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 10, width: 62, textAlign: 'right', color: 'var(--fg2)', flexShrink: 0 }}>{hectaresByClass[cls].toFixed(1)} ha</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Cross-fading rotating status line shown while building footprints are
// being fetched/classified (buildingStage === 'fetching') - purely a loading
// indicator (the server does the whole fetch+classify in one round trip),
// so the 4 messages don't correspond to literally separate network calls,
// just to what's conceptually happening - matches the design handoff's own
// textCycle-based cyclingLogMessages.
const BUILDING_LOADING_MESSAGES = [
  'Mengambil tapak bangunan dari OpenStreetMap…',
  'Menghitung titik pusat & jarak tiap bangunan…',
  'Mengambil nilai indeks bahaya InaRISK per bangunan…',
  'Mengelaskan bangunan ke kelas Rendah/Sedang/Tinggi…',
];
const BUILDING_LOG_SLOT_SECONDS = 2.6;

function TapakBangunanCard({ event, buildings, buildingStage, buildingLayerOn, onToggleBuildingLayer, selectedRadius, cardRef, onSaveImage }) {
  const visible = buildings.filter((b) => b.dist <= selectedRadius);
  const classified = visible.filter((b) => b.hazardClass);
  const hasBreakdown = classified.length > 0;
  const classCounts = { Rendah: 0, Sedang: 0, Tinggi: 0 };
  classified.forEach((b) => { classCounts[b.hazardClass] += 1; });
  const tinggi = classCounts.Tinggi;
  const sedang = classCounts.Sedang;
  const rusakBerat = Math.round(tinggi * 0.5);
  const rusakSedang = Math.round(sedang * 0.5) + Math.round(tinggi * 0.5);
  const hasDamageEstimate = tinggi > 0 || sedang > 0;

  return (
    <div ref={cardRef} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)', marginBottom: 2 }}>Tapak Bangunan</div>
        <div className="print-hide"><SaveImageButton onClick={onSaveImage} /></div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 8 }}>Data OpenStreetMap (Overpass API), radius {selectedRadius.toLocaleString('id-ID')} m</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <Chip>🏚 {event?.bangunanRb || 0} rusak berat</Chip>
        <Chip>🏠 {event?.bangunanRr || 0} rusak ringan</Chip>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: buildingStage === 'fetching' ? 10 : 0 }}>
        <input type="checkbox" checked={buildingLayerOn} onChange={onToggleBuildingLayer} />
        Tampilkan tapak bangunan di peta (OSM)
      </label>

      {buildingStage === 'fetching' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid color-mix(in oklch, var(--accent-strong) 25%, transparent)', borderTopColor: 'var(--accent-strong)', animation: 'analysisSpin 0.8s linear infinite', flexShrink: 0 }} />
            <div style={{ position: 'relative', height: 14, flex: 1, fontSize: 11, color: 'var(--fg2)' }}>
              {BUILDING_LOADING_MESSAGES.map((msg, i) => (
                <span
                  key={msg}
                  style={{
                    position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap',
                    animation: `textCycle ${BUILDING_LOADING_MESSAGES.length * BUILDING_LOG_SLOT_SECONDS}s ease-in-out infinite`,
                    animationDelay: `-${i * BUILDING_LOG_SLOT_SECONDS}s`,
                  }}
                >
                  {msg}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['Mengambil tapak bangunan…', 'Mengelaskan tingkat bahaya…'].map((step) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--muted)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'dotFade 1s ease-in-out infinite' }} />
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {buildingStage === 'error' && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'oklch(55% 0.18 25)' }}>Gagal mengambil tapak bangunan dari OpenStreetMap. Coba lagi nanti.</div>
      )}

      {buildingStage === 'done' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {RADIUS_PRESETS.map((r) => (
              <Chip key={r}>{r.toLocaleString('id-ID')} m: {buildings.filter((b) => b.dist <= r).length}</Chip>
            ))}
          </div>
          {hasBreakdown && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg2)', marginTop: 10, marginBottom: 4 }}>
                Kelas Indeks Bahaya InaRISK (dalam radius {selectedRadius.toLocaleString('id-ID')} m)
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Rendah', 'Sedang', 'Tinggi'].map((cls) => (
                  <span key={cls} style={{ fontSize: 10.5, fontWeight: 700, color: CLASS_COLORS[cls], background: `color-mix(in oklch, ${CLASS_COLORS[cls]} 14%, transparent)`, borderRadius: 8, padding: '3px 8px' }}>
                    {cls}: {classCounts[cls]}
                  </span>
                ))}
              </div>
              {hasDamageEstimate && (
                <>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg2)', marginTop: 10, marginBottom: 4 }}>
                    Estimasi Potensi Kerusakan (berdasarkan kelas bahaya)
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: CLASS_COLORS.Tinggi, background: `color-mix(in oklch, ${CLASS_COLORS.Tinggi} 14%, transparent)`, borderRadius: 8, padding: '3px 8px' }}>
                      🏚 {rusakBerat} berpotensi rusak berat
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: CLASS_COLORS.Sedang, background: `color-mix(in oklch, ${CLASS_COLORS.Sedang} 14%, transparent)`, borderRadius: 8, padding: '3px 8px' }}>
                      🏗 {rusakSedang} berpotensi rusak sedang
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FasilitasCard({
  event, facilityLayers, facilityToggles, onToggleFacility, facilityStatus, facilityData, selectedRadius,
  infoOpen, onToggleInfo, onRowClick, onShareRow, cardRef, onSaveImage,
}) {
  const groups = facilityLayers
    .filter((f) => facilityToggles[f.key])
    .map((f) => {
      const rows = (facilityData[f.key] || [])
        .map((p, idx) => {
          const a = p.attrs || {};
          const name = a.NAMOBJ || a.NAMA || a.nama || f.label;
          const dist = event ? distanceMeters(event.lat, event.lng, p.lat, p.lng) : 0;
          return { idx, name, dist, hazardClass: p.hazardClass || null, hazardValue: Number.isFinite(p.hazardValue) ? p.hazardValue : null, lat: p.lat, lng: p.lng };
        })
        .sort((a, b) => a.dist - b.dist);
      return { key: f.key, label: f.label, icon: f.icon, rows };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <div ref={cardRef} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>Fasilitas Umum di Sekitar</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} className="print-hide">
          <SaveImageButton onClick={onSaveImage} />
          <button
            onClick={onToggleInfo}
            aria-label="Info sumber data"
            style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--border2)', background: 'var(--band)', color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            i
          </button>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 8 }}>Dalam radius {selectedRadius.toLocaleString('id-ID')} m dari titik kejadian</div>

      {infoOpen && (
        <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, background: 'var(--band)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          Data fasilitas umum diperoleh dari API GIS Kementerian Dalam Negeri melalui InaRISK BNPB.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {facilityLayers.map((f) => {
          const count = (facilityData[f.key] || []).length;
          const loading = facilityStatus === 'loading';
          return (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!facilityToggles[f.key]} onChange={() => onToggleFacility(f.key)} />
              <span>{f.icon}</span>
              <span style={{ flex: 1, color: 'var(--fg2)' }}>{f.label}</span>
              {loading ? (
                <span style={{ display: 'inline-flex', gap: 3 }}>
                  {[0, 0.2, 0.4].map((delay) => (
                    <span key={delay} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: 'dotFade 1.2s ease-in-out infinite', animationDelay: `${delay}s` }} />
                  ))}
                </span>
              ) : (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg2)' }}>{count}</span>
              )}
            </label>
          );
        })}
      </div>

      {facilityStatus === 'error' && (
        <div style={{ fontSize: 11, color: 'oklch(55% 0.18 25)' }}>Gagal memuat data fasilitas. Coba lagi nanti.</div>
      )}
      {facilityStatus === 'loading' && (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Memuat data fasilitas…</div>
      )}

      {groups.map((g) => (
        <div key={g.key} style={{ background: 'var(--band)', borderRadius: 9, padding: '8px 10px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg)', textTransform: 'uppercase', letterSpacing: '0.02em', paddingBottom: 2 }}>
            {g.icon} {g.label}
          </div>
          {g.rows.map((r) => {
            const classColor = r.hazardClass ? CLASS_COLORS[r.hazardClass] : 'var(--muted)';
            return (
              <div
                key={r.idx}
                onClick={() => onRowClick(g.key, r.idx)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', borderTop: '1px solid var(--border2)', fontSize: 11, cursor: 'pointer' }}
              >
                <span style={{ flex: 1, minWidth: 0, color: 'var(--fg2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: classColor, background: `color-mix(in oklch, ${classColor} 14%, transparent)`, borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>
                  {r.hazardClass ? `${r.hazardClass} (${r.hazardValue.toFixed(2)})` : '—'}
                </span>
                <span style={{ flexShrink: 0, color: 'var(--muted)', fontWeight: 600, width: 44, textAlign: 'right' }}>{Math.round(r.dist)} m</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onShareRow(g.label, r); }}
                  aria-label="Verifikasi via WhatsApp"
                  title="Verifikasi via WhatsApp"
                  style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'oklch(60% 0.16 150)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: 'pointer', padding: 0 }}
                >
                  ↗
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const AGE_PARENT_GROUPS = [
  { key: 'balita', icon: '👶', sub: '0–9', min: 0, max: 9, color: 'oklch(58% 0.14 235)' },
  { key: 'anak', icon: '🧒', sub: '10–19', min: 10, max: 19, color: 'oklch(62% 0.13 190)' },
  { key: 'dewasa', icon: '🧑', sub: '20–59', min: 20, max: 59, color: 'oklch(62% 0.14 350)' },
  { key: 'lansia', icon: '🧓', sub: '60+', min: 60, max: 999, color: 'oklch(60% 0.15 60)' },
];
const DISABILITY_ROWS = [
  { key: 'fisik', label: 'Fisik', icon: '♿' },
  { key: 'sensorikNetra', label: 'Netra', icon: '👁' },
  { key: 'runguWicara', label: 'Rungu Wicara', icon: '👂' },
  { key: 'mental', label: 'Mental', icon: '🧠' },
  { key: 'ganda', label: 'Ganda', icon: '✳' },
  { key: 'intelektual', label: 'Intelektual', icon: '🧩' },
];

function startAge(label) {
  return label === '>75' ? 75 : parseInt(label.split('-')[0], 10);
}

// Age-pyramid-style bar chart (paired L/P bars per 5-year bracket) + a
// broader 4-group summary row (Balita/Anak/Dewasa/Lansia) + the disability
// breakdown list - all derived from the bundled BPS dataset (bali-demografi-
// desa.js), matched to the event's own desa/kecamatan. Falls back to a
// "data belum tersedia" note when there's no match, per the design handoff.
function DemografiCard({ desaProfile, cardRef, onSaveImage }) {
  if (!desaProfile) {
    return (
      <div ref={cardRef} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>Demografi Terdampak</div>
          <div className="print-hide"><SaveImageButton onClick={onSaveImage} /></div>
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>Data profil desa (BPS) belum tersedia untuk lokasi ini.</div>
      </div>
    );
  }
  const maxAge = Math.max(...desaProfile.ageGroups.map((a) => Math.max(a.l, a.p)), 1);
  const disabilityRows = DISABILITY_ROWS.map((d) => ({ ...d, ...desaProfile.disabilitas[d.key] })).filter((d) => d.total > 0);

  return (
    <div ref={cardRef} className="print-page" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)', marginBottom: 2 }}>Demografi Terdampak</div>
        <div className="print-hide"><SaveImageButton onClick={onSaveImage} /></div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 8 }}>
        {toTitleCase(desaProfile.desa)}, {toTitleCase(desaProfile.kecamatan)} — {desaProfile.jumlahPenduduk.toLocaleString('id-ID')} jiwa{desaProfile.jumlahKK ? `, ${desaProfile.jumlahKK.toLocaleString('id-ID')} KK` : ''}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 100, marginTop: 10, padding: '0 2px 6px', borderBottom: '1px solid var(--border)' }}>
        {desaProfile.ageGroups.map((ag) => (
          <div key={ag.label} title={`${ag.label} thn — L: ${ag.l.toLocaleString('id-ID')}, P: ${ag.p.toLocaleString('id-ID')}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 78 }}>
              <div style={{ width: 8, height: Math.max(2, (ag.l / maxAge) * 78), background: 'oklch(58% 0.14 235)', borderRadius: '3px 3px 0 0' }} />
              <div style={{ width: 8, height: Math.max(2, (ag.p / maxAge) * 78), background: 'oklch(62% 0.14 350)', borderRadius: '3px 3px 0 0' }} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{ag.label === '>75' ? '75+' : ag.label.split('-')[0]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'oklch(58% 0.14 235)' }} /> Laki-laki
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'oklch(62% 0.14 350)' }} /> Perempuan
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {AGE_PARENT_GROUPS.map((d) => {
          const bins = desaProfile.ageGroups.filter((ag) => { const a = startAge(ag.label); return a >= d.min && a <= d.max; });
          const l = bins.reduce((s, ag) => s + ag.l, 0);
          const p = bins.reduce((s, ag) => s + ag.p, 0);
          if (bins.length === 0) return null;
          return (
            <div key={d.key} style={{ flex: bins.length, minWidth: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'var(--band)', borderRadius: 9, padding: '8px 6px' }}>
              <div style={{ width: '100%', height: 3, borderRadius: 2, background: d.color }} />
              <span style={{ fontSize: 15, lineHeight: 1 }}>{d.icon}</span>
              <div style={{ display: 'flex', gap: 5 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: 'oklch(58% 0.14 235)', whiteSpace: 'nowrap' }}>{l.toLocaleString('id-ID')}</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: 'oklch(62% 0.14 350)', whiteSpace: 'nowrap' }}>{p.toLocaleString('id-ID')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {disabilityRows.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg2)', marginTop: 10 }}>Ragam Disabilitas ({desaProfile.disabilitas.total} jiwa)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 5 }}>
            {disabilityRows.map((d) => (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--band)', borderRadius: 9, padding: '6px 10px' }}>
                <span style={{ fontSize: 14, flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: 'color-mix(in oklch, var(--accent) 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.icon}</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg)' }}>{d.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>L: {d.l} · P: {d.p}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)', flexShrink: 0 }}>{d.total}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CuacaCard({ status, weather, cardRef, onSaveImage }) {
  return (
    <div ref={cardRef} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>Cuaca Terkini</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div className="print-hide"><SaveImageButton onClick={onSaveImage} /></div>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Data: BMKG</span>
        </div>
      </div>
      {status === 'loading' && <div style={{ fontSize: 11.5 }}>Memuat cuaca terkini…</div>}
      {status === 'notfound' && <div style={{ fontSize: 11.5 }}>Lokasi tidak ditemukan di data wilayah.</div>}
      {(status === 'empty' || status === 'error') && <div style={{ fontSize: 11.5 }}>Data cuaca terkini tidak tersedia untuk lokasi ini.</div>}
      {status === 'ok' && weather && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <WeatherIcon src={weather.cuaca[0].image} size={30} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg)' }}>{weather.cuaca[0].t}&deg;C &middot; {weather.cuaca[0].weather_desc}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Kelembapan {weather.cuaca[0].hu}% &middot; {(weather.cuaca[0].local_datetime || '').slice(11, 16)} WITA</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {weather.cuaca.slice(1, 7).map((f, i) => (
              <div key={i} title={f.weather_desc} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0, minWidth: 34 }}>
                <WeatherIcon src={f.image} size={20} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{(f.local_datetime || '').slice(11, 16)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TotalDampakCard({ event, cardRef, onSaveImage }) {
  if (!event) return null;
  const impacts = event.impacts || [];
  const totalKorban = impacts.reduce((s, im) => s + (im.totalKorban || 0), 0) || (event.korbanMeninggal || 0) + (event.korbanLuka || 0) + (event.korbanHilang || 0);
  const totalMengungsi = impacts.reduce((s, im) => s + (im.mengungsiL || 0) + (im.mengungsiP || 0), 0);
  return (
    <div ref={cardRef} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>Total Dampak Tercatat</div>
        <div className="print-hide"><SaveImageButton onClick={onSaveImage} /></div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip>👥 {totalKorban} korban</Chip>
        <Chip>🏠 {totalMengungsi} mengungsi</Chip>
        <Chip>🏚 {event.bangunanRb || 0} rusak berat</Chip>
        <Chip>🏗 {event.bangunanRr || 0} rusak ringan</Chip>
      </div>
    </div>
  );
}

function DampakPerLokasiCard({ event, onLocate }) {
  const impacts = event?.impacts || [];
  if (impacts.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-bg)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)', marginBottom: 8 }}>Dampak per Lokasi ({impacts.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {impacts.map((im, i) => (
          <div
            key={im.idDetail || i}
            onClick={() => onLocate(i)}
            style={{ border: '1px solid var(--border2)', borderRadius: 9, padding: '8px 10px', cursor: Number.isFinite(im.lat) ? 'pointer' : 'default', background: 'var(--band)' }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg)' }}>{im.lokasi || `Dampak #${i + 1}`}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
              <span>🩹 {im.korbanLukaBerat || 0} luka berat</span>
              <span>🩹 {im.korbanLukaRingan || 0} luka ringan</span>
              <span>🏠 {(im.mengungsiL || 0) + (im.mengungsiP || 0)} mengungsi</span>
            </div>
            {im.penangananTim && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginTop: 6 }}>Tim Terlibat</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg2)' }}>{im.penangananTim}</div>
              </>
            )}
            {im.penangananTindakan && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginTop: 6 }}>Upaya Penanganan</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg2)' }}>{im.penangananTindakan}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Bottom-left floating stack: Pengaturan (radius controls, default) and
// Legenda are mutually-exclusive content tabs; Inset is a plain toggle for
// the overview mini-map shown elsewhere on the map, not a content panel of
// its own - see the design handoff's own description of that tab.
// Layers beyond this count are hidden behind the "show more" toggle - the
// design handoff calls for that once there are more than 6 (there are 11).
const LEGENDA_COLLAPSED_COUNT = 6;

function FloatingPanelStack({
  activeTab, onChangeTab, showInset, onToggleInset,
  radiusPreset, customRadiusApplied, selectedRadius, customRadiusInput, onSelectPreset, onCustomInputChange, onApplyCustom,
  hazardLayers, layerToggles, onToggleLayer, legendaExpanded, onToggleLegendaExpanded,
  facilityLayers, facilityToggles,
}) {
  const activeFacilities = facilityLayers.filter((f) => facilityToggles[f.key]);
  return (
    <div className="print-hide" style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 401, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 260 }}>
      {activeTab === 'pengaturan' && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 10 }}>
            Radius Analisis
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {RADIUS_PRESETS.map((r) => {
              const active = customRadiusApplied == null && radiusPreset === r;
              return (
                <button
                  key={r}
                  onClick={() => onSelectPreset(r)}
                  style={{
                    flex: 1, fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '7px 6px', borderRadius: 999, border: '1px solid var(--border2)',
                    cursor: 'pointer', background: active ? 'white' : 'var(--band)', color: active ? 'var(--accent-strong)' : 'var(--fg2)',
                  }}
                >
                  {r.toLocaleString('id-ID')} m
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Kustom:</span>
            <input
              type="number"
              value={customRadiusInput}
              onChange={(e) => onCustomInputChange(e.target.value)}
              style={{ flex: 1, fontFamily: 'inherit', fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--band)', color: 'var(--fg)', width: 0, minWidth: 0 }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>m</span>
            <button
              onClick={onApplyCustom}
              aria-label="Terapkan radius kustom"
              style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'var(--accent-strong)', color: 'white', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              →
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Zona berbasis jarak dari titik kejadian — bukan pemodelan risiko resmi.
            Luas area dianalisis: {radiusAreaKm2(selectedRadius)} km² (radius {selectedRadius} m).
          </div>
        </div>
      )}

      {activeTab === 'legenda' && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, boxShadow: 'var(--card-shadow)', maxHeight: 320, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
            Layer Bahaya (InaRISK)
          </div>
          {hazardLayers.length === 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>Memuat daftar layer…</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(legendaExpanded ? hazardLayers : hazardLayers.slice(0, LEGENDA_COLLAPSED_COUNT)).map((layer) => (
                  <label key={layer.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!layerToggles[layer.key]} onChange={() => onToggleLayer(layer.key)} />
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: layer.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--fg2)' }}>{layer.label}</span>
                  </label>
                ))}
              </div>
              {hazardLayers.length > LEGENDA_COLLAPSED_COUNT && (
                <button
                  onClick={onToggleLegendaExpanded}
                  style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)', padding: 0 }}
                >
                  {legendaExpanded ? 'Tampilkan lebih sedikit ▲' : `Tampilkan ${hazardLayers.length - LEGENDA_COLLAPSED_COUNT} lainnya ▼`}
                </button>
              )}
            </>
          )}

          {activeFacilities.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '12px 0 8px', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                Fasilitas Aktif di Peta
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeFacilities.map((f) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg2)' }}>
                    <span>{f.icon}</span>
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <FloatingTabIcon active={activeTab === 'pengaturan'} onClick={() => onChangeTab('pengaturan')} label="Pengaturan" glyph="⚙" />
        <FloatingTabIcon active={activeTab === 'legenda'} onClick={() => onChangeTab('legenda')} label="Legenda" glyph="☰" />
        <FloatingTabIcon active={showInset} onClick={onToggleInset} label="Inset" glyph="▢" />
      </div>
    </div>
  );
}

function FloatingTabIcon({ active, onClick, label, glyph }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 14,
        background: active ? 'var(--accent-strong)' : 'var(--card-bg)', color: active ? 'white' : 'var(--fg2)', boxShadow: 'var(--card-shadow)',
      }}
    >
      {glyph}
    </button>
  );
}

function CompassGlyph() {
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--card-bg)', border: '1px solid var(--border2)', boxShadow: 'var(--card-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--fg2)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6l2.5 6.5L12 15l-2.5-2.5z" fill="var(--accent-strong)" stroke="none" />
        <text x="12" y="4.5" textAnchor="middle" fontSize="6" fill="var(--fg2)" stroke="none" fontWeight="700">N</text>
      </svg>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--fg2)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function ExpandGlyph({ expanded }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--fg2)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {expanded ? (
        <>
          <path d="M9 3H5v4M15 3h4v4M9 21H5v-4M15 21h4v-4" />
        </>
      ) : (
        <>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </>
      )}
    </svg>
  );
}

const iconBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%',
  background: 'var(--band)', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0,
};

const pillBtnStyle = {
  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
};
