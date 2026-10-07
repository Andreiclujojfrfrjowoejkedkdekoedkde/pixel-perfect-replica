import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  CornerUpLeft as UL,
  Flag,
  MapPin,
  Navigation,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings, type TravelMode } from "@/lib/settings";
import { valhalla, type Route } from "@/lib/services";
import { location, tts, keepAwake } from "@/lib/platform";
import { fmtDistance, fmtDuration, fmtClock } from "@/lib/format";
import { useSpeedLimits } from "./SpeedLimitsContext";
import { SpeedSignBadge, SpeedSignCaption } from "./SpeedSign";
import { LIMIT_UNIT_LABEL, formatLimit } from "@/lib/speedLimits";
import {
  approachText,
  laneAdvice,
  OFF_ROUTE_METRES,
  REROUTING_METRES,
  routeProgress,
} from "@/lib/navigation";
import { useRoadAlerts } from "@/lib/alerts";
import { trips } from "@/lib/trips";

function ManeuverIcon({ type, className }: { type: number; className?: string }) {
  const p = { strokeWidth: 1.5, className };
  if ([4, 5, 6].includes(type)) return <Flag {...p} />;
  if ([10, 11].includes(type)) return <CornerUpRight {...p} />;
  if ([14, 15].includes(type)) return <CornerUpLeft {...p} />;
  if ([9, 18, 20, 23].includes(type)) return <ArrowUp {...p} />;
  if ([16, 19, 21, 24].includes(type)) return <UL {...p} />;
  if ([12, 13].includes(type)) return <RotateCcw {...p} />;
  if (type === 1 || type === 2 || type === 3) return <MapPin {...p} />;
  if ([2, 25].includes(type)) return <CornerDownLeft {...p} />;
  if ([3, 26].includes(type)) return <CornerDownRight {...p} />;
  if (type === 17) return <RotateCcw {...p} />;
  return <Navigation {...p} />;
}

export function Guidance({
  route: initial,
  destination,
  mode,
  originLabel,
  destinationLabel,
  onEnd,
}: {
  route: Route;
  destination: [number, number];
  stops: [number, number][];
  mode: TravelMode;
  originLabel: string;
  destinationLabel: string;
  onEnd: () => void;
}) {
  const { map, position, setPosition, setRoutes } = useMapState();
  const { settings } = useSettings();
  const {
    state: limitState,
    currentKmh,
    currentRoad,
    aheadKmh,
    canRetry,
    retry,
  } = useSpeedLimits();
  const [route, setRoute] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const spoken = useRef<string>("");
  const reroutingRef = useRef(false);
  const startedAt = useRef(Date.now());
  const recorded = useRef(false);
  const [announcedAlerts, setAnnouncedAlerts] = useState<string[]>([]);

  const progress = useMemo(() => {
    if (!position) return null;
    return routeProgress(route, position.lon, position.lat, position.heading);
  }, [position, route]);

  const progressRef = useRef(progress);
  progressRef.current = progress;

  // Alerts are measured relative to how far along the route the driver already is.
  const alerts = useRoadAlerts(progress?.travelled ?? 0);

  useEffect(() => {
    const stop = location.watch(setPosition, setError);
    if (settings.keepScreenOn) keepAwake.on();
    map?.easeTo({ pitch: 55, zoom: 17, duration: 800 });
    return () => {
      stop();
      keepAwake.off();
      map?.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      if (settings.tripHistory && !recorded.current) {
        recorded.current = true;
        const travelled = initial.distance - (progressRef.current?.remaining ?? initial.distance);
        if (travelled > 500) {
          trips.record({
            startedAt: new Date(startedAt.current).toISOString(),
            endedAt: new Date().toISOString(),
            distance: travelled,
            duration: Math.round((Date.now() - startedAt.current) / 1000),
            fromLabel: originLabel,
            toLabel: destinationLabel,
            mode,
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const offRoute = !!progress && progress.offRoute > OFF_ROUTE_METRES;
  const farOff = !!progress && progress.offRoute > REROUTING_METRES;

  // Camera follows the car, heading-up. Smoothed by MapLibre rather than eased
  // every tick, so a jittery GPS fix does not shake the whole view.
  useEffect(() => {
    if (!progress || !map || !position) return;
    map.easeTo({
      center: [position.lon, position.lat],
      bearing: progress.bearing,
      pitch: 55,
      zoom: Math.max(map.getZoom(), 16),
      duration: 700,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lon, map]);

  // Recalculate when the driver is properly off the route.
  useEffect(() => {
    if (!farOff || reroutingRef.current || !progress) return;
    reroutingRef.current = true;
    setRerouting(true);
    if (settings.voice)
      tts.speak("Recalculating your route", settings.volume, settings.voiceLanguage);
    valhalla
      .route([[position!.lon, position!.lat], destination], { mode, ...settings })
      .then((r) => {
        if (r[0]) {
          setRoute(r[0]);
          setRoutes([r[0]]);
          setRerouting(false);
        } else {
          setError("Could not find a new route. Follow the road until you are back on it.");
        }
      })
      .catch(() => {
        setError("Rerouting needs a connection. Showing the original route.");
      })
      .finally(() => {
        reroutingRef.current = false;
        setRerouting(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farOff, progress?.offRoute]);

  // Voice prompts at 500 m and 80 m before each manoeuvre.
  useEffect(() => {
    if (!progress || !settings.voice || rerouting) return;
    const bucket = progress.toNext < 80 ? "now" : progress.toNext < 500 ? "soon" : "";
    const k = `${progress.next.beginIndex}-${bucket}`;
    if (bucket && spoken.current !== k) {
      spoken.current = k;
      const text =
        bucket === "now"
          ? progress.next.instruction
          : `In ${fmtDistance(progress.toNext, settings.units)}, ${progress.next.verbal ?? progress.next.instruction}`;
      tts.speak(text, settings.volume, settings.voiceLanguage);
    }
  }, [
    progress,
    settings.voice,
    settings.units,
    settings.volume,
    settings.voiceLanguage,
    rerouting,
  ]);

  // Say the posted limit when it drops.
  const announcedLimit = useRef<string | null>(null);
  useEffect(() => {
    if (!settings.voice || limitState !== "ready" || !progress) return;
    const k = String(currentKmh ?? "none");
    if (announcedLimit.current === null) {
      announcedLimit.current = k;
      return;
    }
    if (announcedLimit.current === k) return;
    announcedLimit.current = k;
    if (currentKmh == null) return;
    tts.speak(
      `Speed limit ${formatLimit(currentKmh, settings.units)} ${LIMIT_UNIT_LABEL[settings.units]}`,
      settings.volume,
      settings.voiceLanguage,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentKmh,
    limitState,
    settings.voice,
    settings.units,
    settings.volume,
    settings.voiceLanguage,
    progress != null,
  ]);

  // Alerts: banner plus a spoken warning the first time each one comes up.
  const nextAlert = alerts.alerts.find((a) => !announcedAlerts.includes(a.id)) ?? null;
  useEffect(() => {
    if (!nextAlert) return;
    setAnnouncedAlerts((prev) => [...prev, nextAlert.id]);
    if (settings.voice) tts.speak(nextAlert.spoken, settings.volume, settings.voiceLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextAlert?.id]);

  const arrived = !!progress && progress.remaining < 25;
  const eta = progress ? new Date(Date.now() + progress.timeLeft * 1000) : null;
  const advice = laneAdvice(progress?.next);

  return (
    <>
      {/* ---------- top: manoeuvre + lane advice ---------- */}
      <div
        className="absolute inset-x-3 z-40 md:left-4 md:right-auto md:w-[420px]"
        style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <ManeuverIcon
              type={arrived ? 4 : (progress?.next.type ?? 1)}
              className="h-12 w-12 shrink-0 text-primary"
            />
            <div className="min-w-0 flex-1">
              <div className="tnum text-3xl font-semibold leading-none">
                {arrived
                  ? "Arrived"
                  : progress
                    ? fmtDistance(progress.toNext, settings.units)
                    : "Locating"}
              </div>
              <div className="mt-1 truncate font-display text-lg">
                {arrived
                  ? "You have reached your destination"
                  : progress?.next.street || progress?.next.instruction || "Waiting for GPS"}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <SpeedSignBadge limitKmh={currentKmh} units={settings.units} state={limitState} />
              <SpeedSignCaption
                limitKmh={currentKmh}
                units={settings.units}
                state={limitState}
                road={currentRoad}
              />
              {canRetry && (
                <button
                  onClick={retry}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <RefreshCw strokeWidth={1.5} className="h-3 w-3" /> Retry
                </button>
              )}
            </div>
          </div>

          {/* lane / side guidance */}
          {!arrived && advice.text && progress && progress.toNext < 400 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm">
              <ManeuverIcon type={progress.next.type} className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">
                {approachText(advice, progress.toNext, settings.units)}
              </span>
              {!canRetry &&
                limitState === "ready" &&
                currentKmh != null &&
                aheadKmh != null &&
                aheadKmh !== currentKmh && (
                  <span className="tnum shrink-0 text-xs text-muted-foreground">
                    then {formatLimit(aheadKmh, settings.units)}
                  </span>
                )}
            </div>
          )}

          {/* progress bar */}
          {progress && !arrived && (
            <div className="mt-3">
              <div className="h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.max(1, progress.fraction * 100)}%` }}
                />
              </div>
              <div className="tnum mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{Math.round(progress.fraction * 100)}% there</span>
                <span>{fmtDistance(progress.remaining, settings.units)} to go</span>
              </div>
            </div>
          )}
        </div>

        {/* recalculating / off-route */}
        {rerouting && (
          <div
            role="status"
            className="glass mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
          >
            <RefreshCw strokeWidth={1.5} className="h-4 w-4 animate-spin text-primary" />
            Recalculating your route…
          </div>
        )}
        {!rerouting && offRoute && (
          <div
            role="status"
            className="glass mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
          >
            <TriangleAlert strokeWidth={1.5} className="h-4 w-4 shrink-0 text-traffic-slow" />
            Off the route — following the road until we can reconnect.
          </div>
        )}
        {error && <div className="glass mt-2 rounded-xl px-3 py-2 text-sm">{error}</div>}
      </div>

      {/* ---------- road alerts ---------- */}
      {nextAlert && (
        <div
          role="status"
          className="glass absolute inset-x-3 top-56 z-40 flex items-start gap-3 rounded-2xl p-3 md:inset-x-auto md:left-4 md:top-72 md:w-[420px]"
        >
          <TriangleAlert
            strokeWidth={1.5}
            className={`mt-0.5 h-5 w-5 shrink-0 ${nextAlert.severity === "high" ? "text-destructive" : "text-traffic-slow"}`}
          />
          <div className="min-w-0 flex-1">
            <p className="font-display">{nextAlert.title}</p>
            <p className="text-sm text-muted-foreground">
              {fmtDistance(nextAlert.metres, settings.units)} ahead
            </p>
          </div>
          <button
            onClick={() => setAnnouncedAlerts((p) => [...p, nextAlert.id])}
            aria-label="Dismiss alert"
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ---------- bottom: ETA + end ---------- */}
      <div
        className="absolute inset-x-3 bottom-3 z-40 md:left-4 md:right-auto md:w-[420px]"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="glass flex items-center gap-4 rounded-2xl px-5 py-3">
          <div className="flex-1">
            <div className="tnum font-display text-2xl text-primary">
              {eta ? fmtClock(eta, settings.timeFormat) : "--:--"}
            </div>
            <div className="tnum text-xs text-muted-foreground">
              {progress
                ? `${fmtDuration(progress.timeLeft)} · ${fmtDistance(progress.remaining, settings.units)}`
                : `${fmtDuration(route.duration)} · ${fmtDistance(route.distance, settings.units)}`}
            </div>
          </div>
          <button
            onClick={onEnd}
            className="rounded-xl bg-destructive px-5 py-2.5 font-medium text-destructive-foreground"
          >
            End
          </button>
        </div>
      </div>
    </>
  );
}
