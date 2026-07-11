import { useMemo } from 'react';
import { severityColor } from '../theme.js';
import { DisasterIcon, ChevronIcon } from '../icons.jsx';
import { formatRupiah } from '../lib/format.js';

const JENIS_OPTIONS = [
  'Kebakaran Gedung dan Permukiman',
  'Kebakaran Hutan dan Lahan',
  'Cuaca Ekstrem',
  'Tanah Longsor',
  'Banjir',
  'Kejadian Lainnya',
];

const selectStyle = {
  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', background: 'var(--band)',
  border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 12px', outline: 'none', cursor: 'pointer', width: '100%',
};

export default function MapSidebar({
  collapsed, onToggleCollapse, isMobile,
  events, filteredEvents, regions, filters, onFilterChange, selectedUuid, onSelectEvent,
}) {
  const totalKejadian = events.length;
  const korbanMeninggal = events.reduce((s, e) => s + (e.korbanMeninggal || 0), 0);
  const totalKerugian = events.reduce(
    (s, e) => s + (e.kerugian || 0) + (e.impacts || []).reduce((s2, im) => s2 + (im.totalKerugian || 0), 0),
    0
  );
  const kabupatenOptions = useMemo(() => [...new Set(regions.map((r) => r.kabupaten))].sort(), [regions]);
  const sorted = [...filteredEvents].sort((a, b) => `${b.tanggal} ${b.jam}`.localeCompare(`${a.tanggal} ${a.jam}`));

  return (
    <div
      style={{
        width: isMobile ? '100%' : collapsed ? 60 : 260,
        flexShrink: 0,
        padding: isMobile ? 20 : collapsed ? '20px 12px' : 24,
        background: 'var(--card-bg)',
        display: isMobile && collapsed ? 'none' : 'flex',
        flexDirection: 'column',
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        borderBottom: isMobile ? '1px solid var(--border)' : 'none',
        transition: 'width .35s cubic-bezier(.22,.8,.25,1), padding .35s ease',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 16, flexShrink: 0 }}>
        {!collapsed && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-08)', borderRadius: 999, padding: '4px 10px', letterSpacing: '0.03em' }}>
            KEJADIAN
          </span>
        )}
        {!isMobile && (
          <button onClick={onToggleCollapse} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronIcon pointRight={collapsed} />
          </button>
        )}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Peta Kejadian Bencana</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
              Rekap kejadian bencana Provinsi Bali, lengkap dengan data dampak per kejadian.
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <StatCard value={totalKejadian} label="📋 Total kejadian" />
              <StatCard value={korbanMeninggal} label="☠ Korban meninggal" />
            </div>
            <StatCard value={formatRupiah(totalKerugian)} label="💸 Total kerugian" wide />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select style={selectStyle} value={filters.jenis} onChange={(e) => onFilterChange({ jenis: e.target.value })}>
              <option value="">Semua Jenis Bencana</option>
              {JENIS_OPTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
            <select style={selectStyle} value={filters.kabupaten} onChange={(e) => onFilterChange({ kabupaten: e.target.value })}>
              <option value="">Semua Kabupaten/Kota</option>
              {kabupatenOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" style={selectStyle} value={filters.start} onChange={(e) => onFilterChange({ start: e.target.value })} />
              <input type="date" style={selectStyle} value={filters.end} onChange={(e) => onFilterChange({ end: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            {sorted.map((ev) => {
              const color = severityColor(ev.jenisBencana);
              const active = ev.uuid === selectedUuid;
              return (
                <button
                  key={ev.uuid}
                  onClick={() => onSelectEvent(ev.uuid)}
                  style={{
                    textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center',
                    background: active ? 'var(--accent-08)' : 'transparent', border: 'none',
                    borderRadius: 10, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <DisasterIcon jenis={ev.jenisBencana} width={14} height={14} stroke="white" />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.jenisBencana}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.tanggal} &middot; {ev.kecamatan}, {ev.kabupaten}
                    </div>
                  </span>
                  <ChevronIcon pointRight={active} />
                </button>
              );
            })}
            {sorted.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 10px' }}>Tidak ada kejadian sesuai filter.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, wide }) {
  return (
    <div style={{ flex: wide ? '1 1 auto' : 1, border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--band)' }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
