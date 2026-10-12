import { haversine, nearestOnLine } from "./format";
import { overpass } from "./offline-data";

export type LimitWay = { limit: number; line: [number, number][] };
export type LimitSign = { at: [number, number]; limit: number };

/** Parse an OSM maxspeed value to km/h. Non-numeric zone codes return null — never guessed. */
export function parseMaxspeed(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?$/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 200) return null;
  return Math.round(/mph/i.test(m[2] ?? "") ? n * 1.609344 : n);
}

/** Points roughly every `step` metres along the route. */
export function sampleRoute(coords: [number, number][], step = 250) {
  const out: [number, number][] = [];
  let carry = step;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!, b = coords[i + 1]!; const len = haversine(a, b);
    while (carry <= len) { const t = carry / (len || 1); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); carry += step; }
    carry -= len;
  }
  if (coords[0]) out.unshift(coords[0]);
  return out;
}

const cache = new Map<string, Promise<LimitWay[]>>();
export function routeKey(coords: [number, number][]) {
  const a = coords[0], b = coords[coords.length - 1];
  return `${coords.length}:${a?.[0].toFixed(4)},${a?.[1].toFixed(4)}:${b?.[0].toFixed(4)},${b?.[1].toFixed(4)}`;
}

type GeomElement = { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
/** Chunked Overpass lookups of tagged maxspeed around the route, cached per route. */
export function routeLimits(coords: [number, number][]): Promise<LimitWay[]> {
  const key = routeKey(coords);
  const hit = cache.get(key); if (hit) return hit;
  const job = (async () => {
    const pts = sampleRoute(coords).slice(0, 1200);
    const ways: LimitWay[] = [];
    for (let i = 0; i < pts.length; i += 120) {
      const around = pts.slice(i, i + 120).map(p => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(",");
      try {
        const data = await overpass(`[out:json][timeout:25];way[highway][maxspeed](around:30,${around});out tags geom;`) as unknown as { elements: GeomElement[] };
        for (const el of data.elements) {
          const limit = parseMaxspeed(el.tags?.["maxspeed"]);
          if (limit && el.geometry && el.geometry.length > 1) ways.push({ limit, line: el.geometry.map(g => [g.lon, g.lat]) });
        }
      } catch { /* chunk unavailable: those segments stay "Limit unavailable" */ }
    }
    return ways;
  })();
  cache.set(key, job);
  if (cache.size > 8) { const first = cache.keys().next().value; if (first) cache.delete(first); }
  job.catch(() => cache.delete(key));
  return job;
}

/** Limit of the closest tagged way within 25 m, or null when unknown. */
export function limitAt(p: [number, number], ways: LimitWay[]): number | null {
  let best = 25, limit: number | null = null;
  for (const w of ways) { const d = nearestOnLine(p, w.line).distance; if (d < best) { best = d; limit = w.limit; } }
  return limit;
}

/** Sign positions where the known limit changes along the route. */
export function limitSigns(coords: [number, number][], ways: LimitWay[]): LimitSign[] {
  const signs: LimitSign[] = []; let last: number | null = null;
  for (const p of sampleRoute(coords, 120)) {
    const l = limitAt(p, ways);
    if (l && l !== last) signs.push({ at: p, limit: l });
    if (l) last = l;
  }
  return signs.slice(0, 150);
}
