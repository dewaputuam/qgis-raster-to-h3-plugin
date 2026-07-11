export function formatRupiah(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

export function formatRupiahShort(n) {
  const v = Math.round(n || 0);
  if (v >= 1e9) return 'Rp ' + (v / 1e9).toFixed(1).replace(/\.0$/, '') + ' M';
  if (v >= 1e6) return 'Rp ' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' jt';
  if (v >= 1e3) return 'Rp ' + (v / 1e3).toFixed(0) + ' rb';
  return 'Rp ' + v;
}

export function formatCountdown(ts, now = Date.now()) {
  if (!ts) return '—';
  const diff = ts - now;
  if (diff <= 0) return 'Sebentar lagi…';
  const totalSec = Math.round(diff / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatClockTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const datePart = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${datePart}, ${timePart}`;
}
