import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CornerUpLeft, CornerUpRight, ArrowUpLeft, ArrowUpRight, RotateCcw, Flag, MapPin } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings, type TravelMode } from "@/lib/settings";
import { valhalla, type Route } from "@/lib/services";
import { location, tts, keepAwake } from "@/lib/platform";
import { fmtDistance, fmtDuration, fmtClock, haversine, nearestOnLine } from "@/lib/format";

// Valhalla maneuver types -> line icon
function ManeuverIcon({ type, className }: { type: number; className?: string }) {
  const p = { strokeWidth: 1.5, className };
  if ([4, 5, 6].includes(type)) return <Flag {...p} />;
  if ([10, 11].includes(type)) return <CornerUpRight {...p} />;
  if ([14, 15].includes(type)) return <CornerUpLeft {...p} />;
  if ([9, 18, 20, 23].includes(type)) return <ArrowUpRight {...p} />;
  if ([16, 19, 21, 24].includes(type)) return <ArrowUpLeft {...p} />;
  if ([12, 13].includes(type)) return <RotateCcw {...p} />;
  if (type === 1 || type === 2 || type === 3) return <MapPin {...p} />;
  return <ArrowUp {...p} />;
}

export function Guidance({ route: initial, destination, mode, onEnd }: { route: Route; destination: [number, number]; stops: [number, number][]; mode: TravelMode; onEnd: () => void }) {
  const { map, position, setPosition, setRoutes } = useMapState();
  const { settings } = useSettings();
  const [route, setRoute] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const spoken = useRef<string>("");
  const rerouting = useRef(false);

  useEffect(() => {
    const stop = location.watch(setPosition, setError);
    if (settings.keepScreenOn) keepAwake.on();
    map?.easeTo({ pitch: 55, zoom: 17, duration: 800 });
    return () => { stop(); keepAwake.off(); map?.easeTo({ pitch: 0, bearing: 0, duration: 600 }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = useMemo(() => {
    if (!position) return null;
    const me: [number, number] = [position.lon, position.lat];
    const { distance: off, index } = nearestOnLine(me, route.coords);
    let remaining = 0;
    for (let i = index; i < route.coords.length - 1; i++) remaining += haversine(route.coords[i]!, route.coords[i + 1]!);
    const next = route.maneuvers.find((m) => m.beginIndex > index) ?? route.maneuvers[route.maneuvers.length - 1]!;
    let toNext = 0;
    for (let i = index; i < Math.min(next.beginIndex, route.coords.length - 1); i++) toNext += haversine(route.coords[i]!, route.coords[i + 1]!);
    const timeLeft = route.distance > 0 ? (remaining / route.distance) * route.duration : 0;
    return { off, index, remaining, next, toNext, timeLeft, me };
  }, [position, route]);

  // Camera follow, heading-up.
  useEffect(() => {
    if (!progress || !map) return;
    const [lon, lat] = progress.me;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const ahead = route.coords[Math.min(progress.index + 3, route.coords.length - 1)];
    // Browsers report heading as NaN/null when stationary; NaN breaks MapLibre's camera.
    const h = position?.heading;
    let bearing = typeof h === "number" && Number.isFinite(h) ? h
      : ahead ? (Math.atan2(ahead[0] - lon, ahead[1] - lat) * 180) / Math.PI : map.getBearing();
    if (!Number.isFinite(bearing)) bearing = map.getBearing();
    try { map.easeTo({ center: [lon, lat], bearing, pitch: 55, duration: 900 }); } catch { /* map torn down */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.me[0], progress?.me[1]]);

  // Voice prompts at 500 m and 80 m before each maneuver.
  useEffect(() => {
    if (!progress || !settings.voice) return;
    const bucket = progress.toNext < 80 ? "now" : progress.toNext < 500 ? "soon" : "";
    const k = `${progress.next.beginIndex}-${bucket}`;
    if (bucket && spoken.current !== k) {
      spoken.current = k;
      tts.speak(bucket === "now" ? progress.next.instruction : `In ${fmtDistance(progress.toNext, settings.units)}, ${progress.next.verbal ?? progress.next.instruction}`, settings.volume);
    }
  }, [progress, settings.voice, settings.units, settings.volume]);

  // Auto-reroute when more than 50 m off route.
  useEffect(() => {
    if (!progress || progress.off < 50 || rerouting.current) return;
    rerouting.current = true;
    if (settings.voice) tts.speak("Rerouting", settings.volume);
    valhalla.route([progress.me, destination], { mode, ...settings })
      .then((r) => { if (r[0]) { setRoute(r[0]); setRoutes([r[0]]); } })
      .catch(() => setError("Routing needs a connection."))
      .finally(() => { rerouting.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.off]);

  const arrived = progress && progress.remaining < 25;
  const eta = progress ? new Date(Date.now() + progress.timeLeft * 1000) : null;

  return (
    <>
      <div className="absolute inset-x-3 z-40 md:left-4 md:right-auto md:w-[420px]" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }} aria-live="polite">
        <div className="glass flex items-center gap-4 rounded-2xl p-4">
          <ManeuverIcon type={arrived ? 4 : progress?.next.type ?? 1} className="h-12 w-12 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="tnum text-3xl font-semibold leading-none">{arrived ? "Arrived" : progress ? fmtDistance(progress.toNext, settings.units) : "Locating"}</div>
            <div className="mt-1 truncate font-display text-lg">{arrived ? "You have reached your destination" : progress?.next.street || progress?.next.instruction || "Waiting for GPS"}</div>
          </div>
        </div>
        {error && <div className="glass mt-2 rounded-xl px-3 py-2 text-sm">{error}</div>}
      </div>
      <div className="absolute inset-x-3 bottom-3 z-40 md:left-4 md:right-auto md:w-[420px]" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
        <div className="glass flex items-center gap-4 rounded-2xl px-5 py-3">
          <div className="flex-1">
            <div className="tnum font-display text-2xl text-primary">{eta ? fmtClock(eta, settings.timeFormat) : "--:--"}</div>
            <div className="tnum text-xs text-muted-foreground">
              {progress ? `${fmtDuration(progress.timeLeft)} · ${fmtDistance(progress.remaining, settings.units)}` : `${fmtDuration(route.duration)} · ${fmtDistance(route.distance, settings.units)}`}
            </div>
          </div>
          <button onClick={onEnd} className="rounded-xl bg-destructive px-5 py-2.5 font-medium text-destructive-foreground">End</button>
        </div>
      </div>
    </>
  );
}
