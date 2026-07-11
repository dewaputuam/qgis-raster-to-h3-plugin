import { Fragment, useMemo, useState } from 'react';
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
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--fg)',
  background: 'var(--card-bg)',
  border: '1px solid var(--border2)',
  borderRadius: 8,
  padding: '8px 10px',
  outline: 'none',
  cursor: 'pointer',
};

export default function EventsList({ events, regions, onOpenMap }) {
  const [jenis, setJenis] = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [expanded, setExpanded] = useState(null);

  const kabupatenOptions = useMemo(() => [...new Set(regions.map((r) => r.kabupaten))].sort(), [regions]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (jenis && e.jenisBencana !== jenis) return false;
        if (kabupaten && e.kabupaten !== kabupaten) return false;
        if (start && e.tanggal < start) return false;
        if (end && e.tanggal > end) return false;
        return true;
      }),
    [events, jenis, kabupaten, start, end]
  );

  const summary = useMemo(() => {
    const byJenis = {};
    const byKab = {};
    let verified = 0;
    for (const e of filtered) {
      byJenis[e.jenisBencana] = (byJenis[e.jenisBencana] || 0) + 1;
      byKab[e.kabupaten] = (byKab[e.kabupaten] || 0) + 1;
      if (e.statusVerifikasi) verified += 1;
    }
    return { byJenis, byKab, verified, total: filtered.length };
  }, [filtered]);

  return (
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '8px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--accent)', marginBottom: 4 }}>
            Rekap Kejadian Bencana
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Total {summary.total} kejadian &middot; {summary.verified} terverifikasi, {summary.total - summary.verified} belum
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={selectStyle} value={jenis} onChange={(e) => setJenis(e.target.value)}>
            <option value="">Semua Jenis</option>
            {JENIS_OPTIONS.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <select style={selectStyle} value={kabupaten} onChange={(e) => setKabupaten(e.target.value)}>
            <option value="">Semua Kabupaten</option>
            {kabupatenOptions.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input type="date" style={selectStyle} value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" style={selectStyle} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'var(--band)', textAlign: 'left' }}>
              {['', 'Tanggal', 'Jenis', 'Kecamatan', 'Desa', 'Kabupaten', 'Status', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                  Tidak ada kejadian yang cocok dengan filter.
                </td>
              </tr>
            )}
            {filtered.map((ev) => {
              const isOpen = expanded === ev.uuid;
              const color = severityColor(ev.jenisBencana);
              return (
                <Fragment key={ev.uuid}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : ev.uuid)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: color, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <DisasterIcon jenis={ev.jenisBencana} width={13} height={13} stroke="white" />
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{ev.tanggal} {ev.jam}</td>
                    <td style={{ padding: '10px 14px' }}>{ev.jenisBencana}</td>
                    <td style={{ padding: '10px 14px' }}>{ev.kecamatan}</td>
                    <td style={{ padding: '10px 14px' }}>{ev.desa}</td>
                    <td style={{ padding: '10px 14px' }}>{ev.kabupaten}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {ev.statusVerifikasi ? (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'oklch(52% 0.14 150)', background: 'oklch(52% 0.14 150 / 0.12)', borderRadius: 999, padding: '3px 8px' }}>Terverifikasi</span>
                      ) : (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--band)', borderRadius: 999, padding: '3px 8px' }}>Belum</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <ChevronIcon pointRight={!isOpen} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: 'var(--band)' }}>
                      <td colSpan={8} style={{ padding: '14px 18px' }}>
                        <div style={{ fontSize: 12.5, color: 'var(--fg2)', marginBottom: 10 }}>{ev.keterangan || ev.lokasi}</div>
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                          <span>Meninggal: {ev.korbanMeninggal}</span>
                          <span>Luka: {ev.korbanLuka}</span>
                          <span>Hilang: {ev.korbanHilang}</span>
                          <span>Rumah Rusak Berat: {ev.bangunanRb}</span>
                          <span>Rusak Sedang: {ev.bangunanRs}</span>
                          <span>Rusak Ringan: {ev.bangunanRr}</span>
                          <span>Kerugian: {formatRupiah(ev.kerugian)}</span>
                          <span>Dampak Tercatat: {(ev.impacts || []).length}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenMap(ev.uuid); }}
                          style={{
                            fontFamily: 'inherit',
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--accent-strong)',
                            background: 'var(--accent-08)',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 14px',
                            cursor: 'pointer',
                          }}
                        >
                          Lihat di Peta
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
