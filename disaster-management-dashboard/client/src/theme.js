export const THEME = {
  light: {
    bg: 'oklch(98.5% 0.004 250)',
    headerBg: 'oklch(98.5% 0.004 250 / 0.68)',
    fg: 'oklch(22% 0.02 255)',
    fg2: 'oklch(38% 0.02 255)',
    muted: 'oklch(50% 0.02 255)',
    border: 'oklch(90% 0.006 250)',
    border2: 'oklch(86% 0.006 250)',
    accent: 'oklch(45% 0.09 250)',
    accentStrong: 'oklch(32% 0.09 250)',
    accentStrongHover: 'oklch(38% 0.1 250)',
    accent08: 'oklch(45% 0.09 250 / 0.08)',
    accent06: 'oklch(45% 0.09 250 / 0.06)',
    accent05: 'oklch(45% 0.09 250 / 0.05)',
    accentSoft: 'oklch(80% 0.05 250)',
    band: 'oklch(96% 0.006 250)',
    band2: 'oklch(92% 0.006 250)',
    tagBg: 'oklch(92% 0.02 250)',
    iconBg: 'oklch(93% 0.015 250)',
    iconBgHover: 'oklch(88% 0.03 250)',
    cardBg: 'oklch(98.5% 0.004 250)',
    cardShadow: '0 1px 2px oklch(20% 0.02 255 / 0.06)',
    cardShadowHover: '0 30px 44px -16px oklch(20% 0.02 255 / 0.3), 0 12px 20px -8px oklch(20% 0.02 255 / 0.18)',
    glowRing: '0 0 0 1px oklch(80% 0.05 250 / 0.6)',
  },
  dark: {
    bg: 'oklch(16% 0.014 260)',
    headerBg: 'oklch(16% 0.014 260 / 0.58)',
    fg: 'oklch(92% 0.006 250)',
    fg2: 'oklch(76% 0.012 250)',
    muted: 'oklch(64% 0.02 250)',
    border: 'oklch(30% 0.02 260)',
    border2: 'oklch(36% 0.03 260)',
    accent: 'oklch(78% 0.15 250)',
    accentStrong: 'oklch(80% 0.17 250)',
    accentStrongHover: 'oklch(85% 0.17 250)',
    accent08: 'oklch(78% 0.15 250 / 0.16)',
    accent06: 'oklch(78% 0.15 250 / 0.12)',
    accent05: 'oklch(78% 0.15 250 / 0.1)',
    accentSoft: 'oklch(65% 0.13 250)',
    band: 'oklch(21% 0.018 260)',
    band2: 'oklch(28% 0.02 260)',
    tagBg: 'oklch(30% 0.06 255)',
    iconBg: 'oklch(26% 0.03 258)',
    iconBgHover: 'oklch(32% 0.07 258)',
    cardBg: 'oklch(20% 0.018 260)',
    cardShadow: '0 0 0 1px oklch(78% 0.15 250 / 0.1)',
    cardShadowHover: '0 0 26px 2px oklch(78% 0.15 250 / 0.4), 0 0 60px 12px oklch(78% 0.15 250 / 0.2)',
    glowRing: '0 0 10px 2px oklch(78% 0.15 250 / 0.6), 0 0 24px 7px oklch(78% 0.15 250 / 0.32)',
  },
};

export const STATUS_META = {
  unauth: { label: 'Menunggu Login', color: 'oklch(55% 0.02 255)', bg: 'oklch(55% 0.02 255 / 0.12)' },
  idle: { label: 'Siap', color: 'oklch(55% 0.02 255)', bg: 'oklch(55% 0.02 255 / 0.12)' },
  loading: { label: 'Mengambil…', color: 'oklch(50% 0.14 250)', bg: 'oklch(50% 0.14 250 / 0.12)' },
  ok: { label: 'Terhubung', color: 'oklch(52% 0.14 150)', bg: 'oklch(52% 0.14 150 / 0.12)' },
  error: { label: 'Error', color: 'oklch(55% 0.18 25)', bg: 'oklch(55% 0.18 25 / 0.12)' },
};

export const JENIS_COLORS = {
  'Kebakaran Gedung dan Permukiman': 'oklch(60% 0.16 35)',
  'Kebakaran Hutan dan Lahan': 'oklch(62% 0.16 55)',
  'Cuaca Ekstrem': 'oklch(58% 0.14 235)',
  'Tanah Longsor': 'oklch(55% 0.13 75)',
  Banjir: 'oklch(55% 0.14 260)',
  'Kejadian Lainnya': 'oklch(55% 0.015 250)',
};

export function severityColor(jenis) {
  return JENIS_COLORS[jenis] || JENIS_COLORS['Kejadian Lainnya'];
}

export function themeVars(dm) {
  const p = dm ? THEME.dark : THEME.light;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    const cssVar = '--' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    out[cssVar] = v;
  }
  return out;
}
