import { severityColor } from '../theme.js';
import { DisasterIcon } from '../icons.jsx';

function WeatherBadge({ weather }) {
  if (!weather || !weather.cuaca || !weather.cuaca.length) {
    return <span style={{ fontSize: 12, color: 'var(--muted)' }}>Cuaca tidak tersedia</span>;
  }
  const now = weather.cuaca[0];
  const lokasiLabel = weather.lokasi ? `${weather.lokasi.desa}, ${weather.lokasi.kecamatan}` : 'Lokasi default';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {now.image && <img src={now.image} alt={now.weather_desc} width={30} height={30} />}
      <div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{now.t}&deg;C &middot; {now.weather_desc}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{lokasiLabel}</div>
      </div>
    </div>
  );
}

export default function Hero({ events, weather, onOpenMap }) {
  const recent = [...events].sort((a, b) => `${b.tanggal} ${b.jam}`.localeCompare(`${a.tanggal} ${a.jam}`)).slice(0, 3);

  return (
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--accent)' }}>
          Tiga Kejadian Terbaru
        </div>
        <WeatherBadge weather={weather} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {recent.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Belum ada data kejadian.</div>}
        {recent.map((ev) => {
          const color = severityColor(ev.jenisBencana);
          return (
            <div
              key={ev.uuid}
              onClick={() => onOpenMap(ev.uuid)}
              style={{
                cursor: 'pointer',
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 18,
                boxShadow: 'var(--card-shadow)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'box-shadow .25s, transform .25s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--card-shadow)'; e.currentTarget.style.transform = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: color,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <DisasterIcon jenis={ev.jenisBencana} width={15} height={15} stroke="white" />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{ev.jenisBencana}</span>
                {ev.statusVerifikasi ? (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'oklch(52% 0.14 150)', background: 'oklch(52% 0.14 150 / 0.12)', borderRadius: 999, padding: '3px 8px' }}>
                    Terverifikasi
                  </span>
                ) : (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--muted)', background: 'var(--band)', borderRadius: 999, padding: '3px 8px' }}>
                    Belum Verifikasi
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {ev.tanggal} &middot; {ev.jam} WITA
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--fg2)' }}>
                {ev.kecamatan}, {ev.desa}, {ev.kabupaten}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                <span>Meninggal: {ev.korbanMeninggal}</span>
                <span>Luka: {ev.korbanLuka}</span>
                <span>Hilang: {ev.korbanHilang}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
