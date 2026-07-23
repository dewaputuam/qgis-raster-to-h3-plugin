// No SPA router in this app (kept deliberately minimal) - "Analisis Detail
// Bencana" is its own full page reachable via a plain, shareable URL rather
// than client-side-only state, since it needs to work as a direct link
// (the "Bagikan" button) and reload/print correctly on its own. main.jsx
// picks which top-level component to mount based on `window.location`.
export function analysisUrl(uuid) {
  return `/analisis?uuid=${encodeURIComponent(uuid)}`;
}

// Link back to the main app's Peta view, focused on a specific event -
// read by App.jsx on mount (see its `openMap` query-param check) and then
// cleared from the URL so a later refresh doesn't keep re-triggering it.
export function mapFocusUrl(uuid) {
  return `/?openMap=1&uuid=${encodeURIComponent(uuid)}`;
}
