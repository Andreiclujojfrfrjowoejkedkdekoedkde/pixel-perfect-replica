import { useEffect, useRef, useState } from "react";
import { Clock, Gauge, Navigation, Route as RouteIcon, Timer } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings } from "@/lib/settings";
import { useSpeedLimits } from "@/components/nav/SpeedLimitsContext";
import { fmtClock, fmtDistance, fmtDuration } from "@/lib/format";
import { routeProgress } from "@/lib/navigation";
import { LIMIT_UNIT_LABEL, formatLimit } from "@/lib/speedLimits";

/**
 * The small always-there driving panel, in the spirit of a navigation app's
 * bottom bar: speed, posted limit, arrival time, time and distance remaining.
 *
 * It updates from the same snapped progress the guidance card uses, so the two
 * can never disagree, and it smooths the speed readout so GPS jitter does not
 * make the number flicker.
 */
export function DrivingHud() {
  const { position, navigating, routes, activeRoute } = useMapState();
  const { settings } = useSettings();
  const { currentKmh } = useSpeedLimits();
  const route = routes[activeRoute];
  const [expanded, setExpanded] = useState(false);
  const smooth = useRef(0);
  const [kmh, setKmh] = useState(0);

  useEffect(() => {
    const raw = position?.speed != null ? position.speed * 3.6 : 0;
    smooth.current = smooth.current * 0.7 + raw * 0.3;
    setKmh(smooth.current);
  }, [position]);

  if (!navigating || !route) return null;

  const progress = position
    ? routeProgress(route, position.lon, position.lat, position.heading)
    : null;

  const imperial = settings.units === "imperial";
  const speed = Math.round(imperial ? kmh / 1.609344 : kmh);
  const limit = currentKmh != null ? formatLimit(currentKmh, settings.units) : null;
  const eta = progress ? new Date(Date.now() + progress.timeLeft * 1000) : null;
  const overLimit = currentKmh != null && kmh - currentKmh > settings.speedTolerance;

  return (
    <div
      className="pointer-events-none absolute inset-x-3 z-30 flex justify-center md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)" }}
    >
      <div className="surface-glass pointer-events-auto flex items-stretch gap-1 rounded-2xl p-1.5">
        {/* speed + limit */}
        <div className="flex items-center gap-2 rounded-xl px-3 py-1.5">
          <Gauge strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span
            className={`tnum text-2xl font-semibold leading-none ${overLimit ? "text-destructive" : ""}`}
            aria-label={`Speed ${speed} ${imperial ? "miles" : "kilometres"} per hour`}
          >
            {speed}
          </span>
          <span className="smallcaps text-[10px] text-muted-foreground">
            {imperial ? "mph" : "km/h"}
          </span>
          {limit && (
            <span
              className="tnum ml-1 rounded-md border-2 border-destructive px-1.5 py-0.5 text-[11px] font-bold leading-none"
              title="Posted speed limit"
            >
              {limit}
            </span>
          )}
        </div>

        <span className="my-1 w-px bg-border/70" />

        {/* arrival */}
        <div className="flex min-w-[5.5rem] flex-col justify-center rounded-xl px-3 py-1.5">
          <span className="smallcaps flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock strokeWidth={2} className="h-2.5 w-2.5" /> arrive
          </span>
          <span className="tnum text-lg font-semibold leading-tight">
            {eta ? fmtClock(eta, settings.timeFormat) : "--:--"}
          </span>
        </div>

        <span className="my-1 w-px bg-border/70" />

        {/* remaining */}
        <div className="flex min-w-[6rem] flex-col justify-center rounded-xl px-3 py-1.5">
          <span className="smallcaps flex items-center gap-1 text-[10px] text-muted-foreground">
            <Timer strokeWidth={2} className="h-2.5 w-2.5" /> left
          </span>
          <span className="tnum text-lg font-semibold leading-tight">
            {progress ? fmtDuration(progress.timeLeft) : "--"}
          </span>
          <span className="tnum text-[10px] text-muted-foreground">
            {progress ? fmtDistance(progress.remaining, settings.units) : ""}
          </span>
        </div>

        {/* details on tap */}
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label="Show trip details"
          title="Trip details"
          className="glass-button h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
        >
          <RouteIcon strokeWidth={1.5} className="h-4 w-4" />
        </button>
      </div>

      {expanded && progress && (
        <div className="surface-glass pointer-events-auto mt-2 w-full max-w-md rounded-2xl p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="tnum">{Math.round(progress.fraction * 100)}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${Math.max(1, progress.fraction * 100)}%` }}
            />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Travelled</dt>
            <dd className="tnum text-right">{fmtDistance(progress.travelled, settings.units)}</dd>
            <dt className="text-muted-foreground">Remaining</dt>
            <dd className="tnum text-right">{fmtDistance(progress.remaining, settings.units)}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="tnum text-right">{fmtDistance(route.distance, settings.units)}</dd>
            <dt className="text-muted-foreground">Next</dt>
            <dd className="truncate text-right">{fmtDistance(progress.toNext, settings.units)}</dd>
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Navigation strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {LIMIT_UNIT_LABEL[settings.units]} · posted limits come from OpenStreetMap and may be
            incomplete.
          </p>
        </div>
      )}
    </div>
  );
}
