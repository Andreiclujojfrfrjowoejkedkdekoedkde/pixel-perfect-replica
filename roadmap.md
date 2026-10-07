# Meridian roadmap

- [x] 1. Design system, liquid glass, responsive shell, map with four modes
- [x] 2. Search, place sheet, directions, guidance, speed pill, settings
- [x] 2b. Posted speed limits from OSM maxspeed along route
- [ ] 3. Traffic (TomTom key), traffic signals + SignalStateProvider
- [x] 4. Offline: city/region picker, drag-handle rectangle, offline search index, PWA app shell
- [ ] 4b. Capacitor Android project, icons/splash, README, GitHub Actions APK build
- [x] Accounts + settings/saved places sync (Lovable Cloud)

## 2b. Posted speed limits

Overpass is queried for `maxspeed`, `maxspeed:forward` and `maxspeed:backward`
around the route geometry, in chunks with a per-route cache. Units are handled
(`50`, `50 km/h`, `50 mph`, `50mi/h`), `maxspeed:forward`/`maxspeed:backward` is
resolved against the direction the route crosses the way, and anything
non-numeric (`signals`, `none`, `DE:urban`) counts as unknown.

Signs are drawn on the map at every change point and the current limit appears in
the guidance card and the speed pill, in the user's unit system. A stretch with no
data shows an explicit **Limit unavailable** state with a neutral "—" sign; an
Overpass failure or timeout lands in the same state and offers a retry. No limit
is ever inferred from road class or country defaults. Toggle in Settings → Navigation.

Files: `src/lib/speedLimits.ts`, `src/components/nav/SpeedLimitsContext.tsx`,
`src/components/nav/SpeedSign.tsx`, `src/components/map/SpeedLimitSigns.tsx`.

## Accounts + sync

Email/password and Google sign-in, with a signed-out state that is fully local.
`saved_places` and `user_settings` carry row-level security keyed off `auth.uid()`
in the policy — there are no roles on any profile table. Sync is local-first:
local storage is written first, then merged with the account (last write wins per
item on `updated_at`, deletions travel as tombstones), with realtime so a second
device updates immediately. A small badge shows sync state.

Files: `src/lib/auth.tsx`, `src/lib/sync.tsx`, `src/components/account/AccountPanel.tsx`,
`src/components/shell/SyncBadge.tsx`, `supabase/migrations/20260516000000_accounts_sync_hazards.sql`.

## 4. Offline

Areas are chosen by searching a city or country (using the geocoder's bounding
box) or by drawing a rectangle or polygon with draggable, keyboard-nudgeable
handles. The page shows an estimated size, progress, pause/cancel, storage used
and per-area rename/update/delete. Tiles and glyphs go into one Cache Storage
bucket per area; `public/sw.js` also precaches the app shell so the PWA opens with
no connection.

Caps, so a download cannot quietly fill a device: zoom 15, 6,000 tiles and
2,500 km² per area, with a warning from 2,500 tiles. Each area also gets an
offline search index in IndexedDB built from Overpass; when the device is offline
or the view is inside a downloaded area, SearchBar queries that index first and
labels the group **Offline**.

Files: `src/lib/offlineDb.ts`, `src/lib/offlineTiles.ts`, `src/lib/offlineSearch.ts`,
`src/components/map/AreaDrawer.tsx`, `src/routes/_map/offline.tsx`, `public/sw.js`.

## Road hazards (AI)

A **Report hazard** button on the map and during navigation takes free text, with
dictation where the browser supports it, and attaches the driver's position. A
server function classifies it with a free OpenRouter model and returns strict JSON
(category, severity, location summary, impact summary, confidence), validated with
zod, fences stripped, falling back to `other` plus the raw text. The driver
confirms or edits a preview before anything is posted.

Confirmed reports land in `road_hazards` with an expiry (2 h by default, shorter
for transient categories), are rate-limited per user, shown as map markers, and
raise a banner for hazards up to 2 km ahead on the route. Realtime carries new
reports to other drivers. Abuse protection: 500-character input limit, a
prompt-injection-resistant system prompt that treats driver text strictly as data,
and no API key or provider error ever returned to the browser.

Files: `src/lib/hazards.ts`, `src/lib/hazards.server.ts`, `src/lib/hazardsStore.tsx`,
`src/components/hazard/HazardReport.tsx`, `src/components/hazard/HazardReporter.tsx`.

## Needs configuration

- **`OPENROUTER_API_KEY`** — add through Lovable's secure secrets form. It is read
  only in the server function via `process.env` and never reaches the browser; it
  is deliberately absent from `.env.example`.
- **Google sign-in** — set `VITE_GOOGLE_CLIENT_ID` and allow this project's origins
  in the Google OAuth client.
- **Run the migration** in `supabase/migrations/` so the three tables, their RLS
  policies and the realtime publication exist.
