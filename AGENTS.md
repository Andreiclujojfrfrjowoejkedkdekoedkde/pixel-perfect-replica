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
