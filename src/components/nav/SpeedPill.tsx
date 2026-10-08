import { useEffect, useRef, useState } from "react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings } from "@/lib/settings";

// GPS speed with a light low-pass filter. The speed-limit sign appears only
// when a real limit is known; it is never guessed.
export function SpeedPill({ limitKmh }: { limitKmh?: number | null }) {
  const { position, navigating } = useMapState();
  const { settings } = useSettings();
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
            <span className="tnum text-lg font-bold leading-none">{Math.round(limitKmh / 1.609)}</span>
          </div>
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-[5px] border-destructive bg-card text-card-foreground">
            <span className="tnum text-base font-bold">{limitKmh}</span>
          </div>
        )
      ) : null}
    </div>
  );
}
