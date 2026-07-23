import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { themeVars, severityColor } from '../theme.js';
import { Icon, DisasterIcon, ChevronIcon, disasterMarkerSvgHtml } from '../icons.jsx';
import { api } from '../lib/api.js';
import { formatRupiah } from '../lib/format.js';
import { mapFocusUrl } from '../lib/nav.js';

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

  const rootRef = useRef(null);
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const impactLayerRef = useRef(null);

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
    if (!showImpactMarkers) return;
    const group = L.layerGroup();
    (event.impacts || []).forEach((im, i) => {
      if (!Number.isFinite(im.lat) || !Number.isFinite(im.lng)) return;
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:50%;background:oklch(55% 0.18 25);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([im.lat, im.lng], { icon }).addTo(group).bindPopup(`<b>Dampak #${i + 1}</b><br/>${im.lokasi || ''}`);
    });
    group.addTo(map);
    impactLayerRef.current = group;
  }, [event, showImpactMarkers]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function shareWhatsApp() {
    const label = event ? `${event.jenisBencana} - ${[event.desa, event.kecamatan && `Kec. ${event.kecamatan}`, event.kabupaten && `Kab. ${event.kabupaten}`].filter(Boolean).join(', ')}` : 'Analisis Detail Bencana';
    const text = `Analisis Detail Bencana: ${label}\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
        <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
          <div ref={mapElRef} style={{ flex: sidebarHidden ? '1 1 auto' : '0 0 74%', minWidth: 0 }} />

          {!sidebarHidden && (
            <div
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
                  <PlaceholderCard title="Profil Wilayah" note="Indeks Bahaya InaRISK, Tapak Bangunan, Fasilitas Umum, dan Demografi Terdampak akan tampil di sini pada tahap berikutnya." />
                ) : (
                  <PlaceholderCard title="Detil Kejadian" note="Cuaca Terkini, Total Dampak Tercatat, dan Dampak per Lokasi akan tampil di sini pada tahap berikutnya." />
                )}
              </div>
            </div>
          )}

          {sidebarHidden && (
            <button
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
