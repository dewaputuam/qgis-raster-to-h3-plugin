# Dashboard Monitoring — Sistem Informasi Kebencanaan

Local-only command-center web app for BPBD Bali disaster event monitoring. Built from
the `design_handoff_local_webapp` handoff: a small Node/Express server fetches data on a
schedule from the SIK BPBD Bali API and BMKG's public APIs, stores it in a local SQLite
file, and serves a React dashboard (public view + map + admin "Kelola Data" panel).

No public hosting, no multi-user accounts — this is meant to run on one command-center
PC and be viewed in a kiosk browser tab.

## Architecture

```
Browser (localhost:8787 in prod, :5173 in dev)
        │ HTTP
        ▼
Express server (server/)
  - serves the built React app
  - REST API under /api/*
  - schedules fetches from SIK + BMKG on a timer
  - stores everything in server/data/app.sqlite (better-sqlite3)
```

## Setup

Requires Node.js 18+ (uses the built-in `fetch`) — install it from https://nodejs.org
first if you haven't already.

### Easiest: double-click launcher

- **Mac**: double-click `Start (Mac).command`
- **Windows**: double-click `Start (Windows).bat`

First run installs dependencies (one-time, takes a minute or two); every run after that
starts the server straight away. Either way, once the server's ready it automatically
opens `http://localhost:8787` in your default browser. Leave the terminal/server window
it opens alongside the browser tab running — closing that window stops the app.

(On Mac, the first double-click may show a security prompt since the script isn't
code-signed — right-click the file and choose **Open** instead to bypass it once.)

### Manual (any OS)

```bash
cd disaster-management-dashboard
npm run install:all
```

### Development (hot reload)

Two terminals:

```bash
npm run dev:server   # http://localhost:8787 (API)
npm run dev:client   # http://localhost:5173 (Vite dev server, proxies /api to :8787)
```

Open http://localhost:5173.

### Production (single port, for the command-center PC)

```bash
npm start
```

This builds the client and starts the server, which then serves the built frontend and
the API from the same port (`http://localhost:8787` by default). This is the mode to run
on the actual command-center machine.

## Configuration

Edit `server/config.json`:

- `port` — server port (default `8787`)
- `defaultAdm4` — default village code for the BMKG weather widget
- `fetchIntervalsMinutes` — default polling interval per source, one of `[1, 5, 15, 30, 60]`
- `sikBaseUrl` — SIK BPBD Bali API base URL
- `kabkotaIds` — kabupaten/kota → SIK `kabkota` id mapping (used to pull events for all of
  Bali, since the SIK API is queried per kabupaten)

## SIK login (Kelola Data panel)

The "Login SIK BPBD Bali" card in the admin panel logs into the **real** SIK BPBD Bali
account you enter there (your own account credentials — nothing is hardcoded or shipped
with this app). On success:

- the server logs in once against `sikBaseUrl + /auth/login` and gets a bearer token
- the token is kept in the local SQLite file only (not on disk anywhere else) and used to
  poll `GET /lap-kejadian` for every kabupaten on the configured interval

### Token expiry: "Ingat sesi ini" (opt-in auto-relogin)

The SIK access guide explicitly says not to silently retry login on auth failure — by
default this app follows that: when the token expires (60 min default), the source card
flips to "Menunggu Login" and the operator must type the password again.

There's an **opt-in** checkbox on the login form, "Ingat sesi ini", for anyone who'd
rather trade that off for unattended 24/7 operation. When checked, the password is
encrypted (AES-256-GCM, key generated locally on first use at `server/data/.enc_key`,
never committed/shipped) and stored alongside the bcrypt hash. The scheduler then
silently re-logs in whenever the token expires, without operator involvement — a
deliberate deviation from the guide's "no silent retry" rule, made knowingly per-install.
Logging out always clears the stored encrypted password (re-enable the checkbox next
login to turn auto-relogin back on). If the stored credentials themselves stop working
(password changed on the SIK side), the scheduler gives up and falls back to the normal
"please log in again" state rather than retrying forever.

If you'd rather not store the password at all, even encrypted, leave the checkbox
unchecked — everything else works the same, you'll just need to re-enter the password
whenever the token expires.

## New-event notifications

Every scheduled SIK fetch compares the events it just pulled against what's already in
the local database; any `uuid` that wasn't there before triggers a popup (top-right, any
page) listing the new events with a jump-to-map link per item. The queue is stored
server-side (`notification_queue` table) so it survives a page reload, and clears when
dismissed. See `GET /api/notifications` / `POST /api/notifications/dismiss` and
`client/src/components/NewEventsNotification.jsx`.

## Location verification on the map

The map's "kejadian tanpa lokasi valid" panel doesn't just check for missing
coordinates — it checks whether an event's lat/lng actually falls inside the kabupaten it
claims to be in (`client/src/lib/kabupatenBounds.js`), catching cases like an event tagged
"Karangasem" whose coordinates actually point somewhere else. **The per-kabupaten boxes
are hand-estimated rectangles, not real administrative boundaries** — no official GeoJSON
boundary file was available while building this. That means: boxes overlap at shared
borders, and an event near a kabupaten's edge can be flagged even though it's genuinely
correct. Swap in a real boundary polygon dataset (e.g. from Badan Informasi Geospasial)
and switch to point-in-polygon if that level of accuracy matters for your use — the
check is isolated in one file to make that swap easy.

### Known gap: SIK event detail schema

The SIK access guide documents the fields needed for chat-style reporting (`DATE_KEJ`,
`jenis_bencana.JENIS_KEJ`, `kecamatan.kecamatan`, `desa.kelurahan`, `LOKASI_KEJ`,
`LATTITUDE`/`LONGITUDE`, `STATUS_VERIFIKASI`, `uuid`) — those are mapped in
`server/lib/sik.js`. It does **not** document the full field names for casualty/damage
counts (`korbanMeninggal`, `kerugian`, etc.) or the `impacts[]` detail shape from
`GET /lap-kejadian/{uuid}`. The mapper has best-guess field names for those with safe
fallbacks to `0`/`[]` — once you have a live account, check a real response and adjust
`mapKejadian()` in `server/lib/sik.js` to match the actual payload.

## Data seeding

On first run the server seeds:
- `server/data/disaster-events-seed.json` → `events` table (sample June 2026 Bali events
  from the design handoff, so the dashboard isn't empty before the first real SIK fetch)
- `server/data/bali-regions.json` → `regions` table (kabupaten → kecamatan → desa → adm4,
  used for the events filter and BMKG village lookups)

Once the SIK source is logged in and fetches successfully, real events upsert into the
same table by `uuid`.

## Notes on this build environment

This was built and screenshot-tested in a sandboxed dev container whose outbound network
policy blocks arbitrary external hosts (BMKG, the SIK API, OpenStreetMap tiles, Google
Fonts all returned `403`/tunnel-blocked here). That's a property of the build sandbox, not
the app — all of that code path was verified end-to-end (request → error → status
persisted → surfaced in the admin UI), and the full UI (public dashboard, dark mode, map
panel with colored markers, admin panel with live status cards) was verified visually via
Playwright screenshots. On the actual command-center PC with normal internet access, the
BMKG and SIK calls, map tiles, and Google Fonts will load normally. Do a live smoke test
against a real SIK account before relying on it operationally, since the event-detail
field names in `server/lib/sik.js` are best-effort (see above).
