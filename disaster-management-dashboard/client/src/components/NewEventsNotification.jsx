import { useEffect, useState } from 'react';
import { severityColor } from '../theme.js';
import { DisasterIcon } from '../icons.jsx';
import { api } from '../lib/api.js';

export default function NewEventsNotification({ onOpenMap }) {
  const [items, setItems] = useState([]);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      api.getNotifications().then((r) => { if (!cancelled) setItems(r.data); }).catch(() => {});
    }
    poll();
    const t = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function dismiss() {
    setDismissing(true);
    try {
      await api.dismissNotifications();
      setItems([]);
    } finally {
      setDismissing(false);
    }
  }

  if (!items.length) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 76, right: 20, zIndex: 500, width: 320,
        maxHeight: 'min(60vh, 480px)', display: 'flex', flexDirection: 'column',
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: 'var(--card-shadow-hover)', overflow: 'hidden',
        animation: 'commentPanelPop .2s cubic-bezier(.22,.8,.25,1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>🔔 {items.length} Kejadian Baru</span>
        <button
          onClick={dismiss}
          disabled={dismissing}
          aria-label="Tutup notifikasi"
          style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--band)', color: 'var(--fg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}
        >
          ✕
        </button>
      </div>
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: 8 }}>
        {items.map((ev) => {
          const color = severityColor(ev.jenisBencana);
          return (
            <button
              key={ev.uuid}
              onClick={() => { onOpenMap(ev.uuid); dismiss(); }}
              style={{
                textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center',
                background: 'transparent', border: 'none', borderRadius: 10, padding: '8px 10px',
                cursor: 'pointer', fontFamily: 'inherit', color: 'var(--fg)',
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 8, background: color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <DisasterIcon jenis={ev.jenisBencana} width={15} height={15} stroke="white" />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.jenisBencana}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.tanggal} &middot; {ev.kecamatan}, {ev.kabupaten}
                </div>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
