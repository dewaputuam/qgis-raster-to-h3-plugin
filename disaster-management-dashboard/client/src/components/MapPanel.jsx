import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { severityColor, JENIS_COLORS } from '../theme.js';
import { disasterMarkerSvgHtml, Icon, ChevronIcon } from '../icons.jsx';

const BALI_CENTER = [-8.4, 115.15];

export default function MapPanel({ open, events, focusUuid, isMobile, onClose }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const initedRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [selectedUuid, setSelectedUuid] = useState(null);

  useEffect(() => {
    if (!open || initedRef.current) return;
    initedRef.current = true;
    const t = setTimeout(() => {
      const map = L.map(elRef.current, { zoomControl: true }).setView(BALI_CENTER, 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;
      map.invalidateSize();
      renderMarkers();
    }, 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && mapRef.current) setTimeout(() => mapRef.current.invalidateSize(), 60);
  }, [open, sidebarCollapsed]);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape' && open) onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  function renderMarkers() {
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
      const highlight = ev.uuid === latestUuid || ev.uuid === selectedUuid;
      const icon = L.divIcon({
        className: '',
        html: disasterMarkerSvgHtml(ev.jenisBencana, color, highlight),
        iconSize: highlight ? [42, 42] : [30, 30],
        iconAnchor: highlight ? [21, 21] : [15, 15],
      });
      const marker = L.marker([ev.lat, ev.lng], { icon, zIndexOffset: highlight ? 1000 : 0 }).addTo(map);
      marker.bindPopup(popupHtml(ev));
      marker.on('click', () => selectEvent(ev.uuid));
      markersRef.current[ev.uuid] = marker;
    });
  }

  useEffect(() => {
    if (mapRef.current) renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, selectedUuid]);

  function selectEvent(uuid) {
    setSelectedUuid(uuid);
    const map = mapRef.current;
    const ev = events.find((e) => e.uuid === uuid);
    const marker = markersRef.current[uuid];
    if (map && ev && marker && Number.isFinite(ev.lat)) {
      map.setView([ev.lat, ev.lng], 13, { animate: true });
      setTimeout(() => marker.openPopup(), 300);
    }
  }

  useEffect(() => {
    if (focusUuid && open) selectEvent(focusUuid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUuid, open]);

  const sorted = [...events].sort((a, b) => `${b.tanggal} ${b.jam}`.localeCompare(`${a.tanggal} ${a.jam}`));

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,17,20,0.5)', zIndex: 190,
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .35s ease',
        }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: '100vw', zIndex: 200,
          background: 'var(--bg)', boxShadow: '-8px 0 32px rgba(0,0,0,0.22)',
          transform: `translateX(${open ? '0' : '100%'})`, transition: 'transform .4s cubic-bezier(.2,.9,.25,1)',
        }}
      >
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 999, display: 'flex', gap: 8 }}>
          <button onClick={onClose} aria-label="Tutup peta" style={fabStyle}>✕</button>
        </div>

        <div style={{ display: 'flex', height: '100%' }}>
          <div
            style={{
              width: isMobile ? '100%' : sidebarCollapsed ? 60 : 260,
              flexShrink: 0,
              padding: isMobile ? 20 : sidebarCollapsed ? '20px 12px' : 24,
              background: 'var(--card-bg)',
              display: isMobile && sidebarCollapsed ? 'none' : 'flex',
              flexDirection: 'column',
              borderRight: isMobile ? 'none' : '1px solid var(--border)',
              borderBottom: isMobile ? '1px solid var(--border)' : 'none',
              transition: 'width .35s cubic-bezier(.22,.8,.25,1), padding .35s ease',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              {!sidebarCollapsed && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-08)', borderRadius: 999, padding: '4px 10px', letterSpacing: '0.03em' }}>
                  KEJADIAN
                </span>
              )}
              {!isMobile && (
                <button onClick={() => setSidebarCollapsed((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                  <ChevronIcon pointRight={sidebarCollapsed} />
                </button>
              )}
            </div>
            {!sidebarCollapsed && (
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sorted.map((ev) => {
                  const color = severityColor(ev.jenisBencana);
                  const active = ev.uuid === selectedUuid;
                  return (
                    <button
                      key={ev.uuid}
                      onClick={() => selectEvent(ev.uuid)}
                      style={{
                        textAlign: 'left', display: 'flex', gap: 8, alignItems: 'flex-start',
                        background: active ? 'var(--accent-08)' : 'transparent', border: 'none',
                        borderRadius: 10, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.jenisBencana}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.tanggal} · {ev.kabupaten}</div>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ position: 'relative', flex: 1 }}>
            <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
            <button
              onClick={() => mapRef.current && mapRef.current.setView(BALI_CENTER, 9, { animate: true })}
              style={{
                position: 'absolute', top: 16, left: 16, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', background: 'var(--card-bg)', color: 'var(--fg)', border: '1px solid var(--border2)',
                borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--card-shadow-hover)',
              }}
            >
              <Icon name="pin" width={14} height={14} />
              Seluruh Bali
            </button>

            <button
              onClick={() => setLegendOpen((v) => !v)}
              aria-label="Legenda jenis bencana"
              style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 1000, width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', color: 'var(--fg)', border: '1px solid var(--border2)', cursor: 'pointer', boxShadow: 'var(--card-shadow-hover)' }}
            >
              🎨
            </button>
            {legendOpen && (
              <div style={{ position: 'absolute', bottom: 68, right: 16, zIndex: 1000, width: 220, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--card-shadow-hover)', padding: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 10 }}>Legenda Jenis Bencana</div>
                {Object.entries(JENIS_COLORS).map(([jenis, color]) => (
                  <div key={jenis} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: 'var(--fg2)' }}>{jenis}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const fabStyle = {
  width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--card-bg)', color: 'var(--fg)', border: '1px solid var(--border2)', cursor: 'pointer',
  boxShadow: 'var(--card-shadow-hover)', fontSize: 15,
};

function popupHtml(ev) {
  return `<div style="font-family:Inter,sans-serif;font-size:12.5px;max-width:220px;line-height:1.5;">
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${ev.jenisBencana}</div>
    <div style="color:#555;margin-bottom:6px;">${ev.tanggal} &middot; ${ev.jam} WITA</div>
    <div style="margin-bottom:6px;">${ev.kecamatan}, ${ev.desa}, ${ev.kabupaten}</div>
    <div style="color:#555;">Meninggal: ${ev.korbanMeninggal} &middot; Luka: ${ev.korbanLuka} &middot; Dampak: ${(ev.impacts || []).length}</div>
  </div>`;
}
