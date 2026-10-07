# Meridian roadmap

- [x] 1. Design system, liquid glass, responsive shell, map with four modes
- [x] 2. Search, place sheet, directions, guidance, speed pill, settings
- [x] 2b. Posted speed limits from OSM maxspeed along route
- [ ] 3. Live traffic (TomTom key), traffic signals + SignalStateProvider
- [x] 4. Offline: city/region picker, drag-handle rectangle, offline search index, PWA app shell
- [ ] 4b. Capacitor Android project, icons/splash, README, GitHub Actions APK build
- [x] Accounts + settings/saved places sync (Lovable Cloud)
- [x] Home screen, saved-place types, configurable home-screen widgets
- [x] Search autocomplete + working nearby categories
- [x] Live navigation: vehicle arrow, progress, off-route rerouting, lane banner
- [x] Alternatives at a glance, departure time, EV range + vehicle restrictions
- [x] Speed camera and school zone alerts
- [x] Full-page settings with voice language picker
- [ ] Offline routing engine for downloaded regions
- [ ] Share ETA with a contact over a live link
- [ ] Parking helper (remember where you parked, nearby parking by price)

## Done this round

### Home screen (`/`)

The map moved to `/map` so `/` can be a real home screen: slow drifting liquid
gradients behind liquid-glass cards, a search box, quick actions, and shortcuts
you choose yourself. Shortcut targets (home, work, school, favourites) are set in
Settings and edited from the home screen via `?focus=`.

`src/routes/index.tsx`, `src/components/shell/LiquidBackdrop.tsx`,
`src/lib/places.ts`, the `liquid-blob` rules in `src/styles.css`.

### Search autocomplete

One shared search core for the home screen and the map: your saved places, named
places and recents match instantly and locally, then a debounced geocoder query
runs with an abort signal and a sequence guard so a slow reply can never
overwrite a newer one. Offline areas take priority and are labelled. Coordinate
input still works.

`src/components/search/QuickSearch.tsx` (shared `useSearchSuggestions`).

### Nearby categories actually work

The old category query asked Overpass for 60 results with no abort, no cache and
no viewport reload, which is why the buttons felt dead. Now: 400 results,
de-duplicated, cached per rounded bbox for ten minutes, aborted when the map
moves, re-run 700 ms after the map settles, with counts, distance sorting,
per-category reload and explicit empty/error states. Twelve categories.

### Live navigation

Vehicle arrow that turns with the compass, camera follow, live progress bar and
percent complete, distance and time remaining, live ETA, off-route detection with
a distinct "off the route" state, automatic rerouting behind a "Recalculating…"
banner, and a lane/side banner ("Turn left in 200 m") built from Valhalla
manoeuvre types. Spoken guidance uses the language chosen in Settings.

`src/lib/navigation.ts`, `src/components/nav/Guidance.tsx`,
`src/components/nav/VehicleMarker.tsx`.

### Route preview

The step list is collapsed to six steps with "Show all N steps", and each
alternative shows its time and distance delta, toll status, motorway share and
arrival time. Added a departure-time picker ("leave at 08:15"), nearest-neighbour
stop optimisation, and charging stops along the route when an EV range is set.

### Vehicle, alerts, settings

Car/van/truck profile with height, weight, axle weight and EV range. Speed camera
and school zone warnings from OSM, ahead on the route only, always worded as
"reported" because OSM coverage is uneven. Settings is now a full page with a
three-column desktop layout, sticky header, and sections for home-screen widgets,
saved places, lists, vehicle, voice language, alerts, trips and privacy.

### Bugs fixed along the way

- Category POI query capped at 60 results with no abort or cache.
- Drawn-shape tile download dropped edge tiles, leaving holes.
- `areaOf` treated degrees as radians, so the km² cap was ~3000x too large.
- `maxspeed` mph detection missed `mi/h`; the forward/backward bearing was
  inverted, picking the wrong directional limit.
- Switching accounts on one device merged the previous user's local data into
  the new account.
- `navigator.onLine` is undefined in Node, so SSR thought the app was offline.
- IndexedDB `delete` was called with the area id against the place primary key,
  so deleting an area left its search index behind.
- The offline downloader resolved before the download finished, marking areas
  "ready" while tiles were still arriving.
- The home screen search threw because it assumed a map provider existed.

## Still open

### Offline routing — the real gap

Tiles and search work offline, but routing still needs the network. A genuine
bundled engine means shipping an OSRM or GraphHopper WASM build plus regional
PBF extracts, which is tens of megabytes per region and a separate data
pipeline. What is missing is that pipeline. Until then the honest options are
(a) precompute and cache routes for downloaded regions, or (b) cache routes as
they are driven so a repeat journey replays offline. Say which you want and it is
a contained piece of work.

### Live traffic

Needs a TomTom key (already in `.env.example`). Item 3 on the roadmap.

### Share ETA over a live link

A static share link with destination and ETA is straightforward. A genuinely
_live_ link needs a backend that stores a session and polls it; that is new
server-side state and I would rather not fake it with the client's location.

## Deploying

Meridian builds to a Cloudflare Worker, not a static site: `.output/server/index.mjs`
is the entry and `.output/public` is the static asset binding. Publish `.output`,
not `dist/client` — there is no `dist/` and no `index.html`, because pages render
per request. SSR is required for the hazard-classification server function and the
Supabase auth middleware. `npm run build` ends with a check that prints these paths
and fails loudly on incomplete output.

## Needs configuration

- **`OPENROUTER_API_KEY`** — add through Lovable's secure secrets form. Read only
  via `process.env` in the server function; the client bundle has no reference to
  it and `.env.example` deliberately omits it.
- **Google sign-in** — set `VITE_GOOGLE_CLIENT_ID` and allow this project's
  origins in the Google OAuth client.
- **Run the migration** in `supabase/migrations/`.
- **TomTom key** — only needed for live traffic.
