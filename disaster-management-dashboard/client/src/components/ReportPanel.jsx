import { useState } from 'react';
import { severityColor } from '../theme.js';
import { DisasterIcon } from '../icons.jsx';
import { formatRupiah, formatRupiahShort } from '../lib/format.js';
import TrendChart from './TrendChart.jsx';

function lastUpdateLabel(events) {
  if (!events.length) return 'Memuat data terbaru…';
  const latest = [...events].sort((a, b) => `${b.tanggal} ${b.jam}`.localeCompare(`${a.tanggal} ${a.jam}`))[0];
  if (!latest) return '';
  return `Update terakhir: ${latest.tanggal}${latest.jam ? ' · ' + latest.jam + ' WITA' : ''}`;
}

function periodLabel(events) {
  const dates = events.map((e) => e.tanggal).filter(Boolean).sort();
  if (!dates.length) return '';
  const dt = new Date(dates[dates.length - 1] + 'T00:00:00');
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
}

function StatGroup({ title, items }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {items.map(([value, label]) => (
          <div key={label}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportPanel({ events, isMobile, onOpenMap }) {
  const [marqueeHover, setMarqueeHover] = useState(false);
  const total = events.length;
  const titikDampak = events.reduce((s, e) => s + (e.impacts || []).length, 0);
  const meninggal = events.reduce((s, e) => s + (e.korbanMeninggal || 0), 0);
  const lukaBerat = events.reduce((s, e) => s + (e.impacts || []).reduce((s2, im) => s2 + (im.korbanLukaBerat || 0), 0), 0);
  const hilang = events.reduce((s, e) => s + (e.korbanHilang || 0), 0);
  const rusakBerat = events.reduce((s, e) => s + (e.bangunanRb || 0), 0);
  const rusakRingan = events.reduce((s, e) => s + (e.bangunanRr || 0), 0);
  const kerugian = formatRupiah(
    events.reduce((s, e) => s + (e.kerugian || 0) + (e.impacts || []).reduce((s2, im) => s2 + (im.totalKerugian || 0), 0), 0)
  );

  const marqueeCards = [...events, ...events];

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
        BPBD Bali {periodLabel(events) ? `· ${periodLabel(events)}` : ''}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>{lastUpdateLabel(events)}</div>
      <h1 style={{ fontSize: isMobile ? 26 : 34, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Ringkasan Laporan Kejadian</h1>

      <TrendChart events={events} isMobile={isMobile} />

      <div style={{ marginTop: 18 }}>
        <StatGroup
          title="Ringkasan"
          items={[[total, '📋 Titik kejadian'], [titikDampak, '📍 Titik dampak'], [kerugian, '💸 Total kerugian']]}
        />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <StatGroup title="Korban" items={[[meninggal, '☠ Meninggal'], [lukaBerat, '🩹 Luka berat'], [hilang, '❓ Hilang']]} />
          <StatGroup title="Kerusakan Bangunan" items={[[rusakBerat, '🏚 Rusak berat'], [rusakRingan, '🏠 Rusak ringan']]} />
        </div>
      </div>

      {marqueeCards.length > 0 && (
        <div style={{ marginTop: 24, overflow: 'hidden' }} onMouseEnter={() => setMarqueeHover(true)} onMouseLeave={() => setMarqueeHover(false)}>
          <div
            style={{
              display: 'flex', gap: 12, width: 'max-content',
              animation: `quakeMarquee ${Math.max(90, events.length * 3.5)}s linear infinite`,
              animationPlayState: marqueeHover ? 'paused' : 'running',
            }}
          >
            {marqueeCards.map((ev, i) => {
              const color = severityColor(ev.jenisBencana);
              const totalKerugian = (ev.impacts || []).reduce((s, im) => s + (im.totalKerugian || 0), 0) || ev.kerugian || 0;
              return (
                <div
                  key={i}
                  onClick={() => onOpenMap(ev.uuid)}
                  style={{
                    flexShrink: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: 300,
                    padding: '11px 14px',
                    background: 'var(--band)',
                    border: '1px solid var(--border)',
                    borderRadius: 11,
                  }}
                >
                  <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: `color-mix(in oklab, ${color} 25%, var(--card-bg))`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DisasterIcon jenis={ev.jenisBencana} width={17} height={17} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.jenisBencana}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.tanggal} · {ev.kecamatan}, {ev.kabupaten}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg2)', fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ☠ {ev.korbanMeninggal} · 🩹 {ev.korbanLuka} · {formatRupiahShort(totalKerugian)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
