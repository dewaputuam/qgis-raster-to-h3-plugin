import { useEffect, useState } from 'react';

export default function TrendChart({ events, isMobile }) {
  const counts = {};
  const korban = {};
  events.forEach((e) => {
    if (!e.tanggal) return;
    counts[e.tanggal] = (counts[e.tanggal] || 0) + 1;
    korban[e.tanggal] = (korban[e.tanggal] || 0) + (e.korbanMeninggal || 0) + (e.korbanLuka || 0) + (e.korbanHilang || 0);
  });
  const dates = Object.keys(counts).sort();

  const [hoverDate, setHoverDate] = useState(null);
  const [manualHover, setManualHover] = useState(false);

  useEffect(() => {
    if (!dates.length) return;
    const t = setInterval(() => {
      if (manualHover) return;
      setHoverDate((cur) => {
        const idx = dates.indexOf(cur);
        const next = idx === -1 ? 0 : (idx + 1) % dates.length;
        return dates[next];
      });
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.join(','), manualHover]);

  if (!dates.length) return null;

  const w = isMobile ? 320 : 460;
  const h = 90;
  const padL = 4, padR = 4, padT = 6, padB = 18;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const maxCount = Math.max(...dates.map((d) => counts[d]));
  const barGap = 3;
  const barW = Math.max(3, (innerW - barGap * (dates.length - 1)) / dates.length);

  const bars = dates.map((d, i) => {
    const count = counts[d];
    const barH = maxCount ? Math.max(2, (count / maxCount) * innerH) : 2;
    const isHover = hoverDate === d;
    const drawH = isHover ? Math.min(innerH, barH + 4) : barH;
    const x = padL + i * (barW + barGap);
    const y = padT + (innerH - drawH);
    return (
      <rect
        key={d}
        x={x}
        y={y}
        width={barW}
        height={drawH}
        rx={1.5}
        fill={isHover ? 'oklch(70% 0.19 55)' : 'var(--accent-strong)'}
        opacity={isHover ? 1 : 0.35 + 0.65 * (count / maxCount)}
        style={{ cursor: 'pointer', transition: 'fill .2s ease, height .2s ease, y .2s ease' }}
        onMouseEnter={() => { setHoverDate(d); setManualHover(true); }}
        onMouseLeave={() => setManualHover(false)}
      />
    );
  });

  const firstLabel = dates[0].slice(5).replace('-', '/');
  const lastLabel = dates[dates.length - 1].slice(5).replace('-', '/');

  let caption = 'Jumlah kejadian tercatat per hari — arahkan kursor ke batang untuk detail';
  if (hoverDate) {
    let count = 0, kor = 0;
    events.forEach((e) => {
      if (e.tanggal !== hoverDate) return;
      count += 1;
      kor += (e.korbanMeninggal || 0) + (e.korbanLuka || 0) + (e.korbanHilang || 0);
    });
    const dt = new Date(hoverDate + 'T00:00:00');
    const label = isNaN(dt) ? hoverDate : dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    caption = `${label} · ${count} kejadian · ${kor} korban`;
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '6px 0 10px' }}>{caption}</p>
      <div style={{ position: 'relative' }}>
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {bars}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)', marginTop: 2, fontWeight: 600 }}>
          <span>{firstLabel}</span>
          <span>{lastLabel}</span>
        </div>
      </div>
    </div>
  );
}
