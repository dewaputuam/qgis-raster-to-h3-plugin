import { useState } from 'react';
import { severityColor } from '../theme.js';
import { DisasterIcon } from '../icons.jsx';
import { formatRupiahShort } from '../lib/format.js';

export default function EventMarquee({ events, onOpenMap, style }) {
  const [hover, setHover] = useState(false);
  if (!events.length) return null;
  const cards = [...events, ...events];

  return (
    <div style={{ overflow: 'hidden', ...style }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div
        style={{
          display: 'flex', gap: 12, width: 'max-content',
          animation: `quakeMarquee ${Math.max(90, events.length * 3.5)}s linear infinite`,
          animationPlayState: hover ? 'paused' : 'running',
        }}
      >
        {cards.map((ev, i) => {
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
                  {ev.tanggal} &middot; {ev.kecamatan}, {ev.kabupaten}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--fg2)', fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ☠ {ev.korbanMeninggal} &middot; 🩹 {ev.korbanLuka} &middot; {formatRupiahShort(totalKerugian)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
