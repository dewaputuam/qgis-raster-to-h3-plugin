import { useEffect, useState, useCallback } from 'react';
import { themeVars } from './theme.js';
import { Icon } from './icons.jsx';
import { api } from './lib/api.js';
import QuakeMarquee from './components/QuakeMarquee.jsx';
import Hero from './components/Hero.jsx';
import ReportPanel from './components/ReportPanel.jsx';
import MapPanel from './components/MapPanel.jsx';
import AdminPanel from './components/admin/AdminPanel.jsx';
import NewEventsNotification from './components/NewEventsNotification.jsx';

const DARK_MODE_KEY = 'disaster-dashboard-dark-mode';

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(DARK_MODE_KEY) === '1');
  const [view, setView] = useState('public');
  const [mapPanelOpen, setMapPanelOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [regions, setRegions] = useState([]);
  const [quakes, setQuakes] = useState([]);
  const [weather, setWeather] = useState(null);
  const [mapFocusUuid, setMapFocusUuid] = useState(null);
  const [kabupatenScope, setKabupatenScope] = useState(null);
  const [width, setWidth] = useState(() => window.innerWidth);
  const isMobile = width < 760;

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const refreshEvents = useCallback(() => {
    api.getEvents().then((r) => setEvents(r.data)).catch(() => {});
  }, []);
  const refreshQuakes = useCallback(() => {
    api.getQuakes().then((r) => setQuakes(r.data)).catch(() => {});
  }, []);
  const refreshWeather = useCallback(() => {
    api.getWeather().then((r) => setWeather(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshEvents();
    refreshQuakes();
    refreshWeather();
    api.getRegions().then((r) => setRegions(r.data)).catch(() => {});
    const t = setInterval(() => {
      refreshEvents();
      refreshQuakes();
      refreshWeather();
    }, 30000);
    return () => clearInterval(t);
  }, [refreshEvents, refreshQuakes, refreshWeather]);

  useEffect(() => {
    // A kabupaten-office SIK account (as opposed to a provincial "bidang"
    // one) scopes every data endpoint server-side to just that kabupaten -
    // this just polls for the badge shown here in the header, the actual
    // filtering already happened before events/regions reached this app.
    function refreshScope() {
      api.sikStatus().then((s) => setKabupatenScope(s.kabupatenScope || null)).catch(() => {});
    }
    refreshScope();
    const t = setInterval(refreshScope, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.body.style.background = darkMode ? 'oklch(16% 0.014 260)' : 'oklch(98.5% 0.004 250)';
    localStorage.setItem(DARK_MODE_KEY, darkMode ? '1' : '0');
  }, [darkMode]);

  const vars = themeVars(darkMode);
  const rootStyle = {
    ...vars,
    fontFamily: "'Inter', sans-serif",
    background: 'var(--bg)',
    color: 'var(--fg)',
    minHeight: '100vh',
    transition: 'background .45s ease, color .45s ease',
  };

  function jumpToEventOnMap(uuid) {
    refreshEvents();
    setMapPanelOpen(true);
    setMapFocusUuid(uuid);
  }

  return (
    <div style={rootStyle}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'var(--header-bg)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--border)',
          transition: 'background .45s ease, border-color .45s ease',
        }}
      >
        <div
          style={{
            maxWidth: 1800,
            margin: '0 auto',
            padding: '12px 48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setView('public')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, color: 'inherit', textAlign: 'left', font: 'inherit',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: 'var(--accent-08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 2 21h20L12 2z" />
                <line x1="12" y1="9" x2="12" y2="14" />
                <circle cx="12" cy="17" r="0.6" fill="var(--accent-strong)" />
              </svg>
            </div>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Dashboard Monitoring</span>
              <span style={{ fontWeight: 600, fontSize: 11.5, color: 'var(--muted)', letterSpacing: '0.01em' }}>Sistem Informasi Kebencanaan</span>
            </span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {kabupatenScope && (
              <span
                title="Akun SIK yang login adalah akun kabupaten - semua data (Publik, Peta, Kelola Data) otomatis difilter ke kabupaten ini"
                style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-08)',
                  borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap',
                }}
              >
                📍 {kabupatenScope}
              </span>
            )}
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--band)', borderRadius: 999 }}>
              <ToggleBtn active={view === 'public'} onClick={() => setView('public')}>Publik</ToggleBtn>
              <ToggleBtn active={mapPanelOpen} onClick={() => setMapPanelOpen((v) => !v)}>Peta</ToggleBtn>
              <ToggleBtn active={view === 'admin'} onClick={() => setView('admin')}>Kelola Data</ToggleBtn>
            </div>
            <button
              onClick={() => setDarkMode((v) => !v)}
              aria-label="Toggle dark mode"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                flexShrink: 0,
                fontFamily: 'inherit',
                color: 'var(--fg2)',
                background: 'var(--band)',
                border: '1px solid var(--border)',
                borderRadius: '50%',
                cursor: 'pointer',
              }}
            >
              <Icon name={darkMode ? 'sun' : 'moon'} width={16} height={16} />
            </button>
          </div>
        </div>
      </header>

      {view === 'public' && (
        <>
          <QuakeMarquee quakes={quakes} />
          <section
            style={{
              maxWidth: 1800,
              margin: '0 auto',
              padding: isMobile ? '28px 20px' : '40px 48px',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '340px 1fr',
              gap: 40,
              alignItems: 'start',
            }}
          >
            <Hero events={events} weather={weather} onOpenMap={jumpToEventOnMap} isMobile={isMobile} />
            <ReportPanel events={events} isMobile={isMobile} onOpenMap={jumpToEventOnMap} kabupatenScope={kabupatenScope} />
          </section>
        </>
      )}

      {view === 'admin' && <AdminPanel events={events} regions={regions} onOpenMap={jumpToEventOnMap} />}

      <MapPanel open={mapPanelOpen} events={events} regions={regions} focusUuid={mapFocusUuid} isMobile={isMobile} kabupatenScope={kabupatenScope} onClose={() => setMapPanelOpen(false)} />
      <NewEventsNotification onOpenMap={jumpToEventOnMap} />
    </div>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'inherit',
        fontSize: 12.5,
        fontWeight: 700,
        padding: '8px 16px',
        borderRadius: 999,
        cursor: 'pointer',
        border: 'none',
        transition: 'background .2s, color .2s',
        background: active ? 'var(--card-bg)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--muted)',
        boxShadow: active ? 'var(--card-shadow)' : 'none',
      }}
    >
      {children}
    </button>
  );
}
