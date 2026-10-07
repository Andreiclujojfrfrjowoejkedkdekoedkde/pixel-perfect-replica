export function haversine(a: [number, number], b: [number, number]) {
  // [lon, lat] in, metres out
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b[1] - a[1]);
  const dLon = toR(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function fmtDistance(m: number, units: "metric" | "imperial") {
  if (units === "imperial") {
    const mi = m / 1609.344;
    if (mi < 0.1) return `${Math.round(m * 3.28084 / 10) * 10} ft`;
    return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
  }
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${m < 10000 ? (m / 1000).toFixed(1) : Math.round(m / 1000)} km`;
}

export function fmtDuration(s: number) {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtClock(date: Date, f: "24h" | "12h") {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: f === "12h" });
}

export function parseCoords(q: string): [number, number] | null {
  const m = q.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

/** Decode Valhalla polyline6 into [lon, lat] pairs. */
export function decodePolyline(str: string, precision = 6): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const coords: [number, number][] = [];
  const factor = 10 ** precision;
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

/** Distance from point p to polyline (metres) and index of nearest vertex. */
export function nearestOnLine(p: [number, number], line: [number, number][]) {
  let best = Infinity, idx = 0;
  for (let i = 0; i < line.length; i++) {
    const d = haversine(p, line[i]!);
    if (d < best) { best = d; idx = i; }
  }
  return { distance: best, index: idx };
}

/** Turn an OSM opening_hours string into readable lines. */
export function formatOpeningHours(raw: string): string[] {
  const days: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "Holidays" };
  if (raw.trim() === "24/7") return ["Open 24 hours"];
  return raw.split(";").map((part) =>
    part.trim().replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => days[d] ?? d).replace(/-/g, "–").replace(/\boff\b/g, "closed"),
  ).filter(Boolean);
}
