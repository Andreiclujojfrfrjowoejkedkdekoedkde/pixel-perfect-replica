# Meridian roadmap

## Current improvements
- [ ] Optimize full nearby searches, add traffic thickness slider, use category-specific report map icons, and keep city names above routes/traffic
- [x] Match scrollbars to Meridian, verify Romania/Australia categories, improve route/traffic clarity and layer order, and verify rerouting/junction guidance — six categories visible in Cluj/Melbourne from real loaded map POIs; Overpass enrichment can be rate-limited; route/arrows/location above traffic in planning and driving; off-route recalculation and controlled keep-left banner checked
- [x] Remove homepage traffic; keep map traffic opt-in, add linked Andrei Hedes information credit, and clear map blur when Preferences is hidden — browser verified default off, enabled map traffic, no homepage traffic even when enabled, panel hide/reopen, Close and Escape
- [x] Tighter non-scrolling mobile layout — six portrait/landscape phone sizes fit without scrolling
- [x] Slow city-wide horizontal/vertical background passes, shared by homepage-opened Preferences — 150-second legs using municipality bounds with regional fallback
- [x] Gentle map blur for map-opened Preferences with return to the originating page — browser checked
- [x] Non-scrolling phone homepage, attribution information icon and session-aware account access — checked at 390×844, 375×667, 320×568 and 844×390
- [x] Glass preference menus/sliders and Meridian text-selection colours; local preferences survive reload — Miles selection verified; existing persistent auth reused, cross-device settings sync remains separate
- [x] Collapsed Saved/Recent sections with arrow toggles — tested empty sections
- [x] Replace homepage water with location-aware blurred moving street map — uses already-granted location, otherwise remembered/default view
- [x] Live ETA link implementation with 6-hour expiry, 15-second updates and stop-sharing — ETA only, no coordinates
- [x] Opt-in local trip summaries/statistics and optional consent-gated account sync; no traces, 30-day retention
- [x] Recalculating state — live off-route test passed; keep-left/right from actual maneuver instructions, not invented lane geometry
- [x] Departure/arrive-by planning and car/EV/van/truck profiles; real charging POI suggestions with unverified availability
- [x] Traffic overlay and server-key proxy implemented, refreshes once a minute
- [x] Connect real traffic — TOMTOM_API_KEY saved securely; proxy returned a real 256×256 traffic tile (HTTP 200); traffic-adjusted ETA is not provided by this overlay
- [x] Crowd reporting implementation: police/hazards/construction, previews, confirmations, flags, expiry and server-enforced limits
- [x] Account consent, local deletion and atomic account travel-data deletion; expired records removed daily (up to 24h after hidden)
- [ ] Authenticated ETA/report/sync/deletion end-to-end checks — needs first real account signup; no auth users exist yet
- [x] Live rectangle preview and draggable corner points
- [x] Preserve transparent map menu without wave decoration
- [x] Viewport-only category places and expandable clusters
- [x] Separate Glass Meridian homepage following uploaded mockup, working search and saved home/work shortcuts
- [x] Live driving dashboard, accurate route progress, location-follow camera and recenter
- [x] Select start, destination and intermediate stops on the map
- [x] Reliable nearby categories with regional POI downloads (no global bulk import)
- [x] Regional offline road routing and offline place search
- [x] Refine glass homepage — water replaced by blurred live streets
- [ ] Global bulk POI import — needs a licensed global feed and dedicated ingestion/storage; regional real-data downloads work instead

- [x] 1. Design system, liquid glass, responsive shell, map with four modes
- [x] 2. Search, place sheet, directions, guidance, speed pill, settings
- [ ] 2b. Posted speed limits from OSM maxspeed along route
- [ ] 3. Traffic (TomTom key), traffic signals + SignalStateProvider, crowd reports (Lovable Cloud, realtime)
- [ ] 4. Offline: city/region picker, drag-handle rectangle, offline search index, PWA app shell
- [ ] 4b. Capacitor Android project, icons/splash, README, GitHub Actions APK build
- [ ] Accounts + settings/saved places sync (Lovable Cloud)
