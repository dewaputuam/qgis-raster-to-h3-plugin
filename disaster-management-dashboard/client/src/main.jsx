import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AnalisisDetailBencana from './pages/AnalisisDetailBencana.jsx';
import 'leaflet/dist/leaflet.css';
import './index.css';

// No SPA router in this app - "Analisis Detail Bencana" is reached via a
// plain shareable URL (/analisis?uuid=...), not client-side-only state, so
// it works correctly as a direct link, on reload, and when printed. The
// server already serves index.html for any non-/api path (see
// server/index.js), so this is the only routing decision needed.
const RootComponent = window.location.pathname === '/analisis' ? AnalisisDetailBencana : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
