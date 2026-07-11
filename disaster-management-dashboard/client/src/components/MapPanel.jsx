import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { severityColor } from '../theme.js';
import { disasterMarkerSvgHtml } from '../icons.jsx';
import { Icon } from '../icons.jsx';

const BALI_CENTER = [-8.4, 115.15];

export default function MapPanel({ events, focusUuid, onClose }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: true }).setView(BALI_CENTER, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      window.removeEventListener('keydown', onEsc);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};

    let latestUuid = null;
    let latestKey = '';
    events.forEach((ev) => {
      const key = `${ev.tanggal || ''} ${ev.jam || ''}`;
      if (key > latestKey) { latestKey = key; latestUuid = ev.uuid; }
    });

    events.forEach((ev) => {
      if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) return;
      const color = severityColor(ev.jenisBencana);
      const highlight = ev.uuid === latestUuid || ev.uuid === focusUuid;
      const icon = L.divIcon({
        className: '',
        html: disasterMarkerSvgHtml(ev.jenisBencana, color, highlight),
        iconSize: highlight ? [42, 42] : [30, 30],
        iconAnchor: highlight ? [21, 21] : [15, 15],
      });
      const marker = L.marker([ev.lat, ev.lng], { icon, zIndexOffset: highlight ? 1000 : 0 }).addTo(map);
      marker.bindPopup(popupHtml(ev));
      markersRef.current[ev.uuid] = marker;
    });
  }, [events, focusUuid]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusUuid) return;
    const ev = events.find((e) => e.uuid === focusUuid);
    const marker = markersRef.current[focusUuid];
    if (ev && marker && Number.isFinite(ev.lat)) {
      map.setView([ev.lat, ev.lng], 13, { animate: true });
      setTimeout(() => marker.openPopup(), 300);
    }
  }, [focusUuid, events]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}>
          <Icon name="pin" width={18} height={18} />
          Peta Sebaran Kejadian Bencana
        </div>
        <button
          onClick={() => mapRef.current && mapRef.current.setView(BALI_CENTER, 9, { animate: true })}
          style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)', background: 'var(--accent-08)', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', marginRight: 8 }}
        >
          Seluruh Bali
        </button>
        <button
          onClick={onClose}
          style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: 'var(--band)', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
        >
          Tutup ✕
        </button>
      </div>
      <div ref={elRef} style={{ flex: 1 }} />
    </div>
  );
}

function popupHtml(ev) {
  return `<div style="font-family:Inter,sans-serif;font-size:12.5px;max-width:220px;line-height:1.5;">
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${ev.jenisBencana}</div>
    <div style="color:#555;margin-bottom:6px;">${ev.tanggal} &middot; ${ev.jam} WITA</div>
    <div style="margin-bottom:6px;">${ev.kecamatan}, ${ev.desa}, ${ev.kabupaten}</div>
    <div style="color:#555;">Meninggal: ${ev.korbanMeninggal} &middot; Luka: ${ev.korbanLuka} &middot; Dampak: ${(ev.impacts || []).length}</div>
  </div>`;
}
