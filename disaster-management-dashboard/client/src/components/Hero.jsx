import { useEffect, useState } from 'react';
import { severityColor } from '../theme.js';
import { DisasterIcon, WeatherIcon } from '../icons.jsx';
import { formatRupiah } from '../lib/format.js';
import { analysisUrl } from '../lib/nav.js';
import ImpactReportList from './ImpactReportList.jsx';

function ForecastRow({ weather }) {
  if (!weather || !weather.cuaca || weather.cuaca.length < 2) return null;
  const items = weather.cuaca.slice(1, 7);
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', margin: '8px 0', overflowX: 'auto' }}>
      {items.map((f, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0, minWidth: 34 }}>
          <WeatherIcon src={f.image} alt={f.weather_desc} size={20} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>{f.t}°</span>
          <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{(f.local_datetime || '').slice(11, 16)}</span>
        </div>
      ))}
    </div>
  );
}

function Chip({ children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg2)', background: 'var(--band)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function Hero({ events, weather, onOpenMap, isMobile }) {
  const recent = [...events].sort((a, b) => `${b.tanggal} ${b.jam}`.localeCompare(`${a.tanggal} ${a.jam}`)).slice(0, 3);
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (recent.length < 2) return;
    const t = setInterval(() => {
      if (hover) return;
      setIndex((i) => (i + 1) % recent.length);
    }, 5000);
    return () => clearInterval(t);
  }, [recent.length, hover]);

  if (!recent.length) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--accent)', marginBottom: 12 }}>
          Tiga Kejadian Terbaru
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Belum ada data kejadian.</div>
      </div>
    );
  }

  const ev = recent[Math.min(index, recent.length - 1)];
  const color = severityColor(ev.jenisBencana);
  const impacts = ev.impacts || [];
  const totalKorban = impacts.reduce((s, im) => s + (im.totalKorban || 0), 0) || ev.korbanMeninggal + ev.korbanLuka + ev.korbanHilang;
  const totalMengungsi = impacts.reduce((s, im) => s + (im.mengungsiL || 0) + (im.mengungsiP || 0), 0);
  const totalKerugian = impacts.reduce((s, im) => s + (im.totalKerugian || 0), 0) || ev.kerugian || 0;

  return (
    <div style={{ width: isMobile ? '100%' : 340, flexShrink: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--accent)', marginBottom: 12 }}>
        Tiga Kejadian Terbaru
      </div>
      <div style={{ position: 'relative' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {[2, 1].map((role) => {
          if (role >= recent.length) return null;
          const spread = hover ? [0, 14, 28][role] : 0;
          const rot = hover ? [0, 5, 9][role] : 0;
          const scale = 1 - role * 0.04;
          return (
            <div
              key={role}
              aria-hidden="true"
              style={{
                position: 'absolute', inset: 0, borderRadius: 16, background: 'var(--card-bg)',
                border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)',
                transform: `translateX(${role * 12 + spread}px) rotate(${rot}deg) scale(${scale})`,
                transition: 'transform .35s cubic-bezier(.22,.8,.25,1)', zIndex: 3 - role, pointerEvents: 'none',
              }}
            />
          );
        })}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 18,
          boxShadow: hover ? 'var(--glow-ring), var(--card-shadow-hover)' : 'var(--glow-ring), var(--card-shadow)',
          cursor: 'pointer',
          transform: hover ? 'translateY(-10px)' : 'none',
          transition: 'transform .35s cubic-bezier(.22,.8,.25,1), box-shadow .25s',
        }}
        onClick={() => setIndex((i) => (i + 1) % recent.length)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{ev.jenisBencana}</span>
          </span>
          {weather && weather.cuaca && weather.cuaca[0] ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
              <WeatherIcon src={weather.cuaca[0].image} size={18} />
              {weather.cuaca[0].t}°C
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>{ev.tanggal} · {ev.jam} WITA</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg2)', marginTop: 3 }}>{ev.kecamatan}, {ev.desa}, {ev.kabupaten}</div>

        <ForecastRow weather={weather} />

        <div style={{ fontSize: 12, color: 'var(--fg2)', lineHeight: 1.5, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {ev.keterangan}
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 6 }}>
          Total Dampak — Korban
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <Chip>👥 {totalKorban} korban</Chip>
          <Chip>🏠 {totalMengungsi} mengungsi</Chip>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 6 }}>
          Total Dampak — Kerusakan Bangunan
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip>🏚 {ev.bangunanRb} rusak berat</Chip>
          <Chip>🏠 {ev.bangunanRr} rusak ringan</Chip>
          <Chip>💸 {formatRupiah(totalKerugian)}</Chip>
        </div>

        {impacts.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <ImpactReportList impacts={impacts} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenMap(ev.uuid); }}
            style={{
              flex: 1,
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'white',
              background: 'var(--accent-strong)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            📍 Peta
          </button>
          <a
            href={analysisUrl(ev.uuid)}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--fg)',
              background: 'var(--band)',
              border: '1px solid var(--border2)',
              borderRadius: 10,
              padding: '10px 14px',
              cursor: 'pointer',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            🔎 Analisis Detail
          </a>
        </div>
      </div>
      </div>

      {recent.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          {recent.map((r, i) => (
            <button
              key={r.uuid}
              onClick={() => setIndex(i)}
              aria-label={`Kejadian ${i + 1}`}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background: i === index ? 'var(--accent-strong)' : 'var(--border2)',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
