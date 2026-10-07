import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings } from "@/lib/settings";
import { useSpeedLimits } from "./SpeedLimitsContext";
import { SpeedSignBadge } from "./SpeedSign";

// GPS speed with a light low-pass filter. The posted-limit sign next to it comes
// from OSM `maxspeed`; when there is no data it shows "Limit unavailable" rather
// than a guessed number.
export function SpeedPill() {
  const { position, navigating, routes } = useMapState();
  const { settings } = useSettings();
  const { state, currentKmh, canRetry, retry } = useSpeedLimits();
  const smooth = useRef(0);
  const [kmh, setKmh] = useState(0);

  useEffect(() => {
    const raw = position?.speed != null ? position.speed * 3.6 : 0;
    smooth.current = smooth.current * 0.65 + raw * 0.35;
    setKmh(smooth.current);
  }, [position]);

  const imperial = settings.units === "imperial";
  const shown = Math.round(imperial ? kmh / 1.609 : kmh);
  const onRoute = routes.length > 0;
  const over = currentKmh ? kmh - currentKmh : -Infinity;
  const tone =
    over > settings.speedTolerance ? "text-destructive" : over > 0 ? "text-traffic-slow" : "";

  // The sign is only meaningful next to a route: with no route there is no
  // "current segment" to be unavailable for.
  const showSign = onRoute && (navigating || kmh >= 3);
  const showRetry = showSign && canRetry;

  if (!navigating && kmh < 3 && !showRetry) return null;

  return (
    <div className="absolute bottom-28 left-3 z-30 flex items-end gap-2 md:bottom-8 md:left-auto md:right-20">
      <div
        className="glass flex flex-col items-center rounded-2xl px-4 py-2"
        aria-live="polite"
        aria-label={`Speed ${shown} ${imperial ? "miles" : "kilometres"} per hour`}
      >
        <span className={`tnum text-3xl font-semibold leading-none ${tone}`}>{shown}</span>
        <span className="smallcaps text-[10px] text-muted-foreground">
          {imperial ? "mph" : "km/h"}
        </span>
      </div>
      {showSign && <SpeedSignBadge limitKmh={currentKmh} units={settings.units} state={state} />}
      {showRetry && (
        <button
          onClick={retry}
          className="glass flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
          aria-label="Retry speed limit lookup"
          title="Posted limits could not be loaded. Retry."
        >
          <RefreshCw strokeWidth={1.5} className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
