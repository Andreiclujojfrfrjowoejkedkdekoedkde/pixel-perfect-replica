// Tile maths, size estimation and the pausable download queue for offline areas.
//
// Caps are deliberate: a device must not be fillable by accident. MAX_TILES is a
// hard stop, WARN_TILES is where we ask the driver to confirm, and MAX_ZOOM keeps
// vector tiles from exploding in size at high detail.

import type { BBox, OfflineArea, OfflinePlace } from "./offlineDb";
import { cacheNameFor, areaOf } from "./offlineDb";

export const MAX_ZOOM = 15;
export const WARN_TILES = 2500;
export const MAX_TILES = 6000;
export const MAX_AREA_KM2 = 2500;
export const MAX_PLACES = 3000;
/** Measured average for OpenMapTiles vector tiles plus glyphs; refined as we go. */
const AVG_TILE_BYTES = 35_000;

export const TILE_HOST = "tiles.openfreemap.org";
export const PLANET_URL = `https://${TILE_HOST}/planet`;
const GLYPHS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];

export const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
export const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
/** Web Mercator normalised coordinates, both in [0, 1]. */
const mercator = ([lon, lat]: [number, number]): [number, number] => {
  const r = (lat * Math.PI) / 180;
  return [(lon + 180) / 360, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2];
};

/** Even-odd point-in-polygon, used to clip a drawn shape to whole tiles. */
export function pointInPolygon([x, y]: [number, number], polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Does a tile touch the drawn shape at all? A centre test is not enough: it
 * leaves holes along the edge of the shape, and an offline area with holes is
 * not really offline. Keep a tile when any corner is inside the polygon or any
 * polygon vertex falls inside the tile.
 */
function tileTouchesPolygon(x: number, y: number, n: number, poly: [number, number][]) {
  const x0 = x / n;
  const x1 = (x + 1) / n;
  const y0 = y / n;
  const y1 = (y + 1) / n;
  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  if (corners.some((c) => pointInPolygon(c, poly))) return true;
  return poly.some(([px, py]) => px >= x0 && px <= x1 && py >= y0 && py <= y1);
}

/** Every tile covering the bbox, and for a polygon only those the shape touches. */
export function tilesFor(
  bbox: BBox,
  minZoom: number,
  maxZoom: number,
  polygon?: [number, number][],
) {
  const shape = polygon && polygon.length >= 3 ? polygon.map(mercator) : null;
  const out: [number, number, number][] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const x0 = Math.max(0, lon2x(bbox[0], z));
    const x1 = Math.min(n - 1, lon2x(bbox[2], z));
    const y0 = Math.max(0, lat2y(bbox[3], z));
    const y1 = Math.min(n - 1, lat2y(bbox[1], z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (shape && !tileTouchesPolygon(x, y, n, shape)) continue;
        out.push([z, x, y]);
      }
    }
    if (out.length > MAX_TILES) return out.slice(0, MAX_TILES);
  }
  return out;
}

export function tileUrls(tiles: [number, number, number][], template: string) {
  return tiles.map(([z, x, y]) =>
    template.replace("{z}", `${z}`).replace("{x}", `${x}`).replace("{y}", `${y}`),
  );
}

/** Style resources MapLibre needs before any tile can paint. */
export function styleUrls() {
  const urls = [PLANET_URL];
  for (const font of GLYPHS)
    for (const range of ["0-255", "256-511"])
      urls.push(`https://${TILE_HOST}/fonts/${encodeURIComponent(font)}/${range}.pbf`);
  return urls;
}

export type Estimate = {
  tiles: number;
  bytes: number;
  tooBig: boolean;
  tooWide: boolean;
  warning: string | null;
};

export function estimate(
  bbox: BBox,
  maxZoom: number,
  polygon?: [number, number][],
  avgBytes = AVG_TILE_BYTES,
): Estimate {
  const tiles = tilesFor(bbox, 0, maxZoom, polygon);
  const km2 = areaOf(bbox);
  const tooWide = km2 > MAX_AREA_KM2 || tiles.length > MAX_TILES;
  const tooBig = maxZoom > MAX_ZOOM;
  let warning: string | null = null;
  if (km2 > MAX_AREA_KM2)
    warning = `That is about ${Math.round(km2).toLocaleString()} km². Meridian caps downloads at ${MAX_AREA_KM2.toLocaleString()} km² — zoom in and draw a smaller area.`;
  else if (tiles.length > MAX_TILES)
    warning = `About ${tiles.length.toLocaleString()} tiles is over the ${MAX_TILES.toLocaleString()} tile limit. Draw a smaller area or pick less detail.`;
  else if (tiles.length > WARN_TILES)
    warning = `This is a large download (about ${fmtBytes(tiles.length * avgBytes)}). It may take a while on mobile data.`;
  return {
    tiles: tiles.length,
    bytes: tiles.length * avgBytes + styleUrls().length * 20_000,
    tooBig,
    tooWide,
    warning,
  };
}

export function fmtBytes(b: number) {
  if (!b) return "0 MB";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} MB`;
  return `${(b / 1073741824).toFixed(1)} GB`;
}

/* ---------------- Download queue ---------------- */

export type Progress = { done: number; total: number; bytes: number };

type Job = {
  area: OfflineArea;
  urls: string[];
  index: number;
  bytes: number;
  paused: boolean;
  cancelled: boolean;
  controller: AbortController;
};

export class AreaDownloader {
  private job: Job | null = null;
  private listeners = new Set<(p: Progress | null, area: OfflineArea) => void>();

  subscribe(fn: (p: Progress | null, area: OfflineArea) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit(job: Job | null) {
    const p = job ? { done: job.index, total: job.urls.length, bytes: job.bytes } : null;
    const area = job?.area;
    if (area) for (const fn of this.listeners) fn(p, area);
  }

  get busy() {
    return this.job !== null;
  }

  async start(area: OfflineArea, urls: string[], onArea: (a: OfflineArea) => void) {
    await this.stop();
    const job: Job = {
      area,
      urls,
      index: 0,
      bytes: 0,
      paused: false,
      cancelled: false,
      controller: new AbortController(),
    };
    this.job = job;
    this.update(job, onArea, { state: "downloading", done: 0 });
    void this.loop(job, onArea);
  }

  /** Single writer for the area record so progress can never go backwards. */
  private update(job: Job, onArea: (a: OfflineArea) => void, patch: Partial<OfflineArea>) {
    job.area = { ...job.area, ...patch };
    onArea(job.area);
    this.emit(job);
  }

  private async loop(job: Job, onArea: (a: OfflineArea) => void) {
    const cache = await caches.open(job.area.cacheName);
    const CONCURRENCY = 6;
    try {
      while (job.index < job.urls.length && !job.cancelled) {
        if (job.paused) {
          this.update(job, onArea, { state: "paused" });
          await untilResumed(job);
          if (job.cancelled) break;
          this.update(job, onArea, { state: "downloading" });
        }
        const batch = job.urls.slice(job.index, job.index + CONCURRENCY);
        await Promise.all(
          batch.map(async (url) => {
            if (job.cancelled || job.paused) return;
            try {
              const res = await fetch(url, { signal: job.controller.signal, mode: "cors" });
              if (res.ok) {
                const blob = await res.clone().blob();
                await cache.put(url, res);
                job.bytes += blob.size;
              }
            } catch {
              // A missing tile must not abort the download; the area still works
              // with whatever arrived.
            }
          }),
        );
        job.index += batch.length;
        this.update(job, onArea, { state: "downloading", done: job.index, bytes: job.bytes });
      }
      if (job.cancelled)
        this.update(job, onArea, { state: "paused", done: job.index, bytes: job.bytes });
      else this.update(job, onArea, { state: "ready", done: job.index, bytes: job.bytes });
    } catch (e) {
      this.update(job, onArea, {
        state: "error",
        error: e instanceof Error ? e.message : "Download failed.",
      });
    } finally {
      this.emit(null);
      if (this.job === job) this.job = null;
    }
  }

  pause() {
    if (this.job) this.job.paused = true;
  }

  resume() {
    if (this.job) this.job.paused = false;
  }

  /** Stop fetching but keep what was already downloaded. */
  async stop() {
    if (!this.job) return;
    this.job.cancelled = true;
    this.job.controller.abort();
    this.job = null;
  }

  /** Bytes actually held for an area, straight from Cache Storage. */
  async usedBytes(cacheName: string) {
    if (typeof caches === "undefined") return 0;
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    let total = 0;
    for (const k of keys) {
      const res = await cache.match(k);
      if (res) total += (await res.clone().blob()).size;
    }
    return total;
  }

  async drop(area: OfflineArea) {
    await this.stop();
    if (typeof caches !== "undefined") await caches.delete(area.cacheName);
  }
}

const untilResumed = (job: Job) =>
  new Promise<void>((resolve) => {
    const tick = () => {
      if (job.cancelled || !job.paused) resolve();
      else setTimeout(tick, 120);
    };
    tick();
  });

/* ---------------- Offline search index ---------------- */

const POI_TAGS = [
  '["amenity"]',
  '["shop"]',
  '["tourism"]',
  '["leisure"]',
  '["office"]',
  '["healthcare"]',
  '["historic"]',
  '["railway"]',
];

const indexQuery = (b: BBox) => {
  const box = `${b[1]},${b[0]},${b[3]},${b[2]}`;
  const parts = POI_TAGS.map((t) => `nwr${t}["name"](${box});`);
  parts.push(`nwr["addr:housenumber"]["addr:street"](${box});`);
  return `[out:json][timeout:60];(${parts.join("")});out center tags ${MAX_PLACES + 500};`;
};

/** Build the offline search index for an area from Overpass. */
export async function buildSearchIndex(
  area: OfflineArea,
  signal?: AbortSignal,
): Promise<OfflinePlace[]> {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: indexQuery(area.bbox) }),
    signal: signal ?? null,
  });
  if (!res.ok) throw new Error("Could not build the offline search index.");
  const json = (await res.json()) as {
    elements?: {
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }[];
  };
  const places: OfflinePlace[] = [];
  for (const el of json.elements ?? []) {
    if (places.length >= MAX_PLACES) break;
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const name =
      t["name"] ??
      (t["addr:housenumber"] ? `${t["addr:housenumber"]} ${t["addr:street"]}` : undefined);
    if (!name) continue;
    const kind =
      t["amenity"] ??
      t["shop"] ??
      t["tourism"] ??
      t["leisure"] ??
      t["office"] ??
      (t["addr:housenumber"] ? "Address" : "Place");
    const subtitle = [t["addr:street"], t["addr:city"], t["addr:country"]]
      .filter(Boolean)
      .join(", ");
    const letter = el.type === "node" ? "N" : el.type === "way" ? "W" : "R";
    places.push({
      id: `${letter}${el.id}`,
      areaId: area.id,
      name,
      subtitle,
      kind: kind.replace(/_/g, " "),
      lon,
      lat,
      s: `${name} ${subtitle} ${kind}`.toLowerCase(),
    });
  }
  return places;
}

/**
 * Lightweight fuzzy matcher. Runs entirely on the device over the downloaded
 * index, so search keeps working with no connection at all.
 */
export function searchIndex(
  places: OfflinePlace[],
  query: string,
  origin?: [number, number],
  limit = 8,
) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: { place: OfflinePlace; score: number }[] = [];
  for (const place of places) {
    const name = place.name.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const termScore =
        name === term
          ? 1000
          : name.startsWith(term)
            ? 800 - (name.length - term.length) / 8
            : new RegExp(`\\b${escapeRe(term)}`).test(name)
              ? 600
              : name.includes(term)
                ? 400
                : place.s.includes(term)
                  ? 250
                  : subsequence(name, term)
                    ? 150
                    : 0;
      if (!termScore) {
        score = 0;
        break;
      }
      score += termScore;
    }
    if (score > 0) scored.push({ place, score });
  }
  scored.sort((a, b) =>
    origin ? b.score - a.score || near(origin, a.place) - near(origin, b.place) : b.score - a.score,
  );
  return scored.slice(0, limit).map((s) => s.place);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const near = (o: [number, number], p: OfflinePlace) => (p.lon - o[0]) ** 2 + (p.lat - o[1]) ** 2;

function subsequence(haystack: string, needle: string) {
  let i = 0;
  for (const ch of needle) {
    i = haystack.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}
