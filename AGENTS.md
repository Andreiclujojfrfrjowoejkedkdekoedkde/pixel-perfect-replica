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

- Water animation belongs only on the standalone homepage, never the map menu. Why: keep transparent map controls visually clean.
- Offline area selection uses a MapLibre polygon and draggable DOM corner markers owned by the offline page. Why: keep bounds visible and editable without creating another map canvas.
