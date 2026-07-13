import { useEffect, useState } from 'react';
import { STATUS_META } from '../../theme.js';
import { api } from '../../lib/api.js';
import { formatDateTime, formatCountdown } from '../../lib/format.js';
import EventsList from '../EventsList.jsx';

const SOURCE_DEFS = {
  sik: { name: 'API SIK — Kejadian Bencana', desc: 'Data kejadian bencana, perlu login' },
  cuaca: { name: 'API BMKG — Cuaca', desc: 'Prakiraan cuaca publik, tanpa login' },
  gempa: { name: 'API BMKG — Gempa Terkini', desc: 'Info gempa terkini publik, tanpa login' },
};

const ALLOWED_INTERVALS = [1, 5, 15, 30, 60];
const ALLOWED_RANGE_MONTHS = [1, 2, 3, 6];

export default function AdminPanel({ events, regions, onOpenMap }) {
  const [sikStatus, setSikStatus] = useState({ loggedIn: false, username: null, tokenExpiresAt: null });
  const [sources, setSources] = useState([]);
  const [fetchSettings, setFetchSettings] = useState({ sik: 15, cuaca: 15, gempa: 15, sikRangeMonths: 3 });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(true);
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  function refresh() {
    api.sikStatus().then(setSikStatus).catch(() => {});
    api.getSources().then((r) => setSources(r.data)).catch(() => {});
    api.getFetchSettings().then((r) => setFetchSettings(r.data)).catch(() => {});
  }

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  async function onLogin(e) {
    e.preventDefault();
    // No client-side "required" gate: whatever's typed (including blank) goes
    // straight to the real SIK login call, and success is judged purely by
    // whether that call actually returns a token (see sikLogin/SikAuthError
    // in server/lib/sik.js) - not by any guess here about what a valid
    // username/password should look like.
    setLoginLoading(true);
    setLoginError(null);
    try {
      await api.sikLogin(username.trim(), password.trim(), rememberSession);
      setPassword('');
      refresh();
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function onLogout() {
    await api.sikLogout();
    refresh();
  }

  async function onFetchNow(key) {
    await api.fetchSourceNow(key);
    setTimeout(refresh, 300);
  }

  async function onIntervalChange(key, minutes) {
    await api.setSourceInterval(key, minutes);
    refresh();
  }

  async function onRangeMonthsChange(months) {
    await api.setSikRangeMonths(months);
    refresh();
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 760;

  return (
    <section style={{ maxWidth: 1800, margin: '0 auto', padding: isMobile ? '28px 20px 60px' : '48px 48px 80px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Internal &middot; Tim/Relawan
        </div>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 6px' }}>Pengaturan Fetching Data</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, maxWidth: 520 }}>
          Kelola koneksi ke sumber data eksternal (API SIK &amp; BMKG) dan atur periode pengambilan data otomatis.
        </p>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--card-shadow)', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Login SIK</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>API SIK memerlukan autentikasi untuk mendapatkan token akses.</div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              color: sikStatus.loggedIn ? 'oklch(52% 0.14 150)' : 'oklch(55% 0.02 255)',
              background: sikStatus.loggedIn ? 'oklch(52% 0.14 150 / 0.12)' : 'oklch(55% 0.02 255 / 0.12)',
            }}
          >
            {sikStatus.loggedIn ? 'Token Aktif' : 'Belum Login'}
          </span>
        </div>

        {sikStatus.loggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{sikStatus.username}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                Token kedaluwarsa dalam {formatCountdown(sikStatus.tokenExpiresAt, now)}
                {sikStatus.rememberSession && ' — akan login otomatis'}
              </div>
              {sikStatus.kabupatenScope && (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>
                  📍 Akun kabupaten terdeteksi: data di halaman Publik, Peta, dan Kelola Data otomatis difilter ke {sikStatus.kabupatenScope} saja.
                </div>
              )}
            </div>
            <button
              onClick={onLogout}
              style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'oklch(55% 0.18 25)', background: 'oklch(55% 0.18 25 / 0.1)', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Logout
            </button>
          </div>
        ) : (
          <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                placeholder="Username SIK"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Password SIK"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
              <button
                type="submit"
                disabled={loginLoading}
                style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'white', background: 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: loginLoading ? 'default' : 'pointer', opacity: loginLoading ? 0.6 : 1 }}
              >
                {loginLoading ? 'Masuk…' : 'Login'}
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={rememberSession} onChange={(e) => setRememberSession(e.target.checked)} />
              Ingat sesi ini (login otomatis saat token habis — password disimpan terenkripsi di komputer ini)
            </label>
          </form>
        )}
        {loginError && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'oklch(55% 0.18 25)', background: 'oklch(55% 0.18 25 / 0.1)', border: '1px solid oklch(55% 0.18 25 / 0.3)', borderRadius: 8, padding: '8px 10px' }}>
            {loginError}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {Object.keys(SOURCE_DEFS).map((key) => {
          const def = SOURCE_DEFS[key];
          const st = sources.find((s) => s.key === key) || { status: 'idle' };
          const meta = STATUS_META[st.status] || STATUS_META.idle;
          const interval = ALLOWED_INTERVALS.includes(Number(fetchSettings[key])) ? fetchSettings[key] : 15;
          const disabledFetch = st.status === 'loading' || (key === 'sik' && !sikStatus.loggedIn);
          return (
            <div key={key} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--card-shadow)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{def.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{def.desc}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', color: meta.color, background: meta.bg }}>
                  {meta.label}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Stat label="Fetch Terakhir" value={formatDateTime(st.lastFetch)} />
                <Stat label="Data Ditarik" value={st.count == null ? '—' : `${st.count} item`} />
                <Stat label="Fetch Berikutnya" value={key === 'sik' && !sikStatus.loggedIn ? '—' : formatCountdown(st.nextFetch, now)} />
              </div>

              {st.error && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'oklch(55% 0.18 25)', background: 'oklch(55% 0.18 25 / 0.1)', border: '1px solid oklch(55% 0.18 25 / 0.3)', borderRadius: 8, padding: '8px 10px' }}>
                  {st.error}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>
                    Interval
                    <select
                      value={interval}
                      onChange={(e) => onIntervalChange(key, Number(e.target.value))}
                      style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--fg)', background: 'var(--card-bg)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 8px', outline: 'none', cursor: 'pointer' }}
                    >
                      {ALLOWED_INTERVALS.map((m) => (
                        <option key={m} value={m}>{m} menit</option>
                      ))}
                    </select>
                  </label>
                  {key === 'sik' && (
                    <label
                      title="Seberapa jauh ke belakang data kejadian ditarik dari SIK (dihitung dari tanggal kejadian, diterapkan pada fetch berikutnya)"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}
                    >
                      Rentang Data
                      <select
                        value={ALLOWED_RANGE_MONTHS.includes(Number(fetchSettings.sikRangeMonths)) ? fetchSettings.sikRangeMonths : 3}
                        onChange={(e) => onRangeMonthsChange(Number(e.target.value))}
                        style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--fg)', background: 'var(--card-bg)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 8px', outline: 'none', cursor: 'pointer' }}
                      >
                        {ALLOWED_RANGE_MONTHS.map((m) => (
                          <option key={m} value={m}>{m} bulan terakhir</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <button
                  disabled={disabledFetch}
                  onClick={() => onFetchNow(key)}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 12,
                    fontWeight: 700,
                    color: disabledFetch ? 'var(--muted)' : 'var(--accent-strong)',
                    background: disabledFetch ? 'var(--band)' : 'var(--accent-08)',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: disabledFetch ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {st.status === 'loading' ? 'Mengambil…' : '↻ Fetch Sekarang'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {sikStatus.loggedIn && (
        <div style={{ marginTop: 32 }}>
          <EventsList events={events} regions={regions} onOpenMap={onOpenMap} />
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg2)' }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  flex: 1,
  minWidth: 160,
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--fg)',
  background: 'var(--band)',
  border: '1px solid var(--border2)',
  borderRadius: 8,
  padding: '9px 12px',
  outline: 'none',
};
