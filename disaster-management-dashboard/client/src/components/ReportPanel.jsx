import { severityColor } from '../theme.js';
import { formatRupiah } from '../lib/format.js';
import TrendChart from './TrendChart.jsx';
import EventMarquee from './EventMarquee.jsx';

function RankedBreakdown({ title, counts, colorFor }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([label, count]) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: 'var(--fg2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{count}</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'var(--band)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${max ? (count / max) * 100 : 0}%`, background: colorFor ? colorFor(label) : 'var(--accent-strong)', borderRadius: 999 }} />
            </div>
          </div>
        ))}
        {!entries.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Belum ada data.</div>}
      </div>
    </div>
  );
}

function countBy(events, key) {
  const counts = {};
  for (const ev of events) {
    const k = ev[key] || '(tidak diketahui)';
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

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

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 28, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <RankedBreakdown title="Kejadian per Kabupaten/Kota" counts={countBy(events, 'kabupaten')} />
        <RankedBreakdown title="Kejadian per Jenis Bencana" counts={countBy(events, 'jenisBencana')} colorFor={severityColor} />
      </div>

      <EventMarquee events={events} onOpenMap={onOpenMap} style={{ marginTop: 24 }} />
    </div>
  );
}
