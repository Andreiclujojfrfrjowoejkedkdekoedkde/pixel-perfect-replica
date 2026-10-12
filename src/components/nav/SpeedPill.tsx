import { useEffect, useRef, useState } from "react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings } from "@/lib/settings";
import { limitAt, limitSigns, routeLimits, type LimitWay } from "@/lib/speed-limits";

// GPS speed with a light low-pass filter. The speed-limit sign appears only
// when a real limit is known; it is never guessed.
export function SpeedPill() {
  const { position, navigating, routes, activeRoute, map } = useMapState();
  const { settings } = useSettings();
  const route = navigating ? routes[activeRoute] ?? routes[0] : undefined;
  const [ways, setWays] = useState<LimitWay[] | null>(null);
  useEffect(() => {
    setWays(null); if (!route || route.coords.length < 2) return;
    let live = true; void routeLimits(route.coords).then(w => { if (live) setWays(w); });
    return () => { live = false; };
  }, [route]);
  const imperialSigns = settings.units === "imperial";
  useEffect(() => {
    if (!map || !route || !ways?.length) return;
    let live = true; const markers: { remove: () => void }[] = [];
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!live) return;
      for (const s of limitSigns(route.coords, ways)) {
        const el = document.createElement("div");
        el.className = imperialSigns ? "limit-sign limit-sign-us" : "limit-sign";
        el.setAttribute("aria-label", `Speed limit ${imperialSigns ? Math.round(s.limit / 1.609344) + " mph" : s.limit + " km/h"}`);
        el.textContent = String(imperialSigns ? Math.round(s.limit / 1.609344 / 5) * 5 : s.limit);
        markers.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(s.at).addTo(map));
      }
    });
    return () => { live = false; markers.forEach(m => m.remove()); };
  }, [map, route, ways, imperialSigns]);
  const limitKmh = position && ways ? limitAt([position.lng, position.lat], ways) : null;
  const smooth = useRef(0);
  const [kmh, setKmh] = useState(0);

  useEffect(() => {
    const raw = typeof position?.speed === "number" && Number.isFinite(position.speed) ? Math.max(0,position.speed * 3.6) : 0;
    smooth.current = smooth.current * 0.65 + raw * 0.35;
    setKmh(smooth.current);
  }, [position]);

  if (!navigating && kmh < 3) return null;
  const imperial = settings.units === "imperial";
  const known = typeof position?.speed === "number" && Number.isFinite(position.speed) && Date.now()-position.timestamp < 15000;
  const shown = known ? Math.round(imperial ? kmh / 1.609344 : kmh) : "—";
  const over = limitKmh ? kmh - limitKmh : -Infinity;
  const tone = over > settings.speedTolerance ? "text-destructive" : over > 0 ? "text-traffic-slow" : "";

  return (
    <div className="absolute bottom-52 left-3 z-30 flex items-end gap-2 md:bottom-8 md:left-auto md:right-20">
      <div className="glass flex flex-col items-center rounded-2xl px-4 py-2" aria-live="polite" aria-label={`Speed ${shown} ${imperial ? "miles" : "kilometres"} per hour`}>
        <span className={`tnum text-3xl font-semibold leading-none ${tone}`}>{shown}</span>
        <span className="smallcaps text-[10px] text-muted-foreground">{imperial ? "mph" : "km/h"}</span>
      </div>
      {limitKmh ? (
        imperial ? (
          <div className="flex h-14 w-11 flex-col items-center justify-center rounded-md border-2 border-foreground bg-card text-card-foreground">
            <span className="text-[8px] font-bold leading-none">SPEED<br />LIMIT</span>
            <span className="tnum text-lg font-bold leading-none">{Math.round(limitKmh / 1.609344 / 5) * 5}</span>
          </div>
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-[5px] border-destructive bg-card text-card-foreground">
            <span className="tnum text-base font-bold">{limitKmh}</span>
          </div>
        )
      ) : navigating ? (
        <div className="glass rounded-xl px-2 py-1 text-center text-[10px] leading-tight text-muted-foreground">{ways ? "Limit" : "Checking"}<br />{ways ? "unavailable" : "limit"}</div>
      ) : null}
    </div>
  );
}
