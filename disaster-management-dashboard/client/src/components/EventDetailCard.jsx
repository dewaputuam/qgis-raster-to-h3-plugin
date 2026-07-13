import { useEffect, useState } from 'react';
import { formatRupiah } from '../lib/format.js';
import { api } from '../lib/api.js';
import { InfoIcon, WeatherIcon } from '../icons.jsx';
import ImpactReportList from './ImpactReportList.jsx';

function norm(s) {
  return (s || '').toString().trim().toLowerCase();
}

function WeatherBox({ event, regions }) {
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    setStatus('loading');
    setWeather(null);
    const match = regions.find(
      (r) => norm(r.kabupaten) === norm(event.kabupaten) && norm(r.kecamatan) === norm(event.kecamatan) && norm(r.desa) === norm(event.desa)
    );
    if (!match) { setStatus('notfound'); return; }
    api.lookupWeather(match.adm4)
      .then((r) => {
        if (!r.data || !r.data.cuaca || !r.data.cuaca.length) { setStatus('empty'); return; }
        setWeather(r.data);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [event.uuid, event.kabupaten, event.kecamatan, event.desa, regions]);

  if (status === 'loading') return <Box>Memuat cuaca…</Box>;
  if (status === 'notfound') return <Box>Lokasi tidak ditemukan di data wilayah.</Box>;
  if (status === 'empty' || status === 'error') return <Box>Cuaca tidak tersedia.</Box>;

  const now = weather.cuaca[0];
  const strip = weather.cuaca.slice(1, 7);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--band)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.03em' }}>CUACA TERKINI</span>
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Data: BMKG</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <WeatherIcon src={now.image} size={30} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{now.t}&deg;C &middot; {now.weather_desc}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Kelembapan {now.hu}% &middot; {(now.local_datetime || '').slice(11, 16)} WITA</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
        {strip.map((f, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0, minWidth: 34 }}>
            <WeatherIcon src={f.image} size={20} />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{(f.local_datetime || '').slice(11, 16)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Box({ children }) {
  return <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--band)', marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>{children}</div>;
}

function Chip({ children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg2)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap', display: 'inline-block' }}>
      {children}
    </span>
  );
}

export default function EventDetailCard({ event, regions, color, onClose }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const impacts = event.impacts || [];
  const totalKorban = impacts.reduce((s, im) => s + (im.totalKorban || 0), 0);
  const totalKerugian = impacts.reduce((s, im) => s + (im.totalKerugian || 0), 0);
  const totalMengungsi = impacts.reduce((s, im) => s + (im.mengungsiL || 0) + (im.mengungsiP || 0), 0);

  return (
    <div
      style={{
        position: 'absolute', top: 72, right: 16, bottom: 16, width: 'min(320px, calc(100% - 32px))',
        display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: 'var(--card-shadow-hover)', overflow: 'hidden', zIndex: 400,
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>{event.jenisBencana}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{event.tanggal} &middot; {event.jam} WITA</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Tutup" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', marginBottom: 14 }}>
          {event.kecamatan}, {event.desa}, {event.kabupaten}
        </div>

        <WeatherBox event={event} regions={regions} />

        <div style={{ fontSize: 12.5, color: 'var(--fg2)', lineHeight: 1.5, marginBottom: 14 }}>{event.keterangan}</div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <Chip>☠ {event.korbanMeninggal} meninggal</Chip>
          <Chip>🩹 {event.korbanLuka} luka</Chip>
          <Chip>❓ {event.korbanHilang} hilang</Chip>
          <Chip>{formatRupiah(event.kerugian)}</Chip>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
          Total Dampak Tercatat
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <Chip>👥 {totalKorban} korban</Chip>
          <Chip>💰 {formatRupiah(totalKerugian)}</Chip>
          <Chip>🏠 {totalMengungsi} mengungsi</Chip>
        </div>

        <ImpactReportList impacts={impacts} />
      </div>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setInfoOpen((v) => !v)}
          aria-label="Info ikon dan lencana"
          style={{ position: 'absolute', bottom: 12, right: 12, width: 34, height: 34, borderRadius: '50%', background: 'var(--band)', border: '1px solid var(--border2)', color: 'var(--fg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <InfoIcon />
        </button>
        {infoOpen && (
          <div style={{ position: 'absolute', bottom: 52, right: 12, width: 220, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--card-shadow-hover)', padding: 12, fontSize: 11, color: 'var(--fg2)', lineHeight: 1.5 }}>
            Titik warna menunjukkan jenis bencana. Chip pertama = data kejadian utama; "Total Dampak Tercatat" = akumulasi semua laporan dampak di bawahnya.
          </div>
        )}
      </div>
    </div>
  );
}
