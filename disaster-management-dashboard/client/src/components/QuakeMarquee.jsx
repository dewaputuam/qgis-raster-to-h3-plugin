import { useState } from 'react';
import { QuakeIcon } from '../icons.jsx';

export default function QuakeMarquee({ quakes }) {
  const [nearOnly, setNearOnly] = useState(false);
  const [hover, setHover] = useState(false);
  const [selectedQuake, setSelectedQuake] = useState(null);
  const list = nearOnly ? quakes.filter((q) => q.isNearBali) : quakes;

  return (
    <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 24px', flexWrap: 'wrap' }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'oklch(55% 0.18 25)',
            display: 'inline-block',
            animation: 'iconBlink 2.4s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Gempa Terkini</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Data: BMKG</span>
        <button
          onClick={() => setNearOnly((v) => !v)}
          style={{
            marginLeft: 'auto',
            fontFamily: 'inherit',
            fontSize: 11,
            fontWeight: 700,
            color: nearOnly ? 'white' : 'var(--accent-strong)',
            background: nearOnly ? 'var(--accent-strong)' : 'var(--accent-08)',
            border: 'none',
            borderRadius: 999,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          {nearOnly ? '⚠ Dekat Bali saja' : '📍 Filter dekat Bali'}
        </button>
      </div>

      {list.length === 0 ? (
        <div style={{ padding: '10px 24px 16px', fontSize: 12.5, color: 'var(--muted)' }}>
          {quakes.length === 0 ? 'Belum ada data gempa.' : 'Tidak ada gempa dekat Bali saat ini.'}
        </div>
      ) : (
        <div style={{ overflow: 'hidden', paddingBottom: 14 }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <div
            style={{
              display: 'flex',
              gap: 12,
              width: 'max-content',
              animation: `quakeMarquee ${Math.max(20, list.length * 4)}s linear infinite`,
              animationPlayState: hover ? 'paused' : 'running',
              padding: '0 24px',
            }}
          >
            {[...list, ...list].map((q, i) => (
              <div
                key={i}
                onClick={() => setSelectedQuake(q)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'var(--band)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  minWidth: 300,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-strong)', minWidth: 34 }}>{q.Magnitude}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.Wilayah}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                    {q.Tanggal} &middot; {q.Jam} &middot; {q.Kedalaman}
                  </div>
                </div>
                {q.isNearBali && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'oklch(55% 0.18 25)',
                      background: 'oklch(55% 0.18 25 / 0.12)',
                      borderRadius: 999,
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Dekat Bali
                  </span>
                )}
                <div title={q.Potensi}>
                  <QuakeIcon isTsunami={/berpotensi tsunami/i.test(q.Potensi || '') && !/tidak/i.test(q.Potensi || '')} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedQuake && (
        <div
          onClick={() => setSelectedQuake(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 380, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--card-shadow-hover)', padding: 20, position: 'relative' }}
          >
            <button
              onClick={() => setSelectedQuake(null)}
              aria-label="Tutup"
              style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}
            >
              ✕
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-08)', color: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                {selectedQuake.Magnitude}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Magnitudo {selectedQuake.Magnitude}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selectedQuake.Tanggal} &middot; {selectedQuake.Jam}</div>
              </div>
            </div>
            <ModalRow label="Wilayah" value={selectedQuake.Wilayah} />
            <ModalRow label="Koordinat" value={`${selectedQuake.Lintang || ''}, ${selectedQuake.Bujur || ''}`} />
            <ModalRow label="Kedalaman" value={selectedQuake.Kedalaman} />
            <ModalRow
              label="Potensi Tsunami"
              value={selectedQuake.Potensi}
              valueColor={/berpotensi tsunami/i.test(selectedQuake.Potensi || '') && !/tidak/i.test(selectedQuake.Potensi || '') ? 'oklch(58% 0.18 30)' : 'var(--fg2)'}
              last
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ModalRow({ label, value, valueColor, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor || 'var(--fg)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
