// Turn-by-turn helpers shared by the guidance UI: which lane or side to keep,
// how far to the next manoeuvre, and whether the driver has left the route.

import { haversine, projectOnLine } from "./format";
import type { Maneuver, Route } from "./services";

/** Valhalla manoeuvre type -> a plain "bear left/right" instruction we can show. */
export type LaneAdvice = {
  /** null when Valhalla gives nothing useful to show. */
  text: string | null;
  /** Rough side, for the arrow icon. */
  side: "left" | "right" | "straight" | "uturn";
  /** Exits in the junction view, when the leg has them. */
  exits?: { number: number; count: number }[];
};

export function laneAdvice(m: Maneuver | undefined): LaneAdvice {
  if (!m) return { text: null, side: "straight" };
  switch (m.type) {
    case 1:
      return { text: "Continue on the road", side: "straight" };
    case 2:
      return { text: "Turn left", side: "left" };
    case 3:
      return { text: "Turn right", side: "right" };
    case 4:
      return { text: "Continue", side: "straight" };
    case 5:
      return { text: "Bear right onto the slip road", side: "right" };
    case 6:
      return { text: "Take the exit on the right", side: "right" };
    case 7:
      return { text: "Take the exit on the left", side: "left" };
    case 8:
      return { text: "Take the exit straight ahead", side: "straight" };
    case 9:
      return { text: "Take the slip road on the right", side: "right" };
    case 10:
      return { text: "Bear right at the roundabout", side: "right" };
    case 11:
      return { text: "At the roundabout, turn left", side: "left" };
    case 12:
      return { text: "At the roundabout, take the exit on the left", side: "left" };
    case 13:
      return { text: "At the roundabout, take the exit on the right", side: "right" };
    case 14:
      return { text: "Turn left onto the slip road", side: "left" };
    case 15:
      return { text: "Turn right onto the slip road", side: "right" };
    case 16:
      return { text: "Turn left onto the road", side: "left" };
    case 17:
      return { text: "Make a U-turn", side: "uturn" };
    case 18:
      return { text: "Merge onto the road on the right", side: "right" };
    case 19:
      return { text: "Merge onto the road on the left", side: "left" };
    case 20:
      return { text: "Take the fork on the right", side: "right" };
    case 21:
      return { text: "Take the fork on the left", side: "left" };
    case 22:
      return { text: "Continue to the T-junction", side: "straight" };
    case 23:
      return { text: "Keep right at the T-junction", side: "right" };
    case 24:
      return { text: "Keep left at the T-junction", side: "left" };
    case 25:
      return { text: "Turn right at the T-junction", side: "right" };
    case 26:
      return { text: "Turn left at the T-junction", side: "left" };
    default:
      return { text: null, side: "straight" };
  }
}

/** A compact banner for the imminent manoeuvre: "keep left in 200 m". */
export function approachText(
  advice: LaneAdvice,
  metres: number,
  units: "metric" | "imperial",
): string {
  const dist =
    units === "imperial"
      ? metres < 160.9
        ? `${Math.round((metres * 3.28084) / 10) * 10} ft`
        : `${(metres / 1609.344).toFixed(1)} mi`
      : metres < 1000
        ? `${Math.round(metres / 10) * 10} m`
        : `${(metres / 1000).toFixed(1)} km`;
  return advice.text ? `${advice.text} in ${dist}` : `Continue for ${dist}`;
}

export type Progress = {
  /** How far the driver's snapped position sits from the route, in metres. */
  offRoute: number;
  index: number;
  remaining: number;
  toNext: number;
  travelled: number;
  total: number;
  /** 0..1 along the route. */
  fraction: number;
  next: Maneuver;
  timeLeft: number;
  bearing: number;
};

export const OFF_ROUTE_METRES = 50;
export const REROUTING_METRES = 90;

/** Snap a position onto the route and work out everything the UI needs. */
export function routeProgress(
  route: Route,
  lon: number,
  lat: number,
  heading: number | null,
): Progress {
  const at = projectOnLine([lon, lat], route.coords);
  const index = at.index;

  let remaining = 0;
  for (let i = index; i < route.coords.length - 1; i++) {
    remaining += haversine(route.coords[i]!, route.coords[i + 1]!);
  }
  let travelled = 0;
  for (let i = 0; i < index && i < route.coords.length - 1; i++) {
    travelled += haversine(route.coords[i]!, route.coords[i + 1]!);
  }

  const next = route.maneuvers.find((m) => m.beginIndex > index) ??
    route.maneuvers[route.maneuvers.length - 1] ?? {
      instruction: "Continue",
      type: 4,
      street: "",
      length: 0,
      time: 0,
      beginIndex: route.coords.length - 1,
    };

  let toNext = 0;
  for (let i = index; i < Math.min(next.beginIndex, route.coords.length - 1); i++) {
    toNext += haversine(route.coords[i]!, route.coords[i + 1]!);
  }

  // Bearing along the road when the compass is unavailable.
  const ahead = route.coords[Math.min(index + 2, route.coords.length - 1)]!;
  const roadBearing =
    heading ??
    (Math.atan2(ahead[0] - route.coords[index]![0], ahead[1] - route.coords[index]![1]) * 180) /
      Math.PI;

  const total = route.distance || travelled + remaining;
  return {
    offRoute: at.distance,
    index,
    remaining,
    travelled,
    total,
    fraction: total > 0 ? Math.min(1, travelled / total) : 0,
    next,
    toNext,
    timeLeft: total > 0 ? (remaining / total) * route.duration : 0,
    bearing: (roadBearing + 360) % 360,
  };
}

/** Haversine distance to a point, kept here so Guidance needs one import. */
export { haversine };
