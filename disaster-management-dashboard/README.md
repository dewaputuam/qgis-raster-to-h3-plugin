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
  - stores everything in server/data/app.sqlite (node:sqlite, Node's built-in module)
```

## Setup

Requires **Node.js 22.5+** — install it from https://nodejs.org first if you haven't
already. This is a bit newer than a typical "any modern Node" requirement because the
server uses Node's built-in `node:sqlite` module (added in 22.5) instead of a native addon
like `better-sqlite3`: no `node-gyp`/Python/C++ build toolchain needed at all, which was a
real installer failure point on Windows machines without those already set up (a fresh
Windows PC often only has a recent, non-LTS Node version with no matching prebuilt native
binary available yet, forcing a from-source compile that then fails without a working
Python). `node:sqlite` avoids that whole class of problem — `npm install` only needs to
fetch plain JS packages.

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
  Bali, since the SIK API is queried per kabupaten). The original SIK access guide's own
  reference table (§5) turned out to not match the official Kemendagri kabupaten numbering
  from position 3 onward (it had Buleleng where Badung should be, shifting everything after
  it by one) — this has been corrected to match the official order confirmed against the
  Kemendagri kode-wilayah reference. See "Kabupaten labeling" below for the second,
  independent safety net against this still being an inference about the SIK API's IDs.

## SIK login (Kelola Data panel)

The "Login SIK BPBD Bali" card in the admin panel logs into the **real** SIK BPBD Bali
account you enter there (your own account credentials — nothing is hardcoded or shipped
with this app). On success:

- the server logs in once against `sikBaseUrl + /auth/login` and gets a bearer token
- the token is kept in the local SQLite file only (not on disk anywhere else) and used to
  poll `GET /lap-kejadian` for every kabupaten on the configured interval

There's no "username/password required" pre-check anywhere in this flow, client or
server — whatever's typed (including blank) goes straight to the real SIK login call, and
"logged in" is decided purely by whether that call actually returns a token (see
`sikLogin()` in `server/lib/sik.js`). A blank or wrong login just surfaces whatever the
real API said (wrong credentials, unreachable, etc.) instead of a canned local message.

### Kabupaten-office accounts auto-scope every view

BPBD's "bidang" (provincial division) accounts are meant to see all of Bali, but an
individual kabupaten office's own SIK account (username containing that kabupaten's name,
e.g. `buleleng`, `admin_denpasar`, `kabupaten.badung`) only cares about its own jurisdiction.
`server/lib/kabupatenScope.js` (`detectKabupatenScope`) checks the logged-in username
against the nine kabupaten/kota names on a whole-word basis (so it won't misfire on
something like `bidang1`) — when it matches, `GET /api/events` and `GET /api/regions` both
filter server-side to just that kabupaten. Since the public page, map, and admin panel's
event table all read from those same two endpoints, this one change scopes all three at
once with nothing extra needed downstream.

This is derived fresh from the stored username on every request rather than a separate
flag, and persists across a token expiring (the office's identity doesn't change just
because the token hasn't refreshed yet) — only a different account logging in changes the
scope. A small "📍 Kabupaten" badge in the header (and a note in the login card) shows when
this is active, so it's clear why the data looks narrower than "all of Bali".

The scope also limits *what gets fetched from SIK in the first place*, not just what's
served afterward: `fetchAllEvents` in `server/lib/sik.js` only queries the scoped
kabupaten's own `kabkota_id` instead of all nine. A kabupaten-office account pulling all of
Bali's data just to throw 8/9 of it away at read time was both wasteful and, in practice,
enough simultaneous load against SIK's real API to trigger a `429 Too Many Requests` on one
of the unrelated kabupaten - fixed alongside a small retry-with-backoff (`fetchWithRetry` in
`server/lib/sik.js`) for 429/5xx specifically (honoring `Retry-After` when SIK sends one) and
a slight stagger between each kabupaten's request when fetching unscoped, so a "bidang"
account's nine parallel requests don't land in the same instant either.

`sikLogin()` uses the same `fetchWithRetry` on `/auth/login` too - several kabupaten offices
logging in around the same time (shift start, etc.) can trip SIK's rate limit or hit a
transient server error on the login endpoint specifically, which used to surface as a raw
"SIK login HTTP 429" instead of just quietly retrying and succeeding. Only 401 (wrong
credentials) and other 4xx are treated as real rejections and never retried.

Two report labels adapt when a scope is active, since "which kabupaten had the most
events" is meaningless once every event already belongs to the same one:
- The report header reads "BPBD `<Kabupaten>`" instead of "BPBD Bali".
- The "Kejadian per Kabupaten/Kota" ranking becomes "Kejadian per Kecamatan
  (`<Kabupaten>`)" — a breakdown by sub-district within that kabupaten instead, which is
  the more useful drill-down once the kabupaten itself is fixed.

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

### How far back to fetch ("Rentang Data")

The SIK source card in Kelola Data has a "Rentang Data" select (1/2/3/6 bulan terakhir,
default 3) alongside the fetch interval. The guide notes that server-side date filtering on
this API is unreliable ("filter tanggal via parameter query kadang tidak konsisten di sisi
server"), so like the guide's own recommended approach, this is applied **after** the full
list comes back from SIK (`cutoffDateString` in `server/lib/sik.js`, comparing `DATE_KEJ`
strings against N months back) rather than as a query parameter. It only limits what a
*new* fetch pulls in — narrowing the range doesn't delete events already stored from a
previous, wider-range fetch. Changing the select triggers an immediate fetch under the new
range (same as changing the interval already did) - it used to just save the setting with no
re-fetch, so the "Data Ditarik" count would silently stay exactly the same until the operator
separately hit "Fetch Sekarang" or the next scheduled run, which looked like the range setting
wasn't doing anything at all.

### Following SIK's pagination (not just page 1)

The list endpoint's response looks like a standard Laravel `paginate()` payload
(`current_page`/`last_page`/`total` alongside the `data.data` items), wrapped in this app's
own `data` envelope. Requesting `per_page=200` doesn't guarantee SIK actually honors that
value - `fetchAllKejadianForKabkota` in `server/lib/sik.js` follows `last_page` and fetches
every page instead of silently keeping only page 1. A fetch count that looked suspiciously
low (e.g. "67 item") turned out to be exactly this: nothing in this app enforces a row cap,
page 2+ just hadn't been requested.

### Fetch progress bar

The SIK source card shows a two-phase progress bar while a fetch is running - "Mengambil
daftar kejadian" (per kabupaten queried) then "Mengambil detail dampak" (per event's detail
fetch), each as `current/total · pct%`. `fetchAllEvents`'s `onProgress` callback
(`server/lib/sik.js`) reports into `source_status.progress_json` (`server/db.js`), and
`server/lib/scheduler.js` wires it up. The Kelola Data page polls faster (700ms vs. the
normal 4s) while any source is `loading` so the bar moves smoothly instead of jumping.

## New-event notifications

Every scheduled SIK fetch compares the events it just pulled against what's already in
the local database; any `uuid` that wasn't there before triggers a popup (top-right, any
page) listing the new events with a jump-to-map link per item. The queue is stored
server-side (`notification_queue` table) so it survives a page reload, and clears when
dismissed. See `GET /api/notifications` / `POST /api/notifications/dismiss` and
`client/src/components/NewEventsNotification.jsx`.

## Kabupaten labeling

Each SIK event's `kabupaten` label is resolved in `server/lib/sik.js` (`mapKejadian`),
most to least trustworthy:

1. **Direct from the raw record**, if the API actually returns a kabkota/kabupaten field on
   the event itself (`directKabupatenFromRaw`) — guessed shapes mirroring the two fields the
   guide *does* document (`kecamatan.kecamatan`, `desa.kelurahan`, both nested join objects),
   since a real kabkota join is plausible but unconfirmed. `fetchAllEvents` logs one raw list
   item to the console on first fetch — check that log against a live account and adjust
   `directKabupatenFromRaw`'s guessed field names to match once you can see the real shape.
2. **The event's own `kecamatan` field**, cross-checked against `server/data/wilayah-bali.json`
   — an exact kecamatan → kabupaten table generated from the official Kode Kemendagri
   reference (57 kecamatan across Bali's 9 kabupaten/kota, no name collisions). Independent
   of any assumption about the SIK API's internal IDs.
3. **The name the caller already knew from the loop** (queried one kabupaten at a time via
   `kabkota_id`) — last resort, since it depends on `kabkotaIds` being correct. This is what
   the SIK guide's own kabkota_id → kabupaten table (§5) got wrong (Buleleng/Badung and
   everything after were shifted by one vs. the official Kemendagri numbering); `kabkotaIds`
   has been corrected, but tier 3 is only reached if tiers 1 and 2 both come up empty.

## Location verification on the map

The map's "kejadian tanpa lokasi valid" panel doesn't just check for missing coordinates —
it checks whether an event's lat/lng actually falls inside the kabupaten it claims to be in,
catching cases like an event tagged "Karangasem" whose coordinates actually point somewhere
else (a bad map pin, a corrupted coordinate, etc).

This now runs against **real kabupaten/kota boundary polygons**
(`server/data/kabupaten-boundaries.geojson`, an official administrative boundary dataset —
kabupaten identity keyed off its `WADMKK` name field rather than the `KDPKAB` code column,
since two of the nine features had an ambiguous dual code like `51.06/51.03`, likely a
border-segment merge artifact from whatever dissolve produced the file). `server/lib/
kabupatenPolygons.js` does a point-in-polygon (ray-casting, with hole support) check per
event and the `/api/events` response carries the result as `locationValid`. The hand-
estimated rectangular bounding boxes in `client/src/lib/kabupatenBounds.js` are kept only as
a fallback for the (currently never-hit) case where an event's kabupaten name doesn't match
any of the nine known polygons.

This is deliberately a coordinate check only, kept separate from the kecamatan/kabupaten
label cross-check described above. An earlier version of this check tried to reuse the
kecamatan → kabupaten table as an "exact" tier before falling back to the bounding box, but
that's the wrong tool for this job: SIK's own kecamatan and kabupaten fields are always
internally consistent with each other, so that check passed 100% of events regardless of
whether their lat/lng was actually right — silently emptying this panel. Label correctness
(is "kabupaten" the right text for this event) and location correctness (does the pin sit
where that text says it should) are independent checks against independent data (text
fields vs. coordinates) and need to stay that way.

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
