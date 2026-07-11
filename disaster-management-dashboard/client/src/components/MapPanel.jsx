import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { severityColor, JENIS_COLORS } from '../theme.js';
import { disasterMarkerSvgHtml, Icon, ExpandIcon, LegendIcon, DisasterIcon } from '../icons.jsx';
import MapSidebar from './MapSidebar.jsx';
import EventDetailCard from './EventDetailCard.jsx';

const BALI_CENTER = [-8.4, 115.15];

function isWithinBaliBounds(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat <= -7.8 && lat >= -9.0 && lng >= 114.0 && lng <= 116.0;
}

export default function MapPanel({ open, events, regions, focusUuid, isMobile, onClose }) {
  const panelRef = useRef(null);
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const initedRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [invalidOpen, setInvalidOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedUuid, setSelectedUuid] = useState(null);
  const [filters, setFilters] = useState({ jenis: '', kabupaten: '', start: '', end: '' });

  const filteredEvents = events.filter((ev) => {
    if (filters.jenis && ev.jenisBencana !== filters.jenis) return false;
    if (filters.kabupaten && ev.kabupaten !== filters.kabupaten) return false;
    if (filters.start && ev.tanggal < filters.start) return false;
    if (filters.end && ev.tanggal > filters.end) return false;
    return true;
  });
  const invalidEvents = filteredEvents.filter((ev) => !isWithinBaliBounds(ev.lat, ev.lng));
  const mappable = filteredEvents.filter((ev) => isWithinBaliBounds(ev.lat, ev.lng));
  const selectedEvent = events.find((e) => e.uuid === selectedUuid) || null;

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
  }, [open, sidebarCollapsed, fullscreen]);

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
    mappable.forEach((ev) => {
      const key = `${ev.tanggal || ''} ${ev.jam || ''}`;
      if (key > latestKey) { latestKey = key; latestUuid = ev.uuid; }
    });

    mappable.forEach((ev) => {
      const color = severityColor(ev.jenisBencana);
      const highlight = ev.uuid === latestUuid || ev.uuid === selectedUuid;
      const icon = L.divIcon({
        className: '',
        html: disasterMarkerSvgHtml(ev.jenisBencana, color, highlight),
        iconSize: highlight ? [42, 42] : [30, 30],
        iconAnchor: highlight ? [21, 21] : [15, 15],
      });
      const marker = L.marker([ev.lat, ev.lng], { icon, zIndexOffset: highlight ? 1000 : 0 }).addTo(map);
      marker.on('click', () => selectEvent(ev.uuid));
      markersRef.current[ev.uuid] = marker;
    });
  }

  useEffect(() => {
    if (mapRef.current) renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, selectedUuid, filters]);

  function selectEvent(uuid) {
    setSelectedUuid(uuid);
    const map = mapRef.current;
    const ev = events.find((e) => e.uuid === uuid);
    const marker = markersRef.current[uuid];
    if (map && ev && marker && Number.isFinite(ev.lat)) {
      map.setView([ev.lat, ev.lng], 13, { animate: true });
    }
  }

  useEffect(() => {
    if (focusUuid && open) selectEvent(focusUuid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUuid, open]);

  function toggleFullscreen() {
    if (!panelRef.current) return;
    if (!document.fullscreenElement) {
      panelRef.current.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  }

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
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: '100vw', zIndex: 200,
          background: 'var(--bg)', boxShadow: '-8px 0 32px rgba(0,0,0,0.22)',
          transform: `translateX(${open ? '0' : '100%'})`, transition: 'transform .4s cubic-bezier(.2,.9,.25,1)',
        }}
      >
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 999, display: 'flex', gap: 8 }}>
          <button onClick={toggleFullscreen} aria-label="Layar penuh" style={fabStyle}>
            <ExpandIcon expanded={fullscreen} />
          </button>
          <button onClick={onClose} aria-label="Tutup peta" style={fabStyle}>✕</button>
        </div>

        <div style={{ display: 'flex', height: '100%' }}>
          <MapSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            isMobile={isMobile}
            events={events}
            filteredEvents={filteredEvents}
            regions={regions}
            filters={filters}
            onFilterChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            selectedUuid={selectedUuid}
            onSelectEvent={selectEvent}
          />

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
              style={{ ...cornerFabStyle, bottom: 16, right: 16 }}
            >
              <LegendIcon />
            </button>
            {legendOpen && (
              <div style={{ position: 'absolute', bottom: 68, right: 16, zIndex: 1000, width: 'min(240px, calc(100% - 32px))', maxHeight: 'min(360px, calc(100% - 100px))', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--card-shadow-hover)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Legenda</span>
                  <button
                    onClick={() => setLegendOpen(false)}
                    aria-label="Tutup legenda"
                    style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--band)', color: 'var(--fg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, lineHeight: 1, flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', overflowY: 'auto' }}>
                  {Object.entries(JENIS_COLORS).map(([jenis, color]) => (
                    <div key={jenis} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <DisasterIcon jenis={jenis} width={10} height={10} stroke="white" strokeWidth={2.2} />
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--fg2)' }}>{jenis}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 1000 }}>
              <button
                onClick={() => setInvalidOpen((v) => !v)}
                aria-label="Kejadian tanpa koordinat valid"
                style={{ ...cornerFabStyle, position: 'relative' }}
              >
                <Icon name="alert" width={18} height={18} stroke="oklch(58% 0.18 30)" />
                {invalidEvents.length > 0 && (
                  <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 999, background: 'oklch(58% 0.18 30)', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                    {invalidEvents.length}
                  </span>
                )}
              </button>
            </div>
            {invalidOpen && invalidEvents.length > 0 && (
              <div style={{ position: 'absolute', bottom: 68, left: 16, zIndex: 1000, width: 'min(320px, calc(100% - 32px))', maxHeight: 'min(360px, calc(100% - 100px))', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--card-shadow-hover)', overflow: 'hidden' }}>
                <div style={{ padding: 14, borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700 }}>
                  Kejadian tanpa lokasi valid ({invalidEvents.length})
                </div>
                <div style={{ overflowY: 'auto', padding: 8 }}>
                  {invalidEvents.map((ev) => (
                    <div key={ev.uuid} style={{ padding: '8px 10px', fontSize: 11.5 }}>
                      <div style={{ fontWeight: 700 }}>{ev.jenisBencana}</div>
                      <div style={{ color: 'var(--muted)' }}>{ev.tanggal} &middot; {ev.kecamatan}, {ev.kabupaten}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedEvent && (
              <EventDetailCard
                event={selectedEvent}
                regions={regions}
                color={severityColor(selectedEvent.jenisBencana)}
                onClose={() => setSelectedUuid(null)}
              />
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

const cornerFabStyle = {
  position: 'absolute', zIndex: 1000, width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center',
  justifyContent: 'center', background: 'var(--card-bg)', color: 'var(--fg)', border: '1px solid var(--border2)',
  cursor: 'pointer', boxShadow: 'var(--card-shadow-hover)',
};
