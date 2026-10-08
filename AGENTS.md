<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Meridian architecture
- One MapLibre canvas lives in the `_map` layout route; child routes render panel content only. Why: single canvas keeps 60 fps and lets liquid glass refract the live map.
- maplibre-gl is imported dynamically inside effects. Why: it touches `window` and must not run during SSR.
- Map colours in `src/lib/mapStyle.ts` are literal hex because MapLibre paints outside CSS; UI colours stay in `src/styles.css` tokens.
- Device features go through `src/lib/platform.ts`; routing goes through the `RoutingEngine` interface. Why: swap in Capacitor plugins and offline engines without touching features.
- Never simulate traffic-signal phases; show a green state only from real provider data.

- Regional offline roads and POIs live in IndexedDB; route selection uses the RoutingEngine interface and ngraph A* for disconnected operation. Why: keep global datasets off devices and avoid invented offline routes.
- Map point selection is owned by MapContext; directions stays mounted during selection and trips, with guidance portalled to the map overlay. Why: hiding planning must not reset navigation state or clip driving controls.
- Navigation progress snaps to road segments and camera following pauses after manual gestures. Why: sparse vertices must not cause false reroutes or fight user map movement.

- A shared city-drift hook sweeps municipality bounds horizontally then vertically on the homepage and homepage-origin Preferences; map-origin Preferences only blurs the existing canvas and preserves its camera. Why: keep one canvas, honour reduced motion and avoid location traces or camera jumps.
- The root index shows HomeScreen and /map shows the existing map menu inside the shared map layout; home/work shortcuts persist locally and pass coordinates into directions. Why: separate the home launch screen without duplicating the map canvas or navigation state.
- Offline area selection uses a MapLibre polygon and draggable DOM corner markers owned by the offline page. Why: keep bounds visible and editable without creating another map canvas.
- Category searches refresh after map movement using bounded viewport Overpass queries and a small TTL cache; MapLibre clusters expand on click. Why: offer worldwide source coverage without loading a global dataset onto devices.
- Trip summaries contain duration and distance only, expire after a bounded retention window, and sync only with recorded account consent. Why: never persist GPS traces or leak a route history.
- ETA share tokens expose only time/distance through a narrow RPC, never owner IDs or coordinates; authenticated writes and hard expiry control access. Why: share arrival without sharing whereabouts.
- Report posting and voting use authenticated server functions and database validation triggers; public bounds RPCs project only report content, while daily cleanup removes expired travel records. Why: enforce privacy, limits, and moderation beyond client controls.
- Commercial-vehicle routing never falls back to the incomplete offline engine; EV stops are real POIs and explicitly unverified suggestions. Why: avoid implying clearance or charging guarantees.
- Traffic tiles proxy a server-only provider credential; TrafficLayer is mounted only in the map experience, respects the user's opt-in toggle and removes its layers on unmount; flow colors do not alter the Valhalla ETA. Why: keep traffic off homepage backgrounds and avoid implying traffic-aware routing.
- Map-origin Preferences blur is tied to panel visibility, not just its route. Why: hiding the panel must restore a clear interactive map.
- MapCanvas and TrafficLayer share overlay ordering after updates and refreshes; route casing, direction chevrons, places and location stay above traffic. Why: traffic must never obscure navigation.
