const commonProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'var(--accent-strong)',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function Icon({ name, ...rest }) {
  const props = { ...commonProps, ...rest };
  switch (name) {
    case 'alert':
      return (
        <svg {...props}>
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v4" />
          <circle cx="12" cy="17.3" r="0.6" fill={props.stroke} />
        </svg>
      );
    case 'pin':
      return (
        <svg {...props}>
          <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" />
          <circle cx="12" cy="9" r="2.3" />
        </svg>
      );
    case 'pen':
      return (
        <svg {...props}>
          <path d="M4 20l4-1 11-11-3-3L5 16z" />
          <path d="M14 6l3 3" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...props}>
          <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
        </svg>
      );
    default:
      return null;
  }
}

export function ExpandIcon({ expanded, ...rest }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  return (
    <svg {...props}>
      {expanded ? (
        <>
          <path d="M4 9h5V4" />
          <path d="M20 9h-5V4" />
          <path d="M4 15h5v5" />
          <path d="M20 15h-5v5" />
        </>
      ) : (
        <>
          <path d="M9 3H4v5" />
          <path d="M15 3h5v5" />
          <path d="M9 21H4v-5" />
          <path d="M15 21h5v-5" />
        </>
      )}
    </svg>
  );
}

export function InfoIcon(props) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function ChevronIcon({ pointRight }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: pointRight ? 'rotate(180deg)' : 'none', transition: 'transform .3s ease', display: 'block' }}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function QuakeIcon({ isTsunami }) {
  const color = isTsunami ? 'oklch(70% 0.17 60)' : 'var(--accent-strong)';
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill={color} stroke="white" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5L23 21H1z" />
      <path d="M12 9.5v5" stroke="white" fill="none" />
      <circle cx="12" cy="17.3" r="0.6" fill="white" stroke="none" />
    </svg>
  );
}

const JENIS_ICON_PATHS = {
  'Kebakaran Gedung dan Permukiman': [
    'M12 3c1 3-3 4-3 8a3 3 0 006 0c0-1-.5-1.5-.5-2.5.8.8 1.5 2 1.5 3.5a4 4 0 01-8 0c0-5 3.2-6 4-9z',
  ],
  'Kebakaran Hutan dan Lahan': [
    'M12 3c1 3-3 4-3 8a3 3 0 006 0c0-1-.5-1.5-.5-2.5.8.8 1.5 2 1.5 3.5a4 4 0 01-8 0c0-5 3.2-6 4-9z',
    'M3 21c2-3 4 2 6 0M15 21c2-3 4 2 6 0',
  ],
  'Cuaca Ekstrem': ['M7 17a4 4 0 01.5-7.97A5 5 0 0117 8a4 4 0 01-.5 8H7z', 'M10 20l1.5-2.5M14 20l1.5-2.5'],
  'Tanah Longsor': ['M3 19l5-9 3 5 2.5-3.5L19 19z', 'M3 19h18'],
  Banjir: ['M3 10c2-2 4 2 6 0s4-2 6 0 4 2 6 0', 'M3 15c2-2 4 2 6 0s4-2 6 0 4 2 6 0'],
};

export function DisasterIcon({ jenis, ...rest }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const paths = JENIS_ICON_PATHS[jenis];
  if (!paths) {
    return (
      <svg {...props}>
        <path d="M12 2 2 21h20L12 2z" />
        <line x1="12" y1="9" x2="12" y2="14" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function disasterMarkerSvgHtml(jenis, color, isLatest) {
  const paths = JENIS_ICON_PATHS[jenis];
  const body = paths
    ? paths.map((d) => `<path d="${d}"></path>`).join('')
    : `<path d="M12 2 2 21h20L12 2z"></path><line x1="12" y1="9" x2="12" y2="14"></line><circle cx="12" cy="17" r="0.6" fill="#fff"></circle>`;
  const badge = `<div style="position:relative;width:30px;height:30px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;${isLatest ? 'animation:markerBounce 1.7s ease-in-out infinite;' : ''}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>
  </div>`;
  if (!isLatest) return `<div style="width:30px;height:30px;">${badge}</div>`;
  return `<div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;">
    <div style="position:absolute;width:30px;height:30px;border-radius:50%;background:${color};animation:markerPingRing 1.7s cubic-bezier(0,0,0.2,1) infinite;"></div>
    ${badge}
  </div>`;
}
