import { LIMIT_UNIT_LABEL, formatLimit } from "@/lib/speedLimits";
import type { SpeedLimitState } from "./SpeedLimitsContext";

// Road-style speed limit signs. A known limit gets the real sign face for the
// user's unit system; an unknown limit gets a neutral plate with a dash, because
// showing a number we do not have would be a guess.

export function SpeedSignBadge({
  limitKmh,
  units,
  state = "ready",
  className = "",
}: {
  limitKmh: number | null;
  units: "metric" | "imperial";
  state?: SpeedLimitState;
  className?: string;
}) {
  const known = state !== "error" && limitKmh != null;
  const value = known ? formatLimit(limitKmh, units) : state === "loading" ? "…" : "—";
  const label = known
    ? `Speed limit ${value} ${LIMIT_UNIT_LABEL[units]}`
    : state === "loading"
      ? "Checking speed limit"
      : "Speed limit unavailable";

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={`flex shrink-0 flex-col items-center justify-center leading-none ${className}`}
    >
      {known && units === "imperial" ? (
        // Rectangular "SPEED LIMIT" sign.
        <div className="flex h-14 w-11 flex-col items-center justify-center rounded-md border-2 border-foreground bg-card text-card-foreground shadow-sm">
          <span className="text-[7px] font-bold leading-none">
            SPEED
            <br />
            LIMIT
          </span>
          <span className="tnum text-lg font-bold leading-none">{value}</span>
        </div>
      ) : known ? (
        // Circular white plate with a red ring.
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-[5px] border-destructive bg-card text-card-foreground shadow-sm">
          <span className="tnum text-lg font-bold">{value}</span>
        </div>
      ) : (
        // Neutral "no data" plate: never a number we cannot back up.
        <div className="flex h-12 min-w-12 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/60 bg-card/80 px-2 text-muted-foreground">
          <span className="tnum text-lg font-semibold">{value}</span>
        </div>
      )}
    </div>
  );
}

/** One-line caption under the sign, so "unavailable" is never ambiguous. */
export function SpeedSignCaption({
  limitKmh,
  units,
  state,
  road,
}: {
  limitKmh: number | null;
  units: "metric" | "imperial";
  state: SpeedLimitState;
  road?: string | null;
}) {
  if (state === "loading")
    return <span className="text-xs text-muted-foreground">Checking posted limits</span>;
  if (state === "error")
    return <span className="text-xs text-muted-foreground">Limit unavailable</span>;
  if (limitKmh == null)
    return <span className="text-xs text-muted-foreground">Limit unavailable</span>;
  return (
    <span className="text-xs text-muted-foreground">
      {formatLimit(limitKmh, units)} {LIMIT_UNIT_LABEL[units]}
      {road ? ` · ${road}` : ""}
    </span>
  );
}
