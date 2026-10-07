// Posted speed limits from OpenStreetMap `maxspeed` tags.
//
// Every value here is either a real posted limit or explicitly "unknown". Nothing
// is inferred from road class, country defaults or traffic signs: if OSM has no
// numeric value for the direction we are driving, the answer is unknown.

import { projectOnLine } from "./format";
import { storage } from "./platform";

export type BBox = [number, number, number, number]; // west, south, east, north
export type WayDirection = "forward" | "backward";

/**
 * Parse an OSM maxspeed tag into km/h, or null when it is not a posted number.
 * Accepts "50", "50 km/h", "50kph", "50 mph", "50 mi/h", "30;50" and "50 @ (zone)".
 * Rejects conditional/variable values ("signals", "none", "walk", "variable"),
 * country presets ("DE:urban") and anything else non-numeric.
 */
export function parseMaxspeed(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const first = raw.split(";")[0]!.trim();
  if (!first) return null;
  const m = /^(\d{1,4})\s*(km\/h|kmh|kph|km|mph|mp\/h|mi\/h)?/i.exec(first);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  // A bare number is km/h, which is what OSM means when no unit is tagged.
  const unit = m[2]?.toLowerCase();
  return unit && ["mph", "mp/h", "mi/h"].includes(unit)
    ? Math.round(value * 1.609344)
    : Math.round(value);
}

/** Does this way carry any usable limit tag? */
export function hasMaxspeed(tags: Record<string, string> | undefined) {
  if (!tags) return false;
  return ["maxspeed", "maxspeed:forward", "maxspeed:backward"].some((k) => tags[k] !== undefined);
}

/**
 * The limit that applies to travel in `dir` (forward = along OSM node order).
 * A directional tag wins when it parses; otherwise fall back to the plain tag.
 */
export function limitForDirection(
  tags: Record<string, string> | undefined,
  dir: WayDirection,
): number | null {
  if (!tags) return null;
  return parseMaxspeed(tags[`maxspeed:${dir}`]) ?? parseMaxspeed(tags["maxspeed"]);
}

export function formatLimit(kmh: number | null, units: "metric" | "imperial") {
  if (kmh == null) return "—";
  return units === "imperial" ? String(Math.round(kmh / 1.609344)) : String(kmh);
}

export const LIMIT_UNIT_LABEL = { metric: "km/h", imperial: "mph" } as const;

/* ---------------- Overpass ---------------- */

const OVERPASS = "https://overpass-api.de/api/interpreter";
const CHUNK_VERTICES = 60; // route points per bbox
const MAX_BBOX_SPAN = 0.25; // degrees; keeps one request inside a sane area
const MAX_REQUESTS = 8;
const TIMEOUT_MS = 25_000;

export type MaxspeedWay = {
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

const bboxesForRoute = (coords: [number, number][]): BBox[] => {
  const out: BBox[] = [];
  for (let i = 0; i < coords.length - 1; i += CHUNK_VERTICES) {
    const slice = coords.slice(i, i + CHUNK_VERTICES + 1);
    if (slice.length < 2) continue;
    let w = Infinity,
      s = Infinity,
      e = -Infinity,
      n = -Infinity;
    for (const [lon, lat] of slice) {
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
    out.push([w, s, e, n]);
  }
  // Merge chunks that already sit inside a previous box so short routes cost one call.
  const merged: BBox[] = [];
  for (const b of out) {
    const into = merged.find((m) => b[0] >= m[0] && b[1] >= m[1] && b[2] <= m[2] && b[3] <= m[3]);
    if (!into) {
      const spanW = Math.min(b[2] - b[0], MAX_BBOX_SPAN);
      const spanH = Math.min(b[3] - b[1], MAX_BBOX_SPAN);
      merged.push([b[0], b[1], b[0] + spanW, b[1] + spanH]);
    }
  }
  return merged.slice(0, MAX_REQUESTS);
};

const waysQuery = (b: BBox) =>
  `[out:json][timeout:20];(way["highway"]["maxspeed"](${b[1]},${b[0]},${b[3]},${b[2]});` +
  `way["highway"]["maxspeed:forward"](${b[1]},${b[0]},${b[3]},${b[2]});` +
  `way["highway"]["maxspeed:backward"](${b[1]},${b[0]},${b[3]},${b[2]}););out geom;`;

export class OverpassError extends Error {
  constructor(message = "Speed limit lookup failed.") {
    super(message);
    this.name = "OverpassError";
  }
}

/** Fetch maxspeed ways around the route geometry, one bbox at a time. */
export async function fetchMaxspeedWays(
  coords: [number, number][],
  signal?: AbortSignal,
): Promise<MaxspeedWay[]> {
  const boxes = bboxesForRoute(coords);
  if (!boxes.length) throw new OverpassError("This route has no geometry to inspect.");
  const ways = new Map<number, MaxspeedWay>();
  for (const b of boxes) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const onAbort = () => ac.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const r = await fetch(OVERPASS, {
        method: "POST",
        body: new URLSearchParams({ data: waysQuery(b) }),
        signal: ac.signal,
      });
      if (!r.ok) throw new OverpassError();
      const j = (await r.json()) as { elements?: MaxspeedWay[] };
      for (const w of j.elements ?? []) if (hasMaxspeed(w.tags)) ways.set(w.id, w);
    } catch (e) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      // Partial results beat nothing, but a total failure must surface so the UI
      // can offer a retry instead of implying "no limit data here".
      if (ways.size === 0) throw e instanceof OverpassError ? e : new OverpassError();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  return [...ways.values()];
}

/* ---------------- Projection onto the route ---------------- */

export type SpeedSegment = {
  /** Route vertex index where this limit starts applying (inclusive). */
  from: number;
  /** Route vertex index where it stops applying (exclusive; route.length at the end). */
  to: number;
  /** null = no posted data for this stretch. */
  limitKmh: number | null;
  road: string | null;
};

export type SpeedSignPoint = {
  lon: number;
  lat: number;
  limitKmh: number | null;
  road: string | null;
};

/** Forward/backward of a way relative to how the route crosses it. */
function wayDirection(way: MaxspeedWay, routeDir: [number, number]): WayDirection {
  const g = way.geometry ?? [];
  if (g.length < 2) return "forward";
  const a = g[0]!,
    b = g[g.length - 1]!;
  const wayBearing = (Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180) / Math.PI;
  const routeBearing = (Math.atan2(routeDir[0], routeDir[1]) * 180) / Math.PI;
  const diff = Math.abs(((wayBearing - routeBearing + 540) % 360) - 180);
  return diff < 90 ? "forward" : "backward";
}

const MATCH_TOLERANCE = 45; // metres: how far a tagged way may sit from the route

/**
 * Project tagged ways onto the route and derive the limit per segment plus the
 * points where the limit changes. Ways with no numeric value in the driving
 * direction contribute an explicit unknown stretch rather than a guess.
 */
export function projectSpeedLimits(
  ways: MaxspeedWay[],
  route: [number, number][],
): { segments: SpeedSegment[]; signs: SpeedSignPoint[] } {
  const hits = new Map<number, { limitKmh: number | null; road: string | null; dist: number }>();
  for (const w of ways) {
    const g = (w.geometry ?? []).map((p) => [p.lon, p.lat] as [number, number]);
    if (!g.length) continue;
    // Anchor the way on its middle vertex: that is the part most likely to be
    // the part of a long way that the route actually uses.
    const anchor = g[Math.floor(g.length / 2)]!;
    const at = projectOnLine(anchor, route);
    if (at.distance > MATCH_TOLERANCE) continue;
    const next = route[Math.min(at.index + 1, route.length - 1)]!;
    const dir = wayDirection(w, [next[0] - route[at.index]![0], next[1] - route[at.index]![1]]);
    const limitKmh = limitForDirection(w.tags, dir);
    const road = w.tags?.["name"] ?? null;
    const prev = hits.get(at.index);
    if (!prev || at.distance < prev.dist) hits.set(at.index, { limitKmh, road, dist: at.distance });
  }

  const ordered = [...hits.entries()].sort((a, b) => a[0] - b[0]);
  const segments: SpeedSegment[] = [];
  const signs: SpeedSignPoint[] = [];
  for (const [index, hit] of ordered) {
    const last = segments[segments.length - 1];
    if (last && last.limitKmh === hit.limitKmh) continue; // same posted limit: no change
    if (last) last.to = index;
    segments.push({ from: index, to: route.length, limitKmh: hit.limitKmh, road: hit.road });
    // A stretch that drops to unknown means the signs end there; there is no
    // sign to draw on the ground for "nothing is posted".
    if (hit.limitKmh != null) {
      const at = route[index]!;
      signs.push({ lon: at[0], lat: at[1], limitKmh: hit.limitKmh, road: hit.road });
    }
  }
  if (segments.length && segments[0]!.from > 0) {
    // The head of the route sits before any tagged way, so it has no data.
    segments.unshift({ from: 0, to: segments[0]!.from, limitKmh: null, road: null });
  }
  for (let i = segments.length - 1; i > 0; i--) {
    const a = segments[i]!,
      b = segments[i - 1]!;
    if (a.limitKmh === b.limitKmh) {
      a.from = b.from;
      segments.splice(i - 1, 1);
    }
  }
  return { segments, signs };
}

/** Limit for a snapped route index, or null when no data covers it. */
export function limitAtIndex(segments: SpeedSegment[], index: number): number | null {
  if (!segments.length) return null;
  return segments.find((s) => index >= s.from && index < s.to)?.limitKmh ?? null;
}

/** Nearest sign at or after `index`, for "limit changes in ..." hints. */
export function nextSign(segments: SpeedSegment[], index: number): SpeedSegment | null {
  return segments.find((s) => s.from >= index) ?? null;
}

/* ---------------- Per-route cache ---------------- */

const CACHE_KEY = "speedlimits";
const TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 2;

type CacheEntry = { at: number; coords: [number, number][]; ways: MaxspeedWay[] };

export function routeKey(coords: [number, number][]): string {
  const a = coords[0] ?? [0, 0];
  const b = coords[coords.length - 1] ?? a;
  return `${a[1].toFixed(4)},${a[0].toFixed(4)}-${b[1].toFixed(4)},${b[0].toFixed(4)}-${coords.length}`;
}

export function readCache(key: string, coords: [number, number][]): CacheEntry | null {
  const all = storage.get<Record<string, CacheEntry>>(CACHE_KEY, {});
  const hit = all[key];
  if (!hit || Date.now() - hit.at > TTL_MS || hit.coords.length !== coords.length) return null;
  return hit;
}

export function writeCache(key: string, coords: [number, number][], ways: MaxspeedWay[]) {
  const all = storage.get<Record<string, CacheEntry>>(CACHE_KEY, {});
  const next = { ...all, [key]: { at: Date.now(), coords, ways } satisfies CacheEntry };
  // Keep the newest few routes only; entries are large and OSM tags change rarely.
  const trimmed = Object.fromEntries(
    Object.entries(next)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 6),
  );
  storage.set(CACHE_KEY, trimmed);
}

export function dropCache(key: string) {
  const all = storage.get<Record<string, CacheEntry>>(CACHE_KEY, {});
  delete all[key];
  storage.set(CACHE_KEY, all);
}
