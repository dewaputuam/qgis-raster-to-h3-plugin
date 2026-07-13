const PROGRESS_META = {
  0: { label: 'Proses', color: 'oklch(70% 0.15 70)' },
  1: { label: 'Selesai', color: 'oklch(60% 0.14 150)' },
};

// Per-report breakdown (one card per dampak/impact record: tanggal lapor,
// status penanganan, tim, tindakan, sumber info) - shared between the map's
// EventDetailCard and the public page's Hero gallery cards so both show the
// same level of detail, not just the aggregated totals.
export default function ImpactReportList({ impacts }) {
  if (!impacts.length) return null;
  return (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Dampak Tercatat ({impacts.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {impacts.map((im, i) => {
          const meta = PROGRESS_META[im.progress] || PROGRESS_META[0];
          return (
            <div key={im.idDetail || i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--band)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Lapor {im.tglLaporan || '-'}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: meta.color, background: `color-mix(in oklab, ${meta.color} 18%, transparent)`, borderRadius: 999, padding: '2px 8px' }}>
                  {meta.label}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--fg2)', marginBottom: 2 }}>Tim: {im.penangananTim || '-'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg2)', marginBottom: 4 }}>Tindakan: {im.penangananTindakan || '-'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>Sumber: {im.sumberInfo || '-'}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
